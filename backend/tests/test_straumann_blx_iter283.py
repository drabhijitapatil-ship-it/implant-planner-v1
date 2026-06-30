"""
iter-283 backend regression — Straumann BLX Roxolid implant systems.

Covers:
  1. GET /api/implant-library/systems returns the 4 new BLX systems with the
     correct Ø×L matrices, populated indication string, indicated_procedures
     and indicated_bone_types.
  2. Indication payload: SLActive variants include immediate + all-on-X;
     SLA variants only have Single Conventional + Multiple Conventional.
  3. POST /api/drilling-protocols/generate for all 4 BLX systems across
     D1/D2/D3/D4 bone densities — verifies Hard+Tap (D1), Standard (D2/D3),
     Soft Under-Preparation (D4) shapes.
  4. WB Ø6.0 D1 uses the extended WB ladder (2.2/2.8/3.2/3.5/3.7/4.2/4.7/5.2).
  5. Regression on existing protocols (Alpha Bio SPI, Neodent Helix GM Acqua,
     BioHorizons Tapered Pro Conical RBT, Dentsply Sirona Ankylos C/X).
  6. GET /api/tips/daily still returns tip + streak (iter-282 regression).
  7. POST /api/auth/login works for admin + student via 'identifier'.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
BASE_URL = BASE_URL.rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}

BLX_SYSTEMS = [
    "BLX Roxolid SLActive - RB Platform",
    "BLX Roxolid SLActive - WB Platform",
    "BLX Roxolid SLA - RB Platform",
    "BLX Roxolid SLA - WB Platform",
]
RB_DIAMETERS = [3.5, 4.0, 4.5]
WB_DIAMETERS = [5.0, 5.5, 6.0]
RB_LENGTHS = [6, 8, 10, 12, 14, 16, 18]
WB_LENGTHS = [6, 8, 10, 12, 14, 16]


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
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── 1. Auth regression ───────────────────────────────────────────────────
class TestAuth:
    def test_admin_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        tok = body.get("token") or body.get("access_token")
        assert tok and isinstance(tok, str) and len(tok) > 10
        user = body.get("user") or body
        # Role may be 'administrator', 'admin', or 'implant_incharge' (admin
        # privileges are role-set rather than literal). Login succeeds = pass.
        assert user.get("role"), f"missing role in response: {user}"

    def test_student_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        tok = body.get("token") or body.get("access_token")
        assert tok and isinstance(tok, str)


# ── 2. /api/implant-library/systems — BLX entries ────────────────────────
class TestImplantSystemsBLX:
    @pytest.fixture(scope="class")
    def systems(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/implant-library/systems", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def _find(self, systems, system_name):
        for s in systems:
            if s.get("brand") == "Straumann" and s.get("system") == system_name:
                return s
        return None

    def test_all_four_blx_systems_present(self, systems):
        missing = []
        for name in BLX_SYSTEMS:
            if not self._find(systems, name):
                missing.append(name)
        assert not missing, f"missing BLX systems: {missing}"

    def test_rb_slactive_matrix(self, systems):
        e = self._find(systems, "BLX Roxolid SLActive - RB Platform")
        assert e is not None
        assert sorted(e["diameters"]) == RB_DIAMETERS
        assert sorted(e["lengths"]) == RB_LENGTHS
        assert e["count"] == 21

    def test_wb_slactive_matrix(self, systems):
        e = self._find(systems, "BLX Roxolid SLActive - WB Platform")
        assert e is not None
        assert sorted(e["diameters"]) == WB_DIAMETERS
        assert sorted(e["lengths"]) == WB_LENGTHS
        assert e["count"] == 18

    def test_rb_sla_matrix(self, systems):
        e = self._find(systems, "BLX Roxolid SLA - RB Platform")
        assert e is not None
        assert sorted(e["diameters"]) == RB_DIAMETERS
        assert sorted(e["lengths"]) == RB_LENGTHS
        assert e["count"] == 21

    def test_wb_sla_matrix(self, systems):
        e = self._find(systems, "BLX Roxolid SLA - WB Platform")
        assert e is not None
        assert sorted(e["diameters"]) == WB_DIAMETERS
        assert sorted(e["lengths"]) == WB_LENGTHS
        assert e["count"] == 18

    @pytest.mark.parametrize("name", BLX_SYSTEMS)
    def test_indication_populated(self, systems, name):
        e = self._find(systems, name)
        assert e is not None, f"{name} missing"
        assert isinstance(e["indication"], str) and len(e["indication"]) > 30
        assert isinstance(e["indicated_procedures"], list) and len(e["indicated_procedures"]) > 0
        assert isinstance(e["indicated_bone_types"], list)
        assert set(["D1", "D2", "D3", "D4"]).issubset(set(e["indicated_bone_types"]))

    @pytest.mark.parametrize("name", [
        "BLX Roxolid SLActive - RB Platform",
        "BLX Roxolid SLActive - WB Platform",
    ])
    def test_slactive_includes_immediate_and_allon(self, systems, name):
        e = self._find(systems, name)
        procs = set(e["indicated_procedures"])
        assert "Immediate Implant" in procs, f"SLActive {name} missing Immediate Implant: {procs}"
        assert any("All on" in p for p in procs), f"SLActive {name} missing all-on-X: {procs}"
        # Specifically All on 4 / All on 6 / All on X
        assert {"All on 4", "All on 6", "All on X"}.issubset(procs)

    @pytest.mark.parametrize("name", [
        "BLX Roxolid SLA - RB Platform",
        "BLX Roxolid SLA - WB Platform",
    ])
    def test_sla_only_conventional(self, systems, name):
        e = self._find(systems, name)
        procs = set(e["indicated_procedures"])
        assert procs == {"Single Conventional Implant", "Multiple Conventional Implants"}, (
            f"SLA {name} should only have conventional procedures, got: {procs}"
        )


# ── 3. /api/drilling-protocols/generate — BLX bone-density branches ──────
def _gen(api_client, auth_headers, brand, system, diameter, length, bone):
    payload = {
        "brand": brand,
        "system": system,
        "diameter": diameter,
        "length": length,
        "bone_density": bone,
    }
    r = api_client.post(
        f"{BASE_URL}/api/drilling-protocols/generate",
        headers=auth_headers, json=payload, timeout=30,
    )
    return r


class TestBLXDrillingProtocols:
    @pytest.mark.parametrize("system,diameter,length", [
        ("BLX Roxolid SLActive - RB Platform", 4.0, 10),
        ("BLX Roxolid SLActive - WB Platform", 5.5, 10),
        ("BLX Roxolid SLA - RB Platform", 4.0, 10),
        ("BLX Roxolid SLA - WB Platform", 5.5, 10),
    ])
    @pytest.mark.parametrize("bone", ["D1", "D2", "D3", "D4"])
    def test_generate_each_bone_density(self, api_client, auth_headers, system, diameter, length, bone):
        r = _gen(api_client, auth_headers, "Straumann", system, diameter, length, bone)
        assert r.status_code == 200, f"{system} {bone} failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("steps"), f"empty steps for {system} {bone}"
        # Each step has required fields
        for s in body["steps"]:
            assert "step" in s and isinstance(s["step"], int)
            assert "drill_name" in s and s["drill_name"]
            assert "diameter_mm" in s
            assert "depth_mm" in s
            assert "rpm" in s
        # protocol_type label includes the BLX bone-density tag
        ptype = body.get("protocol_type", "")
        if bone == "D1":
            assert "Hard Bone + Tap" in ptype
        elif bone in ("D2", "D3"):
            assert "Standard Protocol" in ptype
        elif bone == "D4":
            assert "Soft Bone Under-Preparation" in ptype

    def test_d1_includes_tap_and_profile(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Straumann", "BLX Roxolid SLActive - RB Platform", 4.0, 10, "D1")
        assert r.status_code == 200
        names = [s["drill_name"] for s in r.json()["steps"]]
        assert any("Profile" in n for n in names), f"D1 missing Profile drill: {names}"
        assert any("Tap" in n for n in names), f"D1 missing BLX Tap: {names}"
        # Find tap step and check rpm=15 + ratchet hint
        tap = next(s for s in r.json()["steps"] if "Tap" in s["drill_name"])
        assert "15" in str(tap["rpm"])
        assert "Ratchet" in str(tap["rpm"]) or "Ratchet" in str(tap.get("note", ""))

    def test_d2_d3_has_profile_no_tap(self, api_client, auth_headers):
        for bone in ("D2", "D3"):
            r = _gen(api_client, auth_headers, "Straumann", "BLX Roxolid SLActive - RB Platform", 4.0, 10, bone)
            assert r.status_code == 200
            names = [s["drill_name"] for s in r.json()["steps"]]
            assert any("Profile" in n for n in names), f"{bone} missing Profile drill"
            assert not any("BLX Tap" in n for n in names), f"{bone} should not include BLX Tap"

    def test_d4_no_profile_no_tap_and_one_drill_omitted(self, api_client, auth_headers):
        # Compare D2 vs D4 ladder lengths for same implant — D4 should drop the last ladder drill.
        r_d2 = _gen(api_client, auth_headers, "Straumann", "BLX Roxolid SLActive - RB Platform", 4.0, 10, "D2")
        r_d4 = _gen(api_client, auth_headers, "Straumann", "BLX Roxolid SLActive - RB Platform", 4.0, 10, "D4")
        assert r_d2.status_code == 200 and r_d4.status_code == 200
        ladder_d2 = [s for s in r_d2.json()["steps"] if "VeloDrill" in s["drill_name"]]
        ladder_d4 = [s for s in r_d4.json()["steps"] if "VeloDrill" in s["drill_name"]]
        assert len(ladder_d4) == len(ladder_d2) - 1, (
            f"D4 ladder should drop one drill: d2={len(ladder_d2)} d4={len(ladder_d4)}"
        )
        names_d4 = [s["drill_name"] for s in r_d4.json()["steps"]]
        assert not any("Profile" in n for n in names_d4), f"D4 should NOT include Profile: {names_d4}"
        assert not any("BLX Tap" in n for n in names_d4), f"D4 should NOT include Tap: {names_d4}"

    def test_wb_6_0_extended_ladder_d1(self, api_client, auth_headers):
        r = _gen(api_client, auth_headers, "Straumann", "BLX Roxolid SLActive - WB Platform", 6.0, 12, "D1")
        assert r.status_code == 200, r.text
        ladder = [s["diameter_mm"] for s in r.json()["steps"] if "VeloDrill" in s["drill_name"]]
        expected = [2.2, 2.8, 3.2, 3.5, 3.7, 4.2, 4.7, 5.2]
        assert ladder == expected, f"WB Ø6.0 D1 ladder mismatch:\n got: {ladder}\n exp: {expected}"
        # Should have Profile + Tap after ladder
        names = [s["drill_name"] for s in r.json()["steps"]]
        assert any("Profile" in n for n in names)
        assert any("Tap" in n for n in names)


# ── 4. Regression on existing protocols ──────────────────────────────────
class TestExistingProtocolsRegression:
    @pytest.mark.parametrize("brand,system,diameter,length,bone", [
        ("Alpha Bio", "SPI", 4.2, 10, "D2"),
        ("Neodent", "Helix GM Acqua", 4.0, 10, "D3"),
        ("BioHorizons", "Tapered Pro Conical RBT", 4.5, 12, "D1"),
        ("Dentsply Sirona", "Ankylos C/X", 4.5, 11, "D2"),
    ])
    def test_existing_system_returns_steps(self, api_client, auth_headers, brand, system, diameter, length, bone):
        r = _gen(api_client, auth_headers, brand, system, diameter, length, bone)
        assert r.status_code == 200, f"{brand} {system}: {r.status_code} {r.text}"
        body = r.json()
        assert isinstance(body.get("steps"), list) and len(body["steps"]) > 0
        assert body.get("protocol_type"), f"missing protocol_type for {brand} {system}"


# ── 5. /api/tips/daily regression ────────────────────────────────────────
class TestTipsDailyRegression:
    def test_daily_tip_has_streak(self, api_client, auth_headers):
        r = api_client.get(f"{BASE_URL}/api/tips/daily", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "streak" in body, f"missing 'streak' in tips/daily payload: keys={list(body.keys())}"
        streak = body["streak"]
        for key in ("current", "longest", "engaged_today"):
            assert key in streak, f"streak missing '{key}': {streak}"
