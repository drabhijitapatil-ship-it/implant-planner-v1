"""
Chunk 2 v9 — Phase 1 Zygoma/Pterygoid PDF Export tests.

Covers:
  1. Zygoma case with populated phase1 data → PDF contains the extended section
     with Configuration, Diagnostic Summary and ZAGA/Cawood-Howell values.
  2. Non-Zygoma completed case → PDF does NOT contain the extended section.
  3. Empty zygoma_pterygoid_data on a Zygoma case → section title still
     renders (with just the Configuration line if any), no crash.

Uses the public EXPO_PUBLIC_BACKEND_URL (with /api prefix) so we exercise the
same path Expo web/native does. Uses pymongo (sync) directly for seeding
phase1 data because the public PATCH endpoint only accepts phase2-5.
"""
import io
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId
from pypdf import PdfReader


def _extract_pdf_text(body: bytes) -> str:
    """Extract concatenated text from all pages of a PDF byte-stream."""
    reader = PdfReader(io.BytesIO(body))
    out = []
    for p in reader.pages:
        try:
            out.append(p.extract_text() or "")
        except Exception:
            pass
    return "\n".join(out)

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_ID = "Abhijit.patil"
ADMIN_PW = "Admin@123"

SEEDED_PHASE1 = {
    "diagnostic_summary": {
        "cawood_howell": "V",
        "bedrossian": "3",
        "zaga_right": "2",
        "zaga_left": "1",
    },
    "medical_assessment": {
        "immunosuppression": "None",
        "asa_grade": "II",
    },
    "anaesthesia_plan": "GA + LA infiltration",
    "team_composition": {"primary_surgeon": "Dr. Patil"},
    "zygomatic_region": {
        "body_height_mm": {"right": "18", "left": "17"},
    },
}


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_ID, "password": ADMIN_PW},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


def _find_procedure(mongo, name_substring, zygoma=True):
    """Return the first procedure whose patient_name contains substring."""
    q = {"patient_name": {"$regex": name_substring, "$options": "i"}}
    docs = list(mongo.procedures.find(q))
    if zygoma:
        docs = [d for d in docs if "zygoma" in str(d.get("implant_procedure_type", "")).lower()
                or "pterygoid" in str(d.get("implant_procedure_type", "")).lower()]
    return docs[0] if docs else None


# ─────────────────────────────────────────────────────────────
# Test 1: Zygoma case with populated phase1 data
# ─────────────────────────────────────────────────────────────
def test_zygoma_case_with_data_pdf_contains_extended_section(auth, mongo):
    proc = _find_procedure(mongo, "Test Patient Zygoma", zygoma=True)
    if not proc:
        # Fallback: first Zygoma case in the DB
        docs = list(mongo.procedures.find({
            "implant_procedure_type": {"$regex": "zygoma|pterygoid", "$options": "i"}
        }))
        assert docs, "No Zygoma/Pterygoid procedures found in DB"
        proc = docs[0]
    proc_id = str(proc["_id"])

    # Seed phase1 data (idempotent — writes into zygoma_pterygoid_data.phase1)
    existing = proc.get("zygoma_pterygoid_data") or {}
    existing["phase1"] = SEEDED_PHASE1
    upd = {"zygoma_pterygoid_data": existing}
    if not proc.get("zygoma_pterygoid_configuration"):
        upd["zygoma_pterygoid_configuration"] = "Quad zygoma"
    if not proc.get("conventional_implant_locations"):
        upd["conventional_implant_locations"] = ["11", "21"]
    mongo.procedures.update_one({"_id": ObjectId(proc_id)}, {"$set": upd})

    # POST case-report
    r = requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/case-report",
        headers=auth,
        timeout=60,
    )
    assert r.status_code == 200, f"case-report failed {r.status_code}: {r.text[:200]}"
    ctype = r.headers.get("content-type", "")
    assert "pdf" in ctype.lower(), f"Expected PDF content-type, got {ctype}"
    body = r.content
    assert body[:4] == b"%PDF", "Response is not a PDF byte-stream"

    # PDF streams are FlateDecode-compressed — extract text via pypdf.
    text = _extract_pdf_text(body)

    def _has(sub: str) -> bool:
        return sub in text

    assert _has("Zygoma / Pterygoid Extended Data"), \
        "Extended-data section title missing from PDF"
    assert _has("Configuration"), "Configuration label missing"
    assert _has("Diagnostic Summary"), "Diagnostic Summary sub-heading missing"
    # ZAGA / Cawood-Howell values from the seeded data
    assert _has("Cawood-Howell"), "Cawood-Howell label missing"
    assert _has("Team Composition"), "Team Composition sub-heading missing"


# ─────────────────────────────────────────────────────────────
# Test 2: Non-Zygoma case regression — no extended section
# ─────────────────────────────────────────────────────────────
def test_non_zygoma_case_regression(auth, mongo):
    # Pick a non-zygoma procedure with a phase1_completed_at (completed enough
    # to have a case-report).
    q = {"implant_procedure_type": {"$not": {"$regex": "zygoma|pterygoid", "$options": "i"}}}
    docs = list(mongo.procedures.find(q).limit(20))
    assert docs, "No non-Zygoma procedures found"
    # Prefer one with phase1_completed_at
    docs.sort(key=lambda d: 0 if d.get("phase1_completed_at") else 1)
    proc = docs[0]
    proc_id = str(proc["_id"])

    r = requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/case-report",
        headers=auth,
        timeout=60,
    )
    assert r.status_code == 200, f"case-report failed {r.status_code}: {r.text[:200]}"
    assert r.content[:4] == b"%PDF"
    text = _extract_pdf_text(r.content)
    assert "Zygoma / Pterygoid Extended Data" not in text, \
        f"Extended section unexpectedly present in non-Zygoma PDF for proc {proc_id}"


# ─────────────────────────────────────────────────────────────
# Test 3: Zygoma case with EMPTY phase1 data — no crash, section title only
# ─────────────────────────────────────────────────────────────
def test_zygoma_case_empty_phase1_data_no_crash(auth, mongo):
    docs = list(mongo.procedures.find({
        "implant_procedure_type": {"$regex": "zygoma|pterygoid", "$options": "i"}
    }))
    assert docs, "No Zygoma procedures in DB"
    # Take a case (prefer 'Test v4 workflow') and blank out phase1 data.
    tv4 = next((d for d in docs if "v4 workflow" in str(d.get("patient_name", "")).lower()), None)
    proc = tv4 or docs[0]
    proc_id = str(proc["_id"])

    mongo.procedures.update_one(
        {"_id": ObjectId(proc_id)},
        {"$set": {"zygoma_pterygoid_data": {}, "zygoma_pterygoid_configuration": "Quad zygoma"}},
    )

    r = requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/case-report",
        headers=auth,
        timeout=60,
    )
    assert r.status_code == 200, f"case-report failed {r.status_code}: {r.text[:200]}"
    assert r.content[:4] == b"%PDF"
    text = _extract_pdf_text(r.content)
    assert "Zygoma / Pterygoid Extended Data" in text, \
        "Section title should still render for empty phase1 on a Zygoma case"
    assert "Configuration" in text, "Configuration line should render"
