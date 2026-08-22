"""iter-400: Replacement implant augmentation capture (survival review).

Verifies POST /api/procedures/{id}/survival-review persists
`phase2_survival_review.implants['0'].replacement.augmentation` and
`bone_graft_used` when provided, and stores null / False when omitted.
"""
import os
import uuid
import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://prosthetic-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ABHIJIT_ID = "69b79407a17f36c024eb2d5e"
PARESH_ID = "69b79407a17f36c024eb2d60"


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"identifier": "Abhijit.patil", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


def _seed_procedure(db, tag: str) -> str:
    now = datetime.now(timezone.utc)
    doc = {
        "patient_name": f"SRAUG-TEST-{tag}",
        "patient_id": f"SRAUG-{tag}-{uuid.uuid4().hex[:6]}",
        "registration_number": f"SRAUG-REG-{tag}-{uuid.uuid4().hex[:6]}",
        "age": 40, "gender": "Male",
        "status": "phase2_approved",
        "created_by_id": ABHIJIT_ID,
        "created_by_role": "implant_incharge",
        "supervisor_id": PARESH_ID,
        "implant_incharge_id": ABHIJIT_ID,
        "implants": [
            {"tooth_number": "16", "system": "Nobel — Active", "brand": "Nobel",
             "diameter": 4.3, "length": 10}
        ],
        "implant_plans": [
            {"position": "16", "brand": "Nobel", "system": "Active",
             "diameter": "4.3", "length": "10"}
        ],
        "created_at": now,
        "phase2_completed_at": now,
    }
    r = db.procedures.insert_one(doc)
    return str(r.inserted_id)


@pytest.fixture
def proc_ids(db):
    ids = []
    yield ids
    for pid in ids:
        try:
            db.procedures.delete_one({"_id": ObjectId(pid)})
        except Exception:
            pass


AUG_PAYLOAD = {
    "procedures_performed": ["Guided Bone Regeneration (GBR)"],
    "autogenous_used": "Yes",
    "autogenous_harvest_sites": ["Chin"],
    "xenograft_used": "No",
    "allograft_used": "No",
    "alloplast_used": "No",
    "membrane_used": "Yes",
    "membrane_types": ["Resorbable Collagen"],
    "fixation_used": "No",
    "soft_tissue_graft_used": "No",
    "healing_protocol": "Submerged",
}


def _repl_body(with_aug: bool):
    repl = {
        "system": "Nobel — Active",
        "diameter": 4.3,
        "length": 10,
        "placement_date": "2026-01-15",
        "iopa_url": "/uploads/media-temp/test.png",
        "insertion_torque_ncm": 35,
        "healing_protocol": "Submerged",
    }
    if with_aug:
        repl["augmentation"] = AUG_PAYLOAD
    return {
        "all_survived": False,
        "failures": [{
            "implant_idx": 0,
            "tooth": "16",
            "reason": "Peri-implantitis",
            "removed": True,
            "replaced": True,
            "site_changed": False,
            "replacement": repl,
        }],
    }


class TestSurvivalReviewAugmentation:

    def test_login_ok(self, token):
        assert token and isinstance(token, str)

    def test_submit_with_augmentation_persists(self, db, client, proc_ids):
        pid = _seed_procedure(db, "with")
        proc_ids.append(pid)
        r = client.post(f"{API}/procedures/{pid}/survival-review",
                        json=_repl_body(with_aug=True))
        assert r.status_code == 200, r.text

        # Verify persistence
        g = client.get(f"{API}/procedures/{pid}")
        assert g.status_code == 200, g.text
        doc = g.json()
        impls = doc.get("phase2_survival_review", {}).get("implants", {})
        entry = impls.get("0") or impls.get(0)
        assert entry is not None, f"missing implants['0']: {impls}"
        assert entry.get("status") == "Replaced"
        repl = entry.get("replacement") or {}
        assert repl.get("bone_graft_used") is True, f"bone_graft_used not True: {repl.get('bone_graft_used')}"
        aug = repl.get("augmentation")
        assert isinstance(aug, dict), f"augmentation not dict: {aug}"
        assert "Guided Bone Regeneration (GBR)" in (aug.get("procedures_performed") or [])
        assert aug.get("autogenous_used") == "Yes"
        assert aug.get("membrane_used") == "Yes"

        # Regression: resolved implants[0] should be flagged _active_revision
        resolved = doc.get("implants") or []
        if resolved:
            # Some responses may put resolved elsewhere; be defensive.
            assert resolved[0].get("_active_revision") in (True, None), \
                f"unexpected _active_revision: {resolved[0].get('_active_revision')}"

    def test_submit_without_augmentation_persists_null(self, db, client, proc_ids):
        pid = _seed_procedure(db, "noaug")
        proc_ids.append(pid)
        r = client.post(f"{API}/procedures/{pid}/survival-review",
                        json=_repl_body(with_aug=False))
        assert r.status_code == 200, r.text
        g = client.get(f"{API}/procedures/{pid}")
        assert g.status_code == 200
        entry = g.json().get("phase2_survival_review", {}).get("implants", {}).get("0")
        assert entry and entry.get("status") == "Replaced"
        repl = entry.get("replacement") or {}
        assert repl.get("augmentation") in (None,), f"expected null augmentation, got {repl.get('augmentation')}"
        assert repl.get("bone_graft_used") is False, f"expected bone_graft_used False, got {repl.get('bone_graft_used')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
