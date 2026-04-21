"""
Integration tests for the pre-surgery reminder scheduler (iteration 96).

Seeds a synthetic phase1_approved procedure with procedure_date/time set ~24 hours
out, triggers the reminder sweep via POST /api/admin/run-pre-surgery-reminders,
and asserts that (a) notifications are inserted for student/supervisor/in-charge,
(b) the procedure is marked `pre_surgery_reminder_sent=True`, and (c) a second
sweep is a no-op.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import List

import pytest
import httpx
import motor.motor_asyncio  # type: ignore
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

API_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001"
BASE = f"{API_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

INCHARGE_CREDS = {"email": "Abhijit.patil", "password": "Admin@123"}
NURSE_CREDS = {"email": "nurse.1@dental.edu", "password": "Nurse@123"}


def _login(client: httpx.Client, email: str, password: str) -> str:
    r = client.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def loop():
    import asyncio
    return asyncio.new_event_loop()


@pytest.fixture(scope="module")
def db(loop):
    client_mongo = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    db = client_mongo[DB_NAME]
    yield db, loop
    client_mongo.close()


@pytest.fixture
def seeded_case(db):
    """Insert a synthetic phase1_approved case with procedure ~24h out. Clean up after."""
    database, loop = db

    # Fetch real user IDs so notifications target valid recipients.
    async def fetch_users():
        users = {}
        for role in ("student", "supervisor", "implant_incharge"):
            u = await database.users.find_one({"role": role})
            if u:
                users[role] = u
        return users

    users = loop.run_until_complete(fetch_users())
    assert "student" in users and "supervisor" in users and "implant_incharge" in users, \
        "Need student+supervisor+incharge users present for the test"

    surgery_dt = datetime.now() + timedelta(hours=24)  # exactly 24h from now
    case_doc = {
        "patient_name": "REMINDER_TEST Patient",
        "patient_id": "RMND-T1",
        "student_id": str(users["student"]["_id"]),
        "student_name": users["student"].get("name", ""),
        "supervisor_id": str(users["supervisor"]["_id"]),
        "supervisor_name": users["supervisor"].get("name", ""),
        "implant_incharge_id": str(users["implant_incharge"]["_id"]),
        "implant_incharge_name": users["implant_incharge"].get("name", ""),
        "status": "phase1_approved",
        "procedure_date": surgery_dt.strftime("%Y-%m-%d"),
        "procedure_time": surgery_dt.strftime("%H:%M"),
        "implant_procedure_type": "Single Implant Test",
        "created_at": datetime.utcnow(),
        "archived": False,
    }
    inserted = loop.run_until_complete(database.procedures.insert_one(case_doc))
    case_id = inserted.inserted_id

    yield {"case_id": case_id, "users": users, "surgery_dt": surgery_dt}

    # Cleanup
    async def teardown():
        await database.procedures.delete_one({"_id": case_id})
        await database.notifications.delete_many({"procedure_id": str(case_id)})
    loop.run_until_complete(teardown())


def test_nurse_cannot_trigger_reminder_sweep():
    with httpx.Client(timeout=20) as client:
        token = _login(client, **NURSE_CREDS)
        r = client.post(f"{BASE}/admin/run-pre-surgery-reminders", headers=_auth(token))
        assert r.status_code == 403


def test_reminder_inserts_notifications_and_is_idempotent(seeded_case, db):
    database, loop = db
    case_id = seeded_case["case_id"]

    with httpx.Client(timeout=30) as client:
        inch_token = _login(client, **INCHARGE_CREDS)
        r = client.post(f"{BASE}/admin/run-pre-surgery-reminders", headers=_auth(inch_token))
        assert r.status_code == 200
        assert r.json()["ok"] is True

    # The sweep should have inserted notifications for student+supervisor+incharge
    # (3 recipients, one notification each).
    async def fetch_notes():
        return await database.notifications.find(
            {"procedure_id": str(case_id), "type": "reminder"}
        ).to_list(10)

    notes = loop.run_until_complete(fetch_notes())
    assert len(notes) == 3, f"expected 3 reminder notifications, got {len(notes)}"
    for n in notes:
        assert "24 hours" in n["message"]
        assert "consent" in n["message"].lower() or "autoclav" in n["message"].lower()

    # Procedure must be flagged as reminder sent.
    async def fetch_proc():
        return await database.procedures.find_one({"_id": case_id})
    proc = loop.run_until_complete(fetch_proc())
    assert proc.get("pre_surgery_reminder_sent") is True
    assert proc.get("pre_surgery_reminder_at") is not None

    # Second sweep → no additional notifications (idempotent).
    with httpx.Client(timeout=30) as client:
        inch_token = _login(client, **INCHARGE_CREDS)
        r2 = client.post(f"{BASE}/admin/run-pre-surgery-reminders", headers=_auth(inch_token))
        assert r2.status_code == 200

    notes_after = loop.run_until_complete(fetch_notes())
    assert len(notes_after) == 3, f"expected idempotency, got {len(notes_after)} notes"
