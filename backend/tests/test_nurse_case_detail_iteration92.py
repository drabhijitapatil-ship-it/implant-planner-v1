"""Iteration 92 — verify nurse role can GET /api/procedures/{id} for any non-draft
status (guard previously limited to approved statuses). Also re-verify iteration-91
scheduled-cases + pending-consents contracts."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://implant-workflow-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
INCHARGE = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

KNOWN_CASE_ID = "69cfde7c356c7405230a9dbd"  # phase2 sample from prior iterations


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['identifier']} → {r.status_code} {r.text[:300]}"
    return r.json().get("access_token") or r.json().get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def nurse_token():
    return _login(NURSE)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def incharge_token():
    return _login(INCHARGE)


@pytest.fixture(scope="module")
def supervisor_token():
    return _login(SUPERVISOR)


# ---- Nurse role guard on GET /api/procedures/{id} ----

class TestNurseGetProcedure:
    def test_nurse_can_get_known_phase2_case(self, nurse_token):
        r = requests.get(f"{API}/procedures/{KNOWN_CASE_ID}", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200, f"nurse blocked from non-draft case: {r.status_code} {r.text[:300]}"
        body = r.json()
        # Must be non-draft to confirm the rule is exercised
        assert body.get("status") and body.get("status") != "draft", f"expected non-draft, got {body.get('status')}"
        assert body.get("id") == KNOWN_CASE_ID
        assert "patient_name" in body

    def test_nurse_can_get_various_statuses(self, nurse_token, supervisor_token):
        """Sample a broad set of procedures via supervisor list, then assert nurse 200 for every non-draft one."""
        r = requests.get(f"{API}/procedures", headers=_hdr(supervisor_token), timeout=15)
        assert r.status_code == 200, r.text[:300]
        procs = r.json()
        non_draft = [p for p in procs if p.get("status") and p.get("status") != "draft"]
        assert len(non_draft) > 0, "need at least one non-draft procedure in DB"
        # Sample up to 8 varied statuses
        seen_status = set()
        sample = []
        for p in non_draft:
            if p["status"] not in seen_status:
                seen_status.add(p["status"])
                sample.append(p)
            if len(sample) >= 8:
                break
        for p in sample:
            pid = p.get("id") or p.get("_id")
            r2 = requests.get(f"{API}/procedures/{pid}", headers=_hdr(nurse_token), timeout=15)
            assert r2.status_code == 200, f"nurse 200 expected for status={p['status']} id={pid}, got {r2.status_code} {r2.text[:200]}"
            assert r2.json().get("status") == p["status"]

    def test_nurse_forbidden_on_draft(self, nurse_token, student_token):
        """Create a draft via student then assert nurse gets 403."""
        # Attempt list; pick an existing draft if any (student sees own drafts)
        r = requests.get(f"{API}/procedures", headers=_hdr(student_token), timeout=15)
        assert r.status_code == 200
        drafts = [p for p in r.json() if p.get("status") == "draft"]
        if not drafts:
            pytest.skip("no draft cases available to test 403 nurse guard")
        pid = drafts[0].get("id") or drafts[0].get("_id")
        r2 = requests.get(f"{API}/procedures/{pid}", headers=_hdr(nurse_token), timeout=15)
        assert r2.status_code == 403, f"draft guard should return 403 for nurse, got {r2.status_code}"


# ---- Iteration-91 regression re-check ----

class TestIter91Regression:
    def test_scheduled_cases_contract(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=5", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "cases" in data and isinstance(data["cases"], list)
        assert data.get("window_days") == 5

    def test_pending_consents_has_date_time(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/pending-consents", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        cases = r.json().get("cases", [])
        for c in cases[:10]:
            assert "procedure_date" in c
            assert "procedure_time" in c
