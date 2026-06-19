"""Regression tests for the deterministic clinical-rule engine.

Run with: cd /app/backend && python -m pytest tests/test_clinical_rules.py -v
"""
from clinical_rules import evaluate_case


def test_no_hits_on_empty_procedure():
    out = evaluate_case({})
    assert out == []


def test_immediate_loading_hard_block_on_low_isq():
    proc = {
        "loading_type": ["Immediate Loading"],
        "implant_plans": [
            {"position": "11", "isq": 55, "insertion_torque_ncm": 25},
        ],
    }
    hits = evaluate_case(proc)
    ids = [h["rule_id"] for h in hits]
    assert "immediate_loading_stability" in ids
    hit = next(h for h in hits if h["rule_id"] == "immediate_loading_stability")
    assert hit["severity"] == "hard_block"
    assert hit["citation"]["id"] == "ITI_2023_GROUP3_LOADING"


def test_immediate_loading_warning_on_low_torque_only():
    proc = {
        "loading_type": ["Immediate Loading"],
        "implant_plans": [
            {"position": "11", "isq": 72, "insertion_torque_ncm": 25},
        ],
    }
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "immediate_loading_stability")
    assert hit["severity"] == "warning"


def test_diabetic_stack_with_smoking_picks_smoking_citation():
    proc = {
        "medical_history": {"hba1c": 7.8, "smoker": True},
    }
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "diabetic_stack")
    assert hit["citation"]["id"] == "JIANG_SMOKING_SR_2022"
    assert hit["severity"] == "warning"


def test_diabetic_hard_block_above_9pct():
    proc = {"medical_history": {"hba1c": 9.5, "smoker": False}}
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "diabetic_stack")
    assert hit["severity"] == "hard_block"


def test_diabetic_no_hit_when_controlled():
    proc = {"medical_history": {"hba1c": 6.8, "smoker": False}}
    hits = evaluate_case(proc)
    assert all(h["rule_id"] != "diabetic_stack" for h in hits)


def test_gbr_labial_wall_warning():
    proc = {
        "implant_procedure_type": "Implant Placement with Guided Bone Regeneration",
        "implant_plans": [
            {"position": "21", "labial_bone_thickness_mm": 0.6},
            {"position": "22", "labial_bone_thickness_mm": 1.2},
        ],
    }
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "gbr_labial_wall")
    assert hit["severity"] == "warning"
    assert len(hit["context"]["sites"]) == 1


def test_full_arch_angulation_warning_18_to_30():
    proc = {
        "implant_procedure_type": "All on 4",
        "implant_plans": [
            {"position": "11", "axial_angulation_deg": 5},
            {"position": "26", "axial_angulation_deg": 25},
        ],
    }
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "full_arch_angulation")
    assert hit["severity"] == "warning"
    assert hit["citation"]["id"] == "ITI_2023_GROUP4_FULLARCH"


def test_full_arch_angulation_hard_block_over_30():
    proc = {
        "implant_procedure_type": "All on 6",
        "implant_plans": [
            {"position": "11", "axial_angulation_deg": 0},
            {"position": "26", "axial_angulation_deg": 32},
        ],
    }
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "full_arch_angulation")
    assert hit["severity"] == "hard_block"
    assert hit["citation"]["id"] == "MISCH_2020_ANGULATION"


def test_full_arch_angulation_skipped_for_single_implant():
    proc = {
        "implant_procedure_type": "Single Conventional Implant",
        "implant_plans": [{"position": "11", "axial_angulation_deg": 20}],
    }
    hits = evaluate_case(proc)
    assert all(h["rule_id"] != "full_arch_angulation" for h in hits)


def test_isq_low_primary_stability_fires_under_60():
    proc = {"implant_plans": [{"position": "36", "isq": 58}]}
    hits = evaluate_case(proc)
    hit = next(h for h in hits if h["rule_id"] == "isq_low_primary_stability")
    assert hit["severity"] == "warning"
    assert hit["citation"]["id"] == "SENNERBY_MEREDITH_ISQ_2008"


def test_hits_sorted_hardblock_first():
    proc = {
        "loading_type": ["Immediate Loading"],
        "medical_history": {"hba1c": 9.5},
        "implant_plans": [{"position": "11", "isq": 50, "insertion_torque_ncm": 20}],
    }
    hits = evaluate_case(proc)
    assert hits[0]["severity"] == "hard_block"
    assert all(h["citation"]["takeaway"] for h in hits), "every hit must surface an evidence take-away"
