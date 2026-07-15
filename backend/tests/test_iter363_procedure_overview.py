"""iter-363 — Procedure-Type Analytics (Phase Analytics-1) backend regression.

Validates:
  1. /api/analytics/procedure-overview responds 200 with the expected shape
     for an implant_incharge login.
  2. Role scoping — a student sees only their own cases + a `cohort` block
     with anonymised medians.
  3. Nurse is denied (403).
  4. Granularity toggle (yearly) returns yearly period keys.
  5. Procedure-type filter narrows the by_procedure_type list.
  6. CSV export returns text/csv and contains the expected section headers.
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


def test_procedure_overview_incharge_ok():
    tok = _login("Abhijit.patil", "Admin@123")
    r = requests.get(f"{API_URL}/analytics/procedure-overview", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"]["role"] in ("implant_incharge", "administrator")
    assert body["scope"]["own_only"] is False
    assert set(body["kpis"].keys()) >= {
        "total_cases", "completed", "terminated", "rejected",
        "in_progress", "draft", "success_rate",
        "mean_lifecycle_days", "median_lifecycle_days",
    }
    assert isinstance(body["by_procedure_type"], list)
    assert isinstance(body["prosthesis_mix"], list)
    assert isinstance(body["trend"], list)
    # In-Charge must not receive the cohort block
    assert "cohort" not in body


def test_procedure_overview_student_gets_cohort():
    tok = _login("Gaurav.pandey", "Student@123")
    r = requests.get(f"{API_URL}/analytics/procedure-overview", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scope"]["role"] == "student"
    assert body["scope"]["own_only"] is True
    assert "cohort" in body
    cohort = body["cohort"]
    assert set(cohort.keys()) == {"student_count", "success_rate_median", "lifecycle_days_median"}
    assert isinstance(cohort["student_count"], int)


def test_procedure_overview_nurse_denied():
    tok = _login("nurse.1@dental.edu", "Nurse@123")
    r = requests.get(f"{API_URL}/analytics/procedure-overview", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 403


def test_procedure_overview_yearly_granularity():
    tok = _login("Abhijit.patil", "Admin@123")
    r = requests.get(
        f"{API_URL}/analytics/procedure-overview",
        params={"granularity": "yearly"},
        headers={"Authorization": f"Bearer {tok}"}, timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["filters"]["granularity"] == "yearly"
    for row in body["trend"]:
        # Yearly period keys must be exactly 4 digits
        assert len(row["period"]) == 4 and row["period"].isdigit(), row


def test_procedure_overview_type_filter_narrows_rows():
    tok = _login("Abhijit.patil", "Admin@123")
    # Full universe first
    full = requests.get(f"{API_URL}/analytics/procedure-overview", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
    if not full["by_procedure_type"]:
        return  # empty DB — nothing to assert
    target = full["by_procedure_type"][0]["procedure_type"]
    filtered = requests.get(
        f"{API_URL}/analytics/procedure-overview",
        params={"procedure_type": target},
        headers={"Authorization": f"Bearer {tok}"}, timeout=15,
    ).json()
    assert all(r["procedure_type"] == target for r in filtered["by_procedure_type"])
    assert filtered["filters"]["procedure_types"] == [target]


def test_procedure_overview_csv_export():
    tok = _login("Abhijit.patil", "Admin@123")
    r = requests.get(
        f"{API_URL}/analytics/procedure-overview/export.csv",
        headers={"Authorization": f"Bearer {tok}"}, timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("text/csv")
    body = r.text
    for section in ("## KPIs", "## By Procedure Type", "## Prosthesis Mix", "## Trend"):
        assert section in body, section
    # De-identified — no patient PII markers should be present in headers/section names
    assert "Patient Name" not in body
    assert "Date of Birth" not in body
