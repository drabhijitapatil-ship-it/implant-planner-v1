"""Regression tests for the full-arch atrophy classification (Carames).

Locks in:
  - Verbatim PDF wording for definitions + options
  - User-facing headlines (no "Option A/B/C" or "CC II" anywhere)
  - The "The Carames Classification" reference field
  - All 5 classes produce 3 options for both arches.

Run: cd /app/backend && python -m pytest tests/test_full_arch_classification.py -v
"""
import pytest
from full_arch_classification import (
    classify_full_arch,
    render_for_ai_context,
    SOURCE_REFERENCE,
)


def test_source_reference_label():
    assert SOURCE_REFERENCE == "The Carames Classification"


def test_maxilla_cc1_returns_verbatim_definition_and_three_options():
    out = classify_full_arch("maxilla", 17, 13, 7, 7)
    assert out["ok"] is True
    # internal palette key still computed (used only for colour) but never user-facing
    assert out["class"] == "CCI"
    assert out["source_reference"] == "The Carames Classification"
    # verbatim PDF definitions
    assert out["anterior_definition"] == "Anterior - Available bone (height >16 mm; width >6 mm)"
    assert out["posterior_definition"] == "Posterior - Available bone (height >12 mm; width >6 mm)"
    # exactly three treatment options with derived headlines
    assert len(out["treatment_options"]) == 3
    h = [o["headline"] for o in out["treatment_options"]]
    assert h == ["Fixed prosthesis - 6 implants",
                 "Fixed prosthesis - 4 implants",
                 "Removable overdenture - 4 implants"]
    # first option must contain the verbatim Carames sentence
    assert "six straight equidistant implants" in out["treatment_options"][0]["description"]
    assert "between the anterior walls of the maxillary sinuses" in out["treatment_options"][0]["description"]
    assert "fixed cross-arch prosthesis without a distal cantilever" in out["treatment_options"][0]["description"]


def test_no_classification_label_leaks_into_user_facing_fields():
    """Critical: ensure CC I/II/III/IV/V and Option A/B/C never appear."""
    BANNED = ["CC I", "CC II", "CC III", "CC IV", "CC V",
              "CCI ", "CCII ", "CCIII ", "CCIV ", "CCV ",
              "Option A", "Option B", "Option C"]
    for arch in ("maxilla", "mandible"):
        # sample the 5 classes by varying inputs
        cases = [
            (17, 13, 7, 7),   # CCI
            (17, 10, 7, 7),   # CCII
            (14, 6,  7, 7),   # CCIII
            (10, 3,  7, 7),   # CCIV
            (6,  3,  7, 7),   # CCV
        ]
        for ant_h, post_h, ant_w, post_w in cases:
            out = classify_full_arch(arch, ant_h, post_h, ant_w, post_w)
            assert out["ok"] is True
            user_text = " | ".join([
                out["anterior_definition"],
                out["posterior_definition"],
                *(o["headline"] for o in out["treatment_options"]),
                *(o["description"] for o in out["treatment_options"]),
                out["loading_recommendation"],
                out["augmentation_note"],
            ])
            for token in BANNED:
                assert token not in user_text, f"leaked '{token}' in {arch} {ant_h}/{post_h}: {user_text[:200]}"


def test_render_for_ai_context_quotes_definitions_and_options():
    out = classify_full_arch("maxilla", 14, 6, 7, 7)
    txt = render_for_ai_context(out)
    # Must cite the source by name
    assert "The Carames Classification" in txt
    # Must contain the verbatim definitions
    assert "moderate resorption: height >12 mm and <16 mm" in txt
    assert "advanced resorption: height >4 mm and <8 mm" in txt
    # Must contain at least one verbatim option paragraph
    assert "distally tilted implants in the premolar position" in txt
    # No banned labels
    for token in ["CC II", "CC III", "Option A", "Option B", "Option C"]:
        assert token not in txt


def test_mandible_cc5_overdenture_option_present():
    out = classify_full_arch("mandible", 6, 3, 4, 4)
    assert out["class"] == "CCV"
    headlines = [o["headline"] for o in out["treatment_options"]]
    assert headlines == ["Fixed prosthesis - 4 implants",
                         "Fixed prosthesis - 6 implants",
                         "Removable overdenture - 4 implants"]


def test_missing_inputs_return_safe_error():
    out = classify_full_arch("maxilla", None, 13)
    assert out == {"ok": False, "error": "anterior_height and posterior_height are required"}


def test_invalid_arch_returns_safe_error():
    out = classify_full_arch("upper", 17, 13)
    assert out["ok"] is False
