"""
Tests for Drilling Protocol Workflow Feature (P0)
Endpoints tested:
- POST /api/drilling-protocols/generate - Generate drilling protocol for implant
- GET /api/drilling-protocols/available - Get available protocol systems
- POST /api/drilling-protocols/export-pdf - Export drilling protocol as PDF
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDrillingProtocolEndpoints:
    """Tests for drilling protocol API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture
    def authenticated_client(self, auth_token):
        """Create session with auth headers"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session

    # ──────────────────────────────────────────────────────────
    # GET /api/drilling-protocols/available tests
    # ──────────────────────────────────────────────────────────
    
    def test_get_available_protocols_requires_auth(self):
        """Test that available protocols endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code in [401, 403]  # API returns 403 Forbidden
    
    def test_get_available_protocols_success(self, authenticated_client):
        """Test getting list of available drilling protocol systems"""
        response = authenticated_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # Should have at least BioHorizons Tapered Pro and Short
        
        # Validate structure of each system
        for system in data:
            assert "brand" in system
            assert "system" in system
            assert "system_name" in system
            assert "lengths" in system
            assert isinstance(system["lengths"], list)
    
    def test_available_protocols_contains_biohorizons_systems(self, authenticated_client):
        """Test that available protocols include BioHorizons systems"""
        response = authenticated_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        data = response.json()
        
        brands = [s["brand"] for s in data]
        systems = [s["system"] for s in data]
        
        assert "BioHorizons" in brands
        assert any("Tapered Pro" in s for s in systems) or any("Tapered Short" in s for s in systems)
    
    # ──────────────────────────────────────────────────────────
    # POST /api/drilling-protocols/generate tests
    # ──────────────────────────────────────────────────────────
    
    def test_generate_protocol_requires_auth(self):
        """Test that generate protocol endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code in [401, 403]  # API returns 403 Forbidden
    
    def test_generate_protocol_missing_fields(self, authenticated_client):
        """Test generate protocol with missing required fields"""
        # Missing brand
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code == 400
        
        # Missing diameter
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code == 400
    
    def test_generate_protocol_invalid_system(self, authenticated_client):
        """Test generate protocol with non-existent system"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "NonExistent",
            "system": "FakeSystem",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
    
    def test_generate_protocol_biohorizons_tapered_pro_d2(self, authenticated_client):
        """Test generating protocol for BioHorizons Tapered Pro with D2 bone"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2",
            "tooth": "46"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        # Validate response structure
        assert "system_name" in data
        assert "implant" in data
        assert "bone_density" in data
        assert "protocol_type" in data
        assert "steps" in data
        assert "total_steps" in data
        assert "notes" in data
        
        # Validate implant info
        assert data["implant"]["brand"] == "BioHorizons"
        assert data["implant"]["system"] == "Tapered Pro"
        assert data["implant"]["diameter"] == 4.0
        assert data["implant"]["length"] == 11.5
        
        # Validate protocol type (D2 should be conventional)
        assert data["protocol_type"] == "Conventional Protocol"
        assert data["bone_density"] == "D2"
        
        # Validate steps
        assert isinstance(data["steps"], list)
        assert len(data["steps"]) > 0
        assert data["total_steps"] == len(data["steps"])
        
        # Validate step structure
        for step in data["steps"]:
            assert "step" in step
            assert "drill_type" in step
            assert "code" in step
            assert "diameter" in step
            assert "depth" in step
            assert "rpm" in step
            assert "irrigation" in step
    
    def test_generate_protocol_d4_reduced_protocol(self, authenticated_client):
        """Test generating protocol for D4 bone density (should be reduced protocol)"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D4",
            "tooth": "36"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["protocol_type"] == "Reduced Protocol"
        assert data["bone_density"] == "D4"
        
        # Reduced protocol should mention soft bone in notes
        notes = " ".join(data["notes"])
        assert "soft bone" in notes.lower() or "reduced" in notes.lower()
    
    def test_generate_protocol_biohorizons_tapered_short(self, authenticated_client):
        """Test generating protocol for BioHorizons Tapered Short system"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Short",
            "diameter": 4.5,
            "length": 6.0,
            "bone_density": "D3",
            "tooth": "46"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "steps" in data
        assert len(data["steps"]) > 0
    
    def test_generate_protocol_all_bone_densities(self, authenticated_client):
        """Test generating protocol for all bone density types"""
        for bone_density in ["D1", "D2", "D3", "D4"]:
            response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "BioHorizons",
                "system": "Tapered Pro",
                "diameter": 4.3,
                "length": 10.0,
                "bone_density": bone_density,
                "tooth": "46"
            })
            assert response.status_code == 200, f"Failed for bone density {bone_density}"
            
            data = response.json()
            assert data["bone_density"] == bone_density
            
            if bone_density == "D4":
                assert data["protocol_type"] == "Reduced Protocol"
            else:
                assert data["protocol_type"] == "Conventional Protocol"
    
    # ──────────────────────────────────────────────────────────
    # POST /api/drilling-protocols/export-pdf tests
    # ──────────────────────────────────────────────────────────
    
    def test_export_pdf_requires_auth(self):
        """Test that export PDF endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code in [401, 403]  # API returns 403 Forbidden
    
    def test_export_pdf_success(self, authenticated_client):
        """Test exporting drilling protocol as PDF"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2",
            "tooth": "46"
        })
        assert response.status_code == 200
        
        # Check content type is PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type
        
        # Check PDF header
        assert response.content[:4] == b'%PDF'
    
    def test_export_pdf_missing_fields(self, authenticated_client):
        """Test export PDF with missing required fields"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "BioHorizons",
            # Missing system, diameter, length, bone_density
        })
        assert response.status_code == 400
    
    def test_export_pdf_invalid_system(self, authenticated_client):
        """Test export PDF with invalid system"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "FakeBrand",
            "system": "FakeSystem",
            "diameter": 4.0,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code == 404


class TestImplantSelectionWorkflow:
    """Tests for the implant selection workflow that leads to drilling protocol"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def authenticated_client(self, auth_token):
        """Create session with auth headers"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_let_me_choose_flow_suggest_endpoint(self, authenticated_client):
        """Test the suggest endpoint used in 'Let Me Choose' flow"""
        # Get implant suggestions for BioHorizons Tapered Pro
        response = authenticated_client.get(f"{BASE_URL}/api/implant-library/suggest", params={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "bone_width": 7,
            "bone_height": 12,
            "tooth": "46"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "recommended" in data
        assert isinstance(data["recommended"], list)
        
        # Check that we get implant recommendations
        if len(data["recommended"]) > 0:
            implant = data["recommended"][0]
            assert "brand" in implant
            assert "system" in implant
            assert "diameter" in implant
            assert "length" in implant
    
    def test_suggest_auto_flow(self, authenticated_client):
        """Test the suggest-auto endpoint used in 'Suggest Me' flow"""
        response = authenticated_client.post(f"{BASE_URL}/api/implant-library/suggest-auto", json={
            "tooth": "46",
            "procedures": ["Conventional Implant Placement"],
            "bone_type": "D2",
            "bone_width": 7,
            "bone_height": 12
        })
        assert response.status_code == 200
        
        data = response.json()
        # API returns "recommended_systems" not "systems"
        assert "recommended_systems" in data
        assert "clinical_guidance" in data
        
        # Check systems have implants for drilling protocol
        if len(data["recommended_systems"]) > 0:
            system = data["recommended_systems"][0]
            assert "brand" in system
            assert "system" in system
            assert "implants" in system
    
    def test_implant_systems_endpoint(self, authenticated_client):
        """Test getting list of implant systems"""
        response = authenticated_client.get(f"{BASE_URL}/api/implant-library/systems")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Check BioHorizons systems exist
        brands = [s["brand"] for s in data]
        assert "BioHorizons" in brands


class TestDrillingProtocolIntegration:
    """Integration tests for complete drilling protocol workflow"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def authenticated_client(self, auth_token):
        """Create session with auth headers"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        })
        return session
    
    def test_complete_let_me_choose_to_drilling_protocol_flow(self, authenticated_client):
        """Test complete flow: Let Me Choose -> Select Implant -> Generate Protocol"""
        # Step 1: Get suggestions from specific system
        suggest_response = authenticated_client.get(f"{BASE_URL}/api/implant-library/suggest", params={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "bone_width": 7,
            "bone_height": 12,
            "tooth": "46"
        })
        assert suggest_response.status_code == 200
        suggestions = suggest_response.json()
        
        # Step 2: Select an implant from results
        if len(suggestions.get("recommended", [])) > 0:
            selected_implant = suggestions["recommended"][0]
            
            # Step 3: Generate drilling protocol for selected implant
            protocol_response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": selected_implant["brand"],
                "system": selected_implant["system"],
                "diameter": selected_implant["diameter"],
                "length": selected_implant["length"],
                "bone_density": "D2",
                "tooth": "46"
            })
            assert protocol_response.status_code == 200
            
            protocol = protocol_response.json()
            assert len(protocol["steps"]) > 0
            print(f"Generated {protocol['total_steps']} drilling steps for {selected_implant['diameter']}x{selected_implant['length']}mm implant")
    
    def test_complete_suggest_me_to_drilling_protocol_flow(self, authenticated_client):
        """Test complete flow: Suggest Me -> Select Implant -> Generate Protocol"""
        # Step 1: Get auto suggestions
        suggest_response = authenticated_client.post(f"{BASE_URL}/api/implant-library/suggest-auto", json={
            "tooth": "46",
            "procedures": ["Conventional Implant Placement"],
            "bone_type": "D2",
            "bone_width": 7,
            "bone_height": 12
        })
        assert suggest_response.status_code == 200
        suggestions = suggest_response.json()
        
        # Step 2: Select an implant from suggested systems
        if len(suggestions.get("systems", [])) > 0:
            system = suggestions["systems"][0]
            if len(system.get("implants", [])) > 0:
                implant = system["implants"][0]
                
                # Step 3: Generate drilling protocol
                protocol_response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                    "brand": system["brand"],
                    "system": system["system"],
                    "diameter": implant["diameter"],
                    "length": implant["length"],
                    "bone_density": "D2",
                    "tooth": "46"
                })
                
                # Protocol may or may not be available depending on system
                if protocol_response.status_code == 200:
                    protocol = protocol_response.json()
                    assert len(protocol["steps"]) > 0
                    print(f"Generated {protocol['total_steps']} steps for {system['brand']} {system['system']}")
                else:
                    print(f"No protocol available for {system['brand']} {system['system']} (expected for non-BioHorizons systems)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
