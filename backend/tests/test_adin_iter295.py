"""
iter-295 backend tests — Adin Touareg-OS/Touareg-S/Swell/One
  • Library shape (size-matrix corrections)
  • Drilling protocol: SEQUENTIAL primary + Tri-Step alt
  • Prosthetic components: 99-SKU RS palette / 2-SKU One palette
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dental-workflow-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _systems(H, brand):
    r = requests.get(f"{API}/implant-library/systems", headers=H, timeout=30)
    assert r.status_code == 200, r.text
    return [s for s in r.json() if s.get("brand") == brand]


def _sys(H, brand, system):
    for s in _systems(H, brand):
        if s.get("system") == system:
            return s
    return None


def _gen(H, system, diameter, length, bone, brand="Adin"):
    body = {"brand": brand, "system": system, "diameter": diameter, "length": length, "bone_density": bone}
    return requests.post(f"{API}/drilling-protocols/generate", headers=H, json=body, timeout=30)


def _by_key(H, brand, system):
    return requests.get(f"{API}/implant-catalog/by-key", headers=H, params={"key": f"{brand}|{system}"}, timeout=30)


# ──────────────────────────── library shape ───────────────────────
class TestLibraryShape:
    def test_touareg_os_count_30(self, H):
        s = _sys(H, "Adin", "Touareg-OS")
        assert s, "Touareg-OS missing"
        # count = number of (diameter,length) rows seeded — Ø3.5×6 + 3.75×6 + 4.2×7 + 5.0×6 + 6.0×5 = 30
        # If legacy Ø3.5 L6.25 row were still present count would be 31.
        assert s["count"] == 30, f"Touareg-OS count={s['count']} (legacy 6.25 row may still be present)"
        assert sorted(s["diameters"]) == [3.5, 3.75, 4.2, 5.0, 6.0]

    def test_touareg_s_count_30_includes_6_25(self, H):
        s = _sys(H, "Adin", "Touareg-S")
        assert s and s["count"] == 30, f"Touareg-S count={s and s['count']}"
        assert 6.25 in s["lengths"], "Touareg-S missing 6.25 mm length"
        assert 16 in s["lengths"], "Touareg-S missing 16 mm"

    def test_swell_count_29(self, H):
        s = _sys(H, "Adin", "Swell")
        assert s and s["count"] == 29, f"Swell count={s and s['count']}"
        assert 3.3 in s["diameters"]

    def test_one_count_20(self, H):
        s = _sys(H, "Adin", "One")
        assert s and s["count"] == 20, f"One count={s and s['count']}"
        assert sorted(s["diameters"]) == [3.0, 3.3, 3.6, 4.2, 5.0]
        assert sorted(s["lengths"]) == [10, 11.5, 13, 15]


# ──────────────────────────── drilling protocol ───────────────────
class TestDrilling:
    def _schema_ok(self, steps):
        keys = {"step", "drill_type", "code", "diameter", "depth", "cortical_only", "rpm", "irrigation", "note"}
        for s in steps:
            missing = keys - set(s.keys())
            assert not missing, f"step missing keys: {missing}"
        assert steps[-1]["drill_type"] == "Implant Placement"
        assert steps[-1]["cortical_only"] is False

    def test_touareg_os_3_5_d2(self, H):
        r = _gen(H, "Touareg-OS", 3.5, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        steps = body["steps"]
        assert len(steps) == 4, [(s["drill_type"], s["diameter"]) for s in steps]
        assert [s["diameter"] for s in steps] == [2.0, 2.8, 3.2, 3.5]
        self._schema_ok(steps)
        alt = body.get("alt_protocol")
        assert alt and alt["total_steps"] == 2
        assert alt["steps"][0]["drill_type"] == "Tri-Step"
        assert alt["steps"][0]["diameter"] == 3.2

    def test_touareg_os_5_0_l11_5_d4(self, H):
        r = _gen(H, "Touareg-OS", 5.0, 11.5, "D4")
        assert r.status_code == 200, r.text
        body = r.json()
        steps = body["steps"]
        assert len(steps) == 7, len(steps)
        twist_42 = [s for s in steps if s["drill_type"] == "Twist Drill" and s["diameter"] == 4.2][0]
        assert twist_42["cortical_only"] is True
        coronal = [s for s in steps if s["drill_type"] == "Coronal Drill" and s["diameter"] == 4.6][0]
        assert coronal["cortical_only"] is True
        alt = body["alt_protocol"]
        assert alt["total_steps"] == 4
        assert alt["steps"][0]["drill_type"] == "Tri-Step" and alt["steps"][0]["diameter"] == 3.6
        assert alt["steps"][1]["cortical_only"] is True
        assert alt["steps"][2]["cortical_only"] is True

    def test_touareg_os_6_0_l8_d4(self, H):
        r = _gen(H, "Touareg-OS", 6.0, 8, "D4")
        assert r.status_code == 200, r.text
        steps = r.json()["steps"]
        assert len(steps) == 8
        t52 = [s for s in steps if s["drill_type"] == "Twist Drill" and s["diameter"] == 5.2][0]
        c56 = [s for s in steps if s["drill_type"] == "Coronal Drill" and s["diameter"] == 5.6][0]
        assert t52["cortical_only"] is True
        assert c56["cortical_only"] is True

    def test_touareg_s_4_2_l6_25_d2(self, H):
        # iter-295: 6.25 mm row exists for Touareg-S Ø4.2
        r = _gen(H, "Touareg-S", 4.2, 6.25, "D2")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        steps = r.json()["steps"]
        assert len(steps) == 5  # 2.0,2.8,3.2,3.6 + placement
        assert steps[-1]["depth"] == 6.25

    def test_swell_3_3_no_tristep(self, H):
        r = _gen(H, "Swell", 3.3, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["steps"]) == 3
        assert not body.get("alt_protocol"), f"Swell Ø3.3 should have NO alt_protocol; got {body.get('alt_protocol')}"

    def test_swell_5_0_l11_5_d2(self, H):
        r = _gen(H, "Swell", 5.0, 11.5, "D2")
        assert r.status_code == 200
        body = r.json()
        assert len(body["steps"]) == 7
        alt = body["alt_protocol"]
        assert alt["total_steps"] == 4
        assert alt["steps"][0]["drill_type"] == "Tri-Step" and alt["steps"][0]["diameter"] == 3.6

    def test_one_3_0_l10_d2_no_tristep(self, H):
        r = _gen(H, "One", 3.0, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        steps = body["steps"]
        assert len(steps) == 3
        twist_28 = [s for s in steps if s["drill_type"] == "Twist Drill"][0]
        assert twist_28["cortical_only"] is True  # D2
        assert not body.get("alt_protocol"), f"One Ø3.0 should have NO alt; got {body.get('alt_protocol')}"

    def test_one_3_0_l10_d1_not_cortical(self, H):
        r = _gen(H, "One", 3.0, 10, "D1")
        assert r.status_code == 200
        twist = [s for s in r.json()["steps"] if s["drill_type"] == "Twist Drill"][0]
        assert twist["cortical_only"] is False

    def test_one_5_0_l13_d2(self, H):
        r = _gen(H, "One", 5.0, 13, "D2")
        assert r.status_code == 200
        body = r.json()
        assert len(body["steps"]) == 7
        alt = body["alt_protocol"]
        assert alt["total_steps"] == 4
        names = [s["drill_type"] for s in alt["steps"]]
        assert names == ["Tri-Step", "Twist Drill", "Coronal Drill", "Implant Placement"]


# ──────────────────────────── components ──────────────────────────
class TestComponents:
    @pytest.mark.parametrize("system", ["Touareg-OS", "Touareg-S", "Swell"])
    def test_rs_palette_99(self, H, system):
        r = _by_key(H, "Adin", system)
        assert r.status_code == 200, r.text
        data = r.json()
        comps = data.get("components") or []
        assert len(comps) == 99, f"{system} expected 99 components, got {len(comps)}"
        assert data.get("is_stub") is False
        ub = (data.get("updated_by") or "")
        assert "adin_rs_components_expanded" in ub and "iter-295" in ub, f"{system} updated_by={ub!r}"

    def test_rs_palette_identical(self, H):
        a = (_by_key(H, "Adin", "Touareg-OS").json().get("components") or [])
        b = (_by_key(H, "Adin", "Touareg-S").json().get("components") or [])
        c = (_by_key(H, "Adin", "Swell").json().get("components") or [])
        def codes(L):
            return sorted([x.get("catalog_code") for x in L])
        assert codes(a) == codes(b) == codes(c), "RS palette codes differ across three systems"

    def test_rs_palette_type_breakdown(self, H):
        comps = _by_key(H, "Adin", "Touareg-OS").json().get("components") or []
        by_type = {}
        for c in comps:
            by_type[c["type"]] = by_type.get(c["type"], 0) + 1
        expected = {
            "cover_screw": 1, "healing_abutment": 15, "screw_retained_abutment": 14,
            "final_abutment": 25, "ball_attachment": 10, "replacement_screw": 15,
            "impression_post": 11, "implant_analog": 4, "temporary_abutment": 2,
            "burnout_coping": 2,
        }
        mismatches = {k: (by_type.get(k), v) for k, v in expected.items() if by_type.get(k) != v}
        assert not mismatches, f"type breakdown (got, expected): {mismatches} | full: {by_type}"

    def test_one_palette_2_skus(self, H):
        r = _by_key(H, "Adin", "One")
        assert r.status_code == 200, r.text
        data = r.json()
        comps = data.get("components") or []
        assert len(comps) == 2, f"One components count={len(comps)}"
        codes = sorted([c.get("catalog_code") for c in comps])
        assert codes == ["RS6025", "RS6026"], codes


# ──────────────────────────── regression ──────────────────────────
class TestRegression:
    def test_blx_4_systems(self, H):
        blx = [s for s in _systems(H, "Straumann") if "BLX" in s.get("system", "")]
        assert len(blx) == 4, [s["system"] for s in blx]

    def test_blt_3_systems(self, H):
        blt = [s for s in _systems(H, "Straumann") if "BLT" in s.get("system", "")]
        assert len(blt) == 3, [s["system"] for s in blt]

    def test_unp_closefit(self, H):
        r = _gen(H, "UNP CloseFit", 2.75, 10, "D2")
        assert r.status_code == 200, r.text
        assert len(r.json()["steps"]) == 3

    def test_rp_closefit_sequential_with_tristep_alt(self, H):
        r = _gen(H, "RP CloseFit", 3.5, 10, "D2")
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["steps"]) == 4  # 2.0,2.8,3.2 + placement
        assert body["alt_protocol"]["steps"][0]["drill_type"] == "Tri-Step"
