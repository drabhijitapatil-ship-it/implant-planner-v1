"""Iteration 94 — Nurse workflow overhaul: GET /api/procedures/nurse/consent-cases."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://implant-workflow-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "nurse": {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"},
    "student": {"identifier": "Gaurav.pandey", "password": "Student@123"},
    "supervisor": {"identifier": "Paresh.gandhi", "password": "Supervisor@123"},
    "incharge": {"identifier": "Abhijit.patil", "password": "Admin@123"},
}


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {role: _login(c["identifier"], c["password"]) for role, c in CREDS.items()}


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# -- Core contract test --
def test_nurse_consent_cases_nurse_200(tokens):
    r = requests.get(f"{API}/procedures/nurse/consent-cases", headers=_hdr(tokens["nurse"]), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "cases" in data and "completed_count" in data and "pending_count" in data
    assert isinstance(data["cases"], list)
    assert isinstance(data["completed_count"], int)
    assert isinstance(data["pending_count"], int)

    # Count invariants
    completed = [c for c in data["cases"] if c["consent_uploaded"] is True]
    pending = [c for c in data["cases"] if c["consent_uploaded"] is False]
    assert len(completed) == data["completed_count"]
    assert len(pending) == data["pending_count"]
    assert data["completed_count"] + data["pending_count"] == len(data["cases"])

    # Required fields per case
    required = {"id", "patient_name", "student_name", "procedure_date", "procedure_time",
                "implant_procedure_type", "status", "consent_uploaded", "instruments_autoclaved"}
    for c in data["cases"]:
        missing = required - set(c.keys())
        assert not missing, f"missing fields {missing} in {c}"
        assert isinstance(c["consent_uploaded"], bool)
        assert c["instruments_autoclaved"] is None or isinstance(c["instruments_autoclaved"], dict)

    # Sorted by (procedure_date, procedure_time) ascending
    keys = [(c["procedure_date"] or "", c["procedure_time"] or "") for c in data["cases"]]
    assert keys == sorted(keys), "cases not sorted by procedure_date+time"

    # Excludes draft and rejected
    for c in data["cases"]:
        assert c["status"] not in ("draft", "rejected"), f"excluded status leaked: {c['status']}"


def test_nurse_consent_cases_student_forbidden(tokens):
    r = requests.get(f"{API}/procedures/nurse/consent-cases", headers=_hdr(tokens["student"]), timeout=20)
    assert r.status_code == 403, r.text


def test_nurse_consent_cases_supervisor_200(tokens):
    r = requests.get(f"{API}/procedures/nurse/consent-cases", headers=_hdr(tokens["supervisor"]), timeout=20)
    assert r.status_code == 200
    assert "cases" in r.json()


def test_nurse_consent_cases_incharge_200(tokens):
    r = requests.get(f"{API}/procedures/nurse/consent-cases", headers=_hdr(tokens["incharge"]), timeout=20)
    assert r.status_code == 200
    assert "cases" in r.json()


def test_nurse_consent_cases_unauthenticated():
    r = requests.get(f"{API}/procedures/nurse/consent-cases", timeout=20)
    assert r.status_code in (401, 403)
