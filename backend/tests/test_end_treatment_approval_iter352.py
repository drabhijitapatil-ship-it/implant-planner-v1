"""iter-352: End Implant Treatment role-based approval workflow +
R0 → R{n} data substitution on GET /procedures/{id}.

Uses direct DB manipulation to set up scenarios (student/supervisor/incharge
initiator, supervisor==incharge vs supervisor!=incharge), then exercises the
POST /api/procedures/{id}/end-treatment/approve endpoint.
"""
import os
import copy
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://dental-workflow-18.preview.emergentagent.com",
).rstrip("/")


# ---- MongoDB helper (setup / teardown / state resets) ----
def _load_env():
    if os.environ.get("MONGO_URL"):
        return
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))


_load_env()
_client = MongoClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _find_user(username: str):
    return db.users.find_one({"username": username}) or db.users.find_one(
        {"email": f"{username}@dental.edu"}
    ) or db.users.find_one({"email": f"{username.lower()}@dental.edu"})


ABHIJIT = _find_user("Abhijit.patil")
PARESH = _find_user("Paresh.gandhi")
GAURAV = _find_user("Gaurav.pandey")


def _token(identifier, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed for {identifier}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tok_abhijit():
    return _token("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def tok_paresh():
    return _token("Paresh.gandhi", "Supervisor@123")


@pytest.fixture(scope="module")
def tok_gaurav():
    return _token("Gaurav.pandey", "Student@123")


# ---- Test procedure factory ----
def _make_proc(super_id, incharge_id, status="phase2_approved"):
    """Insert a minimal test procedure and return its id."""
    doc = {
        "patient_name": "TEST_iter352 Patient",
        "patient_id": "TEST_iter352",
        "status": status,
        "supervisor_id": super_id,
        "implant_incharge_id": incharge_id,
        "created_by_id": str(GAURAV["_id"]),
        "student_id": str(GAURAV["_id"]),
        "implants": [
            {
                "tooth_number": 16,
                "system": "Alpha Bio ICE",
                "diameter": 5.0,
                "length": 13.0,
                "bone_type": "D3",
                "procedure_type": "Two Stage",
                "prosthetic_component": "Healing Abutment",
                "healing_abutment_mm": 5.0,
            }
        ],
        "phase2_survival_review": {
            "reviewed_at": "2026-02-08T00:00:00Z",
            "implants": {"0": {"status": "Active"}},
        },
    }
    r = db.procedures.insert_one(doc)
    return str(r.inserted_id)


def _make_pending_end_treatment(pid, initiator_role="student", pending_status="pending_end_treatment_supervisor"):
    """Mutate an existing test procedure to be in a pending_end_treatment_* state."""
    initiator = GAURAV if initiator_role == "student" else (ABHIJIT if initiator_role == "implant_incharge" else PARESH)
    review = db.procedures.find_one({"_id": ObjectId(pid)}).get("phase2_survival_review", {}) or {}
    review["implants"] = {"0": {
        "status": "Treatment Ended",
        "end_treatment": True,
        "end_treatment_decision_maker": "Patient",
        "end_treatment_reason": "Patient discontinued (test)",
    }}
    review["treatment_ended"] = True
    db.procedures.update_one({"_id": ObjectId(pid)}, {"$set": {
        "status": pending_status,
        "phase2_survival_review": review,
        "pending_end_treatment": {
            "initiated_by_id": str(initiator["_id"]),
            "initiated_by_name": initiator.get("name") or initiator.get("username"),
            "initiated_by_role": initiator_role,
            "initiated_at": "2026-02-08T00:00:00Z",
            "decision_maker": "Patient",
            "reason": "Patient discontinued (test)",
            "prior_status": "phase2_approved",
            "supervisor_approved_at": None,
            "supervisor_approved_by": None,
            "incharge_approved_at": None,
            "incharge_approved_by": None,
        },
    }})


@pytest.fixture(scope="module")
def cleanup():
    ids: list = []
    yield ids
    for pid in ids:
        try:
            db.procedures.delete_one({"_id": ObjectId(pid)})
        except Exception:
            pass


# ============================================================
# 1) Approval workflow — supervisor != in-charge
# ============================================================
class TestApprovalWorkflowDistinctRoles:
    def test_student_initiates_pending_supervisor(self, tok_gaurav, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        # Verify state via API
        r = requests.get(f"{BASE_URL}/api/procedures/{pid}",
                         headers={"Authorization": f"Bearer {tok_gaurav}"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "pending_end_treatment_supervisor"
        assert d["pending_end_treatment"]["initiated_by_role"] == "student"
        assert d["pending_end_treatment"]["prior_status"] == "phase2_approved"

    def test_supervisor_approves_advances_to_incharge(self, tok_paresh, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_paresh}"},
            json={"action": "approve"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending_end_treatment_incharge"
        # DB stamp
        proc = db.procedures.find_one({"_id": ObjectId(pid)})
        assert proc["status"] == "pending_end_treatment_incharge"
        assert proc["pending_end_treatment"]["supervisor_approved_by"] is not None

    def test_incharge_approves_terminates(self, tok_paresh, tok_abhijit, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        # Supervisor approves first
        requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_paresh}"},
            json={"action": "approve"},
        )
        # In-charge approves
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
            json={"action": "approve"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "treatment_ended"
        proc = db.procedures.find_one({"_id": ObjectId(pid)})
        assert proc["status"] == "treatment_ended"
        assert proc.get("treatment_ended_at") is not None
        assert proc.get("treatment_ended_reason") == "Patient discontinued (test)"
        assert proc.get("treatment_ended_by_role") == "student"

    def test_supervisor_initiator_skips_supervisor_step(self, cleanup):
        # Set the CURRENT case status directly, as if supervisor just posted a survival-review.
        # Verify the code takes the "pending_end_treatment_incharge" branch by simulating
        # what submit_survival_review computes for supervisor initiator + supervisor!=incharge.
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        # This test verifies the invariant at the endpoint level: given the
        # case has been set to pending_end_treatment_incharge (which is what
        # the survival-review handler produces for supervisor initiator on
        # supervisor != incharge), only the in-charge can finalize.
        _make_pending_end_treatment(pid, "supervisor", "pending_end_treatment_incharge")
        # Supervisor Paresh should NOT be able to act on pending_end_treatment_incharge
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {_token('Paresh.gandhi','Supervisor@123')}"},
            json={"action": "approve"},
        )
        assert r.status_code == 403

    def test_supervisor_cannot_approve_pending_incharge(self, tok_paresh, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_incharge")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_paresh}"},
            json={"action": "approve"},
        )
        assert r.status_code == 403

    def test_incharge_cannot_approve_pending_supervisor(self, tok_abhijit, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
            json={"action": "approve"},
        )
        assert r.status_code == 403


# ============================================================
# 2) Same-person-both collapse (supervisor == in-charge)
# ============================================================
class TestSamePersonBothCollapse:
    def test_student_initiates_single_approval_terminates(self, tok_abhijit, cleanup):
        # supervisor_id == implant_incharge_id == Abhijit
        pid = _make_proc(str(ABHIJIT["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
            json={"action": "approve"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "treatment_ended"
        proc = db.procedures.find_one({"_id": ObjectId(pid)})
        assert proc["status"] == "treatment_ended"
        assert proc["pending_end_treatment"]["supervisor_approved_by"] is not None
        assert proc["pending_end_treatment"]["incharge_approved_by"] is not None


# ============================================================
# 3) Rejection workflow
# ============================================================
class TestRejection:
    def test_reject_without_comment_returns_400(self, tok_paresh, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_paresh}"},
            json={"action": "reject", "comment": ""},
        )
        assert r.status_code == 400
        assert "rejection" in r.text.lower()

    def test_reject_with_comment_reverts_status(self, tok_paresh, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        r = requests.post(
            f"{BASE_URL}/api/procedures/{pid}/end-treatment/approve",
            headers={"Authorization": f"Bearer {tok_paresh}"},
            json={"action": "reject", "comment": "Insufficient clinical justification"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "phase2_approved"
        proc = db.procedures.find_one({"_id": ObjectId(pid)})
        assert proc["status"] == "phase2_approved"
        assert proc.get("pending_end_treatment") is None
        rej = proc.get("end_treatment_rejected") or {}
        assert rej.get("comment") == "Insufficient clinical justification"
        assert rej.get("by_role") == "supervisor"
        assert rej.get("by_name")
        # Every implant marked 'Treatment Ended' is downgraded to Failed
        review = proc.get("phase2_survival_review") or {}
        impls = review.get("implants") or {}
        for _k, v in impls.items():
            assert v.get("status") == "Failed"
            assert v.get("end_treatment") is False


# ============================================================
# 4) Dashboard pending counts include the new statuses
# ============================================================
class TestDashboardPendingCounts:
    def test_pending_counts_include_end_treatment(self, tok_abhijit, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_incharge")
        r = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert r.status_code == 200
        data = r.json()
        # The response uses `pending_my_approval` for the current user's queue.
        # Our newly created pending_end_treatment_incharge case on Abhijit
        # must be counted (>=1).
        assert data.get("pending_my_approval", 0) >= 1

    def test_procedures_pending_all_includes_new_statuses(self, tok_abhijit, cleanup):
        pid = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        _make_pending_end_treatment(pid, "student", "pending_end_treatment_supervisor")
        pid2 = _make_proc(str(PARESH["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid2)
        _make_pending_end_treatment(pid2, "student", "pending_end_treatment_incharge")
        r = requests.get(
            f"{BASE_URL}/api/procedures?filter=pending_all",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("procedures", [])
        statuses = {row.get("status") for row in rows}
        assert "pending_end_treatment_supervisor" in statuses
        assert "pending_end_treatment_incharge" in statuses


# ============================================================
# 5) R0 → R{n} substitution on GET /procedures/{id}
# ============================================================
class TestR0RnSubstitution:
    SEED_ID = "699fc5c2248100e8a0d87265"

    def test_seed_case_has_rn_substitution(self, tok_abhijit):
        """Verify the pre-seeded case demonstrates R0 → Rn merge with
        cleared healing_abutment_mm and preserved bone_type."""
        r = requests.get(
            f"{BASE_URL}/api/procedures/{self.SEED_ID}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert r.status_code == 200
        d = r.json()
        imp = d["implants"][0]
        assert imp["system"] == "Nobel Active"
        assert imp["diameter"] == 4.3
        assert imp["length"] == 11.5
        assert imp["procedure_type"] == "Single Stage"
        assert imp["prosthetic_component"] == "Cover Screw"
        # CLEARED because Rn switched to Cover Screw
        assert imp["healing_abutment_mm"] is None
        # Anatomy preserved from R0
        assert imp["bone_type"] == "D3"
        # R0 snapshot preserved
        assert imp["_r0"]["prosthetic_component"] == "Healing Abutment"
        assert imp["_r0"]["healing_abutment_mm"] == 5.0
        assert imp["_r0"]["system"] == "Alpha Bio ICE"
        assert imp["_active_revision"] is True

    def test_no_survival_review_no_substitution(self, tok_abhijit, cleanup):
        pid = _make_proc(str(ABHIJIT["_id"]), str(ABHIJIT["_id"]))
        cleanup.append(pid)
        # Remove the survival review section entirely
        db.procedures.update_one(
            {"_id": ObjectId(pid)}, {"$unset": {"phase2_survival_review": ""}}
        )
        r = requests.get(
            f"{BASE_URL}/api/procedures/{pid}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert r.status_code == 200
        imp = r.json()["implants"][0]
        # Without a review, the helper returns implants unchanged (no _r0,
        # no _active_revision).
        assert "_r0" not in imp
        assert "_active_revision" not in imp
        # And original R0 fields intact
        assert imp["system"] == "Alpha Bio ICE"
        assert imp["healing_abutment_mm"] == 5.0
