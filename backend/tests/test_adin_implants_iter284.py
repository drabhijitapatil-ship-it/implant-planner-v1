"""
Iteration 284 — Adin Dental Implants regression test.

Coverage:
 - GET /api/implant-library/systems exposes 8 new Adin systems with full
   diameter/length matrix, brand='Adin', indication/procedures/bone types.
 - POST /api/drilling-protocols/generate works for all 8 systems × D1/D2/D3/D4
   with correct protocol_type labels and well-formed step arrays.
 - UNP CloseFit Ø2.75 has the special single-pilot 2-step protocol.
 - Touareg-OS Ø6.0 D1 has the wide-bone full ladder + 5.6 coronal drill.
 - Existing brands (Straumann, Alpha Bio, Neodent, BioHorizons, Dentsply
   Ankylos) still generate non-empty protocols (no regression).
 - /api/tips/daily still returns 'streak' field (iter-282 regression).
 - Auth login works for admin (Abhijit.patil) and student (Gaurav.pandey).
"""

import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://case-approval.preview.emergentagent.com",
).rstrip("/")

ADMIN = {"identifier": "Abhijit.patil", "password": "Admin@123"}
STUDENT = {"identifier": "Gaurav.pandey", "password": "Student@123"}


# ── Fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT, timeout=30)
    assert r.status_code == 200, f"Student login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}",
                      "Content-Type": "application/json"})
    return s


# ── Auth ───────────────────────────────────────────────────────────────────
class TestAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_student_login(self, student_token):
        assert isinstance(student_token, str) and len(student_token) > 20


# ── Adin Implant Library matrix ────────────────────────────────────────────
EXPECTED_ADIN_MATRIX = {
    "UNP CloseFit": {2.75: 7},                              # 7 rows
    "NP CloseFit":  {3.0: 6},                               # 6 rows
    "RP CloseFit":  {3.5: 6},                               # 6 rows
    "WP CloseFit":  {4.3: 6, 5.0: 6},                       # 12 rows
    "Touareg-OS":   {3.5: 7, 3.75: 6, 4.2: 7, 5.0: 6, 6.0: 5},  # 31
    "Touareg-S":    {3.5: 6, 3.75: 6, 4.2: 6, 5.0: 4, 6.0: 5},  # 27
    "Swell":        {3.3: 5, 3.75: 6, 4.2: 7, 5.0: 6, 6.0: 5},  # 29
    "One":          {3.0: 4, 3.3: 4, 3.6: 4, 4.2: 4, 5.0: 4},   # 20
}

ADIN_SYSTEMS = list(EXPECTED_ADIN_MATRIX.keys())


@pytest.fixture(scope="module")
def adin_rows(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/implant-library/systems", timeout=30)
    assert r.status_code == 200, f"systems endpoint failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    # response may be list of rows or {systems: [...]}
    if isinstance(data, dict):
        data = data.get("systems") or data.get("data") or []
    assert isinstance(data, list), f"Unexpected payload type: {type(data)}"
    adin = [s for s in data if isinstance(s, dict) and s.get("brand") == "Adin"]
    return adin


class TestAdinSystemMatrix:
    def test_all_systems_present(self, adin_rows):
        names = sorted({s["system"] for s in adin_rows})
        missing = [n for n in ADIN_SYSTEMS if n not in names]
        assert not missing, f"Missing Adin systems: {missing}. Got: {names}"

    @pytest.mark.parametrize("system,dia_map", list(EXPECTED_ADIN_MATRIX.items()))
    def test_matrix_per_system(self, adin_rows, system, dia_map):
        sys_rows = [s for s in adin_rows if s["system"] == system]
        assert sys_rows, f"No rows for Adin/{system}"
        # systems endpoint returns ONE aggregated record per system
        rec = sys_rows[0]
        # diameters must match exactly
        got_diameters = sorted(float(d) for d in rec.get("diameters") or [])
        want_diameters = sorted(float(d) for d in dia_map.keys())
        assert got_diameters == want_diameters, (
            f"{system} diameters mismatch: want {want_diameters}, got {got_diameters}"
        )
        # total (diameter,length) row count
        expected_total = sum(dia_map.values())
        actual_total = rec.get("count")
        assert actual_total == expected_total, (
            f"{system} total count: want {expected_total}, got {actual_total}"
        )

    def test_total_adin_rows(self, adin_rows):
        # 7 + 6 + 6 + 12 + 31 + 27 + 29 + 20 = 138
        total = sum(s.get("count", 0) for s in adin_rows)
        assert total == 138, f"Expected 138 total Adin implant rows, got {total}"

    def test_brand_capitalization(self, adin_rows):
        for r in adin_rows:
            assert r["brand"] == "Adin", f"Wrong brand on {r.get('system')}: {r['brand']}"

    @pytest.mark.parametrize("system", ADIN_SYSTEMS)
    def test_indication_payload(self, adin_rows, system):
        rows = [s for s in adin_rows if s["system"] == system]
        # Take first row and verify enriched fields
        sample = rows[0]
        # indication can be either in row or fetched via separate endpoint;
        # accept either as long as present.
        ind = sample.get("indication") or sample.get("indications") or ""
        procs = sample.get("indicated_procedures") or []
        bones = sample.get("indicated_bone_types") or []
        assert ind, f"{system} indication empty"
        assert procs, f"{system} indicated_procedures empty"
        assert bones, f"{system} indicated_bone_types empty"


# ── Indication content ─────────────────────────────────────────────────────
class TestAdinIndications:
    ALL_ON_X_SYSTEMS = {"WP CloseFit", "Touareg-OS", "Touareg-S"}
    NO_ALL_ON_X_BUT_IMMEDIATE = {"UNP CloseFit", "NP CloseFit", "RP CloseFit", "Swell"}

    @pytest.mark.parametrize("system", sorted(ALL_ON_X_SYSTEMS))
    def test_all_on_x_systems(self, adin_rows, system):
        sample = next(s for s in adin_rows if s["system"] == system)
        procs = sample.get("indicated_procedures") or []
        joined = " ".join(procs).lower()
        assert any("all on" in p.lower() or "all-on" in p.lower() for p in procs), (
            f"{system} should include All on 4/6/X. Got: {procs}"
        )

    @pytest.mark.parametrize("system", sorted(NO_ALL_ON_X_BUT_IMMEDIATE))
    def test_immediate_no_all_on_x(self, adin_rows, system):
        sample = next(s for s in adin_rows if s["system"] == system)
        procs = sample.get("indicated_procedures") or []
        joined = " ".join(procs).lower()
        assert "immediate" in joined, f"{system} should include immediate. Got: {procs}"
        assert "all on" not in joined and "all-on" not in joined, (
            f"{system} should NOT include All-on-X. Got: {procs}"
        )

    def test_one_system_minimal(self, adin_rows):
        sample = next(s for s in adin_rows if s["system"] == "One")
        procs = sample.get("indicated_procedures") or []
        joined = " ".join(procs).lower()
        assert "single conventional implant" in joined, f"One should include Single Conventional. Got: {procs}"
        assert "immediate" in joined, f"One should include Immediate. Got: {procs}"

    @pytest.mark.parametrize("system", ADIN_SYSTEMS)
    def test_bone_types_d1_d4(self, adin_rows, system):
        sample = next(s for s in adin_rows if s["system"] == system)
        bones = sample.get("indicated_bone_types") or []
        joined = " ".join(bones).upper()
        for d in ("D1", "D2", "D3", "D4"):
            assert d in joined, f"{system} missing {d}. Got: {bones}"


# ── Drilling protocol generation ───────────────────────────────────────────
BONE_TYPE_PROTOCOL_LABEL = {
    "D1": "Hard Bone (Adin — full ladder + countersink)",
    "D2": "Standard Protocol (Adin)",
    "D3": "Standard Protocol (Adin)",
    "D4": "Soft Bone Under-Preparation (Adin)",
}


def _gen_protocol(client, brand, system, diameter, length, bone):
    payload = {
        "brand": brand,
        "system": system,
        "diameter": diameter,
        "length": length,
        "bone_density": bone,
    }
    r = client.post(f"{BASE_URL}/api/drilling-protocols/generate", json=payload, timeout=30)
    return r


class TestAdinDrillingProtocols:
    # System → representative (diameter, length) pair
    SAMPLE_SIZE = {
        "UNP CloseFit": (2.75, 10),
        "NP CloseFit":  (3.0, 10),
        "RP CloseFit":  (3.5, 10),
        "WP CloseFit":  (4.3, 10),
        "Touareg-OS":   (4.2, 10),
        "Touareg-S":    (4.2, 10),
        "Swell":        (4.2, 10),
        "One":          (4.2, 11.5),
    }

    @pytest.mark.parametrize("system", ADIN_SYSTEMS)
    @pytest.mark.parametrize("bone", ["D1", "D2", "D3", "D4"])
    def test_protocol_per_bone(self, admin_client, system, bone):
        dia, length = self.SAMPLE_SIZE[system]
        r = _gen_protocol(admin_client, "Adin", system, dia, length, bone)
        assert r.status_code == 200, f"{system}/{bone}: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert (data.get("protocol_type") or "").startswith(BONE_TYPE_PROTOCOL_LABEL[bone]), (
            f"{system}/{bone} wrong protocol_type: {data.get('protocol_type')}"
        )
        steps = data.get("steps") or []
        assert len(steps) >= 2, f"{system}/{bone} steps too short: {steps}"
        for st in steps:
            assert "step" in st or "step_number" in st, f"step missing number: {st}"
            assert st.get("drill_name") or st.get("name"), f"step missing drill_name: {st}"
            # diameter & depth & rpm — allow either None for insertion or numeric
            assert "diameter_mm" in st or "diameter" in st, f"missing diameter: {st}"
            assert "depth_mm" in st or "depth" in st, f"missing depth: {st}"
            assert "rpm" in st, f"missing rpm: {st}"
        # final step torque mention
        final = steps[-1]
        text = " ".join(str(v) for v in final.values()).lower()
        assert ("30-50" in text or "30–50" in text or "≥35" in text or ">=35" in text
                or "35 ncm" in text or "ncm" in text), (
            f"{system}/{bone} final step missing torque mention: {final}"
        )

    def test_unp_closefit_two_steps(self, admin_client):
        r = _gen_protocol(admin_client, "Adin", "UNP CloseFit", 2.75, 10, "D2")
        assert r.status_code == 200, r.text[:300]
        steps = r.json().get("steps") or []
        assert len(steps) == 2, f"UNP Ø2.75 must have exactly 2 steps, got {len(steps)}: {steps}"
        # First step pilot drill 2.5
        s0 = steps[0]
        name = (s0.get("drill_name") or s0.get("name") or "").lower()
        assert "pilot" in name, f"step 1 should be Pilot Drill: {s0}"
        dia0 = s0.get("diameter_mm") or s0.get("diameter")
        assert float(dia0) == 2.5, f"pilot diameter should be 2.5, got {dia0}"
        # Final step implant insertion
        last = (steps[1].get("drill_name") or steps[1].get("name") or "").lower()
        assert "implant" in last or "insert" in last, f"step 2 should be insertion: {steps[1]}"

    def test_touareg_os_6mm_d1_full_ladder(self, admin_client):
        r = _gen_protocol(admin_client, "Adin", "Touareg-OS", 6.0, 10, "D1")
        assert r.status_code == 200, r.text[:300]
        steps = r.json().get("steps") or []
        # Expect Tri-Step + 3.6 + 4.2 + 5.2 + 5.6 Coronal + Implant Insertion = 6 steps
        names = [(s.get("drill_name") or s.get("name") or "").lower() for s in steps]
        joined = " | ".join(names)
        assert "tri-step" in joined or "tri step" in joined, f"missing Tri-Step in {joined}"
        # check sequential drills present by diameter
        diameters = []
        for s in steps:
            d = s.get("diameter_mm") or s.get("diameter")
            if d is not None:
                try:
                    diameters.append(float(d))
                except (TypeError, ValueError):
                    pass
        for expected in (3.6, 4.2, 5.2, 5.6):
            assert expected in diameters, (
                f"Touareg-OS Ø6.0 D1 missing drill Ø{expected}. Diameters: {diameters}"
            )
        # 5.6 should be coronal drill (mentioned)
        coronal_found = any("coronal" in n for n in names)
        assert coronal_found, f"Touareg-OS Ø6.0 D1 missing coronal drill: {joined}"


# ── Existing brand regression ──────────────────────────────────────────────
class TestExistingBrandsRegression:
    EXISTING_CASES = [
        ("Straumann", "BLX Roxolid SLActive - RB Platform", 4.0, 12, "D2"),
        ("Alpha Bio", "SPI", 4.2, 10, "D2"),
        ("Neodent", "Helix GM Acqua", 4.0, 10, "D3"),
        ("BioHorizons", "Tapered Pro Conical RBT", 4.5, 12, "D1"),
        ("Dentsply Sirona", "Ankylos C/X", 4.5, 11, "D2"),
    ]

    @pytest.mark.parametrize("brand,system,dia,length,bone", EXISTING_CASES)
    def test_existing_protocols_still_work(self, admin_client, brand, system, dia, length, bone):
        r = _gen_protocol(admin_client, brand, system, dia, length, bone)
        assert r.status_code == 200, f"{brand}/{system}: {r.status_code} {r.text[:300]}"
        data = r.json()
        steps = data.get("steps") or []
        assert len(steps) >= 2, f"{brand}/{system} has empty/too-short steps: {steps}"
        assert data.get("protocol_type"), f"{brand}/{system} missing protocol_type"


# ── Tips/daily streak regression ───────────────────────────────────────────
class TestTipsDaily:
    def test_streak_field_present(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/tips/daily", timeout=30)
        assert r.status_code == 200, f"tips/daily: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "streak" in data, f"tips/daily missing 'streak' field. Keys: {list(data.keys())}"
