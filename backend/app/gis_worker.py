"""
PyQGIS execution layer — the only module allowed to touch real geometry.

Every stub below is deliberately a `raise NotImplementedError`, not a real
implementation (this is a structural scaffold — see backend/README.md,
"Scope" in the plan this was built against). What IS real here:

  - APPROVED_TOOLS: the fixed catalogue validator.py checks a plan's `tool`
    names against. The AI can only ever request one of these; nothing in
    this backend executes a tool name that isn't a key in this dict.
  - The function signatures and docstrings, which fix the contract each
    tool stub will implement against models.Operation.

Importing qgis.* requires a PyQGIS-capable environment (see
environment-qgis.yml / README.md "GIS engine: PyQGIS") — it will NOT import
in a plain `pip install -r requirements.txt` environment. The import is
wrapped so the rest of the scaffold (FastAPI app, models, mocked endpoints)
stays runnable without QGIS installed; only calling one of the tool
functions below would actually require it, and they all raise
NotImplementedError before reaching any qgis.* call anyway.
"""
from __future__ import annotations

from typing import Any, Callable

try:
    from qgis.core import QgsApplication  # noqa: F401  (import-only check)
    QGIS_AVAILABLE = True
except ImportError:
    QGIS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Approved tool catalogue — name -> (QGIS Processing algorithm id, summary).
# This is the whole of what the AI is allowed to ask for. A plan whose `tool`
# isn't a key here is rejected by validator.py before a job is ever queued.
# ---------------------------------------------------------------------------

APPROVED_TOOLS: dict[str, dict[str, str]] = {
    "buffer": {
        "algorithm_id": "native:buffer",
        "summary": "Buffer `input` by `distance` `units` (resolved in an appropriate projected CRS, never raw source-CRS units).",
    },
    "clip": {
        "algorithm_id": "native:clip",
        "summary": "Clip `input` to the extent of `overlay`.",
    },
    "intersection": {
        "algorithm_id": "native:intersection",
        "summary": "Geometric intersection of `input` and `overlay`.",
    },
    "difference": {
        "algorithm_id": "native:difference",
        "summary": "`input` minus `overlay`.",
    },
    "dissolve": {
        "algorithm_id": "native:dissolve",
        "summary": "Dissolve `input`, optionally grouped by a field in `params.field`.",
    },
    "calculate_area": {
        "algorithm_id": "qgis:calculategeometryattributes",
        "summary": "Add an area field to `input`, in `units` (hectares or square metres).",
    },
    "calculate_distance": {
        "algorithm_id": "native:distancetonearesthubpoints",
        "summary": "Distance from each feature in `input` to the nearest feature in `overlay`.",
    },
}


def _not_implemented(tool: str) -> Callable[..., Any]:
    def _stub(*_args: Any, **_kwargs: Any) -> Any:
        raise NotImplementedError(
            f"gis_worker.{tool}() is a scaffold stub — implementing it is Phase 1 work "
            f"(see backend/README.md) and requires a PyQGIS-capable environment "
            f"(QGIS_AVAILABLE={QGIS_AVAILABLE} in this process)."
        )
    return _stub


def buffer(input_geojson: dict, distance: float, units: str) -> dict:
    """Return a GeoJSON FeatureCollection: `input_geojson` buffered by
    `distance` `units`, via QGIS Processing `native:buffer`. Must reproject
    into an appropriate projected (metres-based) CRS for the buffer distance
    to be meaningful, then reproject the result back to EPSG:4326 — see the
    proposal's CRS note in backend/README.md."""
    return _not_implemented("buffer")()


def clip(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Clip `input_geojson` to `overlay_geojson`'s extent via `native:clip`."""
    return _not_implemented("clip")()


def intersection(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Geometric intersection via `native:intersection`."""
    return _not_implemented("intersection")()


def difference(input_geojson: dict, overlay_geojson: dict) -> dict:
    """`input_geojson` minus `overlay_geojson` via `native:difference`."""
    return _not_implemented("difference")()


def dissolve(input_geojson: dict, field: str | None = None) -> dict:
    """Dissolve via `native:dissolve`, grouped by `field` if given."""
    return _not_implemented("dissolve")()


def calculate_area(input_geojson: dict, units: str) -> dict:
    """Add an area field (in `units`) to every feature via
    `qgis:calculategeometryattributes`."""
    return _not_implemented("calculate_area")()


def calculate_distance(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Distance from each `input_geojson` feature to the nearest
    `overlay_geojson` feature, via `native:distancetonearesthubpoints`."""
    return _not_implemented("calculate_distance")()


# Maps APPROVED_TOOLS keys to the actual callables above, for validator.py
# and jobs.py to dispatch through rather than hardcoding a tool->function
# mapping of their own.
TOOL_FUNCTIONS: dict[str, Callable[..., dict]] = {
    "buffer": buffer,
    "clip": clip,
    "intersection": intersection,
    "difference": difference,
    "dissolve": dissolve,
    "calculate_area": calculate_area,
    "calculate_distance": calculate_distance,
}
