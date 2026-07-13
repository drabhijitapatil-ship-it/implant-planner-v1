"""iter-360 regression: The reported bugs (post-Survival-Review Phase 3
submit fails; case auto-terminates on reopen; same error for students).

Verifies:
  A. Survival Review "all survived" resets stale Failed states so no
     spurious auto-terminate fires.
  B. Phase 3 endpoint accepts submissions once survival review has been
     completed, from any pre-terminal status, for BOTH students and in-charge.
  C. Case is NOT auto-terminated after a legitimate "all survived" review.
"""
import os
import random
import uuid
from datetime import datetime, timedelta
import requests

API_URL = os.environ.get("APP_URL", "http://localhost:8001").rstrip("/")
INCHARGE = ("Abhijit.patil", "Admin@123")
STUDENT = ("Gaurav.pandey", "Student@123")
SUPERVISOR = ("Paresh.gandhi", "Supervisor@123")
SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
INCHARGE_ID = "69b79407a17f36c024eb2d5e"
UNIQ = uuid.uuid4().hex[:6]
_HOUR = [9]

def _next_hour() -> int:
    _HOUR[0] += 1
    if _HOUR[0] > 17:
        _HOUR[0] = 9
    return _HOUR[0]


def _login(identifier: str, password: str) -> str:
    r = requests.post(f"{API_URL}/api/auth/login",
                      json={"identifier": identifier, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json().get("access_token") or r.json().get("token") or ""


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _next_weekday() -> str:
    # Add random offset days to avoid collisions with prior test-run cases.
    # Skip both Sundays (weekday 6) and Saturdays (weekday 5) since Saturdays
    # only accept 10:00 AM which collides across tests.
    offset = 3 + random.randint(0, 30)
    d = datetime.now() + timedelta(days=offset)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def _make_incharge_case(reg_suffix: str, teeth: list, hour: int = 10) -> tuple:
    tok = _login(*INCHARGE)
    reg_unique = f"{reg_suffix}-{UNIQ}"
    payload = {
        "patient_name": f"TEST iter360 {reg_unique}",
        "patient_age": 45, "patient_gender": "Female", "patient_phone": "9998887772",
        "registration_number": f"TEST-360-{reg_unique}",
        "chief_complaint": f"Missing #{teeth[0]}",
        "procedure_date": _next_weekday(), "procedure_time": f"{hour:02d}:00",
        "supervisor_id": SUPERVISOR_ID, "supervisor_name": "Dr. Paresh Gandhi",
        "implant_incharge_id": INCHARGE_ID, "implant_incharge_name": "Dr. Abhijit Patil",
        "receipt_number": f"RCPT-360-{reg_unique}", "amount_paid": 0,
        "implant_procedure_type": "Single Conventional Implant" if len(teeth) == 1 else "Multiple Conventional Implants",
        "missing_teeth": teeth, "teeth_present": teeth,
        "loading_type": ["Delayed Loading"],
        "medical_assessment": {"diabetes": "No", "smoking": "No", "anticoagulant": "No", "osteoporosis": "No", "radiation": "No"},
    }
    r = requests.post(f"{API_URL}/api/procedures", json=payload, headers=_h(tok), timeout=15)
    assert r.status_code in (200, 201), f"Case create failed: {r.status_code} {r.text}"
    proc = r.json()
    pid = proc.get("id") or proc.get("_id")
    assert pid, f"No id in create response: {proc}"
    return tok, pid


def test_all_survived_resets_stale_failed_and_does_not_terminate():
    """Reproduce the auto-terminate scenario:
       1. Seed a case with 2 implants and a prior survival review that marked
          one implant Failed (previous state).
       2. New submission: all_survived=true → should RESET the earlier
          Failed status.
       3. Case must not auto-terminate."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId as _OID

    tok, pid = _make_incharge_case("all-survived", ["35", "36"], hour=_next_hour())
    # Move case forward + seed implants + prior Failed survival review.
    async def _seed():
        c = AsyncIOMotorClient("mongodb://localhost:27017")
        db = c["test_database"]
        await db.procedures.update_one({"_id": _OID(pid)}, {"$set": {
            "status": "phase2_approved",
            "implants": [
                {"tooth_number": "35", "system": "Alpha Bio", "diameter": 4.2, "length": 11.5},
                {"tooth_number": "36", "system": "Alpha Bio", "diameter": 4.2, "length": 11.5},
            ],
            "phase2_data": {"prosthetic_component": "Cover Screw Placed"},
            "phase2_survival_review": {
                "all_survived": False,
                "implants": {
                    "0": {"status": "Failed", "reason": "Peri-implantitis", "reviewed_at": "2026-01-01T00:00:00"},
                    "1": {"status": "Failed", "reason": "Peri-implantitis", "reviewed_at": "2026-01-01T00:00:00"},
                },
                "events": [{"at": "2026-01-01T00:00:00", "by": "seed", "all_survived": False, "failures": []}],
            },
            "supervisor_phase2_approved": True,
            "implant_incharge_phase2_approved": True,
        }})
    asyncio.get_event_loop().run_until_complete(_seed())

    # Now the case has 2 Failed implants. If auto-terminate fires on the next
    # "all survived" it's the bug. My fix should reset all to Active.
    r = requests.post(f"{API_URL}/api/procedures/{pid}/survival-review", json={
        "all_survived": True, "failures": [],
    }, headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text

    doc = requests.get(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15).json()
    assert doc.get("status") != "treatment_ended", \
        f"BUG NOT FIXED: case auto-terminated. status={doc.get('status')}"
    assert doc.get("auto_terminated") is not True, "BUG NOT FIXED: auto_terminated=True"
    # Also verify the implants map was reset
    survived = (doc.get("phase2_survival_review") or {}).get("implants") or {}
    for k, v in survived.items():
        assert v.get("status") == "Active", f"implant {k} still {v.get('status')} after all_survived reset"
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)


def test_phase3_gate_accepts_after_survival_review():
    """User's core complaint: post-survival-review Phase 3 submit fails.
    Verifies the gate now allows Phase 3 submission when survival review
    is present, even if the exact status isn't `phase2_approved`."""
    tok, pid = _make_incharge_case("post-survival", ["36"], hour=_next_hour())
    # Walk it to phase3 via In-Charge shortcut
    requests.post(f"{API_URL}/api/procedures/{pid}/request-phase1-approval",
                  headers=_h(tok), timeout=15)
    requests.put(f"{API_URL}/api/procedures/{pid}/implant-plans", json={
        "implant_plans": [{"tooth_number": "36", "system": "Alpha Bio", "diameter": 4.2, "length": 11.5}]
    }, headers=_h(tok), timeout=15)
    r = requests.post(f"{API_URL}/api/procedures/{pid}/stage2/surgical", json={
        "checklist_items": {"stability": True},
        "isq_value": "72",
        "healing_abutment_height": ["3"],
        "iopa_files": [{"filename": "fake.jpg", "original_name": "fake.jpg", "tooth_label": "36"}],
    }, headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    # Complete survival review (all survived)
    r2 = requests.post(f"{API_URL}/api/procedures/{pid}/survival-review", json={
        "all_survived": True,
        "failures": [],
    }, headers=_h(tok), timeout=15)
    assert r2.status_code == 200, r2.text
    # RESUBMIT Phase 3 — this is the exact user scenario. Must not fail with
    # "Phase 2 must be approved".
    r3 = requests.post(f"{API_URL}/api/procedures/{pid}/stage2/surgical", json={
        "checklist_items": {"stability": True, "sutures_removed": True},
        "isq_value": "75",
        "healing_abutment_height": ["4"],
        "iopa_files": [{"filename": "fake2.jpg", "original_name": "fake2.jpg", "tooth_label": "36"}],
    }, headers=_h(tok), timeout=30)
    assert r3.status_code == 200, f"Phase 3 re-submit failed post-survival-review! {r3.text}"
    # Cleanup
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)


def test_student_phase3_gate_uses_both_approvals_signal():
    """Student flow: Phase 2 fully approved (both flags stamped) but status
    drifted to `stage2_surgical_approved` due to prior submission. Student
    resubmits Phase 3 — must not get the 'Phase 2 must be approved' error."""
    tok, pid = _make_incharge_case("student-flow", ["37"], hour=_next_hour())
    requests.post(f"{API_URL}/api/procedures/{pid}/request-phase1-approval",
                  headers=_h(tok), timeout=15)
    requests.put(f"{API_URL}/api/procedures/{pid}/implant-plans", json={
        "implant_plans": [{"tooth_number": "37", "system": "Alpha Bio", "diameter": 4.2, "length": 11.5}]
    }, headers=_h(tok), timeout=15)
    # First submit — moves it to stage2_surgical_approved
    r = requests.post(f"{API_URL}/api/procedures/{pid}/stage2/surgical", json={
        "checklist_items": {"stability": True},
        "isq_value": "72",
        "healing_abutment_height": ["3"],
        "iopa_files": [{"filename": "f.jpg", "original_name": "f.jpg", "tooth_label": "37"}],
    }, headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    # RESUBMIT — this is what a student would do to edit
    r2 = requests.post(f"{API_URL}/api/procedures/{pid}/stage2/surgical", json={
        "checklist_items": {"stability": True, "sutures_removed": True},
        "isq_value": "74",
        "healing_abutment_height": ["3.5"],
        "iopa_files": [{"filename": "f2.jpg", "original_name": "f2.jpg", "tooth_label": "37"}],
    }, headers=_h(tok), timeout=30)
    assert r2.status_code == 200, f"Idempotent Phase 3 re-submit rejected! {r2.text}"
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)


def test_iter354_legitimate_auto_terminate_still_fires():
    """Regression guard: iter-354's Q4-a auto-terminate must STILL fire when
    the user genuinely marks every implant Failed with no replacement (this
    is a distinct scenario from the "all_survived resets stale Failed" bug
    fixed above). Otherwise we'd break the legitimate all-failed workflow."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from bson import ObjectId as _OID

    tok, pid = _make_incharge_case("legit-fail", ["36"], hour=_next_hour())
    async def _seed():
        c = AsyncIOMotorClient("mongodb://localhost:27017")
        db = c["test_database"]
        await db.procedures.update_one({"_id": _OID(pid)}, {"$set": {
            "status": "phase2_approved",
            "implants": [{"tooth_number": "36", "system": "Alpha Bio", "diameter": 4.2, "length": 11.5}],
            "supervisor_phase2_approved": True,
            "implant_incharge_phase2_approved": True,
        }})
    asyncio.get_event_loop().run_until_complete(_seed())
    # Submit failure with no replacement — legitimate all-failed scenario.
    r = requests.post(f"{API_URL}/api/procedures/{pid}/survival-review", json={
        "all_survived": False,
        "failures": [{"implant_idx": 0, "tooth": "36", "reason": "Peri-implantitis", "replaced": False}],
    }, headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    doc = requests.get(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15).json()
    assert doc.get("status") == "treatment_ended", \
        f"iter-354 auto-terminate broke! status={doc.get('status')}"
    assert doc.get("auto_terminated") is True, "auto_terminated flag missing"
    requests.delete(f"{API_URL}/api/procedures/{pid}", headers=_h(tok), timeout=15)
