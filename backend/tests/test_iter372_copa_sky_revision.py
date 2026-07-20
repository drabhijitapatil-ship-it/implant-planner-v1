"""iter-372 — Bredent copaSKY revision (Feb 2026).

Revised Copa Sky line-up: 6 diameters (Ø 3.0-6.0), 24 SKUs, universal
prosthetic platform (Ti-Base / uni.cone / TiSi.snap + retention.sil
inserts). Replaces the legacy 3-SKU ultra-short-only entry.
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
_CATALOG_DOC = None
_SYSTEMS_ROW = None


def setup_module(_):
    global TOKEN, _CATALOG_DOC, _SYSTEMS_ROW
    TOKEN = _login()
    h = {"Authorization": f"Bearer {TOKEN}"}
    r = requests.get(f"{API_URL}/implant-catalog", headers=h, timeout=15)
    r.raise_for_status()
    for s in r.json().get("systems", []):
        if s.get("brand") == "Bredent" and (s.get("name") in ("Copa Sky", "copaSKY")):
            _CATALOG_DOC = s
            break
    r = requests.get(f"{API_URL}/implant-library/systems", headers=h, timeout=15)
    r.raise_for_status()
    for d in r.json():
        if d.get("brand") == "Bredent" and d.get("system") == "Copa Sky":
            _SYSTEMS_ROW = d
            break


# ── /implant-library/systems (Suggest Me + Let Me Choose picker) ────────

def test_implant_library_has_24_copa_sky_skus():
    row = _SYSTEMS_ROW
    assert row is not None, "Bredent | Copa Sky missing from /systems"
    assert row["count"] == 24, row["count"]
    assert sorted(row["diameters"]) == [3.0, 3.5, 4.0, 4.5, 5.0, 6.0]
    assert 5.0 in row["lengths"] and 14.0 in row["lengths"]


def test_copa_sky_universal_procedures_and_bone():
    row = _SYSTEMS_ROW
    assert row["indicated_bone_types"] == ["D1", "D2", "D3", "D4"]
    # All-on-X support added — previously restricted to single conventional only.
    assert "All on 4" in row["indicated_procedures"]
    assert "Immediate Implant" in row["indicated_procedures"]
    # Old tooth restriction removed.
    assert "restricted_teeth" not in row or not row.get("restricted_teeth")


# ── /implant-catalog (Implant Database + Compare tool) ─────────────────

def test_catalog_doc_has_universal_platform_components():
    doc = _CATALOG_DOC
    assert doc is not None, "Bredent copaSKY missing from /implant-catalog"
    comps = doc.get("components") or []
    assert len(comps) >= 40, len(comps)
    # All components share the universal platform naming
    universal_platforms = {"copaSKY", "copaSKY-UC", "copaSKY-TiSi"}
    plats = {c.get("platform") for c in comps}
    assert plats.issubset(universal_platforms), f"unexpected platforms: {plats}"


def _comps(t):
    return [c for c in (_CATALOG_DOC.get("components") or []) if c["type"] == t]


def test_healing_abutment_universal_gh_grid():
    hab = _comps("healing_abutment")
    ghs = {c["gingival_heights_mm"][0] for c in hab}
    assert ghs == {1.5, 2.5, 3.5, 4.5, 6.5}


def test_cement_and_single_screw_via_ti_base():
    ti_bases = _comps("ti_base")
    cement_or_screw = [c for c in ti_bases if "cement" in (c.get("retention") or [])]
    # copaSKY Ti-Base (H 3 & H 5) — supports both cement and single screw-retained
    assert len(cement_or_screw) >= 4, len(cement_or_screw)


def test_multi_unit_uni_cone_grid():
    muas = _comps("multi_unit_abutment")
    ang_set = {c.get("angulation_deg") for c in muas}
    assert {0, 17, 30}.issubset(ang_set), ang_set
    for c in muas:
        # uni.cone lives on its own aux platform for the impression workflow
        assert c["platform"] in ("copaSKY", "copaSKY-UC")


def test_tisi_snap_replaces_locator_name():
    """User: do NOT use 'Locator' name for Copa Sky — use TiSi.snap only."""
    locators = _comps("locator_abutment")
    assert len(locators) >= 4, len(locators)
    for c in locators:
        assert "TiSi.snap" in c["subtype"], c["subtype"]
        assert "Locator" not in c["subtype"], c["subtype"]
        assert c["platform"] == "copaSKY-TiSi"


def test_retention_sil_three_hardnesses():
    inserts = _comps("retention_insert")
    subtypes = {c["subtype"] for c in inserts}
    # Three retention.sil hardnesses (user-specified)
    assert any("200" in s for s in subtypes), subtypes
    assert any("400" in s for s in subtypes), subtypes
    assert any("600" in s for s in subtypes), subtypes
    # Verify indications map to the correct clinical use (immediate / 4-imp / 2-imp)
    ind_200 = next(c["indication"] for c in inserts if "200" in c["subtype"])
    ind_400 = next(c["indication"] for c in inserts if "400" in c["subtype"])
    ind_600 = next(c["indication"] for c in inserts if "600" in c["subtype"])
    assert "immediate" in ind_200.lower()
    assert "4-implant" in ind_400.lower() or "4 impl" in ind_400.lower()
    assert "2-implant" in ind_600.lower() or "2 impl" in ind_600.lower()


def test_no_locator_word_anywhere_in_copa_sky():
    """Full sweep — 'Locator' string must never appear in Copa Sky subtypes /
    indications / catalog codes."""
    for c in _CATALOG_DOC.get("components") or []:
        blob = " ".join([
            str(c.get("subtype", "")),
            str(c.get("indication", "")),
            str(c.get("catalog_code", "")),
        ]).lower()
        assert "locator" not in blob, f"Locator leaked in: {c}"


def test_suggest_me_finds_copa_sky_for_narrow_incisor():
    """Ø 3.0 mm SKU now allows narrow-ridge maxillary incisor placement."""
    h = {"Authorization": f"Bearer {TOKEN}"}
    r = requests.post(
        f"{API_URL}/implant-library/suggest-auto", headers=h,
        json={
            "tooth": "12",
            "procedures": ["Conventional Implant Placement"],
            "bone_type": "D2", "bone_width": 4.5, "bone_height": 13,
        }, timeout=15,
    )
    r.raise_for_status()
    brands = [(s["brand"], s["system"]) for s in r.json().get("recommended_systems", [])]
    assert ("Bredent", "Copa Sky") in brands


def test_catalog_codes_unique():
    codes = [c["catalog_code"] for c in _CATALOG_DOC.get("components") or [] if c.get("catalog_code")]
    dupes = [x for x in codes if codes.count(x) > 1]
    assert not dupes, f"duplicate catalog codes: {set(dupes)}"


def test_compare_tool_lists_copa_sky_multi_unit():
    h = {"Authorization": f"Bearer {TOKEN}"}
    r = requests.get(
        f"{API_URL}/implant-catalog/compare?component_type=multi_unit_abutment",
        headers=h, timeout=15,
    )
    r.raise_for_status()
    matched = [s for s in r.json().get("systems", []) if s.get("brand") == "Bredent"
               and s.get("name") in ("copaSKY", "Copa Sky")]
    assert matched, "Copa Sky not in multi_unit_abutment Compare view"
