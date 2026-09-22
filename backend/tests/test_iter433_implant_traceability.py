"""
iter-433 — Implant Traceability (GS1 DataMatrix box code capture) backend tests.

Coverage:
  T1  GET /api/gtin/{gtin} returns {found:false,gtin} for unknown code.
  T2  POST /api/gtin (student) upserts; subsequent GET → found:true, uses ++.
  T3  Leading-zero normalisation (08...012 vs 8...012 resolve the same doc).
  T4  Nurse POST /api/gtin → 403.
  T5  gtin validation — 7 digits or non-numeric → 422.
  T6  POST /api/procedures/{id}/submit-phase2 with implant_traceability →
      persisted with whitelisted fields only, "evil" dropped, values >200
      chars truncated, recorded_by/recorded_at auto-populated.
  T7  Omitting implant_traceability leaves phase2_data intact (regression).
  T8  POST /api/procedures/{id}/case-report → PDF text contains
      'Implant Traceability (box codes):' and the GTIN/Lot/Serial/Expiry
      values with 'Source: Scanned'.
  T9  PATCH /api/procedures/{id}/tabbed-phase-data/2 (per_implant only)
      does NOT clobber phase2_data.implant_traceability.
"""
from __future__ import annotations
import io
import os
import pytest
import requests
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
NURSE = {"identifier": "Nurse.1", "password": "Nurse@123"}

# Gaurav-owned, phase1_approved cases with implant plans:
SINGLE_PROC_ID = "69cfae83a19e1d1819e0f6e5"   # Single Conventional, 1 implant
# Case with existing implant_traceability persisted from earlier work:
TRACE_PROC_ID = "69f640140ae04a75cf8d0cc7"

# GTINs used in the tests. Their validity is not enforced by the API
# (server-side check_digit validation is NOT applied — that is a client-side
# gate; the backend only requires 8..14 digits).
GTIN_KNOWN = "08123456789012"   # will be taught by T2 (already present per fixture)
GTIN_NEW = "00012345678905"     # valid check-digit


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _get(tok, pid):
    r = requests.get(f"{API}/procedures/{pid}", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = os.environ.get("DB_NAME", "test_database")
    c = MongoClient(url)
    try:
        yield c[dbname]
    finally:
        c.close()


@pytest.fixture(scope="module")
def tokens():
    return {"student": _login(STUDENT), "admin": _login(ADMIN), "nurse": _login(NURSE)}


def _reset_for_p2(mongo, pid, *, keep_p2_data=None):
    """Reset a procedure to phase1_approved with preop complete + consent."""
    set_op = {
        "status": "phase1_approved",
        "phase2_preop_completed_at": datetime.now(timezone.utc),
        "patient_consent_form": {
            "filename": "iter433_consent.pdf",
            "original_name": "iter433_consent.pdf",
            "content_type": "application/pdf",
            "uploaded_by_id": "iter433",
            "uploaded_by_name": "iter433 fixture",
            "uploaded_by_role": "supervisor",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "version": 1,
        },
    }
    if keep_p2_data is not None:
        set_op["phase2_data"] = keep_p2_data
    mongo.procedures.update_one({"_id": ObjectId(pid)}, {"$set": set_op})


# ─── T1: unknown GTIN lookup ─────────────────────────────────────────────
def test_01_unknown_gtin_returns_found_false(tokens, mongo):
    unknown = "09999999999999"
    # Ensure it's actually unknown (best effort — remove any prior entry)
    mongo.gtin_map.delete_many({"gtin_key": unknown.lstrip("0")})
    r = requests.get(f"{API}/gtin/{unknown}", headers=_hdr(tokens["student"]), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("found") is False, f"expected found=false, got {j}"
    assert j.get("gtin") == unknown


# ─── T2: student POST /api/gtin upserts + subsequent GET returns record ──
def test_02_post_gtin_and_lookup(tokens, mongo):
    mongo.gtin_map.delete_many({"gtin_key": GTIN_KNOWN.lstrip("0")})
    body = {
        "gtin": GTIN_KNOWN,
        "brand": "Nobel Biocare",
        "system": "NobelActive",
        "label": "Nobel Biocare NobelActive",
    }
    r = requests.post(f"{API}/gtin", headers=_hdr(tokens["student"]), json=body, timeout=15)
    assert r.status_code == 200, f"POST /gtin failed: {r.status_code} {r.text}"
    j = r.json()
    assert j.get("ok") is True
    assert j.get("brand") == "Nobel Biocare"

    # GET should return found:true and increment uses.
    g1 = requests.get(f"{API}/gtin/{GTIN_KNOWN}", headers=_hdr(tokens["student"]), timeout=15).json()
    assert g1.get("found") is True, g1
    assert g1.get("brand") == "Nobel Biocare"
    assert g1.get("system") == "NobelActive"
    assert g1.get("label") == "Nobel Biocare NobelActive"
    uses1 = g1.get("uses", 0)

    g2 = requests.get(f"{API}/gtin/{GTIN_KNOWN}", headers=_hdr(tokens["student"]), timeout=15).json()
    assert g2.get("uses", 0) >= uses1 + 1, f"uses did not increment: {uses1} → {g2.get('uses')}"


# ─── T3: leading-zero normalisation ──────────────────────────────────────
def test_03_leading_zero_normalisation(tokens):
    # Test uses the GTIN taught in T2; both 8123... and 08123... must hit
    # the same learning-map row.
    stripped = GTIN_KNOWN.lstrip("0")
    r_full = requests.get(f"{API}/gtin/{GTIN_KNOWN}", headers=_hdr(tokens["student"]), timeout=15).json()
    r_stripped = requests.get(f"{API}/gtin/{stripped}", headers=_hdr(tokens["student"]), timeout=15).json()
    assert r_full.get("found") is True, r_full
    assert r_stripped.get("found") is True, r_stripped
    assert r_full.get("brand") == r_stripped.get("brand") == "Nobel Biocare"


# ─── T4: nurse cannot POST /api/gtin ─────────────────────────────────────
def test_04_nurse_post_gtin_forbidden(tokens):
    body = {"gtin": "07777777777770", "brand": "X", "system": "Y", "label": "XY"}
    r = requests.post(f"{API}/gtin", headers=_hdr(tokens["nurse"]), json=body, timeout=15)
    assert r.status_code == 403, f"nurse should be 403, got {r.status_code}: {r.text}"


# ─── T5: gtin validation (must be 8..14 digits) ──────────────────────────
def test_05_gtin_validation_422(tokens):
    for bad in ("1234567", "1234567A", "123456789012345", "abcdefgh"):
        r = requests.post(
            f"{API}/gtin",
            headers=_hdr(tokens["student"]),
            json={"gtin": bad, "brand": "B", "system": "", "label": ""},
            timeout=15,
        )
        assert r.status_code == 422, (
            f"bad gtin {bad!r} should be 422, got {r.status_code}: {r.text}"
        )


# ─── T6: submit-phase2 with implant_traceability whitelist + truncation ──
def test_06_submit_phase2_with_traceability(tokens, mongo):
    _reset_for_p2(mongo, SINGLE_PROC_ID, keep_p2_data={})
    long_lot = "L" * 250
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "implant_seated_correctly": True,
        "torque_values": [35.0],
        "prosthetic_component": "Cover Screw",
        "healing_abutment_cuff_height": "3mm",
        "sutures_placed": True,
        "hemostasis_achieved": True,
        "post_op_checklist": {"analgesic_prescribed": True},
        "implant_traceability": {
            "14": {
                "gtin": GTIN_KNOWN,
                "lot": long_lot,   # will be truncated to 200
                "serial": "SN00123",
                "expiry": "2027-12-31",
                "mfg_date": "2024-01-15",
                "raw": "(01)08123456789012(10)LOT2024A(21)SN00123(17)271231",
                "model_brand": "Nobel Biocare",
                "model_system": "NobelActive",
                "model_label": "Nobel Biocare NobelActive",
                "label_photo": "trace_label_iter433.jpg",
                "source": "scan",
                "scanned_at": "2026-01-20T10:00:00Z",
                "evil": "should be dropped",
            }
        },
    }
    r = requests.post(
        f"{API}/procedures/{SINGLE_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, f"submit-phase2 failed {r.status_code}: {r.text}"

    proc = _get(tokens["student"], SINGLE_PROC_ID)
    trace = ((proc.get("phase2_data") or {}).get("implant_traceability") or {})
    assert "14" in trace, f"traceability['14'] missing: {trace!r}"
    rec = trace["14"]
    # Whitelisted fields present
    assert rec.get("gtin") == GTIN_KNOWN
    assert rec.get("serial") == "SN00123"
    assert rec.get("expiry") == "2027-12-31"
    assert rec.get("mfg_date") == "2024-01-15"
    assert rec.get("model_brand") == "Nobel Biocare"
    assert rec.get("model_system") == "NobelActive"
    assert rec.get("model_label") == "Nobel Biocare NobelActive"
    assert rec.get("source") == "scan"
    # 'evil' dropped
    assert "evil" not in rec, f"unknown key was NOT dropped: keys={list(rec)}"
    # long values truncated to 200
    assert rec.get("lot") is not None and len(rec["lot"]) <= 200, (
        f"lot not truncated: len={len(rec.get('lot') or '')}"
    )
    # Server-added meta
    assert rec.get("recorded_by"), f"recorded_by missing: {rec}"
    assert rec.get("recorded_at"), f"recorded_at missing: {rec}"


# ─── T7: omitting implant_traceability → no key added, existing untouched
def test_07_omit_traceability_does_not_add_key(tokens, mongo):
    # Reset with a phase2_data that has NO implant_traceability at all.
    _reset_for_p2(mongo, SINGLE_PROC_ID, keep_p2_data={})
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "torque_values": [30.0],
        "prosthetic_component": "Healing Abutment",
        "sutures_placed": True,
        "hemostasis_achieved": True,
    }
    r = requests.post(
        f"{API}/procedures/{SINGLE_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    proc = _get(tokens["student"], SINGLE_PROC_ID)
    p2 = proc.get("phase2_data") or {}
    assert "implant_traceability" not in p2, (
        f"implant_traceability should NOT be added when omitted, got keys={list(p2)}"
    )
    # Regression: submit still worked and the surgical fields are present.
    assert p2.get("flap_design") == "Full Thickness"
    assert p2.get("prosthetic_component") == "Healing Abutment"


# ─── T8: case-report PDF contains traceability block ─────────────────────
def test_08_case_report_pdf_includes_traceability(tokens):
    # Use TRACE_PROC_ID which already has implant_traceability persisted.
    r = requests.post(
        f"{API}/procedures/{TRACE_PROC_ID}/case-report",
        headers={"Authorization": f"Bearer {tokens['student']}"},
        timeout=60,
    )
    assert r.status_code == 200, f"case-report failed {r.status_code}: {r.text[:400]}"
    ctype = r.headers.get("content-type", "").lower()
    assert "pdf" in ctype, f"expected PDF, got content-type={ctype}"
    body = r.content
    assert body[:4] == b"%PDF", f"not a PDF (magic={body[:8]!r})"
    # Extract text.
    try:
        from pypdf import PdfReader  # newer name
    except Exception:  # pragma: no cover
        from PyPDF2 import PdfReader  # type: ignore
    reader = PdfReader(io.BytesIO(body))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    assert "Implant Traceability (box codes):" in text, (
        f"traceability header missing in PDF. First 800 chars: {text[:800]!r}"
    )
    # Find at least one GTIN/Lot/Serial/Expiry/Source pair.
    # The exact GTIN depends on what was previously saved on this case;
    # we validate the label markers are present.
    for marker in ("GTIN:", "Lot:", "Serial:", "Expiry:", "Source:"):
        assert marker in text, f"marker {marker!r} missing in PDF text"
    # And at least one 'Source: Scanned' or 'Source: Manual' — allow for
    # multi_cell line-wrap where pypdf may split label/value.
    import re
    joined = re.sub(r"\s+", " ", text)
    assert re.search(r"Source:\s*(Scanned|Manual)", joined), (
        f"no Source line found in traceability block. Joined tail: {joined[-800:]!r}"
    )
    # And the GTIN saved on this case is echoed in the PDF.
    assert "08123456789012" in joined, (
        f"expected GTIN 08123456789012 in PDF, tail: {joined[-800:]!r}"
    )


# ─── T9: PATCH tabbed-phase-data/2 does not remove implant_traceability ──
def test_09_patch_tabbed_phase2_preserves_traceability(tokens, mongo):
    # Seed a known traceability record and per_implant baseline.
    seeded_trace = {
        "14": {
            "gtin": GTIN_KNOWN,
            "lot": "LOT2024A",
            "serial": "SN00123",
            "expiry": "2027-12-31",
            "model_label": "Nobel Biocare NobelActive",
            "source": "scan",
            "recorded_by": "iter433 fixture",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
    }
    mongo.procedures.update_one(
        {"_id": ObjectId(SINGLE_PROC_ID)},
        {"$set": {"phase2_data.implant_traceability": seeded_trace}},
    )

    # Now PATCH per_implant with an unrelated key.
    r = requests.patch(
        f"{API}/procedures/{SINGLE_PROC_ID}/tabbed-phase-data/2",
        headers=_hdr(tokens["student"]),
        json={"per_implant": {"14": {"torque": 40, "isq": 72}}},
        timeout=15,
    )
    assert r.status_code == 200, f"patch tabbed failed {r.status_code}: {r.text}"

    # GET and assert traceability still there.
    proc = _get(tokens["student"], SINGLE_PROC_ID)
    p2 = proc.get("phase2_data") or {}
    trace = p2.get("implant_traceability") or {}
    assert trace.get("14", {}).get("gtin") == GTIN_KNOWN, (
        f"implant_traceability was clobbered by PATCH: {trace!r}"
    )
    # And per_implant was written.
    pi = (p2.get("per_implant") or {}).get("14") or {}
    assert pi.get("torque") == 40 and pi.get("isq") == 72, (
        f"per_implant PATCH did not persist: {pi!r}"
    )
