"""
Verification tests for the 12 ported endpoints and associated helpers in main/backend/server.py.
"""
import pytest
from starlette.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import (
    app,
    get_current_user,
    CONSENT_TEXTS,
    CONSENT_CURRENT_VERSION,
    ZYGOMA_PTERYGOID_PROCEDURE_TYPES,
    PROCEDURE_TYPES,
    _render_signature_png,
    _resolve_active_implants_inline,
    _resolve_phase2_data_inline,
    _render_tabbed_phase_data,
    ZygomaPhaseUpdate,
    ZygomaCosignRequest,
    ProstheticPlanUpdate,
    TabbedPhaseData,
    ConsentEsignBody,
)
from fpdf import FPDF

client = TestClient(app)


def test_procedure_types_and_constants():
    """Verify Zygoma and Pterygoid procedure types are in PROCEDURE_TYPES and ZYGOMA_PTERYGOID_PROCEDURE_TYPES."""
    assert "Quad Zygoma Implants" in PROCEDURE_TYPES
    assert "Zygoma and Pterygoid Implants" in PROCEDURE_TYPES
    assert "Quad Zygoma Implants" in ZYGOMA_PTERYGOID_PROCEDURE_TYPES
    assert len(ZYGOMA_PTERYGOID_PROCEDURE_TYPES) == 5


def test_consent_texts_endpoint():
    """Verify GET /api/consent-texts returns current version and localized texts."""
    app.dependency_overrides[get_current_user] = lambda: {
        "_id": "64d000000000000000000001",
        "role": "student",
        "username": "test_student",
    }
    try:
        response = client.get("/api/consent-texts")
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == CONSENT_CURRENT_VERSION
        assert "texts" in data
        assert "en" in data["texts"]
        assert "hi" in data["texts"]
        assert "mr" in data["texts"]
    finally:
        app.dependency_overrides.clear()


def test_grant_proposal_download_endpoint():
    """Verify GET /api/docs/grant-proposal returns 200 with application/pdf."""
    response = client.get("/api/docs/grant-proposal")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "Implanr_Grant_Proposal.pdf" in response.headers.get("content-disposition", "")


def test_render_signature_png():
    """Verify rasterizing signature strokes produces valid PNG bytes."""
    strokes = [[[10.0, 10.0], [20.0, 20.0], [30.0, 30.0]]]
    png_bytes = _render_signature_png(strokes, 200, 100)
    assert isinstance(png_bytes, bytes)
    assert png_bytes.startswith(b"\x89PNG")


def test_inline_resolvers():
    """Verify _resolve_active_implants_inline and _resolve_phase2_data_inline."""
    proc = {
        "implants": [
            {"tooth_number": "16", "brand": "Adin", "system": "Touareg-S", "diameter": "4.2", "length": "10"},
        ],
        "phase2_survival_review": {
            "implants": {
                "0": {
                    "status": "Replaced",
                    "replacement": {
                        "tooth_number": "16",
                        "brand": "Straumann",
                        "system": "BLX",
                        "diameter": "4.5",
                        "length": "12",
                        "procedure_type": "Single Stage",
                        "prosthetic_component": "Healing Abutment",
                        "healing_abutment_mm": "4.0",
                        "iopa_url": "new_iopa.png",
                    },
                }
            }
        },
        "phase2_data": {
            "iopa_files": ["old_iopa.png"],
            "healing_abutment_cuff_height": [""],
            "prosthesis_type": [""],
        }
    }
    resolved_implants = _resolve_active_implants_inline(proc)
    assert len(resolved_implants) == 1
    assert resolved_implants[0]["brand"] == "Straumann"
    assert resolved_implants[0]["_active_revision"] is True

    _resolve_phase2_data_inline(proc)
    assert proc["phase2_data"]["iopa_files"][0] == "new_iopa.png"
    assert proc["phase2_data"]["healing_abutment_cuff_height"][0] == "4.0"


def test_render_tabbed_phase_data():
    """Verify _render_tabbed_phase_data handles tabbed records correctly without raising."""
    pdf = FPDF()
    pdf.add_page()
    phase_data = {
        "per_implant": {
            "16": {"implant_type": "conventional", "torque_ncm": 35, "isq": 72},
            "ZR1": {"implant_type": "zygoma", "torque_ncm": 45},
        },
        "advanced_clinical": {
            "zaga_confirmed_right": "Type 1",
            "oris_success_code": "Code 1",
        }
    }
    _render_tabbed_phase_data(
        pdf,
        safe=lambda x: str(x),
        add_field=lambda l, v: None,
        phase_data=phase_data,
        phase_num=2,
        is_zyg_case=True,
    )
    # If no exception, rendering succeeded


def test_pydantic_models_validation():
    """Verify input models validate constraints correctly."""
    # ZygomaPhaseUpdate
    z_update = ZygomaPhaseUpdate(phase="phase2", data={"key": "val"})
    assert z_update.phase == "phase2"
    with pytest.raises(Exception):
        ZygomaPhaseUpdate(phase="phase1", data={})  # only phase2-5 allowed

    # ZygomaCosignRequest
    cosign = ZygomaCosignRequest(stage="phase2", role_slot="supervisor")
    assert cosign.stage == "phase2"
    with pytest.raises(Exception):
        ZygomaCosignRequest(stage="phase1", role_slot="supervisor")

    # ProstheticPlanUpdate
    ppu = ProstheticPlanUpdate(prosthetic_plan="Cement-Retained Crown")
    assert ppu.prosthetic_plan == "Cement-Retained Crown"

    # TabbedPhaseData
    tpd = TabbedPhaseData(per_implant={"16": {"torque_ncm": 35}})
    assert tpd.per_implant["16"]["torque_ncm"] == 35

    # ConsentEsignBody
    ceb = ConsentEsignBody(
        strokes=[[[0.0, 0.0]]],
        pad_width=300,
        pad_height=150,
        confirmed_explained=True,
    )
    assert ceb.confirmed_explained is True


def test_unauthenticated_requests_fail():
    """Verify procedure endpoints enforce authentication."""
    res1 = client.patch("/api/procedures/64d000000000000000000001/zygoma-workflow", json={"phase": "phase2", "data": {}})
    assert res1.status_code in (401, 403)

    res2 = client.post("/api/procedures/64d000000000000000000001/zygoma-cosign", json={"stage": "phase2", "role_slot": "supervisor"})
    assert res2.status_code in (401, 403)

    res3 = client.get("/api/procedures/64d000000000000000000001/zygoma-cosigns")
    assert res3.status_code in (401, 403)

    res4 = client.patch("/api/procedures/64d000000000000000000001/tabbed-phase-data/2", json={})
    assert res4.status_code in (401, 403)

    res5 = client.post("/api/procedures/64d000000000000000000001/consent/esign", json={
        "strokes": [[[10, 10], [20, 20], [30, 30], [40, 40], [50, 50], [60, 60], [70, 70], [80, 80]]],
        "pad_width": 300,
        "pad_height": 150,
        "confirmed_explained": True,
    })
    assert res5.status_code in (401, 403)


def test_procedure_create_fields_and_startup():
    """Verify ProcedureCreate schema and startup seed definitions match requirements."""
    from server import ProcedureCreate, seed_on_startup
    import inspect

    fields = ProcedureCreate.__fields__
    assert "zygoma_pterygoid_data" in fields
    assert "zygoma_pterygoid_configuration" in fields
    assert "missing_teeth" in fields
    assert "teeth_present" in fields
    assert "patient_consent_form" in fields
    assert "intraoral_photos" in fields

    # Verify seed_on_startup is a coroutine function
    assert inspect.iscoroutinefunction(seed_on_startup)
