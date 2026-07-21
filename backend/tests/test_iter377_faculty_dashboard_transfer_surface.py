"""iter-377 — Faculty dashboard transfer-approval summary (Feb 2026).

The Supervisor and Implant In-Charge dashboards read from the standard
`/procedures` list. This test locks in that a pending transfer request is
surfaced to the correct faculty via `p.transfer_request.status`, so the
"Transfers Awaiting Your Approval" section on the dashboard renders the
right count for the right role at the right stage.
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


def _login(u, pw):
    r = requests.post(f"{API_URL}/auth/login", json={"identifier": u, "password": pw}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def _h(t): return {"Authorization": f"Bearer {t}"}


TOK: dict = {}
UID: dict = {}
PID = ""


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            raise RuntimeError()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.new_event_loop().run_until_complete(coro)


async def _seed(a_id, sup_id, inc_id):
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    doc = {
        "_id": ObjectId(),
        "patient_name": f"Iter377 {uuid.uuid4().hex[:6]}",
        "patient_age": 44, "patient_sex": "F",
        "status": "phase1_approved",
        "student_id": a_id, "student_name": "Dr. Gaurav Pandey",
        "created_by_id": a_id,
        "supervisor_id": sup_id, "supervisor_phase1_approved": True,
        "implant_incharge_id": inc_id, "implant_incharge_phase1_approved": True,
        "archived": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procedures.insert_one(doc)
    c.close()
    return str(doc["_id"])


def setup_module(_):
    global PID
    for k, (u, pw) in CREDS.items():
        TOK[k] = _login(u, pw)
    for k in ("student_a", "student_b", "supervisor", "admin"):
        me = requests.get(f"{API_URL}/auth/me", headers=_h(TOK[k]), timeout=10).json()
        UID[k] = me.get("id") or me.get("_id")
    PID = _run_async(_seed(UID["student_a"], UID["supervisor"], UID["admin"]))
    requests.post(
        f"{API_URL}/procedures/{PID}/transfer/request",
        headers=_h(TOK["student_a"]),
        json={"to_student_id": UID["student_b"],
              "reason": "iter-377 faculty dashboard surface test"},
        timeout=10,
    ).raise_for_status()


def teardown_module(_):
    async def _cleanup():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.procedures.delete_many({"patient_name": {"$regex": "^Iter377"}})
        c.close()
    _run_async(_cleanup())


def _find_case(token):
    r = requests.get(f"{API_URL}/procedures", headers=_h(token), timeout=10)
    r.raise_for_status()
    for p in r.json():
        if (p.get("id") or p.get("_id")) == PID:
            return p
    return None


def test_supervisor_dashboard_sees_pending_supervisor_transfer():
    """The Supervisor list must expose the case with
    `transfer_request.status == 'pending_supervisor'` for the dashboard to
    render the "Transfers Awaiting Your Approval" section."""
    p = _find_case(TOK["supervisor"])
    assert p is not None
    tr = p.get("transfer_request")
    assert tr and tr["status"] == "pending_supervisor"


def test_incharge_dashboard_only_sees_after_supervisor_approves():
    # Before supervisor approves, transfer is pending_supervisor — not the
    # in-charge's stage. Confirm we can see the case but the status still
    # matches supervisor stage (dashboard filter would exclude it).
    p_before = _find_case(TOK["admin"])
    assert p_before["transfer_request"]["status"] == "pending_supervisor"

    # Supervisor approves.
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/supervisor-approve",
                      headers=_h(TOK["supervisor"]), timeout=10)
    assert r.status_code == 200

    p_after = _find_case(TOK["admin"])
    assert p_after["transfer_request"]["status"] == "pending_incharge"


def test_supervisor_dashboard_no_longer_shows_the_case_after_stage_advance():
    """Once supervisor approves, the case moves to pending_incharge — the
    supervisor's dashboard filter should no longer include this transfer."""
    p = _find_case(TOK["supervisor"])
    assert p["transfer_request"]["status"] == "pending_incharge"
