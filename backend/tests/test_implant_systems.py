"""
Test: Backend API /api/implant-library/systems returns 45 implant systems
Iteration 28 - Testing implant systems dropdown functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://case-completion-lab.preview.emergentagent.com').rstrip('/')

class TestImplantSystems:
    """Tests for /api/implant-library/systems endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "gaurav.pandey@student.dental.edu",
            "password": "Student@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_implant_systems_returns_exactly_45(self, auth_token):
        """Verify /api/implant-library/systems returns exactly 45 systems"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertion - verify count
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        assert len(data) == 45, f"Expected 45 systems, got {len(data)}"
    
    def test_implant_systems_has_required_fields(self, auth_token):
        """Verify each system has brand, system, diameters, lengths, count fields"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ["brand", "system", "diameters", "lengths", "count"]
        
        for i, system in enumerate(data):
            for field in required_fields:
                assert field in system, f"System {i} missing field '{field}': {system}"
            
            # Verify diameters and lengths are lists
            assert isinstance(system["diameters"], list), f"System {i} diameters should be list"
            assert isinstance(system["lengths"], list), f"System {i} lengths should be list"
            assert len(system["diameters"]) > 0, f"System {i} should have at least one diameter"
            assert len(system["lengths"]) > 0, f"System {i} should have at least one length"
            assert system["count"] > 0, f"System {i} should have count > 0"
    
    def test_implant_systems_known_brands(self, auth_token):
        """Verify known brands are present in the response"""
        response = requests.get(
            f"{BASE_URL}/api/implant-library/systems",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        brands = [s["brand"] for s in data]
        
        # Check for known brands that should be in the system
        expected_brands = ["Alpha Bio", "Neodent", "B&B Dental", "BioHorizons"]
        for brand in expected_brands:
            assert brand in brands, f"Expected brand '{brand}' not found in response"
    
    def test_procedure_implant_plan_returns_data(self, auth_token):
        """Test /api/procedures/{id}/implant-plan endpoint"""
        procedure_id = "699fc5c1248100e8a0d87261"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "implant_plans" in data, "Response should contain implant_plans"
        assert "number_of_implants" in data, "Response should contain number_of_implants"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
