"""
Pydantic models shared across the scaffold.

These define the *contract* between index.html's chat panel and this
backend — the plan schema, the job lifecycle, and the layer catalogue shape.
Nothing here executes anything; see gis_worker.py for the approved-tool
catalogue these models are validated against.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# The structured GIS plan — what the AI planning layer produces, and what
# the validator checks before anything runs. See gis_worker.APPROVED_TOOLS
# for the fixed catalogue of values `tool` is allowed to take.
# ---------------------------------------------------------------------------

class Operation(BaseModel):
    """One step in a plan. Extra, tool-specific parameters (e.g. a dissolve
    field, or a dissolve-by expression) go in `params` rather than widening
    this model per tool — keeps every operation the same shape regardless of
    which tool it names, so the validator has one thing to check instead of
    a different model per tool."""

    tool: str = Field(..., description="Must be a key in gis_worker.APPROVED_TOOLS.")
    input: str = Field(..., description="Layer id this operation reads from — either a site-context layer id, or an earlier operation's `output`.")
    overlay: str | None = Field(None, description="Second input layer id, for binary operations (intersection, difference, ...).")
    distance: float | None = None
    # Deliberately a plain string, not a Literal — `units` means different
    # things for different tools (buffer: "metres"/"kilometres"; calculate_area:
    # "hectares"/"square_metres", per the proposal's own example plan). A
    # single enum covering every tool's unit vocabulary would either reject
    # valid plans or silently allow the wrong unit for the wrong tool either
    # way; validator.py checks the value against the specific tool's allowed
    # units instead (see validator.ALLOWED_UNITS_BY_TOOL).
    units: str | None = None
    output: str | None = Field(None, description="Id this operation's result is stored under, referenceable by later operations.")
    params: dict[str, Any] = Field(default_factory=dict, description="Tool-specific extra parameters not covered by the fields above.")


class GisPlan(BaseModel):
    operations: list[Operation]


# ---------------------------------------------------------------------------
# Site context — what index.html sends so the planner/validator have enough
# to work with, without needing the whole page or every dataset. Mirrors
# buildSiteContext() in index.html's chat feature; extend that function
# rather than inventing a second, divergent summary when this is built out.
# ---------------------------------------------------------------------------

class LayerStatus(str, Enum):
    complete = "complete"
    partial = "partial"
    failed = "failed"
    not_queried = "not_queried"


class LayerCatalogueEntry(BaseModel):
    """One entry per layer index.html already knows about — mirrors the
    `layers[]` registry plus the queryStatus/retrievedAt tracking added for
    the Data completeness work, not a separate catalogue maintained here."""

    id: str
    name: str
    geometry_type: Literal["Point", "LineString", "Polygon", "MultiPolygon"] | None = None
    fields: list[str] = Field(default_factory=list)
    status: LayerStatus = LayerStatus.not_queried
    retrieved_at: str | None = None


class SiteContext(BaseModel):
    boundary: dict[str, Any] = Field(..., description="GeoJSON Polygon/MultiPolygon geometry, WGS84 (EPSG:4326) — matches boundaryGeom in index.html.")
    crs: str = "EPSG:4326"
    assessment_buffer_km: float
    context_buffer_km: float
    layers: list[LayerCatalogueEntry] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# /api/ai/plan
# ---------------------------------------------------------------------------

class PlanRequest(BaseModel):
    request: str = Field(..., description="The user's natural-language request, e.g. the chat message.")
    site_context: SiteContext


class PlanResponse(BaseModel):
    plan: GisPlan
    explanation: str
    mock: bool = Field(True, description="True while planner.py is a stub returning a fixed illustrative plan rather than a real AI-generated one.")


# ---------------------------------------------------------------------------
# /api/jobs and /api/jobs/{job_id}
# ---------------------------------------------------------------------------

class JobCreateRequest(BaseModel):
    plan: GisPlan
    site_context: SiteContext
    # /api/ai/plan deliberately only sends lightweight catalogue metadata
    # (per the proposal: "does not need to send ... every dataset to the
    # AI") - but *executing* a plan needs real feature geometry for every
    # layer id an operation references. index.html already holds that data
    # client-side (lyr.lastGeoJSON per queried layer), so the job-creation
    # request is where it's actually sent, keyed by layer id exactly as
    # they appear in site_context.layers (plus "subject_site" for the
    # boundary). jobs.py errors clearly if an operation references an id
    # with no entry here, rather than failing deep inside gis_worker.py.
    layer_data: dict[str, dict[str, Any]] = Field(default_factory=dict)


class JobState(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    error = "error"


class JobStatusResponse(BaseModel):
    job_id: str
    state: JobState
    progress: float = Field(0.0, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    mock: bool = True


# ---------------------------------------------------------------------------
# /api/jobs/{job_id}/results and /api/jobs/{job_id}/layers/{layer_id}
# ---------------------------------------------------------------------------

class OutputLayerMeta(BaseModel):
    layer_id: str
    name: str
    geometry_type: Literal["Point", "LineString", "Polygon", "MultiPolygon"]
    feature_count: int
    source_operation: str = Field(..., description="The `output` id from the plan operation that produced this layer.")


class JobResultsResponse(BaseModel):
    job_id: str
    output_layers: list[OutputLayerMeta]
    statistics: dict[str, Any] = Field(default_factory=dict)
    mock: bool = True


class LayerFeaturesResponse(BaseModel):
    layer_id: str
    geojson: dict[str, Any]
    mock: bool = True
