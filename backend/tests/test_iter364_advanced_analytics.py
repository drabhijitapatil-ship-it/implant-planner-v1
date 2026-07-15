"""iter-364 — Phase Analytics-2 + Phase Analytics-3 backend regression.

Validates every advanced-analytics endpoint returns 200 with the expected
shape for an implant_incharge login, and enforces role gating:
  • Kaplan-Meier survival curves
  • Torque × ISQ scatter
  • Bone × Procedure × Outcome heatmap
  • Cross-tab builder
  • Learning curve
  • Case-Mix Index
  • Complications pareto
  • Benchmarks vs literature
  • Predictive-risk nudge
  • Research JSON export (de-identified)
"""
import os
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not API_URL.endswith("/api"):
    API_URL = API_URL.rstrip("/") + "/api"


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API_URL}/auth/login", json={"identifier": identifier, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


ADMIN = None
STUDENT = None
NURSE = None


def setup_module(_module):
    global ADMIN, STUDENT, NURSE
    ADMIN = _login("Abhijit.patil", "Admin@123")
    STUDENT = _login("Gaurav.pandey", "Student@123")
    NURSE = _login("nurse.1@dental.edu", "Nurse@123")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_kaplan_meier_ok_and_shape():
    r = requests.get(f"{API_URL}/analytics/kaplan-meier?group_by=procedure_type", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["group_by"] == "procedure_type"
    assert isinstance(body["curves"], list)
    for c in body["curves"]:
        assert {"key", "n_implants", "n_events", "points", "final_survival"} <= set(c.keys())
        assert c["points"][0]["t"] == 0 and c["points"][0]["s"] == 1.0


def test_kaplan_meier_system_group():
    r = requests.get(f"{API_URL}/analytics/kaplan-meier?group_by=system", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    assert r.json()["group_by"] == "system"


def test_torque_isq_scatter_ok():
    r = requests.get(f"{API_URL}/analytics/torque-isq-scatter", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "points" in body and "sweet_spot" in body


def test_bone_heatmap_ok():
    r = requests.get(f"{API_URL}/analytics/bone-procedure-heatmap", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert set(body["bones"]) >= {"D1", "D2", "D3", "D4", "Unknown"}
    assert isinstance(body["procedure_types"], list)
    assert len(body["matrix"]) == 5


def test_cross_tab_bad_dim_400():
    r = requests.post(f"{API_URL}/analytics/cross-tab",
                      headers=_h(ADMIN),
                      json={"row_dim": "not_a_thing", "metric": "count"},
                      timeout=15)
    assert r.status_code == 400


def test_cross_tab_success_rate():
    r = requests.post(f"{API_URL}/analytics/cross-tab",
                      headers=_h(ADMIN),
                      json={"row_dim": "bone_type", "col_dim": "procedure_type", "metric": "success_rate"},
                      timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["metric"] == "success_rate"
    assert body["row_dim"] == "bone_type"
    for row in body["grid"]:
        for cell in row["cells"]:
            assert cell["value"] is None or (0.0 <= cell["value"] <= 100.0)


def test_learning_curve_student_self():
    r = requests.get(f"{API_URL}/analytics/learning-curve", headers=_h(STUDENT), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["series"], list)
    # Running rate should be monotonically defined
    for row in body["series"]:
        assert {"case_no", "date", "procedure_type", "status_bucket", "running_success_rate"} <= set(row.keys())


def test_learning_curve_faculty_requires_id():
    r = requests.get(f"{API_URL}/analytics/learning-curve", headers=_h(ADMIN), timeout=15)
    # In-charge without student_id → 400
    assert r.status_code == 400


def test_case_mix_index_faculty_only():
    r_admin = requests.get(f"{API_URL}/analytics/case-mix-index?scope=students", headers=_h(ADMIN), timeout=15)
    assert r_admin.status_code == 200
    body = r_admin.json()
    assert set(body.keys()) >= {"scope", "rows", "weights"}

    r_student = requests.get(f"{API_URL}/analytics/case-mix-index?scope=students", headers=_h(STUDENT), timeout=15)
    assert r_student.status_code == 403


def test_complications_pareto_ok():
    r = requests.get(f"{API_URL}/analytics/complications", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "pareto" in body and "by_procedure_type" in body
    # cum_pct must be monotonically non-decreasing
    prev = 0.0
    for row in body["pareto"]:
        if row["cum_pct"] is None:
            continue
        assert row["cum_pct"] >= prev - 0.001
        prev = row["cum_pct"]


def test_benchmarks_ok():
    r = requests.get(f"{API_URL}/analytics/benchmarks", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["rows"], list) and len(body["rows"]) >= 4
    for row in body["rows"]:
        assert {"procedure_type", "your_n", "your_survival",
                "literature_low", "literature_high", "citation", "verdict"} <= set(row.keys())


def test_predictive_risk_nudge():
    r = requests.post(f"{API_URL}/analytics/predictive-risk",
                      headers=_h(ADMIN),
                      json={"procedure_type": "Single Conventional Implant",
                            "bone_type": "D2", "tooth_region": "posterior_max"},
                      timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "nudge" in body and body["nudge"]
    for k in ("base", "bone_match", "region_match", "combined_match"):
        assert k in body


def test_research_export_json_de_identified():
    r = requests.get(f"{API_URL}/analytics/research-export.json", headers=_h(ADMIN), timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["n_rows"] == len(body["rows"])
    assert isinstance(body["data_dictionary"], list)
    # Must not leak PII
    text = str(body)
    for pii_field in ("patient_name", "date_of_birth", "phone", "email", "registration_number"):
        assert pii_field not in text.lower(), pii_field


def test_nurse_blocked_from_all_advanced():
    endpoints = [
        "/analytics/kaplan-meier",
        "/analytics/torque-isq-scatter",
        "/analytics/bone-procedure-heatmap",
        "/analytics/learning-curve",
        "/analytics/case-mix-index",
        "/analytics/complications",
        "/analytics/benchmarks",
        "/analytics/research-export.json",
    ]
    for ep in endpoints:
        r = requests.get(f"{API_URL}{ep}", headers=_h(NURSE), timeout=15)
        assert r.status_code == 403, f"{ep} did not block nurse: {r.status_code}"
    # POSTs
    for ep, body in [
        ("/analytics/cross-tab", {"row_dim": "procedure_type", "metric": "count"}),
        ("/analytics/predictive-risk", {"procedure_type": "Single Conventional Implant"}),
    ]:
        r = requests.post(f"{API_URL}{ep}", headers=_h(NURSE), json=body, timeout=15)
        assert r.status_code == 403, f"{ep} did not block nurse: {r.status_code}"
