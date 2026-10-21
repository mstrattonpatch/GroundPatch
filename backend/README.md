# GroundPatch AI GIS backend (scaffold)

This is a **structural scaffold only** — directory layout, endpoint stubs, data
models, and this design doc. None of the GIS logic is implemented yet; nothing
here runs a real spatial operation. It exists so the shape of the system is
settled and testable against `index.html` before the real work (Phase 1 in
the plan below) is built.

## Why this exists

`index.html` is a single static file: it queries live NSW/Commonwealth ArcGIS
services directly from the browser and does its own light GIS work in
JavaScript (clipping, buffering, dissolving) via Turf.js. That's enough for
"fetch these government layers and summarise what intersects the site," but
it can't run a real multi-step spatial analysis (buffer → intersect → area →
style → QGIS project) — that needs a proper GIS engine, which means a
backend.

The goal is to **extend** GroundPatch, not replace it: the browser stays the
map/UI, this backend is a service the chat panel can ask to run an analysis,
the result comes back as GeoJSON and gets added to the existing layer
registry/legend like any other layer.

## Architecture

```
index.html (existing)          backend/ (this directory)
┌─────────────────────┐        ┌──────────────────────────────────────┐
│ Leaflet map          │  HTTP  │ FastAPI app (app/main.py)             │
│ Layer registry/legend│◄──────►│   - POST /api/ai/plan                 │
│ Chat panel            │       │   - POST /api/jobs                    │
│ (buildSiteContext())  │       │   - GET  /api/jobs/{id}                │
└─────────────────────┘        │   - GET  /api/jobs/{id}/results        │
                                │   - GET  /api/jobs/{id}/layers/{lid}   │
                                │   - GET  /api/jobs/{id}/project        │
                                │                                        │
                                │ app/planner.py   — AI planning layer   │
                                │ app/validator.py — plan validation     │
                                │ app/jobs.py      — job lifecycle/queue │
                                │ app/gis_worker.py— PyQGIS execution    │
                                │ app/project_builder.py — .qgz package  │
                                │ app/storage.py   — job/result storage  │
                                └──────────────────────────────────────┘
```

**The AI plans, the GIS engine executes.** The AI (`app/planner.py`) turns a
natural-language request into a structured JSON plan — a list of named
operations from a fixed, approved catalogue (buffer, clip, intersection,
dissolve, calculate_area, ...). It never generates or runs arbitrary Python.
`app/validator.py` checks that plan against the actual site/layer catalogue
(inputs exist, CRS and units make sense, every tool is on the approved list)
before anything executes. Only `app/gis_worker.py` touches real geometry, and
only through QGIS Processing algorithms, not ad hoc code.

### Example plan (illustrative — matches the shape `app/models.py` defines)

```json
{
  "operations": [
    { "tool": "buffer", "input": "subject_site", "distance": 500, "units": "metres", "output": "assessment_buffer_500m" },
    { "tool": "intersection", "input": "threatened_ecological_communities", "overlay": "subject_site", "output": "communities_within_site" },
    { "tool": "calculate_area", "input": "communities_within_site", "units": "hectares" }
  ]
}
```

A plan is a *request*, not an authority — the validator decides what's
actually safe to run, and "500 metres" is resolved against an appropriate
projected CRS (never 500 raw units of whatever CRS the source layer happens
to be in) before the buffer tool runs.

## GIS engine: PyQGIS

This scaffold targets **real PyQGIS** (QGIS's own Python bindings and
Processing framework), not a lighter pure-Python stack — chosen so the
worker can call actual QGIS Processing algorithms (`native:buffer`,
`native:intersection`, `native:dissolve`, ...) and build the output project
with QGIS's own project API, matching the proposal exactly.

**This has a real consequence: PyQGIS is not pip-installable.** It ships
with a full QGIS install and isn't on PyPI. Running `app/gis_worker.py` for
real requires one of:

- **conda-forge** (simplest on a dev machine): `conda create -n groundpatch-gis -c conda-forge qgis` — gives you `qgis.core`, `qgis.analysis`, `qgis.processing` in that environment's Python.
- **The official Docker image**: `qgis/qgis` (https://hub.docker.com/r/qgis/qgis) already has PyQGIS and a headless `QgsApplication` set up — the natural base image for `backend/Dockerfile` once this is built out.
- **OS packages** on Debian/Ubuntu: `apt install qgis python3-qgis` (version is whatever's in that distro's repos — pin carefully).

None of these are available in a plain `pip install -r requirements.txt` in
a generic Python environment, which is why `requirements.txt` only covers
the orchestration layer (FastAPI, Pydantic, uvicorn) and
`environment-qgis.yml` is a separate conda spec for the worker. Keep that
split even once this is built out — don't let the two halves merge into one
unpinned environment, since that makes the worker (the part that actually
matters for reproducible results) harder to pin precisely.

## Directory layout

```
backend/
  README.md              — this file
  requirements.txt        — orchestration layer only (FastAPI/uvicorn/pydantic) — plain pip
  environment-qgis.yml    — conda-forge spec for the PyQGIS worker environment
  app/
    __init__.py
    main.py               — FastAPI app, route stubs for the 6 endpoints
    models.py              — Pydantic models: the plan schema, job status, layer catalogue entry
    planner.py             — AI planning layer stub (natural language -> structured plan)
    validator.py           — plan validation stub (approved-tool whitelist, CRS/unit checks)
    jobs.py                 — in-memory job lifecycle stub (queued/running/done/error)
    gis_worker.py           — PyQGIS operation stubs, one per approved tool
    project_builder.py      — .qgz/.gpkg package assembly stub
    storage.py               — job/result storage stub (filesystem for now; PostGIS is a later option)
  tests/
    __init__.py
    test_api_contract.py    — smoke tests against the mocked endpoint responses (no QGIS needed)
```

## What's actually wired up right now

- `app/main.py` boots as a real FastAPI app (verified running in this
  sandbox with `uvicorn`) and every endpoint from the proposal's table
  responds — but with **mocked, clearly-labelled fake data**
  (`"mock": true` in every response), not a real computed result. This is
  deliberate: it gives the `index.html` chat-panel integration a stable
  contract to develop and test against immediately, without needing a real
  QGIS environment stood up first.
- `app/gis_worker.py` defines the approved-tool catalogue (name, QGIS
  Processing algorithm ID, parameter shape) that `app/validator.py` checks
  plans against, but every tool function body is a `raise NotImplementedError`
  stub — real execution is Phase 1 work, and needs a PyQGIS-capable
  environment to even import `qgis.core`.
- `app/planner.py` is a stub that does **not** call any AI API yet — it
  returns the one illustrative plan from the proposal regardless of input,
  clearly marked as a placeholder.

## Phased plan (unchanged from the proposal, restated here as the source of truth)

1. **Phase 1 — connect the chat to GIS operations.** Buffer/clip/intersect/
   dissolve/area/distance only. One generated GeoJSON layer returned and
   added to the existing map/legend. Acceptance test: ask for a 500m buffer,
   see a correctly-measured polygon appear on the map.
2. **Phase 2 — multi-step analysis and map sync.** Chain approved
   operations, update the layer list/legend/stats table, add previews and
   confirmation before expensive operations, persist job results so a
   refresh doesn't lose the analysis.
3. **Phase 3 — QGIS project generation.** Real `.qgz` + `.gpkg` +
   `analysis_summary.csv` + `processing_log.json` + `README.txt`, zipped,
   reusing the existing QML styling/grouping conventions
   (`buildQML()`/`QGIS_SCRIPT` in `index.html`). Acceptance test: the
   package opens cleanly in desktop QGIS on a different machine.
4. **Phase 4 — production readiness.** Auth, per-user/project isolation,
   resource limits, logging, retention policy, dataset-freshness
   indicators, CRS/geometry/area automated tests, and a licensing check on
   every data source before anything ships.

Do Phase 1 next, but keep the Phase 3 output shape (the ZIP layout below) in
mind from the start so the job/result models don't need reshaping later.

### Phase 3 output package shape (for later, documented now so Phase 1's models match it)

```
GroundPatch_AI_Analysis.zip
  GroundPatch_AI_Analysis.qgz   — QGIS project
  analysis_results.gpkg          — spatial layers and tables
  analysis_summary.csv           — summary statistics
  processing_log.json            — operations and parameters actually run
  README.txt                      — data sources, retrieval dates, limitations
```

## Explicit non-goals (per the proposal)

- The AI never runs arbitrary generated Python — only validated, named
  operations from the approved catalogue in `app/gis_worker.py`.
- API credentials (AI API key, any future DB credentials) live on this
  backend only, never in `index.html`.
- `index.html`'s existing environmental screening features (live ArcGIS
  queries, exports, the existing QGIS script, the automated report) are
  untouched — this backend is additive.

## Running the stub service locally

```
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then `GET http://localhost:8000/docs` for the interactive API docs, or see
`tests/test_api_contract.py` for example requests against every endpoint.
This works with **no QGIS environment at all** — every response right now is
mocked. Standing up `environment-qgis.yml` is only needed once
`app/gis_worker.py`'s stubs are turned into real implementations.

Run the test suite (installs pytest/httpx on top of the app's own deps):

```
pip install -r requirements-dev.txt
pytest tests/ -v
```

All 8 tests pass as of this scaffold — they assert response *shape* (status
codes, the mock flag, validation rejecting a bad plan with the right error)
against the mocked endpoints, not real GIS output. Verified in this
repository's own dev sandbox: a venv with `requirements.txt` installed boots
`uvicorn app.main:app`, and every endpoint in the table above was hit with
curl and returned exactly what's described — including the deliberate
"valid plan, but execution isn't implemented" error from `/api/jobs`, the
three validation-rejection cases (unapproved tool, wrong units for the
tool, unknown input reference), 404s on an unknown job id for all four
job-scoped endpoints, and a real downloadable (if mock-content) ZIP from
`/api/jobs/{id}/project`.
