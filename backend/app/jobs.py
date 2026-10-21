"""
Job lifecycle — validates a plan, then (Phase 1: real, not mocked) executes
it operation by operation through gis_worker.TOOL_FUNCTIONS, storing each
operation's output GeoJSON and a processing log.

Execution is synchronous within create_job() for this phase - every
approved tool is a fast, single-layer QGIS Processing call, not a long-
running batch job, so there's no real need for a background task queue
yet. Revisit that (FastAPI BackgroundTasks, then a real queue) once either
isn't true anymore - large feature counts or chained many-operation plans
taking long enough that an HTTP request shouldn't block on them.
"""
from __future__ import annotations

import uuid

from .gis_worker import APPROVED_TOOLS, TOOL_FUNCTIONS
from .models import (
    JobCreateRequest,
    JobResultsResponse,
    JobState,
    JobStatusResponse,
    OutputLayerMeta,
)
from .qgis_runtime import run_on_qgis_thread
from .validator import validate_plan


def _geometry_type_of(geojson: dict) -> str:
    features = geojson.get("features") or []
    if not features:
        return "Polygon"  # arbitrary but valid fallback for an empty result - avoids crashing OutputLayerMeta validation
    t = (features[0].get("geometry") or {}).get("type", "Polygon")
    return "Polygon" if t == "MultiPolygon" else t  # MultiPolygon collapses to Polygon for the model's purposes; the real geometry type is unchanged in the GeoJSON itself


def _run_operation(tool: str, op, layer_store: dict[str, dict]) -> dict:
    """Dispatches one validated Operation to its gis_worker function with
    the right argument shape — each tool's Python signature differs
    (buffer needs distance/units, intersection needs two layers, dissolve
    takes an optional field, ...), so this is where that mapping lives,
    not duplicated in create_job()'s main loop. The actual call is routed
    through run_on_qgis_thread() (not called directly) - see
    qgis_runtime._qgis_executor's docstring for why that matters."""
    fn = TOOL_FUNCTIONS[tool]
    input_geojson = layer_store[op.input]

    if tool == "buffer":
        return run_on_qgis_thread(fn, input_geojson, op.distance, op.units)
    if tool in ("clip", "intersection", "difference"):
        return run_on_qgis_thread(fn, input_geojson, layer_store[op.overlay])
    if tool == "dissolve":
        return run_on_qgis_thread(fn, input_geojson, op.params.get("field"))
    if tool == "calculate_area":
        return run_on_qgis_thread(fn, input_geojson, op.units)
    if tool == "calculate_distance":
        return run_on_qgis_thread(fn, input_geojson, layer_store[op.overlay])
    raise AssertionError(f"_run_operation doesn't know how to call tool '{tool}' — add a case above (validator.py already restricts tool to APPROVED_TOOLS, so reaching here means a new tool was added to gis_worker without updating this dispatch).")


def create_job(request: JobCreateRequest) -> JobStatusResponse:
    from . import storage

    validation = validate_plan(request.plan, request.site_context)
    job_id = str(uuid.uuid4())

    if not validation.ok:
        job = JobStatusResponse(job_id=job_id, state=JobState.error, progress=0.0, errors=validation.errors, warnings=validation.warnings, mock=False)
        storage.save_job(job)
        return job

    # subject_site isn't in request.layer_data (it's not a "layer" in the
    # catalogue sense) - it's assembled here from site_context.boundary,
    # the one piece of geometry every plan can always assume exists.
    layer_store: dict[str, dict] = {
        "subject_site": {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": request.site_context.boundary}]},
        **request.layer_data,
    }

    processing_log: list[dict] = []
    produced_ids: list[str] = []

    for i, op in enumerate(request.plan.operations):
        if op.input not in layer_store:
            job = JobStatusResponse(
                job_id=job_id, state=JobState.error, progress=i / max(len(request.plan.operations), 1),
                warnings=validation.warnings,
                errors=[f"operation[{i}] ({op.tool}): input '{op.input}' has no data — it wasn't in layer_data and isn't an earlier operation's output. Did the request forget to send this layer's features?"],
                mock=False,
            )
            storage.save_job(job)
            return job
        if op.overlay is not None and op.overlay not in layer_store:
            job = JobStatusResponse(
                job_id=job_id, state=JobState.error, progress=i / max(len(request.plan.operations), 1),
                warnings=validation.warnings,
                errors=[f"operation[{i}] ({op.tool}): overlay '{op.overlay}' has no data — it wasn't in layer_data and isn't an earlier operation's output."],
                mock=False,
            )
            storage.save_job(job)
            return job

        try:
            result_geojson = _run_operation(op.tool, op, layer_store)
        except Exception as exc:  # noqa: BLE001 - deliberately broad: any QGIS/algorithm failure should end the job cleanly with a message, not a 500
            job = JobStatusResponse(
                job_id=job_id, state=JobState.error, progress=i / max(len(request.plan.operations), 1),
                warnings=validation.warnings,
                errors=[f"operation[{i}] ({op.tool}) failed: {exc}"],
                mock=False,
            )
            storage.save_job(job)
            return job

        output_id = op.output or op.input  # tools like calculate_area that annotate rather than create write back onto their own input id if the plan didn't name an output
        layer_store[output_id] = result_geojson
        produced_ids.append(output_id)
        processing_log.append({
            "operation_index": i,
            "tool": op.tool,
            "algorithm_id": APPROVED_TOOLS[op.tool]["algorithm_id"],
            "input": op.input,
            "overlay": op.overlay,
            "output": output_id,
            "feature_count": len(result_geojson.get("features", [])),
        })

    job = JobStatusResponse(job_id=job_id, state=JobState.done, progress=1.0, warnings=validation.warnings, errors=[], mock=False)
    storage.save_job(job)

    # Two operations can write to the same output_id (e.g. calculate_area
    # with no `output` of its own falls back to its input's id, overwriting
    # an earlier operation's output in-place - see _run_operation's
    # docstring). Dedupe produced_ids to each id's LAST production, so
    # output_layers reflects final state once, not a stale earlier version
    # alongside the final one.
    seen: dict[str, None] = {}
    for pid in produced_ids:
        seen.pop(pid, None)
        seen[pid] = None
    unique_output_ids = list(seen.keys())

    output_layers = []
    for output_id in unique_output_ids:
        geojson = layer_store[output_id]
        storage.save_layer_geojson(job_id, output_id, geojson)
        # Last matching log entry, not first - same reasoning as the dedup
        # above: if this id was produced more than once, the most recent
        # operation is the one that actually produced the stored geojson.
        source_op = next((p for p in reversed(processing_log) if p["output"] == output_id), None)
        output_layers.append(OutputLayerMeta(
            layer_id=output_id,
            name=output_id,
            geometry_type=_geometry_type_of(geojson),
            feature_count=len(geojson.get("features", [])),
            source_operation=source_op["tool"] if source_op else "unknown",
        ))
    storage.save_results(job_id, JobResultsResponse(
        job_id=job_id,
        output_layers=output_layers,
        statistics={"processing_log": processing_log},
        mock=False,
    ))

    return job


def get_job(job_id: str) -> JobStatusResponse | None:
    from . import storage
    return storage.get_job(job_id)
