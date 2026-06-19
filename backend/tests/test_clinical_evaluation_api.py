"""
API-level tests for GET /api/procedures/{id}/clinical-evaluation
Tests endpoint contract, auth, rule-firing, ordering, and edge cases.

Approach: We patch a real procedure document in Mongo with different
fixture inputs, hit the endpoint, then revert.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

TARGET_PROCEDURE_ID = "6a032b01473d90c8c776a586"  # owned by Abhijit (admin)


# ───────────────────────────── fixtures ──────────────────────────────
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def original_proc(db):
    """Snapshot the target procedure so we can restore it after each test."""
    snap = db.procedures.find_one({"_id": ObjectId(TARGET_PROCEDURE_ID)})
    if snap is None:
        pytest.skip(f"Target procedure {TARGET_PROCEDURE_ID} not found")
    yield snap
    snap_copy = dict(snap)
    snap_copy.pop("_id", None)
    db.procedures.replace_one({"_id": ObjectId(TARGET_PROCEDURE_ID)}, snap_copy)


def _patch_proc(db, updates):
    db.procedures.update_one(
        {"_id": ObjectId(TARGET_PROCEDURE_ID)}, {"$set": updates}
    )


def _get_eval(token, pid=TARGET_PROCEDURE_ID):
    return requests.get(
        f"{BASE_URL}/api/procedures/{pid}/clinical-evaluation",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )


# ───────────────────────── 1. Endpoint contract ──────────────────────
class TestEndpointContract:
    def test_requires_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/procedures/{TARGET_PROCEDURE_ID}/clinical-evaluation",
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_404_for_unknown_procedure(self, admin_token):
        bogus_id = "0" * 24
        r = _get_eval(admin_token, bogus_id)
        assert r.status_code == 404

    def test_200_shape_for_owner(self, admin_token):
        r = _get_eval(admin_token)
        assert r.status_code == 200
        body = r.json()
        assert body["procedure_id"] == TARGET_PROCEDURE_ID
        assert isinstance(body["hits"], list)
        assert set(body["counts"].keys()) == {"hard_block", "warning", "info"}
        assert isinstance(body["evaluated_at"], str)

    def test_non_stakeholder_gets_403(self, student_token):
        # Gaurav is a student not assigned to Abhijit's procedure → 403
        r = _get_eval(student_token)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ───────────────────────── 2. Rule firing ────────────────────────────
class TestRuleFiring:
    def test_immediate_loading_hard_block(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "loading_type": ["Immediate Loading"],
            "implant_procedure_type": "Single Conventional Implant",
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "11", "isq": 55, "insertion_torque_ncm": 25,
                 "axial_angulation_deg": 5}
            ]},
        })
        r = _get_eval(admin_token)
        assert r.status_code == 200
        hits = r.json()["hits"]
        ids = [h["rule_id"] for h in hits]
        assert "immediate_loading_stability" in ids
        top = next(h for h in hits if h["rule_id"] == "immediate_loading_stability")
        assert top["severity"] == "hard_block"
        assert top["citation"]["id"] == "ITI_2023_GROUP3_LOADING"
        # hard_block must be first
        assert hits[0]["severity"] == "hard_block"

    def test_diabetic_stack_smoking_citation(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "medical_history": {"hba1c": 8.4, "smoker": True},
            "loading_type": [],
            "implant_procedure_type": "Single Conventional Implant",
            "phase2_data": {"implant_plans": []},
        })
        r = _get_eval(admin_token)
        assert r.status_code == 200
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "diabetic_stack")
        assert hit["severity"] == "warning"
        assert hit["citation"]["id"] == "JIANG_SMOKING_SR_2022"

    def test_diabetic_hard_block_above_9(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "medical_history": {"hba1c": 9.5, "smoker": False},
            "loading_type": [],
            "implant_procedure_type": "Single Conventional Implant",
            "phase2_data": {"implant_plans": []},
        })
        r = _get_eval(admin_token)
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "diabetic_stack")
        assert hit["severity"] == "hard_block"

    def test_full_arch_angulation_warning(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "implant_procedure_type": "All on 4",
            "loading_type": [],
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "11", "axial_angulation_deg": 5, "isq": 75},
                {"position": "13", "axial_angulation_deg": 25, "isq": 72},
            ]},
        })
        r = _get_eval(admin_token)
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "full_arch_angulation")
        assert hit["severity"] == "warning"
        assert hit["citation"]["id"] == "ITI_2023_GROUP4_FULLARCH"

    def test_full_arch_angulation_hard_block_over_30(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "implant_procedure_type": "All on 4",
            "loading_type": [],
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "11", "axial_angulation_deg": 0, "isq": 75},
                {"position": "26", "axial_angulation_deg": 32, "isq": 75},
            ]},
        })
        r = _get_eval(admin_token)
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "full_arch_angulation")
        assert hit["severity"] == "hard_block"
        assert hit["citation"]["id"] == "MISCH_2020_ANGULATION"

    def test_gbr_labial_wall(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "implant_procedure_type": "Implant Placement with Guided Bone Regeneration",
            "loading_type": [],
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "21", "labial_bone_thickness_mm": 0.6, "isq": 75},
            ]},
        })
        r = _get_eval(admin_token)
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "gbr_labial_wall")
        assert hit["severity"] == "warning"
        assert hit["citation"]["id"] == "BUSER_GBR_2009"

    def test_isq_low_primary_stability(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": [],
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "36", "isq": 58}
            ]},
        })
        r = _get_eval(admin_token)
        hit = next(h for h in r.json()["hits"] if h["rule_id"] == "isq_low_primary_stability")
        assert hit["severity"] == "warning"
        assert hit["citation"]["id"] == "SENNERBY_MEREDITH_ISQ_2008"


# ───────────────────────── 3. Ordering & clean state ──────────────────
class TestOrderingAndEmpty:
    def test_hits_sorted_hard_block_first(self, db, original_proc, admin_token):
        # Trigger one hard_block (immediate loading + low ISQ) + one warning (isq<60)
        _patch_proc(db, {
            "loading_type": ["Immediate Loading"],
            "implant_procedure_type": "Single Conventional Implant",
            "medical_history": {"hba1c": 9.5, "smoker": False},
            "phase2_data": {"implant_plans": [
                {"position": "11", "isq": 50, "insertion_torque_ncm": 20,
                 "axial_angulation_deg": 5}
            ]},
        })
        r = _get_eval(admin_token)
        hits = r.json()["hits"]
        sev_order = [h["severity"] for h in hits]
        # hard_block(s) first, then warnings
        for i in range(len(sev_order) - 1):
            order = {"hard_block": 0, "warning": 1, "info": 2}
            assert order[sev_order[i]] <= order[sev_order[i + 1]]
        assert hits[0]["severity"] == "hard_block"

    def test_empty_procedure_returns_no_hits(self, db, original_proc, admin_token):
        _patch_proc(db, {
            "loading_type": [],
            "implant_procedure_type": "Single Conventional Implant",
            "medical_history": {},
            "phase2_data": {"implant_plans": [
                {"position": "11", "isq": 75, "insertion_torque_ncm": 40,
                 "axial_angulation_deg": 5, "labial_bone_thickness_mm": 2.5}
            ]},
        })
        r = _get_eval(admin_token)
        body = r.json()
        assert body["hits"] == []
        assert body["counts"] == {"hard_block": 0, "warning": 0, "info": 0}
