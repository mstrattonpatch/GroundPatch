"""
Contract + real-execution tests.

Two tiers, split by whether they need a PyQGIS-capable environment:

  - Validation-only tests (no `@pytest.mark.skipif`) run anywhere `pytest
    tests/` runs, including the plain `requirements.txt` environment with
    no QGIS installed — they only exercise validator.py, which never
    imports qgis.*.
  - Real-execution tests are skipped unless gis_worker.QGIS_AVAILABLE is
    true (run them with `environment-qgis.yml`'s interpreter — see
    README.md's "Running the test suite against real QGIS"). These assert
    actual computed geometry/area, not just response shape.
"""
from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient

from app.gis_worker import QGIS_AVAILABLE
from app.main import app

client = TestClient(app)

requires_qgis = pytest.mark.skipif(not QGIS_AVAILABLE, reason="needs a PyQGIS-capable environment — see environment-qgis.yml")

SITE_CONTEXT = {
    "boundary": {
        "type": "Polygon",
        # ~0.001 x 0.001 degree square near Sydney - small enough to keep
        # QGIS operations fast, large enough to be a sensible real polygon.
        "coordinates": [[[151.0, -33.8], [151.001, -33.8], [151.001, -33.801], [151.0, -33.801], [151.0, -33.8]]],
    },
    "assessment_buffer_km": 5,
    "context_buffer_km": 0.5,
    "layers": [
        {"id": "threatened_ecological_communities", "name": "TECs", "geometry_type": "Polygon", "fields": ["name"], "status": "complete"},
    ],
}

VALID_PLAN = {
    "operations": [
        {"tool": "buffer", "input": "subject_site", "distance": 500, "units": "metres", "output": "buf500"},
        {"tool": "intersection", "input": "threatened_ecological_communities", "overlay": "buf500", "output": "communities_within_site"},
        {"tool": "calculate_area", "input": "communities_within_site", "units": "hectares"},
    ]
}

# Overlaps the buffer but extends well beyond it, so intersection genuinely
# clips something (rather than either fully containing or missing the
# buffer entirely) — a more meaningful real-execution check than an
# arbitrary shape would be.
TEC_LAYER_DATA = {
    "threatened_ecological_communities": {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Cumberland Plain Woodland"},
            "geometry": {"type": "Polygon", "coordinates": [[[151.0005, -33.8005], [151.003, -33.8005], [151.003, -33.803], [151.0005, -33.803], [151.0005, -33.8005]]]},
        }],
    },
}


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_chat_without_api_key_returns_clear_mock_reply(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "buffer the site by 500m"}],
        "site_context": SITE_CONTEXT,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["mock"] is True
    assert "ANTHROPIC_API_KEY" in body["reply"]
    assert body["plan"] is None
    assert body["job"] is None


def test_create_job_rejects_unapproved_tool():
    plan = {"operations": [{"tool": "run_arbitrary_python", "input": "subject_site", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "error"
    assert any("not an approved tool" in e for e in body["errors"])


def test_create_job_rejects_wrong_units_for_tool():
    plan = {"operations": [{"tool": "buffer", "input": "subject_site", "distance": 500, "units": "hectares", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    body = resp.json()
    assert body["state"] == "error"
    assert any("is not valid for 'buffer'" in e for e in body["errors"])


def test_create_job_rejects_reclassify_missing_params():
    plan = {"operations": [{"tool": "reclassify", "input": "subject_site", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    body = resp.json()
    assert body["state"] == "error"
    assert any("requires params.field" in e for e in body["errors"])
    assert any("requires params.mapping" in e for e in body["errors"])


def test_create_job_rejects_filter_by_attribute_missing_values():
    plan = {"operations": [{"tool": "filter_by_attribute", "input": "subject_site", "params": {"field": "PCTID"}, "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    body = resp.json()
    assert body["state"] == "error"
    assert any("requires params.values" in e for e in body["errors"])


def test_create_job_rejects_unknown_input_reference_at_validation():
    plan = {"operations": [{"tool": "buffer", "input": "a_layer_that_does_not_exist", "distance": 500, "units": "metres", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    body = resp.json()
    assert body["state"] == "error"
    assert any("is not a known site-context layer" in e for e in body["errors"])


def test_create_job_with_missing_layer_data_errors_clearly_without_qgis():
    """A plan can pass validation (the layer id IS in site_context.layers)
    but still have no actual feature data sent for it in layer_data - this
    must be caught with a clear message before any gis_worker call, not an
    opaque KeyError deep inside execution. Uses the TEC layer directly as
    operation[0]'s input (not subject_site, which jobs.py always has) so
    this test exercises that pre-execution check without ever reaching a
    QGIS call, and so runs in any environment."""
    plan = {"operations": [{"tool": "dissolve", "input": "threatened_ecological_communities", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT, "layer_data": {}})
    body = resp.json()
    assert body["state"] == "error"
    assert any("has no data" in e for e in body["errors"])


def test_unknown_job_id_404s_on_every_job_scoped_endpoint():
    for suffix in ("", "/results", "/layers/foo", "/project"):
        resp = client.get(f"/api/jobs/does-not-exist{suffix}")
        assert resp.status_code == 404, f"expected 404 for /api/jobs/does-not-exist{suffix}, got {resp.status_code}"


def test_project_download_is_a_real_zip_with_mock_content():
    """Phase 3 (project_builder.py) isn't built yet - this just confirms
    the download endpoint's own wiring (headers, filename, real non-empty
    bytes) works, independent of whether execution succeeded."""
    plan = {"operations": [{"tool": "run_arbitrary_python", "input": "subject_site", "output": "x"}]}
    create = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    job_id = create.json()["job_id"]

    project = client.get(f"/api/jobs/{job_id}/project")
    assert project.status_code == 200
    assert project.headers["content-type"] == "application/zip"
    assert "attachment" in project.headers["content-disposition"]
    assert len(project.content) > 0


# ---------------------------------------------------------------------------
# Real execution — needs a PyQGIS-capable environment.
# ---------------------------------------------------------------------------

@requires_qgis
def test_create_job_executes_real_plan_end_to_end():
    resp = client.post("/api/jobs", json={"plan": VALID_PLAN, "site_context": SITE_CONTEXT, "layer_data": TEC_LAYER_DATA})
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "done", body.get("errors")
    assert body["mock"] is False


@requires_qgis
def test_real_results_and_layer_endpoints_return_computed_geometry():
    create = client.post("/api/jobs", json={"plan": VALID_PLAN, "site_context": SITE_CONTEXT, "layer_data": TEC_LAYER_DATA})
    job_id = create.json()["job_id"]
    assert create.json()["state"] == "done"

    results = client.get(f"/api/jobs/{job_id}/results")
    assert results.status_code == 200
    body = results.json()
    assert body["mock"] is False
    layer_ids = [layer["layer_id"] for layer in body["output_layers"]]
    # buf500 then communities_within_site, each appearing exactly once -
    # calculate_area has no explicit `output` in VALID_PLAN, so it writes
    # back onto communities_within_site rather than creating a third id;
    # that must collapse to one entry (its final, post-calculate_area
    # state), not show up as two.
    assert layer_ids == ["buf500", "communities_within_site"]
    communities_meta = body["output_layers"][1]
    assert communities_meta["source_operation"] == "calculate_area"
    assert communities_meta["feature_count"] == 1

    layer = client.get(f"/api/jobs/{job_id}/layers/communities_within_site")
    assert layer.status_code == 200
    geojson = layer.json()["geojson"]
    assert geojson["type"] == "FeatureCollection"
    props = geojson["features"][0]["properties"]
    # The TEC polygon (~2.5km x 2.5km) clipped to a 500m buffer around a
    # ~90m x 110m site should land well under 10ha - a loose sanity bound,
    # not a precise expected value, since the exact figure depends on UTM
    # zone/projection internals this test isn't trying to pin down.
    assert "area_ha" in props
    assert 0 < props["area_ha"] < 10


@requires_qgis
def test_buffer_distance_is_real_metres_not_raw_degrees():
    """The CRS footgun the proposal calls out specifically: a 500m buffer
    must measurably grow the geometry by a sane real-world amount, not by
    500 raw EPSG:4326 degrees (which would blow past the whole planet) or
    by something that rounds to ~0 (which raw-degree buffering at this
    geometry's coordinate magnitude would risk if mishandled)."""
    from app.gis_worker import buffer

    def all_lons(geom: dict) -> list[float]:
        """Flattens every coordinate pair out of a Polygon or MultiPolygon
        geometry and returns their longitudes, regardless of nesting depth."""
        coords = geom["coordinates"]
        rings = coords if geom["type"] == "MultiPolygon" else [coords]
        return [pt[0] for polygon in rings for ring in polygon for pt in ring]

    site = SITE_CONTEXT["boundary"]
    site_fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": site}]}
    buffered = buffer(site_fc, 500, "metres")
    lons = all_lons(buffered["features"][0]["geometry"])
    # Original site spans 151.0 to 151.001 (0.001 degrees ~= 93m here) - a
    # real ~500m buffer should extend multiple times that, while staying
    # within a fraction of a degree (nowhere near "500 raw degrees").
    assert max(lons) - 151.001 > 0.003  # buffer visibly extends past the original edge
    assert max(lons) - 151.001 < 0.05   # but nothing like treating 500 as degrees


@requires_qgis
def test_reclassify_recodes_mapped_values_and_flags_unmapped():
    from app.gis_worker import reclassify

    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"PCT_ID": 686}, "geometry": {"type": "Polygon", "coordinates": [[[151.0, -33.8], [151.001, -33.8], [151.001, -33.801], [151.0, -33.801], [151.0, -33.8]]]}},
        {"type": "Feature", "properties": {"PCT_ID": 9999}, "geometry": {"type": "Polygon", "coordinates": [[[151.01, -33.8], [151.011, -33.8], [151.011, -33.801], [151.01, -33.801], [151.01, -33.8]]]}},
    ]}
    result = reclassify(fc, "PCT_ID", {"686": 3250})
    values = sorted(str(f["properties"]["PCT_ID"]) for f in result["features"])
    assert values == ["3250", "9999"]  # 686 recoded, 9999 left as-is
    assert result["_unmapped_values"] == ["9999"]


@requires_qgis
def test_merge_with_precedence_lets_overlay_win_on_overlap():
    from app.gis_worker import merge_with_precedence

    base = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"source": "base"}, "geometry": {"type": "Polygon", "coordinates": [[[151.0, -33.8], [151.002, -33.8], [151.002, -33.802], [151.0, -33.802], [151.0, -33.8]]]}},
    ]}
    overlay = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"source": "overlay"}, "geometry": {"type": "Polygon", "coordinates": [[[151.0005, -33.8005], [151.0015, -33.8005], [151.0015, -33.8015], [151.0005, -33.8015], [151.0005, -33.8005]]]}},
    ]}
    result = merge_with_precedence(base, overlay)
    sources = sorted(f["properties"]["source"] for f in result["features"])
    assert sources == ["base", "overlay"]  # overlay kept whole, base clipped to the remainder - both present


@requires_qgis
def test_calculate_area_does_not_choke_on_an_invalid_geometry():
    """Regression test for a real failure: native:difference (used inside
    merge_with_precedence, and reachable on its own via `difference`) can
    produce a self-intersecting polygon from real-world vegetation data,
    which native:exportaddgeometrycolumns then refuses to process — "Feature
    (N) ... has invalid geometry" — several operations downstream of
    whichever one actually created it. gis_worker._fix_geometries() is
    meant to repair that right where each new geometry is created, so a bad
    geometry never reaches a later operation in the same plan.

    Feeds calculate_area a deliberately self-intersecting "bowtie" polygon
    directly (not routed through difference) to isolate exactly what this
    test is checking: that calculate_area itself tolerates/repairs an
    invalid input rather than raising, independent of whichever upstream
    operation produced it."""
    from app.gis_worker import calculate_area

    bowtie = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "bowtie"}, "geometry": {
            "type": "Polygon",
            "coordinates": [[[151.0, -33.8], [151.001, -33.799], [151.001, -33.8], [151.0, -33.799], [151.0, -33.8]]],
        }},
    ]}
    result = calculate_area(bowtie, "hectares")
    assert len(result["features"]) == 1
    assert result["features"][0]["properties"]["area_ha"] > 0


@requires_qgis
def test_chat_with_mocked_ai_proposes_and_executes_a_real_plan(monkeypatch):
    """Fakes only the Anthropic API call - everything downstream (plan
    parsing, validation, real PyQGIS execution, results storage) is the
    real Phase 1 pipeline, exercised through /api/chat exactly as a real
    model response would drive it."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-key-for-test")

    class FakeBlock:
        def __init__(self, type_, **kw):
            self.type = type_
            for k, v in kw.items():
                setattr(self, k, v)

    class FakeResponse:
        def __init__(self, content):
            self.content = content

    class FakeMessages:
        def create(self, **kwargs):
            return FakeResponse([
                FakeBlock("text", text="I'll buffer the site and intersect it with the threatened ecological community layer."),
                FakeBlock("tool_use", input={
                    "explanation": "Buffered the site by 500m and intersected with TECs.",
                    "operations": [
                        {"tool": "buffer", "input": "subject_site", "distance": 500, "units": "metres", "output": "buf500"},
                        {"tool": "intersection", "input": "threatened_ecological_communities", "overlay": "buf500", "output": "communities_within_site"},
                    ],
                }),
            ])

    class FakeAnthropicClient:
        def __init__(self, **kwargs):
            self.messages = FakeMessages()

    class FakeAnthropicModule:
        Anthropic = FakeAnthropicClient

    monkeypatch.setitem(sys.modules, "anthropic", FakeAnthropicModule())

    resp = client.post("/api/chat", json={
        "messages": [{"role": "user", "content": "buffer 500m and intersect with the TEC layer"}],
        "site_context": SITE_CONTEXT,
        "layer_data": TEC_LAYER_DATA,
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["mock"] is False
    assert body["job"]["state"] == "done", body["job"]
    assert len(body["results"]["output_layers"]) == 2
    assert "Buffered the site" in body["reply"]
    assert "Done." in body["reply"]
