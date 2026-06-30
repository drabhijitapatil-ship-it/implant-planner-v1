"""
Iteration 210 backend tests for the optional MUA Phase-4 override.

Covers POST /api/procedures/{id}/stage2/prosthetic with the new
`multi_unit_abutment_details` payload field on Stage2ProstheticSubmit:

  1. Save (save_only=true) with a populated list -> persisted into
     procedure.phase4_step1_data.multi_unit_abutment_details verbatim.
  2. Save with an empty list -> persisted as empty list (override cleared,
     PDF should fall back to phase2_data).
  3. Save WITHOUT the field (None) -> phase4_step1_data has no
     multi_unit_abutment_details key (override is not silently fabricated).
  4. Save with malformed entries (non-dict items) -> 422 validation error,
     never a 500.

We mutate an existing procedure into a save_only-eligible status
(stage2_surgical_approved / pending_stage2_prosthetic /
stage2_prosthetic_step1_approved) and reset after each test so the
suite is idempotent and does not leak state.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def candidate(db):
    """Return a procedure id we can hammer save_only requests against.
    Restores the original status + phase4_step1_data on teardown.
    """
    eligible = ("stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved")
    proc = db.procedures.find_one({"status": {"$in": list(eligible)}})
    if proc is None:
        proc = db.procedures.find_one({})
        if proc is None:
            pytest.skip("No procedure in DB at all")
    pid = proc["_id"]
    original_status = proc.get("status")
    original_phase4 = proc.get("phase4_step1_data")
    db.procedures.update_one({"_id": pid}, {"$set": {"status": "stage2_surgical_approved"}})
    yield str(pid)
    # teardown
    update = {"$set": {"status": original_status}}
    if original_phase4 is None:
        update["$unset"] = {"phase4_step1_data": ""}
    else:
        update["$set"]["phase4_step1_data"] = original_phase4
    db.procedures.update_one({"_id": pid}, update)


def _base_payload():
    """Minimal valid payload that satisfies shade-mandatory validation."""
    return {
        "final_prosthetic_plan": "Screw-retained PFM",
        "prosthetic_material": "PFM",
        "impression_type": "intraoral_scans",
        "shade_values": ["A2"],
        "shade_layout": "per_implant",
    }


def _post(admin_token, pid, payload):
    return requests.post(
        f"{API}/procedures/{pid}/stage2/prosthetic?save_only=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
        timeout=20,
    )


def _get(admin_token, pid):
    g = requests.get(f"{API}/procedures/{pid}",
                     headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert g.status_code == 200, g.text
    return g.json()


# ── Tests ───────────────────────────────────────────────────────────
class TestPhase4MUAOverride:

    def test_save_with_populated_list_round_trips(self, admin_token, candidate):
        rows = [
            {"tooth": "16", "angulation": "17°", "cuff_height": "3mm"},
            {"tooth": "26", "angulation": "30°", "cuff_height": "4mm"},
        ]
        payload = {**_base_payload(), "multi_unit_abutment_details": rows}
        r = _post(admin_token, candidate, payload)
        assert r.status_code == 200, r.text

        body = _get(admin_token, candidate)
        p4 = body.get("phase4_step1_data") or {}
        saved = p4.get("multi_unit_abutment_details")
        assert isinstance(saved, list)
        assert len(saved) == 2
        assert saved[0]["tooth"] == "16"
        assert saved[0]["angulation"] == "17°"
        assert saved[0]["cuff_height"] == "3mm"
        assert saved[1]["tooth"] == "26"

    def test_save_with_empty_list_persists_empty(self, admin_token, candidate):
        # First seed a populated override...
        seeded = [{"tooth": "11", "angulation": "0°", "cuff_height": "2mm"}]
        r1 = _post(admin_token, candidate, {**_base_payload(),
                                            "multi_unit_abutment_details": seeded})
        assert r1.status_code == 200, r1.text

        # ...then clear it via empty list.
        r2 = _post(admin_token, candidate, {**_base_payload(),
                                            "multi_unit_abutment_details": []})
        assert r2.status_code == 200, r2.text

        body = _get(admin_token, candidate)
        p4 = body.get("phase4_step1_data") or {}
        # Empty list must be persisted (so PDF falls back to phase2).
        assert "multi_unit_abutment_details" in p4
        assert p4["multi_unit_abutment_details"] == []

    def test_save_without_field_omits_key(self, admin_token, candidate):
        payload = _base_payload()  # no multi_unit_abutment_details
        r = _post(admin_token, candidate, payload)
        assert r.status_code == 200, r.text

        body = _get(admin_token, candidate)
        p4 = body.get("phase4_step1_data") or {}
        # The endpoint REPLACES phase4_step1_data wholesale; when the field is
        # omitted, the backend does NOT include the key in the new doc.
        assert "multi_unit_abutment_details" not in p4, (
            f"Expected key absent when payload omits it, got: {p4.get('multi_unit_abutment_details')!r}"
        )

    def test_malformed_entries_return_422(self, admin_token, candidate):
        # multi_unit_abutment_details should be List[Dict]; pass list of strings.
        payload = {**_base_payload(),
                   "multi_unit_abutment_details": ["not-a-dict", 12345]}
        r = _post(admin_token, candidate, payload)
        # Pydantic should reject — never a 500.
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text}"
        assert r.status_code != 500
