"""
Test suite for 'Suggest Me' Auto-Suggestion Engine (POST /api/implant-library/suggest-auto)
Tests the new two-tab workflow feature: automatic implant suggestion based on clinical conditions.

Test Coverage:
- GET /api/implant-library/procedure-options
- POST /api/implant-library/suggest-auto with various clinical scenarios
- Procedure+bone type compatibility validation
- Diameter/length range calculations
- Tooth restriction filtering
- Existing endpoints still working (suggest, systems)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"


class TestAuthFixture:
    """Authentication helper for tests."""
    _token = None
    
    @classmethod
    def get_token(cls):
        if cls._token is None:
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "abhijit.patil@dental.edu", "password": "Admin@123"}
            )
            assert response.status_code == 200, f"Login failed: {response.text}"
            cls._token = response.json()["token"]
        return cls._token


@pytest.fixture(scope="module")
def auth_headers():
    """Get auth headers for authenticated requests."""
    token = TestAuthFixture.get_token()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Test 1: GET /api/implant-library/procedure-options
class TestProcedureOptions:
    """Test procedure options endpoint returns correct data."""
    
    def test_procedure_options_returns_6_procedures(self, auth_headers):
        """Verify 6 procedures returned."""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/procedure-options",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "procedures" in data
        assert len(data["procedures"]) == 6
        
        expected_procedures = [
            "Conventional Implant Placement",
            "Conventional Implant Placement with Bone Graft",
            "Immediate Implant Placement",
            "Immediate Implant Placement with Bone Graft",
            "Sinus Lift",
            "Restricted Bone Height"
        ]
        for proc in expected_procedures:
            assert proc in data["procedures"], f"Missing procedure: {proc}"
    
    def test_procedure_options_returns_4_bone_types(self, auth_headers):
        """Verify 4 bone types returned."""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/procedure-options",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "bone_types" in data
        assert data["bone_types"] == ["D1", "D2", "D3", "D4"]
    
    def test_procedure_options_returns_compatibility_dict(self, auth_headers):
        """Verify compatibility dictionary returned."""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/procedure-options",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "compatibility" in data
        compat = data["compatibility"]
        
        # Verify specific compatibilities from requirements
        assert compat["Conventional Implant Placement"]["allowedBone"] == ["D1", "D2", "D3", "D4"]
        assert compat["Immediate Implant Placement"]["allowedBone"] == ["D1", "D2", "D3"]
        assert compat["Sinus Lift"]["allowedBone"] == ["D3", "D4"]
        assert compat["Restricted Bone Height"]["allowedBone"] == ["D3", "D4"]


# Test 2-6: POST /api/implant-library/suggest-auto - various scenarios
class TestSuggestAutoEndpoint:
    """Test the auto-suggestion engine."""
    
    def test_suggest_auto_valid_data_returns_recommendations(self, auth_headers):
        """Test valid data returns recommended_systems, clinical_guidance, validation_warnings."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "tooth": "46",
                "procedures": ["Immediate Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify required response fields
        assert "recommended_systems" in data
        assert "clinical_guidance" in data
        assert "validation_warnings" in data
        
        # Verify clinical guidance structure
        guidance = data["clinical_guidance"]
        assert guidance["bone_width"] == 7
        assert guidance["bone_height"] == 12
        assert guidance["bone_type"] == "D2"
        assert "Immediate Implant Placement" in guidance["procedures"]
    
    def test_suggest_auto_sinus_lift_with_d1_returns_warning(self, auth_headers):
        """Sinus Lift with D1 should return validation warning (D1 not allowed for Sinus Lift)."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Sinus Lift"],
                "bone_type": "D1",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have warning about Sinus Lift not recommended for D1
        assert len(data["validation_warnings"]) > 0
        warning_text = " ".join(data["validation_warnings"])
        assert "Sinus Lift" in warning_text or "D1" in warning_text
    
    def test_suggest_auto_immediate_implant_with_d4_returns_warning(self, auth_headers):
        """Immediate Implant Placement with D4 returns warning (D4 not in allowed [D1,D2,D3])."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Immediate Implant Placement"],
                "bone_type": "D4",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have warning about Immediate Implant Placement not recommended for D4
        assert len(data["validation_warnings"]) > 0
        warning_text = " ".join(data["validation_warnings"])
        assert "Immediate Implant Placement" in warning_text or "D4" in warning_text
    
    def test_suggest_auto_restricted_bone_height_d3_short_implant(self, auth_headers):
        """Restricted Bone Height + D3 + height=9 returns Short implant category."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Restricted Bone Height"],
                "bone_type": "D3",
                "bone_width": 5,
                "bone_height": 9
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return Short implant category (height 8-10)
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Short implant"
        assert "8.0" in guidance["recommended_length_range"]
        assert "10.0" in guidance["recommended_length_range"]
    
    def test_suggest_auto_tooth_restrictions_excludes_nobelactive_np(self, auth_headers):
        """NobelActive NP excluded for tooth=46 (46 not in restricted_teeth [41,42,31,32,12,22])."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "tooth": "46",
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 4,  # Small width to get NP diameters
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # NobelActive NP should NOT be in recommended_systems for tooth 46
        system_names = [s["system"] for s in data["recommended_systems"]]
        assert "NobelActive NP" not in system_names, \
            f"NobelActive NP should be excluded for tooth 46, found: {system_names}"
    
    def test_suggest_auto_missing_fields_returns_400(self, auth_headers):
        """Missing required fields returns 400."""
        # Missing procedures
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 400
        
        # Missing bone_type
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 400
        
        # bone_width = 0
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 0,
                "bone_height": 12
            }
        )
        assert response.status_code == 400


# Test 7-9: Diameter and Length range calculations
class TestDiameterLengthRanges:
    """Test bone width/height to diameter/length range mappings."""
    
    def test_bone_width_4_returns_diameter_3_to_3_5(self, auth_headers):
        """bone_width=4 (<5) returns diameter range 3.0-3.5."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 4,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert "3.0" in guidance["recommended_diameter_range"]
        assert "3.5" in guidance["recommended_diameter_range"]
    
    def test_bone_height_14_returns_long_implant(self, auth_headers):
        """bone_height=14 (>=13) returns length range 11.5-15.0 (Long implant)."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 14
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Long implant"
        assert "11.5" in guidance["recommended_length_range"]
        assert "15.0" in guidance["recommended_length_range"]
    
    def test_bone_height_8_returns_short_implant(self, auth_headers):
        """bone_height=8 (>=8, <10) returns length range 8.0-10.0 (Short implant)."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D3",
                "bone_width": 6,
                "bone_height": 8
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        guidance = data["clinical_guidance"]
        assert guidance["length_category"] == "Short implant"
        assert "8.0" in guidance["recommended_length_range"]
        assert "10.0" in guidance["recommended_length_range"]


# Test 10-11: Existing endpoints still working
class TestExistingEndpoints:
    """Verify existing endpoints still work correctly."""
    
    def test_existing_suggest_endpoint_works(self, auth_headers):
        """GET /api/implant-library/suggest with tooth=46, system=Helix GM Acqua, brand=Neodent, width=7, height=12."""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/suggest",
            headers=auth_headers,
            params={
                "tooth": "46",
                "system": "Helix GM Acqua",
                "brand": "Neodent",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have recommended, all_options, clinical_guidance, tooth_recommendation
        assert "recommended" in data
        assert "tooth_recommendation" in data
        assert "clinical_guidance" in data
        assert "all_options" in data
    
    def test_existing_systems_endpoint_returns_42_systems(self, auth_headers):
        """GET /api/implant-library/systems still returns 42 systems with indications."""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 42, f"Expected 42 systems, got {len(data)}"
        
        # Verify indication field present on systems
        for system in data:
            assert "indication" in system


# Test 12: Multiple procedure selection with mixed compatibility
class TestMultipleProcedures:
    """Test multiple procedure selection scenarios."""
    
    def test_multiple_procedures_mixed_compatibility(self, auth_headers):
        """Test with multiple procedures where some are compatible and some are not."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "procedures": ["Conventional Implant Placement", "Sinus Lift"],
                "bone_type": "D1",  # Sinus Lift not allowed for D1
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have warning for Sinus Lift
        assert len(data["validation_warnings"]) > 0
        
        # valid_procedures should only have Conventional Implant Placement
        assert "Conventional Implant Placement" in data["valid_procedures"]
        # Sinus Lift should NOT be in valid_procedures
        assert "Sinus Lift" not in data["valid_procedures"]


# Test 13: Tooth recommendation included in response
class TestToothRecommendation:
    """Test tooth recommendation is included when tooth is provided."""
    
    def test_tooth_recommendation_included(self, auth_headers):
        """Verify tooth recommendation is included when tooth parameter is provided."""
        response = requests.post(
            f"{BASE_URL}/api/implant-library/suggest-auto",
            headers=auth_headers,
            json={
                "tooth": "46",
                "procedures": ["Conventional Implant Placement"],
                "bone_type": "D2",
                "bone_width": 7,
                "bone_height": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "tooth_recommendation" in data
        tooth_rec = data["tooth_recommendation"]
        assert tooth_rec is not None
        assert tooth_rec["tooth"] == "46"
        assert tooth_rec["region"] == "Mandibular 1st Molar"
    
    def test_no_tooth_recommendation_when_not_provided(self, auth_headers):
        """Verify tooth_recommendation is None when tooth is not provided."""
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
        
        assert data["tooth_recommendation"] is None
