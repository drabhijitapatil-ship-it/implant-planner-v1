"""iter-443 — Prescription (Rx) auto-approval tied to Phase 2.

Backend-only pytest regression validating the unverified-critical-path parts
of the Rx feature:

  T1  submit-phase2 WITHOUT creator signature on a drafted Rx → 400 with the
      'Please sign the prescription' message.
  T2  submit-phase2 by the student with a drafted + creator-signed Rx →
      Phase 2 lands in pending_phase2 AND Rx status flips to 'pending'.
  T3  dual-approve path: supervisor approve then in-charge approve brings the
      case to phase2_approved AND the pending Rx becomes 'approved'
      (with approved_by stamped and locked).
  T4  in-charge SELF-created case + in-charge SUBMITS Phase 2 with a signed
      Rx → status goes straight to phase2_approved and the Rx is auto-approved
      in one call.
  T5  prescription/pdf endpoint returns a valid application/pdf stream for a
      case with drugs (and 400 for one without).

Preconditions / state management
  * Resets each procedure's state via direct Mongo access between tests
    (patterns borrowed from iter-420).
  * Uses `/api/procedures/{id}/prescription` + `/sign` + `/approve` endpoints
    plus `/submit-phase2` and `/approve` for the case workflow.
"""
from __future__ import annotations
import os
from datetime import datetime, timezone

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or ""
).rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

# Gaurav-owned conventional case (iter-420 fixture). student=Gaurav,
# supervisor=Paresh, in-charge=Abhijit, patient_consent_form present.
CONV_PROC_ID = "6a6b7fbf6633443cf356df15"

# Abhijit-self-created case: student_id==created_by==supervisor_id==incharge_id
# → the "incharge self-created" path.
IC_SELF_PROC_ID = "69cfb0cea19e1d1819e0f734"

# Phase 2 minimal payload (iter-420 shape).
P2_PAYLOAD = {
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
}

# A 'signature' with enough strokes to satisfy the signature gate (>8 points).
SIG_STROKES = [[[10, 10], [20, 12], [30, 14], [40, 18], [50, 22], [60, 24], [70, 26], [80, 28], [90, 30]]]


# ─── helpers ──────────────────────────────────────────────────────────────
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
    c = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    try:
        yield c[os.environ.get("DB_NAME", "test_database")]
    finally:
        c.close()


@pytest.fixture(scope="module")
def tokens():
    return {
        "student": _login(STUDENT),
        "supervisor": _login(SUPERVISOR),
        "admin": _login(ADMIN),
    }


def _reset_to_phase1_approved(mongo, pid, ensure_consent=True, clear_rx=True):
    """Reset a procedure so submit-phase2 preconditions are satisfied."""
    set_op = {
        "status": "phase1_approved",
        "phase2_preop_completed_at": datetime.now(timezone.utc),
        "phase2_data": {},
        "supervisor_phase2_approved": False,
        "implant_incharge_phase2_approved": False,
    }
    unset_op = {
        "supervisor_phase2_approved_at": "",
        "implant_incharge_phase2_approved_at": "",
        "phase2_completed_at": "",
        "fully_completed_at": "",
        "phase2_submitted_at": "",
    }
    if ensure_consent:
        set_op["patient_consent_form"] = {
            "filename": "iter443_consent.pdf",
            "original_name": "iter443_consent.pdf",
            "content_type": "application/pdf",
            "uploaded_by_id": "iter443",
            "uploaded_by_name": "iter443 fixture",
            "uploaded_by_role": "supervisor",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "version": 1,
        }
    if clear_rx:
        unset_op["prescription"] = ""
    mongo.procedures.update_one(
        {"_id": ObjectId(pid)},
        {"$set": set_op, "$unset": unset_op},
    )


def _put_rx_with_drugs(tok, pid, drugs=None):
    body = {
        "diagnosis": "Post-op dental implant",
        "allergies": "",
        "advice": "Soft diet for 2 days.",
        "drugs": drugs or [
            {"name": "Amoxiclav 625", "strength": "625 mg", "form": "Tablet",
             "dosage": "1 tab", "frequency": "1-0-1 (BD)", "duration": "5 days",
             "timing": "After food", "notes": "Antibiotic"},
            {"name": "Ibuprofen", "strength": "400 mg", "form": "Tablet",
             "dosage": "1 tab", "frequency": "1-1-1 (TDS)", "duration": "3 days",
             "timing": "After food", "notes": "Analgesic"},
        ],
    }
    r = requests.put(f"{API}/procedures/{pid}/prescription",
                     headers=_hdr(tok), json=body, timeout=20)
    return r


def _sign_rx(tok, pid):
    body = {"strokes": SIG_STROKES, "pad_width": 400, "pad_height": 150}
    r = requests.post(f"{API}/procedures/{pid}/prescription/sign",
                      headers=_hdr(tok), json=body, timeout=20)
    return r


# ─── T1: submit-phase2 blocked when creator hasn't signed the drafted Rx ──
def test_01_submit_phase2_blocked_without_creator_signature(tokens, mongo):
    _reset_to_phase1_approved(mongo, CONV_PROC_ID)

    # Draft Rx with drugs but no signature.
    r = _put_rx_with_drugs(tokens["student"], CONV_PROC_ID)
    assert r.status_code == 200, f"PUT rx failed: {r.status_code} {r.text}"
    rx = r.json()
    assert rx.get("status") == "draft"
    assert len(rx.get("drugs") or []) == 2
    assert not (rx.get("signatures") or {}).get("creator")

    # Attempt submit-phase2 — must be blocked with the specific message.
    r2 = requests.post(f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
                       headers=_hdr(tokens["student"]), json=P2_PAYLOAD, timeout=30)
    assert r2.status_code == 400, f"expected 400 got {r2.status_code}: {r2.text}"
    assert "sign the prescription" in r2.text.lower(), r2.text

    # Case must NOT advance.
    proc = _get(tokens["student"], CONV_PROC_ID)
    assert proc.get("status") == "phase1_approved"


# ─── T2: student signs → submit-phase2 flips Rx to 'pending' ──────────────
def test_02_submit_phase2_with_signed_rx_marks_pending(tokens, mongo):
    _reset_to_phase1_approved(mongo, CONV_PROC_ID)

    # Create drugs + creator signs.
    r = _put_rx_with_drugs(tokens["student"], CONV_PROC_ID)
    assert r.status_code == 200, r.text

    rs = _sign_rx(tokens["student"], CONV_PROC_ID)
    assert rs.status_code == 200, f"sign failed: {rs.status_code} {rs.text}"
    rx = rs.json()
    assert (rx.get("signatures") or {}).get("creator"), "creator signature missing after sign"
    assert rx.get("status") == "draft"

    # Submit phase 2 by the student.
    r2 = requests.post(f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
                       headers=_hdr(tokens["student"]), json=P2_PAYLOAD, timeout=30)
    assert r2.status_code == 200, f"submit-phase2 failed: {r2.status_code} {r2.text}"

    proc = _get(tokens["student"], CONV_PROC_ID)
    assert proc.get("status") == "pending_phase2"
    rx = proc.get("prescription") or {}
    assert rx.get("status") == "pending", f"expected pending, got {rx.get('status')}"
    assert rx.get("submitted_at"), "submitted_at should be stamped on pending Rx"


# ─── T3: dual-approve path auto-approves the pending Rx ───────────────────
def test_03_dual_approve_autoapproves_rx(tokens, mongo):
    # Precondition: case still in pending_phase2 with pending Rx from T2.
    proc = _get(tokens["admin"], CONV_PROC_ID)
    if proc.get("status") != "pending_phase2":
        # Re-run the state build if T2 was skipped/isolated.
        _reset_to_phase1_approved(mongo, CONV_PROC_ID)
        _put_rx_with_drugs(tokens["student"], CONV_PROC_ID)
        _sign_rx(tokens["student"], CONV_PROC_ID)
        requests.post(f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
                      headers=_hdr(tokens["student"]), json=P2_PAYLOAD, timeout=30)
        proc = _get(tokens["admin"], CONV_PROC_ID)
    assert proc.get("status") == "pending_phase2"

    # Supervisor approves.
    r1 = requests.post(f"{API}/procedures/{CONV_PROC_ID}/approve",
                       headers=_hdr(tokens["supervisor"]),
                       json={"action": "approve", "comment": "iter443 sup ok"}, timeout=20)
    assert r1.status_code == 200, f"supervisor approve failed: {r1.text}"

    proc = _get(tokens["admin"], CONV_PROC_ID)
    # Not yet fully approved — Rx should still be pending OR already approved
    # only if the server also auto-approves on the single-approver pass. The
    # spec requires both approvals before Rx auto-approve.
    assert proc.get("supervisor_phase2_approved") is True
    rx_after_sup = (proc.get("prescription") or {})
    # Guard: it must NOT be approved yet (only after both approvers).
    assert rx_after_sup.get("status") != "approved", \
        f"Rx auto-approved after only supervisor approval: {rx_after_sup.get('status')}"

    # In-charge approves — this is the second approval.
    r2 = requests.post(f"{API}/procedures/{CONV_PROC_ID}/approve",
                       headers=_hdr(tokens["admin"]),
                       json={"action": "approve", "comment": "iter443 ic ok"}, timeout=20)
    assert r2.status_code == 200, f"incharge approve failed: {r2.text}"

    proc = _get(tokens["admin"], CONV_PROC_ID)
    assert proc.get("status") == "phase2_approved", f"status={proc.get('status')}"
    rx = proc.get("prescription") or {}
    assert rx.get("status") == "approved", f"Rx should be approved, got {rx.get('status')}"
    assert rx.get("approved_at"), "approved_at missing"
    appr = rx.get("approved_by") or []
    assert any(a.get("role") in ("implant_incharge", "administrator", "supervisor") for a in appr), \
        f"approved_by should contain the faculty approver: {appr}"

    # Lock: editing an approved Rx must be rejected with 400.
    e = _put_rx_with_drugs(tokens["admin"], CONV_PROC_ID)
    assert e.status_code == 400, f"approved Rx should be locked, got {e.status_code}: {e.text}"


# ─── T4: in-charge-created case + in-charge submits Phase 2 → auto approve
def test_04_incharge_submit_phase2_autoapproves_rx(tokens, mongo):
    _reset_to_phase1_approved(mongo, IC_SELF_PROC_ID)

    # Draft + sign as the in-charge (both creator & faculty on self-created case).
    r = _put_rx_with_drugs(tokens["admin"], IC_SELF_PROC_ID,
                           drugs=[
                               {"name": "Paracetamol", "strength": "500 mg", "form": "Tablet",
                                "dosage": "1 tab", "frequency": "SOS", "duration": "3 days",
                                "timing": "After food", "notes": "Analgesic"},
                           ])
    assert r.status_code == 200, f"PUT rx (ic) failed: {r.status_code} {r.text}"

    # The IC is both creator (student_id==self) and faculty → signing route
    # may land in either the creator or supervisor slot. The gate for
    # submit-phase2 requires signatures.creator — ensure at least that key
    # exists by signing explicitly.
    rs = _sign_rx(tokens["admin"], IC_SELF_PROC_ID)
    assert rs.status_code == 200, f"sign (ic) failed: {rs.status_code} {rs.text}"
    rx = rs.json()
    sigs = rx.get("signatures") or {}
    # On a self-created case the user is BOTH creator and faculty. The code
    # at /sign puts them in 'supervisor' because `is_faculty and not is_creator`
    # is False → falls to the `elif is_creator` creator branch (verify).
    assert sigs.get("creator"), f"self-created case should put sig in creator slot: {list(sigs.keys())}"

    # In-charge submits phase 2 — this is the "in-charge submission auto-
    # approves Phase 2" path.
    r2 = requests.post(f"{API}/procedures/{IC_SELF_PROC_ID}/submit-phase2",
                       headers=_hdr(tokens["admin"]), json=P2_PAYLOAD, timeout=30)
    assert r2.status_code == 200, f"ic submit-phase2 failed: {r2.status_code} {r2.text}"

    proc = _get(tokens["admin"], IC_SELF_PROC_ID)
    assert proc.get("status") == "phase2_approved", f"status={proc.get('status')}"
    rx = proc.get("prescription") or {}
    assert rx.get("status") == "approved", f"Rx must auto-approve on IC submit, got {rx.get('status')}"
    appr = rx.get("approved_by") or []
    assert any(a.get("role") in ("implant_incharge", "administrator") for a in appr), \
        f"IC should be in approved_by: {appr}"


# ─── T5: PDF endpoint ─────────────────────────────────────────────────────
def test_05_prescription_pdf_download(tokens):
    # Case from T3 should have an approved Rx with drugs.
    r = requests.get(f"{API}/procedures/{CONV_PROC_ID}/prescription/pdf",
                     headers=_hdr(tokens["student"]), timeout=30)
    assert r.status_code == 200, f"PDF 404/403: {r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
    body = r.content
    assert body[:5] == b"%PDF-", f"not a PDF (first bytes {body[:5]!r})"
    assert len(body) > 2000, f"PDF suspiciously small: {len(body)} bytes"


def test_06_prescription_pdf_400_when_no_drugs(tokens, mongo):
    # Pick a Gaurav-owned, phase1_approved case with no Rx.
    pid = "6ab4bb620dc6e3397a201fa6"  # Assistant Flow Patient
    mongo.procedures.update_one({"_id": ObjectId(pid)},
                                {"$unset": {"prescription": ""}})
    r = requests.get(f"{API}/procedures/{pid}/prescription/pdf",
                     headers=_hdr(tokens["student"]), timeout=20)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
    assert "no prescription" in r.text.lower() or "no medications" in r.text.lower(), r.text


# ─── T7: 403 for non-stakeholder editing someone else's Rx ────────────────
def test_07_non_stakeholder_cannot_edit_rx(tokens, mongo):
    # Make a Gaurav-owned draft Rx; attempt to PUT as another student.
    _reset_to_phase1_approved(mongo, CONV_PROC_ID)
    r = _put_rx_with_drugs(tokens["student"], CONV_PROC_ID)
    assert r.status_code == 200

    # 'Aaditya.patil' is a student but NOT the creator of this case.
    other = _login({"identifier": "Aaditya.patil", "password": "Student@123"})
    r2 = _put_rx_with_drugs(other, CONV_PROC_ID,
                            drugs=[{"name": "Hack", "strength": "", "form": "Tablet",
                                    "dosage": "", "frequency": "", "duration": "",
                                    "timing": "", "notes": ""}])
    # Could be 403 (role check) or 404 (procedure not visible). Both are safe;
    # a 200 would mean broken auth.
    assert r2.status_code in (403, 404), \
        f"non-stakeholder PUT should be 403/404 got {r2.status_code}: {r2.text}"
