"""iter-373 — Bredent copaSKY revised drilling protocol (Feb 2026).

Source: user-supplied Bredent copaSKY 12-page surgical catalogue (Feb 2026).

Locks in the 4-step universal drilling sequence (Crestal → Pilot → Twist →
Final) scaled per implant diameter, with:
  • D1 dense bone   → final drill from SKYD12xx series
  • D2 medium bone  → final drill from SKYD34xx series
  • D3 soft bone    → same D34xx REF, under-prep hint in note
  • D4 very soft    → same D34xx REF but *anticlockwise 50 rpm* condensation
  • Ø 6.0 D1        → extra cortical/countersink step (user policy 2a)
  • Ultra-short L 5 → "pilot only to laser mark" safety guardrail (policy 3a)
  • Insertion torque > 45 N·cm → recovery rule surfaced in placement note.
"""
import os
import sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path("/app/backend").resolve()))
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not API_URL.endswith("/api"):
    API_URL = API_URL.rstrip("/") + "/api"


def _login():
    r = requests.post(
        f"{API_URL}/auth/login",
        json={"identifier": "Abhijit.patil", "password": "Admin@123"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


TOKEN = None


def setup_module(_):
    global TOKEN
    TOKEN = _login()


def _protocol(diameter, length, bone):
    r = requests.post(
        f"{API_URL}/drilling-protocols/generate",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={
            "brand": "Bredent", "system": "Copa Sky",
            "diameter": diameter, "length": length, "bone_density": bone,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _step_codes(protocol):
    return [s["code"] for s in protocol["steps"]]


def _step_types(protocol):
    return [s["drill_type"] for s in protocol["steps"]]


# ── Universal 4-step sequence ─────────────────────────────────────────

def test_standard_sequence_four_drilling_steps_plus_placement():
    p = _protocol(4.0, 10, "D2")
    types = _step_types(p)
    assert types == [
        "Crestal Drill", "Pilot Drill", "Twist Drill",
        "Final Drill", "Implant Placement",
    ], types


# ── Per-Ø drill REF mapping (brochure ground truth) ──────────────────

def test_ref_codes_diameter_3_5_d1_uses_skyd1235():
    p = _protocol(3.5, 8, "D1")
    codes = _step_codes(p)
    assert "SKYCD35n" in codes  # crestal
    assert "SKY-DP06" in codes  # pilot 2.0
    assert "SKYDT23K" in codes  # twist 2.5
    assert "SKYD1235" in codes  # D1 final


def test_ref_codes_diameter_5_0_d2_uses_skyd3455():
    p = _protocol(5.0, 12, "D2")
    codes = _step_codes(p)
    assert "SKYXCD55" in codes
    assert "SKY-DP08" in codes
    assert "SKYDT23L" in codes
    assert "SKYD3455" in codes


def test_ref_codes_diameter_6_0_d2_uses_copd3460():
    p = _protocol(6.0, 8, "D2")
    codes = _step_codes(p)
    assert "COPACD60" in codes
    assert "COPD1260" in codes  # pilot for 6.0
    assert "COPD3460" in codes  # twist + final soft


# ── Bone-density branching ───────────────────────────────────────────

def test_d4_soft_bone_uses_anticlockwise_condensation():
    p = _protocol(5.0, 12, "D4")
    final = next(s for s in p["steps"] if s["drill_type"] == "Final Drill")
    assert "anticlockwise" in final["rpm"].lower()
    assert "condensation" in final["note"].lower()


def test_d1_dense_bone_uses_d1_final_ref_series():
    """D1 uses SKYD12xx / COPD12xx REF series; D2-D4 uses SKYD34xx / COPD34xx."""
    for d, expected_d1_ref in [(3.5, "SKYD1235"), (4.0, "SKYD1240"),
                                (4.5, "SKYD1245"), (5.0, "SKYD1255")]:
        p = _protocol(d, 10, "D1")
        final = next(s for s in p["steps"] if s["drill_type"] == "Final Drill")
        assert final["code"] == expected_d1_ref, (d, final["code"])


def test_d3_soft_bone_hints_under_preparation():
    p = _protocol(4.0, 10, "D3")
    final = next(s for s in p["steps"] if s["drill_type"] == "Final Drill")
    assert "under-prep" in final["note"].lower() or "under prep" in final["note"].lower()


# ── Ø 6.0 D1 gets cortical / countersink step (policy 2a) ───────────

def test_wide_diameter_d1_gets_extra_cortical_step():
    p = _protocol(6.0, 8, "D1")
    types = _step_types(p)
    assert any("Cortical" in t or "Countersink" in t for t in types), types
    # But NOT for D2 (only cortical widening in D1)
    p2 = _protocol(6.0, 8, "D2")
    types2 = _step_types(p2)
    assert not any("Cortical" in t or "Countersink" in t for t in types2), types2


# ── Ultra-short L ≤ 5 safety guardrail (policy 3a) ──────────────────

def test_ultra_short_5mm_has_laser_mark_safety_note():
    p = _protocol(4.0, 5, "D2")
    crestal = next(s for s in p["steps"] if s["drill_type"] == "Crestal Drill")
    pilot = next(s for s in p["steps"] if s["drill_type"] == "Pilot Drill")
    blob = (crestal["note"] + " " + pilot["note"]).lower()
    assert "laser mark" in blob, blob
    assert "over-prepare" in blob or "over prepare" in blob, blob


def test_standard_length_10mm_has_no_ultra_short_note():
    p = _protocol(4.0, 10, "D2")
    blob = " ".join(s["note"] for s in p["steps"]).lower()
    assert "laser mark" not in blob


# ── Insertion torque > 45 N·cm safety rule ──────────────────────────

def test_placement_note_surfaces_torque_recovery_rule():
    p = _protocol(4.0, 10, "D2")
    place = next(s for s in p["steps"] if s["drill_type"] == "Implant Placement")
    note = place["note"].lower()
    assert "45" in note
    assert "unscrew" in note
    assert "10" in note  # 10-second wait rule


# ── Full 24-SKU coverage — every published (Ø × L) yields a valid protocol ──

def test_all_24_copa_sky_skus_yield_valid_protocol():
    matrix = [
        (3.0, [8, 10, 12, 14]),
        (3.5, [8, 10, 12, 14]),
        (4.0, [5, 8, 10, 12, 14]),
        (4.5, [5, 8, 10, 12, 14]),
        (5.0, [5, 8, 10, 12]),
        (6.0, [5, 8]),
    ]
    total = 0
    for d, lengths in matrix:
        for L in lengths:
            for bone in ("D1", "D2", "D3", "D4"):
                p = _protocol(d, L, bone)
                assert p["steps"], f"empty steps for Ø{d}×{L} {bone}"
                assert p["steps"][-1]["drill_type"] == "Implant Placement"
                total += 1
    assert total == 24 * 4, total  # 24 SKUs × 4 bone types = 96 protocol variants
