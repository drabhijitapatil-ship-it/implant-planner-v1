"""
Iteration 55: Osstem Drilling Protocol Tests
Tests all 5 Osstem systems: ETIII NH, MS, SS III, TS III, TS IV
Key rules:
- D1: Full drilling + cortical drill (coronal only)
- D2: Standard full drilling, placement 1mm subcrestal
- D3/D4: Under-prep (skip final drill), placement at bone level
- TS IV: Fixed ultra-soft bone protocol regardless of bone type
- Insertion torque: ~40 Ncm
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://surgical-case-portal.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def auth_token():
    """Login once per module to avoid rate limiting."""
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "Gaurav.pandey",
        "password": "Student@123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return login_resp.json()["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    """Auth headers for API calls."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestOsstemDrillingProtocols:
    """Test Osstem drilling protocol generation for all 5 systems."""
    
    # ─── Test 1: All 5 Osstem systems in available protocols ───────────────
    def test_all_osstem_systems_available(self, headers):
        """Verify all 5 Osstem systems are listed in available protocols."""
        resp = requests.get(f"{BASE_URL}/api/drilling-protocols/available", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # API returns flat list of systems
        osstem_systems = [x for x in data if x.get("brand") == "Osstem"]
        system_names = [s.get("system") for s in osstem_systems]
        
        expected_systems = ["ETIII NH", "MS", "SS III", "TS III", "TS IV"]
        for expected in expected_systems:
            assert expected in system_names, f"System '{expected}' not found. Available: {system_names}"
        
        print(f"PASS: All 5 Osstem systems found: {system_names}")
    
    # ─── Test 2: TS III 4.5mm D1 - Full drilling + cortical ────────────────
    def test_ts_iii_4_5mm_d1_full_drilling_with_cortical(self, headers):
        """TS III 4.5mm D1: 2.2→3.5→4.0→4.5→Cortical 4.5 (Coronal ONLY)→Implant."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS III",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert resp.status_code == 200, f"Generate failed: {resp.text}"
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.5→4.0→4.5→Cortical 4.5
        expected_sequence = [2.2, 3.5, 4.0, 4.5, 4.5]  # Last 4.5 is cortical
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        # Check cortical drill has "Coronal ONLY" depth
        cortical_step = None
        for s in steps:
            if "Cortical" in s.get("drill_type", ""):
                cortical_step = s
                break
        
        assert cortical_step is not None, "Cortical drill step not found"
        assert cortical_step.get("depth") == "Coronal ONLY", f"Cortical depth should be 'Coronal ONLY', got {cortical_step.get('depth')}"
        
        # Check protocol type mentions hard bone
        protocol_type = data.get("protocol_type", "")
        assert "Hard Bone" in protocol_type or "Cortical" in protocol_type, f"Protocol type should mention Hard Bone/Cortical: {protocol_type}"
        
        print(f"PASS: TS III 4.5mm D1 sequence: {drill_sequence}, cortical depth: {cortical_step.get('depth')}")
    
    # ─── Test 3: TS III 4.5mm D2 - Standard drilling, no cortical ──────────
    def test_ts_iii_4_5mm_d2_standard_no_cortical(self, headers):
        """TS III 4.5mm D2: 2.2→3.5→4.0→4.5→Implant (no cortical). Placement 1mm subcrestal."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS III",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D2"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.5→4.0→4.5 (no cortical)
        expected_sequence = [2.2, 3.5, 4.0, 4.5]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        # Verify no cortical drill
        for s in steps:
            assert "Cortical" not in s.get("drill_type", ""), f"D2 should not have cortical drill: {s}"
        
        # Check placement note includes "1mm subcrestal"
        implant_step = [s for s in steps if s.get("drill_type") == "Implant Placement"][0]
        note = implant_step.get("note", "")
        assert "1mm subcrestal" in note, f"D2 placement note should include '1mm subcrestal': {note}"
        
        print(f"PASS: TS III 4.5mm D2 sequence: {drill_sequence}, placement note: {note}")
    
    # ─── Test 4: ETIII NH 5.0mm D3 - Under-prep (skip 5.0) ─────────────────
    def test_etiii_nh_5_0mm_d3_underprep(self, headers):
        """ETIII NH 5.0mm D3: 2.2→3.5→4.5→Implant (skip 5.0 = under-prep). Placement at bone level."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "ETIII NH",
            "diameter": 5.0,
            "length": 11.5,
            "bone_density": "D3"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.5→4.5 (skip 5.0 for under-prep)
        expected_sequence = [2.2, 3.5, 4.5]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        # Check placement note includes "at bone level"
        implant_step = [s for s in steps if s.get("drill_type") == "Implant Placement"][0]
        note = implant_step.get("note", "")
        assert "at bone level" in note, f"D3 placement note should include 'at bone level': {note}"
        
        print(f"PASS: ETIII NH 5.0mm D3 sequence: {drill_sequence}, placement note: {note}")
    
    # ─── Test 5: SS III 3.5mm D4 - Under-prep (skip 3.5) ───────────────────
    def test_ss_iii_3_5mm_d4_underprep(self, headers):
        """SS III 3.5mm D4: 2.2→3.0→Implant (skip 3.5 = under-prep)."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "SS III",
            "diameter": 3.5,
            "length": 8.5,
            "bone_density": "D4"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.0 (skip 3.5 for under-prep)
        expected_sequence = [2.2, 3.0]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        print(f"PASS: SS III 3.5mm D4 sequence: {drill_sequence}")
    
    # ─── Test 6: TS IV 4.0mm - Fixed ultra-soft protocol ───────────────────
    def test_ts_iv_4_0mm_fixed_protocol(self, headers):
        """TS IV 4.0mm: 2.2→3.5→Implant (fixed ultra-soft protocol, regardless of bone type)."""
        # Test with D1 bone - should still use TS IV simplified protocol
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS IV",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D1"  # Even D1 uses TS IV simplified protocol
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.5 (fixed TS IV protocol)
        expected_sequence = [2.2, 3.5]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        print(f"PASS: TS IV 4.0mm sequence: {drill_sequence}")
    
    # ─── Test 7: TS IV 4.5mm - Fixed ultra-soft protocol ───────────────────
    def test_ts_iv_4_5mm_fixed_protocol(self, headers):
        """TS IV 4.5mm: 2.2→2.7→3.5→4.0→Implant."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS IV",
            "diameter": 4.5,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→2.7→3.5→4.0
        expected_sequence = [2.2, 2.7, 3.5, 4.0]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        print(f"PASS: TS IV 4.5mm sequence: {drill_sequence}")
    
    # ─── Test 8: TS IV 5.0mm - Fixed ultra-soft protocol ───────────────────
    def test_ts_iv_5_0mm_fixed_protocol(self, headers):
        """TS IV 5.0mm: 2.2→2.7→3.5→4.5→Implant."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS IV",
            "diameter": 5.0,
            "length": 13,
            "bone_density": "D4"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→2.7→3.5→4.5
        expected_sequence = [2.2, 2.7, 3.5, 4.5]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        print(f"PASS: TS IV 5.0mm sequence: {drill_sequence}")
    
    # ─── Test 9: Cortical drill depth is "Coronal ONLY" ────────────────────
    def test_cortical_drill_depth_coronal_only(self, headers):
        """Cortical drill depth must be 'Coronal ONLY' with note about hard bone (D1) only."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "ETIII NH",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D1"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        cortical_step = None
        for s in steps:
            if "Cortical" in s.get("drill_type", ""):
                cortical_step = s
                break
        
        assert cortical_step is not None, "Cortical drill step not found for D1"
        assert cortical_step.get("depth") == "Coronal ONLY", f"Cortical depth should be 'Coronal ONLY': {cortical_step.get('depth')}"
        
        note = cortical_step.get("note", "")
        assert "D1" in note or "hard bone" in note.lower(), f"Cortical note should mention D1/hard bone: {note}"
        
        print(f"PASS: Cortical drill depth: {cortical_step.get('depth')}, note: {note}")
    
    # ─── Test 10: Cortical drill only for D1, never D2/D3/D4 ───────────────
    def test_cortical_drill_only_for_d1(self, headers):
        """Cortical drill only appears for D1 bone type, never for D2/D3/D4."""
        for bone in ["D2", "D3", "D4"]:
            resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
                "brand": "Osstem",
                "system": "MS",
                "diameter": 4.5,
                "length": 10,
                "bone_density": bone
            })
            assert resp.status_code == 200
            data = resp.json()
            
            steps = data.get("steps", [])
            for s in steps:
                assert "Cortical" not in s.get("drill_type", ""), f"{bone} should not have cortical drill: {s}"
        
        print("PASS: Cortical drill only appears for D1, not D2/D3/D4")
    
    # ─── Test 11: Insertion torque ~40 Ncm in notes ────────────────────────
    def test_insertion_torque_40_ncm(self, headers):
        """Insertion torque in notes: ~40 Ncm."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS III",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        implant_step = [s for s in steps if s.get("drill_type") == "Implant Placement"][0]
        note = implant_step.get("note", "")
        
        assert "40 Ncm" in note, f"Implant placement note should include '40 Ncm': {note}"
        
        print(f"PASS: Insertion torque in note: {note}")
    
    # ─── Test 12: PDF export for ETIII NH ──────────────────────────────────
    def test_pdf_export_etiii_nh(self, headers):
        """PDF export for ETIII NH returns 200."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", headers=headers, json={
            "brand": "Osstem",
            "system": "ETIII NH",
            "diameter": 4.5,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert resp.status_code == 200, f"PDF export failed: {resp.status_code}"
        assert "application/pdf" in resp.headers.get("Content-Type", ""), f"Expected PDF content type: {resp.headers.get('Content-Type')}"
        assert len(resp.content) > 1000, "PDF content too small"
        
        print(f"PASS: ETIII NH PDF export returned {len(resp.content)} bytes")
    
    # ─── Test 13: PDF export for TS IV ─────────────────────────────────────
    def test_pdf_export_ts_iv(self, headers):
        """PDF export for TS IV returns 200."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", headers=headers, json={
            "brand": "Osstem",
            "system": "TS IV",
            "diameter": 5.0,
            "length": 10,
            "bone_density": "D4"
        })
        assert resp.status_code == 200, f"PDF export failed: {resp.status_code}"
        assert "application/pdf" in resp.headers.get("Content-Type", ""), f"Expected PDF content type: {resp.headers.get('Content-Type')}"
        assert len(resp.content) > 1000, "PDF content too small"
        
        print(f"PASS: TS IV PDF export returned {len(resp.content)} bytes")
    
    # ─── Test 14: Regression - Neodent Helix GM Acqua 4.3mm D2 ─────────────
    def test_regression_neodent_helix_gm_acqua(self, headers):
        """Regression: Neodent Helix GM Acqua 4.3mm D2 still works."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 10,
            "bone_density": "D2"
        })
        assert resp.status_code == 200, f"Neodent Helix GM Acqua failed: {resp.text}"
        data = resp.json()
        
        steps = data.get("steps", [])
        assert len(steps) > 0, "No steps returned for Neodent Helix GM Acqua"
        
        print(f"PASS: Neodent Helix GM Acqua 4.3mm D2 returned {len(steps)} steps")
    
    # ─── Test 15: Regression - Bredent Blue Sky 4.5mm D1 ───────────────────
    def test_regression_bredent_blue_sky(self, headers):
        """Regression: Bredent Blue Sky 4.5mm D1 still works."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Bredent",
            "system": "Blue Sky",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert resp.status_code == 200, f"Bredent Blue Sky failed: {resp.text}"
        data = resp.json()
        
        steps = data.get("steps", [])
        assert len(steps) > 0, "No steps returned for Bredent Blue Sky"
        
        print(f"PASS: Bredent Blue Sky 4.5mm D1 returned {len(steps)} steps")
    
    # ─── Test 16: MS system works with standard protocol ───────────────────
    def test_ms_system_standard_protocol(self, headers):
        """MS system uses standard Osstem protocol."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "MS",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        drill_sequence = [s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement"]
        
        # Expected: 2.2→3.5→4.0 (standard D2 protocol)
        expected_sequence = [2.2, 3.5, 4.0]
        assert drill_sequence == expected_sequence, f"Expected {expected_sequence}, got {drill_sequence}"
        
        print(f"PASS: MS 4.0mm D2 sequence: {drill_sequence}")
    
    # ─── Test 17: All standard systems share same protocol ─────────────────
    def test_standard_systems_share_protocol(self, headers):
        """ETIII NH, MS, SS III, TS III all use the same standard protocol."""
        standard_systems = ["ETIII NH", "MS", "SS III", "TS III"]
        results = {}
        
        for system in standard_systems:
            resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
                "brand": "Osstem",
                "system": system,
                "diameter": 4.5,
                "length": 10,
                "bone_density": "D2"
            })
            assert resp.status_code == 200
            data = resp.json()
            
            steps = data.get("steps", [])
            drill_sequence = tuple(s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement")
            results[system] = drill_sequence
        
        # All should have the same sequence
        sequences = list(results.values())
        assert all(s == sequences[0] for s in sequences), f"Standard systems should share protocol: {results}"
        
        print(f"PASS: All standard systems share protocol: {sequences[0]}")
    
    # ─── Test 18: TS IV ignores bone density ───────────────────────────────
    def test_ts_iv_ignores_bone_density(self, headers):
        """TS IV uses fixed protocol regardless of bone density."""
        results = {}
        
        for bone in ["D1", "D2", "D3", "D4"]:
            resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
                "brand": "Osstem",
                "system": "TS IV",
                "diameter": 4.5,
                "length": 10,
                "bone_density": bone
            })
            assert resp.status_code == 200
            data = resp.json()
            
            steps = data.get("steps", [])
            drill_sequence = tuple(s.get("diameter") for s in steps if s.get("drill_type") != "Implant Placement")
            results[bone] = drill_sequence
        
        # All should have the same sequence
        sequences = list(results.values())
        assert all(s == sequences[0] for s in sequences), f"TS IV should ignore bone density: {results}"
        
        print(f"PASS: TS IV ignores bone density, all use: {sequences[0]}")
    
    # ─── Test 19: D1 protocol type mentions Hard Bone + Cortical ───────────
    def test_d1_protocol_type_hard_bone_cortical(self, headers):
        """D1 protocol type should mention 'Hard Bone + Cortical Protocol'."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "TS III",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        protocol_type = data.get("protocol_type", "")
        # Should contain Hard Bone or Cortical
        assert "Hard Bone" in protocol_type or "Cortical" in protocol_type or "D1" in protocol_type, \
            f"D1 protocol_type should mention Hard Bone/Cortical: {protocol_type}"
        
        print(f"PASS: D1 protocol type: {protocol_type}")
    
    # ─── Test 20: Non-cortical drill depths equal implant length ───────────
    def test_non_cortical_drill_depths_equal_implant_length(self, headers):
        """All non-cortical drill depths should equal implant length."""
        resp = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", headers=headers, json={
            "brand": "Osstem",
            "system": "ETIII NH",
            "diameter": 4.5,
            "length": 11.5,
            "bone_density": "D1"
        })
        assert resp.status_code == 200
        data = resp.json()
        
        steps = data.get("steps", [])
        for s in steps:
            if s.get("drill_type") == "Implant Placement":
                continue
            if "Cortical" in s.get("drill_type", ""):
                assert s.get("depth") == "Coronal ONLY", f"Cortical should be Coronal ONLY: {s}"
            else:
                # Non-cortical drills should have depth = implant length
                depth = s.get("depth")
                assert depth == "11.5" or depth == 11.5, f"Non-cortical drill depth should be 11.5: {s}"
        
        print("PASS: Non-cortical drill depths equal implant length")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
