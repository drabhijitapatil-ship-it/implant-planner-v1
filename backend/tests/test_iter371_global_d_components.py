"""iter-371 — Global D prosthetic component matrix (Feb 2026).

Locks in the Global D component seeding across all three systems (In-Kone
Universal, twinkone 4, 3.0 Implant) so the Implant Database + Compare tool +
Ask Implanr AI can surface the right prosthetic parts.

Ensures each system exposes explicit restoration-mode coverage:
  • cement-retained (`retention` contains "cement")
  • single screw-retained (via ti_base with `retention` containing "screw")
  • multi-unit screw-retained (`multi_unit_abutment` — bridges / All-on-X /
    bar overdentures)
  • removable overdenture (In-Kone Universal only — Locator® pathway)
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
_CATALOG = {}


def setup_module(_):
    global TOKEN, _CATALOG
    TOKEN = _login()
    r = requests.get(
        f"{API_URL}/implant-catalog",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    r.raise_for_status()
    for s in r.json().get("systems", []):
        if s.get("brand") == "Global D":
            _CATALOG[s["name"]] = s


def _comps(system_name: str, comp_type: str):
    doc = _CATALOG[system_name]
    return [c for c in (doc.get("components") or []) if c["type"] == comp_type]


# ── System-level component counts (baseline sanity) ─────────────────────

def test_in_kone_universal_has_components():
    doc = _CATALOG["In-Kone Universal"]
    total = len(doc.get("components") or [])
    assert total >= 150, f"expected ≥150 In-Kone components, got {total}"


def test_twinkone_4_has_components():
    doc = _CATALOG["twinkone 4"]
    total = len(doc.get("components") or [])
    assert 20 <= total <= 40, f"twinkone 4 count out of range: {total}"


def test_3_0_implant_has_components():
    doc = _CATALOG["3.0 Implant"]
    total = len(doc.get("components") or [])
    assert 15 <= total <= 25, f"3.0 Implant count out of range: {total}"


# ── Cement-retained pathway (required in In-Kone + 3.0) ────────────────

def test_in_kone_universal_cement_retained_grid():
    """Standard cement abutments across 3 platforms × 4 angulations."""
    finals = _comps("In-Kone Universal", "final_abutment")
    cement = [c for c in finals if "cement" in (c.get("retention") or [])]
    assert len(cement) >= 60, len(cement)
    # All 4 angulations present
    ang_set = {c.get("angulation_deg") for c in cement}
    assert {0, 7, 15, 23}.issubset(ang_set), ang_set
    # All 3 platforms present
    diam_set = {c.get("diameter_mm") for c in cement}
    assert {4.0, 5.0, 6.5}.issubset(diam_set), diam_set


def test_3_0_implant_cement_retained_incisor_only():
    """3.0 Implant cement abutments cover 0° / 7° / 15° for incisor sites."""
    finals = _comps("3.0 Implant", "final_abutment")
    cement = [c for c in finals if "cement" in (c.get("retention") or [])]
    ang_set = {c.get("angulation_deg") for c in cement}
    assert ang_set == {0, 7, 15}, ang_set
    # All Ø 3.4
    assert all(c.get("diameter_mm") == 3.4 for c in cement)


# ── Single screw-retained pathway (ti_base) ────────────────────────────

def test_in_kone_universal_single_screw_retained_ti_bases():
    """Ti-bases for single-tooth CAD/CAM zirconia crowns."""
    ti_bases = _comps("In-Kone Universal", "ti_base")
    assert len(ti_bases) >= 6, len(ti_bases)
    # Two form-factors: Ø 3.8 and Ø 5.5
    diams = {c.get("diameter_mm") for c in ti_bases if c.get("diameter_mm") in (3.8, 5.5)}
    assert diams == {3.8, 5.5}, diams
    # All must be screw-retained + CAD/CAM
    for c in ti_bases[:6]:
        assert "screw" in (c.get("retention") or [])


# ── Multi-unit screw-retained pathway (bridges / All-on-X / bars) ──────

def test_in_kone_universal_multi_unit_conical_abutments():
    muas = _comps("In-Kone Universal", "multi_unit_abutment")
    # 5 straight + 12 angled (17°/30° × indexed/non-indexed × 3 GH)
    assert len(muas) >= 15, len(muas)
    ang_set = {c.get("angulation_deg") for c in muas}
    assert {0, 17, 30}.issubset(ang_set), ang_set


def test_twinkone_4_is_screw_retained_only():
    """twinkone 4 has no cement-retained abutments — full-arch screw only."""
    doc = _CATALOG["twinkone 4"]
    for c in doc.get("components", []):
        assert "cement" not in (c.get("retention") or []), c
    muas = _comps("twinkone 4", "multi_unit_abutment")
    assert len(muas) >= 2, len(muas)


# ── Removable / Locator® pathway (In-Kone only) ────────────────────────

def test_in_kone_universal_locator_pathway():
    locators = _comps("In-Kone Universal", "locator_abutment")
    assert len(locators) == 5, len(locators)  # GH 1.5 / 2.2 / 3 / 4 / 5
    # 6 colored inserts each as its own SKU
    inserts = _comps("In-Kone Universal", "retention_insert")
    colors_seen = {i["subtype"].split("—")[1].strip().split(" ")[0].lower() for i in inserts
                   if "insert" in i["subtype"].lower()}
    for expected in ("blue", "pink", "white", "red", "green", "orange"):
        assert expected in colors_seen, f"missing {expected} in {colors_seen}"


# ── Compare tool cross-brand visibility ────────────────────────────────

def test_compare_healing_abutment_returns_all_three_global_d_systems():
    r = requests.get(
        f"{API_URL}/implant-catalog/compare?component_type=healing_abutment",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    r.raise_for_status()
    gd_systems = [s for s in r.json().get("systems", []) if s.get("brand") == "Global D"]
    assert {s["name"] for s in gd_systems} == {"In-Kone Universal", "twinkone 4", "3.0 Implant"}


def test_compare_multi_unit_abutment_includes_global_d():
    r = requests.get(
        f"{API_URL}/implant-catalog/compare?component_type=multi_unit_abutment",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    r.raise_for_status()
    gd_systems = [s for s in r.json().get("systems", []) if s.get("brand") == "Global D"]
    # In-Kone Universal + twinkone 4 have MUA; 3.0 Implant does NOT (single-tooth only).
    names = {s["name"] for s in gd_systems}
    assert "In-Kone Universal" in names
    assert "twinkone 4" in names


def test_compare_locator_abutment_includes_in_kone():
    r = requests.get(
        f"{API_URL}/implant-catalog/compare?component_type=locator_abutment",
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=15,
    )
    r.raise_for_status()
    gd_systems = [s for s in r.json().get("systems", []) if s.get("brand") == "Global D"]
    assert any(s["name"] == "In-Kone Universal" for s in gd_systems)


# ── Catalog-code uniqueness (no duplicate SKUs across a system) ────────

def test_catalog_codes_unique_per_system():
    for name, doc in _CATALOG.items():
        codes = [c.get("catalog_code") for c in doc.get("components", []) if c.get("catalog_code")]
        dupes = [c for c in codes if codes.count(c) > 1]
        assert not dupes, f"{name} has duplicate catalog codes: {set(dupes)}"
