"""iter-391: Phase 2 Drilling Type cascade (drilling_guided_surgery_type / 
drilling_static_guide_type / drilling_sleeve_type / drilling_dynamic_nav_system).

Tests:
  1. Backend accepts and persists the 4 new optional drilling_* fields on
     POST /api/procedures/{id}/phase2 for the seeded student-owned test case
     (699fc5c1248100e8a0d87261, phase1_approved, Pre-Op completed).
  2. GET /api/procedures/{id} reads them back inside phase2_data.
  3. Old-style payload WITHOUT the new fields still validates (i.e. Phase2Submit
     considers them Optional -> no 422 UnprocessableEntity).
"""

import io
import os
import pytest
import requests

BASE_URL = "https://case-approval.preview.emergentagent.com"
CASE_ID = "699fc5c1248100e8a0d87261"
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


def _tiny_png_bytes() -> bytes:
    # 1x1 transparent PNG
    import base64
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )


def test_1_precheck_case_state(auth_headers):
    """Verify seeded case is in the expected pre-condition state."""
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("status") == "phase1_approved", f"status={d.get('status')}"
    assert d.get("phase2_preop_completed_at"), "Pre-Op should already be completed"
    assert d.get("procedure_surgery_type") == "Guided Surgery"
    assert d.get("guided_surgery_type") == "Static Guide"
    assert d.get("static_guide_type") == "Tooth Supported Guide"
    assert d.get("sleeve_type") == "Key Sleeve"
    assert len(d.get("implant_plans") or []) >= 1


def test_2_upload_consent_if_missing(auth_headers):
    """Consent form is required before Phase 2 submission; upload if absent."""
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}", headers=auth_headers, timeout=30)
    d = r.json()
    if d.get("patient_consent_form"):
        return  # already uploaded
    png = _tiny_png_bytes()
    files = {"file": ("consent.png", io.BytesIO(png), "image/png")}
    r2 = requests.post(
        f"{BASE_URL}/api/procedures/{CASE_ID}/upload-consent",
        headers=auth_headers,
        files=files,
        timeout=60,
    )
    assert r2.status_code in (200, 201), f"consent upload failed: {r2.status_code} {r2.text}"


def test_3_submit_phase2_with_new_drilling_fields(auth_headers):
    """POST full Phase 2 payload including 4 new drilling_* fields; expect 200."""
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full thickness flap",
        "drilling_type": "Guided Surgery",
        # NEW iter-391 fields — actual intra-op protocol (deviates from plan on sleeve)
        "drilling_guided_surgery_type": "Static Guide",
        "drilling_static_guide_type": "Tooth Supported Guide",
        "drilling_sleeve_type": "PEEK full sleeve",  # deviation vs Phase1 plan 'Key Sleeve'
        "drilling_dynamic_nav_system": None,
        "implant_seated_correctly": True,
        "torque_values": [35.0],
        "bone_graft_used": False,
        "prosthetic_component": "Cover Screw",
        "sutures_placed": True,
        "hemostasis_achieved": True,
        "post_op_checklist": {
            "primary_stability_achieved": True,
            "post_op_instructions_given": True,
            "post_op_medications_prescribed": True,
        },
        "iopa_files": [],
        "student_notes": "iter-391 backend test — sleeve changed to PEEK",
    }
    r = requests.post(
        f"{BASE_URL}/api/procedures/{CASE_ID}/submit-phase2",
        headers={**auth_headers, "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    assert r.status_code == 200, f"Phase2 submit failed: {r.status_code} {r.text}"


def test_4_get_readback_persists_new_drilling_fields(auth_headers):
    """Verify GET /procedures/{id} returns the 4 new drilling_* fields inside phase2_data."""
    r = requests.get(f"{BASE_URL}/api/procedures/{CASE_ID}", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    p2 = r.json().get("phase2_data") or {}
    assert p2.get("drilling_guided_surgery_type") == "Static Guide", p2
    assert p2.get("drilling_static_guide_type") == "Tooth Supported Guide", p2
    assert p2.get("drilling_sleeve_type") == "PEEK full sleeve", p2
    # dynamic nav was None
    assert p2.get("drilling_dynamic_nav_system") in (None, ""), p2
    # sanity — drilling_type still stored
    assert p2.get("drilling_type") == "Guided Surgery"


def test_5_optional_fields_no_422_on_missing(auth_headers):
    """Old-style payload WITHOUT the new drilling_* fields must still pass Pydantic
    validation. We re-post to the same case: business rule will reject (not
    phase1_approved anymore -> 400) but shape MUST NOT trip 422."""
    old_style_payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Envelope flap",
        "drilling_type": "Free Hand Sequential Drilling",
        "implant_seated_correctly": True,
        "torque_values": [30.0],
        "prosthetic_component": "Cover Screw",
    }
    r = requests.post(
        f"{BASE_URL}/api/procedures/{CASE_ID}/submit-phase2",
        headers={**auth_headers, "Content-Type": "application/json"},
        json=old_style_payload,
        timeout=30,
    )
    # NOT 422 = fields are truly optional in Phase2Submit
    assert r.status_code != 422, f"Old-style payload triggered validation error: {r.text}"
    # And business rule kicks in with 400 (case already pending_phase2)
    assert r.status_code in (200, 400), f"Unexpected: {r.status_code} {r.text}"
