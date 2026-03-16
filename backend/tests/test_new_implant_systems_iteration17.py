"""
Test suite for verifying the 3 new implant systems added in the library update:
1. BioHorizons Tapered Pro Conical RBT (25 implants)
2. BioHorizons Tapered Short Conical RBT (3 implants)  
3. Conelog Progressive Line (17 implants)

Tests cover:
- Total systems count (45)
- New systems presence and indications
- Let Me Choose API for new systems
- Suggest Me (auto) API includes new systems
- Drilling protocol generation for Conical RBT systems
- Available protocols endpoint lists all 4 protocol-enabled systems
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-phase1.preview.emergentagent.com')


class TestAuthFixture:
    """Authentication fixture for tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }


class TestImplantSystemsCount(TestAuthFixture):
    """Verify total systems count is 45"""
    
    def test_systems_count_equals_45(self, headers):
        response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=headers)
        assert response.status_code == 200
        systems = response.json()
        assert len(systems) == 45, f"Expected 45 systems, got {len(systems)}"


class TestNewSystemsPresence(TestAuthFixture):
    """Verify all 3 new systems are present with correct data"""
    
    def test_biohorizons_tapered_pro_conical_rbt_present(self, headers):
        response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=headers)
        assert response.status_code == 200
        systems = response.json()
        
        # Find the new system
        system = next((s for s in systems if s["brand"] == "BioHorizons" and s["system"] == "Tapered Pro Conical RBT"), None)
        
        assert system is not None, "BioHorizons Tapered Pro Conical RBT not found"
        assert system["count"] == 25, f"Expected 25 implants, got {system['count']}"
        assert "Immediate Placement" in system["indication"], "Indication should mention Immediate Placement"
        assert "Laser Lock" in system["indication"], "Indication should mention Laser Lock"
    
    def test_biohorizons_tapered_short_conical_rbt_present(self, headers):
        response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=headers)
        assert response.status_code == 200
        systems = response.json()
        
        system = next((s for s in systems if s["brand"] == "BioHorizons" and s["system"] == "Tapered Short Conical RBT"), None)
        
        assert system is not None, "BioHorizons Tapered Short Conical RBT not found"
        assert system["count"] == 3, f"Expected 3 implants, got {system['count']}"
        assert "Bone height" in system["indication"], "Indication should mention Bone height"
        # Verify the 3 sizes: 4.2x7.5, 4.6x7.5, 5.2x7.5
        assert 7.5 in system["lengths"], "Should have 7.5mm length"
        assert set([4.2, 4.6, 5.2]).issubset(set(system["diameters"])), f"Missing diameters. Got: {system['diameters']}"
    
    def test_conelog_progressive_line_present(self, headers):
        response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=headers)
        assert response.status_code == 200
        systems = response.json()
        
        system = next((s for s in systems if s["brand"] == "Conelog" and s["system"] == "Progressive Line"), None)
        
        assert system is not None, "Conelog Progressive Line not found"
        # Per the update: 17 size variants but the actual count returned could vary based on implant library
        assert system["count"] >= 17, f"Expected at least 17 implants, got {system['count']}"
        assert "all bone types" in system["indication"].lower(), "Indication should mention all bone types"
        assert "D1" in system["indication"], "Indication should mention D1"
        assert "D4" in system["indication"], "Indication should mention D4"


class TestLetMeChooseNewSystems(TestAuthFixture):
    """Test Let Me Choose API returns results for new systems"""
    
    def test_let_me_choose_tapered_pro_conical_rbt(self, headers):
        """Let Me Choose should return recommended implants for Tapered Pro Conical RBT"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "BioHorizons",
                "system": "Tapered Pro Conical RBT",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        # Should have recommended implants (bone height 12 should match standard lengths)
        assert len(data.get("recommended", [])) > 0, "Should have recommended implants"
        assert len(data.get("all_options", [])) == 25, "Should have 25 total options"
        
        # Verify first recommended implant is correct brand/system
        first = data["recommended"][0]
        assert first["brand"] == "BioHorizons"
        assert first["system"] == "Tapered Pro Conical RBT"
    
    def test_let_me_choose_conelog_progressive_line(self, headers):
        """Let Me Choose should return recommended implants for Conelog Progressive Line"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Conelog",
                "system": "Progressive Line",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        assert len(data.get("recommended", [])) > 0, "Should have recommended implants"
        assert len(data.get("all_options", [])) >= 17, "Should have at least 17 total options"
        
        first = data["recommended"][0]
        assert first["brand"] == "Conelog"
        assert first["system"] == "Progressive Line"
    
    def test_let_me_choose_tapered_short_conical_rbt(self, headers):
        """Let Me Choose for Tapered Short Conical RBT - may have empty recommended due to short lengths"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "BioHorizons",
                "system": "Tapered Short Conical RBT",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        # This system only has 7.5mm length, so recommended may be empty
        # but all_options should still have the 3 implants
        assert len(data.get("all_options", [])) == 3, "Should have 3 total options"
        # Verify all options have correct brand/system
        for opt in data["all_options"]:
            assert opt["brand"] == "BioHorizons"
            assert opt["system"] == "Tapered Short Conical RBT"
            assert opt["length"] == 7.5, "All Tapered Short Conical RBT should have 7.5mm length"


class TestSuggestMeNewSystems(TestAuthFixture):
    """Test Suggest Me (auto) API includes new systems in results"""
    
    def test_suggest_me_includes_new_systems(self, headers):
        """Suggest Me should include new systems with indications in results"""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        recommended_systems = data.get("recommended_systems", [])
        system_names = [f"{s['brand']}|{s['system']}" for s in recommended_systems]
        
        # BioHorizons Tapered Pro Conical RBT should be in results (has indication)
        assert "BioHorizons|Tapered Pro Conical RBT" in system_names, \
            f"Tapered Pro Conical RBT should be in results. Got: {system_names}"
        
        # Conelog Progressive Line should be in results (has indication for all bone types)
        assert "Conelog|Progressive Line" in system_names, \
            f"Progressive Line should be in results. Got: {system_names}"


class TestDrillingProtocolsNewSystems(TestAuthFixture):
    """Test drilling protocol generation for Conical RBT systems"""
    
    def test_drilling_protocol_tapered_pro_conical_rbt(self, headers):
        """Drilling protocol should work for Tapered Pro Conical RBT"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Pro Conical RBT",
                "diameter": 4.2,
                "length": 10.5,
                "bone_density": "D2"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        assert data.get("system_name") is not None, "Should have system_name"
        assert data.get("implant") is not None, "Should have implant details"
        assert data["implant"]["brand"] == "BioHorizons"
        assert data["implant"]["system"] == "Tapered Pro Conical RBT"
        assert len(data.get("steps", [])) > 0, "Should have drilling steps"
        assert data.get("bone_density") == "D2"
    
    def test_drilling_protocol_tapered_short_conical_rbt(self, headers):
        """Drilling protocol should work for Tapered Short Conical RBT"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Short Conical RBT",
                "diameter": 4.6,
                "length": 7.5,
                "bone_density": "D2"
            },
            headers=headers
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        assert data.get("system_name") is not None, "Should have system_name"
        assert data.get("implant") is not None, "Should have implant details"
        assert data["implant"]["brand"] == "BioHorizons"
        assert data["implant"]["system"] == "Tapered Short Conical RBT"
        assert len(data.get("steps", [])) > 0, "Should have drilling steps"
    
    def test_drilling_protocol_d4_reduced_protocol(self, headers):
        """D4 bone density should use Reduced Protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Pro Conical RBT",
                "diameter": 4.2,
                "length": 10.5,
                "bone_density": "D4"
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("protocol_type") == "Reduced Protocol", \
            f"D4 should use Reduced Protocol, got: {data.get('protocol_type')}"


class TestAvailableDrillingProtocols(TestAuthFixture):
    """Test available protocols endpoint lists all protocol-enabled systems"""
    
    def test_available_protocols_lists_4_systems(self, headers):
        """Should list all 4 BioHorizons systems with protocols"""
        response = requests.get(
            f"{BASE_URL}/api/drilling-protocols/available",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 4, f"Expected 4 systems with protocols, got {len(data)}"
        
        system_names = [f"{s['brand']}|{s['system']}" for s in data]
        
        expected = [
            "BioHorizons|Tapered Pro",
            "BioHorizons|Tapered Short",
            "BioHorizons|Tapered Pro Conical RBT",
            "BioHorizons|Tapered Short Conical RBT"
        ]
        
        for exp in expected:
            assert exp in system_names, f"{exp} should be in available protocols"


class TestConicalRBTProtocolAlias(TestAuthFixture):
    """Verify Conical RBT systems use same protocol data as non-RBT counterparts"""
    
    def test_conical_rbt_uses_same_protocol_as_non_rbt(self, headers):
        """Tapered Pro Conical RBT should produce same protocol structure as Tapered Pro"""
        # Get protocol for Tapered Pro
        response_pro = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Pro",
                "diameter": 4.2,
                "length": 10.5,
                "bone_density": "D2"
            },
            headers=headers
        )
        
        # Get protocol for Tapered Pro Conical RBT
        response_rbt = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Pro Conical RBT",
                "diameter": 4.2,
                "length": 10.5,
                "bone_density": "D2"
            },
            headers=headers
        )
        
        assert response_pro.status_code == 200
        assert response_rbt.status_code == 200
        
        data_pro = response_pro.json()
        data_rbt = response_rbt.json()
        
        # Both should have same number of steps (same protocol)
        assert len(data_pro["steps"]) == len(data_rbt["steps"]), \
            "Conical RBT should have same number of steps as non-RBT"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
