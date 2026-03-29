"""
Test Suite for Restricted Bone Height Logic (≤ 10mm) - Iteration 56
Tests the suggest-auto endpoint's restricted bone height feature:
- P1 group: BioHorizons Tapered Short, BioHorizons Tapered Short Conical RBT, Bredent Copa Sky, Dentsply Sirona Ankylos C/X
- P2 group: All other systems with length ≤ 8mm
- Bone type filtering bypass
- Diameter filtering based on bone_width
- Sorting: P1 alphabetically, P2 by shortest length then alphabetically
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://surgical-case-portal.preview.emergentagent.com')

# P1 system keys (brand|system format)
P1_SYSTEMS = {
    "BioHorizons|Tapered Short",
    "BioHorizons|Tapered Short Conical RBT",
    "Bredent|Copa Sky",
    "Dentsply Sirona|Ankylos C/X",
}

# Diameter ranges based on bone_width
DIAMETER_RANGES = {
    "narrow_5mm": (3.75, 4.0),   # bone_width < 6
    "medium_6mm": (4.0, 4.5),    # bone_width < 7
    "wide_7mm": (4.5, 6.0),      # bone_width >= 7
}


class TestAuth:
    """Authentication for test suite"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "Gaurav.pandey", "password": "Student@123"}
        )
        assert response.status_code == 200, f"Auth failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }


class TestRestrictedBoneHeightBasic(TestAuth):
    """Basic restricted bone height tests"""
    
    def test_bone_height_10_triggers_restricted_logic(self, auth_headers):
        """bone_height=10 (boundary) should trigger restricted logic"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("restricted_bone_height") == True, "bone_height=10 should trigger restricted logic"
        print("PASS: bone_height=10 triggers restricted_bone_height=True")
    
    def test_bone_height_9_triggers_restricted_logic(self, auth_headers):
        """bone_height=9 should trigger restricted logic"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 9
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("restricted_bone_height") == True
        print("PASS: bone_height=9 triggers restricted_bone_height=True")
    
    def test_bone_height_11_does_not_trigger_restricted_logic(self, auth_headers):
        """bone_height=11 should NOT trigger restricted logic (normal flow)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 11
            }
        )
        assert response.status_code == 200
        data = response.json()
        # restricted_bone_height should be absent or False
        assert data.get("restricted_bone_height") != True, "bone_height=11 should NOT trigger restricted logic"
        print("PASS: bone_height=11 does NOT trigger restricted logic")
    
    def test_restricted_procedure_triggers_logic_even_with_high_bone_height(self, auth_headers):
        """Selecting 'Restricted Bone Height' procedure with bone_height > 10 still triggers restricted logic"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 15  # > 10 but procedure should trigger
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("restricted_bone_height") == True, "Restricted Bone Height procedure should trigger restricted logic"
        print("PASS: 'Restricted Bone Height' procedure triggers restricted logic even with bone_height=15")


class TestP1GroupSystems(TestAuth):
    """Tests for Priority 1 group systems"""
    
    def test_p1_contains_exactly_four_systems_wide_width(self, auth_headers):
        """P1 group should contain exactly 4 systems for wide bone_width (>=7mm)"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p1_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 1]
        p1_keys = {f"{s['brand']}|{s['system']}" for s in p1_systems}
        
        # All 4 P1 systems should be present for wide bone_width
        assert p1_keys == P1_SYSTEMS, f"Expected P1 systems {P1_SYSTEMS}, got {p1_keys}"
        print(f"PASS: P1 contains exactly 4 systems: {p1_keys}")
    
    def test_p1_systems_have_priority_1_label(self, auth_headers):
        """P1 systems should have priority=1 and correct label"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p1_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 1]
        for s in p1_systems:
            assert s["priority"] == 1
            assert s["priority_label"] == "Recommended for Restricted Bone Height"
            assert s["procedure_match"] == True
        print(f"PASS: All {len(p1_systems)} P1 systems have correct priority and labels")
    
    def test_narrow_width_filters_p1_systems(self, auth_headers):
        """Narrow bone_width (5mm) should filter out large-diameter P1 systems"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 5,  # Narrow - diameter range 3.75-4.0
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p1_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 1]
        p1_keys = {f"{s['brand']}|{s['system']}" for s in p1_systems}
        
        # BioHorizons Tapered Short starts at 4.6mm diameter - should be filtered out
        # BioHorizons Tapered Short Conical RBT starts at 4.6mm - should be filtered out
        # Bredent Copa Sky has 4.0mm option - should be included
        # Dentsply Sirona Ankylos C/X has 3.5mm option - should be included
        
        # For narrow width (5mm), diameter range is 3.75-4.0
        # Only Copa Sky (4.0mm) should appear in P1
        assert "Bredent|Copa Sky" in p1_keys, "Copa Sky should be in P1 for narrow width"
        assert "BioHorizons|Tapered Short" not in p1_keys, "Tapered Short (4.6mm+) should be filtered out"
        assert "BioHorizons|Tapered Short Conical RBT" not in p1_keys, "Tapered Short Conical RBT (4.6mm+) should be filtered out"
        
        print(f"PASS: Narrow width correctly filters P1 systems: {p1_keys}")


class TestP2GroupSystems(TestAuth):
    """Tests for Priority 2 group systems"""
    
    def test_p2_excludes_p1_systems(self, auth_headers):
        """P2 group should NOT contain any P1 systems"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p2_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 2]
        p2_keys = {f"{s['brand']}|{s['system']}" for s in p2_systems}
        
        # No P1 system should appear in P2
        overlap = p2_keys & P1_SYSTEMS
        assert len(overlap) == 0, f"P2 should not contain P1 systems, found: {overlap}"
        print(f"PASS: P2 excludes all P1 systems. P2 count: {len(p2_systems)}")
    
    def test_p2_systems_have_length_8mm_or_less(self, auth_headers):
        """P2 systems should only have implants with length <= 8mm"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p2_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 2]
        
        for s in p2_systems:
            for implant in s.get("implants", []):
                assert implant["length"] <= 8.0, f"P2 implant length should be <= 8mm, got {implant['length']} for {s['brand']}|{s['system']}"
        
        print(f"PASS: All {len(p2_systems)} P2 systems have implants with length <= 8mm")
    
    def test_p2_sorted_by_shortest_length_then_alphabetically(self, auth_headers):
        """P2 systems should be sorted by shortest length first, then alphabetically"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p2_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 2]
        
        # Calculate min_length for each P2 system
        p2_with_min_length = []
        for s in p2_systems:
            min_len = min(i["length"] for i in s.get("implants", []))
            p2_with_min_length.append({
                "brand": s["brand"],
                "system": s["system"],
                "min_length": min_len
            })
        
        # Verify sorting: by min_length, then by brand, then by system
        for i in range(len(p2_with_min_length) - 1):
            curr = p2_with_min_length[i]
            next_s = p2_with_min_length[i + 1]
            
            if curr["min_length"] < next_s["min_length"]:
                continue  # Correct order
            elif curr["min_length"] == next_s["min_length"]:
                # Same length - should be alphabetically sorted
                curr_key = (curr["brand"], curr["system"])
                next_key = (next_s["brand"], next_s["system"])
                assert curr_key <= next_key, f"P2 not alphabetically sorted: {curr_key} should come before {next_key}"
            else:
                assert False, f"P2 not sorted by length: {curr['min_length']} > {next_s['min_length']}"
        
        print(f"PASS: P2 systems correctly sorted by shortest length, then alphabetically")
    
    def test_p2_systems_have_correct_labels(self, auth_headers):
        """P2 systems should have priority=2 and correct label"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        p2_systems = [s for s in data.get("recommended_systems", []) if s.get("priority") == 2]
        for s in p2_systems:
            assert s["priority"] == 2
            assert s["priority_label"] == "Short Implant Option"
            assert s["procedure_match"] == False
        print(f"PASS: All {len(p2_systems)} P2 systems have correct priority and labels")


class TestBoneTypeBypass(TestAuth):
    """Tests for bone type filtering bypass in restricted height mode"""
    
    def test_d1_and_d4_return_same_systems_for_restricted_height(self, auth_headers):
        """D1 and D4 should return the same systems when bone_height <= 10 (bone type bypass)"""
        # Test with D1
        response_d1 = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D1",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response_d1.status_code == 200
        data_d1 = response_d1.json()
        
        # Test with D4
        response_d4 = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D4",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response_d4.status_code == 200
        data_d4 = response_d4.json()
        
        # Extract system keys
        d1_systems = {f"{s['brand']}|{s['system']}" for s in data_d1.get("recommended_systems", [])}
        d4_systems = {f"{s['brand']}|{s['system']}" for s in data_d4.get("recommended_systems", [])}
        
        assert d1_systems == d4_systems, f"D1 and D4 should return same systems. D1: {len(d1_systems)}, D4: {len(d4_systems)}"
        print(f"PASS: D1 and D4 return same {len(d1_systems)} systems (bone type bypass working)")
    
    def test_all_bone_types_return_same_p1_systems(self, auth_headers):
        """All bone types (D1, D2, D3, D4) should return same P1 systems for restricted height"""
        results = {}
        for bone_type in ["D1", "D2", "D3", "D4"]:
            response = requests.post(
                f"{BASE_URL}/api/implant-library/suggest-auto",
                headers=auth_headers,
                json={
                    "procedures": ["Conventional Implant Placement"],
                    "bone_type": bone_type,
                    "bone_width": 7,
                    "bone_height": 10
                }
            )
            assert response.status_code == 200
            data = response.json()
            p1_systems = {f"{s['brand']}|{s['system']}" for s in data.get("recommended_systems", []) if s.get("priority") == 1}
            results[bone_type] = p1_systems
        
        # All should be equal
        first_result = results["D1"]
        for bone_type, systems in results.items():
            assert systems == first_result, f"{bone_type} P1 systems differ from D1"
        
        print(f"PASS: All bone types return same P1 systems: {first_result}")


class TestDiameterFiltering(TestAuth):
    """Tests for diameter filtering based on bone_width"""
    
    def test_wide_width_diameter_range(self, auth_headers):
        """bone_width >= 7mm should use diameter range 4.5-6.0"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check clinical guidance
        guidance = data.get("clinical_guidance", {})
        assert "4.5" in guidance.get("recommended_diameter_range", ""), f"Expected 4.5-6.0 range, got {guidance.get('recommended_diameter_range')}"
        
        # Check all implants are within range
        for s in data.get("recommended_systems", []):
            for implant in s.get("implants", []):
                assert 4.5 <= implant["diameter"] <= 6.0, f"Diameter {implant['diameter']} out of range for {s['brand']}|{s['system']}"
        
        print("PASS: Wide width (7mm) uses diameter range 4.5-6.0")
    
    def test_medium_width_diameter_range(self, auth_headers):
        """bone_width 6-7mm should use diameter range 4.0-4.5"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 6,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all implants are within range
        for s in data.get("recommended_systems", []):
            for implant in s.get("implants", []):
                assert 4.0 <= implant["diameter"] <= 4.5, f"Diameter {implant['diameter']} out of range for {s['brand']}|{s['system']}"
        
        print("PASS: Medium width (6mm) uses diameter range 4.0-4.5")
    
    def test_narrow_width_diameter_range(self, auth_headers):
        """bone_width 5-6mm should use diameter range 3.75-4.0"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 5,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all implants are within range
        for s in data.get("recommended_systems", []):
            for implant in s.get("implants", []):
                assert 3.75 <= implant["diameter"] <= 4.0, f"Diameter {implant['diameter']} out of range for {s['brand']}|{s['system']}"
        
        print("PASS: Narrow width (5mm) uses diameter range 3.75-4.0")


class TestNormalFlowRegression(TestAuth):
    """Regression tests for normal suggest-auto flow (bone_height >= 11)"""
    
    def test_normal_flow_uses_bone_type_filtering(self, auth_headers):
        """Normal flow (bone_height >= 11) should use bone type filtering"""
        # D1 and D4 should return DIFFERENT systems in normal flow
        response_d1 = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D1",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response_d1.status_code == 200
        data_d1 = response_d1.json()
        
        response_d4 = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D4",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response_d4.status_code == 200
        data_d4 = response_d4.json()
        
        d1_systems = {f"{s['brand']}|{s['system']}" for s in data_d1.get("recommended_systems", [])}
        d4_systems = {f"{s['brand']}|{s['system']}" for s in data_d4.get("recommended_systems", [])}
        
        # In normal flow, D1 and D4 should have different systems due to bone type filtering
        # (unless all systems support both D1 and D4)
        assert data_d1.get("restricted_bone_height") != True, "Normal flow should not have restricted_bone_height"
        assert data_d4.get("restricted_bone_height") != True, "Normal flow should not have restricted_bone_height"
        
        print(f"PASS: Normal flow (bone_height=12) does not trigger restricted logic. D1: {len(d1_systems)} systems, D4: {len(d4_systems)} systems")
    
    def test_normal_flow_returns_systems(self, auth_headers):
        """Normal flow should return recommended systems"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 15
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        systems = data.get("recommended_systems", [])
        assert len(systems) > 0, "Normal flow should return systems"
        assert data.get("restricted_bone_height") != True
        
        print(f"PASS: Normal flow returns {len(systems)} systems")


class TestClinicalGuidance(TestAuth):
    """Tests for clinical guidance in restricted height mode"""
    
    def test_clinical_guidance_includes_restricted_info(self, auth_headers):
        """Clinical guidance should indicate restricted bone height"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        guidance = data.get("clinical_guidance", {})
        assert guidance.get("bone_height") == 10
        assert guidance.get("bone_width") == 7
        assert "Restricted" in guidance.get("length_category", ""), f"Expected 'Restricted' in length_category, got {guidance.get('length_category')}"
        
        print(f"PASS: Clinical guidance includes restricted bone height info")


class TestEdgeCases(TestAuth):
    """Edge case tests"""
    
    def test_bone_height_exactly_10_boundary(self, auth_headers):
        """bone_height=10.0 (exact boundary) should trigger restricted logic"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10.0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("restricted_bone_height") == True
        print("PASS: bone_height=10.0 triggers restricted logic")
    
    def test_bone_height_10_1_does_not_trigger(self, auth_headers):
        """bone_height=10.1 should NOT trigger restricted logic"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 10.1
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("restricted_bone_height") != True, "bone_height=10.1 should NOT trigger restricted logic"
        print("PASS: bone_height=10.1 does NOT trigger restricted logic")
    
    def test_very_narrow_width_4mm(self, auth_headers):
        """Very narrow bone_width (4mm) should use diameter range 3.0-3.5"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 4,
                "bone_height": 10
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all implants are within range 3.0-3.5
        for s in data.get("recommended_systems", []):
            for implant in s.get("implants", []):
                assert 3.0 <= implant["diameter"] <= 3.5, f"Diameter {implant['diameter']} out of range for {s['brand']}|{s['system']}"
        
        print("PASS: Very narrow width (4mm) uses diameter range 3.0-3.5")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
