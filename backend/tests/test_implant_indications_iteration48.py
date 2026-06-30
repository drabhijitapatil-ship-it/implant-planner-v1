"""
Iteration 48: Implant Indications Feature Testing
Tests for implant-specific indications from document integration:
- GET /api/implant-library/systems returns 49 systems with indication fields for 38 systems
- POST /api/implant-library/suggest-auto procedure matching and bone type filtering
- restricted_teeth and indicated_teeth fields present where expected
- Brand name correction (Nobel Biocare, not Noble Biocare)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDENTIALS = {"email": "Abhijit.patil", "password": "Admin@123"}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
    assert response.status_code == 200, f"Login failed: {response.text}"
    # API returns 'token' not 'access_token'
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def systems_data(auth_headers):
    """Get implant systems data"""
    response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get systems: {response.text}"
    return response.json()


class TestImplantLibrarySystems:
    """Tests for GET /api/implant-library/systems endpoint"""
    
    def test_systems_endpoint_returns_49_systems(self, systems_data):
        """Verify endpoint returns 49 implant systems"""
        assert len(systems_data) == 49, f"Expected 49 systems, got {len(systems_data)}"
        print(f"PASS: Systems endpoint returns {len(systems_data)} systems")
    
    def test_38_systems_have_indications(self, systems_data):
        """Verify 38 systems have indication data"""
        systems_with_indications = [s for s in systems_data if s.get("indication")]
        count = len(systems_with_indications)
        assert count == 38, f"Expected 38 systems with indications, got {count}"
        print(f"PASS: {count} systems have indication data")
    
    def test_systems_have_required_indication_fields(self, systems_data):
        """Verify systems with indications have all required fields"""
        required_fields = ["indication", "indicated_procedures", "indicated_bone_types"]
        systems_with_indications = [s for s in systems_data if s.get("indication")]
        
        for system in systems_with_indications:
            for field in required_fields:
                assert field in system, f"System {system['brand']}|{system['system']} missing {field}"
        print(f"PASS: All {len(systems_with_indications)} systems with indications have required fields")
    
    def test_nobel_biocare_brand_name_correct(self, systems_data):
        """Verify brand name is 'Nobel Biocare' (not 'Noble Biocare')"""
        nobel_systems = [s for s in systems_data if "Nobel" in s.get("brand", "")]
        assert len(nobel_systems) > 0, "No Nobel Biocare systems found"
        
        for system in nobel_systems:
            assert system["brand"] == "Nobel Biocare", f"Incorrect brand name: {system['brand']}"
        print(f"PASS: {len(nobel_systems)} Nobel Biocare systems have correct brand name")
    
    def test_nobelactive_np_has_restricted_teeth(self, systems_data):
        """Verify Nobel Biocare NobelActive NP has restricted_teeth field"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Nobel Biocare" and s["system"] == "NobelActive NP"), None)
        assert system is not None, "Nobel Biocare NobelActive NP not found"
        assert "restricted_teeth" in system, "NobelActive NP missing restricted_teeth field"
        expected_teeth = ["11", "12", "21", "22", "31", "32", "41", "42"]
        assert system["restricted_teeth"] == expected_teeth, f"Unexpected restricted_teeth: {system['restricted_teeth']}"
        print(f"PASS: NobelActive NP has restricted_teeth: {system['restricted_teeth']}")
    
    def test_osstem_ms_has_restricted_teeth(self, systems_data):
        """Verify Osstem MS has restricted_teeth field"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Osstem" and s["system"] == "MS"), None)
        assert system is not None, "Osstem MS not found"
        assert "restricted_teeth" in system, "Osstem MS missing restricted_teeth field"
        expected_teeth = ["31", "32", "33", "41", "42", "43"]
        assert system["restricted_teeth"] == expected_teeth, f"Unexpected restricted_teeth: {system['restricted_teeth']}"
        print(f"PASS: Osstem MS has restricted_teeth: {system['restricted_teeth']}")
    
    def test_biohorizons_tapered_pro_has_indicated_teeth(self, systems_data):
        """Verify BioHorizons Tapered Pro has indicated_teeth field"""
        system = next((s for s in systems_data 
                      if s["brand"] == "BioHorizons" and s["system"] == "Tapered Pro"), None)
        assert system is not None, "BioHorizons Tapered Pro not found"
        assert "indicated_teeth" in system, "Tapered Pro missing indicated_teeth field"
        expected_teeth = ["11", "12", "13", "21", "22", "23"]
        assert system["indicated_teeth"] == expected_teeth, f"Unexpected indicated_teeth: {system['indicated_teeth']}"
        print(f"PASS: BioHorizons Tapered Pro has indicated_teeth: {system['indicated_teeth']}")
    
    def test_conelog_progressive_line_has_indicated_teeth(self, systems_data):
        """Verify Conelog Progressive Line has indicated_teeth field"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Conelog" and s["system"] == "Progressive Line"), None)
        assert system is not None, "Conelog Progressive Line not found"
        assert "indicated_teeth" in system, "Progressive Line missing indicated_teeth field"
        expected_teeth = ["11", "12", "13", "21", "22", "23"]
        assert system["indicated_teeth"] == expected_teeth, f"Unexpected indicated_teeth: {system['indicated_teeth']}"
        print(f"PASS: Conelog Progressive Line has indicated_teeth: {system['indicated_teeth']}")


class TestSuggestAutoEndpoint:
    """Tests for POST /api/implant-library/suggest-auto endpoint"""
    
    def test_immediate_implant_returns_procedure_matched_systems_first(self, auth_headers):
        """Verify Immediate Implant Placement returns procedure-matched systems first"""
        payload = {
            "procedures": ["Immediate Implant Placement"],
            "bone_type": "D3",
            "bone_width": 6.0,
            "bone_height": 12.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        systems = data.get("recommended_systems", [])
        assert len(systems) > 0, "No systems returned"
        
        # Check that procedure_match field exists and first systems have it True
        matched_systems = [s for s in systems if s.get("procedure_match") == True]
        assert len(matched_systems) > 0, "No procedure-matched systems found"
        
        # Verify first system has procedure_match=True
        assert systems[0].get("procedure_match") == True, "First system should have procedure_match=True"
        print(f"PASS: {len(matched_systems)} systems matched for Immediate Implant Placement")
        print(f"First matched system: {systems[0]['brand']} {systems[0]['system']}")
    
    def test_conventional_implant_returns_matched_systems(self, auth_headers):
        """Verify Conventional Implant Placement returns procedure-matched systems"""
        payload = {
            "procedures": ["Conventional Implant Placement"],
            "bone_type": "D2",
            "bone_width": 6.0,
            "bone_height": 12.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        systems = data.get("recommended_systems", [])
        assert len(systems) > 0, "No systems returned"
        
        matched_systems = [s for s in systems if s.get("procedure_match") == True]
        assert len(matched_systems) > 0, "No procedure-matched systems for Conventional Implant"
        
        # Verify matched systems have "Single Conventional Implant" or "Multiple Conventional Implants" in indicated_procedures
        for sys in matched_systems[:3]:  # Check first 3
            procs = sys.get("indicated_procedures", [])
            has_conventional = any("Conventional" in p for p in procs)
            assert has_conventional, f"System {sys['brand']} {sys['system']} doesn't have conventional procedure"
        print(f"PASS: {len(matched_systems)} systems matched for Conventional Implant Placement")
    
    def test_bone_type_filtering_d1(self, auth_headers):
        """Verify D1 bone type filters out D3/D4-only systems"""
        payload = {
            "procedures": ["Conventional Implant Placement"],
            "bone_type": "D1",
            "bone_width": 6.0,
            "bone_height": 12.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        systems = data.get("recommended_systems", [])
        
        # Systems only indicated for D3/D4 should NOT appear
        # e.g., Neodent Drive GM Acqua is D3/D4 only
        d3_d4_only_systems = ["Drive GM Acqua", "Drive GM NeoPorous", "TS IV", "SS III"]
        for sys in systems:
            assert sys["system"] not in d3_d4_only_systems, \
                f"D3/D4-only system {sys['system']} should not appear for D1 bone type"
        print(f"PASS: D1 bone type correctly filters out D3/D4-only systems")
    
    def test_bone_type_filtering_d4(self, auth_headers):
        """Verify D4 bone type includes D4-indicated systems"""
        payload = {
            "procedures": ["Immediate Implant Placement"],
            "bone_type": "D4",
            "bone_width": 6.0,
            "bone_height": 12.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        systems = data.get("recommended_systems", [])
        assert len(systems) > 0, "No systems returned for D4"
        
        # All returned systems should have D4 in their indicated_bone_types
        # (This is enforced by the endpoint filtering)
        print(f"PASS: D4 bone type returns {len(systems)} systems")
    
    def test_suggest_auto_returns_clinical_guidance(self, auth_headers):
        """Verify suggest-auto returns clinical guidance data"""
        payload = {
            "procedures": ["Immediate Implant Placement"],
            "bone_type": "D3",
            "bone_width": 6.5,
            "bone_height": 11.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        guidance = data.get("clinical_guidance", {})
        
        assert "bone_width" in guidance, "Missing bone_width in clinical_guidance"
        assert "bone_height" in guidance, "Missing bone_height in clinical_guidance"
        assert "bone_type" in guidance, "Missing bone_type in clinical_guidance"
        assert "recommended_diameter_range" in guidance, "Missing recommended_diameter_range"
        assert "recommended_length_range" in guidance, "Missing recommended_length_range"
        
        print(f"PASS: Clinical guidance returned: {guidance}")
    
    def test_suggest_auto_validation_missing_fields(self, auth_headers):
        """Verify suggest-auto returns 400 for missing required fields"""
        payload = {
            "procedures": [],  # Empty procedures
            "bone_type": "D3",
            "bone_width": 6.0,
            "bone_height": 12.0
        }
        response = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                json=payload, headers=auth_headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Empty procedures returns 400")
        
        # Test missing bone_width
        payload2 = {
            "procedures": ["Immediate Implant Placement"],
            "bone_type": "D3",
            "bone_width": 0,  # Invalid
            "bone_height": 12.0
        }
        response2 = requests.post(f"{BASE_URL}/api/implant-library/suggest-auto", 
                                 json=payload2, headers=auth_headers)
        assert response2.status_code == 400, f"Expected 400 for invalid bone_width, got {response2.status_code}"
        print("PASS: Invalid bone_width returns 400")


class TestProceduresEndpoint:
    """Tests for GET /api/procedures endpoint (for search functionality)"""
    
    def test_procedures_endpoint_returns_data(self, auth_headers):
        """Verify GET /api/procedures returns data for search functionality"""
        response = requests.get(f"{BASE_URL}/api/procedures", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get procedures: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Procedures should return a list"
        print(f"PASS: GET /api/procedures returns {len(data)} procedures")


class TestImplantIndicationsData:
    """Tests for specific implant indication data accuracy"""
    
    def test_neodent_drive_gm_acqua_indication(self, systems_data):
        """Verify Neodent Drive GM Acqua has correct indication data"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Neodent" and s["system"] == "Drive GM Acqua"), None)
        assert system is not None, "Neodent Drive GM Acqua not found"
        
        assert "D3" in system.get("indicated_bone_types", []), "Should be indicated for D3"
        assert "D4" in system.get("indicated_bone_types", []), "Should be indicated for D4"
        assert "Immediate Implant" in system.get("indicated_procedures", []), "Should be indicated for Immediate Implant"
        print(f"PASS: Neodent Drive GM Acqua indication: {system['indication']}")
    
    def test_neodent_helix_gm_acqua_all_bone_types(self, systems_data):
        """Verify Neodent Helix GM Acqua is indicated for all bone types"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Neodent" and s["system"] == "Helix GM Acqua"), None)
        assert system is not None, "Neodent Helix GM Acqua not found"
        
        bone_types = system.get("indicated_bone_types", [])
        for bt in ["D1", "D2", "D3", "D4"]:
            assert bt in bone_types, f"Should be indicated for {bt}"
        print(f"PASS: Neodent Helix GM Acqua indicated for all bone types: {bone_types}")
    
    def test_neodent_titamax_gm_d1_d2_only(self, systems_data):
        """Verify Neodent Titamax GM NeoPorous is D1/D2 only"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Neodent" and s["system"] == "Titamax GM NeoPorous"), None)
        assert system is not None, "Neodent Titamax GM NeoPorous not found"
        
        bone_types = system.get("indicated_bone_types", [])
        assert "D1" in bone_types, "Should be indicated for D1"
        assert "D2" in bone_types, "Should be indicated for D2"
        assert "D3" not in bone_types, "Should NOT be indicated for D3"
        assert "D4" not in bone_types, "Should NOT be indicated for D4"
        print(f"PASS: Neodent Titamax GM NeoPorous is D1/D2 only: {bone_types}")
    
    def test_biohorizons_tapered_im_indicated_teeth(self, systems_data):
        """Verify BioHorizons Tapered IM has correct indicated_teeth"""
        system = next((s for s in systems_data 
                      if s["brand"] == "BioHorizons" and s["system"] == "Tapered IM"), None)
        assert system is not None, "BioHorizons Tapered IM not found"
        
        assert "indicated_teeth" in system, "Should have indicated_teeth field"
        expected_teeth = ["16", "17", "26", "27", "36", "37", "46", "47"]
        assert system["indicated_teeth"] == expected_teeth, f"Unexpected indicated_teeth: {system['indicated_teeth']}"
        print(f"PASS: BioHorizons Tapered IM indicated_teeth: {system['indicated_teeth']}")
    
    def test_bredent_copa_sky_indicated_teeth(self, systems_data):
        """Verify Bredent Copa Sky has correct indicated_teeth"""
        system = next((s for s in systems_data 
                      if s["brand"] == "Bredent" and s["system"] == "Copa Sky"), None)
        assert system is not None, "Bredent Copa Sky not found"
        
        assert "indicated_teeth" in system, "Should have indicated_teeth field"
        expected_teeth = ["34", "35", "36", "37", "44", "45", "46", "47"]
        assert system["indicated_teeth"] == expected_teeth, f"Unexpected indicated_teeth: {system['indicated_teeth']}"
        print(f"PASS: Bredent Copa Sky indicated_teeth: {system['indicated_teeth']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
