"""iter-370 — Global D backend IMPLANT_INDICATIONS (Feb 2026).

Root cause the user reported: "Global D: All three implant systems are not
available anywhere in the app."

Even though the seed script (iter-368) inserted the SKUs in `implant_library`,
the backend `IMPLANT_INDICATIONS` dict (server.py) did NOT include Global D
entries. Consequences:

  1. `/api/implant-library/systems` returned Global D rows with empty
     `indication` — so the Let Me Choose dropdown row showed an empty subtitle
     and looked broken.
  2. `/api/implant-library/suggest-auto` filters out any system with an empty
     indication (`if not ind.get("indication"): continue`), so Global D
     was invisible in Suggest Me.

This test locks in the fix: all three Global D systems must expose an
indication + procedures + bone_types (+ tooth restrictions for 3.0 Implant &
twinkone 4) via `/implant-library/systems`, and must be reachable via
`/implant-library/suggest-auto`.
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


def _h():
    return {"Authorization": f"Bearer {TOKEN}"}


def _global_d_row(system_name: str):
    r = requests.get(f"{API_URL}/implant-library/systems", headers=_h(), timeout=15)
    r.raise_for_status()
    body = r.json()
    rows = body.get("systems", body) if isinstance(body, dict) else body
    for row in rows:
        if row.get("brand") == "Global D" and row.get("system") == system_name:
            return row
    raise AssertionError(f"Global D | {system_name} missing from /systems")


# ── /implant-library/systems payload ─────────────────────────────────────

def test_in_kone_universal_has_indication_payload():
    row = _global_d_row("In-Kone Universal")
    assert row["indication"], "indication text missing"
    assert row["indicated_bone_types"] == ["D1", "D2", "D3", "D4"]
    # Universal → conventional + immediate + all-on-X procedures
    assert "Single Conventional Implant" in row["indicated_procedures"]
    assert "Immediate Implant" in row["indicated_procedures"]
    assert "All on 4" in row["indicated_procedures"]


def test_3_0_implant_has_tooth_restriction():
    row = _global_d_row("3.0 Implant")
    assert row["indication"]
    # Restricted to lateral incisors (12, 22) + mandibular incisors (31, 32, 41, 42)
    assert sorted(row["restricted_teeth"]) == sorted(["12", "22", "31", "32", "41", "42"])
    assert row["indicated_procedures"] == ["Single Conventional Implant"]


def test_twinkone_4_posterior_only_soft_bone():
    row = _global_d_row("twinkone 4")
    assert row["indication"]
    # Ultra-short → posterior molars only (enforced via restricted_teeth so
    # Suggest Me actually filters non-molar teeth).
    assert sorted(row["restricted_teeth"]) == sorted([
        "16", "17", "26", "27", "36", "37", "46", "47",
    ])
    # Ultra-short → D3/D4 (soft bone) only
    assert row["indicated_bone_types"] == ["D3", "D4"]


# ── /implant-library/suggest-auto returns Global D ──────────────────────

def _suggest_brands(payload):
    r = requests.post(
        f"{API_URL}/implant-library/suggest-auto",
        headers=_h(),
        json=payload,
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    return [(s["brand"], s["system"]) for s in body.get("recommended_systems", [])]


def test_suggest_me_returns_in_kone_universal_for_tooth_14_d2():
    brands = _suggest_brands({
        "tooth": "14",
        "procedures": ["Conventional Implant Placement"],
        "bone_type": "D2",
        "bone_width": 7,
        "bone_height": 13,
    })
    assert ("Global D", "In-Kone Universal") in brands


def test_suggest_me_returns_3_0_implant_for_lateral_incisor_narrow_ridge():
    brands = _suggest_brands({
        "tooth": "12",
        "procedures": ["Conventional Implant Placement"],
        "bone_type": "D2",
        "bone_width": 4.5,
        "bone_height": 13,
    })
    assert ("Global D", "3.0 Implant") in brands


def test_suggest_me_returns_twinkone_4_for_posterior_restricted_bone_height():
    brands = _suggest_brands({
        "tooth": "16",
        "procedures": ["Conventional Implant Placement"],
        "bone_type": "D4",
        "bone_width": 6.5,
        "bone_height": 7,
    })
    assert ("Global D", "twinkone 4") in brands


def test_suggest_me_excludes_twinkone_4_from_anterior_teeth():
    """twinkone 4 is restricted to posterior molars only."""
    brands = _suggest_brands({
        "tooth": "11",
        "procedures": ["Conventional Implant Placement"],
        "bone_type": "D4",
        "bone_width": 6.5,
        "bone_height": 7,
    })
    assert ("Global D", "twinkone 4") not in brands


def test_suggest_me_excludes_3_0_implant_from_molar():
    """3.0 Implant is restricted to lateral / mandibular incisors."""
    brands = _suggest_brands({
        "tooth": "16",
        "procedures": ["Conventional Implant Placement"],
        "bone_type": "D2",
        "bone_width": 4.5,
        "bone_height": 13,
    })
    assert ("Global D", "3.0 Implant") not in brands
