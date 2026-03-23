"""
Test Implant Library API Endpoints - Iteration 11
Testing features:
- POST /api/auth/login authentication
- GET /api/implant-library/systems (returns 42 systems with brand, system, diameters, lengths)
- GET /api/implant-library/tooth-recommendations (returns 28 tooth entries)
- GET /api/implant-library/tooth-recommendations/46 (specific tooth data)
- GET /api/implant-library/suggest with various bone parameters
- Clinical guidance with length categories (Short, Standard, Long)
- Authentication required checks
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-case-builder.preview.emergentagent.com').rstrip('/')


class TestAuthEndpoint:
    """Test authentication endpoint"""
    
    def test_login_admin_user_returns_token(self):
        """POST /api/auth/login with admin credentials returns token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify token is present
        assert "token" in data, "Response should contain 'token'"
        assert isinstance(data["token"], str), "Token should be a string"
        assert len(data["token"]) > 0, "Token should not be empty"
        
        # Verify user data
        assert "user" in data, "Response should contain 'user'"
        assert data["user"]["email"] == "abhijit.patil@dental.edu", "User email mismatch"
        assert data["user"]["role"] == "implant_incharge", f"Expected role 'implant_incharge', got {data['user']['role']}"
        
        print(f"PASS: Login successful, token obtained, user role: {data['user']['role']}")


class TestImplantLibrarySystems:
    """Test GET /api/implant-library/systems endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_systems_returns_42_implant_systems(self):
        """GET /api/implant-library/systems returns 42 implant systems"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 42, f"Expected 42 systems, got {len(data)}"
        print(f"PASS: GET /api/implant-library/systems returns {len(data)} systems")
    
    def test_systems_have_required_fields(self):
        """Each system should have brand, system, diameters, lengths"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        
        data = response.json()
        
        for i, sys in enumerate(data):
            assert "brand" in sys, f"System {i} missing 'brand'"
            assert "system" in sys, f"System {i} missing 'system'"
            assert "diameters" in sys, f"System {i} missing 'diameters'"
            assert "lengths" in sys, f"System {i} missing 'lengths'"
            
            # Diameters and lengths should be lists
            assert isinstance(sys["diameters"], list), f"System {i} 'diameters' should be a list"
            assert isinstance(sys["lengths"], list), f"System {i} 'lengths' should be a list"
        
        print(f"PASS: All {len(data)} systems have brand, system, diameters, lengths fields")
    
    def test_systems_without_auth_returns_403(self):
        """GET /api/implant-library/systems without token returns 403"""
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/implant-library/systems")
        
        assert response.status_code == 403, f"Expected 403 without auth, got {response.status_code}"
        print(f"PASS: Auth required - returns 403 without token")


class TestToothRecommendations:
    """Test GET /api/implant-library/tooth-recommendations endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_tooth_recommendations_returns_28_entries(self):
        """GET /api/implant-library/tooth-recommendations returns 28 tooth entries"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, dict), "Response should be a dictionary"
        assert len(data) == 28, f"Expected 28 tooth entries, got {len(data)}"
        print(f"PASS: GET /api/implant-library/tooth-recommendations returns {len(data)} entries")
    
    def test_tooth_recommendations_structure(self):
        """Each tooth entry should have region, diameter range, length range"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations")
        assert response.status_code == 200
        
        data = response.json()
        
        for tooth, rec in data.items():
            assert "region" in rec, f"Tooth {tooth} missing 'region'"
            assert "diameter" in rec, f"Tooth {tooth} missing 'diameter'"
            assert "length" in rec, f"Tooth {tooth} missing 'length'"
            
            # diameter and length should be [min, max] arrays
            assert isinstance(rec["diameter"], list) and len(rec["diameter"]) == 2, \
                f"Tooth {tooth} diameter should be [min, max]"
            assert isinstance(rec["length"], list) and len(rec["length"]) == 2, \
                f"Tooth {tooth} length should be [min, max]"
        
        print(f"PASS: All {len(data)} tooth entries have region, diameter range, length range")
    
    def test_tooth_46_returns_mandibular_1st_molar_data(self):
        """GET /api/implant-library/tooth-recommendations/46 returns Mandibular 1st Molar data"""
        response = self.session.get(f"{BASE_URL}/api/implant-library/tooth-recommendations/46")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["region"] == "Mandibular 1st Molar", f"Expected 'Mandibular 1st Molar', got {data['region']}"
        assert data["diameter"] == [4.5, 5.0], f"Expected diameter [4.5, 5.0], got {data['diameter']}"
        assert data["length"] == [10, 12], f"Expected length [10, 12], got {data['length']}"
        
        print(f"PASS: Tooth 46 - region: {data['region']}, diameter: {data['diameter']}, length: {data['length']}")


class TestSuggestEndpoint:
    """Test GET /api/implant-library/suggest endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
        )
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_suggest_neodent_helix_returns_recommended_implants(self):
        """GET /api/implant-library/suggest with Neodent Helix GM Acqua returns implant recommendations"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "recommended" in data, "Response should contain 'recommended'"
        assert "all_options" in data, "Response should contain 'all_options'"
        assert "clinical_guidance" in data, "Response should contain 'clinical_guidance'"
        assert "tooth_recommendation" in data, "Response should contain 'tooth_recommendation'"
        
        # Verify all_options contains implant data
        assert isinstance(data["all_options"], list), "'all_options' should be a list"
        assert len(data["all_options"]) > 0, "'all_options' should not be empty"
        
        print(f"PASS: Suggest returns {len(data['recommended'])} recommended, {len(data['all_options'])} all options")
    
    def test_suggest_returns_clinical_guidance_with_correct_fields(self):
        """Suggest endpoint returns clinical_guidance with required fields"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        guidance = data["clinical_guidance"]
        
        # Check all required fields
        assert "recommended_diameter_range" in guidance, "Missing 'recommended_diameter_range'"
        assert "recommended_length_range" in guidance, "Missing 'recommended_length_range'"
        assert "length_category" in guidance, "Missing 'length_category'"
        assert "safety_note" in guidance, "Missing 'safety_note'"
        
        print(f"PASS: Clinical guidance contains: diameter_range, length_range, length_category, safety_note")
        print(f"  - diameter_range: {guidance['recommended_diameter_range']}")
        print(f"  - length_range: {guidance['recommended_length_range']}")
        print(f"  - length_category: {guidance['length_category']}")
    
    def test_suggest_returns_tooth_recommendation_when_tooth_provided(self):
        """Suggest with tooth parameter returns tooth_recommendation"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "tooth_recommendation" in data, "Response should contain 'tooth_recommendation'"
        
        tooth_rec = data["tooth_recommendation"]
        assert tooth_rec["tooth"] == "46", f"Expected tooth '46', got {tooth_rec['tooth']}"
        assert tooth_rec["region"] == "Mandibular 1st Molar", f"Expected 'Mandibular 1st Molar', got {tooth_rec['region']}"
        assert "recommended_diameter" in tooth_rec
        assert "recommended_length" in tooth_rec
        
        print(f"PASS: tooth_recommendation contains: {tooth_rec}")
    
    def test_suggest_short_implant_category_bone_height_8(self):
        """GET /api/implant-library/suggest with width=4&height=8 returns Short implant category"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 4,
                "bone_height": 8,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Short implant", \
            f"Expected 'Short implant', got {guidance['length_category']}"
        
        print(f"PASS: bone_height=8 returns length_category='Short implant'")
    
    def test_suggest_long_implant_category_bone_height_14(self):
        """GET /api/implant-library/suggest with width=7&height=14 returns Long implant category"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 14,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Long implant", \
            f"Expected 'Long implant', got {guidance['length_category']}"
        
        print(f"PASS: bone_height=14 returns length_category='Long implant'")
    
    def test_suggest_standard_implant_category_bone_height_12(self):
        """Verify Standard implant category for bone_height 10-12"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Standard implant", \
            f"Expected 'Standard implant', got {guidance['length_category']}"
        
        print(f"PASS: bone_height=12 returns length_category='Standard implant'")
    
    def test_suggest_returns_all_options_for_selected_system(self):
        """Suggest returns all_options array with all sizes for selected system"""
        response = self.session.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "bone_width": 7,
                "bone_height": 12,
                "tooth": "46"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        all_options = data["all_options"]
        assert isinstance(all_options, list), "'all_options' should be a list"
        assert len(all_options) > 0, "'all_options' should contain at least 1 implant"
        
        # Verify all options are from the same brand/system
        for opt in all_options:
            assert opt["brand"] == "Neodent", f"Expected brand 'Neodent', got {opt['brand']}"
            assert opt["system"] == "Helix GM Acqua", f"Expected system 'Helix GM Acqua', got {opt['system']}"
        
        print(f"PASS: all_options contains {len(all_options)} implants for Neodent Helix GM Acqua")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
