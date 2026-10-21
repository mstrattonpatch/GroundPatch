"""
FastAPI app — the 6 endpoints from the proposal's API table.

Phase 1 status (see backend/README.md): /api/ai/plan is still a stub (one
fixed illustrative plan, `mock: true` — no AI call wired in yet). /api/jobs,
/api/jobs/{id}, /api/jobs/{id}/results and /api/jobs/{id}/layers/{layer_id}
are REAL — jobs.create_job() actually executes the plan through
gis_worker.py's PyQGIS tool functions and these endpoints serve the real
stored results (`mock: false`), requiring a PyQGIS-capable environment (see
environment-qgis.yml). /api/jobs/{id}/project is still mocked — Phase 3
(QGIS project generation) hasn't been built yet.
"""
from __future__ import annotations

import io
import zipfile

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import jobs, planner
from .models import (
    JobCreateRequest,
    JobResultsResponse,
    JobStatusResponse,
    LayerFeaturesResponse,
    PlanRequest,
    PlanResponse,
)

app = FastAPI(
    title="GroundPatch AI GIS backend",
    description="Phase 1: real PyQGIS execution of approved GIS operations. See backend/README.md.",
    version="0.1.0-phase1",
)

# index.html runs in a browser on a different origin than this API (a local
# file, a dev server, or wherever it's deployed) - without CORS headers the
# browser blocks every fetch() call before it even reaches these routes,
# independent of anything the request itself does right. Wide open
# (allow_origins=["*"]) because this is a local/experimental dev tool with
# no auth and no cookies to protect yet (see README.md Phase 4) - restrict
# this to the real deployed GroundPatch origin(s) before this backend is
# ever reachable from the public internet.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
    from . import storage

    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    if job.state != "done":
        raise HTTPException(status_code=409, detail=f"Job {job_id!r} is not done yet (state={job.state.value!r}). Errors (if any): {job.errors}")
    results = storage.get_results(job_id)
    if results is None:
        # Shouldn't happen — create_job() always saves results alongside a
        # "done" job status — but fail loudly rather than fabricate a
        # response if storage and job state ever disagree.
        raise HTTPException(status_code=500, detail=f"Job {job_id!r} is marked done but has no stored results — this is a bug, not an expected state.")
    return results


@app.get("/api/jobs/{job_id}/layers/{layer_id}", response_model=LayerFeaturesResponse)
def get_job_layer(job_id: str, layer_id: str) -> LayerFeaturesResponse:
    from . import storage

    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job with id {job_id!r}.")
    geojson = storage.get_layer_geojson(job_id, layer_id)
    if geojson is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} has no output layer {layer_id!r}.")
    return LayerFeaturesResponse(layer_id=layer_id, geojson=geojson, mock=False)


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
