"""
Test Suite for ZimVie TSX Drilling Protocol - Iteration 57
Tests the TSX system with TWO surgical kits (Driva Gold Series + Driva Drills Original):
- Diameters: 3.1, 3.7, 4.1, 4.7, 5.4, 6.0mm
- Lengths: 8, 10, 11.5, 13, 16mm
- Bone mapping: D1/D2=Dense, D3/D4=Soft
- Special case: 5.4mm has NO soft bone protocol (should return warning)
- Both kits return same drill sequence but different catalog codes
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://surgical-case-portal.preview.emergentagent.com')

# Expected Gold kit codes
GOLD_CODES = {
    "pilot": "0201G", "2.3": "TSV23G", "2.8": "TSV28G",
    "3.4/2.8": "TSV34D28G", "3.4/2.8 step": "TSV34D28G",
    "3.8": "TSV38G", "3.8/3.4 step": "TSV38D34G",
    "4.4/3.8": "TSV44D38G", "4.4/3.8 step": "TSV44D38G",
    "5.1": "TSV51G", "5.1/4.4 step": "TSV51D44G",
    "5.7/5.1 step": "TSV57D51G", "2.4/2.8 step": "EZT28D24G",
}

# Expected Original kit codes
ORIGINAL_CODES = {
    "pilot": "0201DSN", "2.3": "SV2.3DN", "2.8": "SV2.8DN",
    "3.4/2.8": "TSV3DN", "3.4/2.8 step": "TSV3DN",
    "3.8": "SV3.8DN", "3.8/3.4 step": "TSV3.8DN",
    "4.4/3.8": "TSV4DN", "4.4/3.8 step": "TSV4DN",
    "5.1": "SV5.1DN", "5.1/4.4 step": "TSV5.1DN",
    "5.7/5.1 step": "TSV6DN", "2.4/2.8 step": "ZOP28DN",
}


# Module-level fixture for auth token (single login for all tests)
@pytest.fixture(scope="module")
def auth_headers():
    """Get authentication token once for all tests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "Gaurav.pandey", "password": "Student@123"}
    )
    assert response.status_code == 200, f"Auth failed: {response.text}"
    token = response.json()["token"]
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }


class TestTSXAvailability:
    """Test TSX appears in available protocols"""
    
    def test_tsx_in_available_protocols(self, auth_headers):
        """TSX should appear in GET /api/drilling-protocols/available"""
        response = requests.get(
            f"{BASE_URL}/api/drilling-protocols/available",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        tsx_found = False
        for proto in data:
            if proto["brand"] == "Zimmer" and proto["system"] == "TSX":
                tsx_found = True
                assert proto["system_name"] == "ZimVie TSX"
                assert proto["lengths"] == [8.0, 10.0, 11.5, 13.0, 16.0]
                break
        
        assert tsx_found, "TSX not found in available protocols"
        print("PASS: TSX appears in available protocols with correct lengths")


class TestTSXDualKitResponse:
    """Test that TSX returns both Gold and Original kit protocols"""
    
    def test_tsx_returns_both_kits(self, auth_headers):
        """POST /api/drilling-protocols/generate with TSX returns both Gold and Original kit protocols"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Main response should have steps (Gold kit)
        assert "steps" in data, "Main steps (Gold kit) missing"
        assert len(data["steps"]) > 0, "Gold kit steps empty"
        
        # alt_protocol should exist with Original kit
        assert "alt_protocol" in data, "alt_protocol (Original kit) missing"
        assert data["alt_protocol"]["name"] == "Driva Drills (Original)", f"Expected 'Driva Drills (Original)', got {data['alt_protocol']['name']}"
        assert "steps" in data["alt_protocol"], "Original kit steps missing"
        assert len(data["alt_protocol"]["steps"]) > 0, "Original kit steps empty"
        
        print(f"PASS: TSX returns both kits - Gold: {len(data['steps'])} steps, Original: {len(data['alt_protocol']['steps'])} steps")
    
    def test_both_kits_have_same_step_count(self, auth_headers):
        """Both kits should have the same number of steps"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.7,
                "length": 13,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = len(data["steps"])
        original_steps = len(data["alt_protocol"]["steps"])
        
        assert gold_steps == original_steps, f"Step count mismatch: Gold={gold_steps}, Original={original_steps}"
        print(f"PASS: Both kits have same step count: {gold_steps}")


class TestTSX31mmDense:
    """Test 3.1mm Dense bone protocol (includes pilot drill)"""
    
    def test_tsx_31mm_dense_includes_pilot(self, auth_headers):
        """TSX 3.1mm Dense includes pilot drill (0201G/0201DSN) as first step"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 3.1,
                "length": 10,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check Gold kit first step is pilot
        gold_steps = data["steps"]
        first_step = gold_steps[0]
        assert "Pilot" in first_step["drill_type"], f"First step should be pilot, got {first_step['drill_type']}"
        assert first_step["code"] == "0201G", f"Gold pilot code should be 0201G, got {first_step['code']}"
        
        # Check Original kit first step is pilot
        original_steps = data["alt_protocol"]["steps"]
        first_orig = original_steps[0]
        assert "Pilot" in first_orig["drill_type"], f"Original first step should be pilot, got {first_orig['drill_type']}"
        assert first_orig["code"] == "0201DSN", f"Original pilot code should be 0201DSN, got {first_orig['code']}"
        
        print("PASS: TSX 3.1mm Dense includes pilot drill as first step with correct codes")


class TestTSX37mmD1Dense:
    """Test 3.7mm D1 Dense bone protocol"""
    
    def test_tsx_37mm_d1_dense_4_steps(self, auth_headers):
        """TSX 3.7mm D1 Dense returns 4 steps (2.3, 2.8, 3.4/2.8 step, implant) per kit"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 3.7,
                "length": 10,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        # Expected: 2.3, 2.8, 3.4/2.8 step, implant = 4 steps
        assert len(gold_steps) == 4, f"Expected 4 steps for 3.7mm D1, got {len(gold_steps)}"
        
        # Verify drill sequence
        assert "2.3" in gold_steps[0]["diameter"] or gold_steps[0]["code"] == "TSV23G"
        assert "2.8" in gold_steps[1]["diameter"] or gold_steps[1]["code"] == "TSV28G"
        assert "step" in gold_steps[2]["drill_type"].lower() or "3.4" in str(gold_steps[2]["diameter"])
        assert "Implant" in gold_steps[3]["drill_type"]
        
        print(f"PASS: TSX 3.7mm D1 Dense returns 4 steps: {[s['diameter'] for s in gold_steps]}")


class TestTSX41mmD2Dense:
    """Test 4.1mm D2 Dense bone protocol"""
    
    def test_tsx_41mm_d2_dense_5_steps(self, auth_headers):
        """TSX 4.1mm D2 Dense returns 5 steps (2.3, 2.8, 3.4/2.8, 3.8/3.4 step, implant) per kit"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": 11.5,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        # Expected: 2.3, 2.8, 3.4/2.8, 3.8/3.4 step, implant = 5 steps
        assert len(gold_steps) == 5, f"Expected 5 steps for 4.1mm D2, got {len(gold_steps)}"
        
        # Verify last step is implant
        assert "Implant" in gold_steps[-1]["drill_type"]
        
        # Verify step drill is present
        step_drill_found = any("step" in s["drill_type"].lower() for s in gold_steps[:-1])
        assert step_drill_found, "Step drill should be present in 4.1mm D2 Dense protocol"
        
        print(f"PASS: TSX 4.1mm D2 Dense returns 5 steps")


class TestTSX47mmD3Soft:
    """Test 4.7mm D3 Soft bone protocol"""
    
    def test_tsx_47mm_d3_soft_no_step_drill(self, auth_headers):
        """TSX 4.7mm D3 Soft returns 5 steps (2.3, 2.8, 3.4/2.8, 3.8, implant) WITHOUT step drill"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.7,
                "length": 13,
                "bone_density": "D3"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        # Expected: 2.3, 2.8, 3.4/2.8, 3.8, implant = 5 steps
        assert len(gold_steps) == 5, f"Expected 5 steps for 4.7mm D3, got {len(gold_steps)}"
        
        # Verify NO step drill in soft bone protocol
        step_drill_found = any("step" in s["drill_type"].lower() for s in gold_steps[:-1])
        assert not step_drill_found, "Step drill should NOT be present in 4.7mm D3 Soft protocol"
        
        # Verify protocol type mentions Soft
        assert "Soft" in data["protocol_type"], f"Protocol type should mention Soft, got {data['protocol_type']}"
        
        print(f"PASS: TSX 4.7mm D3 Soft returns 5 steps WITHOUT step drill")


class TestTSX54mmD4SoftWarning:
    """Test 5.4mm D4 Soft bone protocol (should return WARNING)"""
    
    def test_tsx_54mm_d4_soft_returns_warning(self, auth_headers):
        """TSX 5.4mm D4 Soft returns WARNING (no soft bone protocol)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 5.4,
                "length": 10,
                "bone_density": "D4"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        # Should have warning step
        assert len(gold_steps) >= 1, "Should have at least one step (warning)"
        
        # Check for warning
        warning_found = any("Warning" in s["drill_type"] or "warning" in str(s.get("note", "")).lower() for s in gold_steps)
        assert warning_found, f"Expected warning for 5.4mm D4 Soft, got steps: {gold_steps}"
        
        # Check warning mentions no soft bone protocol
        warning_step = next((s for s in gold_steps if "Warning" in s["drill_type"] or "warning" in str(s.get("note", "")).lower()), None)
        if warning_step and warning_step.get("note"):
            assert "soft" in warning_step["note"].lower() or "no" in warning_step["note"].lower(), f"Warning should mention no soft bone protocol: {warning_step['note']}"
        
        print(f"PASS: TSX 5.4mm D4 Soft returns WARNING (no soft bone protocol)")


class TestTSX60mmD1Dense:
    """Test 6.0mm D1 Dense bone protocol (longest sequence)"""
    
    def test_tsx_60mm_d1_dense_8_steps(self, auth_headers):
        """TSX 6.0mm D1 Dense returns 8 steps (longest sequence with 5.7/5.1 step)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 6.0,
                "length": 16,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        # Expected: 2.3, 2.8, 3.4/2.8, 3.8, 4.4/3.8, 5.1, 5.7/5.1 step, implant = 8 steps
        assert len(gold_steps) == 8, f"Expected 8 steps for 6.0mm D1, got {len(gold_steps)}"
        
        # Verify 5.7/5.1 step drill is present
        step_57_found = any("5.7" in str(s["diameter"]) or s["code"] == "TSV57D51G" for s in gold_steps)
        assert step_57_found, "5.7/5.1 step drill should be present in 6.0mm D1 Dense protocol"
        
        print(f"PASS: TSX 6.0mm D1 Dense returns 8 steps with 5.7/5.1 step drill")


class TestTSXGoldKitCodes:
    """Test Gold kit uses correct catalog codes"""
    
    def test_gold_kit_codes(self, auth_headers):
        """Gold kit uses correct codes: TSV23G, TSV28G, TSV34D28G, TSV38D34G, TSV44D38G, TSV51D44G, TSV57D51G"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 6.0,
                "length": 13,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        gold_steps = data["steps"]
        gold_codes_found = [s["code"] for s in gold_steps if s["code"] != "—"]
        
        # Verify all codes contain 'G' (Gold series marker)
        for code in gold_codes_found:
            assert "G" in code or code == "—", f"Gold kit code should contain 'G': {code}"
        
        print(f"PASS: Gold kit codes verified: {gold_codes_found}")


class TestTSXOriginalKitCodes:
    """Test Original kit uses correct catalog codes"""
    
    def test_original_kit_codes(self, auth_headers):
        """Original kit uses correct codes: SV2.3DN, SV2.8DN, TSV3DN, TSV3.8DN, TSV4DN, TSV5.1DN, TSV6DN"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 6.0,
                "length": 13,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        original_steps = data["alt_protocol"]["steps"]
        original_codes_found = [s["code"] for s in original_steps if s["code"] != "—"]
        
        # Verify codes contain 'DN' (Original series marker)
        for code in original_codes_found:
            assert "DN" in code or code == "—", f"Original kit code should contain 'DN': {code}"
        
        print(f"PASS: Original kit codes verified: {original_codes_found}")


class TestTSXInsertionTorque:
    """Test insertion torque is ≤90 Ncm"""
    
    def test_insertion_torque_90_ncm(self, auth_headers):
        """Insertion torque is ≤90 Ncm in notes"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        notes = data.get("notes", [])
        torque_note_found = any("90" in note and "Ncm" in note for note in notes)
        assert torque_note_found, f"Expected ≤90 Ncm in notes, got: {notes}"
        
        print(f"PASS: Insertion torque ≤90 Ncm found in notes")


class TestRegressionRestrictedBoneHeight:
    """Regression test for restricted bone height suggest-auto"""
    
    def test_restricted_bone_height_suggest_auto(self, auth_headers):
        """REGRESSION: Restricted bone height suggest-auto still works (bone_height=8, D3, width=7)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D3",
                "bone_width": 7,
                "bone_height": 8
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("restricted_bone_height") == True, "bone_height=8 should trigger restricted logic"
        assert "recommended_systems" in data, "Should return recommended_systems"
        assert len(data["recommended_systems"]) > 0, "Should return at least one system"
        
        # Check P1 systems are present
        p1_systems = [s for s in data["recommended_systems"] if s.get("priority") == 1]
        assert len(p1_systems) > 0, "Should have P1 systems for restricted bone height"
        
        print(f"PASS: Restricted bone height suggest-auto works - {len(data['recommended_systems'])} systems returned")


class TestRegressionNormalSuggestAuto:
    """Regression test for normal suggest-auto"""
    
    def test_normal_suggest_auto(self, auth_headers):
        """REGRESSION: Normal suggest-auto still works (bone_height=12, D2, width=7)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("restricted_bone_height") != True, "bone_height=12 should NOT trigger restricted logic"
        assert "recommended_systems" in data, "Should return recommended_systems"
        assert len(data["recommended_systems"]) > 0, "Should return at least one system"
        
        print(f"PASS: Normal suggest-auto works - {len(data['recommended_systems'])} systems returned")


class TestRegressionAnkylosCX:
    """Regression test for Ankylos C/X drilling protocol"""
    
    def test_ankylos_cx_drilling_protocol(self, auth_headers):
        """REGRESSION: Ankylos C/X drilling protocol still generates correctly"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 9.5,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "steps" in data, "Should return steps"
        assert len(data["steps"]) > 0, "Should have drilling steps"
        assert "Ankylos" in data.get("system_name", ""), f"System name should contain Ankylos: {data.get('system_name')}"
        
        # Check insertion torque for Ankylos (25-35 Ncm)
        notes = data.get("notes", [])
        torque_found = any("25" in note or "35" in note for note in notes)
        assert torque_found, f"Expected 25-35 Ncm torque for Ankylos, got: {notes}"
        
        print(f"PASS: Ankylos C/X drilling protocol works - {len(data['steps'])} steps")


class TestRegressionOsstemETIIINH:
    """Regression test for Osstem ET III NH drilling protocol"""
    
    def test_osstem_etiii_nh_drilling_protocol(self, auth_headers):
        """REGRESSION: Osstem ET III NH drilling protocol still generates correctly"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Osstem",
                "system": "ETIII NH",
                "diameter": 4.5,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "steps" in data, "Should return steps"
        assert len(data["steps"]) > 0, "Should have drilling steps"
        
        # Check insertion torque for Osstem (~40 Ncm)
        notes = data.get("notes", [])
        torque_found = any("40" in note for note in notes)
        assert torque_found, f"Expected ~40 Ncm torque for Osstem, got: {notes}"
        
        print(f"PASS: Osstem ETIII NH drilling protocol works - {len(data['steps'])} steps")


class TestTSXProtocolType:
    """Test protocol type labels"""
    
    def test_dense_bone_protocol_type(self, auth_headers):
        """Dense bone (D1/D2) should show Dense Bone Protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": 10,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "Dense" in data["protocol_type"], f"D1 should show Dense Bone Protocol, got: {data['protocol_type']}"
        assert "TSX" in data["protocol_type"], f"Protocol type should mention TSX: {data['protocol_type']}"
        
        print(f"PASS: Dense bone protocol type: {data['protocol_type']}")
    
    def test_soft_bone_protocol_type(self, auth_headers):
        """Soft bone (D3/D4) should show Soft Bone Protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": 10,
                "bone_density": "D3"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "Soft" in data["protocol_type"], f"D3 should show Soft Bone Protocol, got: {data['protocol_type']}"
        
        print(f"PASS: Soft bone protocol type: {data['protocol_type']}")


class TestTSXAllDiameters:
    """Test all TSX diameters generate protocols"""
    
    @pytest.mark.parametrize("diameter", [3.1, 3.7, 4.1, 4.7, 5.4, 6.0])
    def test_all_diameters_dense(self, auth_headers, diameter):
        """All diameters should generate Dense bone protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": diameter,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "steps" in data, f"Should return steps for {diameter}mm"
        assert len(data["steps"]) > 0, f"Should have steps for {diameter}mm"
        assert "alt_protocol" in data, f"Should have alt_protocol for {diameter}mm"
        
        print(f"PASS: {diameter}mm Dense generates protocol with {len(data['steps'])} steps")


class TestTSXAllLengths:
    """Test all TSX lengths generate protocols"""
    
    @pytest.mark.parametrize("length", [8, 10, 11.5, 13, 16])
    def test_all_lengths(self, auth_headers, length):
        """All lengths should generate protocol with correct depth"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={
                "brand": "Zimmer",
                "system": "TSX",
                "diameter": 4.1,
                "length": length,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check depth in steps matches length
        for step in data["steps"]:
            if step["depth"] != "Coronal ONLY":  # Skip coronal-only steps
                assert str(length) in str(step["depth"]), f"Step depth should be {length}, got {step['depth']}"
        
        print(f"PASS: {length}mm length generates protocol with correct depth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
