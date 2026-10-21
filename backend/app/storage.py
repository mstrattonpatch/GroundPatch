"""
Job/result storage — in-memory for this scaffold (a plain module-level dict,
gone on restart). Fine for local development and for testing the API
contract; not fine for anything with more than one worker process, or that
needs to survive a restart.

When this is built out for real, swap the dict for one of:
  - SQLite + the filesystem (job metadata in SQLite, GeoJSON/output files on
    disk) — the smallest real upgrade, no extra service to run.
  - PostgreSQL/PostGIS — worth it once there are persistent projects,
    reusable datasets, larger spatial queries, or multiple concurrent users
    (see backend/README.md's "Architecture" section, component E).

Keep the function signatures below stable across that swap — main.py and
jobs.py should not need to change just because the storage backend does.
"""
from __future__ import annotations

from typing import Any

from .models import JobResultsResponse, JobStatusResponse

_jobs: dict[str, JobStatusResponse] = {}
_results: dict[str, JobResultsResponse] = {}
_layer_geojson: dict[tuple[str, str], dict[str, Any]] = {}  # (job_id, layer_id) -> GeoJSON


def save_job(job: JobStatusResponse) -> None:
    _jobs[job.job_id] = job


def get_job(job_id: str) -> JobStatusResponse | None:
    return _jobs.get(job_id)


def save_results(job_id: str, results: JobResultsResponse) -> None:
    _results[job_id] = results


def get_results(job_id: str) -> JobResultsResponse | None:
    return _results.get(job_id)


def save_layer_geojson(job_id: str, layer_id: str, geojson: dict[str, Any]) -> None:
    _layer_geojson[(job_id, layer_id)] = geojson


def get_layer_geojson(job_id: str, layer_id: str) -> dict[str, Any] | None:
    return _layer_geojson.get((job_id, layer_id))
