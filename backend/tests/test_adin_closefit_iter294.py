"""iter-294 backend regression: Adin CloseFit update.

Verifies:
  - SYSTEM_SIZES — UNP CloseFit drops 8mm (6 lengths); NP=6, RP=6, WP=12
  - Drilling protocol primary = SEQUENTIAL (Pilot 2.0 + Twist 2.8 + …)
  - alt_protocol = "Tri-Step Drill (alternative)" only for RP/WP CloseFit
  - UNP / NP CloseFit have NO alt_protocol
  - Cortical-only logic preserved
  - D4 (soft bone) handling
  - Unified step schema (no missing keys)
  - Per-platform expanded components (30 UNP / 30 NP / 30 RP / 49 WP)
  - WP SRA = 15 (TMA straight 5 + 17° 4 + 30° 4 + flat 2)
  - Regression: Touareg-OS/S, Swell, One libraries + Straumann BLT/BLX unchanged
"""
import os
import urllib.parse
from collections import Counter

import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

REQUIRED_COMP_FIELDS = {"type", "subtype", "platform", "catalog_code", "indication"}
REQUIRED_STEP_FIELDS = {
    "step", "drill_type", "code", "diameter", "depth",
    "cortical_only", "rpm", "irrigation", "note",
}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Abhijit.patil", "password": "Admin@123"},
    )
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _library(api, hdr):
    r = api.get(f"{BASE_URL}/api/implant-library/systems", headers=hdr)
    assert r.status_code == 200, f"library {r.status_code}: {r.text[:200]}"
    return r.json()


def _adin_rows(lib):
    return [x for x in lib if x.get("brand") == "Adin"]


def _gen(api, hdr, brand, system, diameter, length, bone):
    return api.post(
        f"{BASE_URL}/api/drilling-protocols/generate",
        json={"brand": brand, "system": system, "diameter": diameter,
              "length": length, "bone_density": bone},
        headers=hdr,
    )


def _catalog(api, hdr, brand_system):
    qs = urllib.parse.urlencode({"key": brand_system})
    return api.get(f"{BASE_URL}/api/implant-catalog/by-key?{qs}", headers=hdr)


# ── Library: UNP 8mm removed; NP/RP=6, WP=12 ──────────────────────────────
def test_unp_closefit_no_8mm(api, hdr):
    rows = {r["system"]: r for r in _adin_rows(_library(api, hdr))}
    assert "UNP CloseFit" in rows, "UNP CloseFit missing"
    unp = rows["UNP CloseFit"]
    assert unp["diameters"] == [2.75], unp["diameters"]
    assert unp["lengths"] == [10.0, 11.5, 13.0, 15.0, 16.0, 18.0], unp["lengths"]
    assert 8.0 not in unp["lengths"], "UNP CloseFit must NOT include 8mm"


def test_adin_other_closefit_length_counts(api, hdr):
    rows = {r["system"]: r for r in _adin_rows(_library(api, hdr))}
    assert len(rows["NP CloseFit"]["lengths"]) == 6
    assert len(rows["RP CloseFit"]["lengths"]) == 6
    # WP CloseFit `count` is total SKUs across both diameters (Ø4.3 + Ø5.0)
    assert rows["WP CloseFit"]["count"] == 12, rows["WP CloseFit"]


# ── Drilling: RP CloseFit Ø3.5 L11.5 D2 ───────────────────────────────────
def test_rp_closefit_d2_sequential_primary_and_tristep_alt(api, hdr):
    r = _gen(api, hdr, "Adin", "RP CloseFit", 3.5, 11.5, "D2")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    steps = body.get("steps") or body.get("protocol", {}).get("steps") or []
    # 3 drills + Implant Placement = 4 total
    assert len(steps) == 4, f"expected 4 steps, got {len(steps)}: {[s.get('drill_type') for s in steps]}"
    diams = [s.get("diameter") for s in steps[:3]]
    assert diams == [2.0, 2.8, 3.2], diams
    assert "implant" in (steps[-1].get("drill_type") or steps[-1].get("note") or "").lower() \
        or "placement" in (steps[-1].get("drill_type") or "").lower()
    alt = body.get("alt_protocol")
    assert alt is not None, "alt_protocol missing for RP CloseFit"
    assert alt.get("name") == "Tri-Step Drill (alternative)", alt.get("name")
    alt_steps = alt.get("steps") or []
    # 1 Tri-Step Ø3.2 + Implant Placement = 2 steps
    assert len(alt_steps) == 2, f"alt steps = {len(alt_steps)}: {alt_steps}"
    assert alt_steps[0].get("diameter") == 3.2, alt_steps[0]
    assert "tri" in (alt_steps[0].get("drill_type") or "").lower(), alt_steps[0]


# ── Drilling: WP CloseFit Ø5.0 L13 D2 ─────────────────────────────────────
def test_wp_closefit_50_d2_sequential_and_tristep_alt(api, hdr):
    r = _gen(api, hdr, "Adin", "WP CloseFit", 5.0, 13, "D2")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    steps = body.get("steps") or []
    # 6 drills + placement = 7
    assert len(steps) == 7, f"expected 7 steps, got {len(steps)}"
    diams = [s.get("diameter") for s in steps[:6]]
    assert diams == [2.0, 2.8, 3.2, 3.6, 4.2, 4.6], diams
    alt = body.get("alt_protocol")
    assert alt and alt.get("name") == "Tri-Step Drill (alternative)"
    # Tri-Step 3.6 + Twist 4.2 + Coronal 4.6 + placement = 4
    assert len(alt["steps"]) == 4, f"alt steps={len(alt['steps'])}: {alt['steps']}"
    alt_diams = [s.get("diameter") for s in alt["steps"][:3]]
    assert alt_diams == [3.6, 4.2, 4.6], alt_diams


# ── Drilling: WP CloseFit Ø4.3 L11.5 D2 ───────────────────────────────────
def test_wp_closefit_43_d2_sequential_and_tristep_alt(api, hdr):
    r = _gen(api, hdr, "Adin", "WP CloseFit", 4.3, 11.5, "D2")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    steps = body.get("steps") or []
    assert len(steps) == 5, f"expected 5 (4 drills + placement), got {len(steps)}"
    diams = [s.get("diameter") for s in steps[:4]]
    assert diams == [2.0, 2.8, 3.2, 3.6], diams
    alt = body.get("alt_protocol")
    assert alt and alt.get("name") == "Tri-Step Drill (alternative)"
    assert len(alt["steps"]) == 2, alt["steps"]
    assert alt["steps"][0].get("diameter") == 3.6, alt["steps"][0]


# ── Drilling: UNP CloseFit Ø2.75 L10 D2 — NO alt_protocol ────────────────
def test_unp_closefit_d2_no_alt_protocol(api, hdr):
    r = _gen(api, hdr, "Adin", "UNP CloseFit", 2.75, 10, "D2")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    steps = body.get("steps") or []
    # 2 drills + placement = 3
    assert len(steps) == 3, f"expected 3, got {len(steps)}: {[s.get('drill_type') for s in steps]}"
    diams = [s.get("diameter") for s in steps[:2]]
    assert diams == [2.0, 2.5], diams
    assert body.get("alt_protocol") is None, f"UNP must NOT have alt_protocol, got: {body.get('alt_protocol')}"


# ── Drilling: NP CloseFit Ø3.0 L11.5 D2 — NO alt_protocol ────────────────
def test_np_closefit_d2_no_alt_protocol(api, hdr):
    r = _gen(api, hdr, "Adin", "NP CloseFit", 3.0, 11.5, "D2")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    steps = body.get("steps") or []
    assert len(steps) == 3, f"expected 3, got {len(steps)}"
    diams = [s.get("diameter") for s in steps[:2]]
    assert diams == [2.0, 2.8], diams
    assert body.get("alt_protocol") is None, "NP must NOT have alt_protocol"


# ── Cortical-only logic preserved (RP CloseFit Ø3.5 D2 step 3 vs D1) ─────
def test_rp_closefit_cortical_only_logic(api, hdr):
    rd2 = _gen(api, hdr, "Adin", "RP CloseFit", 3.5, 11.5, "D2").json()
    rd1 = _gen(api, hdr, "Adin", "RP CloseFit", 3.5, 11.5, "D1").json()
    d2_step3 = rd2["steps"][2]  # 0-indexed: step 3 = Twist 3.2
    d1_step3 = rd1["steps"][2]
    assert d2_step3.get("cortical_only") is True, f"D2 step3 cortical_only must be True: {d2_step3}"
    assert "cortex" in (d2_step3.get("depth") or "").lower(), d2_step3.get("depth")
    assert d1_step3.get("cortical_only") is False, f"D1 step3 cortical_only must be False: {d1_step3}"
    # D1 depth should be numeric (e.g., "12.5 mm" / "12.5")
    dep = d1_step3.get("depth") or ""
    assert any(ch.isdigit() for ch in str(dep)), f"D1 depth not numeric: {dep!r}"


# ── D4 soft-bone behaviour ────────────────────────────────────────────────
def test_d4_softbone_step_counts(api, hdr):
    # RP CloseFit D4 = 1 drill (Pilot 2.0) + placement = 2
    rp = _gen(api, hdr, "Adin", "RP CloseFit", 3.5, 11.5, "D4").json()
    assert len(rp["steps"]) == 2, f"RP D4 expected 2 steps, got {len(rp['steps'])}"
    # NP CloseFit D4 = 1 drill (Pilot 2.0) + placement = 2 (per spec)
    np_ = _gen(api, hdr, "Adin", "NP CloseFit", 3.0, 11.5, "D4").json()
    assert len(np_["steps"]) == 2, f"NP D4 expected 2 steps, got {len(np_['steps'])}"
    # UNP CloseFit D4 = Pilot 2.0 + Twist 2.5 + placement = 3
    unp = _gen(api, hdr, "Adin", "UNP CloseFit", 2.75, 10, "D4").json()
    assert len(unp["steps"]) == 3, f"UNP D4 expected 3 steps, got {len(unp['steps'])}"


# ── Unified step schema (no missing keys) ─────────────────────────────────
def test_step_schema_no_missing_keys(api, hdr):
    body = _gen(api, hdr, "Adin", "RP CloseFit", 3.5, 11.5, "D2").json()
    steps = body.get("steps") or []
    # Per spec, schema applies to DRILL steps. The terminal "Implant Placement"
    # row is a procedural step (not a drill) and is exempt from cortical_only.
    drill_steps = [s for s in steps if "implant placement" not in (s.get("drill_type") or "").lower()]
    for i, s in enumerate(drill_steps):
        missing = REQUIRED_STEP_FIELDS - set(s.keys())
        assert not missing, f"primary drill step[{i}] missing {missing}: {s}"
    alt = body.get("alt_protocol")
    if alt:
        alt_drills = [s for s in (alt.get("steps") or [])
                      if "implant placement" not in (s.get("drill_type") or "").lower()]
        for i, s in enumerate(alt_drills):
            missing = REQUIRED_STEP_FIELDS - set(s.keys())
            assert not missing, f"alt drill step[{i}] missing {missing}: {s}"


# ── Components: per-platform counts + is_stub + updated_by ───────────────
@pytest.mark.parametrize("system,expected", [
    ("UNP CloseFit", 30),
    ("NP CloseFit", 30),
    ("RP CloseFit", 30),
    ("WP CloseFit", 49),
])
def test_adin_components_counts(api, hdr, system, expected):
    r = _catalog(api, hdr, f"Adin|{system}")
    assert r.status_code == 200, f"{system}: {r.status_code} {r.text[:200]}"
    body = r.json()
    comps = body.get("components") or []
    assert len(comps) == expected, f"{system}: expected {expected}, got {len(comps)}"
    assert body.get("is_stub") is False, f"{system} is_stub={body.get('is_stub')}"
    assert "adin_components_expanded:iter-294" in (body.get("updated_by") or ""), \
        f"{system} updated_by={body.get('updated_by')}"


def test_adin_components_schema_fields(api, hdr):
    for system in ("UNP CloseFit", "NP CloseFit", "RP CloseFit", "WP CloseFit"):
        comps = _catalog(api, hdr, f"Adin|{system}").json().get("components") or []
        for i, c in enumerate(comps):
            missing = REQUIRED_COMP_FIELDS - set(c.keys())
            assert not missing, f"{system}[{i}] missing {missing}: {c}"


def test_adin_cement_abutment_angulations(api, hdr):
    # Cement abutments should expose angulation_deg ∈ {0, 15, 25}
    found = set()
    for system in ("UNP CloseFit", "NP CloseFit", "RP CloseFit", "WP CloseFit"):
        comps = _catalog(api, hdr, f"Adin|{system}").json().get("components") or []
        for c in comps:
            t = (c.get("type") or "") + " " + (c.get("subtype") or "")
            if "cement" in t.lower() and c.get("angulation_deg") is not None:
                found.add(c["angulation_deg"])
    assert {0, 15, 25}.issubset(found), f"cement angulations seen: {found}"


def test_wp_closefit_sra_15_breakdown(api, hdr):
    comps = _catalog(api, hdr, "Adin|WP CloseFit").json().get("components") or []
    sra = [c for c in comps if c.get("type") == "screw_retained_abutment"]
    assert len(sra) == 15, f"WP SRA expected 15, got {len(sra)}"
    angles = Counter(c.get("angulation_deg") for c in sra)
    # TMA straight (0°) = 5, TMA 17° = 4, TMA 30° = 4, flat = 2 (no angulation)
    assert angles.get(0, 0) == 5, f"TMA straight count: {angles}"
    assert angles.get(17, 0) == 4, f"TMA 17° count: {angles}"
    assert angles.get(30, 0) == 4, f"TMA 30° count: {angles}"
    # remaining 2 are flat-connection (no angulation_deg or None)
    other = sum(v for k, v in angles.items() if k not in (0, 17, 30))
    assert other == 2, f"flat-connection count: {angles}"


# ── Regression: other Adin families & Straumann libraries ────────────────
def test_regression_other_adin_systems_present(api, hdr):
    rows = {r["system"]: r for r in _adin_rows(_library(api, hdr))}
    for name in ("Touareg-OS", "Touareg-S", "Swell", "One"):
        assert name in rows, f"{name} regressed from Adin library"
        assert (rows[name].get("count") or 0) > 0


def test_regression_other_adin_drilling(api, hdr):
    # Touareg-OS Ø3.5 L10 D2 — should still generate
    r = _gen(api, hdr, "Adin", "Touareg-OS", 3.5, 10, "D2")
    assert r.status_code == 200, r.text[:200]
    assert (r.json().get("steps") or [])


def test_regression_straumann_blx_blt_library(api, hdr):
    lib = _library(api, hdr)
    straumann = [x for x in lib if x.get("brand") == "Straumann"]
    blx = [x for x in straumann if "BLX" in (x.get("system") or "")]
    blt = [x for x in straumann if "BLT" in (x.get("system") or "")]
    assert len(blx) == 4, f"BLX systems regressed: {[s['system'] for s in blx]}"
    assert len(blt) == 3, f"BLT systems regressed: {[s['system'] for s in blt]}"


def test_regression_straumann_blx_components(api, hdr):
    # RB platform must still return 135; WB 68
    rb = _catalog(api, hdr, "Straumann|BLX Roxolid SLActive - RB Platform").json()
    wb = _catalog(api, hdr, "Straumann|BLX Roxolid SLActive - WB Platform").json()
    assert len(rb.get("components") or []) == 135
    assert len(wb.get("components") or []) == 68
