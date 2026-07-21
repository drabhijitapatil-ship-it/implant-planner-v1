"""iter-374 — Transfer Case (Feb 2026).

End-to-end backend regression for the student-initiated ownership handoff.
Uses hardcoded well-known credentials from /app/memory/test_credentials.md
and Atharva.mahadik as the second student (recipient).

Flow: request → supervisor approve → implant_incharge approve → recipient
accept → ownership swap + previous_students read-only visibility + AI
handoff summary (de-identified).
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from bson import ObjectId

sys.path.insert(0, str(Path("/app/backend").resolve()))
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))
from motor.motor_asyncio import AsyncIOMotorClient

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not API_URL.endswith("/api"):
    API_URL = API_URL.rstrip("/") + "/api"

CREDS = {
    "admin":     ("Abhijit.patil", "Admin@123"),     # implant_incharge role
    "student_a": ("Gaurav.pandey", "Student@123"),
    "student_b": ("Atharva.mahadik", "Student@123"),
    "supervisor": ("Paresh.gandhi", "Supervisor@123"),
}


def _login(user, pw):
    r = requests.post(f"{API_URL}/auth/login",
                       json={"identifier": user, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(tok): return {"Authorization": f"Bearer {tok}"}


TOK: dict = {}
UID: dict = {}
PID = ""


def _me(role):
    r = requests.get(f"{API_URL}/auth/me", headers=_h(TOK[role]), timeout=10)
    r.raise_for_status()
    return r.json()


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError("nested loop")
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.new_event_loop().run_until_complete(coro)


async def _seed_procedure(student_a_id, supervisor_id, incharge_id, status="phase1_approved"):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = {
        "_id": ObjectId(),
        "patient_name": f"Iter374 Patient {uuid.uuid4().hex[:6]}",
        "patient_age": 42,
        "patient_sex": "M",
        "status": status,
        "student_id": student_a_id,
        "student_name": "Dr. Gaurav Pandey",
        "created_by_id": student_a_id,
        "created_by_name": "Dr. Gaurav Pandey",
        "created_by_role": "student",
        "supervisor_id": supervisor_id,
        "supervisor_phase1_approved": True,
        "supervisor_phase1_approved_at": datetime.now(timezone.utc),
        "implant_incharge_id": incharge_id,
        "implant_incharge_phase1_approved": True,
        "implant_incharge_phase1_approved_at": datetime.now(timezone.utc),
        "implants": [{"brand": "Bredent", "system": "Copa Sky",
                      "diameter": 4.0, "length": 10.0, "tooth": "16"}],
        "bone_type": "D2", "bone_width": 6.5, "bone_height": 11.0,
        "procedures": ["Conventional Implant Placement"],
        "procedure_date": "2030-02-15",
        "procedure_time": "10:00",
        "archived": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procedures.insert_one(doc)
    client.close()
    return str(doc["_id"])


def setup_module(_):
    global PID
    for k, (u, pw) in CREDS.items():
        TOK[k] = _login(u, pw)
    for k in ("student_a", "student_b", "supervisor", "admin"):
        me = _me(k)
        UID[k] = me.get("id") or me.get("_id")
    PID = _run_async(_seed_procedure(UID["student_a"], UID["supervisor"], UID["admin"]))


def teardown_module(_):
    async def _cleanup():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.procedures.delete_many({"patient_name": {"$regex": "^Iter374"}})
        client.close()
    _run_async(_cleanup())


# ─── Guard rails ───────────────────────────────────────────────────────

def test_reject_self_transfer():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_a"]),
                       json={"to_student_id": UID["student_a"],
                             "reason": "attempting self-transfer negative test"},
                       timeout=10)
    assert r.status_code == 400 and "yourself" in r.text.lower(), r.text


def test_reject_invalid_recipient():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_a"]),
                       json={"to_student_id": "not-a-real-user-id",
                             "reason": "invalid recipient negative test"},
                       timeout=10)
    assert r.status_code in (404, 400), r.text


def test_non_owner_cannot_initiate():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_b"]),  # NOT the owner
                       json={"to_student_id": UID["student_a"],
                             "reason": "non-owner attempting transfer"},
                       timeout=10)
    assert r.status_code == 403, r.text


# ─── Happy path — 4-step transfer ──────────────────────────────────────

def test_01_transfer_request_creates_pending_supervisor_state():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_a"]),
                       json={"to_student_id": UID["student_b"],
                             "reason": "student rotation change — end of term"},
                       timeout=10)
    assert r.status_code == 200, r.text
    tr = r.json()["transfer_request"]
    assert tr["status"] == "pending_supervisor"
    assert tr["to_student_id"] == UID["student_b"]
    assert tr["at_phase"] == 1
    assert tr["recipient_deadline"]


def test_02_supervisor_approves_advances_to_incharge():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/supervisor-approve",
                       headers=_h(TOK["supervisor"]), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["transfer_request"]["status"] == "pending_incharge"


def test_03_incharge_approves_advances_to_recipient():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/incharge-approve",
                       headers=_h(TOK["admin"]), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["transfer_request"]["status"] == "pending_recipient"


def test_04_wrong_recipient_cannot_accept():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/accept",
                       headers=_h(TOK["student_a"]), timeout=10)
    assert r.status_code == 403, r.text


def test_05_recipient_accept_swaps_ownership_and_records_handoff():
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/accept",
                       headers=_h(TOK["student_b"]), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    entry = body["entry"]
    assert entry["at_phase"] == 1
    assert entry["next_phase"] == 2   # policy 4: N+1
    assert entry["to_student_id"] == UID["student_b"]
    assert body.get("handoff_summary")
    summary = body["handoff_summary"].lower()
    # PHI safety: patient name must NOT appear in the AI summary
    assert "iter374 patient" not in summary


def test_06_previous_owner_retains_readonly_visibility():
    r = requests.get(f"{API_URL}/procedures", headers=_h(TOK["student_a"]), timeout=10)
    r.raise_for_status()
    ids = [p.get("id") or p.get("_id") for p in r.json()]
    assert PID in ids, "student A must retain read-only visibility of transferred case"


def test_07_new_owner_sees_the_case():
    r = requests.get(f"{API_URL}/procedures", headers=_h(TOK["student_b"]), timeout=10)
    r.raise_for_status()
    ids = [p.get("id") or p.get("_id") for p in r.json()]
    assert PID in ids


def test_08_handoff_endpoint_returns_history():
    r = requests.get(f"{API_URL}/procedures/{PID}/transfer/handoff",
                      headers=_h(TOK["student_b"]), timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["latest"]["to_student_id"] == UID["student_b"]
    assert len(body["history"]) >= 1


def test_09_reverse_transfer_to_prior_owner_is_blocked():
    """Policy C: cannot transfer back to a prior owner (no ping-pong)."""
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_b"]),
                       json={"to_student_id": UID["student_a"],
                             "reason": "attempting reverse transfer to prior owner"},
                       timeout=10)
    assert r.status_code == 400, r.text
    assert "prior" in r.text.lower() or "previously" in r.text.lower() or "not allowed" in r.text.lower()


def test_10_pending_phase_status_blocks_new_transfer():
    """Fresh case with pending_phase2 status — transfer must be blocked."""
    pid2 = _run_async(_seed_procedure(UID["student_a"], UID["supervisor"],
                                        UID["admin"], status="pending_phase2"))
    r = requests.post(f"{API_URL}/procedures/{pid2}/transfer/request",
                       headers=_h(TOK["student_a"]),
                       json={"to_student_id": UID["student_b"],
                             "reason": "attempting transfer during pending phase"},
                       timeout=10)
    assert r.status_code == 400, r.text
    assert "pending" in r.text.lower()
