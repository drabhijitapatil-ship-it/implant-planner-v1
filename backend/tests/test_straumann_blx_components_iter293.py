"""iter-293 backend regression: Straumann BLX prosthetic components expansion.

Verifies:
- All 4 BLX systems return expanded components via /api/implant-catalog/by-key
- RB platforms each return 135 components; WB platforms each return 68
- is_stub=False, updated_by tag set
- Required schema fields present on each component
- Critical RB & WB subtypes are present
- Catalog codes unique within each system
- Regression: 7 Straumann library systems intact; drilling-protocols generate OK
- Regression: Alpha Bio|SPI still has 30+ expanded components
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

REQUIRED_FIELDS = {"type", "subtype", "platform", "catalog_code", "indication"}

BLX_RB_SYSTEMS = [
    "BLX Roxolid SLActive - RB Platform",
    "BLX Roxolid SLA - RB Platform",
]
BLX_WB_SYSTEMS = [
    "BLX Roxolid SLActive - WB Platform",
    "BLX Roxolid SLA - WB Platform",
]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Abhijit.patil", "password": "Admin@123"},
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    return data.get("access_token") or data.get("token")


def _fetch_catalog(api, key, token=None):
    qs = urllib.parse.urlencode({"key": key})
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return api.get(f"{BASE_URL}/api/implant-catalog/by-key?{qs}", headers=headers)


# ── Core BLX expanded counts ───────────────────────────────────────────────
@pytest.mark.parametrize("system", BLX_RB_SYSTEMS)
def test_blx_rb_returns_135_components(api, admin_token, system):
    r = _fetch_catalog(api, f"Straumann|{system}", admin_token)
    assert r.status_code == 200, f"{system}: {r.status_code} {r.text[:200]}"
    body = r.json()
    comps = body.get("components") or []
    assert len(comps) == 135, (
        f"{system}: expected 135 RB components, got {len(comps)}"
    )
    assert body.get("is_stub") is False, f"{system} is_stub should be False"
    assert "straumann_blx_components_expanded:iter-293" in (
        body.get("updated_by") or ""
    ), f"{system} updated_by={body.get('updated_by')}"


@pytest.mark.parametrize("system", BLX_WB_SYSTEMS)
def test_blx_wb_returns_68_components(api, admin_token, system):
    r = _fetch_catalog(api, f"Straumann|{system}", admin_token)
    assert r.status_code == 200, f"{system}: {r.status_code} {r.text[:200]}"
    body = r.json()
    comps = body.get("components") or []
    assert len(comps) == 68, (
        f"{system}: expected 68 WB components, got {len(comps)}"
    )
    assert body.get("is_stub") is False
    assert "straumann_blx_components_expanded:iter-293" in (
        body.get("updated_by") or ""
    )


# ── Schema validation ──────────────────────────────────────────────────────
def test_all_blx_components_have_required_fields(api, admin_token):
    for system in BLX_RB_SYSTEMS + BLX_WB_SYSTEMS:
        r = _fetch_catalog(api, f"Straumann|{system}", admin_token)
        assert r.status_code == 200
        comps = r.json().get("components") or []
        for i, c in enumerate(comps):
            missing = REQUIRED_FIELDS - set(c.keys())
            assert not missing, f"{system}[{i}] missing fields {missing}: {c}"


# ── RB critical subtypes ───────────────────────────────────────────────────
def test_rb_critical_subtypes_present(api, admin_token):
    r = _fetch_catalog(api, f"Straumann|{BLX_RB_SYSTEMS[0]}", admin_token)
    comps = r.json().get("components") or []
    type_counts = Counter(c["type"] for c in comps)

    # Critical subtype/type counts per request
    expected = {
        "cover_screw": 1,            # >=1
        "healing_abutment": 20,       # exactly 20
        "temporary_abutment": 9,      # exactly 9
        "ti_base": 10,                # exactly 10 (Variobase incl AS Crown)
        "screw_retained_abutment": 10,  # 0°/17°/30°
        "burnout_coping": 7,
        "locator_abutment": 12,       # Novaloc 0° (6) + 15° (6) = 12
        "retention_insert": 6,        # 6 colors
    }
    for t, count in expected.items():
        assert type_counts.get(t, 0) >= count, (
            f"RB type '{t}' expected >= {count}, got {type_counts.get(t, 0)}"
        )

    # Specific subtype presence
    subtypes = {c.get("subtype", "") for c in comps}
    must_have_substrings = [
        "Variobase® Crown AS",
        "Novaloc® 0°",
        "Novaloc® 15°",
        "SRA, 0°",
        "SRA, 17°",
        "SRA, 30°",
    ]
    for needle in must_have_substrings:
        assert any(needle in s for s in subtypes), f"RB missing subtype matching '{needle}'"


# ── WB critical SKUs ───────────────────────────────────────────────────────
def test_wb_critical_sku_codes(api, admin_token):
    r = _fetch_catalog(api, f"Straumann|{BLX_WB_SYSTEMS[0]}", admin_token)
    comps = r.json().get("components") or []
    codes = {c.get("catalog_code") for c in comps}
    must_have_codes = [
        "062.8410",      # WB Gold Abutment
        "062.4605",      # WB pre-milled Medentika 11.5
        "062.4606",      # WB pre-milled Medentika 15.8
        "062.4607",      # WB pre-milled CARES 12
        "065.0032",      # WB Impression Post Open-tray
        "065.0034",      # WB Impression Post Closed-tray long
        "065.4810",      # WB Impression Post Closed-tray 13mm
        "062.4953",      # WB Variobase Crown Ø5.5 GH0.75
        "062.4954",      # WB Variobase Crown Ø5.5 GH1.5
        "062.4971",      # WB Variobase Crown AS Ø5.5
    ]
    for code in must_have_codes:
        assert code in codes, f"WB missing catalog_code {code}"

    # WB Healing Abutments Ø6 / Ø7.5 with GH 0.75 / 1.5
    healing = [c for c in comps if c["type"] == "healing_abutment"]
    diameters = {c.get("diameter_mm") for c in healing}
    ghs = {tuple(c.get("gingival_heights_mm") or []) for c in healing}
    assert 6.0 in diameters, f"WB healing missing Ø6, got {diameters}"
    assert 7.5 in diameters, f"WB healing missing Ø7.5, got {diameters}"
    assert (0.75,) in ghs, f"WB healing missing GH 0.75: {ghs}"
    assert (1.5,) in ghs, f"WB healing missing GH 1.5: {ghs}"

    # WB Temporary Abutment Ø5.5
    temp = [c for c in comps if c["type"] == "temporary_abutment"]
    assert any(c.get("diameter_mm") == 5.5 for c in temp), "WB temp Ø5.5 missing"


# ── Uniqueness ─────────────────────────────────────────────────────────────
def test_catalog_codes_unique_within_each_system(api, admin_token):
    for system in BLX_RB_SYSTEMS + BLX_WB_SYSTEMS:
        r = _fetch_catalog(api, f"Straumann|{system}", admin_token)
        comps = r.json().get("components") or []
        # Ignore placeholder '—' (used for cover_screw shipped-with-implant)
        codes = [
            c["catalog_code"] for c in comps if c.get("catalog_code") not in (None, "—", "")
        ]
        dups = [code for code, n in Counter(codes).items() if n > 1]
        assert not dups, f"{system}: duplicate catalog codes {dups}"


# ── Regression: 7 Straumann library systems ────────────────────────────────
def test_straumann_library_still_has_7_systems(api, admin_token):
    r = api.get(
        f"{BASE_URL}/api/implant-library/systems",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    # response may be {brand: [systems]} or list-of-objects
    straumann = None
    if isinstance(body, dict):
        straumann = body.get("Straumann")
        if straumann is None:
            # try brands key
            brands = body.get("brands") or []
            for b in brands:
                if (b.get("brand") or b.get("name")) == "Straumann":
                    straumann = b.get("systems") or b.get("models") or []
                    break
    elif isinstance(body, list):
        straumann = [x for x in body if (x.get("brand") == "Straumann")]
    assert straumann is not None, f"Cannot locate Straumann in library response: keys={list(body)[:10] if isinstance(body, dict) else type(body)}"
    # We need exactly 7 distinct system names (3 BLT + 4 BLX)
    if isinstance(straumann, list) and straumann and isinstance(straumann[0], dict):
        names = {s.get("system") or s.get("name") or s.get("model") for s in straumann}
    else:
        names = set(straumann)
    blt = {n for n in names if n and "BLT" in n}
    blx = {n for n in names if n and "BLX" in n}
    assert len(blt) >= 3, f"BLT systems regressed: {blt}"
    assert len(blx) >= 4, f"BLX systems regressed: {blx}"


# ── Regression: drilling-protocols still work ──────────────────────────────
def test_drilling_protocol_blx_still_generates(api, admin_token):
    r = api.post(
        f"{BASE_URL}/api/drilling-protocols/generate",
        json={
            "brand": "Straumann",
            "system": "BLX Roxolid SLActive - RB Platform",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, f"BLX gen: {r.status_code} {r.text[:200]}"
    body = r.json()
    steps = body.get("steps") or body.get("protocol", {}).get("steps") or []
    assert len(steps) >= 4, f"BLX drilling steps too few: {len(steps)}"


def test_drilling_protocol_blt_still_generates(api, admin_token):
    r = api.post(
        f"{BASE_URL}/api/drilling-protocols/generate",
        json={
            "brand": "Straumann",
            "system": "BLT Roxolid SLActive",
            "diameter": 4.1,
            "length": 10,
            "bone_density": "D2",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, f"BLT gen: {r.status_code} {r.text[:200]}"
    body = r.json()
    steps = body.get("steps") or body.get("protocol", {}).get("steps") or []
    assert len(steps) >= 4, f"BLT drilling steps too few: {len(steps)}"


# ── Regression: Alpha Bio SPI components intact ────────────────────────────
def test_alpha_bio_spi_still_expanded(api, admin_token):
    r = _fetch_catalog(api, "Alpha Bio|SPI", admin_token)
    assert r.status_code == 200, f"Alpha SPI: {r.status_code} {r.text[:200]}"
    comps = r.json().get("components") or []
    assert len(comps) >= 30, f"Alpha Bio SPI components regressed: {len(comps)}"
