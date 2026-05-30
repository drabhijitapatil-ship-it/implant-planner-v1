"""
iter-205 backend tests for Alpha Bio implant catalog expansion.

Validates:
  - Each of 8 Alpha Bio systems has rich (>=30) component lists, is_stub False
  - Component diversity (>=12 distinct types from approved set)
  - Field-level sanity: subtype, platform, material, retention, torque, catalog_code, indication
  - by-key endpoint for SPI / ICE / ATID returns 50 components
  - compare endpoint includes Alpha Bio systems for ti_base
  - Existing systems untouched (Neodent Drive GM (NeoPoros) still 60 components)
"""

import os
import urllib.parse

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "REACT_APP_BACKEND_URL", ""
).rstrip("/")


ALPHA_BIO_SYSTEMS = [
    "SPI",
    "NeO Conical Standard Connection",
    "NeO Conical Hex Connection",
    "NeO Internal Hex Connection",
    "ICE",
    "ATID",
    "DFI",
    "NICE",
]

APPROVED_COMPONENT_TYPES = {
    "cover_screw",
    "healing_abutment",
    "final_abutment",
    "multi_unit_abutment",
    "ti_base",
    "scanbody",
    "impression_coping",
    "analog",
    "prosthetic_screw",
    "temporary_abutment",
    "casting_abutment",
    "pre_milled_blank",
    "overdenture_attachment",
    "burnout_sleeve",
}


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Abhijit.patil", "password": "Admin@123"},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = (
        data.get("access_token")
        or data.get("token")
        or data.get("jwt")
        or (data.get("user", {}) or {}).get("token")
    )
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def catalog(headers):
    r = requests.get(f"{BASE_URL}/api/implant-catalog", headers=headers, timeout=30)
    assert r.status_code == 200, f"GET /api/implant-catalog -> {r.status_code}: {r.text[:300]}"
    payload = r.json()
    items = (
        payload
        if isinstance(payload, list)
        else payload.get("systems") or payload.get("items") or payload.get("catalog") or []
    )
    assert isinstance(items, list) and items, f"Catalog empty/unexpected shape: {type(payload)} keys={list(payload.keys()) if isinstance(payload, dict) else None}"
    return items


def _alpha_bio(catalog):
    return [
        e
        for e in catalog
        if (e.get("brand") or e.get("manufacturer") or "").strip().lower().replace("_", " ")
        in ("alpha bio", "alpha-bio", "alpha bio tec", "alphabio")
    ]


# ---------- Top-level catalog ----------

def test_catalog_contains_all_8_alpha_bio_systems(catalog):
    ab = _alpha_bio(catalog)
    names = sorted({e.get("system") or e.get("system_name") or e.get("name") for e in ab})
    print("Alpha Bio systems found:", names)
    expected = set(ALPHA_BIO_SYSTEMS)
    found = {n for n in names if n in expected}
    assert found == expected, f"Missing AB systems. expected={expected} found={found}"


@pytest.mark.parametrize("system_name", ALPHA_BIO_SYSTEMS)
def test_alpha_bio_system_is_not_stub_and_has_30_plus_components(catalog, system_name):
    ab = _alpha_bio(catalog)
    matches = [e for e in ab if (e.get("system") or e.get("system_name") or e.get("name")) == system_name]
    assert matches, f"System '{system_name}' not found in Alpha Bio catalog entries"
    entry = matches[0]
    assert entry.get("is_stub") is False, f"{system_name} marked is_stub=True"
    comps = entry.get("components") or []
    assert isinstance(comps, list), f"{system_name} components is not a list"
    assert len(comps) >= 30, f"{system_name} has only {len(comps)} components (expected >= 30)"


@pytest.mark.parametrize("system_name", ALPHA_BIO_SYSTEMS)
def test_alpha_bio_component_type_diversity(catalog, system_name):
    ab = _alpha_bio(catalog)
    entry = next(
        e for e in ab if (e.get("system") or e.get("system_name") or e.get("name")) == system_name
    )
    types_present = {c.get("component_type") or c.get("type") for c in entry["components"]}
    types_present_known = types_present & APPROVED_COMPONENT_TYPES
    assert (
        len(types_present_known) >= 12
    ), f"{system_name} has only {len(types_present_known)} distinct approved types: {types_present_known}"


def test_alpha_bio_component_field_sanity(catalog):
    """At least 80% of AB components must have subtype/platform/material/indication; catalog_code on majority."""
    ab = _alpha_bio(catalog)
    all_comps = []
    for e in ab:
        all_comps.extend(e.get("components") or [])

    n = len(all_comps)
    assert n >= 8 * 30, f"Total AB components {n} below expected 240"

    def _count(predicate):
        return sum(1 for c in all_comps if predicate(c))

    has_subtype = _count(lambda c: isinstance(c.get("subtype"), str) and c["subtype"])
    has_platform = _count(
        lambda c: c.get("platform") in ("CS", "CHC", "IH") or isinstance(c.get("platform"), str)
    )
    has_material = _count(lambda c: isinstance(c.get("material"), list) and c["material"])
    has_indication = _count(lambda c: isinstance(c.get("indication"), str) and c["indication"])
    has_catalog = _count(lambda c: isinstance(c.get("catalog_code"), str) and c["catalog_code"])

    print(
        f"Field coverage (n={n}): subtype={has_subtype} platform={has_platform} "
        f"material={has_material} indication={has_indication} catalog_code={has_catalog}"
    )

    assert has_subtype / n >= 0.80, f"subtype coverage {has_subtype}/{n}"
    assert has_platform / n >= 0.80, f"platform coverage {has_platform}/{n}"
    assert has_material / n >= 0.80, f"material coverage {has_material}/{n}"
    assert has_indication / n >= 0.80, f"indication coverage {has_indication}/{n}"
    assert has_catalog / n >= 0.50, f"catalog_code coverage {has_catalog}/{n}"


def test_alpha_bio_torque_present_for_relevant_types(catalog):
    """Healing/final/MUA/ti_base/prosthetic_screw should usually carry torque info."""
    ab = _alpha_bio(catalog)
    relevant = {"healing_abutment", "final_abutment", "multi_unit_abutment", "ti_base", "prosthetic_screw"}
    rel_comps = [
        c
        for e in ab
        for c in (e.get("components") or [])
        if (c.get("component_type") or c.get("type")) in relevant
    ]
    assert rel_comps, "No torque-relevant AB components"

    def has_torque(c):
        return any(
            (isinstance(c.get(k), (int, float)) or (isinstance(c.get(k), str) and c.get(k)))
            for k in ("torque_ncm", "torque_ncm_max", "torque", "tightening_torque")
        )

    n = len(rel_comps)
    hits = sum(1 for c in rel_comps if has_torque(c))
    print(f"Torque coverage on relevant components: {hits}/{n}")
    assert hits / n >= 0.50, f"Torque coverage {hits}/{n} too low"


# ---------- by-key endpoint ----------

@pytest.mark.parametrize("system_name", ["SPI", "ICE", "ATID"])
def test_by_key_returns_50_components(headers, system_name):
    key = urllib.parse.quote(f"Alpha Bio|{system_name}", safe="")
    r = requests.get(f"{BASE_URL}/api/implant-catalog/by-key?key={key}", headers=headers, timeout=15)
    assert r.status_code == 200, f"by-key {system_name} -> {r.status_code}: {r.text[:300]}"
    body = r.json()
    entry = body if isinstance(body, dict) and body.get("components") is not None else body.get("entry") or body.get("item") or body
    comps = entry.get("components") or []
    assert isinstance(comps, list), f"components not a list for {system_name}"
    print(f"{system_name} by-key components: {len(comps)}")
    assert len(comps) == 50, f"{system_name} expected exactly 50 components, got {len(comps)}"
    assert entry.get("is_stub") is False, f"{system_name} is_stub should be False"


# ---------- compare endpoint ----------

def test_compare_ti_base_includes_alpha_bio(headers):
    r = requests.get(
        f"{BASE_URL}/api/implant-catalog/compare?component_type=ti_base",
        headers=headers,
        timeout=20,
    )
    assert r.status_code == 200, f"compare -> {r.status_code}: {r.text[:300]}"
    data = r.json()
    text = str(data).lower()
    print("compare ti_base response keys/sample:", list(data.keys()) if isinstance(data, dict) else type(data))
    must_appear = ["ice", "atid", "dfi", "spi"]
    missing = [m for m in must_appear if m not in text]
    assert not missing, f"compare ti_base missing AB systems: {missing}"


# ---------- regression: non-Alpha Bio untouched ----------

def test_neodent_drive_gm_neoporos_unchanged(catalog):
    target_names = {"Drive GM (NeoPoros)", "Drive GM NeoPoros", "Drive GM"}
    candidates = [
        e
        for e in catalog
        if "neodent" in (e.get("brand") or e.get("manufacturer") or "").lower()
        and (e.get("system") or e.get("system_name") or e.get("name") or "") in target_names
    ]
    if not candidates:
        # fallback: any Drive GM containing NeoPoros
        candidates = [
            e
            for e in catalog
            if "neodent" in (e.get("brand") or e.get("manufacturer") or "").lower()
            and "neoporos" in (e.get("system") or e.get("system_name") or e.get("name") or "").lower()
        ]
    assert candidates, "Neodent Drive GM (NeoPoros) not found"
    comps = candidates[0].get("components") or []
    print(f"Neodent Drive GM NeoPoros components: {len(comps)}")
    assert len(comps) == 60, f"Neodent Drive GM NeoPoros components changed: got {len(comps)}, expected 60"
