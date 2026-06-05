"""
iter-292 backend regression — Straumann BLT (Bone Level Tapered) implant systems.

Covers:
  1. GET /api/implant-library/systems contains exactly 3 Straumann BLT systems
     (Roxolid SLActive=24, Roxolid SLA=21, Ti SLA=18) and the 4 BLX systems
     are still present. No legacy ('Straumann','BLT') 4-row stub.
  2. GET /api/drilling-protocols/available lists the 3 BLT systems.
  3. POST /api/drilling-protocols/generate for each of the 3 BLT systems on
     D1 and D4 returns:
       - protocol_type containing 'Straumann BLT'
       - steps with strict schema { step, drill_type, code, diameter, depth,
         cortical_only, rpm, irrigation, note }
       - total_steps >= 6
  4. Regression: Adin (8), Alpha Bio (8) systems are intact; BLX (4) intact.
  5. Regression: BLX Roxolid SLActive Ø4.0 L10 D2 and Adin Touareg-S Ø4.2 L10 D2
     still work.
  6. Invalid BLT size combination (Ø6.5 L15) returns 400 or graceful error
     (not 500).
"""

import os
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
).rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}

BLT_SYSTEMS = [
    ("BLT Roxolid SLActive", 24, [2.9, 3.3, 4.1, 4.8]),
    ("BLT Roxolid SLA", 21, [2.9, 3.3, 4.1, 4.8]),
    ("BLT Ti SLA", 18, [3.3, 4.1, 4.8]),
]

BLX_SYSTEMS = [
    "BLX Roxolid SLActive - RB Platform",
    "BLX Roxolid SLActive - WB Platform",
    "BLX Roxolid SLA - RB Platform",
    "BLX Roxolid SLA - WB Platform",
]

REQUIRED_STEP_KEYS = {
    "step", "drill_type", "code", "diameter", "depth",
    "cortical_only", "rpm", "irrigation", "note",
}


# ── Fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"no token in login response: {body}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def all_systems(api_client, auth_headers):
    r = api_client.get(
        f"{BASE_URL}/api/implant-library/systems",
        headers=auth_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _gen(api_client, auth_headers, brand, system, diameter, length, bone):
    return api_client.post(
        f"{BASE_URL}/api/drilling-protocols/generate",
        headers=auth_headers,
        json={
            "brand": brand,
            "system": system,
            "diameter": diameter,
            "length": length,
            "bone_density": bone,
        },
        timeout=30,
    )


def _find(systems, brand, system_name):
    for s in systems:
        if s.get("brand") == brand and s.get("system") == system_name:
            return s
    return None


# ── 1. Implant library: BLT systems present ──────────────────────────────
class TestImplantLibraryBLT:
    def test_no_legacy_blt_stub(self, all_systems):
        legacy = _find(all_systems, "Straumann", "BLT")
        assert legacy is None, (
            "Legacy ('Straumann','BLT') stub should have been removed in iter-292, "
            f"but found entry: {legacy}"
        )

    @pytest.mark.parametrize("system_name,expected_count,expected_diams", BLT_SYSTEMS)
    def test_blt_system_present(self, all_systems, system_name, expected_count, expected_diams):
        e = _find(all_systems, "Straumann", system_name)
        assert e is not None, f"missing Straumann {system_name}"
        assert sorted(e["diameters"]) == expected_diams, (
            f"{system_name} diameter list mismatch: got {sorted(e['diameters'])} "
            f"expected {expected_diams}"
        )
        assert e["count"] == expected_count, (
            f"{system_name} count mismatch: got {e['count']} expected {expected_count}"
        )
        # Indication metadata populated
        assert isinstance(e.get("indication"), str) and len(e["indication"]) > 20
        assert isinstance(e.get("indicated_procedures"), list) and e["indicated_procedures"]
        assert set(["D1", "D2", "D3", "D4"]).issubset(set(e.get("indicated_bone_types", [])))

    def test_total_straumann_systems_is_7(self, all_systems):
        straumann = [s for s in all_systems if s.get("brand") == "Straumann"]
        names = sorted({s.get("system", "") for s in straumann})
        expected = sorted(BLX_SYSTEMS + [n for n, _, _ in BLT_SYSTEMS])
        assert names == expected, (
            f"Straumann systems mismatch:\n got: {names}\n expected: {expected}"
        )


# ── 2. /api/drilling-protocols/available lists BLT ───────────────────────
class TestDrillingAvailableBLT:
    @pytest.fixture(scope="class")
    def available(self, api_client, auth_headers):
        r = api_client.get(
            f"{BASE_URL}/api/drilling-protocols/available",
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.mark.parametrize("system_name,_count,_diams", BLT_SYSTEMS)
    def test_blt_in_available(self, available, system_name, _count, _diams):
        # available is either a list of dicts {brand, system} or list of strings;
        # check both shapes.
        target = ("Straumann", system_name)
        found = False
        if isinstance(available, list):
            for entry in available:
                if isinstance(entry, dict):
                    if entry.get("brand") == "Straumann" and entry.get("system") == system_name:
                        found = True
                        break
                elif isinstance(entry, str):
                    if entry == f"Straumann|{system_name}" or system_name in entry:
                        found = True
                        break
        elif isinstance(available, dict):
            # Maybe {brand: [systems...]}
            sys_list = available.get("Straumann") or []
            if system_name in sys_list:
                found = True
        assert found, f"{target} not present in /drilling-protocols/available: {available!r}"


# ── 3. /api/drilling-protocols/generate — BLT shapes ─────────────────────
class TestBLTDrillingProtocols:
    @pytest.mark.parametrize("system_name,diameter,length", [
        ("BLT Roxolid SLActive", 4.1, 10),
        ("BLT Roxolid SLA", 4.1, 10),
        ("BLT Ti SLA", 4.1, 10),
    ])
    @pytest.mark.parametrize("bone", ["D1", "D4"])
    def test_generate_returns_well_shaped_protocol(
        self, api_client, auth_headers, system_name, diameter, length, bone
    ):
        r = _gen(api_client, auth_headers, "Straumann", system_name, diameter, length, bone)
        assert r.status_code == 200, f"{system_name} {bone} failed: {r.status_code} {r.text}"
        body = r.json()

        # protocol_type label
        ptype = body.get("protocol_type", "")
        assert "Straumann BLT" in ptype, f"protocol_type missing 'Straumann BLT': {ptype!r}"
        assert system_name in ptype, f"protocol_type missing system name: {ptype!r}"

        # steps
        steps = body.get("steps")
        assert isinstance(steps, list) and len(steps) >= 6, (
            f"{system_name} {bone} total_steps < 6 (got {len(steps) if steps else 0})"
        )
        assert body.get("total_steps") == len(steps)

        # Strict schema per step
        for i, st in enumerate(steps):
            missing = REQUIRED_STEP_KEYS - set(st.keys())
            assert not missing, (
                f"{system_name} {bone} step #{i} missing keys: {missing}; keys present: {list(st.keys())}"
            )
            # type sanity
            assert isinstance(st["step"], int)
            assert isinstance(st["cortical_only"], bool)
            assert isinstance(st["irrigation"], bool)
            assert isinstance(st["drill_type"], str) and st["drill_type"]

    def test_d1_includes_tap_and_profile(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Straumann", "BLT Roxolid SLActive", 4.1, 10, "D1")
        assert r.status_code == 200, r.text
        codes = [str(s["code"]) for s in r.json()["steps"]]
        assert any("Profile" in c for c in codes), f"D1 missing Profile drill: {codes}"
        assert any("Tap" in c for c in codes), f"D1 missing BLT Tap: {codes}"

    def test_d4_no_tap_no_cortical_only(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Straumann", "BLT Roxolid SLActive", 4.1, 10, "D4")
        assert r.status_code == 200, r.text
        steps = r.json()["steps"]
        codes = [str(s["code"]) for s in steps]
        assert not any("Tap" in c for c in codes), f"D4 should NOT include Tap: {codes}"
        # cortical_only flag should not be True for soft-bone Profile drill
        profile = next((s for s in steps if "Profile" in str(s["code"])), None)
        if profile is not None:
            assert profile["cortical_only"] is False, (
                "D4 Profile drill should NOT be cortical_only"
            )

    def test_smallest_diameter_2_9_only_in_slactive_and_sla(self, api_client, auth_headers):
        # Ø2.9 valid for SLActive & SLA, invalid for Ti SLA
        r_ok = _gen(api_client, auth_headers, "Straumann", "BLT Roxolid SLActive", 2.9, 10, "D2")
        assert r_ok.status_code == 200, r_ok.text
        # Ø2.9 not in Ti SLA matrix
        r_bad = _gen(api_client, auth_headers, "Straumann", "BLT Ti SLA", 2.9, 10, "D2")
        # graceful: 200 with empty/short steps OR 400 — should NOT be 500
        assert r_bad.status_code != 500, (
            f"Ti SLA Ø2.9 should not 500: {r_bad.status_code} {r_bad.text}"
        )


# ── 4. Invalid BLT size combination — graceful error ─────────────────────
class TestBLTInvalidSize:
    def test_invalid_diameter_returns_graceful_error(self, api_client, auth_headers):
        # Ø6.5 doesn't exist in any BLT system
        r = _gen(api_client, auth_headers, "Straumann", "BLT Roxolid SLActive", 6.5, 15, "D2")
        # Acceptable: 400 OR 200-with-empty-steps OR 404 — NOT 500
        assert r.status_code != 500, f"Got 500 for invalid Ø6.5 L15: {r.text}"
        if r.status_code == 200:
            body = r.json()
            steps = body.get("steps", [])
            # If 200, the workflow lookup returned no rows: only seat-step or nothing.
            # Validate it didn't fabricate a full protocol (caller can detect by total_steps).
            assert len(steps) <= 1, (
                f"Invalid Ø6.5 should not yield a full protocol: {len(steps)} steps"
            )

    def test_invalid_length_returns_graceful(self, api_client, auth_headers):
        # Ø4.1 exists, but L25 doesn't — generator still drills to L=25 marking.
        # Engine should not 500.
        r = _gen(api_client, auth_headers, "Straumann", "BLT Roxolid SLActive", 4.1, 25, "D2")
        assert r.status_code != 500, f"L25 caused 500: {r.text}"


# ── 5. Regression: BLX + Adin + Alpha Bio counts ─────────────────────────
class TestExistingBrandsRegression:
    def test_blx_four_systems_intact(self, all_systems):
        blx_in_lib = [s for s in all_systems if s.get("brand") == "Straumann"
                      and s.get("system", "").startswith("BLX")]
        names = sorted({s["system"] for s in blx_in_lib})
        assert names == sorted(BLX_SYSTEMS), f"BLX regression: got {names}"

    def test_adin_eight_systems(self, all_systems):
        adin = [s for s in all_systems if s.get("brand") == "Adin"]
        assert len(adin) == 8, f"Adin should have 8 systems, got {len(adin)}: {[s['system'] for s in adin]}"

    def test_alpha_bio_eight_systems(self, all_systems):
        ab = [s for s in all_systems if s.get("brand") == "Alpha Bio"]
        assert len(ab) == 8, f"Alpha Bio should have 8 systems, got {len(ab)}: {[s['system'] for s in ab]}"


class TestExistingProtocolsRegression:
    def test_blx_rb_slactive_4_0_10_d2(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Straumann",
                 "BLX Roxolid SLActive - RB Platform", 4.0, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("steps") and len(body["steps"]) > 0
        assert "BLX" in body.get("protocol_type", "")

    def test_adin_touareg_s_4_2_10_d2(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Adin", "Touareg-S", 4.2, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("steps") and len(body["steps"]) > 0
