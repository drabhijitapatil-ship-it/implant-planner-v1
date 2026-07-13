"""iter-359 regression: Implant In-Charge auto-approve on all phase submits +
Phase-3-can-recover-from-pending-phase2 safety net.

Verifies:
- New case created by In-Charge has phase{1,2}_approved flags pre-stamped.
- In-Charge submitting Phase 2 lands the case in `phase2_approved` directly.
- In-Charge submitting Phase 3 lands the case in `stage2_surgical_approved`
  directly, EVEN IF Phase 2 was somehow still in `pending_phase2` (safety
  net that fixes the reported bug where cases got stuck).
"""
import os
from datetime import datetime, timedelta
import requests

API_URL = os.environ.get("APP_URL", "http://localhost:8001").rstrip("/")
INCHARGE = ("Abhijit.patil", "Admin@123")
SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
INCHARGE_ID = "69b79407a17f36c024eb2d5e"


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"identifier": identifier, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json().get("access_token") or r.json().get("token") or ""


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _next_weekday() -> str:
    d = datetime.now() + timedelta(days=3)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def test_incharge_created_case_prestamps_all_flags():
    tok = _login(*INCHARGE)
    payload = {
        "patient_name": "TEST iter359 InChargeCreate",
        "patient_age": 40,
        "patient_gender": "Male",
        "patient_phone": "9876543210",
        "registration_number": "TEST-359-1",
        "chief_complaint": "Missing #16",
        "procedure_date": _next_weekday(),
        "procedure_time": "10:00",
        "supervisor_id": SUPERVISOR_ID,
        "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": INCHARGE_ID,
        "implant_incharge_name": "Dr. Abhijit Patil",
        "receipt_number": "RCPT-359-1",
        "amount_paid": 0,
        "implant_procedure_type": "Single Conventional Implant",
        "missing_teeth": ["16"],
        "teeth_present": ["16"],
        "loading_type": ["Delayed Loading"],
        "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    }
    r = requests.post(f"{API_URL}/api/procedures", json=payload, headers=_h(tok), timeout=15)
    assert r.status_code in (200, 201), r.text
    proc = r.json()
    pid = proc.get("id") or proc.get("_id")
    assert pid, r.text
    # Fetch and inspect approval flags
    doc = requests.get(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15).json()
    assert doc.get("supervisor_phase1_approved") is True, doc
    assert doc.get("implant_incharge_phase1_approved") is True, doc
    assert doc.get("supervisor_phase2_approved") is True, doc
    assert doc.get("implant_incharge_phase2_approved") is True, doc
    # Cleanup
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)


def test_incharge_request_phase1_approval_lands_phase1_approved():
    """When In-Charge submits their own case for Phase 1 approval, status
    should skip `pending_phase1` and land in `phase1_approved` directly."""
    tok = _login(*INCHARGE)
    payload = {
        "patient_name": "TEST iter359 Phase1Skip",
        "patient_age": 42, "patient_gender": "Female", "patient_phone": "9998887770",
        "registration_number": "TEST-359-2",
        "chief_complaint": "Missing #24",
        "procedure_date": _next_weekday(), "procedure_time": "11:00",
        "supervisor_id": SUPERVISOR_ID, "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": INCHARGE_ID, "implant_incharge_name": "Dr. Abhijit Patil",
        "receipt_number": "RCPT-359-2", "amount_paid": 0,
        "implant_procedure_type": "Single Conventional Implant",
        "missing_teeth": ["24"], "teeth_present": ["24"],
        "loading_type": ["Delayed Loading"],
        "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    }
    proc = requests.post(f"{API_URL}/api/procedures", json=payload, headers=_h(tok), timeout=15).json()
    pid = proc.get("id") or proc.get("_id")
    # Request Phase 1 approval — should auto-advance to phase1_approved.
    r = requests.post(f"{API_URL}/api/procedures/{pid}/request-phase1-approval",
                      headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    doc = requests.get(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15).json()
    assert doc.get("status") == "phase1_approved", doc.get("status")
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)


def test_incharge_stage2_surgical_recovers_from_pending_phase2():
    """The reported bug: even if Phase 2 is stuck in `pending_phase2` (or
    earlier like `phase1_approved`), when the In-Charge submits Phase 3 the
    endpoint should auto-approve Phase 2 AND land the case in
    `stage2_surgical_approved`. No 400 error, no manual approval hops."""
    tok = _login(*INCHARGE)
    # Create a fresh In-Charge case, walk it to phase1_approved, then leap
    # directly to Phase 3 (skipping Phase 2) — that's the bug scenario.
    payload = {
        "patient_name": "TEST iter359 P3-leap",
        "patient_age": 47, "patient_gender": "Male", "patient_phone": "9887766554",
        "registration_number": "TEST-359-3",
        "chief_complaint": "Missing #14",
        "procedure_date": _next_weekday(), "procedure_time": "09:00",
        "supervisor_id": SUPERVISOR_ID, "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": INCHARGE_ID, "implant_incharge_name": "Dr. Abhijit Patil",
        "receipt_number": "RCPT-359-3", "amount_paid": 0,
        "implant_procedure_type": "Single Conventional Implant",
        "missing_teeth": ["14"], "teeth_present": ["14"],
        "loading_type": ["Delayed Loading"],
        "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    }
    proc = requests.post(f"{API_URL}/api/procedures", json=payload, headers=_h(tok), timeout=15).json()
    pid = proc.get("id") or proc.get("_id")
    # Move to phase1_approved
    r = requests.post(f"{API_URL}/api/procedures/{pid}/request-phase1-approval",
                      headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    # Now jump to Phase 3 — the exact bug scenario.
    payload3 = {
        "checklist_items": {"stability": True},
        "isq_value": "72",
        "healing_abutment_height": ["3"],
        "iopa_files": [{"filename": "fake.jpg", "original_name": "fake.jpg", "tooth_label": "14"}],
    }
    r2 = requests.post(f"{API_URL}/api/procedures/{pid}/stage2/surgical",
                       json=payload3, headers=_h(tok), timeout=30)
    assert r2.status_code == 200, r2.text
    # Verify: no auto-termination, all approval flags stamped, case is now
    # stage2_surgical_approved and ready for survival review.
    doc = requests.get(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15).json()
    assert doc.get("status") == "stage2_surgical_approved", doc.get("status")
    assert doc.get("supervisor_phase2_approved") is True, doc
    assert doc.get("implant_incharge_phase2_approved") is True, doc
    assert doc.get("supervisor_stage2_surgical_approved") is True, doc
    assert doc.get("implant_incharge_stage2_surgical_approved") is True, doc
    assert doc.get("treatment_ended_reason") is None, "Case must NOT be auto-terminated"
    assert doc.get("auto_terminated") is not True, "Case must NOT be auto-terminated"
    # Cleanup
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)
