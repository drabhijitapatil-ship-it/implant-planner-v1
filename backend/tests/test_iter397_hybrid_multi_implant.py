"""iter-397 — Hybrid multi-implant mechanism.

Validates:
  * GET /api/procedures/patient-lookup    (role gating, case-insensitive match,
    drafts/archived excluded, latest_case_id resolves to most recent doc).
  * GET /api/procedures/{id}/patient-history (includes current case even if draft;
    is_current flag correctly set).
  * POST /api/procedures + POST /api/procedures/augmentation-case persist
    linked_parent_case_id.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}

EXISTING_REG = "P2AUG-UI-1"
EXISTING_CASE_ID = "6a6b7fbf6633443cf356df15"
SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
INCHARGE_ID = "69b79407a17f36c024eb2d5e"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def nurse_headers():
    return {"Authorization": f"Bearer {_login(NURSE)}"}


# ---------- patient-lookup ----------
class TestPatientLookup:
    def test_found_returns_full_payload(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/patient-lookup",
            params={"registration_number": EXISTING_REG},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["found"] is True
        assert d["patient"]["patient_name"] == "P2 Aug UI Patient"
        for key in ("patient_name", "age", "sex", "profession", "mobile_number",
                    "patient_email", "medical_assessment", "medical_risk_level"):
            assert key in d["patient"]
        assert isinstance(d["cases"], list) and len(d["cases"]) >= 1
        assert d["latest_case_id"] == d["cases"][-1]["id"]
        for c in d["cases"]:
            assert c["status"] != "draft"

    def test_case_insensitive(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/patient-lookup",
            params={"registration_number": EXISTING_REG.lower()},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["found"] is True

    def test_unknown_reg_returns_not_found(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/patient-lookup",
            params={"registration_number": "TEST_DEFINITELY_NOT_A_PATIENT_ZZZ"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d == {"found": False, "patient": None, "cases": []}

    def test_empty_reg_returns_not_found(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/patient-lookup",
            params={"registration_number": ""},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["found"] is False

    def test_nurse_forbidden(self, nurse_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/patient-lookup",
            params={"registration_number": EXISTING_REG},
            headers=nurse_headers, timeout=15,
        )
        assert r.status_code == 403


# ---------- patient-history ----------
class TestPatientHistory:
    def test_history_for_existing_case(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{EXISTING_CASE_ID}/patient-history",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        cases = r.json()["cases"]
        assert len(cases) >= 1
        current = [c for c in cases if c["is_current"]]
        assert len(current) == 1
        assert current[0]["id"] == EXISTING_CASE_ID

    def test_history_404_for_unknown_id(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/procedures/000000000000000000000000/patient-history",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 404


# ---------- linked_parent_case_id persistence ----------
class TestLinkedParentCase:
    _created_ids: list = []

    def _base_procedure_payload(self):
        return {
            "patient_name": "TEST_LinkPatient",
            "age": "48",
            "sex": "Male",
            "registration_number": EXISTING_REG,
            "chief_complaint": "TEST iter397 link",
            "implant_procedure_type": "Single Conventional Implant",
            "missing_teeth": ["27"],
            "loading_type": ["Delayed Loading"],
            "periodontal_status": "Healthy",
            "surgical_approach": "Free Hand",
            "supervisor_id": SUPERVISOR_ID,
            "supervisor_name": "Dr. Paresh Gandhi",
            "implant_incharge_id": INCHARGE_ID,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "TEST_L397A",
            "amount_paid": 1000,
            "procedure_date": "2026-12-08",
            "procedure_time": "10:00",
            "augmentation_required": False,
            "linked_parent_case_id": EXISTING_CASE_ID,
        }

    def test_procedures_persists_linked_parent(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/procedures", json=self._base_procedure_payload(),
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        self._created_ids.append(pid)
        # GET to confirm persistence
        g = requests.get(f"{BASE_URL}/api/procedures/{pid}", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        assert g.json().get("linked_parent_case_id") == EXISTING_CASE_ID

    def test_augmentation_case_persists_linked_parent(self, admin_headers):
        body = {
            "patient_name": "TEST_LinkAugPatient",
            "registration_number": EXISTING_REG,
            "supervisor_id": SUPERVISOR_ID,
            "supervisor_name": "Dr. Paresh Gandhi",
            "implant_incharge_id": INCHARGE_ID,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "TEST_L397B",
            "amount_paid": 500,
            "procedure_date": "2026-12-09",
            "procedure_time": "10:00",
            "linked_parent_case_id": EXISTING_CASE_ID,
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/augmentation-case", json=body,
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        self._created_ids.append(pid)
        g = requests.get(f"{BASE_URL}/api/procedures/{pid}", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        d = g.json()
        assert d.get("linked_parent_case_id") == EXISTING_CASE_ID
        assert d.get("augmentation_required") is True

    def test_zzz_cleanup(self, admin_headers):
        for pid in self._created_ids:
            requests.delete(f"{BASE_URL}/api/procedures/{pid}", headers=admin_headers, timeout=15)
