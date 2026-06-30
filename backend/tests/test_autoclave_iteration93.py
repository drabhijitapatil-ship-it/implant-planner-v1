"""Iteration 93 — POST /api/procedures/{id}/mark-instruments-autoclaved
Verifies: nurse mark/unmark happy paths, role guard 403, 1-hour lock 409,
scheduled-cases + case-detail both surface the instruments_autoclaved field,
and _parse_procedure_datetime helper accepts '10:00' and '10:00 AM'."""
import os
import sys
import pytest
import requests
from datetime import datetime, timedelta
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

# Load backend .env to reach mongo directly
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Ensure backend package is importable for helper unit test
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://implant-workflow-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
INCHARGE = {"identifier": "Abhijit.patil", "password": "Admin@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}

# Existing phase1_approved case with procedure_date=2026-04-25 10:00 (>> 1h away)
FUTURE_CASE_ID = "69cf9bdfdafb502718057bcd"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['identifier']} → {r.status_code} {r.text[:300]}"
    return r.json().get("access_token") or r.json().get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def nurse_token():
    return _login(NURSE)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def supervisor_token():
    return _login(SUPERVISOR)


@pytest.fixture(scope="module")
def incharge_token():
    return _login(INCHARGE)


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ------------------------------------------------------------------
# Unit test — _parse_procedure_datetime helper
# ------------------------------------------------------------------

class TestParseProcedureDatetime:
    def test_accepts_24h_format(self):
        from server import _parse_procedure_datetime
        dt = _parse_procedure_datetime("2026-04-25", "10:00")
        assert dt == datetime(2026, 4, 25, 10, 0)

    def test_accepts_12h_am_format(self):
        from server import _parse_procedure_datetime
        dt = _parse_procedure_datetime("2026-04-25", "10:00 AM")
        assert dt == datetime(2026, 4, 25, 10, 0)

    def test_accepts_12h_pm_format(self):
        from server import _parse_procedure_datetime
        dt = _parse_procedure_datetime("2026-04-25", "02:30 PM")
        assert dt == datetime(2026, 4, 25, 14, 30)

    def test_returns_none_when_empty(self):
        from server import _parse_procedure_datetime
        assert _parse_procedure_datetime("", "") is None
        assert _parse_procedure_datetime("2026-04-25", "") is None


# ------------------------------------------------------------------
# Nurse happy-path: mark true → 200, unmark false → 200 null
# ------------------------------------------------------------------

class TestNurseMarkUnmark:
    def test_mark_true_populates_object(self, nurse_token):
        r = requests.post(
            f"{API}/procedures/{FUTURE_CASE_ID}/mark-instruments-autoclaved",
            headers=_hdr(nurse_token), json={"marked": True}, timeout=15,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text[:300]}"
        body = r.json()
        assert "instruments_autoclaved" in body
        ia = body["instruments_autoclaved"]
        assert ia is not None, "marked=True should populate object"
        assert ia.get("marked") is True
        assert ia.get("marked_by_name"), "marked_by_name should be set"
        assert ia.get("marked_by"), "marked_by should be set"
        assert ia.get("marked_at"), "marked_at should be set"
        # ISO-ish timestamp sanity
        assert "T" in ia["marked_at"] or " " in ia["marked_at"]

    def test_persisted_via_case_detail_get(self, nurse_token):
        r = requests.get(f"{API}/procedures/{FUTURE_CASE_ID}", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "instruments_autoclaved" in body
        ia = body["instruments_autoclaved"]
        assert ia is not None and ia.get("marked") is True

    def test_persisted_in_scheduled_cases_list(self, nurse_token):
        # The 2026 case is outside default window=5, so use a wide window
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=30", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        cases = r.json().get("cases", [])
        # Every case in the list must have the field (may be null)
        for c in cases:
            assert "instruments_autoclaved" in c, f"missing field on case {c.get('id')}"

    def test_unmark_false_returns_null(self, nurse_token):
        r = requests.post(
            f"{API}/procedures/{FUTURE_CASE_ID}/mark-instruments-autoclaved",
            headers=_hdr(nurse_token), json={"marked": False}, timeout=15,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("instruments_autoclaved") is None, f"unmark should null out: got {body}"

    def test_unmark_persisted_get(self, nurse_token):
        r = requests.get(f"{API}/procedures/{FUTURE_CASE_ID}", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        ia = r.json().get("instruments_autoclaved")
        # NOTE: GET /procedures/{id} returns the raw mongo doc, so after unmark it
        # may be {"marked": False} rather than null. Frontend guards on marked===true.
        assert ia is None or ia.get("marked") is False, f"expected null/marked=False after unmark, got {ia}"

    def test_remark_true_after_unmark(self, nurse_token):
        # restore marked state so later iterations see it
        r = requests.post(
            f"{API}/procedures/{FUTURE_CASE_ID}/mark-instruments-autoclaved",
            headers=_hdr(nurse_token), json={"marked": True}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("instruments_autoclaved", {}).get("marked") is True


# ------------------------------------------------------------------
# Role guard — non-nurse → 403
# ------------------------------------------------------------------

class TestRoleGuard:
    @pytest.mark.parametrize("role_name,fixture_name", [
        ("student", "student_token"),
        ("supervisor", "supervisor_token"),
        ("incharge", "incharge_token"),
    ])
    def test_non_nurse_forbidden(self, role_name, fixture_name, request):
        tok = request.getfixturevalue(fixture_name)
        r = requests.post(
            f"{API}/procedures/{FUTURE_CASE_ID}/mark-instruments-autoclaved",
            headers=_hdr(tok), json={"marked": True}, timeout=15,
        )
        assert r.status_code == 403, f"{role_name} expected 403, got {r.status_code} {r.text[:300]}"


# ------------------------------------------------------------------
# 1-hour lock — 409
# ------------------------------------------------------------------

class TestOneHourLock:
    @pytest.fixture
    def near_term_case(self, mongo_db):
        """Clone a phase1_approved procedure and mutate procedure_date/time to now+30min."""
        template = mongo_db.procedures.find_one({"_id": ObjectId(FUTURE_CASE_ID)})
        assert template is not None, "template case missing"
        near = datetime.now() + timedelta(minutes=30)
        new_doc = {k: v for k, v in template.items() if k != "_id"}
        new_doc["procedure_date"] = near.strftime("%Y-%m-%d")
        new_doc["procedure_time"] = near.strftime("%H:%M")
        new_doc["patient_name"] = "TEST_AUTOCLAVE_LOCK"
        new_doc["instruments_autoclaved"] = None
        inserted = mongo_db.procedures.insert_one(new_doc)
        pid = str(inserted.inserted_id)
        yield pid
        mongo_db.procedures.delete_one({"_id": ObjectId(pid)})

    @pytest.fixture
    def past_case(self, mongo_db):
        template = mongo_db.procedures.find_one({"_id": ObjectId(FUTURE_CASE_ID)})
        past = datetime.now() - timedelta(hours=2)
        new_doc = {k: v for k, v in template.items() if k != "_id"}
        new_doc["procedure_date"] = past.strftime("%Y-%m-%d")
        new_doc["procedure_time"] = past.strftime("%H:%M")
        new_doc["patient_name"] = "TEST_AUTOCLAVE_PAST"
        new_doc["instruments_autoclaved"] = None
        inserted = mongo_db.procedures.insert_one(new_doc)
        pid = str(inserted.inserted_id)
        yield pid
        mongo_db.procedures.delete_one({"_id": ObjectId(pid)})

    def test_within_one_hour_returns_409(self, nurse_token, near_term_case):
        r = requests.post(
            f"{API}/procedures/{near_term_case}/mark-instruments-autoclaved",
            headers=_hdr(nurse_token), json={"marked": True}, timeout=15,
        )
        assert r.status_code == 409, f"expected 409 lock, got {r.status_code} {r.text[:300]}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "1 hour" in detail or "1-hour" in detail or "hour" in detail, f"detail should mention 1-hour window: {body}"

    def test_past_surgery_returns_409(self, nurse_token, past_case):
        r = requests.post(
            f"{API}/procedures/{past_case}/mark-instruments-autoclaved",
            headers=_hdr(nurse_token), json={"marked": True}, timeout=15,
        )
        assert r.status_code == 409, f"past surgery should lock, got {r.status_code} {r.text[:300]}"


# ------------------------------------------------------------------
# Scheduled-cases contract — instruments_autoclaved on every item
# ------------------------------------------------------------------

class TestScheduledCasesField:
    def test_field_present_on_all(self, nurse_token):
        r = requests.get(f"{API}/procedures/nurse/scheduled-cases?days=30", headers=_hdr(nurse_token), timeout=15)
        assert r.status_code == 200
        cases = r.json().get("cases", [])
        for c in cases:
            assert "instruments_autoclaved" in c
            ia = c["instruments_autoclaved"]
            if ia is not None:
                assert ia.get("marked") is True
                assert "marked_by_name" in ia
                assert "marked_at" in ia
