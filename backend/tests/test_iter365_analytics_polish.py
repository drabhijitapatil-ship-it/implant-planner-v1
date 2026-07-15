"""iter-365 — Analytics polish + drill + failure-analysis + KM-v2 + research CSV.

Covers:
  • procedure-drill returns retention / material / form / grid / region / time-to-loading
  • failure-analysis returns buckets + by_system/bone/region/supervisor + tooth heatmap + ISQ dist + replacement outcomes
  • kaplan-meier-v2 emits Greenwood CI (s_lo/s_hi) + log-rank when ≥ 2 groups
  • research-export.csv works and includes retention/material columns
  • Nurse blocked from all
"""
import os
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not API_URL.endswith("/api"):
    API_URL = API_URL.rstrip("/") + "/api"

ADMIN = None
STUDENT = None
NURSE = None


def _login(identifier, password):
    r = requests.post(f"{API_URL}/auth/login",
                      json={"identifier": identifier, "password": password}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def setup_module(_):
    global ADMIN, STUDENT, NURSE
    ADMIN = _login("Abhijit.patil", "Admin@123")
    STUDENT = _login("Gaurav.pandey", "Student@123")
    NURSE = _login("nurse.1@dental.edu", "Nurse@123")


def _h(t): return {"Authorization": f"Bearer {t}"}


def test_procedure_drill_shape():
    r = requests.get(f"{API_URL}/analytics/procedure-drill",
                     params={"procedure_type": "Single Conventional Implant"},
                     headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    for k in ("retentions", "materials", "forms", "regions",
             "retention_material_grid", "time_to_loading", "clinical_averages"):
        assert k in b, k
    # Each retention row has key/n/failed/survival
    for row in b["retentions"]:
        assert set(row.keys()) >= {"key", "n", "failed", "survival"}


def test_procedure_drill_missing_type_400():
    r = requests.get(f"{API_URL}/analytics/procedure-drill",
                     params={"procedure_type": ""},
                     headers=_h(ADMIN), timeout=15)
    # FastAPI treats empty as missing → 422; endpoint also raises 400 if it slips through
    assert r.status_code in (400, 422)


def test_failure_analysis_shape():
    r = requests.get(f"{API_URL}/analytics/failure-analysis", headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    for k in ("totals", "time_to_failure_buckets", "by_system", "by_bone",
              "by_region", "by_supervisor", "tooth_heatmap",
              "replacement_outcomes", "isq_distribution_by_region"):
        assert k in b, k
    keys = {x["key"] for x in b["time_to_failure_buckets"]}
    assert keys == {"early", "mid", "late"}


def test_kaplan_meier_v2_ci_bands_and_log_rank():
    r = requests.get(f"{API_URL}/analytics/kaplan-meier-v2?group_by=procedure_type",
                     headers=_h(ADMIN), timeout=15)
    assert r.status_code == 200
    b = r.json()
    assert isinstance(b["curves"], list)
    for c in b["curves"]:
        for p in c["points"]:
            # CI band keys present
            assert "s_lo" in p and "s_hi" in p
            assert 0.0 <= p["s_lo"] <= 1.0
            assert 0.0 <= p["s_hi"] <= 1.0
            assert p["s_lo"] <= p["s"] + 1e-6
            assert p["s_hi"] >= p["s"] - 1e-6
    # Log-rank only appears when there are ≥ 2 curves
    if len(b["curves"]) >= 2:
        assert b["log_rank_top2"] is None or "p_value" in b["log_rank_top2"]


def test_research_export_csv_headers_and_retention_cols():
    r = requests.get(f"{API_URL}/analytics/research-export.csv",
                     headers=_h(ADMIN), timeout=20)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    body = r.text
    # Header row must include retention + material + form + raw
    for col in ("prosthesis_retention", "prosthesis_material",
                "prosthesis_form", "prosthesis_raw",
                "insertion_torque_ncm", "isq", "status"):
        assert col in body, col
    # De-identified — no patient PII
    assert "patient_name" not in body.lower()
    assert "date_of_birth" not in body.lower()


def test_nurse_blocked_from_all_iter365():
    for url in [
        "/analytics/procedure-drill?procedure_type=Single%20Conventional%20Implant",
        "/analytics/failure-analysis",
        "/analytics/kaplan-meier-v2",
        "/analytics/research-export.csv",
    ]:
        r = requests.get(f"{API_URL}{url}", headers=_h(NURSE), timeout=15)
        assert r.status_code == 403, f"{url} did not block nurse: {r.status_code}"


def test_student_scope_on_drill_and_failure():
    for url in ["/analytics/procedure-drill?procedure_type=Single%20Conventional%20Implant",
                "/analytics/failure-analysis"]:
        r = requests.get(f"{API_URL}{url}", headers=_h(STUDENT), timeout=15)
        assert r.status_code == 200
        assert r.json()["scope"]["own_only"] is True
