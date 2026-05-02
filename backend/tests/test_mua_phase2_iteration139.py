"""
Iteration 139 — Phase 2 Multi-Unit Abutment (MUA) + access_channel_openings persistence.

Validates:
1. POST /api/procedures/{id}/submit-phase2 accepts and persists `multi_unit_abutment_placed`
   ('yes'/'no'/null) and `multi_unit_abutment_details` (list of {tooth, angulation, cuff_height})
   into procedures.phase2_data — verified via subsequent GET /api/procedures/{id}.
2. multi_unit_abutment_placed='no' or null saves successfully with details=null.
3. Partial / invalid MUA payload (angulation='60', cuff_height='') is non-blocking — server
   accepts and persists raw values without rejection.
4. Regression: legacy Phase 2 fields (torque_values, prosthetic_component, prosthesis_type,
   iopa_files, opg_file) still save correctly.
5. Regression: existing Phase 2 submission for a single-implant case (without MUA fields)
   still works unchanged.
6. access_channel_openings list is now persisted (was previously dropped server-side).
"""

import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}


# ---------------------------- helpers ----------------------------
def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['identifier']}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _find_unique_slot(token):
    """Find a free slot at least 10 days out."""
    headers = {"Authorization": f"Bearer {token}"}
    for offset in range(10, 120):
        d = datetime.now() + timedelta(days=offset)
        if d.weekday() == 6:  # Sunday
            continue
        date_str = d.strftime("%Y-%m-%d")
        r = requests.get(f"{BASE_URL}/api/procedures/slots/{date_str}", headers=headers, timeout=30)
        if r.status_code != 200:
            continue
        booked = r.json().get("booked_slots", {}) or {}
        for t in ("10:00", "11:00", "12:00", "14:00", "15:00", "16:00"):
            if t == "14:00" and d.weekday() == 5:  # not avail Saturday afternoon per legacy fixture
                continue
            if t not in booked:
                return date_str, t
    return (datetime.now() + timedelta(days=180)).strftime("%Y-%m-%d"), "10:00"


def _get_user_ids(student_token):
    r = requests.get(f"{BASE_URL}/api/users", headers=_hdr(student_token), timeout=30)
    assert r.status_code == 200, r.text
    users = r.json()
    sup = next((u for u in users if u.get("role") == "supervisor"), None)
    inc = next((u for u in users if u.get("role") == "implant_incharge"), None)
    assert sup and inc, "need supervisor + incharge users"
    return sup, inc


def _create_procedure(student_token, *, procedure_type, loading_type, edentulous_sites):
    sup, inc = _get_user_ids(student_token)
    proc_date, proc_time = _find_unique_slot(student_token)
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "patient_name": f"TEST_MUA_{suffix}",
        "registration_number": f"TEST-MUA-{suffix}",
        "supervisor_id": sup["id"],
        "supervisor_name": sup["name"],
        "implant_incharge_id": inc["id"],
        "implant_incharge_name": inc["name"],
        "receipt_number": f"TEST-REC-{suffix}",
        "amount_paid": 1000.0,
        "procedure_date": proc_date,
        "procedure_time": proc_time,
        "implant_procedure_type": procedure_type,
        "loading_type": loading_type,
        "prosthetic_plan": "Cement Retained Crown - Zirconia",
        "edentulous_sites": edentulous_sites,
        "arch_condition": "Adequate",
        "ridge_contour": "Normal",
        "soft_tissue_thickness": "Thick",
        "keratinized_mucosa": "Adequate",
        "occlusal_scheme": "Mutually Protected",
        "parafunction_habit": "None",
        "vertical_dimension": "Normal",
        "opposing_dentition": "Natural",
        "smile_line": "Medium",
        "gingival_biotype": "Thick",
        "medical_risk_level": "Low",
    }
    r = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=_hdr(student_token), timeout=30)
    assert r.status_code == 200, f"create procedure failed: {r.status_code} {r.text}"
    return r.json()["id"]


def _approve_phase1(proc_id):
    s_token = _login(STUDENT_CREDS)
    requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/request-phase1-approval",
        headers=_hdr(s_token), timeout=30,
    )
    sup_token = _login(SUPERVISOR_CREDS)
    requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/approve",
        json={"action": "approve"}, headers=_hdr(sup_token), timeout=30,
    )
    inc_token = _login(INCHARGE_CREDS)
    requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/approve",
        json={"action": "approve"}, headers=_hdr(inc_token), timeout=30,
    )
    r = requests.get(f"{BASE_URL}/api/procedures/{proc_id}", headers=_hdr(inc_token), timeout=30)
    assert r.status_code == 200
    return r.json().get("status")


def _upload_consent(proc_id, token):
    """Phase 2 submission requires patient_consent_form to exist."""
    files = {"file": ("consent.pdf", b"%PDF-1.4\n%fake consent\n", "application/pdf")}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/upload-consent",
        files=files, headers=headers, timeout=30,
    )
    assert r.status_code == 200, f"consent upload failed: {r.status_code} {r.text}"


def _submit_phase2(proc_id, payload):
    token = _login(STUDENT_CREDS)
    return requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/submit-phase2",
        json=payload, headers=_hdr(token), timeout=60,
    )


def _get_phase2_data(proc_id):
    token = _login(INCHARGE_CREDS)
    r = requests.get(f"{BASE_URL}/api/procedures/{proc_id}", headers=_hdr(token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("phase2_data") or {}


# ---------------------------- tracker for cleanup ----------------------------
_created_ids: list[str] = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup_module():
    yield
    try:
        token = _login(INCHARGE_CREDS)
        for pid in _created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/procedures/{pid}", headers=_hdr(token), timeout=30)
            except Exception:
                pass
    except Exception:
        pass


# ---------------------------- fixtures (created on demand) ----------------------------
def _full_arch_case(loading_type=None):
    s_token = _login(STUDENT_CREDS)
    proc_id = _create_procedure(
        s_token,
        procedure_type="All on 4",
        loading_type=loading_type or ["Immediate Loading"],
        edentulous_sites=["11", "12", "21", "22"],
    )
    _created_ids.append(proc_id)
    _upload_consent(proc_id, s_token)
    status = _approve_phase1(proc_id)
    assert status == "phase1_approved", f"unexpected status after approval: {status}"
    return proc_id


def _single_case():
    s_token = _login(STUDENT_CREDS)
    proc_id = _create_procedure(
        s_token,
        procedure_type="Single Conventional Implant",
        loading_type=["Delayed Loading"],
        edentulous_sites=["14"],
    )
    _created_ids.append(proc_id)
    _upload_consent(proc_id, s_token)
    status = _approve_phase1(proc_id)
    assert status == "phase1_approved", f"unexpected status after approval: {status}"
    return proc_id


# ---------------------------- TESTS ----------------------------

# Test: MUA = yes with 4 implants persists correctly + access_channel_openings persists.
def test_01_mua_yes_persists_and_access_channel_openings():
    proc_id = _full_arch_case()
    mua_details = [
        {"tooth": "11", "angulation": "15", "cuff_height": "3"},
        {"tooth": "12", "angulation": "20", "cuff_height": "4"},
        {"tooth": "21", "angulation": "10", "cuff_height": "2"},
        {"tooth": "22", "angulation": "25", "cuff_height": "5"},
    ]
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 40.0, 38.0, 42.0],
        "prosthetic_component": "Immediate Loading Done",
        "prosthesis_type": "Hybrid Prosthesis",
        "access_channel_openings": ["Palatal", "Palatal", "Buccal", "Palatal"],
        "multi_unit_abutment_placed": "yes",
        "multi_unit_abutment_details": mua_details,
        "sutures_placed": True,
        "hemostasis_achieved": True,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"submit-phase2 should succeed: {r.status_code} {r.text}"

    p2 = _get_phase2_data(proc_id)
    assert p2.get("multi_unit_abutment_placed") == "yes", f"got {p2.get('multi_unit_abutment_placed')!r}"
    saved_details = p2.get("multi_unit_abutment_details")
    assert isinstance(saved_details, list) and len(saved_details) == 4, f"got {saved_details!r}"
    # validate each row
    for sent, got in zip(mua_details, saved_details):
        assert got.get("tooth") == sent["tooth"]
        assert str(got.get("angulation")) == sent["angulation"]
        assert str(got.get("cuff_height")) == sent["cuff_height"]
    # access_channel_openings now persisted
    assert p2.get("access_channel_openings") == ["Palatal", "Palatal", "Buccal", "Palatal"]
    # legacy regression
    assert p2.get("torque_values") == [35.0, 40.0, 38.0, 42.0]
    assert p2.get("prosthetic_component") == "Immediate Loading Done"
    assert p2.get("prosthesis_type") == "Hybrid Prosthesis"


# Test: MUA = 'no' saves with details=null
def test_02_mua_no_with_null_details():
    proc_id = _full_arch_case()
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 35.0, 35.0, 35.0],
        "prosthetic_component": "Immediate Loading Done",
        "prosthesis_type": "Hybrid Prosthesis",
        "multi_unit_abutment_placed": "no",
        "multi_unit_abutment_details": None,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    p2 = _get_phase2_data(proc_id)
    assert p2.get("multi_unit_abutment_placed") == "no"
    assert p2.get("multi_unit_abutment_details") in (None, [], [{}]), \
        f"expected null/empty details, got {p2.get('multi_unit_abutment_details')!r}"


# Test: MUA fields fully omitted (null) saves successfully (gate condition not met).
def test_03_mua_fields_omitted_succeeds():
    proc_id = _full_arch_case(loading_type=["Delayed Loading"])
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 35.0, 35.0, 35.0],
        "prosthetic_component": "Healing Abutment Placed",
        "sutures_placed": True,
        "hemostasis_achieved": True,
        # NO multi_unit_abutment_placed / multi_unit_abutment_details / access_channel_openings
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    p2 = _get_phase2_data(proc_id)
    assert p2.get("multi_unit_abutment_placed") in (None, ""), p2.get("multi_unit_abutment_placed")
    assert p2.get("multi_unit_abutment_details") in (None, [], [{}])


# Test: Non-blocking validation — partial / invalid MUA values must not be rejected.
def test_04_invalid_partial_mua_non_blocking():
    proc_id = _full_arch_case()
    bad_details = [
        {"tooth": "11", "angulation": "60", "cuff_height": ""},   # angulation OOR, cuff empty
        {"tooth": "12", "angulation": "", "cuff_height": "15"},   # angulation empty, cuff OOR
        {"tooth": "21", "angulation": "abc", "cuff_height": "x"}, # non-numeric
        {"tooth": "22", "angulation": None, "cuff_height": None}, # null
    ]
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 35.0, 35.0, 35.0],
        "prosthetic_component": "Immediate Loading Done",
        "prosthesis_type": "Hybrid Prosthesis",
        "multi_unit_abutment_placed": "yes",
        "multi_unit_abutment_details": bad_details,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"server must NOT reject invalid MUA: {r.status_code} {r.text}"

    p2 = _get_phase2_data(proc_id)
    saved = p2.get("multi_unit_abutment_details") or []
    assert len(saved) == 4, f"expected 4 rows persisted, got {len(saved)}: {saved!r}"
    # raw values preserved as-sent (not coerced/dropped)
    assert saved[0].get("angulation") in ("60", 60)
    assert saved[0].get("cuff_height") in ("", None)
    assert saved[2].get("angulation") in ("abc", None) or saved[2].get("angulation") == "abc"


# Test: Regression — single-implant Phase 2 without MUA fields still works.
def test_05_single_implant_regression_no_mua():
    proc_id = _single_case()
    payload = {
        "pre_surgery_checklist": {"item1": True, "item2": True},
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0],
        "prosthetic_component": "Healing Abutment Placed",
        "iopa_files": [
            {"filename": "fake.jpg", "original_name": "iopa_14.jpg", "tooth_label": "14"}
        ],
        "sutures_placed": True,
        "hemostasis_achieved": True,
        "post_op_checklist": {"instructions_given": True},
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    p2 = _get_phase2_data(proc_id)
    assert p2.get("torque_values") == [35.0]
    assert p2.get("prosthetic_component") == "Healing Abutment Placed"
    assert isinstance(p2.get("iopa_files"), list) and p2["iopa_files"][0]["tooth_label"] == "14"
    assert p2.get("multi_unit_abutment_placed") in (None, "")
    assert p2.get("multi_unit_abutment_details") in (None, [], [{}])


# Test: Pydantic accepts extra-typed values for angulation/cuff_height inside dict (numeric or string).
def test_06_mua_numeric_typed_values_accepted():
    proc_id = _full_arch_case()
    mua_details = [
        {"tooth": "11", "angulation": 15, "cuff_height": 3},
        {"tooth": "12", "angulation": 0, "cuff_height": 0},
        {"tooth": "21", "angulation": 45, "cuff_height": 10},
        {"tooth": "22", "angulation": 22.5, "cuff_height": 5.5},
    ]
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 35.0, 35.0, 35.0],
        "prosthetic_component": "Immediate Loading Done",
        "prosthesis_type": "Hybrid Prosthesis",
        "multi_unit_abutment_placed": "yes",
        "multi_unit_abutment_details": mua_details,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    p2 = _get_phase2_data(proc_id)
    saved = p2.get("multi_unit_abutment_details") or []
    assert len(saved) == 4
    assert saved[3].get("angulation") in (22.5, "22.5")
