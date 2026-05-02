"""
Iter-135 — AI per-site clinical correlation regression tests.

Verifies that the LLM-backed /api/ai/explain-recommendation and
/api/ai/explain-standalone endpoints surface site-specific Ridge Contour /
Soft Tissue Thickness / Keratinized Mucosa findings in their explanations,
and that _build_case_context emits the per-site block when
clinical_exam_per_site is populated on a procedure.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import requests

# Allow `import server` so we can unit-test `_build_case_context` directly.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

API_URL = os.environ.get(
    "API_URL",
    "https://dental-workflow-18.preview.emergentagent.com",
).rstrip("/")
STUDENT_LOGIN = {"identifier": "Gaurav.pandey", "password": "Student@123"}


# ────────────────────────── helpers ──────────────────────────
@pytest.fixture(scope="module")
def auth_headers() -> dict:
    r = requests.post(f"{API_URL}/api/auth/login", json=STUDENT_LOGIN, timeout=20)
    r.raise_for_status()
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"login response missing token: {r.json()}"
    return {"Authorization": f"Bearer {token}"}


# ────────────────────────── unit tests ──────────────────────────
def test_build_case_context_includes_per_site_block_when_populated():
    from server import _build_case_context  # local import to allow path tweak

    proc = {
        "patient_name": "Test Patient",
        "implant_procedure_type": "Multiple Conventional Implants",
        "missing_teeth": ["16", "17", "26"],
        "clinical_exam_per_site": {
            "17": {
                "ridge_contour": "Type B Knife Edge Ridge",
                "soft_tissue_thickness": "Thin (≤1mm)",
                "keratinized_mucosa": "Inadequate (<2mm)",
            },
            "26": {
                "ridge_contour": "Well Contoured",
                "soft_tissue_thickness": "Thick (>2mm)",
                "keratinized_mucosa": "Adequate (≥2mm)",
            },
        },
    }
    ctx = _build_case_context(proc)
    assert "Per-Site Intraoral Findings:" in ctx
    assert "Site 17" in ctx and "knife edge" in ctx.lower()
    assert "Site 26" in ctx and "well contoured" in ctx.lower()


def test_build_case_context_omits_per_site_block_when_empty():
    from server import _build_case_context

    proc = {"patient_name": "Test", "clinical_exam_per_site": {}}
    ctx = _build_case_context(proc)
    assert "Per-Site Intraoral Findings:" not in ctx


# ────────────────────────── integration: standalone ──────────────────────────
def test_explain_standalone_weights_thin_biotype(auth_headers):
    """When soft_tissue_thickness=Thin AND keratinized<2mm, the AI must mention
    soft-tissue augmentation / connective-tissue graft / free gingival graft."""
    body = {
        "tooth": "36",
        "tooth_region": "posterior mandible",
        "brand": "Nobel Biocare",
        "system": "NobelActive",
        "diameter": "4.3",
        "length": "10",
        "bone_width": "6.5",
        "bone_height": "12",
        "bone_type": "Type II",
        "ridge_contour": "Type B Knife Edge Ridge",
        "soft_tissue_thickness": "Thin (≤1mm)",
        "keratinized_mucosa": "Inadequate (<2mm)",
    }
    r = requests.post(
        f"{API_URL}/api/ai/explain-standalone",
        json=body,
        headers=auth_headers,
        timeout=120,
    )
    r.raise_for_status()
    explanation = (r.json().get("explanation") or "").lower()
    assert explanation, "empty explanation"
    # Must surface at least one of the soft-tissue augmentation / KM-grafting
    # clinical correlations, since both biotype and KM are deficient.
    soft_tissue_terms = [
        "free gingival graft",
        "connective tissue graft",
        "soft-tissue augmentation",
        "soft tissue augmentation",
        "apically positioned flap",
        "apically-positioned flap",
        "thicken the biotype",
        "tissue thickness",
    ]
    assert any(t in explanation for t in soft_tissue_terms), (
        f"AI did not mention soft-tissue / KM correlation. Explanation: {explanation!r}"
    )
    # Knife-edge ridge → ridge-split / GBR / narrower-platform implant
    ridge_terms = ["ridge split", "ridge-split", "gbr", "narrower platform", "narrow platform"]
    assert any(t in explanation for t in ridge_terms), (
        f"AI did not mention ridge correlation. Explanation: {explanation!r}"
    )


@pytest.mark.timeout(120)
def test_explain_standalone_omits_site_terms_when_no_findings(auth_headers):
    """When NO per-site fields are sent, the prompt should not invent site
    biotype claims out of thin air."""
    body = {
        "tooth": "12",
        "brand": "Straumann",
        "system": "BLT",
        "diameter": "4.1",
        "length": "10",
        "bone_width": "8.0",
        "bone_height": "13",
        "bone_type": "Type II",
    }
    r = requests.post(
        f"{API_URL}/api/ai/explain-standalone",
        json=body,
        headers=auth_headers,
        timeout=120,
    )
    r.raise_for_status()
    explanation = (r.json().get("explanation") or "").lower()
    assert explanation, "empty explanation"
    # The phrase "site-specific findings" came directly from the prompt block.
    # When the block is absent, the AI should NOT echo it.
    assert "site-specific findings" not in explanation
