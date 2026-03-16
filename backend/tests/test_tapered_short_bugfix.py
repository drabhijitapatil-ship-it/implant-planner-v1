"""
Test for BioHorizons Tapered Short bug fix - iteration 16
Tests the scenario where recommendation algorithm returns empty 'recommended' array
but should still show 'all_options' for user selection.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://torque-visibility.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "abhijit.patil@dental.edu"
TEST_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def auth_token():
    """Login and get auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Requests session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestTaperedShortBugfix:
    """
    Tests for the bug fix: BioHorizons Tapered Short drilling protocol was inaccessible
    because the recommendation algorithm returned 0 matches (Short implant lengths 6/7.5mm 
    don't match the algorithm's recommended 10-12mm range).
    
    Fix: When 'recommended' array is empty, UI shows 'all_options' (all available sizes).
    """

    def test_tapered_short_suggest_returns_empty_recommended_but_has_all_options(self, api_client):
        """
        CRITICAL: Verify that for Tapered Short with bone height 10mm,
        the API returns empty 'recommended' but provides 'all_options' with 4 implants.
        """
        response = api_client.get(f"{BASE_URL}/api/implant-library/suggest", params={
            "brand": "BioHorizons",
            "system": "Tapered Short",
            "bone_width": 7,
            "bone_height": 10,
            "tooth": "46"
        })
        assert response.status_code == 200, f"Suggest API failed: {response.text}"
        
        data = response.json()
        
        # CRITICAL: 'recommended' should be empty for Tapered Short
        assert "recommended" in data, "Response missing 'recommended' field"
        assert data["recommended"] == [], f"Expected empty recommended, got: {data['recommended']}"
        
        # CRITICAL: 'all_options' should contain 4 implants
        assert "all_options" in data, "Response missing 'all_options' field"
        assert len(data["all_options"]) == 4, f"Expected 4 all_options, got: {len(data['all_options'])}"
        
        # Verify the expected implant sizes (4.6x6, 4.6x7.5, 5.8x6, 5.8x7.5)
        expected_sizes = [
            (4.6, 6), (4.6, 7.5), (5.8, 6), (5.8, 7.5)
        ]
        actual_sizes = [(imp["diameter"], imp["length"]) for imp in data["all_options"]]
        for expected in expected_sizes:
            assert expected in actual_sizes, f"Missing expected size {expected}"
        
        # Verify clinical guidance is provided
        assert "clinical_guidance" in data
        assert data["clinical_guidance"]["bone_width"] == 7
        assert data["clinical_guidance"]["bone_height"] == 10

    def test_tapered_short_drilling_protocol_generation(self, api_client):
        """
        CRITICAL: Verify drilling protocol can be generated for Tapered Short implants.
        Tests with 4.6x6mm implant and D2 bone density.
        """
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Short",
            "diameter": 4.6,
            "length": 6,
            "bone_density": "D2",
            "tooth": "46"
        })
        assert response.status_code == 200, f"Drilling protocol generation failed: {response.text}"
        
        data = response.json()
        
        # Verify protocol structure
        assert data["system_name"] == "BioHorizons Tapered Short RBT"
        assert data["implant"]["brand"] == "BioHorizons"
        assert data["implant"]["system"] == "Tapered Short"
        assert data["implant"]["diameter"] == 4.6
        assert data["implant"]["length"] == 6
        assert data["bone_density"] == "D2"
        
        # Verify steps
        assert "steps" in data
        assert data["total_steps"] >= 4, f"Expected at least 4 steps, got: {data['total_steps']}"
        
        # Verify step types - Short Pilot Drill should be present
        step_types = [step["drill_type"] for step in data["steps"]]
        assert "Short Pilot Drill" in step_types, f"Missing Short Pilot Drill. Steps: {step_types}"
        assert "Implant Placement" in step_types, f"Missing Implant Placement. Steps: {step_types}"

    def test_tapered_short_all_bone_densities(self, api_client):
        """
        Verify drilling protocol works for all bone densities (D1, D2, D3, D4).
        """
        for bone_density in ["D1", "D2", "D3", "D4"]:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "BioHorizons",
                "system": "Tapered Short",
                "diameter": 5.8,
                "length": 7.5,
                "bone_density": bone_density,
                "tooth": "46"
            })
            assert response.status_code == 200, f"Protocol failed for bone {bone_density}: {response.text}"
            
            data = response.json()
            assert data["bone_density"] == bone_density
            
            # D4 should generate Reduced Protocol
            if bone_density == "D4":
                assert "Reduced" in data["protocol_type"], f"D4 should be reduced, got: {data['protocol_type']}"

    def test_tapered_short_all_implant_sizes(self, api_client):
        """
        Verify drilling protocol works for all 4 Tapered Short implant sizes.
        """
        implant_sizes = [
            (4.6, 6), (4.6, 7.5), (5.8, 6), (5.8, 7.5)
        ]
        
        for diameter, length in implant_sizes:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "BioHorizons",
                "system": "Tapered Short",
                "diameter": diameter,
                "length": length,
                "bone_density": "D2",
                "tooth": "46"
            })
            assert response.status_code == 200, f"Protocol failed for {diameter}x{length}: {response.text}"
            
            data = response.json()
            assert data["implant"]["diameter"] == diameter
            assert data["implant"]["length"] == length

    def test_tapered_pro_comparison_has_recommended_matches(self, api_client):
        """
        Comparison test: Tapered Pro with same bone measurements should return 
        non-empty 'recommended' array (since it has longer lengths like 10.5, 12mm).
        """
        response = api_client.get(f"{BASE_URL}/api/implant-library/suggest", params={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "bone_width": 7,
            "bone_height": 12,
            "tooth": "46"
        })
        assert response.status_code == 200, f"Suggest API failed: {response.text}"
        
        data = response.json()
        
        # Tapered Pro should have recommended matches
        assert "recommended" in data
        assert len(data["recommended"]) > 0, "Tapered Pro should have recommended matches"
        
        # Also has all_options
        assert "all_options" in data
        assert len(data["all_options"]) > 0

    def test_tapered_pro_drilling_protocol(self, api_client):
        """
        Comparison: Verify Tapered Pro drilling protocol works correctly.
        """
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.6,
            "length": 12,
            "bone_density": "D2",
            "tooth": "46"
        })
        assert response.status_code == 200, f"Tapered Pro protocol failed: {response.text}"
        
        data = response.json()
        assert "BioHorizons Tapered Pro" in data["system_name"], f"Unexpected system_name: {data['system_name']}"
        assert data["implant"]["system"] == "Tapered Pro"

    def test_pdf_export_tapered_short(self, api_client):
        """
        Verify PDF export works for Tapered Short.
        """
        response = api_client.post(
            f"{BASE_URL}/api/drilling-protocols/export-pdf",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Short",
                "diameter": 4.6,
                "length": 6,
                "bone_density": "D2",
                "tooth": "46"
            }
        )
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf"


class TestSystemsDropdown:
    """Test that systems dropdown correctly shows BioHorizons systems"""

    def test_systems_include_tapered_short(self, api_client):
        """Verify systems list includes BioHorizons Tapered Short"""
        response = api_client.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        
        systems = response.json()
        tapered_short = next(
            (s for s in systems if s["brand"] == "BioHorizons" and s["system"] == "Tapered Short"),
            None
        )
        assert tapered_short is not None, "BioHorizons Tapered Short not in systems list"
        
        # Verify correct count of implants
        assert tapered_short["count"] == 4, f"Expected 4 implants, got: {tapered_short['count']}"
        
        # Verify correct diameter and length ranges
        assert 4.6 in tapered_short["diameters"]
        assert 5.8 in tapered_short["diameters"]
        assert 6 in tapered_short["lengths"]
        assert 7.5 in tapered_short["lengths"]

    def test_systems_include_tapered_pro(self, api_client):
        """Verify systems list includes BioHorizons Tapered Pro"""
        response = api_client.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        
        systems = response.json()
        tapered_pro = next(
            (s for s in systems if s["brand"] == "BioHorizons" and s["system"] == "Tapered Pro"),
            None
        )
        assert tapered_pro is not None, "BioHorizons Tapered Pro not in systems list"
