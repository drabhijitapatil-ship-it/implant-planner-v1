"""iter-353: (A) R{n} → phase2_data substitution on GET /procedures/{id}.
(B) Replacement IOPA is mandatory in POST /survival-review.

Tests both the resolver in _resolve_phase2_data_inline and the mandatory
IOPA validation in submit_survival_review.
"""
import os
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://prosthetic-preview.preview.emergentagent.com",
).rstrip("/")


def _load_env():
    if os.environ.get("MONGO_URL"):
        return
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))


_load_env()
_client = MongoClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _find_user(username):
    return (
        db.users.find_one({"username": username})
        or db.users.find_one({"email": f"{username}@dental.edu"})
        or db.users.find_one({"email": f"{username.lower()}@dental.edu"})
    )


ABHIJIT = _find_user("Abhijit.patil")
GAURAV = _find_user("Gaurav.pandey")


def _token(identifier, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed for {identifier}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tok_abhijit():
    return _token("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def tok_gaurav():
    return _token("Gaurav.pandey", "Student@123")


def _base_procedure(status="phase2_approved"):
    """A procedure with phase2_data + radiographs + existing_implants seeded
    so we can verify R{n} substitution at all readback positions."""
    return {
        "patient_name": "TEST_iter353 Patient",
        "patient_id": "TEST_iter353",
        "status": status,
        "supervisor_id": str(ABHIJIT["_id"]),
        "implant_incharge_id": str(ABHIJIT["_id"]),
        "created_by_id": str(GAURAV["_id"]),
        "student_id": str(GAURAV["_id"]),
        "implants": [
            {
                "tooth_number": 16,
                "system": "Alpha Bio ICE",
                "diameter": 5.0,
                "length": 13.0,
                "bone_type": "D3",
                "procedure_type": "Two Stage",
                "prosthetic_component": "Healing Abutment",
                "healing_abutment_mm": 5.0,
                "iopa_url": "r0.jpg",
            }
        ],
        "phase2_data": {
            "prosthetic_component": "Healing Abutment Placed",
            "healing_abutment_cuff_height": [5],
            "iopa_files": ["r0.jpg"],
        },
        "radiographs": {"iopas": ["r0.jpg"]},
        "existing_implants": [{"iopa_url": "r0.jpg"}],
    }


@pytest.fixture(scope="module")
def cleanup():
    ids = []
    yield ids
    for pid in ids:
        try:
            db.procedures.delete_one({"_id": ObjectId(pid)})
        except Exception:
            pass


def _insert(doc):
    return str(db.procedures.insert_one(doc).inserted_id)


def _submit_review(pid, tok, replacement, **failure_extra):
    payload = {
        "all_survived": False,
        "failures": [
            {
                "implant_idx": 0,
                "reason": "Mobility",
                "removed": True,
                "replaced": True,
                "replacement": replacement,
                **failure_extra,
            }
        ],
    }
    return requests.post(
        f"{BASE_URL}/api/procedures/{pid}/survival-review",
        headers={"Authorization": f"Bearer {tok}"},
        json=payload,
    )


# ============================================================
# 1) Mandatory IOPA on replacement
# ============================================================
class TestReplacementIopaRequired:
    def test_missing_iopa_returns_400(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            "placement_date": "2026-02-08",
            "procedure_type": "Single Stage",
            "prosthetic_component": "Cover Screw",
            # NO iopa_url
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 400, r.text
        assert "iopa" in r.text.lower() or "radiograph" in r.text.lower()

    def test_missing_placement_date_returns_400(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            # no placement_date
            "procedure_type": "Single Stage",
            "prosthetic_component": "Cover Screw",
            "iopa_url": "r1.jpg",
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 400
        assert "placement" in r.text.lower() or "date" in r.text.lower()

    def test_full_replacement_succeeds(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            "placement_date": "2026-02-08",
            "procedure_type": "Single Stage",
            "prosthetic_component": "Cover Screw",
            "iopa_url": "r1.jpg",
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 200, r.text


# ============================================================
# 2) R{n} → phase2_data substitution — Cover Screw path
# ============================================================
class TestPhase2DataSubstitutionCoverScrew:
    def test_cover_screw_substitution(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            "placement_date": "2026-02-08",
            "procedure_type": "Single Stage",
            "prosthetic_component": "Cover Screw",
            "iopa_url": "r1.jpg",
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 200, r.text

        g = requests.get(
            f"{BASE_URL}/api/procedures/{pid}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert g.status_code == 200
        d = g.json()

        # phase2_data readback shows R{n}
        p2 = d["phase2_data"]
        assert p2["prosthetic_component"] == "Cover Screw Placed"
        assert p2["iopa_files"][0] == "r1.jpg"
        # Healing cuff cleared because R{n} is Cover Screw
        assert p2["healing_abutment_cuff_height"][0] in ("", None)

        # radiographs + existing_implants also substituted
        assert d["radiographs"]["iopas"][0] == "r1.jpg"
        assert d["existing_implants"][0]["iopa_url"] == "r1.jpg"

        # implants[] merged view keeps R{n} iopa_url
        assert d["implants"][0]["iopa_url"] == "r1.jpg"

        # R0 snapshot preserved
        assert d["phase2_data_original"]["prosthetic_component"] == "Healing Abutment Placed"
        assert d["phase2_data_original"]["iopa_files"][0] == "r0.jpg"


# ============================================================
# 3) Immediate Loading path
# ============================================================
class TestPhase2DataSubstitutionImmediateLoading:
    def test_immediate_loading_substitution(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            "placement_date": "2026-02-08",
            "procedure_type": "Immediate Loading",
            "immediate_loading_prosthesis": "Provisional Crown",
            "iopa_url": "r1imm.jpg",
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 200, r.text

        g = requests.get(
            f"{BASE_URL}/api/procedures/{pid}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert g.status_code == 200
        p2 = g.json()["phase2_data"]
        assert p2["prosthetic_component"] == "Immediate Loading Done"
        assert p2["prosthesis_type"][0] == "Provisional Crown"
        assert p2["healing_abutment_cuff_height"][0] in ("", None)
        assert p2["iopa_files"][0] == "r1imm.jpg"


# ============================================================
# 4) Healing Abutment path with 6mm cuff
# ============================================================
class TestPhase2DataSubstitutionHealingAbutment:
    def test_healing_abutment_6mm(self, tok_abhijit, cleanup):
        pid = _insert(_base_procedure())
        cleanup.append(pid)
        repl = {
            "system": "Nobel Active",
            "diameter": 4.3,
            "length": 11.5,
            "placement_date": "2026-02-08",
            "procedure_type": "Two Stage",
            "prosthetic_component": "Healing Abutment",
            "healing_abutment_mm": 6.0,
            "iopa_url": "r1heal.jpg",
        }
        r = _submit_review(pid, tok_abhijit, repl)
        assert r.status_code == 200, r.text

        g = requests.get(
            f"{BASE_URL}/api/procedures/{pid}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        p2 = g.json()["phase2_data"]
        assert p2["prosthetic_component"] == "Healing Abutment Placed"
        assert p2["healing_abutment_cuff_height"][0] == 6.0
        assert p2["iopa_files"][0] == "r1heal.jpg"


# ============================================================
# 5) No survival review → no substitution, no phase2_data_original
# ============================================================
class TestNoSurvivalReviewNoSubstitution:
    def test_fresh_case_untouched(self, tok_abhijit, cleanup):
        doc = _base_procedure()
        pid = _insert(doc)
        cleanup.append(pid)
        # Ensure no survival review
        db.procedures.update_one(
            {"_id": ObjectId(pid)}, {"$unset": {"phase2_survival_review": ""}}
        )
        g = requests.get(
            f"{BASE_URL}/api/procedures/{pid}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert g.status_code == 200
        d = g.json()
        # phase2_data unchanged
        assert d["phase2_data"]["prosthetic_component"] == "Healing Abutment Placed"
        assert d["phase2_data"]["iopa_files"][0] == "r0.jpg"
        # NO original snapshot when there's nothing to substitute
        assert "phase2_data_original" not in d
        # implants[] unchanged (no _r0/_active_revision annotations)
        imp = d["implants"][0]
        assert "_r0" not in imp
        assert "_active_revision" not in imp


# ============================================================
# 6) Seed case regression — served fresh from DB
# ============================================================
class TestSeedCaseState:
    SEED_ID = "699fc5c2248100e8a0d87265"

    def test_seed_case_accessible(self, tok_abhijit):
        g = requests.get(
            f"{BASE_URL}/api/procedures/{self.SEED_ID}",
            headers={"Authorization": f"Bearer {tok_abhijit}"},
        )
        assert g.status_code == 200
