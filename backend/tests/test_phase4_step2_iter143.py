"""
Iteration 143 backend tests:
- POST /api/uploads/media-temp (PNG happy path, nurse 403, unsupported ext 400)
- POST /api/procedures/{id}/stage2/prosthetic/step2 validation:
    * full-arch: missing OPG -> 400
    * non-full-arch: missing IOPA for an implant_plan position -> 400
    * < 2 prosthesis_photos -> 400
    * happy path persists phase4_step2_iopa_uploads / opg_upload / prosthesis_photos
"""
import io
import os
import pytest
import requests
from PIL import Image
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = "https://dental-workflow-18.preview.emergentagent.com"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ── tiny helpers ────────────────────────────────────────────────
def login(identifier: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"identifier": identifier, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def png_bytes() -> bytes:
    img = Image.new("RGB", (4, 4), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def admin_token():
    return login("Abhijit.patil", "Admin@123")


@pytest.fixture(scope="module")
def student_token():
    return login("Gaurav.pandey", "Student@123")


@pytest.fixture(scope="module")
def nurse_token():
    """Find an existing nurse user; skip if not present."""
    client = MongoClient(MONGO_URL)
    user = client[DB_NAME].users.find_one({"role": "nurse"})
    client.close()
    if not user:
        pytest.skip("No nurse user seeded")
    # We need credentials. Try password Nurse@123 (common pattern), else skip.
    for pwd in ["Nurse@123", "nurse@123", "Password@123"]:
        r = requests.post(f"{API}/auth/login", json={"identifier": user.get("username", ""), "password": pwd}, timeout=20)
        if r.status_code == 200:
            return r.json()["access_token"]
    pytest.skip("Could not authenticate nurse user")


# ── /api/uploads/media-temp ─────────────────────────────────────
class TestMediaTemp:
    def test_png_happy_path(self, admin_token):
        r = requests.post(
            f"{API}/uploads/media-temp",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.png", png_bytes(), "image/png")},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "filename" in data and data["filename"].endswith(".png")
        assert data["original_name"] == "test.png"
        assert data["content_type"] == "image/png"

    def test_unsupported_ext_400(self, admin_token):
        r = requests.post(
            f"{API}/uploads/media-temp",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")},
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "not allowed" in r.text.lower() or "allowed" in r.text.lower()

    def test_nurse_403(self, nurse_token):
        r = requests.post(
            f"{API}/uploads/media-temp",
            headers={"Authorization": f"Bearer {nurse_token}"},
            files={"file": ("x.png", png_bytes(), "image/png")},
            timeout=20,
        )
        assert r.status_code == 403


# ── Phase 4 Step 2 validation ───────────────────────────────────
class TestPhase4Step2Submit:
    """We mutate an existing stage2_prosthetic_step1_approved case in DB then submit.
    We reset its status / fields after each test so the suite is idempotent."""

    @pytest.fixture(scope="class")
    def db(self):
        c = MongoClient(MONGO_URL)
        yield c[DB_NAME]
        c.close()

    @pytest.fixture(scope="class")
    def candidate_proc(self, db):
        proc = db.procedures.find_one({"status": "stage2_prosthetic_step1_approved"})
        if not proc:
            # Synthesize: take any procedure and mutate status to step1_approved.
            # Save original status for restoration in finalizer.
            proc = db.procedures.find_one({})
            if not proc:
                pytest.skip("No procedure in DB at all")
            self._original_status = proc.get("status")
            self._original_type = proc.get("implant_procedure_type")
            self._original_plans = proc.get("implant_plans")
            db.procedures.update_one({"_id": proc["_id"]}, {"$set": {"status": "stage2_prosthetic_step1_approved"}})
            proc = db.procedures.find_one({"_id": proc["_id"]})
        else:
            self._original_status = "stage2_prosthetic_step1_approved"
            self._original_type = proc.get("implant_procedure_type")
            self._original_plans = proc.get("implant_plans")
        return proc

    def _reset(self, db, proc):
        db.procedures.update_one({"_id": proc["_id"]}, {"$set": {
            "status": "stage2_prosthetic_step1_approved",
        }, "$unset": {
            "phase4_step2_iopa_uploads": "",
            "phase4_step2_opg_upload": "",
            "phase4_step2_prosthesis_photos": "",
            "phase4_step2_data": "",
            "phase4_step2_submitted_at": "",
        }})

    def test_full_arch_missing_opg_400(self, admin_token, db, candidate_proc):
        # Force full-arch
        db.procedures.update_one({"_id": candidate_proc["_id"]}, {"$set": {"implant_procedure_type": "All on 4"}})
        self._reset(db, candidate_proc)
        r = requests.post(
            f"{API}/procedures/{str(candidate_proc['_id'])}/stage2/prosthetic/step2",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "trial_checklist": {"a": True},
                "confirmation_statement": True,
                "prosthesis_photos": [
                    {"filename": "a.png", "label": "Frontal view"},
                    {"filename": "b.png", "label": "Occlusal view"},
                ],
            },
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "OPG" in r.text

    def test_non_full_arch_missing_iopa_400(self, admin_token, db, candidate_proc):
        # Force non-full-arch and ensure implant_plans exist
        plans = candidate_proc.get("implant_plans") or [{"position": "14", "brand": "X", "system": "Y", "diameter": 4.0, "length": 10}]
        db.procedures.update_one({"_id": candidate_proc["_id"]}, {"$set": {
            "implant_procedure_type": "Single",
            "implant_plans": plans,
        }})
        self._reset(db, candidate_proc)
        r = requests.post(
            f"{API}/procedures/{str(candidate_proc['_id'])}/stage2/prosthetic/step2",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "trial_checklist": {"a": True},
                "confirmation_statement": True,
                "iopa_uploads": {},
                "prosthesis_photos": [
                    {"filename": "a.png", "label": "Frontal view"},
                    {"filename": "b.png", "label": "Occlusal view"},
                ],
            },
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "IOPA" in r.text and "tooth" in r.text.lower()

    def test_lt2_photos_400(self, admin_token, db, candidate_proc):
        # full-arch path with valid OPG to isolate photo check
        db.procedures.update_one({"_id": candidate_proc["_id"]}, {"$set": {"implant_procedure_type": "All on 4"}})
        self._reset(db, candidate_proc)
        r = requests.post(
            f"{API}/procedures/{str(candidate_proc['_id'])}/stage2/prosthetic/step2",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "trial_checklist": {"a": True},
                "confirmation_statement": True,
                "opg_upload": {"filename": "opg.png", "original_name": "opg.png", "content_type": "image/png"},
                "prosthesis_photos": [{"filename": "only.png", "label": "Frontal view"}],
            },
            timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "2" in r.text and "prosthesis" in r.text.lower()

    def test_happy_path_persists(self, admin_token, db, candidate_proc):
        db.procedures.update_one({"_id": candidate_proc["_id"]}, {"$set": {"implant_procedure_type": "All on 4"}})
        self._reset(db, candidate_proc)
        opg = {"filename": "opg-uuid.png", "original_name": "opg.png", "content_type": "image/png"}
        photos = [
            {"filename": "p1.png", "label": "Frontal view"},
            {"filename": "p2.png", "label": "Occlusal view"},
        ]
        r = requests.post(
            f"{API}/procedures/{str(candidate_proc['_id'])}/stage2/prosthetic/step2",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "trial_checklist": {"a": True},
                "confirmation_statement": True,
                "opg_upload": opg,
                "prosthesis_photos": photos,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text

        # GET to verify persistence
        g = requests.get(
            f"{API}/procedures/{str(candidate_proc['_id'])}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert g.status_code == 200, g.text
        body = g.json()
        assert body.get("phase4_step2_opg_upload", {}).get("filename") == "opg-uuid.png"
        saved = body.get("phase4_step2_prosthesis_photos") or []
        assert len(saved) == 2
        assert saved[0]["filename"] == "p1.png"

        # cleanup -> back to step1_approved
        self._reset(db, candidate_proc)
