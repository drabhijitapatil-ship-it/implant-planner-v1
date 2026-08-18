"""
iter-Feb-2026 v4 — Zygoma & Pterygoid Extended Workflow (Phases 2-5).

Backend coverage:
  1. PATCH /api/procedures/{id}/zygoma-workflow — Phase 2 persists checklist/
     implants_placed/complications and round-trips via GET.
  2. PATCH — Phase 5 persists ORIS bilateral data (implant_stability,
     head_position, sinus_status, soft_tissue).
  3. PATCH — 400 for non-Zygoma cases.
  4. POST /api/procedures/{id}/zygoma-cosign — supervisor + incharge slots
     both accepted for implant_incharge role.
  5. POST — 400 for unknown role_slot.
  6. POST — 403 when nurse tries slot='incharge'.
  7. GET /api/procedures/{id}/zygoma-cosigns — phase2_ready true only after
     both slots filled; phase3_day0_ready true only after supervisor +
     prosthodontist filled.
"""
import os
import random
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR = {"identifier": "Paresh.gandhi", "password": "Supervisor@123"}
NURSE = {"identifier": "nurse.1@dental.edu", "password": "Nurse@123"}

_TAG = f"{random.randint(1000, 9999)}"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        return None
    b = r.json()
    return b.get("access_token") or b.get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"} if tok else {}


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)
    assert tok, "admin login failed"
    return _hdr(tok)


@pytest.fixture(scope="module")
def student_headers():
    tok = _login(STUDENT)
    assert tok, "student login failed"
    return _hdr(tok)


@pytest.fixture(scope="module")
def nurse_headers():
    tok = _login(NURSE)
    if not tok:
        pytest.skip("nurse login unavailable")
    return _hdr(tok)


def _next_weekday(offset):
    d = datetime.now() + timedelta(days=offset)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def supervisor_info(student_headers):
    r = requests.get(f"{API}/users?role=supervisor", headers=student_headers, timeout=20)
    assert r.status_code == 200
    users = r.json()
    assert users, "no supervisor found"
    return users[0]


@pytest.fixture(scope="module")
def incharge_info(student_headers):
    r = requests.get(f"{API}/users?role=implant_incharge", headers=student_headers, timeout=20)
    assert r.status_code == 200
    users = r.json()
    if not users:
        pytest.skip("no implant_incharge user")
    return users[0]


def _create_case(headers, proc_type, sup, inc, tag):
    body = {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZV4_{tag}",
        "registration_number": f"TEST-ZV4-{_TAG}-{tag}",
        "supervisor_id": sup["id"],
        "supervisor_name": sup["name"],
        "implant_incharge_id": inc["id"],
        "implant_incharge_name": inc["name"],
        "receipt_number": f"REC-ZV4-{_TAG}-{tag}",
        "amount_paid": 5000.0,
        "procedure_date": _next_weekday(20),
        "procedure_time": "10:00",
        "implant_procedure_type": proc_type,
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Fixed hybrid",
        "bone_graft_specifications": "TEST",
    }
    if proc_type in ("Quad Zygoma Implants", "Zygoma and Pterygoid Implants",
                     "Zygoma, Pterygoid and Conventional Implants",
                     "Zygoma and Conventional Implants"):
        body["arch"] = "Maxillary"
    r = requests.post(f"{API}/procedures", json=body, headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def zygoma_case(student_headers, supervisor_info, incharge_info):
    return _create_case(student_headers, "Quad Zygoma Implants",
                        supervisor_info, incharge_info, "QZ")


@pytest.fixture(scope="module")
def zygoma_case_2(student_headers, supervisor_info, incharge_info):
    return _create_case(student_headers, "Zygoma and Pterygoid Implants",
                        supervisor_info, incharge_info, "ZP2")


@pytest.fixture(scope="module")
def conventional_case(student_headers, supervisor_info, incharge_info):
    body = {
        "student_name": "Test Student",
        "patient_name": f"TEST_ZV4_CONV_{_TAG}",
        "registration_number": f"TEST-ZV4-{_TAG}-CONV",
        "supervisor_id": supervisor_info["id"],
        "supervisor_name": supervisor_info["name"],
        "implant_incharge_id": incharge_info["id"],
        "implant_incharge_name": incharge_info["name"],
        "receipt_number": f"REC-ZV4-{_TAG}-CONV",
        "amount_paid": 3000.0,
        "procedure_date": _next_weekday(20),
        "procedure_time": "10:00",
        "implant_procedure_type": "Single Conventional Implant",
        "arch": "Mandibular",
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Cement Retained Crown",
        "bone_graft_specifications": "TEST",
        "location_of_implant_placement": "46",
    }
    r = requests.post(f"{API}/procedures", json=body, headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# ── 1. PATCH — Phase 2 persistence ─────────────────────────────────────
def test_patch_phase2_persists(student_headers, zygoma_case):
    pid = zygoma_case["id"]
    phase2 = {
        "checklist": {
            "flap_raised": "Yes",
            "sinus_window": "Yes",
            "zygomatic_border_palpated": "Yes",
        },
        "implants_placed": [
            {"side": "Right", "fdi": "13", "type": "Zygoma",
             "diameter": "4.0", "length": "45", "angulation": "45°",
             "torque_ncm": "40", "primary_stability": "Yes",
             "kit_sku": "TEST-ZG-01"},
        ],
        "complications": {"membrane_perforation": "No"},
    }
    r = requests.patch(f"{API}/procedures/{pid}/zygoma-workflow",
                       json={"phase": "phase2", "data": phase2},
                       headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("phase") == "phase2"

    # GET round-trip
    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200
    got = r.json()
    zpd = got.get("zygoma_pterygoid_data") or {}
    p2 = zpd.get("phase2") or {}
    assert p2.get("checklist", {}).get("flap_raised") == "Yes"
    assert p2.get("checklist", {}).get("sinus_window") == "Yes"
    assert len(p2.get("implants_placed", [])) == 1
    assert p2["implants_placed"][0]["fdi"] == "13"
    assert p2["implants_placed"][0]["torque_ncm"] == "40"
    assert p2.get("complications", {}).get("membrane_perforation") == "No"


# ── 2. PATCH — Phase 5 ORIS persistence ────────────────────────────────
def test_patch_phase5_persists_oris(student_headers, zygoma_case):
    pid = zygoma_case["id"]
    phase5 = {
        "recall_timepoint": "6 months",
        "visit_date": "2026-08-01",
        "oris": {
            "implant_stability": {"right": "Yes", "left": "Yes"},
            "head_position": {"right": "Anatomical", "left": "Anatomical"},
            "sinus_status": {"right": "Healthy", "left": "Healthy"},
            "soft_tissue": {"right": "Healthy", "left": "Healthy"},
        },
    }
    r = requests.patch(f"{API}/procedures/{pid}/zygoma-workflow",
                       json={"phase": "phase5", "data": phase5},
                       headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text

    r = requests.get(f"{API}/procedures/{pid}", headers=student_headers, timeout=20)
    assert r.status_code == 200
    p5 = (r.json().get("zygoma_pterygoid_data") or {}).get("phase5") or {}
    assert p5.get("oris", {}).get("implant_stability", {}).get("right") == "Yes"
    assert p5.get("oris", {}).get("implant_stability", {}).get("left") == "Yes"
    assert p5.get("oris", {}).get("head_position", {}).get("right") == "Anatomical"
    assert p5.get("oris", {}).get("sinus_status", {}).get("right") == "Healthy"
    assert p5.get("oris", {}).get("soft_tissue", {}).get("left") == "Healthy"

    # Verify phase2 preserved (merge semantics)
    zpd = r.json().get("zygoma_pterygoid_data") or {}
    assert zpd.get("phase2", {}).get("checklist", {}).get("flap_raised") == "Yes"


# ── 3. PATCH — rejects non-Zygoma case with 400 ────────────────────────
def test_patch_rejects_non_zygoma_case(student_headers, conventional_case):
    pid = conventional_case["id"]
    r = requests.patch(f"{API}/procedures/{pid}/zygoma-workflow",
                       json={"phase": "phase2", "data": {"checklist": {}}},
                       headers=student_headers, timeout=20)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    assert "Zygoma" in r.text or "zygoma" in r.text.lower()


# ── 4. POST cosign — implant_incharge fills both slots ─────────────────
def test_cosign_incharge_fills_both_slots(zygoma_case_2, admin_headers):
    """admin_headers here comes from Abhijit.patil who is admin (implant
    In-Charge per test creds). We use admin creds — administrator is in
    the allowed set for both supervisor and incharge slots."""
    pid = zygoma_case_2["id"]

    # supervisor slot
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase2", "role_slot": "supervisor",
                            "signer_name": "Dr Supervisor",
                            "signature_data": "data:image/png;base64,iVBORw0KGgo=",
                            "comment": "supervisor OK"},
                      headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("slot") == "supervisor"

    # incharge slot
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase2", "role_slot": "incharge",
                            "signer_name": "Dr InCharge",
                            "signature_data": "data:image/png;base64,iVBORw0KGgo=",
                            "comment": "in-charge OK"},
                      headers=admin_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("slot") == "incharge"


# ── 5. POST cosign — 400 on unknown slot ───────────────────────────────
def test_cosign_400_on_unknown_slot(zygoma_case_2, admin_headers):
    pid = zygoma_case_2["id"]
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase2", "role_slot": "banana",
                            "signer_name": "x", "signature_data": ""},
                      headers=admin_headers, timeout=20)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


# ── 6. POST cosign — 403 for nurse on 'incharge' slot ──────────────────
def test_cosign_403_for_nurse_on_incharge(zygoma_case_2, nurse_headers):
    pid = zygoma_case_2["id"]
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase2", "role_slot": "incharge",
                            "signer_name": "N", "signature_data": ""},
                      headers=nurse_headers, timeout=20)
    assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"


# ── 7. GET cosigns — readiness flags ───────────────────────────────────
def test_get_cosigns_readiness(zygoma_case_2, admin_headers, student_headers):
    pid = zygoma_case_2["id"]
    r = requests.get(f"{API}/procedures/{pid}/zygoma-cosigns",
                     headers=student_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    # Both phase2 slots were filled in test 4
    assert body.get("phase2_ready") is True, body
    # phase3_day0 has no signers yet → False
    assert body.get("phase3_day0_ready") is False, body

    # Now fill phase3_day0 supervisor only → still False
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase3_day0", "role_slot": "supervisor",
                            "signer_name": "Sup1", "signature_data": ""},
                      headers=admin_headers, timeout=20)
    assert r.status_code == 200
    r = requests.get(f"{API}/procedures/{pid}/zygoma-cosigns",
                     headers=student_headers, timeout=20)
    assert r.status_code == 200
    assert r.json().get("phase3_day0_ready") is False

    # Fill prosthodontist slot (admin allowed) → True
    r = requests.post(f"{API}/procedures/{pid}/zygoma-cosign",
                      json={"stage": "phase3_day0", "role_slot": "prosthodontist",
                            "signer_name": "Prostho", "signature_data": ""},
                      headers=admin_headers, timeout=20)
    assert r.status_code == 200
    r = requests.get(f"{API}/procedures/{pid}/zygoma-cosigns",
                     headers=student_headers, timeout=20)
    assert r.json().get("phase3_day0_ready") is True


# ── 8. PATCH — 404 for missing procedure ───────────────────────────────
def test_patch_404_missing_procedure(student_headers):
    r = requests.patch(f"{API}/procedures/000000000000000000000000/zygoma-workflow",
                       json={"phase": "phase2", "data": {}},
                       headers=student_headers, timeout=20)
    assert r.status_code == 404, f"expected 404 got {r.status_code}"
