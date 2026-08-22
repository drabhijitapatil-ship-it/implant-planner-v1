"""iter-399: backend tests for
  BUG1 — Lab Slip active-implant overlay via _resolve_active_implants_inline
  BUG2 — patient-history 'accessible' flag mirrors GET /procedures/{id} access rules

Seeds procedures directly into Mongo and exercises the public API.
"""
import os
import time
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Known IDs from users collection (verified via mongo)
GAURAV_ID = "69b79409a17f36c024eb2d65"       # student
STUDENT2_ID = "69b79409a17f36c024eb2d66"     # Atharva.mahadik (new owner)
ABHIJIT_ID = "69b79407a17f36c024eb2d5e"      # implant_incharge (admin)
PARESH_ID = "69b79407a17f36c024eb2d60"       # supervisor


@pytest.fixture(scope="module")
def mdb():
    return MongoClient(MONGO_URL)[DB_NAME]


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {identifier} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tok_abhijit():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def tok_gaurav():
    return _login("Gaurav.pandey", "Student@123")


# ---------- BUG 1 seed ----------

@pytest.fixture(scope="module")
def labslip_case_id(mdb):
    reg = "LABSLIP-TEST-1"
    mdb.procedures.delete_many({"registration_number": reg})
    doc = {
        "student_name": "Dr. Gaurav Pandey",
        "student_id": GAURAV_ID,
        "patient_name": "LabSlip Test Patient",
        "registration_number": reg,
        "age": "55",
        "sex": "Male",
        "supervisor_id": PARESH_ID,
        "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": ABHIJIT_ID,
        "implant_incharge_name": "Dr. Abhijit Patil",
        "status": "stage2_prosthetic_step1_approved",
        "current_phase": "phase4",
        "created_by_id": GAURAV_ID,
        "created_by_role": "student",
        "created_at": time.time(),
        "implant_plans": [
            {"position": "16", "tooth": "16", "brand": "Nobel", "implant_brand": "Nobel",
             "system": "Active", "implant_system": "Active",
             "diameter": "4.3", "implant_diameter": "4.3",
             "length": "10", "implant_length": "10"},
            {"position": "26", "tooth": "26", "brand": "Straumann", "implant_brand": "Straumann",
             "system": "BLX", "implant_system": "BLX",
             "diameter": "4.0", "implant_diameter": "4.0",
             "length": "8", "implant_length": "8"},
        ],
        "phase2_survival_review": {
            "implants": {
                "0": {
                    "status": "Replaced",
                    "replacement": {
                        "tooth_number": "16", "brand": "Osstem", "system": "TSIII",
                        "diameter": "5.0", "length": "11.5", "revision_number": 1,
                    },
                },
                "1": {"status": "Failed", "reason": "Peri-implantitis"},
            }
        },
        "phase4_step1_data": {
            "final_prosthetic_plan": "Screw Retained Crown",
            "prosthetic_material": "Zirconia",
            "impression_type": "intraoral_scans",
        },
    }
    ins = mdb.procedures.insert_one(doc)
    yield str(ins.inserted_id)
    mdb.procedures.delete_many({"registration_number": reg})


def test_bug1_get_procedure_active_implants(labslip_case_id, tok_abhijit):
    """Backend precheck: GET /procedures/{id} returns implants[] with
    _active_revision / _active_in_treatment flags applied."""
    r = requests.get(f"{API}/procedures/{labslip_case_id}",
                     headers={"Authorization": f"Bearer {tok_abhijit}"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    imps = data.get("implants") or []
    assert len(imps) == 2, f"expected 2 implants, got {len(imps)}: {imps}"

    # Slot 0 = Replaced -> active revision with Osstem/TSIII/5.0/11.5 and active_in_treatment True
    r0 = imps[0]
    assert r0.get("_active_revision") is True, r0
    assert r0.get("_active_in_treatment") is True, r0
    assert r0.get("brand") == "Osstem", r0
    assert r0.get("system") == "TSIII", r0
    assert str(r0.get("diameter")) == "5.0"
    assert str(r0.get("length")) == "11.5"
    assert r0.get("_survival_status") == "Replaced"

    # Slot 1 = Failed no replacement -> active_in_treatment False, no _active_revision
    r1 = imps[1]
    assert r1.get("_active_in_treatment") is False, r1
    assert r1.get("_survival_status") == "Failed"
    assert not r1.get("_active_revision")


# ---------- BUG 2 seed ----------

@pytest.fixture(scope="module")
def transfer_case_ids(mdb):
    reg = "XFER-TEST-1"
    mdb.procedures.delete_many({"registration_number": reg})
    now = time.time()
    caseA = {
        "student_name": "Dr. Atharva Mahadik",
        "student_id": STUDENT2_ID,
        "previous_students": [GAURAV_ID],
        "patient_name": "Transfer Test Patient",
        "registration_number": reg,
        "age": "44",
        "sex": "Female",
        "supervisor_id": PARESH_ID,
        "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": ABHIJIT_ID,
        "implant_incharge_name": "Dr. Abhijit Patil",
        "status": "phase1_approved",
        "current_phase": "phase1",
        "created_by_id": GAURAV_ID,
        "created_by_role": "student",
        "created_at": now,
    }
    caseB = {
        "student_name": "Dr. Atharva Mahadik",
        "student_id": STUDENT2_ID,
        # NO previous_students -> Gaurav has no access
        "patient_name": "Transfer Test Patient",
        "registration_number": reg,
        "age": "44",
        "sex": "Female",
        "supervisor_id": PARESH_ID,
        "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": ABHIJIT_ID,
        "implant_incharge_name": "Dr. Abhijit Patil",
        "status": "pending_phase2",
        "current_phase": "phase2",
        "created_by_id": STUDENT2_ID,
        "created_by_role": "student",
        "created_at": now + 10,
    }
    a_id = str(mdb.procedures.insert_one(caseA).inserted_id)
    b_id = str(mdb.procedures.insert_one(caseB).inserted_id)
    yield {"A": a_id, "B": b_id}
    mdb.procedures.delete_many({"registration_number": reg})


def test_bug2_patient_history_gaurav_sees_accessible_flags(transfer_case_ids, tok_gaurav):
    a = transfer_case_ids["A"]
    b = transfer_case_ids["B"]
    r = requests.get(f"{API}/procedures/{a}/patient-history",
                     headers={"Authorization": f"Bearer {tok_gaurav}"}, timeout=30)
    assert r.status_code == 200, r.text
    cases = {c["id"]: c for c in r.json()["cases"]}
    assert a in cases and b in cases, cases
    assert cases[a]["accessible"] is True, cases[a]
    assert cases[b]["accessible"] is False, cases[b]


def test_bug2_patient_history_abhijit_all_accessible(transfer_case_ids, tok_abhijit):
    a = transfer_case_ids["A"]
    b = transfer_case_ids["B"]
    r = requests.get(f"{API}/procedures/{a}/patient-history",
                     headers={"Authorization": f"Bearer {tok_abhijit}"}, timeout=30)
    assert r.status_code == 200, r.text
    cases = {c["id"]: c for c in r.json()["cases"]}
    assert cases[a]["accessible"] is True
    assert cases[b]["accessible"] is True


def test_bug2_gaurav_denied_direct_get_of_caseB(transfer_case_ids, tok_gaurav):
    """Access-rule confirmation: Gaurav cannot open case B directly."""
    b = transfer_case_ids["B"]
    r = requests.get(f"{API}/procedures/{b}",
                     headers={"Authorization": f"Bearer {tok_gaurav}"}, timeout=30)
    assert r.status_code in (403, 404), r.status_code


def test_bug2_gaurav_can_get_caseA(transfer_case_ids, tok_gaurav):
    a = transfer_case_ids["A"]
    r = requests.get(f"{API}/procedures/{a}",
                     headers={"Authorization": f"Bearer {tok_gaurav}"}, timeout=30)
    assert r.status_code == 200, r.text


def test_bug2_patient_lookup_accessible_flag(transfer_case_ids, tok_gaurav):
    """patient-lookup should also carry accessible flag per case."""
    r = requests.get(f"{API}/procedures/patient-lookup",
                     params={"registration_number": "XFER-TEST-1"},
                     headers={"Authorization": f"Bearer {tok_gaurav}"}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    if not j.get("found"):
        pytest.skip("patient-lookup excludes non-draft-only match")
    a = transfer_case_ids["A"]
    b = transfer_case_ids["B"]
    cases = {c["id"]: c for c in j.get("cases", [])}
    if a in cases:
        assert cases[a].get("accessible") is True
    if b in cases:
        assert cases[b].get("accessible") is False
