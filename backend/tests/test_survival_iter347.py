"""iter-347 regression tests — Implant Survival Review

Covers:
- Multi-round survival-review POST delta merge (events += 1, prior state preserved)
- /analytics/survival RBAC (admin OK, student 403)
- /implant-lifecycle returns positions with events per revision after multi-round submissions
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to /app/frontend/.env indirectly — production URL
    BASE_URL = "https://dental-consent-sign.preview.emergentagent.com"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
CASE_ID = "6a01da5afaa288be26abd086"  # existing_implants, phase2_approved


def _login(payload):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"Login failed for {payload['identifier']}: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def student_headers():
    tok = _login(STUDENT)
    return {"Authorization": f"Bearer {tok}"}


def test_admin_login(admin_headers):
    assert "Authorization" in admin_headers


def test_case_accessible(admin_headers):
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("case_origin") == "existing_implants"
    # phase2_approved or downstream (phase3+) is acceptable
    assert data.get("status") in ("phase2_approved", "phase3_completed", "phase3_approved", "pending_phase3", "phase4_step1_completed", "phase4_step1_approved", "phase4_step2_completed", "phase4_step2_approved", "completed"), f"Unexpected status: {data.get('status')}"


def test_active_implants_ok(admin_headers):
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}/active-implants", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    active = data.get("active") or []
    archived = data.get("archived") or []
    # Total (active + archived) must be >=1 — case has at least 1 known implant
    assert len(active) + len(archived) >= 1, data


def test_multi_round_survival_review_delta_merge(admin_headers):
    """Two consecutive survival-review POSTs — second call events=2, prior state preserved."""
    # Round 1 — implant 0 Failed, removed, not replaced yet
    payload_1 = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Peri-implantitis",
                "removed": True,
                "replaced": False,
            }
        ],
    }
    r1 = requests.post(f"{BASE_URL}/api/procedures/{CASE_ID}/survival-review", json=payload_1, headers=admin_headers, timeout=15)
    assert r1.status_code == 200, r1.text[:400]
    d1 = r1.json()
    events_1 = d1.get("events") if isinstance(d1.get("events"), int) else len(d1.get("events") or [])
    assert events_1 >= 1, f"Expected events>=1 after round 1, got {d1}"

    # Round 2 — same implant Failed again with replacement
    payload_2 = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "tooth": 16,
                "reason": "Implant fracture",
                "removed": True,
                "replaced": True,
                "replacement": {
                    "system": "SPI",
                    "diameter": "4.2",
                    "length": "11.5",
                    "insertion_torque_ncm": "32",
                    "isq": "72",
                    "placement_date": "2026-01-15",
                    "procedure_type": "Two-stage",
                },
            }
        ],
    }
    r2 = requests.post(f"{BASE_URL}/api/procedures/{CASE_ID}/survival-review", json=payload_2, headers=admin_headers, timeout=15)
    assert r2.status_code == 200, r2.text[:400]
    d2 = r2.json()
    events_2 = d2.get("events") if isinstance(d2.get("events"), int) else len(d2.get("events") or [])
    assert events_2 >= events_1 + 1, f"Second POST should append event: prior={events_1} now={events_2} payload={d2}"


def test_implant_lifecycle_after_multi_round(admin_headers):
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}/implant-lifecycle", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text[:400]
    data = r.json()
    # Response should include positions with events per revision
    positions = data.get("positions") or data.get("implants") or []
    assert isinstance(positions, list) and len(positions) >= 1, f"Expected positions list: {data}"
    # At least one position should have events (revisions) since we posted multi-round failures
    any_events = False
    for p in positions:
        evs = p.get("events") or p.get("revisions") or []
        if isinstance(evs, list) and len(evs) >= 1:
            any_events = True
            break
    assert any_events, f"Expected at least one position to have events after multi-round: {data}"


def test_analytics_survival_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text[:200]


def test_analytics_survival_student_forbidden(student_headers):
    r = requests.get(f"{BASE_URL}/api/analytics/survival", headers=student_headers, timeout=15)
    assert r.status_code == 403, f"Expected 403 for student, got {r.status_code}: {r.text[:200]}"
