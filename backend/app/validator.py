"""
Plan validation — the gate between "the AI proposed this" and "the server
will run this." A plan that fails validation never reaches gis_worker.py.

This is a structural stub: the checks below are real logic (not
NotImplementedError), but deliberately conservative/minimal — enough to
define *what kind* of validation happens at each step, not a finished
implementation. Expand each check as Phase 1 is actually built, rather than
skipping validation and relying on gis_worker.py's own NotImplementedError
stubs to be the only safety net.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .gis_worker import APPROVED_TOOLS
from .models import GisPlan, SiteContext

# Per-tool allowed values for Operation.units — see models.Operation's
# `units` field docstring for why this isn't a single shared enum.
ALLOWED_UNITS_BY_TOOL: dict[str, set[str]] = {
    "buffer": {"metres", "kilometres"},
    "calculate_area": {"hectares", "square_metres"},
}

# Tools that need a second layer — `overlay` — to mean anything. (A
# pre-existing gap this list also closes: the original tools below never
# had this checked either; op.overlay being left null just crashed as a
# KeyError inside jobs.py at execution time instead of a clean validation
# error.)
TOOLS_REQUIRING_OVERLAY: set[str] = {
    "clip", "intersection", "difference", "calculate_distance", "merge_with_precedence",
    "union", "extract_by_location", "join_by_location", "count_points_in_polygon", "join_by_nearest",
}

# create_points_from_table builds its layer entirely from params.rows —
# `input` is still a required field on the model, but doesn't need to
# resolve to anything real for this one tool.
TOOLS_WITHOUT_A_REAL_INPUT: set[str] = {"create_points_from_table"}


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_plan(plan: GisPlan, site_context: SiteContext) -> ValidationResult:
    """Checks, in order:

    1. Every operation's `tool` is in APPROVED_TOOLS — the AI cannot invent
       or request an arbitrary algorithm name.
    2. Every operation's `input` (and `overlay`, if present) resolves to
       either a known site_context layer id or an earlier operation's
       `output` — no operation can reference data that doesn't exist yet.
    3. `buffer` operations carry both `distance` and `units` — the CRS/unit
       footgun the proposal calls out specifically (500 must mean 500
       metres, not 500 of whatever the source CRS uses) starts with making
       units mandatory at the plan level; gis_worker.buffer() is where the
       actual reprojection happens once implemented.
    4. Every `output` id is unique within the plan (an operation can't
       silently overwrite an earlier one's result).

    What this does NOT check yet (left for Phase 1): field-name validity
    within a layer's actual attribute schema, geometry-type compatibility
    per tool (e.g. calculate_distance needs point inputs), or resource
    limits (max feature count, max operation count per plan).
    """
    errors: list[str] = []
    warnings: list[str] = []

    known_ids: set[str] = {layer.id for layer in site_context.layers} | {"subject_site"}
    seen_outputs: set[str] = set()

    if not plan.operations:
        errors.append("Plan has no operations.")

    for i, op in enumerate(plan.operations):
        prefix = f"operation[{i}] ({op.tool})"

        if op.tool not in APPROVED_TOOLS:
            errors.append(f"{prefix}: '{op.tool}' is not an approved tool. Approved: {sorted(APPROVED_TOOLS)}.")
            continue  # no point checking the rest of a request for a tool that doesn't exist

        if op.tool not in TOOLS_WITHOUT_A_REAL_INPUT and op.input not in known_ids and op.input not in seen_outputs:
            errors.append(f"{prefix}: input '{op.input}' is not a known site-context layer or an earlier operation's output.")

        if op.tool in TOOLS_REQUIRING_OVERLAY and op.overlay is None:
            errors.append(f"{prefix}: '{op.tool}' requires 'overlay' (a second layer).")
        if op.overlay is not None and op.overlay not in known_ids and op.overlay not in seen_outputs:
            errors.append(f"{prefix}: overlay '{op.overlay}' is not a known site-context layer or an earlier operation's output.")

        if op.tool == "buffer" and op.distance is None:
            errors.append(f"{prefix}: buffer requires 'distance'.")

        allowed_units = ALLOWED_UNITS_BY_TOOL.get(op.tool)
        if allowed_units is not None:
            if op.units is None:
                errors.append(f"{prefix}: '{op.tool}' requires 'units' (never assume the source CRS's native units) — one of {sorted(allowed_units)}.")
            elif op.units not in allowed_units:
                errors.append(f"{prefix}: units '{op.units}' is not valid for '{op.tool}' — one of {sorted(allowed_units)}.")

        if op.tool in ("reclassify", "filter_by_attribute") and not op.params.get("field"):
            errors.append(f"{prefix}: '{op.tool}' requires params.field.")
        if op.tool == "reclassify" and not op.params.get("mapping"):
            errors.append(f"{prefix}: reclassify requires params.mapping (old value -> new value).")
        if op.tool == "filter_by_attribute" and not op.params.get("values"):
            errors.append(f"{prefix}: filter_by_attribute requires params.values (a non-empty list).")

        if op.tool == "reproject_layer" and not op.params.get("epsg"):
            errors.append(f"{prefix}: reproject_layer requires params.epsg (an EPSG code, e.g. 28356).")
        if op.tool == "statistics_by_categories" and not (op.params.get("values_field") and op.params.get("categories_field")):
            errors.append(f"{prefix}: statistics_by_categories requires params.values_field and params.categories_field.")
        if op.tool == "eliminate_slivers" and op.params.get("min_area_sqm") is None:
            errors.append(f"{prefix}: eliminate_slivers requires params.min_area_sqm.")
        if op.tool == "random_points_in_polygons" and not op.params.get("points_per_feature"):
            errors.append(f"{prefix}: random_points_in_polygons requires params.points_per_feature.")
        if op.tool == "regular_grid" and not op.params.get("spacing_m"):
            errors.append(f"{prefix}: regular_grid requires params.spacing_m.")
        if op.tool == "create_points_from_table" and not op.params.get("rows"):
            errors.append(f"{prefix}: create_points_from_table requires params.rows (a non-empty list of {{field: value}} records).")
        if op.tool == "merge_vector_layers":
            extra_ids = op.params.get("input_ids") or []
            if not extra_ids:
                errors.append(f"{prefix}: merge_vector_layers requires params.input_ids (one or more additional layer ids, alongside 'input').")
            for extra_id in extra_ids:
                if extra_id not in known_ids and extra_id not in seen_outputs:
                    errors.append(f"{prefix}: params.input_ids entry '{extra_id}' is not a known site-context layer or an earlier operation's output.")

        if op.output is not None:
            if op.output in seen_outputs or op.output in known_ids:
                errors.append(f"{prefix}: output id '{op.output}' collides with an earlier operation's output or an existing layer id.")
            else:
                seen_outputs.add(op.output)

    return ValidationResult(ok=not errors, errors=errors, warnings=warnings)
