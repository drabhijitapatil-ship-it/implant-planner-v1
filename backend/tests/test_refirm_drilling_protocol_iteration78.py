"""
Test Refirm R Series Drilling Protocol - Iteration 78
Tests the new Refirm R Series implant system with 31 variants and bone-density-specific drilling protocols.

Key Rules:
1. All drills go to implant length, CSK always 4-5mm crestal only
2. D1 = full sequence, D2 = replace last drill with CSK, D3 = drop last drill, D4 = drop 2 drills
3. Ø5.5 is special: D1/D2 both get mandatory CSK Ø5.3, D3 gets full drills without CSK, D4 drops 1 drill
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestRefirmImplantLibrary:
    """Test Refirm R Series presence in implant library."""

    def test_refirm_in_systems_list(self, auth_headers):
        """Verify Refirm R Series is in implant library with 31 variants and 6 diameters."""
        response = requests.get(f"{BASE_URL}/api/implant-library/systems", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        refirm = [s for s in data if s.get("brand") == "Refirm" and s.get("system") == "R Series"]
        
        assert len(refirm) == 1, "Refirm R Series should be in systems list"
        refirm_system = refirm[0]
        
        # Verify 31 variants
        assert refirm_system.get("count") == 31, f"Expected 31 variants, got {refirm_system.get('count')}"
        
        # Verify 6 diameters
        expected_diameters = [3.2, 3.5, 4.0, 4.5, 5.0, 5.5]
        actual_diameters = refirm_system.get("diameters", [])
        assert actual_diameters == expected_diameters, f"Expected diameters {expected_diameters}, got {actual_diameters}"

    def test_refirm_in_drilling_protocols_available(self, auth_headers):
        """Verify Refirm R Series is in available drilling protocols."""
        response = requests.get(f"{BASE_URL}/api/drilling-protocols/available", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        refirm = [s for s in data if s.get("brand") == "Refirm" and s.get("system") == "R Series"]
        
        assert len(refirm) == 1, "Refirm R Series should be in available drilling protocols"
        assert refirm[0].get("system_name") == "Refirm R Series"


class TestRefirmDrillingProtocol32mm:
    """Test Refirm R Series Ø3.2mm drilling protocols for all bone densities."""

    def test_32mm_d1_protocol(self, auth_headers):
        """Ø3.2×11.5mm D1: 4 steps (Lance 2.0, Cylindrical 2.5, Taper 2.9, Implant Placement)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 3.2, "length": 11.5, "bone_density": "D1"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 4, f"D1 should have 4 steps, got {len(steps)}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Lance Drill" and steps[0]["diameter"] == 2.0
        assert steps[1]["drill_type"] == "Cylindrical Drill" and steps[1]["diameter"] == 2.5
        assert steps[2]["drill_type"] == "Taper Drill" and steps[2]["diameter"] == 2.9
        assert steps[3]["drill_type"] == "Implant Placement" and steps[3]["diameter"] == 3.2
        
        # Verify RPM values
        assert "1200-1500" in steps[0]["rpm"], f"Lance drill should use 1200-1500 RPM, got {steps[0]['rpm']}"
        assert "1200-1500" in steps[1]["rpm"], f"Cylindrical drill should use 1200-1500 RPM, got {steps[1]['rpm']}"
        assert "800-1000" in steps[2]["rpm"], f"Taper drill should use 800-1000 RPM, got {steps[2]['rpm']}"
        assert "20-30" in steps[3]["rpm"], f"Implant placement should use 20-30 RPM, got {steps[3]['rpm']}"
        
        # Verify insertion torque in notes
        notes = data.get("notes", [])
        torque_note = [n for n in notes if "35-45" in n]
        assert len(torque_note) > 0, f"Insertion torque 35-45 Ncm should be in notes: {notes}"

    def test_32mm_d2_protocol(self, auth_headers):
        """Ø3.2×11.5mm D2: 4 steps (Lance 2.0, Cylindrical 2.5, CSK 3.2, Implant Placement)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 3.2, "length": 11.5, "bone_density": "D2"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 4, f"D2 should have 4 steps, got {len(steps)}"
        
        # Verify step sequence - D2 replaces last drill with CSK
        assert steps[0]["drill_type"] == "Lance Drill" and steps[0]["diameter"] == 2.0
        assert steps[1]["drill_type"] == "Cylindrical Drill" and steps[1]["diameter"] == 2.5
        assert "Countersink" in steps[2]["drill_type"] and steps[2]["diameter"] == 3.2
        assert steps[3]["drill_type"] == "Implant Placement" and steps[3]["diameter"] == 3.2
        
        # Verify CSK RPM
        assert "600-800" in steps[2]["rpm"], f"CSK should use 600-800 RPM, got {steps[2]['rpm']}"

    def test_32mm_d3_protocol(self, auth_headers):
        """Ø3.2×11.5mm D3: 3 steps (Lance 2.0, Cylindrical 2.5, Implant Placement)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 3.2, "length": 11.5, "bone_density": "D3"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 3, f"D3 should have 3 steps, got {len(steps)}"
        
        # Verify step sequence - D3 drops last drill
        assert steps[0]["drill_type"] == "Lance Drill" and steps[0]["diameter"] == 2.0
        assert steps[1]["drill_type"] == "Cylindrical Drill" and steps[1]["diameter"] == 2.5
        assert steps[2]["drill_type"] == "Implant Placement" and steps[2]["diameter"] == 3.2

    def test_32mm_d4_protocol(self, auth_headers):
        """Ø3.2×11.5mm D4: 2 steps (Lance 2.0, Implant Placement)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 3.2, "length": 11.5, "bone_density": "D4"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 2, f"D4 should have 2 steps, got {len(steps)}"
        
        # Verify step sequence - D4 drops 2 drills
        assert steps[0]["drill_type"] == "Lance Drill" and steps[0]["diameter"] == 2.0
        assert steps[1]["drill_type"] == "Implant Placement" and steps[1]["diameter"] == 3.2


class TestRefirmDrillingProtocol40mm:
    """Test Refirm R Series Ø4.0mm drilling protocols."""

    def test_40mm_d1_protocol(self, auth_headers):
        """Ø4.0×11.5mm D1: 6 steps (2.0, 2.5, 2.9, 3.4, 3.9, Implant)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D1"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 6, f"D1 should have 6 steps, got {len(steps)}"
        
        # Verify drill sequence
        expected_diameters = [2.0, 2.5, 2.9, 3.4, 3.9, 4.0]
        actual_diameters = [s["diameter"] for s in steps]
        assert actual_diameters == expected_diameters, f"Expected {expected_diameters}, got {actual_diameters}"
        
        # Verify last step is implant placement
        assert steps[-1]["drill_type"] == "Implant Placement"

    def test_40mm_d2_protocol(self, auth_headers):
        """Ø4.0×11.5mm D2: 6 steps (2.0, 2.5, 2.9, 3.4, CSK 3.7, Implant)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D2"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 6, f"D2 should have 6 steps, got {len(steps)}"
        
        # Verify CSK is present with diameter 3.7
        csk_step = [s for s in steps if "Countersink" in s["drill_type"]]
        assert len(csk_step) == 1, "D2 should have one CSK step"
        assert csk_step[0]["diameter"] == 3.7, f"CSK diameter should be 3.7, got {csk_step[0]['diameter']}"


class TestRefirmDrillingProtocol50mm:
    """Test Refirm R Series Ø5.0mm drilling protocols."""

    def test_50mm_d1_protocol(self, auth_headers):
        """Ø5.0×13mm D1: 8 steps (2.0, 2.5, 2.9, 3.4, 3.9, 4.4, 4.9, Implant)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.0, "length": 13, "bone_density": "D1"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 8, f"D1 should have 8 steps, got {len(steps)}"
        
        # Verify drill sequence
        expected_diameters = [2.0, 2.5, 2.9, 3.4, 3.9, 4.4, 4.9, 5.0]
        actual_diameters = [s["diameter"] for s in steps]
        assert actual_diameters == expected_diameters, f"Expected {expected_diameters}, got {actual_diameters}"

    def test_50mm_d4_protocol(self, auth_headers):
        """Ø5.0×13mm D4: 6 steps (2.0, 2.5, 2.9, 3.4, 3.9, Implant)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.0, "length": 13, "bone_density": "D4"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # D4 drops 2 drills from full sequence
        assert len(steps) == 6, f"D4 should have 6 steps, got {len(steps)}"
        
        # Verify drill sequence (drops 4.4 and 4.9)
        expected_diameters = [2.0, 2.5, 2.9, 3.4, 3.9, 5.0]
        actual_diameters = [s["diameter"] for s in steps]
        assert actual_diameters == expected_diameters, f"Expected {expected_diameters}, got {actual_diameters}"


class TestRefirmDrillingProtocol55mm:
    """Test Refirm R Series Ø5.5mm SPECIAL CASE drilling protocols."""

    def test_55mm_d1_protocol_mandatory_csk(self, auth_headers):
        """Ø5.5×11.5mm D1: 9 steps with MANDATORY CSK Ø5.3."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.5, "length": 11.5, "bone_density": "D1"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 9, f"D1 Ø5.5 should have 9 steps, got {len(steps)}"
        
        # Verify CSK is present with diameter 5.3
        csk_steps = [s for s in steps if "Countersink" in s["drill_type"]]
        assert len(csk_steps) == 1, "D1 Ø5.5 should have MANDATORY CSK"
        assert csk_steps[0]["diameter"] == 5.3, f"CSK diameter should be 5.3, got {csk_steps[0]['diameter']}"
        
        # Verify MANDATORY note
        assert "MANDATORY" in csk_steps[0].get("note", ""), "CSK should have MANDATORY note"

    def test_55mm_d2_protocol_mandatory_csk(self, auth_headers):
        """Ø5.5×11.5mm D2: 9 steps same as D1 - MANDATORY CSK."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.5, "length": 11.5, "bone_density": "D2"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 9, f"D2 Ø5.5 should have 9 steps (same as D1), got {len(steps)}"
        
        # Verify CSK is present with diameter 5.3
        csk_steps = [s for s in steps if "Countersink" in s["drill_type"]]
        assert len(csk_steps) == 1, "D2 Ø5.5 should have MANDATORY CSK"
        assert csk_steps[0]["diameter"] == 5.3, f"CSK diameter should be 5.3, got {csk_steps[0]['diameter']}"

    def test_55mm_d3_protocol_no_csk(self, auth_headers):
        """Ø5.5×11.5mm D3: 8 steps (full drills without CSK)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.5, "length": 11.5, "bone_density": "D3"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 8, f"D3 Ø5.5 should have 8 steps, got {len(steps)}"
        
        # Verify NO CSK for D3
        csk_steps = [s for s in steps if "Countersink" in s["drill_type"]]
        assert len(csk_steps) == 0, "D3 Ø5.5 should NOT have CSK"

    def test_55mm_d4_protocol(self, auth_headers):
        """Ø5.5×11.5mm D4: 7 steps (drops 1 drill)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 5.5, "length": 11.5, "bone_density": "D4"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        assert len(steps) == 7, f"D4 Ø5.5 should have 7 steps, got {len(steps)}"
        
        # Verify NO CSK for D4
        csk_steps = [s for s in steps if "Countersink" in s["drill_type"]]
        assert len(csk_steps) == 0, "D4 Ø5.5 should NOT have CSK"


class TestRefirmProtocolLabels:
    """Test protocol_type labels for each bone density."""

    def test_d1_protocol_label(self, auth_headers):
        """D1 should have 'Dense Bone (Full Sequence) Protocol' label."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D1"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Dense Bone (Full Sequence)" in data.get("protocol_type", ""), f"D1 label incorrect: {data.get('protocol_type')}"

    def test_d2_protocol_label(self, auth_headers):
        """D2 should have 'Moderately Dense (Countersink) Protocol' label."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D2"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Moderately Dense (Countersink)" in data.get("protocol_type", ""), f"D2 label incorrect: {data.get('protocol_type')}"

    def test_d3_protocol_label(self, auth_headers):
        """D3 should have 'Soft Bone (Under-Preparation) Protocol' label."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D3"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Soft Bone (Under-Preparation)" in data.get("protocol_type", ""), f"D3 label incorrect: {data.get('protocol_type')}"

    def test_d4_protocol_label(self, auth_headers):
        """D4 should have 'Very Soft Bone (Undersized) Protocol' label."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D4"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "Very Soft Bone (Undersized)" in data.get("protocol_type", ""), f"D4 label incorrect: {data.get('protocol_type')}"


class TestRefirmRPMValues:
    """Test RPM values for different drill types."""

    def test_rpm_values(self, auth_headers):
        """Verify RPM values: Lance/Cylindrical 1200-1500, Taper 800-1000, CSK 600-800, Implant 20-30."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D2"}
        )
        assert response.status_code == 200
        data = response.json()
        steps = data.get("steps", [])
        
        for step in steps:
            drill_type = step["drill_type"]
            rpm = step["rpm"]
            
            if "Lance" in drill_type or "Cylindrical" in drill_type:
                assert "1200-1500" in rpm, f"{drill_type} should use 1200-1500 RPM, got {rpm}"
            elif "Taper" in drill_type:
                assert "800-1000" in rpm, f"{drill_type} should use 800-1000 RPM, got {rpm}"
            elif "Countersink" in drill_type:
                assert "600-800" in rpm, f"{drill_type} should use 600-800 RPM, got {rpm}"
            elif "Implant" in drill_type:
                assert "20-30" in rpm, f"{drill_type} should use 20-30 RPM, got {rpm}"


class TestRefirmInsertionTorque:
    """Test insertion torque values."""

    def test_insertion_torque_35_45(self, auth_headers):
        """Verify insertion torque is 35-45 Ncm for Refirm (in notes and implant placement step)."""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=auth_headers,
            json={"brand": "Refirm", "system": "R Series", "diameter": 4.0, "length": 11.5, "bone_density": "D1"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check insertion torque in notes
        notes = data.get("notes", [])
        torque_note = [n for n in notes if "35-45" in n]
        assert len(torque_note) > 0, f"Insertion torque 35-45 Ncm should be in notes: {notes}"
        
        # Also verify in implant placement step note
        steps = data.get("steps", [])
        implant_step = [s for s in steps if s["drill_type"] == "Implant Placement"]
        assert len(implant_step) == 1
        assert "35-45" in implant_step[0].get("note", ""), f"Implant step should mention 35-45 Ncm torque"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
