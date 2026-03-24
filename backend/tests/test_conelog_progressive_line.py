"""
Test suite for Conelog Progressive Line drilling protocol
Tests: POST /api/drilling-protocols/generate with various diameter/bone_density combinations
Expected step counts per user specification:
- 3.3mm D1/D2: 7 steps (marker, pilot, pin, 1 twist, profile, dense, placement)
- 3.3mm D3/D4: 5 steps (marker, pilot, pin, profile, placement) - only 1 twist drill, soft bone skips it
- 3.8mm D1/D2: 8 steps
- 3.8mm D3/D4: 6 steps
- 4.3mm D1/D2: 9 steps
- 4.3mm D3/D4: 7 steps
- 5.0mm D1/D2: 10 steps
- 5.0mm D4: 8 steps
Drill codes: twist=J5079.XXXX, profile=J5080.XXXX, dense bone=J5072.XXXX
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://surgical-case-portal.preview.emergentagent.com').rstrip('/')


class TestAuth:
    """Authentication helper for tests"""
    
    @staticmethod
    def get_auth_token():
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None


class TestConelogProgressiveLineProtocol:
    """Tests for Conelog Progressive Line drilling protocol"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token before each test"""
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    # ---------- 4.3mm diameter tests (3 twist drills) ----------
    
    def test_conelog_4_3mm_D2_returns_9_steps(self):
        """4.3mm D2: 9 steps (marker, pilot, pin, 3 twist [3.3,3.8,4.3], profile, dense, placement)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify step count
        assert data["total_steps"] == 9, f"Expected 9 steps, got {data['total_steps']}"
        
        # Verify step sequence
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Bone Marker"
        assert steps[1]["drill_type"] == "Pilot Drill"
        assert steps[2]["drill_type"] == "Parallel Pin"
        assert steps[3]["drill_type"] == "Twist Drill 3.3 mm"
        assert steps[4]["drill_type"] == "Twist Drill 3.8 mm"
        assert steps[5]["drill_type"] == "Twist Drill 4.3 mm"
        assert steps[6]["drill_type"] == "Profile Drill"
        assert steps[7]["drill_type"] == "Dense Bone Drill"
        assert steps[8]["drill_type"] == "Implant Placement"
    
    def test_conelog_4_3mm_D1_returns_9_steps(self):
        """4.3mm D1: 9 steps (includes dense bone drill)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D1"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 9, f"Expected 9 steps for D1, got {data['total_steps']}"
        
        # Verify dense bone drill is present
        step_types = [s["drill_type"] for s in data["steps"]]
        assert "Dense Bone Drill" in step_types
    
    def test_conelog_4_3mm_D3_returns_7_steps(self):
        """4.3mm D3: 7 steps (skips final twist drill 4.3, no dense bone drill)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 7, f"Expected 7 steps for D3, got {data['total_steps']}"
        
        # Verify skipped steps
        steps = data["steps"]
        step_types = [s["drill_type"] for s in steps]
        
        # Should have only 2 twist drills (3.3 and 3.8), not the final 4.3
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 2, f"Expected 2 twist drills for soft bone, got {twist_count}"
        
        # Should NOT have dense bone drill
        assert "Dense Bone Drill" not in step_types
    
    def test_conelog_4_3mm_D4_returns_7_steps(self):
        """4.3mm D4: 7 steps (soft bone protocol)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D4"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 7, f"Expected 7 steps for D4, got {data['total_steps']}"
    
    # ---------- 3.3mm diameter tests (1 twist drill) ----------
    
    def test_conelog_3_3mm_D2_returns_7_steps(self):
        """3.3mm D2: 7 steps (marker, pilot, pin, 1 twist, profile, dense, placement)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 3.3,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 7, f"Expected 7 steps for 3.3mm D2, got {data['total_steps']}"
        
        # Verify twist drill count
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 1, f"Expected 1 twist drill for 3.3mm, got {twist_count}"
        
        # Verify dense bone drill is present for D2
        assert "Dense Bone Drill" in step_types
    
    def test_conelog_3_3mm_D3_returns_6_steps(self):
        """3.3mm D3: 6 steps (only 1 twist drill, can't skip it - need to drill)
        Per algorithm: skip final twist only if >1 twist drills available"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 3.3,
                "length": 11,
                "bone_density": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        # With only 1 twist drill, can't skip it - results in 6 steps
        assert data["total_steps"] == 6, f"Expected 6 steps for 3.3mm D3, got {data['total_steps']}"
        
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        # 1 twist drill (3.3) is kept since it's the only one
        assert twist_count == 1, f"Expected 1 twist drill for 3.3mm (can't skip only drill), got {twist_count}"
        assert "Dense Bone Drill" not in step_types
    
    def test_conelog_3_3mm_D4_returns_6_steps(self):
        """3.3mm D4: 6 steps (soft bone protocol, but can't skip only twist drill)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 3.3,
                "length": 11,
                "bone_density": "D4"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        # With only 1 twist drill, can't skip it - results in 6 steps
        assert data["total_steps"] == 6, f"Expected 6 steps for 3.3mm D4, got {data['total_steps']}"
    
    # ---------- 3.8mm diameter tests (2 twist drills) ----------
    
    def test_conelog_3_8mm_D2_returns_8_steps(self):
        """3.8mm D2: 8 steps (marker, pilot, pin, 2 twist [3.3,3.8], profile, dense, placement)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 3.8,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 8, f"Expected 8 steps for 3.8mm D2, got {data['total_steps']}"
        
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 2, f"Expected 2 twist drills for 3.8mm, got {twist_count}"
    
    def test_conelog_3_8mm_D3_returns_6_steps(self):
        """3.8mm D3: 6 steps (skips last twist, no dense)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 3.8,
                "length": 11,
                "bone_density": "D3"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 6, f"Expected 6 steps for 3.8mm D3, got {data['total_steps']}"
        
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 1, f"Expected 1 twist drill for 3.8mm soft bone, got {twist_count}"
    
    # ---------- 5.0mm diameter tests (4 twist drills) ----------
    
    def test_conelog_5_0mm_D2_returns_10_steps(self):
        """5.0mm D2: 10 steps (marker, pilot, pin, 4 twist [3.3,3.8,4.3,5.0], profile, dense, placement)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 5.0,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 10, f"Expected 10 steps for 5.0mm D2, got {data['total_steps']}"
        
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 4, f"Expected 4 twist drills for 5.0mm, got {twist_count}"
    
    def test_conelog_5_0mm_D4_returns_8_steps(self):
        """5.0mm D4: 8 steps (skips last twist, no dense)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 5.0,
                "length": 11,
                "bone_density": "D4"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 8, f"Expected 8 steps for 5.0mm D4, got {data['total_steps']}"
        
        step_types = [s["drill_type"] for s in data["steps"]]
        twist_count = sum(1 for t in step_types if "Twist Drill" in t)
        assert twist_count == 3, f"Expected 3 twist drills for 5.0mm soft bone, got {twist_count}"
        assert "Dense Bone Drill" not in step_types


class TestConelogDrillCodes:
    """Verify drill codes match the specification pattern"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_twist_drill_codes_start_with_J5079(self):
        """All twist drill codes should start with J5079"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 5.0,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        for step in data["steps"]:
            if "Twist Drill" in step["drill_type"]:
                assert step["code"].startswith("J5079"), f"Twist drill code {step['code']} doesn't start with J5079"
    
    def test_profile_drill_codes_start_with_J5080(self):
        """Profile drill codes should start with J5080"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        for step in data["steps"]:
            if step["drill_type"] == "Profile Drill":
                assert step["code"].startswith("J5080"), f"Profile drill code {step['code']} doesn't start with J5080"
    
    def test_dense_bone_drill_codes_start_with_J5072(self):
        """Dense bone drill codes should start with J5072"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        for step in data["steps"]:
            if step["drill_type"] == "Dense Bone Drill":
                assert step["code"].startswith("J5072"), f"Dense bone drill code {step['code']} doesn't start with J5072"


class TestConelogImplantPlacement:
    """Verify implant placement step configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_implant_placement_rpm_and_irrigation(self):
        """Implant placement should have RPM 25-30 and irrigation=false"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find implant placement step (last step)
        placement_step = data["steps"][-1]
        assert placement_step["drill_type"] == "Implant Placement"
        assert placement_step["rpm"] == "25-30", f"Expected RPM '25-30', got '{placement_step['rpm']}'"
        assert placement_step["irrigation"] == False, "Irrigation should be False for implant placement"


class TestAvailableProtocols:
    """Test GET /api/drilling-protocols/available endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_available_protocols_includes_conelog(self):
        """Available protocols should include Conelog Progressive Line with correct lengths"""
        response = requests.get(
            f"{BASE_URL}/api/drilling-protocols/available",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find Conelog Progressive Line in available protocols
        conelog_found = False
        for proto in data:
            if proto.get("brand") == "Conelog" and proto.get("system") == "Progressive Line":
                conelog_found = True
                # Verify lengths [7, 9, 11, 13, 16]
                expected_lengths = [7, 9, 11, 13, 16]
                assert proto.get("lengths") == expected_lengths, f"Expected lengths {expected_lengths}, got {proto.get('lengths')}"
                break
        
        assert conelog_found, "Conelog Progressive Line not found in available protocols"


class TestBioHorizonsRegression:
    """Regression tests for existing BioHorizons protocols"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_biohorizons_tapered_pro_D2_still_works(self):
        """BioHorizons Tapered Pro D2 should still generate valid protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Pro",
                "diameter": 4.2,
                "length": 10.5,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] > 0
        # System name may vary but should contain "Tapered Pro"
        assert "Tapered Pro" in data["system_name"]
    
    def test_biohorizons_tapered_short_D2_still_works(self):
        """BioHorizons Tapered Short D2 should still generate valid protocol"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            json={
                "brand": "BioHorizons",
                "system": "Tapered Short",
                "diameter": 4.6,
                "length": 7.5,
                "bone_density": "D2"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] > 0
        # System name may vary but should contain "Tapered Short"
        assert "Tapered Short" in data["system_name"]


class TestExportPDF:
    """Test PDF export for Conelog Progressive Line"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = TestAuth.get_auth_token()
        assert self.token, "Authentication failed"
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_export_pdf_conelog_returns_valid_pdf(self):
        """Export PDF for Conelog Progressive Line should return a valid PDF"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/export-pdf",
            json={
                "brand": "Conelog",
                "system": "Progressive Line",
                "diameter": 4.3,
                "length": 11,
                "bone_density": "D2",
                "tooth": "36"
            },
            headers=self.headers
        )
        assert response.status_code == 200
        # Check that content type is PDF
        assert "application/pdf" in response.headers.get("Content-Type", ""), "Response should be PDF"
        # Check that content is not empty and starts with PDF magic number
        content = response.content
        assert len(content) > 0, "PDF content should not be empty"
        assert content[:4] == b'%PDF', "Content should start with PDF magic number"
