"""
Test Ankylos C/X Drilling Protocol - Iteration 49
Tests the new Dentsply Sirona Ankylos C/X drilling protocol with series-based color-coded system.
Series: A=3.5mm/Red, B=4.5mm/Yellow, C=5.5mm/Blue, D=7.0mm/Green
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_CREDENTIALS = {"email": "Abhijit.patil", "password": "Admin@123"}


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
    assert response.status_code == 200, f"Login failed: {response.text}"
    # API returns 'token' field
    data = response.json()
    return data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def available_protocols(auth_headers):
    """Get available drilling protocols"""
    response = requests.get(f"{BASE_URL}/api/drilling-protocols/available", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get available protocols: {response.text}"
    return response.json()


@pytest.fixture(scope="module")
def ankylos_protocol(available_protocols):
    """Get Ankylos protocol from available protocols"""
    ankylos = next((p for p in available_protocols if p["system"] == "Ankylos C/X"), None)
    assert ankylos is not None, "Ankylos C/X not found in available protocols"
    return ankylos


class TestAnkylosAvailableProtocols:
    """Test GET /api/drilling-protocols/available for Ankylos"""
    
    def test_ankylos_in_available_protocols(self, ankylos_protocol):
        """Verify Ankylos C/X is listed in available protocols"""
        assert ankylos_protocol["brand"] == "Dentsply Sirona"
        assert ankylos_protocol["system_name"] == "Dentsply Sirona Ankylos C/X"
        print("PASS: Ankylos C/X found in available protocols")
    
    def test_ankylos_has_implant_series(self, ankylos_protocol):
        """Verify Ankylos has implant_series field with correct data"""
        assert "implant_series" in ankylos_protocol, "implant_series field missing"
        series = ankylos_protocol["implant_series"]
        assert len(series) == 4, f"Expected 4 series, got {len(series)}"
        
        # Verify each series
        series_a = next((s for s in series if s["series"] == "A"), None)
        assert series_a is not None
        assert series_a["color"] == "Red"
        assert series_a["diameter"] == 3.5
        
        series_b = next((s for s in series if s["series"] == "B"), None)
        assert series_b is not None
        assert series_b["color"] == "Yellow"
        assert series_b["diameter"] == 4.5
        
        series_c = next((s for s in series if s["series"] == "C"), None)
        assert series_c is not None
        assert series_c["color"] == "Blue"
        assert series_c["diameter"] == 5.5
        
        series_d = next((s for s in series if s["series"] == "D"), None)
        assert series_d is not None
        assert series_d["color"] == "Green"
        assert series_d["diameter"] == 7.0
        
        print("PASS: Ankylos has correct implant_series (A/Red, B/Yellow, C/Blue, D/Green)")
    
    def test_ankylos_has_size_database(self, ankylos_protocol):
        """Verify Ankylos has size_database field"""
        assert "size_database" in ankylos_protocol, "size_database field missing"
        size_db = ankylos_protocol["size_database"]
        
        # Verify lengths for each diameter
        assert "3.5" in size_db, "3.5mm diameter missing from size_database"
        assert "4.5" in size_db, "4.5mm diameter missing from size_database"
        assert "5.5" in size_db, "5.5mm diameter missing from size_database"
        assert "7.0" in size_db, "7.0mm diameter missing from size_database"
        
        print("PASS: Ankylos has size_database with all diameters")
    
    def test_ankylos_has_drill_mapping(self, ankylos_protocol):
        """Verify Ankylos has drill_mapping field"""
        assert "drill_mapping" in ankylos_protocol, "drill_mapping field missing"
        dm = ankylos_protocol["drill_mapping"]
        
        # Verify drill mapping for each diameter
        assert "3.5" in dm
        assert dm["3.5"]["series"] == "A"
        assert dm["3.5"]["color"] == "Red"
        assert dm["3.5"]["twist_drill"] == 2.9
        
        assert "4.5" in dm
        assert dm["4.5"]["series"] == "B"
        assert dm["4.5"]["color"] == "Yellow"
        assert dm["4.5"]["twist_drill"] == 3.8
        
        assert "5.5" in dm
        assert dm["5.5"]["series"] == "C"
        assert dm["5.5"]["color"] == "Blue"
        assert dm["5.5"]["twist_drill"] == 4.7
        
        assert "7.0" in dm
        assert dm["7.0"]["series"] == "D"
        assert dm["7.0"]["color"] == "Green"
        assert dm["7.0"]["twist_drill"] == 5.7
        
        print("PASS: Ankylos has correct drill_mapping")


class TestAnkylosASeriesProtocol:
    """Test A Series (3.5mm diameter, Red) protocol generation"""
    
    def test_a_series_standard_protocol(self, auth_headers):
        """Test A Series with D3 bone (standard protocol - 6 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 3.5,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify basic response structure
        assert data["system_name"] == "Dentsply Sirona Ankylos C/X"
        assert data["implant"]["diameter"] == 3.5
        assert data["bone_density"] == "D3"
        
        # Verify ankylos_info
        assert "ankylos_info" in data, "ankylos_info missing from response"
        ankylos_info = data["ankylos_info"]
        assert ankylos_info["series"] == "A"
        assert ankylos_info["color"] == "Red"
        assert ankylos_info["twist_drill"] == 2.9
        
        # Verify protocol type includes series info
        assert "A Series" in data["protocol_type"], f"Protocol type should include 'A Series': {data['protocol_type']}"
        assert "Red" in data["protocol_type"], f"Protocol type should include 'Red': {data['protocol_type']}"
        
        # Verify 6 steps for soft bone (no Tap)
        assert data["total_steps"] == 6, f"Expected 6 steps for D3 bone, got {data['total_steps']}"
        
        # Verify step sequence
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Round Drill"
        assert steps[1]["drill_type"] == "Lindemann Drill"
        assert steps[2]["drill_type"] == "Pilot Drill"
        assert "Twist Drill 2.9" in steps[3]["drill_type"], f"Expected Twist Drill 2.9, got {steps[3]['drill_type']}"
        assert "Conical Reamer A11" in steps[4]["drill_type"], f"Expected Conical Reamer A11, got {steps[4]['drill_type']}"
        assert steps[5]["drill_type"] == "Implant Placement"
        
        # Verify insertion torque
        assert "25-35 Ncm" in str(data["notes"]), "Insertion torque should be 25-35 Ncm"
        
        print("PASS: A Series (3.5mm/Red) standard protocol correct - 6 steps, Twist Drill 2.9mm")
    
    def test_a_series_dense_bone_protocol(self, auth_headers):
        """Test A Series with D1 bone (dense bone protocol - 7 steps with Tap)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 3.5,
                "length": 14,
                "bone_density": "D1",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify 7 steps for dense bone (includes Tap)
        assert data["total_steps"] == 7, f"Expected 7 steps for D1 bone, got {data['total_steps']}"
        
        # Verify Tap step is present
        steps = data["steps"]
        tap_step = next((s for s in steps if "Tap" in s["drill_type"]), None)
        assert tap_step is not None, "Tap step missing for dense bone"
        assert "Tap A" in tap_step["drill_type"], f"Tap should be series-specific: {tap_step['drill_type']}"
        
        # Verify Conical Reamer format
        reamer_step = next((s for s in steps if "Conical Reamer" in s["drill_type"]), None)
        assert reamer_step is not None
        assert "A14" in reamer_step["drill_type"], f"Conical Reamer should be A14: {reamer_step['drill_type']}"
        
        print("PASS: A Series dense bone (D1) protocol correct - 7 steps with Tap")


class TestAnkylosBSeriesProtocol:
    """Test B Series (4.5mm diameter, Yellow) protocol generation"""
    
    def test_b_series_standard_protocol(self, auth_headers):
        """Test B Series with D3 bone (standard protocol - 6 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify ankylos_info
        assert "ankylos_info" in data
        ankylos_info = data["ankylos_info"]
        assert ankylos_info["series"] == "B"
        assert ankylos_info["color"] == "Yellow"
        assert ankylos_info["twist_drill"] == 3.8
        
        # Verify protocol type includes series info
        assert "B Series" in data["protocol_type"]
        assert "Yellow" in data["protocol_type"]
        
        # Verify 6 steps for soft bone
        assert data["total_steps"] == 6
        
        # Verify Twist Drill is 3.8mm
        steps = data["steps"]
        twist_step = next((s for s in steps if "Twist Drill" in s["drill_type"]), None)
        assert twist_step is not None
        assert "3.8" in twist_step["drill_type"], f"Expected Twist Drill 3.8, got {twist_step['drill_type']}"
        
        # Verify Conical Reamer format
        reamer_step = next((s for s in steps if "Conical Reamer" in s["drill_type"]), None)
        assert "B11" in reamer_step["drill_type"], f"Conical Reamer should be B11: {reamer_step['drill_type']}"
        
        print("PASS: B Series (4.5mm/Yellow) standard protocol correct - 6 steps, Twist Drill 3.8mm")
    
    def test_b_series_dense_bone_d2(self, auth_headers):
        """Test B Series with D2 bone (dense bone protocol - 7 steps with Tap)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 9.5,
                "bone_density": "D2",
                "tooth": "46"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify 7 steps for D2 bone (includes Tap)
        assert data["total_steps"] == 7, f"Expected 7 steps for D2 bone, got {data['total_steps']}"
        
        # Verify Tap step
        steps = data["steps"]
        tap_step = next((s for s in steps if "Tap" in s["drill_type"]), None)
        assert tap_step is not None, "Tap step missing for D2 bone"
        
        print("PASS: B Series dense bone (D2) protocol correct - 7 steps with Tap")


class TestAnkylosCSeriesProtocol:
    """Test C Series (5.5mm diameter, Blue) protocol generation"""
    
    def test_c_series_standard_protocol(self, auth_headers):
        """Test C Series with D4 bone (soft bone protocol - 6 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 5.5,
                "length": 8,
                "bone_density": "D4",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify ankylos_info
        assert "ankylos_info" in data
        ankylos_info = data["ankylos_info"]
        assert ankylos_info["series"] == "C"
        assert ankylos_info["color"] == "Blue"
        assert ankylos_info["twist_drill"] == 4.7
        
        # Verify protocol type includes series info
        assert "C Series" in data["protocol_type"]
        assert "Blue" in data["protocol_type"]
        
        # Verify 6 steps for D4 bone (no Tap)
        assert data["total_steps"] == 6, f"Expected 6 steps for D4 bone, got {data['total_steps']}"
        
        # Verify Twist Drill is 4.7mm
        steps = data["steps"]
        twist_step = next((s for s in steps if "Twist Drill" in s["drill_type"]), None)
        assert "4.7" in twist_step["drill_type"], f"Expected Twist Drill 4.7, got {twist_step['drill_type']}"
        
        # Verify Conical Reamer format
        reamer_step = next((s for s in steps if "Conical Reamer" in s["drill_type"]), None)
        assert "C8" in reamer_step["drill_type"], f"Conical Reamer should be C8: {reamer_step['drill_type']}"
        
        print("PASS: C Series (5.5mm/Blue) standard protocol correct - 6 steps, Twist Drill 4.7mm")
    
    def test_c_series_dense_bone_protocol(self, auth_headers):
        """Test C Series with D1 bone (dense bone protocol - 7 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 5.5,
                "length": 11,
                "bone_density": "D1",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify 7 steps for D1 bone
        assert data["total_steps"] == 7, f"Expected 7 steps for D1 bone, got {data['total_steps']}"
        
        # Verify Tap step
        steps = data["steps"]
        tap_step = next((s for s in steps if "Tap" in s["drill_type"]), None)
        assert tap_step is not None, "Tap step missing for D1 bone"
        assert "Tap C" in tap_step["drill_type"]
        
        print("PASS: C Series dense bone (D1) protocol correct - 7 steps with Tap")


class TestAnkylosDSeriesProtocol:
    """Test D Series (7.0mm diameter, Green) protocol generation"""
    
    def test_d_series_standard_protocol(self, auth_headers):
        """Test D Series with D3 bone (standard protocol - 6 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 7.0,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify ankylos_info
        assert "ankylos_info" in data
        ankylos_info = data["ankylos_info"]
        assert ankylos_info["series"] == "D"
        assert ankylos_info["color"] == "Green"
        assert ankylos_info["twist_drill"] == 5.7
        
        # Verify protocol type includes series info
        assert "D Series" in data["protocol_type"]
        assert "Green" in data["protocol_type"]
        
        # Verify 6 steps for D3 bone
        assert data["total_steps"] == 6
        
        # Verify Twist Drill is 5.7mm
        steps = data["steps"]
        twist_step = next((s for s in steps if "Twist Drill" in s["drill_type"]), None)
        assert "5.7" in twist_step["drill_type"], f"Expected Twist Drill 5.7, got {twist_step['drill_type']}"
        
        # Verify Conical Reamer format
        reamer_step = next((s for s in steps if "Conical Reamer" in s["drill_type"]), None)
        assert "D11" in reamer_step["drill_type"], f"Conical Reamer should be D11: {reamer_step['drill_type']}"
        
        print("PASS: D Series (7.0mm/Green) standard protocol correct - 6 steps, Twist Drill 5.7mm")
    
    def test_d_series_dense_bone_protocol(self, auth_headers):
        """Test D Series with D2 bone (dense bone protocol - 7 steps)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 7.0,
                "length": 14,
                "bone_density": "D2",
                "tooth": "46"
            })
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Verify 7 steps for D2 bone
        assert data["total_steps"] == 7, f"Expected 7 steps for D2 bone, got {data['total_steps']}"
        
        # Verify Tap step
        steps = data["steps"]
        tap_step = next((s for s in steps if "Tap" in s["drill_type"]), None)
        assert tap_step is not None, "Tap step missing for D2 bone"
        assert "Tap D" in tap_step["drill_type"]
        
        print("PASS: D Series dense bone (D2) protocol correct - 7 steps with Tap")


class TestAnkylosProtocolStepSequence:
    """Test the step sequence for Ankylos protocol"""
    
    def test_step_sequence_soft_bone(self, auth_headers):
        """Verify correct step sequence for soft bone (D3/D4)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # Verify step sequence: Round Drill → Lindemann → Pilot → Twist → Conical Reamer → Implant
        expected_sequence = [
            "Round Drill",
            "Lindemann Drill",
            "Pilot Drill",
            "Twist Drill",
            "Conical Reamer",
            "Implant Placement"
        ]
        
        for i, expected in enumerate(expected_sequence):
            assert expected in steps[i]["drill_type"], f"Step {i+1} should be {expected}, got {steps[i]['drill_type']}"
        
        print("PASS: Soft bone step sequence correct (6 steps)")
    
    def test_step_sequence_dense_bone(self, auth_headers):
        """Verify correct step sequence for dense bone (D1/D2)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 11,
                "bone_density": "D1",
                "tooth": "36"
            })
        
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # Verify step sequence: Round Drill → Lindemann → Pilot → Twist → Conical Reamer → Tap → Implant
        expected_sequence = [
            "Round Drill",
            "Lindemann Drill",
            "Pilot Drill",
            "Twist Drill",
            "Conical Reamer",
            "Tap",
            "Implant Placement"
        ]
        
        for i, expected in enumerate(expected_sequence):
            assert expected in steps[i]["drill_type"], f"Step {i+1} should be {expected}, got {steps[i]['drill_type']}"
        
        print("PASS: Dense bone step sequence correct (7 steps with Tap)")


class TestAnkylosInsertionTorque:
    """Test insertion torque for Ankylos protocol"""
    
    def test_insertion_torque_25_35_ncm(self, auth_headers):
        """Verify insertion torque is 25-35 Ncm (not 35-45 Ncm)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200
        data = response.json()
        
        # Check notes for insertion torque
        notes_str = str(data["notes"])
        assert "25-35 Ncm" in notes_str, f"Insertion torque should be 25-35 Ncm, got: {notes_str}"
        assert "35-45 Ncm" not in notes_str, "Insertion torque should NOT be 35-45 Ncm"
        
        print("PASS: Insertion torque is 25-35 Ncm (correct for Ankylos)")


class TestAnkylosExportPDF:
    """Test PDF export for Ankylos protocol"""
    
    def test_export_pdf_no_error(self, auth_headers):
        """Verify PDF export doesn't error for Ankylos"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.5,
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        # Verify it returns PDF content
        assert response.headers.get("content-type") == "application/pdf" or len(response.content) > 0
        
        print("PASS: PDF export works for Ankylos protocol")


class TestAnkylosEdgeCases:
    """Test edge cases for Ankylos protocol"""
    
    def test_invalid_diameter(self, auth_headers):
        """Test with invalid diameter (not in series)"""
        response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
            headers=auth_headers,
            json={
                "brand": "Dentsply Sirona",
                "system": "Ankylos C/X",
                "diameter": 4.0,  # Invalid - not a valid Ankylos diameter
                "length": 11,
                "bone_density": "D3",
                "tooth": "36"
            })
        
        # Should return empty steps or error
        if response.status_code == 200:
            data = response.json()
            # If 200, steps should be empty for invalid diameter
            assert data["total_steps"] == 0 or "ankylos_info" not in data or data["ankylos_info"]["series"] == ""
        
        print("PASS: Invalid diameter handled correctly")
    
    def test_all_bone_densities(self, auth_headers):
        """Test all bone densities for Ankylos"""
        for bone in ["D1", "D2", "D3", "D4"]:
            response = requests.post(f"{BASE_URL}/api/drilling-protocols/generate", 
                headers=auth_headers,
                json={
                    "brand": "Dentsply Sirona",
                    "system": "Ankylos C/X",
                    "diameter": 4.5,
                    "length": 11,
                    "bone_density": bone,
                    "tooth": "36"
                })
            
            assert response.status_code == 200, f"Failed for bone density {bone}: {response.text}"
            data = response.json()
            
            if bone in ["D1", "D2"]:
                assert data["total_steps"] == 7, f"Dense bone {bone} should have 7 steps"
            else:
                assert data["total_steps"] == 6, f"Soft bone {bone} should have 6 steps"
        
        print("PASS: All bone densities (D1-D4) work correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
