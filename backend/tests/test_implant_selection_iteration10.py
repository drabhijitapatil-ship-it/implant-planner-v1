"""
Test Implant Selection Features - Iteration 10
Testing the new FDI tooth chart and 4-step flow endpoints:
- GET /api/implant-library/tooth-recommendations - returns all 28 tooth entries
- GET /api/implant-library/tooth-recommendations/{tooth} - returns specific tooth recommendation
- GET /api/implant-library/suggest with tooth parameter - returns tooth_recommendation in response
- GET /api/implant-library/suggest without tooth parameter - backward compatibility
- GET /api/implant-library/systems - returns 18 systems
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://prosth-case-album.preview.emergentagent.com').rstrip('/')


class TestImplantSelectionEndpoints:
    """Tests for Implant Selection module API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin user
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        print(f"✓ Login successful, token obtained")
    
    # ====== TEST: GET /api/implant-library/tooth-recommendations ======
    def test_get_all_tooth_recommendations_returns_28_entries(self):
        """GET /api/implant-library/tooth-recommendations should return all 28 tooth entries"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, dict), "Response should be a dictionary"
        assert len(data) == 28, f"Expected 28 tooth entries, got {len(data)}"
        
        # Verify structure of tooth entries
        for tooth, rec in data.items():
            assert "region" in rec, f"Tooth {tooth} missing 'region'"
            assert "diameter" in rec, f"Tooth {tooth} missing 'diameter'"
            assert "length" in rec, f"Tooth {tooth} missing 'length'"
            assert isinstance(rec["diameter"], list) and len(rec["diameter"]) == 2, f"Tooth {tooth} diameter should be [min, max]"
            assert isinstance(rec["length"], list) and len(rec["length"]) == 2, f"Tooth {tooth} length should be [min, max]"
        
        print(f"✓ GET /api/implant-library/tooth-recommendations returns {len(data)} tooth entries with correct structure")
    
    def test_tooth_recommendations_contains_expected_teeth(self):
        """Verify all expected FDI teeth (11-17, 21-27, 31-37, 41-47) are present"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        assert response.status_code == 200
        
        data = response.json()
        expected_teeth = []
        for quadrant_start in [11, 21, 31, 41]:
            for i in range(7):
                expected_teeth.append(str(quadrant_start + i))
        
        for tooth in expected_teeth:
            assert tooth in data, f"Expected tooth {tooth} not found in recommendations"
        
        print(f"✓ All 28 expected FDI teeth present: 11-17, 21-27, 31-37, 41-47")
    
    # ====== TEST: GET /api/implant-library/tooth-recommendations/{tooth} ======
    def test_get_tooth_46_returns_correct_diameter_and_length(self):
        """GET /api/implant-library/tooth-recommendations/46 should return diameter [4.5, 5.0] and length [10, 12]"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations/46")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["diameter"] == [4.5, 5.0], f"Expected diameter [4.5, 5.0], got {data['diameter']}"
        assert data["length"] == [10, 12], f"Expected length [10, 12], got {data['length']}"
        assert data["region"] == "Mandibular 1st Molar", f"Expected 'Mandibular 1st Molar', got {data['region']}"
        
        print(f"✓ Tooth 46: diameter={data['diameter']}, length={data['length']}, region={data['region']}")
    
    def test_get_specific_tooth_11_returns_maxillary_central_incisor(self):
        """GET /api/implant-library/tooth-recommendations/11 should return Maxillary Central Incisor"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations/11")
        assert response.status_code == 200
        
        data = response.json()
        assert data["region"] == "Maxillary Central Incisor"
        assert data["diameter"] == [3.5, 4.3]
        assert data["length"] == [11, 13]
        print(f"✓ Tooth 11: {data['region']}")
    
    def test_get_invalid_tooth_returns_404(self):
        """GET /api/implant-library/tooth-recommendations/99 should return 404"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations/99")
        assert response.status_code == 404, f"Expected 404 for invalid tooth, got {response.status_code}"
        print(f"✓ Invalid tooth 99 returns 404 as expected")
    
    # ====== TEST: GET /api/implant-library/suggest with tooth parameter ======
    def test_suggest_with_tooth_parameter_returns_tooth_recommendation(self):
        """GET /api/implant-library/suggest with tooth parameter should return tooth_recommendation in response"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify tooth_recommendation is present
        assert "tooth_recommendation" in data, "Response should contain 'tooth_recommendation' when tooth parameter is provided"
        tooth_rec = data["tooth_recommendation"]
        
        assert tooth_rec["tooth"] == "46", f"Expected tooth '46', got {tooth_rec['tooth']}"
        assert "region" in tooth_rec, "tooth_recommendation should have 'region'"
        assert "recommended_diameter" in tooth_rec, "tooth_recommendation should have 'recommended_diameter'"
        assert "recommended_length" in tooth_rec, "tooth_recommendation should have 'recommended_length'"
        
        print(f"✓ Suggest with tooth=46: {tooth_rec}")
    
    def test_suggest_without_tooth_parameter_backward_compat(self):
        """GET /api/implant-library/suggest without tooth parameter should still work (backward compat)"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Without tooth parameter, tooth_recommendation should NOT be present
        assert "tooth_recommendation" not in data, "Without tooth parameter, response should NOT contain 'tooth_recommendation'"
        
        # Core response fields should still be present
        assert "recommended" in data, "Response should contain 'recommended'"
        assert "all_options" in data, "Response should contain 'all_options'"
        assert "clinical_guidance" in data, "Response should contain 'clinical_guidance'"
        
        print(f"✓ Suggest without tooth parameter works (backward compatible)")
    
    def test_suggest_with_tooth_11_applies_tooth_specific_ranges(self):
        """Suggest with tooth=11 should apply tooth-specific diameter/length ranges"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "11"  # Maxillary Central Incisor: diameter [3.5, 4.3], length [11, 13]
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "tooth_recommendation" in data
        
        tooth_rec = data["tooth_recommendation"]
        assert tooth_rec["region"] == "Maxillary Central Incisor"
        assert "3.5" in tooth_rec["recommended_diameter"]
        assert "4.3" in tooth_rec["recommended_diameter"]
        
        print(f"✓ Tooth 11 specific recommendation: {tooth_rec['recommended_diameter']}, {tooth_rec['recommended_length']}")
    
    # ====== TEST: GET /api/implant-library/systems ======
    def test_get_systems_returns_18_systems(self):
        """GET /api/implant-library/systems should return 18 systems"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 18, f"Expected 18 systems, got {len(data)}"
        
        # Each system should have brand and system fields
        for sys in data:
            assert "brand" in sys, "System should have 'brand'"
            assert "system" in sys, "System should have 'system'"
        
        print(f"✓ GET /api/implant-library/systems returns {len(data)} systems")
    
    def test_systems_include_expected_brands(self):
        """Verify systems include expected brands like Nobel Biocare, Straumann"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        
        data = response.json()
        brands = set(s["brand"] for s in data)
        
        # Check for at least some expected brands
        expected_brands = ["Nobel Biocare", "Straumann"]
        found_brands = [b for b in expected_brands if b in brands]
        
        assert len(found_brands) > 0, f"Expected at least one of {expected_brands} in brands, got {brands}"
        print(f"✓ Found brands: {brands}")
    
    # ====== TEST: Authentication required ======
    def test_tooth_recommendations_requires_auth(self):
        """Verify /api/implant-library/tooth-recommendations requires authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        assert response.status_code == 403, f"Expected 403 without auth, got {response.status_code}"
        print(f"✓ tooth-recommendations requires authentication (403 without)")
    
    def test_tooth_recommendation_by_id_requires_auth(self):
        """Verify /api/implant-library/tooth-recommendations/{tooth} requires authentication"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations/46")
        assert response.status_code == 403, f"Expected 403 without auth, got {response.status_code}"
        print(f"✓ tooth-recommendations/46 requires authentication (403 without)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
