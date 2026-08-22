"""iter-401: Mid-Treatment Implant Addition — backend tests."""
import os
import uuid
import pytest
import requests
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ABHIJIT_ID = "69b79407a17f36c024eb2d5e"
PARESH_ID = "69b79407a17f36c024eb2d60"


# ---- fixtures / helpers ----
@pytest.fixture(scope="module")
def mongo_sync():
    import pymongo
    c = pymongo.MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def gaurav_id(mongo_sync):
    u = mongo_sync.users.find_one({"$or": [{"identifier": "Gaurav.pandey"}, {"username": "Gaurav.pandey"}, {"email": "Gaurav.pandey@student.dental.edu"}]})
    assert u, "Gaurav user not found"
    return str(u.get("_id") if isinstance(u.get("_id"), ObjectId) else u["_id"])


def _login(identifier, password):
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {identifier} failed: {r.status_code} {r.text}"
    return r.json()["token"] if "token" in r.json() else r.json().get("access_token")


@pytest.fixture(scope="module")
def tok_admin():
    return _login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def tok_student():
    return _login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def tok_sup():
    return _login("Paresh.gandhi", "Supervisor@123")


@pytest.fixture(scope="module")
def tok_nurse():
    try:
        return _login("nurse.1@dental.edu", "Nurse@123")
    except Exception:
        return None


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _seed_proc(mongo_sync, reg, *, status="phase2_approved",
               implant_procedure_type="Multiple Conventional Implants",
               student_id=None, created_by_role="implant_incharge"):
    from datetime import datetime, timezone
    doc = {
        "patient_name": f"ADDIMP TEST {reg}",
        "patient_id": f"ADDIMP-{reg}",
        "registration_number": reg,
        "status": status,
        "implant_procedure_type": implant_procedure_type,
        "implants": [{"tooth_number": "16", "tooth": "16", "system": "Nobel — Active",
                      "brand": "Nobel", "diameter": 4.3, "length": 10}],
        "implant_plans": [{"position": "16", "tooth": "16", "brand": "Nobel",
                           "system": "Active", "diameter": "4.3", "length": "10"}],
        "missing_teeth": ["16"],
        "torque_values": [35],
        "supervisor_id": PARESH_ID,
        "implant_incharge_id": ABHIJIT_ID,
        "created_by_id": student_id or ABHIJIT_ID,
        "created_by_role": created_by_role,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.utcnow(),
    }
    if student_id:
        doc["student_id"] = student_id
        doc["student_name"] = "Dr. Gaurav Pandey"
    res = mongo_sync.procedures.insert_one(doc)
    return str(res.inserted_id)


SEEDED_IDS = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(mongo_sync):
    yield
    if SEEDED_IDS:
        mongo_sync.procedures.delete_many({"_id": {"$in": [ObjectId(x) for x in SEEDED_IDS]}})
        mongo_sync.notifications.delete_many({"procedure_id": {"$in": SEEDED_IDS}})


# ---- 1. Happy path (in-charge auto-approve) ----
def test_incharge_autoapprove_happy_path(mongo_sync, tok_admin):
    reg = f"ADDIMP-TEST-1-{uuid.uuid4().hex[:6]}"
    pid = _seed_proc(mongo_sync, reg)
    SEEDED_IDS.append(pid)
    payload = {
        "tooth_number": "26", "system": "Osstem — TSIII", "diameter": 5.0, "length": 11.5,
        "placement_date": "2026-06-05", "insertion_torque_ncm": 40, "isq": 70,
        "iopa_url": "test.png", "reason": "AP spread support",
        "augmentation": {"procedures_performed": ["Guided Bone Regeneration (GBR)"],
                         "autogenous_used": "No", "allograft_used": "Yes",
                         "other_graft_materials": [], "membrane_used": "No", "membrane_types": [],
                         "fixation": [], "soft_tissue_graft": "No", "soft_tissue_types": [],
                         "soft_tissue_donor_sites": [], "soft_tissue_indications": [],
                         "healing_protocol": "Submerged"},
    }
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin), timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["request"]["status"] == "approved"

    g = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin), timeout=20)
    assert g.status_code == 200, g.text
    proc = g.json()
    assert len(proc["implants"]) == 2
    added = next(i for i in proc["implants"] if str(i.get("tooth_number")) == "26")
    assert added["added_in_phase"] == 3
    assert added.get("augmentation", {}).get("allograft_used") == "Yes"
    assert added.get("addition_reason") == "AP spread support"
    assert len(proc["implant_plans"]) == 2
    assert "26" in proc["missing_teeth"]
    assert len(proc["torque_values"]) == 2


# ---- 2. Approval chain student → supervisor → in-charge ----
def test_approval_chain_and_decline(mongo_sync, tok_admin, tok_student, tok_sup, gaurav_id):
    # ---- APPROVE chain: 27 ----
    reg = f"ADDIMP-TEST-2-{uuid.uuid4().hex[:6]}"
    pid = _seed_proc(mongo_sync, reg, student_id=gaurav_id, created_by_role="student")
    SEEDED_IDS.append(pid)

    payload = {"tooth_number": "27", "system": "Osstem — TSIII", "diameter": 4.5,
               "length": 10, "placement_date": "2026-06-05",
               "insertion_torque_ncm": 38, "isq": 68,
               "iopa_url": "iopa27.png", "reason": "additional support"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_student), timeout=20)
    assert r.status_code == 200, r.text
    req_id = r.json()["request"]["id"]
    assert r.json()["request"]["status"] == "pending_supervisor"

    # implants still 1
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    assert len(proc["implants"]) == 1

    # supervisor approve → pending_incharge
    r = requests.post(f"{API}/procedures/{pid}/add-implant/{req_id}/resolve",
                      json={"action": "approve", "comment": "ok"}, headers=_hdr(tok_sup), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["request"]["status"] == "pending_incharge"
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    assert len(proc["implants"]) == 1

    # in-charge approve
    r = requests.post(f"{API}/procedures/{pid}/add-implant/{req_id}/resolve",
                      json={"action": "approve"}, headers=_hdr(tok_admin), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["request"]["status"] == "approved"
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    assert len(proc["implants"]) == 2

    # notifications created
    notif_count = mongo_sync.notifications.count_documents({"procedure_id": pid})
    assert notif_count >= 1

    # ---- DECLINE path: request 36, supervisor declines ----
    payload["tooth_number"] = "36"
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_student), timeout=20)
    assert r.status_code == 200, r.text
    req_id2 = r.json()["request"]["id"]
    r = requests.post(f"{API}/procedures/{pid}/add-implant/{req_id2}/resolve",
                      json={"action": "decline", "comment": "not needed"}, headers=_hdr(tok_sup), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["request"]["status"] == "declined"
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    assert len(proc["implants"]) == 2  # unchanged


# ---- 3. Validations ----
def test_validation_single_conventional_forbidden(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-1-{uuid.uuid4().hex[:6]}",
                     implant_procedure_type="Single Conventional Implant")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "26", "system": "Osstem — TSIII", "diameter": 5.0, "length": 11.5,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "reason"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code == 400, r.text


def test_validation_completed_status(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-2-{uuid.uuid4().hex[:6]}", status="completed")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "reason"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code == 400, r.text


def test_validation_duplicate_site(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-3-{uuid.uuid4().hex[:6]}")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "16", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "duplicate"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code == 400, r.text


def test_validation_invalid_fdi(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-4-{uuid.uuid4().hex[:6]}")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "99", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "invalid fdi"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code in (400, 422), r.text


def test_validation_nurse_forbidden(mongo_sync, tok_admin, tok_nurse):
    if not tok_nurse:
        pytest.skip("nurse creds unavailable")
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-5-{uuid.uuid4().hex[:6]}")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "nurse test"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_nurse))
    assert r.status_code == 403, r.text


def test_validation_wrong_student_forbidden(mongo_sync, tok_student):
    # seed a case whose student is someone else (admin)
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-6-{uuid.uuid4().hex[:6]}",
                     student_id="000000000000000000000000", created_by_role="student")
    SEEDED_IDS.append(pid)
    payload = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "wrong student"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_student))
    assert r.status_code == 403, r.text


def test_validation_missing_fields(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-VAL-7-{uuid.uuid4().hex[:6]}")
    SEEDED_IDS.append(pid)
    # missing iopa_url
    payload = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "reason": "missing iopa"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code == 422, r.text
    # missing reason
    payload = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
               "placement_date": "2026-06-05", "iopa_url": "x.png"}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=payload, headers=_hdr(tok_admin))
    assert r.status_code == 422, r.text


# ---- 4. Phase-4 pending_stage2_verification flag ----
def test_phase4_pending_stage2_flag(mongo_sync, tok_admin):
    pid = _seed_proc(mongo_sync, f"ADDIMP-P4-{uuid.uuid4().hex[:6]}", status="pending_final_delivery")
    SEEDED_IDS.append(pid)
    base = {"tooth_number": "26", "system": "X — Y", "diameter": 4.0, "length": 10,
            "placement_date": "2026-06-05", "iopa_url": "t.png", "reason": "phase 4 add",
            "insertion_torque_ncm": 35}
    # without isq
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=base, headers=_hdr(tok_admin), timeout=20)
    assert r.status_code == 200, r.text
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    added = next(i for i in proc["implants"] if str(i.get("tooth_number")) == "26")
    assert added.get("pending_stage2_verification") is True
    added_plan = next(p for p in proc["implant_plans"] if str(p.get("position")) == "26")
    assert added_plan.get("pending_stage2_verification") is True
    # with isq
    base2 = {**base, "tooth_number": "27", "isq": 72}
    r = requests.post(f"{API}/procedures/{pid}/add-implant", json=base2, headers=_hdr(tok_admin), timeout=20)
    assert r.status_code == 200, r.text
    proc = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok_admin)).json()
    added27 = next(i for i in proc["implants"] if str(i.get("tooth_number")) == "27")
    assert added27.get("pending_stage2_verification") is False
