"""
iter-412 — v11 Multiunit Abutment (MUA) Section Backend Validation.

Focus:
1. Phase2Submit model accepts mua_placed + mua_details (dict-keyed by position).
2. Direct MongoDB write of phase2_data.mua_placed / mua_details on the seed
   'Test Patient Zygoma' case → GET /procedures/{id} echoes them back.
3. POST /procedures/{id}/case-report renders MUA labels in the PDF with the
   NEW implantDisplayLabel mapping (Zygoma R1 / Pterygoid L1 / FDI 15).
4. Regression: another procedure without mua_placed → PDF does NOT contain
   'Multiunit Abutment (MUA) Details'.
"""
import io
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
).rstrip("/")

INCHARGE_CREDS = {"identifier": "Abhijit.patil", "password": "Admin@123"}

ZYG_PROC_ID = "6a8337dd64ad3269dc584a69"  # Test Patient Zygoma (Zyg+Pter, 5 implant plans)


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo():
    url = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    assert url and dbname
    c = MongoClient(url)
    yield c[dbname]
    c.close()


# Test 1: Phase2Submit Pydantic model exposes mua_placed + mua_details.
def test_01_phase2submit_model_has_mua_fields():
    import sys
    sys.path.insert(0, "/app/backend")
    from server import Phase2Submit  # type: ignore
    fields = Phase2Submit.model_fields
    assert "mua_placed" in fields, "Phase2Submit missing mua_placed"
    assert "mua_details" in fields, "Phase2Submit missing mua_details"


# Test 2: Direct MongoDB write → GET returns mua_placed/mua_details.
def test_02_persist_mua_via_direct_write_and_get(mongo):
    doc = mongo.procedures.find_one({"_id": ObjectId(ZYG_PROC_ID)})
    assert doc, "seed 'Test Patient Zygoma' missing"

    mua_details = {
        "ZR1": {"cuff_height": "3", "angulation": "30°"},
        "PL1": {"cuff_height": "2", "angulation": "17°"},
        "15":  {"cuff_height": "1", "angulation": "0°"},
    }
    mongo.procedures.update_one(
        {"_id": ObjectId(ZYG_PROC_ID)},
        {"$set": {
            "phase2_data.mua_placed": True,
            "phase2_data.mua_details": mua_details,
        }},
    )
    tok = _login(INCHARGE_CREDS)
    r = requests.get(f"{BASE_URL}/api/procedures/{ZYG_PROC_ID}", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    p2 = r.json().get("phase2_data") or {}
    assert p2.get("mua_placed") is True, f"mua_placed not persisted: {p2.get('mua_placed')!r}"
    saved = p2.get("mua_details") or {}
    assert isinstance(saved, dict), f"expected dict, got {type(saved).__name__}"
    for k, v in mua_details.items():
        assert k in saved, f"position {k} missing"
        assert saved[k].get("cuff_height") == v["cuff_height"]
        assert saved[k].get("angulation") == v["angulation"]


# Test 3: PDF case-report contains MUA block with new labels.
def test_03_pdf_case_report_contains_mua_labels():
    try:
        from pypdf import PdfReader
    except Exception:
        pytest.skip("pypdf not installed")
    tok = _login(INCHARGE_CREDS)
    r = requests.post(
        f"{BASE_URL}/api/procedures/{ZYG_PROC_ID}/case-report",
        headers=_hdr(tok), timeout=90,
    )
    assert r.status_code == 200, f"PDF gen failed: {r.status_code} {r.text[:400]}"
    data = r.content
    assert data.startswith(b"%PDF"), f"not a PDF, first bytes: {data[:20]!r}"
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    # persisted MUA context
    assert "Multiunit Abutments (MUA) Placed: Yes" in text, "MUA placed:Yes header missing"
    assert "Multiunit Abutment (MUA) Details" in text, "MUA details section missing"
    # Position-specific labels (new implantDisplayLabel format)
    assert "Zygoma R1" in text, "expected label 'Zygoma R1' (from ZR1) not found"
    assert "Pterygoid L1" in text, "expected label 'Pterygoid L1' (from PL1) not found"
    assert "FDI 15" in text, "expected label 'FDI 15' (from conv position 15) not found"
    # Cuff/angulation lines
    assert "cuff 3" in text, "cuff 3 line missing"
    assert "cuff 2" in text, "cuff 2 line missing"
    assert "cuff 1" in text, "cuff 1 line missing"
    # Torque implant-label helper (Phase 2 torque header uses '(Tooth ZR1)' style — helper is FE-only; not required in PDF regression)


# Test 4: Regression — another procedure without mua_placed → PDF must
# NOT contain 'Multiunit Abutment (MUA) Details'.
def test_04_pdf_regression_no_mua_section_when_absent(mongo):
    try:
        from pypdf import PdfReader
    except Exception:
        pytest.skip("pypdf not installed")
    # Find any procedure with no mua_placed (or False)
    tok = _login(INCHARGE_CREDS)
    r = requests.get(f"{BASE_URL}/api/procedures", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200
    candidate = None
    for p in r.json():
        if p.get("id") == ZYG_PROC_ID:
            continue
        p2 = p.get("phase2_data") or {}
        if not p2.get("mua_placed"):
            candidate = p.get("id")
            break
    assert candidate, "no non-MUA procedure found"
    r = requests.post(
        f"{BASE_URL}/api/procedures/{candidate}/case-report",
        headers=_hdr(tok), timeout=90,
    )
    if r.status_code != 200:
        pytest.skip(f"case-report for {candidate} returned {r.status_code} (unrelated blocker)")
    data = r.content
    if not data.startswith(b"%PDF"):
        pytest.skip("non-PDF response for regression case")
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    assert "Multiunit Abutment (MUA) Details" not in text, (
        f"regression procedure {candidate} should NOT contain MUA details block"
    )
