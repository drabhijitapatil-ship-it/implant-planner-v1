"""iter-375 — Student Contribution Timeline (Feb 2026).

Derives per-student ownership segments from `created_at` +
`transfer_history` + current student, so the case detail can render a
screenshottable academic portfolio breadcrumb.

Depends on the iter-374 transfer workflow being green (this file leans on
the case seeded + transferred by that suite's helpers).
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
    "admin":     ("Abhijit.patil", "Admin@123"),
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
PID_SINGLE = ""
PID_TRANSFERRED = ""


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.new_event_loop().run_until_complete(coro)


async def _seed_single_owner_case(student_a_id, sup_id, inc_id):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = {
        "_id": ObjectId(),
        "patient_name": f"Iter375 Single {uuid.uuid4().hex[:6]}",
        "status": "phase1_approved",
        "student_id": student_a_id,
        "student_name": "Dr. Gaurav Pandey",
        "created_by_id": student_a_id,
        "supervisor_id": sup_id,
        "supervisor_phase1_approved": True,
        "implant_incharge_id": inc_id,
        "implant_incharge_phase1_approved": True,
        "archived": False,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    await db.procedures.insert_one(doc)
    client.close()
    return str(doc["_id"])


async def _seed_transferred_case(student_a_id, student_b_id, sup_id, inc_id):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = {
        "_id": ObjectId(),
        "patient_name": f"Iter375 Transferred {uuid.uuid4().hex[:6]}",
        "status": "phase2_approved",
        "student_id": student_b_id,
        "student_name": "Dr. Atharva Mahadik",
        "previous_students": [student_a_id],
        "transfer_count": 1,
        "created_by_id": student_a_id,
        "supervisor_id": sup_id,
        "supervisor_phase1_approved": True,
        "supervisor_phase2_approved": True,
        "implant_incharge_id": inc_id,
        "implant_incharge_phase1_approved": True,
        "implant_incharge_phase2_approved": True,
        "transfer_history": [
            {
                "id": str(uuid.uuid4()),
                "from_student_id": student_a_id,
                "from_student_name": "Dr. Gaurav Pandey",
                "to_student_id": student_b_id,
                "to_student_name": "Dr. Atharva Mahadik",
                "reason": "seeded for iter-375 timeline test",
                "completed_at": "2026-01-15T12:00:00+00:00",
                "at_phase": 1,
                "next_phase": 2,
                "handoff_summary": "de-identified brief",
            },
        ],
        "archived": False,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    await db.procedures.insert_one(doc)
    client.close()
    return str(doc["_id"])


def setup_module(_):
    global PID_SINGLE, PID_TRANSFERRED
    for k, (u, pw) in CREDS.items():
        TOK[k] = _login(u, pw)
    for k in ("student_a", "student_b", "supervisor", "admin"):
        me = requests.get(f"{API_URL}/auth/me", headers=_h(TOK[k]), timeout=10).json()
        UID[k] = me.get("id") or me.get("_id")
    PID_SINGLE = _run_async(_seed_single_owner_case(
        UID["student_a"], UID["supervisor"], UID["admin"]))
    PID_TRANSFERRED = _run_async(_seed_transferred_case(
        UID["student_a"], UID["student_b"], UID["supervisor"], UID["admin"]))


def teardown_module(_):
    async def _cleanup():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.procedures.delete_many({"patient_name": {"$regex": "^Iter375"}})
        client.close()
    _run_async(_cleanup())


def _timeline(procedure_id, token):
    r = requests.get(f"{API_URL}/procedures/{procedure_id}/contribution-timeline",
                      headers=_h(token), timeout=10)
    r.raise_for_status()
    return r.json()


def test_single_owner_case_returns_one_segment():
    body = _timeline(PID_SINGLE, TOK["student_a"])
    assert body["transfer_count"] == 0
    assert len(body["segments"]) == 1
    seg = body["segments"][0]
    assert seg["is_current"] is True
    assert seg["student_id"] == UID["student_a"]
    assert seg["to"] is None
    assert 1 in seg["phases"]


def test_transferred_case_returns_two_ordered_segments():
    body = _timeline(PID_TRANSFERRED, TOK["student_b"])
    assert body["transfer_count"] == 1
    assert len(body["segments"]) == 2
    s0, s1 = body["segments"]
    # First segment: original owner, closed at transfer completion time.
    assert s0["student_id"] == UID["student_a"]
    assert s0["is_current"] is False
    assert s0["to"] == "2026-01-15T12:00:00+00:00"
    assert 1 in s0["phases"]
    # Second segment: new owner, still open.
    assert s1["student_id"] == UID["student_b"]
    assert s1["is_current"] is True
    assert s1["to"] is None
    # New owner continues from Phase N+1
    assert 2 in s1["phases"]


def test_prior_owner_can_see_timeline_readonly():
    """Previous owners retain read-only visibility of the timeline."""
    body = _timeline(PID_TRANSFERRED, TOK["student_a"])
    assert body["segments"][0]["student_id"] == UID["student_a"]


def test_non_stakeholder_forbidden():
    """A student unrelated to the case cannot read its timeline."""
    # Log in as a third student who never owned the case. Use `Anand.kurum`
    # from the seeded student directory.
    tok = _login("Anand.kurum", "Student@123")
    r = requests.get(f"{API_URL}/procedures/{PID_TRANSFERRED}/contribution-timeline",
                      headers=_h(tok), timeout=10)
    assert r.status_code == 403, r.text
