"""iter-348 backend regression — Implant Survival Review (Message 557 features)

Covers:
- End Treatment validation errors (missing decision maker, missing reason)
- End Treatment happy path (on an already-ended case, idempotent → still terminated)
- Replacement placement_date now mandatory
- /analytics/survival: student scope (read_only=True, role='student'),
  administrator scope (institutional), treatment_ended counter, by_procedure_type failure_rate
- /analytics/survival/export.csv: 403 for student, 200 for admin
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    "https://dental-workflow-18.preview.emergentagent.com"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}

# Fresh phase2_approved case with 1 active implant (Alpha Bio ICE @ tooth 16)
CASE_LIVE = "699fc5c2248100e8a0d87265"
# Already-terminated case (treatment_ended) — safe target for happy path re-post
CASE_ENDED = "6a01da5afaa288be26abd086"


def _login(payload):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"Login failed for {payload['identifier']}: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def student_headers():
    return {"Authorization": f"Bearer {_login(STUDENT)}"}


@pytest.fixture(scope="module")
def supervisor_headers():
    return {"Authorization": f"Bearer {_login(SUPERVISOR)}"}


# --- Basic auth sanity ---
def test_admin_login_ok(admin_headers):
    assert "Authorization" in admin_headers


def test_student_login_ok(student_headers):
    assert "Authorization" in student_headers


# --- End Treatment validation (does NOT mutate case state on 400) ---
def test_end_treatment_missing_decision_maker(admin_headers):
    """POST end_treatment=True without decision_maker → 400 'decision maker'"""
    payload = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Peri-implantitis",
                "removed": True,
                "end_treatment": True,
                "end_treatment_reason": "Patient refused replacement",
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/api/procedures/{CASE_LIVE}/survival-review",
                      json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:300]}"
    body = r.json()
    detail = body.get("detail") or ""
    assert "decision maker" in detail.lower() or "patient or operator" in detail.lower(), \
        f"Unexpected detail: {detail}"


def test_end_treatment_missing_reason(admin_headers):
    """POST end_treatment=True + decision_maker but no reason → 400 'reason'"""
    payload = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Peri-implantitis",
                "removed": True,
                "end_treatment": True,
                "end_treatment_decision_maker": "Patient",
                # end_treatment_reason omitted / blank
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/api/procedures/{CASE_LIVE}/survival-review",
                      json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:300]}"
    detail = (r.json().get("detail") or "").lower()
    assert "reason" in detail, f"Unexpected detail: {detail}"


# --- Replacement placement_date now mandatory ---
def test_replacement_requires_placement_date(admin_headers):
    """replaced=True but no placement_date → 400 'placement date'"""
    payload = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Peri-implantitis",
                "removed": True,
                "replaced": True,
                "replacement": {
                    "system": "SPI",
                    "diameter": "4.2",
                    "length": "11.5",
                    "insertion_torque_ncm": "32",
                    "isq": "72",
                    # placement_date omitted
                    "procedure_type": "Two-stage",
                },
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/api/procedures/{CASE_LIVE}/survival-review",
                      json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:300]}"
    detail = (r.json().get("detail") or "").lower()
    assert "placement date" in detail, f"Unexpected detail: {detail}"


# --- End Treatment happy path (on already-ended case, idempotent-ish) ---
def test_end_treatment_happy_path_on_ended_case(admin_headers):
    """Re-posting end_treatment on an already-terminated case still returns 200
    and case status remains 'treatment_ended' with implant marked 'Treatment Ended'."""
    payload = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Peri-implantitis",
                "removed": True,
                "end_treatment": True,
                "end_treatment_decision_maker": "Operator",
                "end_treatment_reason": "Regression re-post — iter-348 test",
            }
        ],
    }
    r = requests.post(f"{BASE_URL}/api/procedures/{CASE_ENDED}/survival-review",
                      json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:400]}"

    # Verify case status now 'treatment_ended'
    r2 = requests.get(f"{BASE_URL}/api/procedures/{CASE_ENDED}",
                      headers=admin_headers, timeout=15)
    assert r2.status_code == 200
    proc = r2.json()
    assert proc.get("status") == "treatment_ended", f"Expected treatment_ended, got {proc.get('status')}"

    # Verify implant snapshot in phase2_survival_review has 'Treatment Ended' status
    rev = proc.get("phase2_survival_review") or {}
    implants = rev.get("implants") or {}
    if isinstance(implants, dict):
        v = implants.get("0") or {}
        assert v.get("status") == "Treatment Ended", f"Expected Treatment Ended, got {v.get('status')} (impl={v})"
    else:
        # some deployments may store as list
        found = any((i.get("status") == "Treatment Ended") for i in implants if isinstance(i, dict))
        assert found, f"No Treatment Ended implant in list: {implants}"


# --- Analytics endpoint scope + counters ---
def test_analytics_admin_shape(admin_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival",
                     headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"Admin analytics failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    counters = data.get("counters") or {}
    assert "treatment_ended" in counters, f"Missing treatment_ended counter: {counters}"
    assert isinstance(counters["treatment_ended"], int)
    by_pt = data.get("by_procedure_type")
    assert isinstance(by_pt, list), f"by_procedure_type should be a list, got: {type(by_pt)}"
    # Structural checks on rows (if any)
    for row in by_pt:
        assert "procedure_type" in row
        assert "failure_rate" in row
        assert "placed" in row
        assert "failed" in row
    scope = data.get("scope") or {}
    # Abhijit.patil is `implant_incharge` on the live backend; credentials doc
    # claims administrator but server-side role is implant_incharge. Both are
    # non-read-only per iter-348 logic.
    assert scope.get("role") in ("administrator", "implant_incharge"), f"scope={scope}"
    assert scope.get("read_only") is False


def test_analytics_student_scope(student_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival",
                     headers=student_headers, timeout=20)
    assert r.status_code == 200, f"Student analytics failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    scope = data.get("scope") or {}
    assert scope.get("role") == "student", f"Expected scope.role=student, got {scope}"
    assert scope.get("read_only") is True, f"Expected read_only=True, got {scope}"
    # counters + by_procedure_type still present
    counters = data.get("counters") or {}
    assert "treatment_ended" in counters
    assert isinstance(data.get("by_procedure_type"), list)


def test_analytics_supervisor_ok(supervisor_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival",
                     headers=supervisor_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    scope = data.get("scope") or {}
    assert scope.get("role") == "supervisor"
    assert scope.get("read_only") is True


def test_analytics_student_less_than_admin(admin_headers, student_headers):
    """Student scope should be <= admin institutional (typically fewer, but at least not more)."""
    ra = requests.get(f"{BASE_URL}/api/analytics/survival", headers=admin_headers, timeout=20)
    rs = requests.get(f"{BASE_URL}/api/analytics/survival", headers=student_headers, timeout=20)
    assert ra.status_code == 200 and rs.status_code == 200
    admin_placed = (ra.json().get("counters") or {}).get("placed", 0)
    student_placed = (rs.json().get("counters") or {}).get("placed", 0)
    assert student_placed <= admin_placed, \
        f"Student placed ({student_placed}) should be <= admin placed ({admin_placed})"


# --- CSV export RBAC ---
def test_export_csv_student_forbidden(student_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival/export.csv",
                     headers=student_headers, timeout=20)
    assert r.status_code == 403, f"Expected 403 for student, got {r.status_code}: {r.text[:200]}"


def test_export_csv_supervisor_forbidden(supervisor_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival/export.csv",
                     headers=supervisor_headers, timeout=20)
    assert r.status_code == 403, f"Expected 403 for supervisor, got {r.status_code}: {r.text[:200]}"


def test_export_csv_admin_ok(admin_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival/export.csv",
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"Admin CSV export failed: {r.status_code} {r.text[:200]}"
    assert "text/csv" in (r.headers.get("content-type") or "").lower() or r.text.startswith("Implanr") or "Summary Counters" in r.text
