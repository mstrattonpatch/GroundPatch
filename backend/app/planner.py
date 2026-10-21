"""
AI planning layer — turns a conversational request into either a plain
reply or a structured GisPlan to execute, via a real Claude tool-use call.

The model is given exactly one tool, `propose_gis_plan`, whose input schema
mirrors models.GisPlan. It can respond in plain text (ask a clarifying
question, explain a caveat it noticed in the data) or call that tool when
it's ready to act — same choice a human analyst has. Either way, nothing
about using a real chat changes the "AI proposes, the validated pipeline
executes" rule from Phase 1: a proposed plan still goes through
validator.validate_plan() and gis_worker.py exactly like every other path
into this backend. The model never generates or runs arbitrary Python — it
can only ever request operations from gis_worker.APPROVED_TOOLS.

Needs ANTHROPIC_API_KEY set in the environment. Without it, chat_turn()
returns a clearly-marked mock reply (mock=True) rather than silently
pretending to be a real response or crashing the request.
"""
from __future__ import annotations

import os

from . import jobs, storage
from .gis_worker import APPROVED_TOOLS
from .models import ChatRequest, ChatResponse, GisPlan, JobCreateRequest, JobState, Operation

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")

PROPOSE_PLAN_TOOL = {
    "name": "propose_gis_plan",
    "description": (
        "Propose a sequence of approved GIS operations to run against the user's actual site data. "
        "Only call this once you have enough information to act on real layer ids/fields/values from "
        "the site context you were given — never invent a layer id, field name, or attribute value "
        "that isn't actually present in it. If the request is ambiguous (which layer is 'the client "
        "layer', what a reclassification table actually maps to, which site boundary a calc should "
        "use), ask in plain text first rather than guessing. Operations can chain: a later operation's "
        "`input`/`overlay` can be an earlier operation's own `output` id."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "explanation": {
                "type": "string",
                "description": "A short, plain-English summary of what this plan does and why — shown to the user alongside the result.",
            },
            "operations": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "tool": {"type": "string", "enum": sorted(APPROVED_TOOLS.keys())},
                        "input": {"type": "string", "description": "A real layer id from the site context, 'subject_site', or an earlier operation's `output`."},
                        "overlay": {"type": "string", "description": "Second input, for two-layer tools (clip/intersection/difference/union/merge_with_precedence/calculate_distance/extract_by_location/join_by_location/count_points_in_polygon/join_by_nearest)."},
                        "distance": {"type": "number", "description": "buffer only."},
                        "units": {"type": "string", "description": "buffer: 'metres'|'kilometres'. calculate_area: 'hectares'|'square_metres'."},
                        "output": {"type": "string", "description": "Id this result is stored under. Required unless you intend to overwrite `input` in place (e.g. calculate_area annotating its own input)."},
                        "params": {
                            "type": "object",
                            "description": (
                                "Tool-specific extras. dissolve -> {field}; reclassify -> {field, mapping: {old: new, ...}}; "
                                "filter_by_attribute -> {field, values: [...]}; reproject_layer -> {epsg}; "
                                "extract_by_location/join_by_location -> {predicate: 'intersects'|'contains'|'disjoint'(extract only)|'equals'|'touches'|'overlaps'|'within'|'crosses', discard_nonmatching?(join only)}; "
                                "count_points_in_polygon -> {count_field?}; join_by_nearest -> {max_distance?}; "
                                "statistics_by_categories -> {values_field, categories_field}; "
                                "eliminate_slivers -> {min_area_sqm}; random_points_in_polygons -> {points_per_feature}; "
                                "merge_vector_layers -> {input_ids: [layer id, ...]} (combined with `input` itself); "
                                "create_points_from_table -> {rows: [{x, y, ...}, ...], x_field?, y_field?} (ignores `input`/`overlay`); "
                                "regular_grid -> {spacing_m, grid_type?: 'point'|'line'|'rectangle'|'diamond'|'hexagon'}."
                            ),
                        },
                    },
                    "required": ["tool", "input"],
                },
            },
        },
        "required": ["operations", "explanation"],
    },
}


def _tool_catalogue_text() -> str:
    return "\n".join(f"- {name}: {cfg['summary']}" for name, cfg in sorted(APPROVED_TOOLS.items()))


def _site_context_text(site_context) -> str:
    lines = ["Site boundary: a GeoJSON geometry is available as layer id 'subject_site'."]
    lines.append(f"Assessment buffer: {site_context.assessment_buffer_km}km. Context buffer: {site_context.context_buffer_km}km.")
    if not site_context.layers:
        lines.append("No other layers have been queried yet.")
    else:
        lines.append("Available layers (use these exact ids — never invent one):")
        for layer in site_context.layers:
            lines.append(f"- id='{layer.id}' name=\"{layer.name}\" geometry_type={layer.geometry_type} status={layer.status.value}")
            if layer.fields:
                lines.append(f"    fields: {', '.join(layer.fields)}")
            for field, values in (layer.sample_values or {}).items():
                lines.append(f"    {field} sample values: {', '.join(values)}")
    return "\n".join(lines)


SYSTEM_PROMPT_TEMPLATE = """You are the GIS analysis assistant inside GroundPatch, an NSW ecological site-constraints tool. You help an ecologist/planner run real spatial analysis against the site they're currently looking at.

You can only use these approved operations — you cannot write, request, or imply arbitrary Python or QGIS code, only call propose_gis_plan with operations drawn from this exact list:
{tool_catalogue}

Current site:
{site_context}

Rules:
- Only reference layer ids, field names, and attribute values that actually appear above. If you need a field or value you can't see, say so and ask, rather than guessing a plausible-sounding one.
- If a request is ambiguous (which layer counts as "the client layer", what a table in an email maps to, which boundary a calculation should use), ask a short clarifying question in plain text instead of proposing a plan.
- When you do call propose_gis_plan, keep `explanation` short and concrete — what you're about to do and why, in language a non-GIS person would follow.
- If something in the request can't be done with the approved operations, say so plainly rather than pretending you did it.
- Flag anything that looks like a real data problem (values with no obvious mapping, a name that doesn't match what you'd expect) rather than silently working around it — that kind of catch is exactly what makes this useful over blindly running a fixed script.
"""


def _build_job_summary_text(job, results) -> str:
    if job.state != JobState.done:
        return f"The plan did not complete (state: {job.state.value}). Errors: {'; '.join(job.errors) or 'none reported'}."
    lines = [f"Done. Produced {len(results.output_layers)} layer(s):"]
    for layer in results.output_layers:
        lines.append(f"- {layer.layer_id}: {layer.feature_count} feature(s) ({layer.geometry_type}, from {layer.source_operation})")
    if job.warnings:
        lines.append("Warnings: " + "; ".join(job.warnings))
    return "\n".join(lines)


def chat_turn(request: ChatRequest) -> ChatResponse:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return ChatResponse(
            reply=(
                "ANTHROPIC_API_KEY isn't set on this backend, so I can't actually talk to an AI yet — "
                "this is a mock reply so the chat UI has something to show. Set ANTHROPIC_API_KEY in the "
                "environment this service runs in (see backend/README.md) to enable real conversation."
            ),
            mock=True,
        )

    import anthropic  # imported lazily so the plain requirements.txt environment doesn't need it installed just to boot

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        tool_catalogue=_tool_catalogue_text(),
        site_context=_site_context_text(request.site_context),
    )
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    response = client.messages.create(
        model=MODEL,
        # Long requests (a pasted client email with several tables, a
        # multi-step consolidation plan) produce long replies — 2048 was
        # getting hit mid-sentence on exactly that kind of turn, which
        # then sometimes left the *next* turn with no visible content at
        # all once the truncated reply was back in the conversation
        # history being resent. 8192 gives real headroom for a detailed
        # explanation plus a non-trivial operations list in the same turn.
        max_tokens=8192,
        system=system_prompt,
        messages=messages,
        tools=[PROPOSE_PLAN_TOOL],
    )

    text_parts = [block.text for block in response.content if block.type == "text"]
    tool_use = next((block for block in response.content if block.type == "tool_use"), None)

    if tool_use is None:
        reply = "\n".join(text_parts).strip()
        if not reply:
            # A genuinely empty turn (no text, no tool call) is unusual —
            # surface *why* instead of a bare "(no response)" so this is
            # diagnosable from the chat itself, not just backend logs.
            reply = (
                f"(The model returned no visible content this turn — stop_reason: "
                f"{response.stop_reason!r}. Try rephrasing, or splitting the request "
                f"into smaller steps.)"
            )
        return ChatResponse(reply=reply, mock=False)

    try:
        operations = [Operation(**op) for op in tool_use.input.get("operations", [])]
        plan = GisPlan(operations=operations)
    except Exception as exc:  # noqa: BLE001 - a malformed tool call shouldn't 500 the request
        return ChatResponse(
            reply=f"{' '.join(text_parts).strip()}\n\n(The proposed plan was malformed and wasn't run: {exc})".strip(),
            mock=False,
        )

    job = jobs.create_job(JobCreateRequest(plan=plan, site_context=request.site_context, layer_data=request.layer_data))
    results = storage.get_results(job.job_id) if job.state == JobState.done else None

    explanation = tool_use.input.get("explanation", "")
    reply = "\n\n".join(filter(None, [
        " ".join(text_parts).strip(),
        explanation,
        _build_job_summary_text(job, results),
    ]))

    return ChatResponse(reply=reply, plan=plan, job=job, results=results, mock=False)
