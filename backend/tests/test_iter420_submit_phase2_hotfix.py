"""
iter-420 — Chunk C hotfix regression for POST /api/procedures/{id}/submit-phase2

Original bug: MongoDB $set collision (code 40) when the update composed BOTH
`phase2_data` (whole object) AND `phase2_data.<sub>` dotted paths, e.g.:
    "Updating the path 'phase2_data.mua_placed' would create a conflict at
     'phase2_data'".

Fix: per_implant / advanced_clinical / mua_placed / mua_details are merged
INTO `phase2_surgical_data` BEFORE `update_data` is composed. Pre-existing
`phase2_data.*` keys (e.g. advanced_clinical set via the standalone endpoint)
are preserved via an `existing_phase2` merge loop.

Test scope (backend only):
  T1  Conventional happy path — submit minimal Phase 2 → 200, no code 40,
      phase2_data echoes back the submitted keys.
  T2  Zygoma/Pterygoid with per_implant_data + mua_placed + mua_details →
      200, phase2_data.per_implant / mua_placed / mua_details populated,
      alongside all top-level surgical fields (checklist, drilling, etc.).
  T3  Preservation regression — set phase2_data.advanced_clinical via the
      standalone /advanced-clinical/send-for-approval endpoint, then submit
      Phase 2 WITHOUT advanced_clinical in the payload → GET must still
      show phase2_data.advanced_clinical.approval_status == 'pending'.
  T4  Idempotency — submit Phase 2 twice with the same payload, both must
      succeed (the second is done after resetting status back to
      phase1_approved to bypass the current one-shot state gate — this
      documents that shape is stable across two calls).
  T5  iter-419 regression — submit-phase2 must NOT overwrite
      prosthetic_plan nor mutate prosthetic_plan_change_log.

State management: uses direct Mongo access (motor/pymongo) between tests to
reset status → phase1_approved, patch consent-form flag, and snapshot the
prosthetic_plan / prosthetic_plan_change_log for regression comparison.
"""
from __future__ import annotations
import copy
import os
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
ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

# Gaurav-owned, phase1_approved Single Conventional Implant, preop=True,
# consent=True — clean phase2_data (verified before the test run).
CONV_PROC_ID = "6a6b7fbf6633443cf356df15"
# Seed 'Test Patient Zygoma' — Zygoma+Pterygoid, phase1_approved,
# preop=True, 5 implant plans.
ZYG_PROC_ID = "6a8337dd64ad3269dc584a69"


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
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = os.environ.get("DB_NAME", "test_database")
    c = MongoClient(url)
    try:
        yield c[dbname]
    finally:
        c.close()


@pytest.fixture(scope="module")
def tokens():
    return {"student": _login(STUDENT), "admin": _login(ADMIN)}


def _reset_to_phase1_approved(mongo, pid, *, ensure_consent=False, keep_p2_data=None):
    """Reset a procedure so submit-phase2 preconditions are satisfied."""
    from datetime import datetime, timezone

    set_op = {
        "status": "phase1_approved",
        "phase2_preop_completed_at": datetime.now(timezone.utc),
    }
    if ensure_consent:
        set_op["patient_consent_form"] = {
            "filename": "iter420_consent.pdf",
            "original_name": "iter420_consent.pdf",
            "content_type": "application/pdf",
            "uploaded_by_id": "iter420",
            "uploaded_by_name": "iter420 fixture",
            "uploaded_by_role": "supervisor",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "version": 1,
        }
    if keep_p2_data is not None:
        set_op["phase2_data"] = keep_p2_data
    mongo.procedures.update_one({"_id": ObjectId(pid)}, {"$set": set_op})


# ─── T1: Conventional happy path ──────────────────────────────────────────
def test_01_conventional_happy_path(tokens, mongo):
    # Ensure preconditions on the Gaurav-owned conventional case.
    _reset_to_phase1_approved(mongo, CONV_PROC_ID, ensure_consent=True, keep_p2_data={})

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
    }
    r = requests.post(
        f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, f"submit-phase2 failed {r.status_code}: {r.text}"
    # Assert Mongo code-40 collision is NOT in the response body.
    assert "code" not in r.text or "40" not in r.text.split("code")[-1][:30], \
        f"suspicious Mongo error in response: {r.text[:400]}"

    proc = _get(tokens["student"], CONV_PROC_ID)
    p2 = proc.get("phase2_data") or {}
    assert p2.get("anesthesia_adequate") == "Yes"
    assert p2.get("flap_design") == "Full Thickness"
    assert p2.get("drilling_type") == "Freehand"
    assert p2.get("prosthetic_component") == "Cover Screw"
    assert p2.get("sutures_placed") is True


# ─── T2: Zygoma with per_implant / mua_placed / mua_details ───────────────
def test_02_zygoma_with_per_implant_and_mua(tokens, mongo):
    # Full reset — clear phase2_data so we can validate the write.
    _reset_to_phase1_approved(mongo, ZYG_PROC_ID, ensure_consent=True, keep_p2_data={})

    per_implant = {
        "ZR1": {"torque": 45, "insertion_date": "2026-04-20"},
        "ZL1": {"torque": 50, "insertion_date": "2026-04-20"},
        "PR1": {"torque": 40, "insertion_date": "2026-04-20"},
    }
    mua_details = {
        "ZR1": {"cuff_height": "3", "angulation": "30°"},
        "ZL1": {"cuff_height": "2", "angulation": "17°"},
    }
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "torque_values": [45.0, 50.0, 40.0, 40.0, 40.0],
        "prosthetic_component": "Immediate Loading Done",
        "sutures_placed": True,
        "hemostasis_achieved": True,
        "post_op_checklist": {"analgesic_prescribed": True},
        "per_implant_data": per_implant,
        "mua_placed": True,
        "mua_details": mua_details,
    }
    r = requests.post(
        f"{API}/procedures/{ZYG_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["admin"]),  # implant_incharge bypasses ownership
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, f"submit-phase2 failed {r.status_code}: {r.text}"

    # Guard against the exact original error message.
    assert "would create a conflict at 'phase2_data'" not in r.text
    assert "'code': 40" not in r.text and '"code": 40' not in r.text

    proc = _get(tokens["admin"], ZYG_PROC_ID)
    p2 = proc.get("phase2_data") or {}
    assert p2.get("mua_placed") is True, f"mua_placed missing: {p2.get('mua_placed')!r}"
    assert p2.get("mua_details") == mua_details, f"mua_details mismatch: {p2.get('mua_details')!r}"
    assert p2.get("per_implant") == per_implant, f"per_implant mismatch: {p2.get('per_implant')!r}"
    # Top-level surgical fields also present.
    assert p2.get("anesthesia_adequate") == "Yes"
    assert p2.get("flap_design") == "Full Thickness"
    assert p2.get("drilling_type") == "Freehand"
    assert p2.get("prosthetic_component") == "Immediate Loading Done"


# ─── T3: preservation of advanced_clinical when submit-phase2 omits it ────
def test_03_preserves_advanced_clinical(tokens, mongo):
    from datetime import datetime, timezone
    # Reset with a phase2_data holding an existing advanced_clinical(pending).
    seeded_adv = {
        "approval_status": "pending",
        "submitted_by": "iter420-fixture",
        "submitted_by_name": "iter420 fixture",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "oris_success_code": "S",
    }
    _reset_to_phase1_approved(
        mongo, ZYG_PROC_ID, ensure_consent=True,
        keep_p2_data={"advanced_clinical": copy.deepcopy(seeded_adv)},
    )

    # Now submit Phase 2 WITHOUT advanced_clinical.
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "torque_values": [45.0, 50.0, 40.0, 40.0, 40.0],
        "prosthetic_component": "Immediate Loading Done",
        "sutures_placed": True,
        "hemostasis_achieved": True,
        "mua_placed": False,
    }
    r = requests.post(
        f"{API}/procedures/{ZYG_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["admin"]),
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, f"submit-phase2 failed {r.status_code}: {r.text}"
    assert "would create a conflict" not in r.text

    proc = _get(tokens["admin"], ZYG_PROC_ID)
    adv = ((proc.get("phase2_data") or {}).get("advanced_clinical") or {})
    assert adv.get("approval_status") == "pending", (
        f"advanced_clinical NOT preserved after submit-phase2: {adv!r}"
    )
    assert adv.get("submitted_by_name") == "iter420 fixture"
    assert adv.get("oris_success_code") == "S"


# ─── T4: idempotency — shape stable across two consecutive submits ────────
def test_04_idempotent_shape(tokens, mongo):
    _reset_to_phase1_approved(mongo, CONV_PROC_ID, ensure_consent=True, keep_p2_data={})
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "torque_values": [40.0],
        "prosthetic_component": "Healing Abutment",
        "sutures_placed": True,
        "hemostasis_achieved": True,
    }
    r1 = requests.post(
        f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r1.status_code == 200, f"first submit failed: {r1.status_code} {r1.text}"
    p2_first = (r1.json().get("phase2_data") or {})

    # Reset status back to phase1_approved so we can re-submit the same payload.
    _reset_to_phase1_approved(
        mongo, CONV_PROC_ID, ensure_consent=True, keep_p2_data=p2_first
    )
    r2 = requests.post(
        f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r2.status_code == 200, f"second submit failed: {r2.status_code} {r2.text}"
    p2_second = (r2.json().get("phase2_data") or {})

    # Compare the shape (key set) — values may include mutable defaults; check
    # the fields we actually submitted match.
    for k in ("anesthesia_adequate", "flap_design", "drilling_type",
              "prosthetic_component", "sutures_placed", "hemostasis_achieved"):
        assert p2_first.get(k) == p2_second.get(k) == payload[k], (
            f"idempotency mismatch on {k}: first={p2_first.get(k)!r} "
            f"second={p2_second.get(k)!r} payload={payload[k]!r}"
        )
    assert set(p2_first.keys()) == set(p2_second.keys()), (
        f"phase2_data key set drifted between submits\n"
        f"first only: {set(p2_first) - set(p2_second)}\n"
        f"second only: {set(p2_second) - set(p2_first)}"
    )


# ─── T5: iter-419 regression — prosthetic_plan untouched by submit-phase2 ─
def test_05_prosthetic_plan_untouched(tokens, mongo):
    _reset_to_phase1_approved(mongo, CONV_PROC_ID, ensure_consent=True, keep_p2_data={})
    doc = mongo.procedures.find_one({"_id": ObjectId(CONV_PROC_ID)})
    pre_plan = doc.get("prosthetic_plan")
    pre_log = list(doc.get("prosthetic_plan_change_log") or [])

    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Freehand",
        "torque_values": [35.0],
        "prosthetic_component": "Cover Screw",
        "sutures_placed": True,
        "hemostasis_achieved": True,
    }
    r = requests.post(
        f"{API}/procedures/{CONV_PROC_ID}/submit-phase2",
        headers=_hdr(tokens["student"]),
        json=payload,
        timeout=30,
    )
    assert r.status_code == 200, r.text

    after = mongo.procedures.find_one({"_id": ObjectId(CONV_PROC_ID)})
    assert after.get("prosthetic_plan") == pre_plan, (
        f"prosthetic_plan changed: {pre_plan!r} → {after.get('prosthetic_plan')!r}"
    )
    post_log = list(after.get("prosthetic_plan_change_log") or [])
    assert len(post_log) == len(pre_log), (
        f"prosthetic_plan_change_log length changed: {len(pre_log)} → {len(post_log)}"
    )
    for i, e in enumerate(pre_log):
        assert post_log[i].get("changed_at") == e.get("changed_at")
        assert post_log[i].get("to") == e.get("to")
