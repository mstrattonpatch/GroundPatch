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
    "union": {
        "algorithm_id": "native:union",
        "summary": "Every portion of `input` and `overlay`, split at their overlaps — unlike merge_with_precedence, the overlap keeps BOTH layers' attributes, not just overlay's.",
    },
    "reproject_layer": {
        "algorithm_id": "native:reprojectlayer",
        "summary": "Reprojects `input` to `params.epsg` (an EPSG code, e.g. 28356). Rarely needed — every other tool already works in EPSG:4326 and reprojects internally for metric accuracy.",
    },
    "fix_geometries": {
        "algorithm_id": "native:fixgeometries",
        "summary": "Repairs self-intersections and other invalid geometry on `input`. Every geometry-combining tool already runs this on its own output automatically — use this standalone only when a layer (e.g. a freshly uploaded dataset) needs fixing before anything else touches it.",
    },
    "extract_by_location": {
        "algorithm_id": "native:extractbylocation",
        "summary": "Keeps only features of `input` matching `params.predicate` (intersects/contains/disjoint/equals/touches/overlaps/within/crosses) against `overlay`. A spatial version of filter_by_attribute.",
    },
    "join_by_location": {
        "algorithm_id": "native:joinattributesbylocation",
        "summary": "Copies `overlay`'s attributes onto `input` features matching `params.predicate` (intersects/contains/equals/touches/overlaps/within/crosses) against it.",
    },
    "count_points_in_polygon": {
        "algorithm_id": "native:countpointsinpolygon",
        "summary": "Adds a `params.count_field` (default point_count) to every polygon of `input` with how many `overlay` points fall inside it.",
    },
    "join_by_nearest": {
        "algorithm_id": "native:joinbynearest",
        "summary": "Joins each `input` feature to its single nearest `overlay` feature (copies its attributes, adds a distance field in metres). `params.max_distance` (metres) optionally caps the search.",
    },
    "statistics_by_categories": {
        "algorithm_id": "qgis:statisticsbycategories",
        "summary": "Summary statistics (count/sum/mean/min/max) of `params.values_field` on `input`, grouped by `params.categories_field`. Returns one geometry-less row per distinct category.",
    },
    "multipart_to_singleparts": {
        "algorithm_id": "native:multiparttosingleparts",
        "summary": "Splits every multi-part feature of `input` (MultiPolygon/MultiLineString/...) into one single-part feature per part.",
    },
    "eliminate_slivers": {
        "algorithm_id": "qgis:eliminateselectedpolygons",
        "summary": "Merges every polygon of `input` smaller than `params.min_area_sqm` into its largest-area neighbour — cleans up sliver polygons left over from an overlay.",
    },
    "random_points_in_polygons": {
        "algorithm_id": "native:randompointsinpolygons",
        "summary": "Scatters `params.points_per_feature` random points inside each polygon of `input` — e.g. candidate survey/transect points.",
    },
    "merge_vector_layers": {
        "algorithm_id": "native:mergevectorlayers",
        "summary": "Combines `input` with one or more other layers named in `params.input_ids` (a list of layer ids) into one — e.g. combining several uploaded datasets before analysing them together.",
    },
    "create_points_from_table": {
        "algorithm_id": "native:createpointslayerfromtable",
        "summary": "Builds a point layer from `params.rows` (a list of {field: value} records — not an existing layer id) using `params.x_field`/`params.y_field` (default 'x'/'y') as WGS84 longitude/latitude.",
    },
    "regular_grid": {
        "algorithm_id": "native:creategrid",
        "summary": "A regular grid (point/line/rectangle/diamond/hexagon cells, `params.grid_type`, default rectangle) covering `input`'s own extent, spaced `params.spacing_m` apart.",
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


def union(input_geojson: dict, overlay_geojson: dict) -> dict:
    """Union via `native:union` — every portion of both layers, split at
    their overlaps. Unlike merge_with_precedence (which drops input's
    attributes wherever overlay covers it), the overlapping portion here
    carries BOTH layers' attributes — for "where do these two layers
    overlap, and what does each say there", not "B replaces A"."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "union_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "union_overlay")
    result = processing.run("native:union", {
        "INPUT": input_layer,
        "OVERLAY": overlay_layer,
        "OVERLAY_FIELDS_PREFIX": "",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(_fix_geometries(result))


def reproject_layer(input_geojson: dict, epsg: int) -> dict:
    """Reprojects `input_geojson` to EPSG:`epsg` via
    `native:reprojectlayer` (qgis_runtime.reproject(), already used
    internally by buffer/calculate_area/etc.) — exposed as its own tool
    for a plan that needs output in a specific CRS rather than
    GroundPatch's EPSG:4326 default."""
    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "reproject_input")
    return layer_to_geojson(reproject(layer, epsg))


def fix_geometries(input_geojson: dict) -> dict:
    """Standalone exposure of the same `native:fixgeometries` repair every
    geometry-combining tool above already runs automatically on its own
    output (see `_fix_geometries`) — useful on its own when a layer (e.g.
    a freshly uploaded client dataset) has known topology problems before
    it's used in anything else."""
    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "fixgeom_input")
    return layer_to_geojson(_fix_geometries(layer))


# native:extractbylocation's PREDICATE enum, in the exact order QGIS
# defines it — confirmed against this QGIS build's own
# QgsApplication.processingRegistry().
_EXTRACT_PREDICATES = ["intersects", "contains", "disjoint", "equals", "touches", "overlaps", "within", "crosses"]


def extract_by_location(input_geojson: dict, overlay_geojson: dict, predicate: str = "intersects") -> dict:
    """Keeps only features of `input_geojson` matching `predicate`
    (intersects/contains/disjoint/equals/touches/overlaps/within/crosses)
    against `overlay_geojson`, via `native:extractbylocation` — a spatial
    equivalent of filter_by_attribute (selection by geometry relationship
    instead of an attribute value)."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "extract_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "extract_overlay")
    pred_idx = _EXTRACT_PREDICATES.index(predicate) if predicate in _EXTRACT_PREDICATES else 0
    result = processing.run("native:extractbylocation", {
        "INPUT": input_layer,
        "PREDICATE": [pred_idx],
        "INTERSECT": overlay_layer,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


# native:joinattributesbylocation's PREDICATE enum — one shorter than
# extractbylocation's (no "disjoint", which wouldn't make sense for a join).
_JOIN_PREDICATES = ["intersects", "contains", "equals", "touches", "overlaps", "within", "crosses"]


def join_by_location(input_geojson: dict, overlay_geojson: dict, predicate: str = "intersects", discard_nonmatching: bool = False) -> dict:
    """Copies attributes from `overlay_geojson` onto `input_geojson`
    features satisfying `predicate` against them, via
    `native:joinattributesbylocation` (one-to-one: the first matching
    overlay feature, if more than one matches)."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "join_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "join_overlay")
    pred_idx = _JOIN_PREDICATES.index(predicate) if predicate in _JOIN_PREDICATES else 0
    result = processing.run("native:joinattributesbylocation", {
        "INPUT": input_layer,
        "PREDICATE": [pred_idx],
        "JOIN": overlay_layer,
        "JOIN_FIELDS": [],
        "METHOD": 1,  # one-to-one, first matching feature
        "DISCARD_NONMATCHING": discard_nonmatching,
        "PREFIX": "",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def count_points_in_polygon(input_geojson: dict, overlay_geojson: dict, count_field: str = "point_count") -> dict:
    """Adds `count_field` to every polygon in `input_geojson` with the
    number of `overlay_geojson` point features inside it, via
    `native:countpointsinpolygon`."""
    import processing

    ensure_qgis_initialized()
    polygons = geojson_to_layer(input_geojson, "count_polygons")
    points = geojson_to_layer(overlay_geojson, "count_points")
    result = processing.run("native:countpointsinpolygon", {
        "POLYGONS": polygons,
        "POINTS": points,
        "FIELD": count_field or "point_count",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def join_by_nearest(input_geojson: dict, overlay_geojson: dict, max_distance: float | None = None) -> dict:
    """Joins each `input_geojson` feature to its single nearest
    `overlay_geojson` feature (all of the overlay's attributes, plus a
    computed distance field), via `native:joinbynearest`. Reprojects into
    the input's own UTM zone first so `max_distance` and the computed
    distance are real ground metres, not raw EPSG:4326 degrees — same
    reasoning as buffer()."""
    import processing

    ensure_qgis_initialized()
    input_layer = geojson_to_layer(input_geojson, "nearest_input")
    overlay_layer = geojson_to_layer(overlay_geojson, "nearest_overlay")
    epsg = _layer_utm_epsg(input_layer)
    input_proj = reproject(input_layer, epsg)
    overlay_proj = reproject(overlay_layer, epsg)
    params = {
        "INPUT": input_proj,
        "INPUT_2": overlay_proj,
        "FIELDS_TO_COPY": [],
        "DISCARD_NONMATCHING": False,
        "PREFIX": "",
        "NEIGHBORS": 1,
        "OUTPUT": "memory:",
    }
    if max_distance is not None:
        params["MAX_DISTANCE"] = max_distance
    result = processing.run("native:joinbynearest", params)["OUTPUT"]
    return layer_to_geojson(reproject(result, 4326))


def statistics_by_categories(input_geojson: dict, values_field: str, categories_field: str) -> dict:
    """Summary statistics (count, sum, mean, min, max, ...) of
    `values_field` grouped by `categories_field`, via
    `qgis:statisticsbycategories` (note the `qgis:` prefix, not `native:`
    — confirmed against this QGIS build's own processing registry).
    Returns one row per distinct category, geometry-less — same
    convention the rest of this app uses for an attribute-only result."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "stats_input")
    result = processing.run("qgis:statisticsbycategories", {
        "INPUT": layer,
        "VALUES_FIELD_NAME": values_field,
        "CATEGORIES_FIELD_NAME": categories_field,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def multipart_to_singleparts(input_geojson: dict) -> dict:
    """Splits every multi-part feature (MultiPolygon/MultiLineString/...)
    into one single-part feature per part, via
    `native:multiparttosingleparts` — each part keeps the original
    feature's attributes."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "multipart_input")
    result = processing.run("native:multiparttosingleparts", {
        "INPUT": layer,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def eliminate_slivers(input_geojson: dict, min_area_sqm: float) -> dict:
    """Merges every polygon smaller than `min_area_sqm` into its
    largest-area neighbour, via `qgis:eliminateselectedpolygons` (note the
    `qgis:` prefix — the `native:` version of this algorithm doesn't exist
    in this QGIS build). Selection is driven here by area, computed in the
    layer's own UTM zone so the threshold is real square metres — the
    standard "clean up sliver polygons left over from an overlay" step."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "sliver_input")
    epsg = _layer_utm_epsg(layer)
    projected = reproject(layer, epsg)
    projected.selectByExpression(f"$area < {min_area_sqm}")
    result = processing.run("qgis:eliminateselectedpolygons", {
        "INPUT": projected,
        "MODE": 0,  # merge into the largest-area neighbour
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(reproject(result, 4326))


def random_points_in_polygons(input_geojson: dict, points_per_feature: int) -> dict:
    """Scatters `points_per_feature` random points inside each polygon of
    `input_geojson`, via `native:randompointsinpolygons` — e.g. generating
    candidate survey/transect points within a constraint area."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "randpts_input")
    result = processing.run("native:randompointsinpolygons", {
        "INPUT": layer,
        "POINTS_NUMBER": points_per_feature,
        "MIN_DISTANCE": 0,
        "MIN_DISTANCE_GLOBAL": 0,
        "MAX_TRIES_PER_POINT": 10,
        "INCLUDE_POLYGON_ATTRIBUTES": True,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def merge_vector_layers(input_geojsons: list[dict]) -> dict:
    """Combines several layers into one, via `native:mergevectorlayers` —
    e.g. combining several uploaded client shapefiles into a single layer
    before running further analysis on them together. Takes a LIST of
    layers rather than the usual input/overlay pair — see jobs.py's
    dispatch for how a plan names more than one input for this tool."""
    import processing

    ensure_qgis_initialized()
    layers = [geojson_to_layer(gj, f"merge_input_{i}") for i, gj in enumerate(input_geojsons)]
    result = processing.run("native:mergevectorlayers", {
        "LAYERS": layers,
        "CRS": None,
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def create_points_from_table(rows: list[dict], x_field: str = "x", y_field: str = "y") -> dict:
    """Builds a point layer from a list of plain `{field: value, ...}`
    rows (e.g. a pasted table of site coordinates), via
    `native:createpointslayerfromtable`. Every row needs at least
    `x_field`/`y_field` as real numbers — WGS84 longitude/latitude,
    matching the rest of this app's working CRS. Doesn't take a GeoJSON
    `input` layer at all — the data comes straight from `rows`."""
    import csv
    import tempfile

    import processing
    from qgis.core import QgsVectorLayer

    ensure_qgis_initialized()
    if not rows:
        return {"type": "FeatureCollection", "features": []}
    fieldnames = list(rows[0].keys())
    fd = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8", newline="")
    try:
        writer = csv.DictWriter(fd, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    finally:
        fd.close()
    table_layer = QgsVectorLayer(fd.name, "points_table", "ogr")
    if not table_layer.isValid():
        raise RuntimeError("Could not load the provided rows as a table.")
    result = processing.run("native:createpointslayerfromtable", {
        "INPUT": table_layer,
        "XFIELD": x_field,
        "YFIELD": y_field,
        "ZFIELD": "",
        "MFIELD": "",
        "TARGET_CRS": "EPSG:4326",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(result)


def regular_grid(input_geojson: dict, spacing_m: float, grid_type: str = "rectangle") -> dict:
    """A regular grid (point/line/rectangle/diamond/hexagon cells)
    covering `input_geojson`'s own extent, spaced `spacing_m` apart, via
    `native:creategrid` — e.g. generating systematic survey/transect
    locations across a site."""
    import processing

    ensure_qgis_initialized()
    layer = geojson_to_layer(input_geojson, "grid_extent_input")
    epsg = _layer_utm_epsg(layer)
    projected = reproject(layer, epsg)
    extent = projected.extent()
    extent_str = f"{extent.xMinimum()},{extent.xMaximum()},{extent.yMinimum()},{extent.yMaximum()} [EPSG:{epsg}]"
    type_map = {"point": 0, "line": 1, "rectangle": 2, "diamond": 3, "hexagon": 4}
    result = processing.run("native:creategrid", {
        "TYPE": type_map.get(grid_type, 2),
        "EXTENT": extent_str,
        "HSPACING": spacing_m,
        "VSPACING": spacing_m,
        "HOVERLAY": 0,
        "VOVERLAY": 0,
        "CRS": f"EPSG:{epsg}",
        "OUTPUT": "memory:",
    })["OUTPUT"]
    return layer_to_geojson(reproject(result, 4326))


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
    "union": union,
    "reproject_layer": reproject_layer,
    "fix_geometries": fix_geometries,
    "extract_by_location": extract_by_location,
    "join_by_location": join_by_location,
    "count_points_in_polygon": count_points_in_polygon,
    "join_by_nearest": join_by_nearest,
    "statistics_by_categories": statistics_by_categories,
    "multipart_to_singleparts": multipart_to_singleparts,
    "eliminate_slivers": eliminate_slivers,
    "random_points_in_polygons": random_points_in_polygons,
    "merge_vector_layers": merge_vector_layers,
    "create_points_from_table": create_points_from_table,
    "regular_grid": regular_grid,
}
