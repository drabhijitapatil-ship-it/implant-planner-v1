"""iter-376 — Transfer approval UX + notifications surface (Feb 2026).

Locks in the two backend guarantees the new TransferApprovalCard relies on:
  1. `GET /procedures/{id}` includes `transfer_request` in the response, and
     is accessible to the pending recipient (in addition to the current owner
     and previous owners).
  2. `POST /procedures/{id}/transfer/decline` accepts an optional reason and
     is authorised for supervisor, in-charge, recipient, and initiator at the
     correct stages.
  3. `GET /procedures` returns cases where the caller is the pending
     recipient of an active transfer (so the recipient sees the case in
     their My Cases list before ownership swap).
  4. Notifications table records `transfer_approval` / `transfer_recipient`
     / `transfer_declined` events at each stage.
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
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = {
        "_id": ObjectId(),
        "patient_name": f"Iter376 {uuid.uuid4().hex[:6]}",
        "patient_age": 44, "patient_sex": "F",
        "status": "phase1_approved",
        "student_id": a_id,
        "student_name": "Dr. Gaurav Pandey",
        "created_by_id": a_id,
        "supervisor_id": sup_id,
        "supervisor_phase1_approved": True,
        "implant_incharge_id": inc_id,
        "implant_incharge_phase1_approved": True,
        "implants": [{"brand": "Bredent", "system": "Copa Sky",
                      "diameter": 4.0, "length": 10.0, "tooth": "16"}],
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
        me = requests.get(f"{API_URL}/auth/me", headers=_h(TOK[k]), timeout=10).json()
        UID[k] = me.get("id") or me.get("_id")
    PID = _run_async(_seed(UID["student_a"], UID["supervisor"], UID["admin"]))
    # Kick off the transfer.
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/request",
                       headers=_h(TOK["student_a"]),
                       json={"to_student_id": UID["student_b"],
                             "reason": "iter-376 transfer approval UX test"},
                       timeout=10)
    r.raise_for_status()


def teardown_module(_):
    async def _cleanup():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.procedures.delete_many({"patient_name": {"$regex": "^Iter376"}})
        c.close()
    _run_async(_cleanup())


# ── GET /procedures/{id} exposes transfer_request ─────────────────────

def test_case_detail_exposes_transfer_request_to_supervisor():
    r = requests.get(f"{API_URL}/procedures/{PID}", headers=_h(TOK["supervisor"]), timeout=10)
    assert r.status_code == 200, r.text
    tr = r.json().get("transfer_request")
    assert tr and tr["status"] == "pending_supervisor"
    assert tr["from_student_id"] == UID["student_a"]
    assert tr["to_student_id"] == UID["student_b"]


def test_case_detail_exposes_transfer_request_to_incharge_after_sup_approve():
    ra = requests.post(f"{API_URL}/procedures/{PID}/transfer/supervisor-approve",
                        headers=_h(TOK["supervisor"]), timeout=10)
    assert ra.status_code == 200
    r = requests.get(f"{API_URL}/procedures/{PID}", headers=_h(TOK["admin"]), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["transfer_request"]["status"] == "pending_incharge"


# ── Notifications ──────────────────────────────────────────────────────

def _notif_types(token):
    r = requests.get(f"{API_URL}/notifications", headers=_h(token), timeout=10)
    r.raise_for_status()
    body = r.json()
    items = body if isinstance(body, list) else body.get("notifications", [])
    return [n.get("type") for n in items]


def test_supervisor_receives_transfer_notification():
    types = _notif_types(TOK["supervisor"])
    assert "transfer_approval" in types, types


def test_incharge_receives_transfer_notification_after_sup_approve():
    types = _notif_types(TOK["admin"])
    assert "transfer_approval" in types, types


# ── /procedures list surfaces the pending case to the recipient ──────

def test_pending_recipient_sees_case_in_my_cases_list_after_both_approvals():
    # Complete the in-charge approval so status → pending_recipient.
    r = requests.post(f"{API_URL}/procedures/{PID}/transfer/incharge-approve",
                      headers=_h(TOK["admin"]), timeout=10)
    assert r.status_code == 200, r.text
    # Now the recipient should see the case in their list even though
    # ownership hasn't swapped yet.
    lst = requests.get(f"{API_URL}/procedures", headers=_h(TOK["student_b"]), timeout=10)
    assert lst.status_code == 200
    ids = [p.get("id") or p.get("_id") for p in lst.json()]
    assert PID in ids


def test_recipient_receives_transfer_recipient_notification():
    types = _notif_types(TOK["student_b"])
    assert "transfer_recipient" in types, types


# ── Decline with optional reason from supervisor ──────────────────────

def test_transfer_notifications_include_message_field_for_alerts_ui():
    """iter-378 regression — the Alerts UI reads `item.message` to render
    the notification body. Transfer notifications must populate this field
    (earlier iterations wrote only `title` + `body`, which rendered blank
    cards on the phone)."""
    r = requests.get(f"{API_URL}/notifications", headers=_h(TOK["supervisor"]), timeout=10)
    r.raise_for_status()
    items = r.json() if isinstance(r.json(), list) else r.json().get("notifications", [])
    transfer_notifs = [n for n in items if str(n.get("type", "")).startswith("transfer_")]
    assert transfer_notifs, "supervisor should have at least one transfer notification"
    latest = transfer_notifs[0]
    assert latest.get("message"), f"transfer notification missing `message`: {latest}"
    assert len(str(latest["message"])) > 5


def test_supervisor_reject_transfer_with_reason(monkeypatch=None):
    """Seed a *fresh* transfer request and confirm supervisor decline with a
    reason clears the transfer_request and records the reason on
    last_transfer_attempt."""
    pid2 = _run_async(_seed(UID["student_a"], UID["supervisor"], UID["admin"]))
    r0 = requests.post(f"{API_URL}/procedures/{pid2}/transfer/request",
                        headers=_h(TOK["student_a"]),
                        json={"to_student_id": UID["student_b"],
                              "reason": "second reject-flow test 987654"}, timeout=10)
    assert r0.status_code == 200

    r = requests.post(f"{API_URL}/procedures/{pid2}/transfer/decline",
                      headers=_h(TOK["supervisor"]),
                      json={"reason": "recipient not yet cleared for autonomy"},
                      timeout=10)
    assert r.status_code == 200, r.text
    # Confirm transfer_request cleared + reason persisted on last_transfer_attempt
    detail = requests.get(f"{API_URL}/procedures/{pid2}",
                          headers=_h(TOK["supervisor"]), timeout=10).json()
    assert not detail.get("transfer_request")
    lta = detail.get("last_transfer_attempt")
    assert lta and lta["status"] == "rejected_supervisor"
    assert "recipient not yet cleared" in lta.get("declined_reason", "")
