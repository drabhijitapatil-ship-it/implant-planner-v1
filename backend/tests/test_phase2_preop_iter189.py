"""
iter-189 backend regression — Pre-Surgical Checklist (Phase 2 split)

Coverage:
  * POST /api/procedures/{id}/phase2-preop
      - 403 for non-allowed role (nurse)
      - 400 missing mandatory items (lists them in detail)
      - 200 happy path stamps procedure (verified via GET)
      - idempotent re-submission overwrites timestamp & completed_by
  * POST /api/procedures/{id}/submit-phase2
      - 400 if phase2_preop_completed_at is null (Pre-Op gate)
      - 200 once preop is stamped (existing happy path)
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

PROCEDURE_ID = "69f640160ae04a75cf8d0cd8"  # phase1_approved test case (TEST_MUA_88c4430c)

MANDATORY_ITEMS = [
    "patient_id_consent_verified", "vitals_ok", "preop_chx_rinse",
    "imaging_chairside", "drilling_sequence_ready", "implant_verified",
    "drilling_kit_sterile", "physiodispenser_ready", "instruments_autoclaved",
    "saline_irrigation", "aseptic_field_draped", "suction_tested", "team_briefed",
]
OPTIONAL_ITEMS = [
    "allergies_meds_reviewed", "preop_antibiotic", "surgical_guide_fit",
    "healing_abutment_available", "multiunit_abutments_available",
    "bone_graft_membrane", "sutures_ready", "emergency_drugs",
]


# ---------- Fixtures ----------
def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"identifier": identifier, "password": password},
                      timeout=30)
    assert r.status_code == 200, f"Login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def student_token():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def supervisor_token():
    return _login("Paresh.gandhi", "Supervisor@123")


@pytest.fixture(scope="module")
def incharge_token():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def nurse_token():
    return _login("Nurse.1", "Nurse@123")


@pytest.fixture(scope="module")
def mongo_db():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(autouse=True)
def reset_preop_stamp(mongo_db):
    """Before EACH test, clear the preop stamp + ensure status is phase1_approved."""
    mongo_db.procedures.update_one(
        {"_id": ObjectId(PROCEDURE_ID)},
        {"$set": {
            "status": "phase1_approved",
            "phase2_preop_checklist": None,
            "phase2_preop_notes": None,
            "phase2_preop_completed_at": None,
            "phase2_preop_completed_by": None,
            "phase2_preop_completed_by_name": None,
            "phase2_preop_completed_by_role": None,
        }},
    )
    yield


def _all_mandatory_true():
    return {k: True for k in MANDATORY_ITEMS}


# ============================================================================
# /procedures/{id}/phase2-preop tests
# ============================================================================
class TestPhase2PreOp:

    def test_unauthorised_role_returns_403(self, nurse_token):
        """Nurse is not student-owner / supervisor-owner / incharge / creator -> 403."""
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {nurse_token}"},
            json={"items": _all_mandatory_true(), "notes": "TEST_unauth"},
            timeout=30,
        )
        assert r.status_code == 403, f"Expected 403 for nurse, got {r.status_code}: {r.text}"
        body = r.json()
        assert "permission" in (body.get("detail") or body.get("error") or "").lower()

    def test_wrong_status_returns_400(self, student_token, mongo_db):
        """If status != phase1_approved -> 400."""
        # Force a different status; reset fixture will restore after.
        mongo_db.procedures.update_one(
            {"_id": ObjectId(PROCEDURE_ID)},
            {"$set": {"status": "draft"}},
        )
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": _all_mandatory_true()},
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400 wrong status, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "phase 1" in detail or "approved" in detail

    def test_missing_mandatory_returns_400_with_detail(self, student_token):
        """Omitting some mandatory items -> 400 listing the missing ids."""
        partial = {k: True for k in MANDATORY_ITEMS[:-3]}  # drop last 3 mandatory
        omitted = MANDATORY_ITEMS[-3:]
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": partial},
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "mandatory" in detail
        for k in omitted:
            assert k in detail, f"Missing item {k} not listed in error detail: {detail}"

    def test_mandatory_item_set_false_treated_as_missing(self, student_token):
        """An explicitly false mandatory item -> still rejected as missing."""
        items = _all_mandatory_true()
        items["vitals_ok"] = False
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": items},
            timeout=30,
        )
        assert r.status_code == 400
        assert "vitals_ok" in r.json().get("detail", "")

    def test_happy_path_stamps_procedure(self, student_token):
        """All mandatory true -> 200 + GET shows stamp persisted."""
        items = _all_mandatory_true()
        items["preop_antibiotic"] = True  # optional, included
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": items, "notes": "TEST_happy_path notes"},
            timeout=30,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("phase2_preop_completed_at")
        assert body.get("phase2_preop_completed_by_name")

        # GET to verify persistence
        g = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"},
            timeout=30,
        )
        assert g.status_code == 200
        proc = g.json()
        assert proc.get("phase2_preop_completed_at"), "stamp not persisted"
        assert "gaurav" in (proc.get("phase2_preop_completed_by_name") or "").lower()
        assert proc.get("phase2_preop_completed_by_role") == "student"
        assert proc.get("phase2_preop_notes") == "TEST_happy_path notes"
        cl = proc.get("phase2_preop_checklist") or {}
        for k in MANDATORY_ITEMS:
            assert cl.get(k) is True, f"item {k} not persisted as True"
        assert cl.get("preop_antibiotic") is True

    def test_idempotent_resubmit_overwrites_user_and_timestamp(self, student_token, incharge_token):
        """Re-submission overwrites timestamp + completed_by."""
        # 1st submit as student
        r1 = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": _all_mandatory_true(), "notes": "first"},
            timeout=30,
        )
        assert r1.status_code == 200
        ts1 = r1.json()["phase2_preop_completed_at"]

        time.sleep(1.1)

        # 2nd submit as incharge -> should overwrite
        r2 = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {incharge_token}"},
            json={"items": _all_mandatory_true(), "notes": "second"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        ts2 = r2.json()["phase2_preop_completed_at"]
        assert ts2 != ts1, "timestamp should change on re-submit"

        # GET - completed_by_role must now be implant_incharge
        g = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {incharge_token}"},
            timeout=30,
        )
        proc = g.json()
        assert proc.get("phase2_preop_completed_by_role") == "implant_incharge"
        assert proc.get("phase2_preop_notes") == "second"


# ============================================================================
# /procedures/{id}/submit-phase2 — Pre-Op gate
# ============================================================================
class TestSubmitPhase2PreOpGate:

    def _phase2_payload(self):
        # Minimal valid-ish phase2 body — uses the legacy field set the endpoint accepts.
        return {
            "anesthesia_adequate": "Yes",
            "flap_design": "Crestal",
            "drilling_type": "Standard",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "bone_graft_used": False,
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "student_notes": "TEST_iter189",
        }

    def test_blocks_when_preop_not_completed(self, student_token):
        """submit-phase2 must 400 when phase2_preop_completed_at is null."""
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/submit-phase2",
            headers={"Authorization": f"Bearer {student_token}"},
            json=self._phase2_payload(),
            timeout=30,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "pre-surgical" in detail or "pre-op" in detail or "checklist" in detail

    def test_passes_after_preop_stamp(self, student_token):
        """After preop stamp exists -> submit-phase2 200 (consent already on file)."""
        # 1) stamp preop
        stamp = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/phase2-preop",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"items": _all_mandatory_true(), "notes": "gate-pass"},
            timeout=30,
        )
        assert stamp.status_code == 200, stamp.text

        # 2) submit phase 2
        r = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_ID}/submit-phase2",
            headers={"Authorization": f"Bearer {student_token}"},
            json=self._phase2_payload(),
            timeout=30,
        )
        assert r.status_code == 200, f"Expected 200 after preop stamp, got {r.status_code}: {r.text}"
