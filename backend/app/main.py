"""
FastAPI app — the 6 endpoints from the proposal's API table. Every endpoint
is real and runs (see backend/README.md for how to boot this locally and
test it with no QGIS environment at all), but /api/jobs/{id}/results,
/layers/{id}, and /project return mocked data regardless of the job's real
state, clearly marked `"mock": true` — there is no execution path yet (see
jobs.py), so this exists purely to give the index.html chat-panel
integration a stable response shape to develop and test against now,
instead of waiting for Phase 1's real implementation to exist first.

/api/ai/plan and /api/jobs are "real" in the sense that they run actual
code (a fixed mock plan, and real validation respectively) — only their
*content* is a placeholder, not their wiring.
"""
from __future__ import annotations

import io
import zipfile

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from . import jobs, planner
from .models import (
    JobCreateRequest,
    JobResultsResponse,
    JobStatusResponse,
    LayerFeaturesResponse,
    OutputLayerMeta,
    PlanRequest,
    PlanResponse,
)

app = FastAPI(
    title="GroundPatch AI GIS backend (scaffold)",
    description="Structural scaffold only — see backend/README.md. No real GIS operation runs yet.",
    version="0.0.1-scaffold",
)


@app.get("/health")
def health() -> dict[str, bool | str]:
    """Not in the proposal's table, but worth having from the start — the
    one honest "is this thing actually up" check, separate from any mocked
    business-logic endpoint below."""
    from .gis_worker import QGIS_AVAILABLE
    return {"ok": True, "qgis_available_in_this_process": QGIS_AVAILABLE}


@app.post("/api/ai/plan", response_model=PlanResponse)
def post_ai_plan(request: PlanRequest) -> PlanResponse:
    return planner.plan_from_request(request)


@app.post("/api/jobs", response_model=JobStatusResponse)
def post_jobs(request: JobCreateRequest) -> JobStatusResponse:
    return jobs.create_job(request)


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str) -> JobStatusResponse:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    return job


@app.get("/api/jobs/{job_id}/results", response_model=JobResultsResponse)
def get_job_results(job_id: str) -> JobResultsResponse:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    # MOCK — see module docstring. A real implementation returns 409/425
    # (not ready) while job.state is queued/running, and only returns real
    # results once job.state == JobState.done.
    return JobResultsResponse(
        job_id=job_id,
        output_layers=[
            OutputLayerMeta(layer_id="communities_within_site", name="Communities within site (MOCK)", geometry_type="Polygon", feature_count=0, source_operation="intersection"),
        ],
        statistics={"note": "mock statistics — gis_worker.py has not computed anything real"},
        mock=True,
    )


@app.get("/api/jobs/{job_id}/layers/{layer_id}", response_model=LayerFeaturesResponse)
def get_job_layer(job_id: str, layer_id: str) -> LayerFeaturesResponse:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    # MOCK — an empty but valid FeatureCollection, so index.html's L.geoJSON()
    # call path can be exercised end-to-end without erroring on malformed GeoJSON.
    return LayerFeaturesResponse(
        layer_id=layer_id,
        geojson={"type": "FeatureCollection", "features": []},
        mock=True,
    )


@app.get("/api/jobs/{job_id}/project")
def get_job_project(job_id: str) -> StreamingResponse:
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    # MOCK — a real, valid, downloadable ZIP (so the download round-trip -
    # headers, filename, bytes - is genuinely testable), but containing only
    # a README explaining project_builder.py isn't implemented, not a real
    # QGIS project.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "README.txt",
            "MOCK PACKAGE\n\n"
            "project_builder.py is a scaffold stub and has not generated a real "
            "QGIS project. This ZIP exists only to prove the download endpoint's "
            "wiring (headers, filename, byte stream) works end to end.\n\n"
            f"Requested job id: {job_id}\n",
        )
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="GroundPatch_AI_Analysis_MOCK_{job_id}.zip"'},
    )
