"""Tests for new nurse 'Scheduled Cases' endpoint & extended pending-consents endpoint.
Iteration 91 — covers /api/procedures/nurse/scheduled-cases and date/time fields on
/api/procedures/nurse/pending-consents.
"""
import os
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://implant-workflow-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
INCHARGE = {"identifier": "Abhijit.patil", "password": "Admin@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {creds['identifier']}: {r.status_code} {r.text[:300]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def nurse_token():
    return _login(NURSE)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def supervisor_token():
    return _login(SUPERVISOR)


@pytest.fixture(scope="module")
def incharge_token():
    return _login(INCHARGE)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- /procedures/nurse/scheduled-cases ----

class TestScheduledCases:
    def test_nurse_can_access(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=5", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert "cases" in data and isinstance(data["cases"], list)
        assert data.get("window_days") == 5
        assert "start_date" in data and "end_date" in data
        # start_date must be today, end_date = today+4
        today = datetime.now().date()
        assert data["start_date"] == today.strftime("%Y-%m-%d")
        assert data["end_date"] == (today + timedelta(days=4)).strftime("%Y-%m-%d")

    def test_cases_are_phase1_approved_and_in_window(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=5", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        cases = r.json()["cases"]
        today = datetime.now().date()
        window = {(today + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(5)}
        for c in cases:
            assert c["status"] == "phase1_approved", f"non-phase1_approved case: {c}"
            assert c["procedure_date"] in window, f"out-of-window date: {c['procedure_date']}"
            for key in ("id", "patient_name", "student_name", "procedure_date", "procedure_time", "implant_procedure_type"):
                assert key in c, f"missing {key} in {c}"

    def test_cases_sorted_chronologically(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=5", headers=_hdr(nurse_token), timeout=15)
        cases = r.json()["cases"]
        keys = [(c["procedure_date"] or "", c["procedure_time"] or "") for c in cases]
        assert keys == sorted(keys), f"not sorted: {keys}"

    def test_days_over_30_falls_back_to_5(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=90", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["window_days"] == 5

    def test_days_zero_falls_back_to_5(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=0", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["window_days"] == 5

    def test_student_forbidden(self, student_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases", headers=_hdr(student_token), timeout=15)
        assert r.status_code == 403, f"student got {r.status_code} — expected 403"

    def test_supervisor_allowed(self, supervisor_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases", headers=_hdr(supervisor_token), timeout=15)
        assert r.status_code == 200

    def test_incharge_allowed(self, incharge_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases", headers=_hdr(incharge_token), timeout=15)
        assert r.status_code == 200

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases", timeout=15)
        assert r.status_code in (401, 403)


# ---- /procedures/nurse/pending-consents extended ----

class TestPendingConsentsDateTime:
    def test_nurse_pending_consents_has_date_time_fields(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/pending-consents", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200, r.text[:400]
        cases = r.json().get("cases", [])
        # every case must have procedure_date and procedure_time keys (value may be empty)
        for c in cases[:20]:  # check a sample
            assert "procedure_date" in c, f"missing procedure_date in {c.get('id')}"
            assert "procedure_time" in c, f"missing procedure_time in {c.get('id')}"
