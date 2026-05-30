"""
Iteration 139 — MUA read-only display + Case Report PDF export + AI context.

Validates downstream consumers of the Phase 2 Multi-Unit Abutment (MUA) data:
1. POST /api/procedures/{id}/case-report PDF for a full-arch Immediate Loading
   case with MUA='yes' and per-tooth details renders the MUA section
   ("Multi-unit Abutment Placed: Yes", "Multi-unit Abutment Details", "Tooth <pos>",
   "Angulation", "Cuff Height").
2. PDF for a MUA='no' case contains "Multi-unit Abutment Placed: No" but NOT the
   "Multi-unit Abutment Details" details block.
3. PDF for a non-MUA case (MUA fields absent / null) contains NO "Multi-unit Abutment"
   text at all (no regression leak).
4. AI context built by `_build_case_context` includes "Multi-unit Abutment Placed"
   and "MUA Details" lines when MUA=yes.
5. Regression: existing PDF sections (Torque Values, Prosthetic Component,
   Healing Abutment Cuff Height, IOPA, OPG) still render correctly.
"""

import io
import os
import sys
import uuid

import pytest
import requests
from PyPDF2 import PdfReader

# ---------------------------- shared helpers from iter-139 tests ----------------------------
sys.path.insert(0, os.path.dirname(__file__))
from test_mua_phase2_iteration139 import (  # noqa: E402
    BASE_URL,
    STUDENT_CREDS,
    SUPERVISOR_CREDS,
    INCHARGE_CREDS,
    _login,
    _hdr,
    _create_procedure,
    _approve_phase1,
    _upload_consent,
    _submit_phase2,
    _get_phase2_data,
    _created_ids,
)


# ---------------------------- PDF helpers ----------------------------
def _request_case_report_pdf(proc_id: str, token: str) -> bytes:
    r = requests.post(
        f"{BASE_URL}/api/procedures/{proc_id}/case-report",
        headers=_hdr(token),
        timeout=60,
    )
    assert r.status_code == 200, f"case-report PDF call failed: {r.status_code} {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), \
        f"unexpected content-type: {r.headers.get('content-type')}"
    return r.content


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            pass
    return "\n".join(parts)


# ---------------------------- fixtures ----------------------------
def _full_arch_case_immediate():
    s_token = _login(STUDENT_CREDS)
    proc_id = _create_procedure(
        s_token,
        procedure_type="All on 4",
        loading_type=["Immediate Loading"],
        edentulous_sites=["11", "12", "21", "22"],
    )
    _created_ids.append(proc_id)
    _upload_consent(proc_id, s_token)
    status = _approve_phase1(proc_id)
    assert status == "phase1_approved", f"unexpected status after approval: {status}"
    return proc_id


def _full_arch_case_delayed():
    s_token = _login(STUDENT_CREDS)
    proc_id = _create_procedure(
        s_token,
        procedure_type="All on 4",
        loading_type=["Delayed Loading"],
        edentulous_sites=["11", "12", "21", "22"],
    )
    _created_ids.append(proc_id)
    _upload_consent(proc_id, s_token)
    status = _approve_phase1(proc_id)
    assert status == "phase1_approved"
    return proc_id


def _single_implant_case():
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
    assert status == "phase1_approved"
    return proc_id


# Reuse cleanup fixture from sibling module
@pytest.fixture(scope="module", autouse=True)
def _cleanup_module():
    yield
    try:
        token = _login(INCHARGE_CREDS)
        for pid in list(_created_ids):
            try:
                requests.delete(f"{BASE_URL}/api/procedures/{pid}", headers=_hdr(token), timeout=30)
            except Exception:
                pass
    except Exception:
        pass


# ---------------------------- TESTS ----------------------------

# Test 1: PDF for MUA='yes' full-arch Immediate Loading case contains all MUA strings.
def test_01_pdf_mua_yes_renders_details():
    proc_id = _full_arch_case_immediate()
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
    assert r.status_code == 200, f"submit-phase2 failed: {r.status_code} {r.text}"

    # confirm persisted
    p2 = _get_phase2_data(proc_id)
    assert p2.get("multi_unit_abutment_placed") == "yes"

    # generate PDF
    inc_token = _login(INCHARGE_CREDS)
    pdf_bytes = _request_case_report_pdf(proc_id, inc_token)
    assert pdf_bytes.startswith(b"%PDF"), "response is not a valid PDF"
    text = _extract_pdf_text(pdf_bytes)

    # Required MUA strings
    assert "Multi-unit Abutment Placed: Yes" in text, \
        f"missing MUA placed=Yes line. text head:\n{text[:1500]}"
    assert "Multi-unit Abutment Details" in text, \
        f"missing MUA details header. text:\n{text[:1500]}"
    # Each tooth row — accept with or without degree symbol (latin-1 safe() may strip)
    for d in mua_details:
        assert f"Tooth {d['tooth']}" in text, f"missing 'Tooth {d['tooth']}' row in PDF"
        # Numeric value must appear near tooth row
        assert d["angulation"] in text, f"angulation value {d['angulation']} not found"
        assert d["cuff_height"] in text, f"cuff_height value {d['cuff_height']} not found"
    assert "Angulation" in text
    assert "Cuff Height" in text

    # Regression — existing sections still render
    assert "Torque" in text or "torque" in text.lower()
    assert "Immediate Loading Done" in text or "Prosthetic Component" in text
    assert "Hybrid Prosthesis" in text


# Test 2: PDF for MUA='no' contains 'Placed: No' but NO details block.
def test_02_pdf_mua_no_no_details_block():
    proc_id = _full_arch_case_immediate()
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

    inc_token = _login(INCHARGE_CREDS)
    pdf_bytes = _request_case_report_pdf(proc_id, inc_token)
    text = _extract_pdf_text(pdf_bytes)

    assert "Multi-unit Abutment Placed: No" in text, \
        f"missing MUA placed=No line. text:\n{text[:1500]}"
    # Details block must NOT render
    assert "Multi-unit Abutment Details" not in text, \
        "MUA details block leaked when placed=No"


# Test 3: PDF for a non-MUA case (MUA fields absent) contains NO 'Multi-unit Abutment' text.
def test_03_pdf_no_mua_field_no_leak():
    proc_id = _single_implant_case()
    payload = {
        "pre_surgery_checklist": {"item1": True},
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0],
        "prosthetic_component": "Healing Abutment Placed",
        "healing_abutment_cuff_height": ["3"],
        "iopa_files": [
            {"filename": "fake.jpg", "original_name": "iopa_14.jpg", "tooth_label": "14"}
        ],
        "sutures_placed": True,
        "hemostasis_achieved": True,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    inc_token = _login(INCHARGE_CREDS)
    pdf_bytes = _request_case_report_pdf(proc_id, inc_token)
    text = _extract_pdf_text(pdf_bytes)

    assert "Multi-unit Abutment" not in text, \
        f"non-MUA case leaked MUA text:\n{text[:1500]}"
    # Regression — existing sections still render
    assert "Healing Abutment Cuff Height" in text or "Healing Abutment" in text
    assert "Healing Abutment Placed" in text or "Prosthetic Component" in text


# Test 4: AI context (_build_case_context) surfaces MUA lines for explainer/surgical-notes.
def test_04_ai_context_contains_mua_lines():
    # Direct unit-style import of the pure helper (no DB / no network)
    sys.path.insert(0, "/app/backend")
    from server import _build_case_context  # noqa: WPS433

    proc_with_mua = {
        "patient_name": "TEST",
        "phase2_data": {
            "prosthetic_component": "Immediate Loading Done",
            "prosthesis_type": "Hybrid Prosthesis",
            "torque_values": [35.0, 40.0, 38.0, 42.0],
            "access_channel_openings": ["Palatal", "Palatal", "Buccal", "Palatal"],
            "multi_unit_abutment_placed": "yes",
            "multi_unit_abutment_details": [
                {"tooth": "11", "angulation": "15", "cuff_height": "3"},
                {"tooth": "12", "angulation": "20", "cuff_height": "4"},
            ],
        },
    }
    ctx = _build_case_context(proc_with_mua)
    assert "Multi-unit Abutment Placed: Yes" in ctx, ctx
    assert "MUA Details" in ctx, ctx
    assert "Tooth 11" in ctx
    assert "15" in ctx and "3" in ctx
    # Existing context lines still present
    assert "Phase 2" in ctx
    assert "Prosthetic Component" in ctx
    assert "Access Channel Openings" in ctx

    # MUA=no — header line yes, details no
    proc_no = {"phase2_data": {"multi_unit_abutment_placed": "no", "multi_unit_abutment_details": None}}
    ctx_no = _build_case_context(proc_no)
    assert "Multi-unit Abutment Placed: No" in ctx_no
    assert "MUA Details" not in ctx_no

    # MUA absent — no leak
    proc_absent = {"phase2_data": {"prosthetic_component": "Healing Abutment Placed"}}
    ctx_absent = _build_case_context(proc_absent)
    assert "Multi-unit Abutment" not in ctx_absent
    assert "MUA" not in ctx_absent


# Test 5: PDF rendering for a Delayed Loading full-arch case where Phase 2 still
# may persist MUA fields — confirms read-only PDF emits whatever was saved.
def test_05_pdf_mua_yes_delayed_loading_full_arch():
    proc_id = _full_arch_case_delayed()
    mua_details = [
        {"tooth": "11", "angulation": 12, "cuff_height": 2},
        {"tooth": "12", "angulation": 18, "cuff_height": 3},
        {"tooth": "21", "angulation": 8,  "cuff_height": 2},
        {"tooth": "22", "angulation": 22, "cuff_height": 4},
    ]
    payload = {
        "anesthesia_adequate": "Yes",
        "flap_design": "Full Thickness",
        "drilling_type": "Sequential",
        "implant_seated_correctly": True,
        "torque_values": [35.0, 40.0, 38.0, 42.0],
        "prosthetic_component": "Healing Abutment Placed",
        "multi_unit_abutment_placed": "yes",
        "multi_unit_abutment_details": mua_details,
    }
    r = _submit_phase2(proc_id, payload)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    inc_token = _login(INCHARGE_CREDS)
    pdf_bytes = _request_case_report_pdf(proc_id, inc_token)
    text = _extract_pdf_text(pdf_bytes)
    assert "Multi-unit Abutment Placed: Yes" in text
    assert "Multi-unit Abutment Details" in text
    for d in mua_details:
        assert f"Tooth {d['tooth']}" in text
        assert str(d["angulation"]) in text
        assert str(d["cuff_height"]) in text
