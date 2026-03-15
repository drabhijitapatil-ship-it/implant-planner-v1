"""
Test suite for Implant Library Selection feature.
Tests the new implant selection module including:
- GET /api/implant-library/systems: returns list of unique brand+system pairs
- GET /api/implant-library/suggest: returns recommendations based on bone measurements
- Authentication requirements for implant-library endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://prosth-case-album.preview.emergentagent.com')

# Test credentials from requirements
TEST_CREDENTIALS = {
    "student": {"email": "gaurav.pandey@student.dental.edu", "password": "Student@123"},
    "implant_incharge": {"email": "abhijit.patil@dental.edu", "password": "Admin@123"},
    "nurse": {"email": "nurse1@dental.edu", "password": "Nurse@123"},
}


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def student_token(api_client):
    """Get student authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=TEST_CREDENTIALS["student"]
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Student authentication failed")


@pytest.fixture
def implant_incharge_token(api_client):
    """Get implant incharge authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=TEST_CREDENTIALS["implant_incharge"]
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Implant incharge authentication failed")


@pytest.fixture
def nurse_token(api_client):
    """Get nurse authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=TEST_CREDENTIALS["nurse"]
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Nurse authentication failed")


class TestImplantLibrarySystems:
    """Test GET /api/implant-library/systems endpoint"""
    
    def test_get_systems_authenticated_student(self, api_client, student_token):
        """Test that authenticated student can get implant systems"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one system"
        
        # Check structure of returned items
        for item in data:
            assert "brand" in item, "Each item should have 'brand'"
            assert "system" in item, "Each item should have 'system'"
            assert isinstance(item["brand"], str), "Brand should be string"
            assert isinstance(item["system"], str), "System should be string"
        
        print(f"PASS: GET /api/implant-library/systems returned {len(data)} systems")
    
    def test_get_systems_contains_expected_brands(self, api_client, student_token):
        """Test that systems include expected brands like Nobel Biocare, Straumann, etc."""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        brands = {item["brand"] for item in data}
        
        # Check for some expected brands from the test data
        expected_brands = ["Nobel Biocare", "Straumann", "Megagen", "Neodent"]
        found_brands = [b for b in expected_brands if b in brands]
        
        assert len(found_brands) > 0, f"Expected to find at least some of {expected_brands}, got brands: {brands}"
        print(f"PASS: Found expected brands: {found_brands}")
    
    def test_get_systems_contains_nobelactive(self, api_client, student_token):
        """Test that Nobel Biocare/NobelActive system exists"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        nobel_active = [s for s in data if s["brand"] == "Nobel Biocare" and s["system"] == "NobelActive"]
        
        assert len(nobel_active) > 0, "Nobel Biocare/NobelActive should be in the systems list"
        print("PASS: Nobel Biocare/NobelActive system found")
    
    def test_get_systems_no_auth_returns_403(self, api_client):
        """Test that unauthenticated request returns 403"""
        response = api_client.get(f"{BASE_URL}/api/implant-library/systems")
        # FastAPI HTTPBearer returns 403 when no credentials provided
        assert response.status_code == 403, f"Expected 403 for unauthenticated request, got {response.status_code}"
        print("PASS: Unauthenticated request to /systems returns 403")


class TestImplantLibrarySuggest:
    """Test GET /api/implant-library/suggest endpoint"""
    
    def test_suggest_nobel_biocare_standard_bone(self, api_client, student_token):
        """Test suggestion with Nobel Biocare/NobelActive, bone 7mm x 13mm"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 13
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check response structure
        assert "recommended" in data, "Response should have 'recommended' field"
        assert "all_options" in data, "Response should have 'all_options' field"
        assert "clinical_guidance" in data, "Response should have 'clinical_guidance' field"
        
        print(f"PASS: Suggest with Nobel Biocare/NobelActive, bone 7x13mm returned valid response")
        print(f"  Recommended implants: {len(data['recommended'])}")
        print(f"  All options: {len(data['all_options'])}")
    
    def test_suggest_small_bone_narrow_diameter(self, api_client, student_token):
        """Test that small bone (4mm x 8mm) returns narrow diameter range"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 4,
                "bone_height": 8
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clinical_guidance = data["clinical_guidance"]
        
        # For bone_width < 5, expected diameter range is 3.0-3.5mm
        assert clinical_guidance["recommended_diameter_range"] == "3.0–3.5 mm", \
            f"Small bone (4mm) should recommend narrow diameter 3.0-3.5mm, got {clinical_guidance['recommended_diameter_range']}"
        
        # For bone_height >= 8, expected length category is "Short implant"
        assert clinical_guidance["length_category"] == "Short implant", \
            f"Bone height 8mm should be 'Short implant', got {clinical_guidance['length_category']}"
        
        print(f"PASS: Small bone (4mm x 8mm) returns narrow diameter range: {clinical_guidance['recommended_diameter_range']}")
        print(f"  Length category: {clinical_guidance['length_category']}")
    
    def test_suggest_large_bone_wide_diameter(self, api_client, student_token):
        """Test that large bone (8mm x 15mm) returns wide diameter range"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 8,
                "bone_height": 15
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clinical_guidance = data["clinical_guidance"]
        
        # For bone_width >= 7, expected diameter range is 4.5-6.0mm
        assert clinical_guidance["recommended_diameter_range"] == "4.5–6.0 mm", \
            f"Large bone (8mm) should recommend wide diameter 4.5-6.0mm, got {clinical_guidance['recommended_diameter_range']}"
        
        # For bone_height >= 13, expected length category is "Long implant"
        assert clinical_guidance["length_category"] == "Long implant", \
            f"Bone height 15mm should be 'Long implant', got {clinical_guidance['length_category']}"
        
        print(f"PASS: Large bone (8mm x 15mm) returns wide diameter range: {clinical_guidance['recommended_diameter_range']}")
        print(f"  Length category: {clinical_guidance['length_category']}")
    
    def test_suggest_clinical_guidance_has_all_fields(self, api_client, student_token):
        """Test that clinical_guidance contains all expected fields"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 13
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clinical_guidance = data["clinical_guidance"]
        
        # Check all expected fields are present
        expected_fields = [
            "bone_width",
            "bone_height",
            "recommended_diameter_range",
            "recommended_length_range",
            "length_category",
            "max_implant_diameter",
            "safety_note"
        ]
        
        for field in expected_fields:
            assert field in clinical_guidance, f"clinical_guidance should have '{field}' field"
        
        # Validate field types
        assert isinstance(clinical_guidance["bone_width"], (int, float)), "bone_width should be numeric"
        assert isinstance(clinical_guidance["bone_height"], (int, float)), "bone_height should be numeric"
        assert isinstance(clinical_guidance["max_implant_diameter"], (int, float)), "max_implant_diameter should be numeric"
        assert isinstance(clinical_guidance["safety_note"], str), "safety_note should be string"
        
        # Validate bone measurements match input
        assert clinical_guidance["bone_width"] == 7, "bone_width should match input"
        assert clinical_guidance["bone_height"] == 13, "bone_height should match input"
        
        print(f"PASS: clinical_guidance has all expected fields: {list(clinical_guidance.keys())}")
    
    def test_suggest_returns_all_options_for_system(self, api_client, student_token):
        """Test that all_options returns all implants for the selected system"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 13
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        all_options = data["all_options"]
        
        assert isinstance(all_options, list), "all_options should be a list"
        assert len(all_options) > 0, "Should return at least some implant options"
        
        # Check each option has required fields and matches the requested system
        for option in all_options:
            assert "brand" in option, "Each option should have 'brand'"
            assert "system" in option, "Each option should have 'system'"
            assert "diameter" in option, "Each option should have 'diameter'"
            assert "length" in option, "Each option should have 'length'"
            assert option["brand"] == "Nobel Biocare", "All options should be for Nobel Biocare"
            assert option["system"] == "NobelActive", "All options should be for NobelActive"
        
        print(f"PASS: all_options returned {len(all_options)} implants for Nobel Biocare/NobelActive")
    
    def test_suggest_medium_bone_range(self, api_client, student_token):
        """Test medium bone measurements (5.5mm x 10mm)"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 5.5,
                "bone_height": 10
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clinical_guidance = data["clinical_guidance"]
        
        # For bone_width 5-6, expected diameter range is 3.75-4.0mm
        assert clinical_guidance["recommended_diameter_range"] == "3.75–4.0 mm", \
            f"Medium bone (5.5mm) should recommend 3.75-4.0mm diameter, got {clinical_guidance['recommended_diameter_range']}"
        
        # For bone_height 10-12, expected length category is "Standard implant"
        assert clinical_guidance["length_category"] == "Standard implant", \
            f"Bone height 10mm should be 'Standard implant', got {clinical_guidance['length_category']}"
        
        print(f"PASS: Medium bone (5.5mm x 10mm) returns correct ranges")
    
    def test_suggest_insufficient_bone_height(self, api_client, student_token):
        """Test insufficient bone height (<8mm) returns appropriate category"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 6
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        clinical_guidance = data["clinical_guidance"]
        
        assert clinical_guidance["length_category"] == "Insufficient bone height", \
            f"Bone height <8mm should be 'Insufficient bone height', got {clinical_guidance['length_category']}"
        
        print(f"PASS: Insufficient bone height (6mm) correctly identified")
    
    def test_suggest_no_auth_returns_403(self, api_client):
        """Test that unauthenticated request to suggest returns 403"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 13
            }
        )
        assert response.status_code == 403, f"Expected 403 for unauthenticated request, got {response.status_code}"
        print("PASS: Unauthenticated request to /suggest returns 403")
    
    def test_suggest_with_different_system(self, api_client, student_token):
        """Test suggestion works with different systems (Straumann/BLT if available)"""
        # First check if Straumann/BLT exists
        systems_response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        systems = systems_response.json()
        straumann_blt = [s for s in systems if s["brand"] == "Straumann" and s["system"] == "BLT"]
        
        if not straumann_blt:
            pytest.skip("Straumann/BLT system not available in database")
        
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Straumann",
                "system": "BLT",
                "bone_width": 7,
                "bone_height": 13
            },
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "recommended" in data
        assert "all_options" in data
        assert "clinical_guidance" in data
        
        # All options should be for Straumann/BLT
        for option in data["all_options"]:
            assert option["brand"] == "Straumann"
            assert option["system"] == "BLT"
        
        print(f"PASS: Suggest works with Straumann/BLT system, returned {len(data['all_options'])} options")


class TestImplantLibraryAuth:
    """Test authentication requirements for implant library endpoints"""
    
    def test_systems_accessible_by_implant_incharge(self, api_client, implant_incharge_token):
        """Test that implant incharge can access systems endpoint"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {implant_incharge_token}"}
        )
        assert response.status_code == 200
        print("PASS: Implant incharge can access /systems endpoint")
    
    def test_suggest_accessible_by_implant_incharge(self, api_client, implant_incharge_token):
        """Test that implant incharge can access suggest endpoint"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/suggest",
            params={
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "bone_width": 7,
                "bone_height": 13
            },
            headers={"Authorization": f"Bearer {implant_incharge_token}"}
        )
        assert response.status_code == 200
        print("PASS: Implant incharge can access /suggest endpoint")
    
    def test_systems_accessible_by_nurse(self, api_client, nurse_token):
        """Test that nurse can access systems endpoint"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {nurse_token}"}
        )
        # Nurses should be able to view but typically are restricted in UI
        # However, the API doesn't restrict by role - only requires auth
        assert response.status_code == 200
        print("PASS: Nurse can access /systems endpoint (API level)")
    
    def test_invalid_token_returns_401(self, api_client):
        """Test that invalid token returns 401"""
        response = api_client.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        print("PASS: Invalid token returns 401")


class TestExistingWorkflowRegression:
    """Regression test to ensure existing procedure workflow still works"""
    
    def test_login_student(self, api_client):
        """Test that student login still works"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_CREDENTIALS["student"]
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "student"
        print("PASS: Student login works")
    
    def test_login_implant_incharge(self, api_client):
        """Test that implant incharge login still works"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_CREDENTIALS["implant_incharge"]
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "implant_incharge"
        print("PASS: Implant incharge login works")
    
    def test_get_procedures_as_student(self, api_client, student_token):
        """Test that student can get procedures list"""
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Student can get procedures list")
    
    def test_get_dashboard_stats(self, api_client, student_token):
        """Test that dashboard stats endpoint works"""
        response = api_client.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "pending" in data
        assert "approved" in data
        assert "rejected" in data
        print("PASS: Dashboard stats endpoint works")
    
    def test_get_users_list(self, api_client, student_token):
        """Test that users list endpoint works"""
        response = api_client.get(
            f"{BASE_URL}/api/users?role=supervisor",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Users list endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
