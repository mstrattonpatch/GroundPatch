"""
Contract tests against the scaffold's mocked responses — no QGIS environment
needed (see README.md). These assert the *shape* of every endpoint from the
proposal's table (status codes, response fields), not any real GIS result,
since there isn't one yet. Re-running these once gis_worker.py grows a real
implementation should still pass for the "rejects a bad plan" cases, and
should be extended (not replaced) to also assert real computed geometry.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SITE_CONTEXT = {
    "boundary": {
        "type": "Polygon",
        "coordinates": [[[151.0, -33.8], [151.01, -33.8], [151.01, -33.81], [151.0, -33.81], [151.0, -33.8]]],
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


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_ai_plan_returns_mock_plan():
    resp = client.post("/api/ai/plan", json={"request": "buffer and intersect", "site_context": SITE_CONTEXT})
    assert resp.status_code == 200
    body = resp.json()
    assert body["mock"] is True
    assert len(body["plan"]["operations"]) == 3
    assert body["plan"]["operations"][0]["tool"] == "buffer"


def test_create_job_with_valid_plan_fails_on_execution_not_error_on_validation():
    """A structurally/semantically valid plan should pass validation — the
    job then errors because there's no worker yet, but the error message
    must be the "not implemented" one, not a validation complaint, or
    validator.py and gis_worker.py have drifted out of sync with each other."""
    resp = client.post("/api/jobs", json={"plan": VALID_PLAN, "site_context": SITE_CONTEXT})
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "error"
    assert any("not implemented" in e for e in body["errors"])


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


def test_create_job_rejects_unknown_input_reference():
    plan = {"operations": [{"tool": "buffer", "input": "a_layer_that_does_not_exist", "distance": 500, "units": "metres", "output": "x"}]}
    resp = client.post("/api/jobs", json={"plan": plan, "site_context": SITE_CONTEXT})
    body = resp.json()
    assert body["state"] == "error"
    assert any("is not a known site-context layer" in e for e in body["errors"])


def test_job_lifecycle_and_mocked_downstream_endpoints():
    create = client.post("/api/jobs", json={"plan": VALID_PLAN, "site_context": SITE_CONTEXT})
    job_id = create.json()["job_id"]

    status = client.get(f"/api/jobs/{job_id}")
    assert status.status_code == 200
    assert status.json()["job_id"] == job_id

    results = client.get(f"/api/jobs/{job_id}/results")
    assert results.status_code == 200
    assert results.json()["mock"] is True
    assert isinstance(results.json()["output_layers"], list)

    layer = client.get(f"/api/jobs/{job_id}/layers/communities_within_site")
    assert layer.status_code == 200
    assert layer.json()["geojson"]["type"] == "FeatureCollection"

    project = client.get(f"/api/jobs/{job_id}/project")
    assert project.status_code == 200
    assert project.headers["content-type"] == "application/zip"
    assert "attachment" in project.headers["content-disposition"]
    assert len(project.content) > 0


def test_unknown_job_id_404s_on_every_job_scoped_endpoint():
    for suffix in ("", "/results", "/layers/foo", "/project"):
        resp = client.get(f"/api/jobs/does-not-exist{suffix}")
        assert resp.status_code == 404, f"expected 404 for /api/jobs/does-not-exist{suffix}, got {resp.status_code}"
