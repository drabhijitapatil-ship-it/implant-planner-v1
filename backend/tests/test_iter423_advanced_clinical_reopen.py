"""iter-423 tests for Chunk F, Ask 1 — POST /api/procedures/{id}/advanced-clinical/reopen.

Verifies:
  T1  Role gate: student → 403.
  T2  Non-Zygoma case → 400.
  T3  Already-draft → {ok: true, already_draft: true} (idempotent).
  T4  Approved → status flipped to 'draft', reopen_log entry appended with expected keys,
      approver fields cleared, second reopen returns already_draft.
  T5  Pending → status flipped to 'draft', reopen_log entry appended.
  T6  Supervisor role also authorised.
"""

import os
import time
import pytest
import requests
from bson import ObjectId
from datetime import datetime
from pymongo import MongoClient

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")
assert BASE_URL, "EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"


# ── helpers ────────────────────────────────────────────────────────────
def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.text[:200]}"
    return tok


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login("Abhijit.patil", "Admin@123"),
        "student": _login("Gaurav.pandey", "Student@123"),
        "supervisor": _login("Paresh.gandhi", "Supervisor@123"),
    }


@pytest.fixture(scope="module")
def db():
    assert MONGO_URL, "MONGO_URL env var required"
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


# canonical Zygoma+Pterygoid seed case reused from iter-421/422
ZYG_CASE_ID = "6a8337dd64ad3269dc584a69"


def _find_non_zyg_case(db) -> str:
    """Return _id of a non-Zygoma case (Single Conventional Implant preferred)."""
    doc = db.procedures.find_one({"implant_procedure_type": {"$nin": [
        "Quad Zygoma Implants",
        "Zygoma and Pterygoid Implants",
        "Pterygoid and Conventional Implants",
        "Zygoma and Conventional Implants",
        "Zygoma, Pterygoid and Conventional Implants",
    ]}})
    assert doc, "no non-zygoma seed available"
    return str(doc["_id"])


def _set_adv(db, status: str):
    """Seed phase2_data.advanced_clinical.approval_status to given status
    with stamped approver fields, so reopen has something to clear."""
    doc = db.procedures.find_one({"_id": ObjectId(ZYG_CASE_ID)})
    assert doc, "seed case missing"
    p2 = doc.get("phase2_data") or {}
    adv = p2.get("advanced_clinical") or {}
    adv["approval_status"] = status
    if status in ("pending", "approved"):
        adv["approved_by"] = "seed_user"
        adv["approved_by_name"] = "Seed Approver"
        adv["approved_by_role"] = "administrator"
        adv["approved_at"] = datetime.utcnow().isoformat()
    else:
        for k in ("approved_by", "approved_by_name", "approved_by_role", "approved_at"):
            adv.pop(k, None)
    adv["immediate_loading_day0_at"] = adv.get("immediate_loading_day0_at") or datetime.utcnow().isoformat()
    # ensure clean reopen_log baseline per test
    adv["reopen_log"] = []
    p2["advanced_clinical"] = adv
    db.procedures.update_one({"_id": ObjectId(ZYG_CASE_ID)}, {"$set": {"phase2_data": p2}})


def _get_adv(db) -> dict:
    doc = db.procedures.find_one({"_id": ObjectId(ZYG_CASE_ID)})
    return (doc.get("phase2_data") or {}).get("advanced_clinical") or {}


# ── T1: role gate — student → 403 ─────────────────────────────────────
def test_reopen_student_forbidden(tokens, db):
    _set_adv(db, "approved")
    r = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                      headers=_hdr(tokens["student"]), timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"


# ── T2: non-zygoma case → 400 ─────────────────────────────────────────
def test_reopen_non_zygoma_400(tokens, db):
    nz_id = _find_non_zyg_case(db)
    r = requests.post(f"{API}/procedures/{nz_id}/advanced-clinical/reopen",
                      headers=_hdr(tokens["admin"]), timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


# ── T3: already draft — idempotent no-op ──────────────────────────────
def test_reopen_already_draft_idempotent(tokens, db):
    _set_adv(db, "draft")
    r = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                      headers=_hdr(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("already_draft") is True
    # DB unchanged: still draft, no reopen_log entry appended
    adv = _get_adv(db)
    assert adv.get("approval_status") == "draft"
    assert not adv.get("reopen_log"), "reopen_log should stay empty for already-draft case"


# ── T4: approved → draft, reopen_log stamped, approver cleared ────────
def test_reopen_from_approved_flips_to_draft(tokens, db):
    _set_adv(db, "approved")
    r = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                      headers=_hdr(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("approval_status") == "draft"

    adv = _get_adv(db)
    assert adv.get("approval_status") == "draft"

    # approver fields cleared
    for k in ("approved_by", "approved_by_name", "approved_by_role", "approved_at"):
        assert k not in adv, f"expected {k} to be cleared, still present: {adv.get(k)}"

    # reopen_log entry appended with expected keys
    log = adv.get("reopen_log") or []
    assert len(log) == 1, f"expected 1 reopen_log entry, got {len(log)}"
    entry = log[0]
    for key in ("from_status", "reopened_by_name", "reopened_by_role", "reopened_at"):
        assert key in entry, f"reopen_log entry missing key: {key}"
    assert entry["from_status"] == "approved"
    assert entry["reopened_by_role"] in ("supervisor", "implant_incharge", "administrator")

    # second call is idempotent no-op
    r2 = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                       headers=_hdr(tokens["admin"]), timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("already_draft") is True


# ── T5: pending → draft ────────────────────────────────────────────────
def test_reopen_from_pending(tokens, db):
    _set_adv(db, "pending")
    r = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                      headers=_hdr(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("approval_status") == "draft"
    adv = _get_adv(db)
    log = adv.get("reopen_log") or []
    assert len(log) >= 1
    assert log[-1]["from_status"] == "pending"


# ── T6: supervisor authorised ─────────────────────────────────────────
def test_reopen_supervisor_authorised(tokens, db):
    _set_adv(db, "approved")
    r = requests.post(f"{API}/procedures/{ZYG_CASE_ID}/advanced-clinical/reopen",
                      headers=_hdr(tokens["supervisor"]), timeout=15)
    assert r.status_code == 200, f"supervisor should be authorised, got {r.status_code} {r.text[:200]}"
    adv = _get_adv(db)
    assert adv.get("approval_status") == "draft"
    log = adv.get("reopen_log") or []
    assert log and log[-1]["reopened_by_role"] == "supervisor"


# ── cleanup: leave case in draft (safe for future iters) ──────────────
def test_zzz_cleanup(db):
    _set_adv(db, "draft")
    adv = _get_adv(db)
    assert adv.get("approval_status") == "draft"
