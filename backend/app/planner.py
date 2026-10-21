"""
AI planning layer — turns a natural-language request into a structured
GisPlan. This stub does NOT call any AI API yet; it returns one fixed,
illustrative plan regardless of input, clearly marked `mock=True`.

When this is built out for real: keep the API key here, server-side, never
in index.html (index.html already follows this pattern for its own chat
feature — the Worker holds the Anthropic key, the browser never sees it;
match that). The prompt should be built from `site_context` (the same shape
buildSiteContext() in index.html already assembles for the existing chat)
plus `gis_worker.APPROVED_TOOLS` as the tool catalogue the model is told it
may use — and the model's output should be parsed straight into
`models.GisPlan`, not treated as trusted until `validator.validate_plan()`
has checked it.
"""
from __future__ import annotations

from .models import GisPlan, Operation, PlanRequest, PlanResponse


def plan_from_request(request: PlanRequest) -> PlanResponse:
    """Stub: ignores `request.request` and `request.site_context` and
    returns the proposal's own illustrative example plan every time."""
    plan = GisPlan(operations=[
        Operation(tool="buffer", input="subject_site", distance=500, units="metres", output="assessment_buffer_500m"),
        Operation(tool="intersection", input="threatened_ecological_communities", overlay="subject_site", output="communities_within_site"),
        Operation(tool="calculate_area", input="communities_within_site", units="hectares"),
    ])
    return PlanResponse(
        plan=plan,
        explanation=(
            "MOCK PLAN — planner.py is a stub and has not read your request. "
            "This is the proposal's own illustrative example "
            "(500m buffer -> intersect threatened ecological communities -> area in hectares), "
            "returned unconditionally so /api/ai/plan has a stable, realistic shape to develop "
            "the index.html integration against before a real AI call is wired in."
        ),
        mock=True,
    )
