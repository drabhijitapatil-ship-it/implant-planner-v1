"""iter-354 re-test — targeted seed case scenarios for 699fc5c2248100e8a0d87265.

Verifies the exact scenarios from the review_request:
  1. Seed case is in phase2_approved with 2 implants.
  2. Q4-a boundary: implant#0 Failed(no repl) + implant#1 Replaced does NOT
     auto-terminate; _active_in_treatment flags are correct.
  3. Q4-a auto-terminate: BOTH implants Failed(no repl) auto-terminates.
  4. Fresh (no survival review) case: implants have NO _active_in_treatment.

Note: this file RESETS the seed case between scenarios via a Mongo update
      so tests are re-runnable.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from copy import deepcopy

SEED_CASE_ID = "699fc5c2248100e8a0d87265"


def _load_env():
    for envf in ("/app/backend/.env", "/app/frontend/.env"):
        try:
            with open(envf) as f:
                for line in f:
                    if "=" in line and not line.startswith("#"):
                        k, v = line.strip().split("=", 1)
                        os.environ.setdefault(k, v.strip('"').strip("'"))
        except FileNotFoundError:
            pass


_load_env()
BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://prosthetic-preview.preview.emergentagent.com",
).rstrip("/")
_client = MongoClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Abhijit.patil", "password": "Admin@123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def seed_snapshot():
    """Capture a snapshot of the seed case at test-suite start so we can
    restore it between individual test cases."""
    doc = db.procedures.find_one({"_id": ObjectId(SEED_CASE_ID)})
    assert doc, "seed case 699fc5c2248100e8a0d87265 missing from DB"
    return deepcopy(doc)


def _reset_seed(snapshot):
    """Restore the seed case to its phase2_approved starting state and
    strip any survival review fields that might have been added."""
    db.procedures.replace_one({"_id": ObjectId(SEED_CASE_ID)}, snapshot)
    # Defensive: strip any lingering survival review artefacts.
    db.procedures.update_one(
        {"_id": ObjectId(SEED_CASE_ID)},
        {"$unset": {
            "phase2_survival_review": "",
            "auto_terminated": "",
            "treatment_ended_reason": "",
            "phase2_data_original": "",
        }, "$set": {"status": "phase2_approved"}},
    )


def _get(pid, tok):
    return requests.get(
        f"{BASE_URL}/api/procedures/{pid}",
        headers={"Authorization": f"Bearer {tok}"},
    )


class TestSeedCasePhase2ApprovedStart:
    def test_seed_case_ready(self, token, seed_snapshot):
        _reset_seed(seed_snapshot)
        r = _get(SEED_CASE_ID, token)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "phase2_approved"
        assert len(d["implants"]) == 2
        tooth_numbers = sorted([i.get("tooth_number") for i in d["implants"]])
        assert tooth_numbers == [16, 26], f"tooth_numbers={tooth_numbers}"
        # Fresh case must NOT have _active_in_treatment annotations.
        for imp in d["implants"]:
            assert "_active_in_treatment" not in imp
            assert "_survival_status" not in imp


class TestSeedCaseQ4aBoundary:
    def test_one_failed_one_replaced_keeps_case_alive(self, token, seed_snapshot):
        _reset_seed(seed_snapshot)
        payload = {
            "all_survived": False,
            "failures": [
                {
                    "implant_idx": 0,
                    "reason": "Mobility",
                    "removed": True,
                    "replaced": False,
                },
                {
                    "implant_idx": 1,
                    "reason": "Implant fracture",
                    "removed": True,
                    "replaced": True,
                    "replacement": {
                        "system": "Nobel Active",
                        "diameter": 4.3,
                        "length": 11.5,
                        "placement_date": "2026-02-08",
                        "procedure_type": "Single Stage",
                        "prosthetic_component": "Cover Screw",
                        "iopa_url": "r1_seed_impl1.jpg",
                    },
                },
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{SEED_CASE_ID}/survival-review",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert r.status_code == 200, r.text

        d = _get(SEED_CASE_ID, token).json()
        assert d["status"] == "phase2_approved", (
            f"case incorrectly transitioned; status={d.get('status')}"
        )
        assert d.get("auto_terminated") is not True

        # Flag matrix
        imp0 = d["implants"][0]
        imp1 = d["implants"][1]
        assert imp0.get("_active_in_treatment") is False
        assert imp0.get("_survival_failed") is True
        assert imp1.get("_active_in_treatment") is True
        assert imp1.get("_active_revision") is True
        assert imp1.get("_survival_status") == "Replaced"


class TestSeedCaseQ4aAutoTerminate:
    def test_both_failed_no_repl_auto_terminates(self, token, seed_snapshot):
        _reset_seed(seed_snapshot)
        payload = {
            "all_survived": False,
            "failures": [
                {
                    "implant_idx": 0,
                    "reason": "Peri-implantitis",
                    "removed": True,
                    "replaced": False,
                    "end_treatment": False,
                },
                {
                    "implant_idx": 1,
                    "reason": "Mobility",
                    "removed": True,
                    "replaced": False,
                    "end_treatment": False,
                },
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/procedures/{SEED_CASE_ID}/survival-review",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert r.status_code == 200, r.text

        d = _get(SEED_CASE_ID, token).json()
        assert d["status"] == "treatment_ended", (
            f"expected treatment_ended, got {d.get('status')}"
        )
        assert d.get("auto_terminated") is True
        assert "auto-terminated" in (d.get("treatment_ended_reason") or "").lower()


class TestSeedCaseFreshNoAnnotations:
    def test_fresh_case_no_active_in_treatment_key(self, token, seed_snapshot):
        _reset_seed(seed_snapshot)
        d = _get(SEED_CASE_ID, token).json()
        assert d["status"] == "phase2_approved"
        for imp in d["implants"]:
            assert "_active_in_treatment" not in imp, (
                f"unexpected _active_in_treatment on untouched case: {imp}"
            )


@pytest.fixture(scope="module", autouse=True)
def restore_seed_at_end(seed_snapshot):
    """Ensure seed case is back to phase2_approved after this suite runs
    so downstream tests / manual FE testing see a clean state."""
    yield
    db.procedures.replace_one({"_id": ObjectId(SEED_CASE_ID)}, seed_snapshot)
    db.procedures.update_one(
        {"_id": ObjectId(SEED_CASE_ID)},
        {"$unset": {
            "phase2_survival_review": "",
            "auto_terminated": "",
            "treatment_ended_reason": "",
            "phase2_data_original": "",
        }, "$set": {"status": "phase2_approved"}},
    )
