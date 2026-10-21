"""
Job lifecycle — validates a plan, creates a job record, and (once
gis_worker.py is implemented) would run it. No background worker/queue
exists yet in this scaffold; `create_job()` runs validation synchronously
and, since execution isn't implemented, immediately marks the job as
`error` with a clear explanation rather than leaving it stuck at `queued`
forever with no indication of why nothing happens.

When this is built out for real: move execution to a background task
(FastAPI's own BackgroundTasks is enough to start; a real queue — Celery,
RQ, arq — once jobs need to survive a process restart or run on separate
worker machines from the API process). Keep create_job()'s validation step
exactly as the first thing that happens either way — a plan that fails
validation should never reach a queue, let alone a worker.
"""
from __future__ import annotations

import uuid

from .models import JobCreateRequest, JobState, JobStatusResponse
from .validator import validate_plan


def create_job(request: JobCreateRequest) -> JobStatusResponse:
    from . import storage  # local import avoids a circular import with storage's own models usage

    result = validate_plan(request.plan, request.site_context)
    job_id = str(uuid.uuid4())

    if not result.ok:
        job = JobStatusResponse(job_id=job_id, state=JobState.error, progress=0.0, errors=result.errors, warnings=result.warnings)
        storage.save_job(job)
        return job

    # Validation passed, but there's no worker to actually run the plan yet
    # (see module docstring) — be explicit about that rather than silently
    # sitting at "queued" with no path to ever becoming "done".
    job = JobStatusResponse(
        job_id=job_id,
        state=JobState.error,
        progress=0.0,
        warnings=result.warnings,
        errors=[
            "Plan passed validation, but job execution is not implemented yet "
            "(gis_worker.py's tool functions are all stubs — see backend/README.md, Phase 1)."
        ],
    )
    storage.save_job(job)
    return job


def get_job(job_id: str) -> JobStatusResponse | None:
    from . import storage
    return storage.get_job(job_id)
