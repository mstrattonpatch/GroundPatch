# GroundPatch AI GIS backend

**Phase 1 is implemented and verified against real QGIS** (not mocked, not
just written — see "Verified" below for exactly what was run and what came
back). **Phase 2's core loop is also wired up**: `index.html` now has an
"AI GIS analysis" sidebar section that builds a plan, calls this backend,
and renders the resulting layer(s) on the map with toggle/zoom/export
controls — see its own commit message for what was verified (the exact
request/response contract, against the real running service) and what
wasn't (no browser available in the dev sandbox this was built in, so the
UI itself has never been visually exercised). `/api/ai/plan` is still a
stub (no real AI call), so the plan is built through a structured form, not
free-text chat. Phase 3 (QGIS project generation) and Phase 4 (production
readiness) are not started.

## Why this exists

`index.html` is a single static file: it queries live NSW/Commonwealth ArcGIS
services directly from the browser and does its own light GIS work in
JavaScript (clipping, buffering, dissolving) via Turf.js. That's enough for
"fetch these government layers and summarise what intersects the site," but
it can't run a real multi-step spatial analysis (buffer → intersect → area →
style → QGIS project) — that needs a proper GIS engine, which means a
backend.

The goal is to **extend** GroundPatch, not replace it: the browser stays the
map/UI, this backend is a service a sidebar panel asks to run an analysis,
the result comes back as GeoJSON and gets added to the map with its own
toggle/zoom/export controls. `index.html` now has an "AI GIS analysis"
section that does exactly this (see its own commit) — built as a structured
operation form rather than the proposal's free-text chat, since
`/api/ai/plan` is still a stub and a chat box over a stub would be
misleading.

## Architecture

```
index.html (existing)          backend/ (this directory)
┌─────────────────────┐        ┌──────────────────────────────────────┐
│ Leaflet map           │  HTTP │ FastAPI app (app/main.py)             │
│ Layer registry         │◄────►│   - POST /api/ai/plan      [stub]     │
│ "AI GIS analysis" panel│      │   - POST /api/jobs          [real]    │
│ (structured plan        │     │   - GET  /api/jobs/{id}      [real]   │
│  builder, not chat)      │    │   - GET  /api/jobs/{id}/results [real]│
└─────────────────────┘        │   - GET  /api/jobs/{id}/layers/{lid}  │
                                │                              [real]  │
                                │   - GET  /api/jobs/{id}/project [stub]│
                                │                                        │
                                │ app/planner.py   — AI planning  [stub] │
                                │ app/validator.py — plan validation     │
                                │ app/jobs.py      — job lifecycle       │
                                │ app/qgis_runtime.py — QGIS boot/thread │
                                │ app/gis_worker.py— PyQGIS execution    │
                                │ app/project_builder.py — .qgz   [stub] │
                                │ app/storage.py   — job/result storage  │
                                └──────────────────────────────────────┘
```

**The AI plans, the GIS engine executes.** The AI (`app/planner.py` — still
a stub, see below) turns a natural-language request into a structured JSON
plan — a list of named operations from a fixed, approved catalogue (buffer,
clip, intersection, dissolve, calculate_area, calculate_distance). It never
generates or runs arbitrary Python. `app/validator.py` checks that plan
against the actual site/layer catalogue (inputs exist, every tool is on the
approved list, units are valid for that specific tool) before anything
executes — real logic, not a stub. Only `app/gis_worker.py` touches real
geometry, and only through QGIS Processing algorithms, not ad hoc code.

### Example plan (the exact shape `app/models.py` defines, and what Phase 1 actually runs)

```json
{
  "operations": [
    { "tool": "buffer", "input": "subject_site", "distance": 500, "units": "metres", "output": "assessment_buffer_500m" },
    { "tool": "intersection", "input": "threatened_ecological_communities", "overlay": "assessment_buffer_500m", "output": "communities_within_site" },
    { "tool": "calculate_area", "input": "communities_within_site", "units": "hectares" }
  ]
}
```

This is the proposal's own illustrative plan — "create a 500m buffer,
intersect with threatened ecological communities, calculate area in
hectares" — and it is now genuinely executable; see "Verified" below for the
exact request/response.

A plan is a *request*, not an authority — the validator decides what's
actually safe to run, and "500 metres" is resolved against an appropriate
UTM CRS computed from the input's own location (never 500 raw EPSG:4326
degrees) before the buffer tool runs — see `qgis_worker.APPROVED_TOOLS`'s
comment for the two algorithm IDs that turned out to differ from the
proposal's wording once checked against a real QGIS install, and
`test_buffer_distance_is_real_metres_not_raw_degrees` for the regression
test on this specific footgun.

## GIS engine: PyQGIS

Real PyQGIS (QGIS's own Python bindings and Processing framework), not a
lighter pure-Python stack — chosen so the worker calls actual QGIS
Processing algorithms and can build the output project with QGIS's own
project API (Phase 3) later, matching the proposal.

**This has a real consequence: PyQGIS is not pip-installable.** It ships
with a full QGIS install and isn't on PyPI. `environment-qgis.yml` is a
conda-forge spec for it — this is exactly what was used to verify Phase 1
(see "Verified" below), not a guess:

```
conda env create -f environment-qgis.yml
conda activate groundpatch-gis
```

`conda activate` sets `PYTHONPATH` (to `share/qgis/python` and
`share/qgis/python/plugins`, where conda-forge installs the `qgis` and
`processing` packages — NOT regular site-packages) and `QT_PLUGIN_PATH`
automatically via the env's own activation hooks — don't set those by hand.
The one thing it does NOT set, and that a headless server needs explicitly,
is:

```
export QT_QPA_PLATFORM=offscreen
```

Without it, `QgsApplication.initQgis()` fails trying to connect to an X
display that doesn't exist on a server. (A `(PDAL Error) Can't load
library ... libhdf5_cpp.so` message on startup is harmless — an optional
point-cloud plugin this install doesn't have a dependency for, unrelated to
vector operations.)

`requirements.txt` only covers the orchestration layer (FastAPI, Pydantic,
uvicorn) — install it with plain pip in *any* Python environment, including
inside `groundpatch-gis` itself (that's what running the app for real
needs: QGIS from conda, FastAPI from pip, same environment). The app and
its tests import and run fine with no QGIS at all too (see "Two
environments" below) — only calling a `gis_worker` tool function actually
needs `qgis.core` importable.

### Thread affinity — the non-obvious part

QGIS/Qt objects are thread-affine: `QgsApplication` must be initialised on,
and every `qgis.*` call must happen on, the *same* OS thread for the whole
process. FastAPI's threadpool for sync endpoints does not guarantee that —
anyio reuses idle worker threads opportunistically, so a request or two in
a row often lands on the same thread by chance, which is exactly how this
went unnoticed at first. It was caught for real: two QGIS-calling requests
back to back through FastAPI's `TestClient` deadlocked once the second one
landed on a different threadpool thread than the first had initialised
`QgsApplication` on (full thread dump captured in this repo's own dev
session). Fixed by routing every `gis_worker` call through a single
dedicated worker thread (`qgis_runtime._qgis_executor`,
`run_on_qgis_thread()`) that `jobs.py` always dispatches through, rather
than calling tool functions directly. If `gis_worker.py` grows new call
sites outside `jobs.py`, route them through `run_on_qgis_thread()` too —
calling `qgis.*` directly from a FastAPI request handler is exactly the bug
that was just fixed.

## Directory layout

```
backend/
  README.md               — this file
  requirements.txt         — orchestration layer only (FastAPI/uvicorn/pydantic) — plain pip
  requirements-dev.txt      — + pytest/httpx, for running the test suite
  environment-qgis.yml       — conda-forge spec for the PyQGIS worker environment
  app/
    __init__.py
    main.py                — FastAPI app, the 6 endpoints
    models.py               — Pydantic models: the plan schema, job status, layer catalogue entry
    planner.py              — AI planning layer [STUB — no AI call wired in yet]
    validator.py            — plan validation [real]
    jobs.py                  — job lifecycle: validates, then executes via gis_worker [real]
    qgis_runtime.py           — QgsApplication/Processing bootstrap, GeoJSON<->layer conversion, the single QGIS worker thread
    gis_worker.py             — the 7 approved tools, each a real QGIS Processing call [real]
    project_builder.py        — .qgz/.gpkg package assembly [STUB — Phase 3]
    storage.py                 — job/result storage (in-memory for now; PostGIS is a later option)
  tests/
    __init__.py
    test_api_contract.py      — validation tests (any environment) + real-execution tests (needs QGIS, auto-skip otherwise)
```

## Two environments, on purpose

- **Plain** (`requirements.txt`, any Python): the FastAPI app boots, every
  endpoint responds, plan validation is real. Calling anything that needs
  `gis_worker`'s actual QGIS execution raises a clear `RuntimeError`
  ("needs the groundpatch-gis conda environment") rather than an opaque
  `ImportError` buried somewhere.
- **`groundpatch-gis`** (`environment-qgis.yml`, conda): everything above,
  plus real execution.

Keep this split — don't merge QGIS into a pip-based environment or vice
versa. The orchestration layer (routes, validation, models) should stay
testable and installable anywhere; only the worker needs QGIS's much
heavier, conda-only footprint.

## Phased plan (restated from the proposal as the source of truth)

1. **Phase 1 — connect operations to a real GIS engine.** ✅ Buffer, clip,
   intersection, difference, dissolve, calculate_area, calculate_distance —
   all real, all verified (see below). Chaining already works (a job is a
   *sequence* of operations, each able to reference an earlier one's
   `output`) — the proposal lists chaining under Phase 2, but it fell out
   naturally from how `jobs.py` executes a plan and didn't need separate
   work.
2. **Phase 2 — map sync.** ✅ core loop. `index.html`'s "AI GIS analysis"
   section builds a plan (structured form, not chat — `/api/ai/plan` is
   still a stub), sends the layer catalogue + real feature data, and
   renders every output layer on the map with its own toggle/zoom/export
   row. Verified: the exact request/response contract, against the real
   running backend (see that commit's message) — **not** verified: the
   actual browser UI, since no browser is available in the sandbox this
   was built in. **Not done**: a stats table, confirmation before an
   expensive job runs, cancellation, and persisting a job's results past a
   page refresh (today a refresh just loses the AI-generated layers, same
   as it would for anything else not in the saved session — the backend's
   own storage is in-memory and ephemeral anyway, so there's nothing
   durable to resume against yet regardless of what `index.html` does).
3. **Phase 3 — QGIS project generation.** Not started. `project_builder.py`
   is a stub; see its docstring for the implementation plan and the output
   ZIP shape (`.qgz` + `.gpkg` + `analysis_summary.csv` +
   `processing_log.json` + `README.txt`).
4. **Phase 4 — production readiness.** Not started. Auth, per-user/project
   isolation, resource limits, logging, retention policy, dataset-freshness
   indicators, and a licensing check on every data source before anything
   ships.

## Explicit non-goals (per the proposal)

- The AI never runs arbitrary generated Python — only validated, named
  operations from the approved catalogue in `app/gis_worker.py`.
- API credentials (AI API key, any future DB credentials) live on this
  backend only, never in `index.html`.
- `index.html`'s existing environmental screening features (live ArcGIS
  queries, exports, the existing QGIS script, the automated report) are
  untouched — this backend is additive.

## Running it locally

```
conda env create -f environment-qgis.yml
conda activate groundpatch-gis
pip install -r requirements.txt   # FastAPI/uvicorn/pydantic, into the same env
export QT_QPA_PLATFORM=offscreen  # headless server - see "GIS engine: PyQGIS" above
uvicorn app.main:app --reload
```

`GET http://localhost:8000/docs` for interactive API docs. Without the
conda env (plain `pip install -r requirements.txt` in any Python 3.11+
environment), the same `uvicorn app.main:app` boots and every endpoint
responds — `/api/jobs` with a plan that needs real execution returns a
clear `RuntimeError` message instead of a result.

### Running the test suite

```
pip install -r requirements-dev.txt
pytest tests/ -v
```

11 tests: 8 run in any environment (health check, plan stub shape,
validation rejection cases, 404s, the mock project-ZIP download). 3 need
`groundpatch-gis` and auto-skip without it (`QGIS_AVAILABLE` gate) — real
end-to-end job execution, real results/layer endpoints returning computed
geometry, and a regression test specifically for the CRS/units footgun
(buffer distance must visibly correspond to real metres, not raw degrees).

## Verified

Not just written — run, in this repository's own dev sandbox, both ways:

- **Plain environment**: a venv with `requirements.txt` installed boots
  `uvicorn app.main:app`; every endpoint was hit with curl; `pytest tests/`
  passes 8, skips 3.
- **`groundpatch-gis` (conda-forge QGIS 3.44)**: `conda activate` +
  `uvicorn app.main:app`, then the exact proposal example — buffer 500m,
  intersect with a threatened-ecological-community polygon, calculate area
  in hectares — sent as a real `POST /api/jobs` with real GeoJSON in
  `layer_data`, came back `"state": "done"`, and `GET .../results` /
  `GET .../layers/communities_within_site` returned the real computed
  polygon with a real `area_ha` field. `pytest tests/` passes all 11,
  including through `TestClient` (which is what first surfaced the thread-
  affinity deadlock described above, before the fix).
- Two algorithm IDs from the proposal's own wording turned out not to exist
  under those names in QGIS 3.44 once actually checked against
  `QgsApplication.processingRegistry()`: `qgis:calculategeometryattributes`
  doesn't exist (replaced by `native:exportaddgeometrycolumns`), and
  `distancetonearesthubpoints` is `qgis:`-prefixed, not `native:`. Both
  fixed in `gis_worker.APPROVED_TOOLS` and confirmed working, not just
  assumed from documentation.
