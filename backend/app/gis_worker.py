"""
PyQGIS execution layer — the only module allowed to touch real geometry.

Phase 1: every function below is a REAL implementation, run through actual
QGIS Processing algorithms — not a mock. Verified against a real QGIS 3.44
install (conda-forge's `qgis` package) in this repo's own dev sandbox: see
backend/README.md's "Verified" section for the exact commands and output.

APPROVED_TOOLS is the fixed catalogue validator.py checks a plan's `tool`
names against — the AI can only ever request one of these; nothing in this
backend executes an algorithm id that isn't one of the values below.

Every function here requires a PyQGIS-capable environment (see
environment-qgis.yml) — calling one of them without qgis.core importable
raises a clear RuntimeError (from qgis_runtime.ensure_qgis_initialized()),
not an opaque ImportError. The plain requirements.txt environment (FastAPI,
pydantic, uvicorn) can still import this module and read APPROVED_TOOLS
without QGIS installed — only *calling* a tool function needs it.
"""
from __future__ import annotations

from typing import Any, Callable

from .qgis_runtime import (
    QGIS_AVAILABLE,
    ensure_qgis_initialized,
    geojson_to_layer,
    layer_to_geojson,
    reproject,
    utm_epsg_for_lonlat,
)

# ---------------------------------------------------------------------------
# Approved tool catalogue — name -> (QGIS Processing algorithm id, summary).
# This is the whole of what the AI is allowed to ask for. A plan whose `tool`
# isn't a key here is rejected by validator.py before a job is ever queued.
#
# Algorithm ids confirmed against this QGIS build's actual
# QgsApplication.processingRegistry() - two from the original proposal
# wording didn't exist under those names in this QGIS version and were
# corrected here: `qgis:calculategeometryattributes` doesn't exist in
# QGIS 3.44 (replaced by `native:exportaddgeometrycolumns`), and
# `distancetonearesthubpoints` is a `qgis:`-prefixed algorithm, not
# `native:`.
# ---------------------------------------------------------------------------

APPROVED_TOOLS: dict[str, dict[str, str]] = {
    "buffer": {
        "algorithm_id": "native:buffer",
        "summary": "Buffer `input` by `distance` `units` (resolved in an appropriate projected UTM CRS, never raw source-CRS units).",
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
        "algorithm_id": "native:exportaddgeometrycolumns",
        "summary": "Add an area field to `input`, in `units` (hectares or square_metres), computed in an appropriate projected UTM CRS.",
    },
    "calculate_distance": {
        "algorithm_id": "qgis:distancetonearesthubpoints",
        "summary": "Distance (metres) from each feature in `input` to the nearest feature in `overlay`.",
    },
    "reclassify": {
        "algorithm_id": "(attribute remap - no geometry op)",
        "summary": "Recode `params.field` on `input` per `params.mapping` (old value -> new value). Unmapped values are kept as-is and flagged back as a warning.",
    },
    "merge_with_precedence": {
        "algorithm_id": "native:difference (input minus overlay) + feature union",
        "summary": "Combines `input` and `overlay`, with `overlay` taking precedence wherever the two overlap (overlay's own features are kept unchanged; input only fills the gaps outside overlay's footprint). For \"layer B replaces layer A wherever B has coverage\".",
    },
    "filter_by_attribute": {
        "algorithm_id": "(attribute filter - no geometry op)",
        "summary": "Keeps only features of `input` where `params.field`'s value is in `params.values`.",
    },
}


def _layer_utm_epsg(layer) -> int:
    """Picks a UTM zone from the layer's own extent centre — see
    qgis_runtime.utm_epsg_for_lonlat()'s docstring for why this (and not a
    hardcoded zone) is used."""
    centre = layer.extent().center()
    return utm_epsg_for_lonlat(centre.x(), centre.y())


def _fix_geometries(layer):
    """Repairs self-intersections and other invalid geometry via
    `native:fixgeometries` (METHOD=1, "Structure" — more robust than the
    default "Linework" method for the kind of self-intersecting polygon a
    union/difference of real, vertex-dense vegetation data produces).

    Run on the OUTPUT of every geometry-combining operation below (clip,
    intersection, difference, dissolve, merge_with_precedence), not on
    freshly-fetched input data — confirmed against this app's own real
    QGIS install that a `native:difference` result can carry an invalid
    geometry silently all the way through to a *later* operation in the
    same plan (e.g. calculate_area's `native:exportaddgeometrycolumns`,
    several steps downstream) and only fail there with "Feature (N) ...
    has invalid geometry", far from whichever operation actually produced
    it. Fixing right where each new geometry is created, rather than only
    at the point something eventually complains, keeps a bad geometry
    from ever reaching the next operation in a chain."""
    import processing
    return processing.run("native:fixgeometries", {
        "INPUT": layer,
        "METHOD": 1,
        "OUTPUT": "memory:",
    })["OUTPUT"]


def buffer(input_geojson: dict, distance: float, units: str) -> dict:
    """`input_geojson` buffered by `distance` `units` ("metres" or
    "kilometres"), via `native:buffer`. Reprojects into the input's own UTM
    zone so the distance is real metres on the ground, not raw EPSG:4326
    degrees, then reprojects the result back to EPSG:4326 — the exact CRS
    footgun the proposal's design doc calls out."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "buffer_input")
    epsg = _layer_utm_epsg(layer)
    projected = reproject(layer, epsg)

    distance_m = distance * (1000.0 if units == "kilometres" else 1.0)
    result = processing.run("native:buffer", {
        "INPUT": projected,
        "DISTANCE": distance_m,
        "SEGMENTS": 16,
        "END_CAP_STYLE": 0,  # round
        "JOIN_STYLE": 0,     # round
        "MITER_LIMIT": 2,
        "DISSOLVE": False,
        "OUTPUT": "memory:",
    })["OUTPUT"]

    back_to_4326 = reproject(result, 4326)
    return layer_to_geojson(back_to_4326)


def clip(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Clip `input_geojson` to `overlay_geojson`'s extent via `native:clip`.
    Both are already EPSG:4326 (GroundPatch's own working CRS throughout) —
    no reprojection needed for a clip, since it's a topological operation,
    not a distance measurement."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "clip_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "clip_overlay")
    result = processing.run("native:clip", {
        "INPUT": input_layer,
        "OVERLAY": overlay_layer,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(_fix_geometries(result))


def intersection(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Geometric intersection via `native:intersection`."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "intersection_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "intersection_overlay")
    result = processing.run("native:intersection", {
        "INPUT": input_layer,
        "OVERLAY": overlay_layer,
        "INPUT_FIELDS": [],
        "OVERLAY_FIELDS": [],
        "OVERLAY_FIELDS_PREFIX": "",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(_fix_geometries(result))


def difference(input_geojson: dict, overlay_geojson: dict) -> dict:
    """`input_geojson` minus `overlay_geojson` via `native:difference`."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "difference_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "difference_overlay")
    result = processing.run("native:difference", {
        "INPUT": input_layer,
        "OVERLAY": overlay_layer,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(_fix_geometries(result))


def dissolve(input_geojson: dict, field: str | None = None) -> dict:
    """Dissolve via `native:dissolve`, grouped by `field` if given (whole-
    layer dissolve, QGIS's own default, if `field` is None/not a real field
    on this input)."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "dissolve_input")
    field_names = {f.name() for f in layer.fields()}
    dissolve_field = [field] if field and field in field_names else []
    result = processing.run("native:dissolve", {
        "INPUT": layer,
        "FIELD": dissolve_field,
        "SEPARATE_DISJOINT": False,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(_fix_geometries(result))


def calculate_area(input_geojson: dict, units: str) -> dict:
    """Adds an area field (named `area_ha` or `area_sqm` to match `units`)
    to every feature, via `native:exportaddgeometrycolumns` run in the
    input's own UTM zone (METHOD=0, Cartesian in the layer's — now
    projected — CRS) so the area is real square metres on the ground, then
    converts to hectares if requested and reprojects geometry back to
    EPSG:4326."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "area_input")
    epsg = _layer_utm_epsg(layer)
    projected = reproject(_fix_geometries(layer), epsg)

    with_area = processing.run("native:exportaddgeometrycolumns", {
        "INPUT": projected,
        "METHOD": 0,  # Cartesian calculation in the layer's (now projected) CRS
        "OUTPUT": "memory:",
    })["OUTPUT"]

    back_to_4326 = reproject(with_area, 4326)
    result_geojson = layer_to_geojson(back_to_4326)

    area_field = "area_ha" if units == "hectares" else "area_sqm"
    divisor = 10000.0 if units == "hectares" else 1.0
    for feature in result_geojson.get("features", []):
        props = feature.get("properties", {})
        raw_area_m2 = props.pop("area", None)
        if raw_area_m2 is not None:
            props[area_field] = raw_area_m2 / divisor
        props.pop("perimeter", None)  # not requested; drop rather than leave an unlabelled unit-less number
    return result_geojson


def calculate_distance(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Distance (metres) from each `input_geojson` feature to the nearest
    `overlay_geojson` feature, via `qgis:distancetonearesthubpoints`
    (despite the name, works as a general nearest-feature distance, not
    points-only, in this QGIS version)."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "distance_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "distance_overlay")
    overlay_fields = [f.name() for f in overlay_layer.fields()]
    # FIELD is a required "which overlay attribute to carry onto the result"
    # parameter, not something calculate_distance's own signature has an
    # opinion about - use the overlay's first field if it has one, otherwise
    # fall back to QGIS's own feature id.
    field = overlay_fields[0] if overlay_fields else "fid"
    result = processing.run("qgis:distancetonearesthubpoints", {
        "INPUT": input_layer,
        "HUBS": overlay_layer,
        "FIELD": field,
        "UNIT": 0,  # Meters
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def reclassify(input_geojson: dict, field: str, mapping: dict) -> dict:
    """Recodes `field` on every feature per `mapping` (compared/looked up
    as strings, so this works whether the source field is numeric or text
    in the original data). A feature whose value isn't a key in `mapping`
    keeps its original value - unchanged, not dropped - but every such
    value is collected into a reserved `_unmapped_values` key on the
    returned FeatureCollection (the same "extra key on a GeoJSON object"
    convention index.html itself already uses for truncated/partial
    flags), so jobs.py can surface it as a warning rather than silently
    passing through data that didn't match the table. Pure attribute
    work - no geometry touched, no QGIS needed."""
    str_mapping = {str(k): v for k, v in (mapping or {}).items()}
    unmapped = set()
    features = []
    for f in input_geojson.get("features", []):
        props = dict(f.get("properties") or {})
        raw = props.get(field)
        key = str(raw)
        if key in str_mapping:
            props[field] = str_mapping[key]
        elif raw is not None:
            unmapped.add(key)
        features.append({**f, "properties": props})
    result = {"type": "FeatureCollection", "features": features}
    if unmapped:
        result["_unmapped_values"] = sorted(unmapped)
    return result


def merge_with_precedence(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Combines `input_geojson` and `overlay_geojson`, with `overlay_geojson`
    taking precedence wherever they overlap: returns overlay's own features
    unchanged, plus whatever of input falls outside overlay's combined
    footprint (`native:difference`). This is "layer B sits on top of /
    replaces layer A wherever B has coverage, A fills the rest" - not a
    topological dissolve, so each source's own attributes are preserved on
    its own features rather than merged into one."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "merge_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "merge_overlay")
    remainder = processing.run("native:difference", {
        "INPUT": input_layer,
        "OVERLAY": overlay_layer,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    remainder_geojson = layer_to_geojson(_fix_geometries(remainder))
    combined_features = list(overlay_geojson.get("features", [])) + list(remainder_geojson.get("features", []))
    return {"type": "FeatureCollection", "features": combined_features}


def filter_by_attribute(input_geojson: dict, field: str, values: list) -> dict:
    """Keeps only features where `field`'s value (compared as a string) is
    in `values`. Pure attribute filtering, no geometry operation, no QGIS
    needed - typically chained straight into `dissolve` (filter down to a
    set of community/class codes, then dissolve them into one polygon),
    rather than built as one combined tool, since Phase 1's plan chaining
    already covers that without growing dissolve's own signature."""
    wanted = {str(v) for v in (values or [])}
    features = [f for f in input_geojson.get("features", [])
                if str((f.get("properties") or {}).get(field)) in wanted]
    return {"type": "FeatureCollection", "features": features}


# Maps APPROVED_TOOLS keys to the actual callables above, for jobs.py to
# dispatch through rather than hardcoding a tool->function mapping of its own.
TOOL_FUNCTIONS: dict[str, Callable[..., dict]] = {
    "buffer": buffer,
    "clip": clip,
    "intersection": intersection,
    "difference": difference,
    "dissolve": dissolve,
    "calculate_area": calculate_area,
    "calculate_distance": calculate_distance,
    "reclassify": reclassify,
    "merge_with_precedence": merge_with_precedence,
    "filter_by_attribute": filter_by_attribute,
}
