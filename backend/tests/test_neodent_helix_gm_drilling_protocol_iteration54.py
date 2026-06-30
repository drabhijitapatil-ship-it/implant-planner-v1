"""
Iteration 54: Neodent Helix GM Drilling Protocol Tests

Tests the updated Helix GM Acqua and Helix GM Neoporous drilling protocols with:
- Per-diameter explicit sequences
- D1/D2: Drill up to implant diameter + Plus (+) drill (coronal only)
- D3/D4: Stop one drill before final diameter (no Plus drill)
- Depth = implant length
- Plus drill depth = "Coronal ONLY" with crestal cortical expansion note

Also includes regression tests for Drive GM and Titamax GM protocols.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')


@pytest.fixture(scope="module")
def auth_headers():
    """Login once per module and return auth headers."""
    login_response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "Gaurav.pandey", "password": "Student@123"}
    )
    assert login_response.status_code == 200, f"Login failed: {login_response.text}"
    token = login_response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


class TestHelixGMDrillingProtocol:
    """Test Neodent Helix GM Acqua/Neoporous drilling protocols."""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_headers):
        """Use shared auth headers."""
        self.headers = auth_headers
    
    # ========== Helix GM Acqua 3.5mm Tests ==========
    
    def test_helix_gm_acqua_3_5mm_d1_sequence(self):
        """Feature 1: Helix GM Acqua 3.5mm D1 - sequence 2.0→2.8→3.5→Plus 3.5+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 3.5,
                "length": 10,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Expected sequence: 2.0 → 2.8 → 3.5 → Plus 3.5+ → Implant
        drill_sequence = [(s["diameter"], s["drill_type"]) for s in steps]
        
        # Verify 2.0mm initial drill
        assert steps[0]["diameter"] == 2.0, "First drill should be 2.0mm"
        assert "Initial" in steps[0]["drill_type"], "First drill should be Initial Drill"
        
        # Verify 2.8mm drill
        assert steps[1]["diameter"] == 2.8, "Second drill should be 2.8mm"
        
        # Verify 3.5mm final drill
        assert steps[2]["diameter"] == 3.5, "Third drill should be 3.5mm"
        
        # Verify Plus drill (coronal only)
        plus_step = steps[3]
        assert plus_step["diameter"] == 3.5, "Plus drill should be 3.5mm"
        assert "Plus" in plus_step["drill_type"], "Should have Plus drill"
        assert plus_step["depth"] == "Coronal ONLY", f"Plus drill depth should be 'Coronal ONLY', got: {plus_step['depth']}"
        assert "Crestal cortical expansion only" in plus_step.get("note", ""), f"Plus drill should have crestal note, got: {plus_step.get('note', '')}"
        
        # Verify implant placement
        assert steps[-1]["drill_type"] == "Implant Placement", "Last step should be Implant Placement"
        assert steps[-1]["diameter"] == 3.5, "Implant diameter should be 3.5mm"
        
        print("PASS: Helix GM Acqua 3.5mm D1 sequence correct")
    
    def test_helix_gm_acqua_3_5mm_d4_sequence(self):
        """Feature 2: Helix GM Acqua 3.5mm D4 - sequence 2.0→2.8→Implant (no Plus, stop before final)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 3.5,
                "length": 10,
                "bone_density": "D4"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Expected sequence: 2.0 → 2.8 → Implant (D3/D4 stops one drill before final, no Plus)
        # D3_D4 for 3.5mm is [2.8], so: 2.0 → 2.8 → Implant
        
        # Verify 2.0mm initial drill
        assert steps[0]["diameter"] == 2.0, "First drill should be 2.0mm"
        
        # Verify 2.8mm drill
        assert steps[1]["diameter"] == 2.8, "Second drill should be 2.8mm"
        
        # Verify NO Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0, f"D4 should have NO Plus drill, found: {plus_drills}"
        
        # Verify implant placement
        assert steps[-1]["drill_type"] == "Implant Placement", "Last step should be Implant Placement"
        
        # Verify all depths are implant length (not Coronal ONLY)
        for step in steps[:-1]:  # Exclude implant placement
            if "Plus" not in step["drill_type"]:
                # Depth can be "10" or "10.0" depending on API response format
                assert str(step["depth"]).rstrip('0').rstrip('.') == "10", f"Drill depth should be implant length (10), got: {step['depth']}"
        
        print("PASS: Helix GM Acqua 3.5mm D4 sequence correct (no Plus drill)")
    
    # ========== Helix GM Acqua 3.75mm Tests ==========
    
    def test_helix_gm_acqua_3_75mm_d2_sequence(self):
        """Feature 3: Helix GM Acqua 3.75mm D2 - sequence 2.0→2.8→3.5→3.75→Plus 3.75+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 3.75,
                "length": 11.5,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Expected: 2.0 → 2.8 → 3.5 → 3.75 → Plus 3.75+ → Implant
        # D1_D2 for 3.75mm is [2.8, 3.5, 3.75]
        
        assert steps[0]["diameter"] == 2.0, "First drill should be 2.0mm"
        assert steps[1]["diameter"] == 2.8, "Second drill should be 2.8mm"
        assert steps[2]["diameter"] == 3.5, "Third drill should be 3.5mm"
        assert steps[3]["diameter"] == 3.75, "Fourth drill should be 3.75mm"
        
        # Plus drill
        plus_step = steps[4]
        assert "Plus" in plus_step["drill_type"], "Should have Plus drill"
        assert plus_step["diameter"] == 3.75, "Plus drill should be 3.75mm"
        assert plus_step["depth"] == "Coronal ONLY", f"Plus drill depth should be 'Coronal ONLY', got: {plus_step['depth']}"
        
        # Implant
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 3.75mm D2 sequence correct")
    
    def test_helix_gm_acqua_3_75mm_d3_sequence(self):
        """Feature 4: Helix GM Acqua 3.75mm D3 - sequence 2.0→2.8→3.5→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 3.75,
                "length": 13,
                "bone_density": "D3"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Expected: 2.0 → 2.8 → 3.5 → Implant (D3_D4 for 3.75mm is [2.8, 3.5])
        
        assert steps[0]["diameter"] == 2.0, "First drill should be 2.0mm"
        assert steps[1]["diameter"] == 2.8, "Second drill should be 2.8mm"
        assert steps[2]["diameter"] == 3.5, "Third drill should be 3.5mm"
        
        # No Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0, f"D3 should have NO Plus drill, found: {plus_drills}"
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 3.75mm D3 sequence correct")
    
    # ========== Helix GM Acqua 4.0mm Tests ==========
    
    def test_helix_gm_acqua_4_0mm_d2_sequence(self):
        """Feature 5: Helix GM Acqua 4.0mm D2 - sequence 2.0→2.8→3.5→3.75→4.0→Plus 4.0+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.0,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D1_D2 for 4.0mm is [2.8, 3.5, 3.75, 4.0]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        
        # Plus drill
        plus_step = steps[5]
        assert "Plus" in plus_step["drill_type"]
        assert plus_step["diameter"] == 4.0
        assert plus_step["depth"] == "Coronal ONLY"
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 4.0mm D2 sequence correct")
    
    def test_helix_gm_acqua_4_0mm_d3_sequence(self):
        """Feature 6: Helix GM Acqua 4.0mm D3 - sequence 2.0→2.8→3.5→3.75→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.0,
                "length": 10,
                "bone_density": "D3"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D3_D4 for 4.0mm is [2.8, 3.5, 3.75]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        
        # No Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 4.0mm D3 sequence correct")
    
    # ========== Helix GM Acqua 4.3mm Tests ==========
    
    def test_helix_gm_acqua_4_3mm_d2_sequence(self):
        """Feature 7: Helix GM Acqua 4.3mm D2 - sequence 2.0→2.8→3.5→3.75→4.0→4.3→Plus 4.3+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D1_D2 for 4.3mm is [2.8, 3.5, 3.75, 4.0, 4.3]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        assert steps[5]["diameter"] == 4.3
        
        # Plus drill
        plus_step = steps[6]
        assert "Plus" in plus_step["drill_type"]
        assert plus_step["diameter"] == 4.3
        assert plus_step["depth"] == "Coronal ONLY"
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 4.3mm D2 sequence correct")
    
    def test_helix_gm_acqua_4_3mm_d3_sequence(self):
        """Feature 8: Helix GM Acqua 4.3mm D3 - sequence 2.0→2.8→3.5→3.75→4.0→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 10,
                "bone_density": "D3"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D3_D4 for 4.3mm is [2.8, 3.5, 3.75, 4.0]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        
        # No Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 4.3mm D3 sequence correct")
    
    # ========== Helix GM Acqua 5.0mm Tests ==========
    
    def test_helix_gm_acqua_5_0mm_d1_sequence(self):
        """Feature 9: Helix GM Acqua 5.0mm D1 - sequence 2.0→2.8→3.5→3.75→4.0→4.3→5.0→Plus 5.0+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 5.0,
                "length": 10,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D1_D2 for 5.0mm is [2.8, 3.5, 3.75, 4.0, 4.3, 5.0]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        assert steps[5]["diameter"] == 4.3
        assert steps[6]["diameter"] == 5.0
        
        # Plus drill
        plus_step = steps[7]
        assert "Plus" in plus_step["drill_type"]
        assert plus_step["diameter"] == 5.0
        assert plus_step["depth"] == "Coronal ONLY"
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 5.0mm D1 sequence correct")
    
    def test_helix_gm_acqua_5_0mm_d4_sequence(self):
        """Feature 10: Helix GM Acqua 5.0mm D4 - sequence 2.0→2.8→3.5→3.75→4.0→4.3→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 5.0,
                "length": 10,
                "bone_density": "D4"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D3_D4 for 5.0mm is [2.8, 3.5, 3.75, 4.0, 4.3]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        assert steps[5]["diameter"] == 4.3
        
        # No Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 5.0mm D4 sequence correct")
    
    # ========== Helix GM Acqua 6.0mm Tests ==========
    
    def test_helix_gm_acqua_6_0mm_d2_sequence(self):
        """Feature 11: Helix GM Acqua 6.0mm D2 - sequence 2.0→2.8→3.5→3.75→4.0→4.3→5.0→6.0→Plus 6.0+(Coronal ONLY)→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 6.0,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D1_D2 for 6.0mm is [2.8, 3.5, 3.75, 4.0, 4.3, 5.0, 6.0]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        assert steps[5]["diameter"] == 4.3
        assert steps[6]["diameter"] == 5.0
        assert steps[7]["diameter"] == 6.0
        
        # Plus drill
        plus_step = steps[8]
        assert "Plus" in plus_step["drill_type"]
        assert plus_step["diameter"] == 6.0
        assert plus_step["depth"] == "Coronal ONLY"
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 6.0mm D2 sequence correct")
    
    def test_helix_gm_acqua_6_0mm_d4_sequence(self):
        """Feature 12: Helix GM Acqua 6.0mm D4 - sequence 2.0→2.8→3.5→3.75→4.0→4.3→5.0→Implant"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 6.0,
                "length": 10,
                "bone_density": "D4"
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # D3_D4 for 6.0mm is [2.8, 3.5, 3.75, 4.0, 4.3, 5.0]
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["diameter"] == 2.8
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 3.75
        assert steps[4]["diameter"] == 4.0
        assert steps[5]["diameter"] == 4.3
        assert steps[6]["diameter"] == 5.0
        
        # No Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0
        
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Helix GM Acqua 6.0mm D4 sequence correct")
    
    # ========== Helix GM Neoporous Tests ==========
    
    def test_helix_gm_neoporous_same_as_acqua(self):
        """Feature 13: Helix GM Neoporous produces same protocol as Acqua (shared definition)"""
        # Test with 4.0mm D1
        acqua_response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.0,
                "length": 10,
                "bone_density": "D1"
            }
        )
        
        neoporous_response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Neoporous",
                "diameter": 4.0,
                "length": 10,
                "bone_density": "D1"
            }
        )
        
        assert acqua_response.status_code == 200
        assert neoporous_response.status_code == 200
        
        acqua_steps = acqua_response.json()["steps"]
        neoporous_steps = neoporous_response.json()["steps"]
        
        # Compare drill sequences (excluding system name differences)
        acqua_seq = [(s["diameter"], s["drill_type"], s["depth"]) for s in acqua_steps]
        neoporous_seq = [(s["diameter"], s["drill_type"], s["depth"]) for s in neoporous_steps]
        
        assert acqua_seq == neoporous_seq, f"Neoporous should match Acqua protocol. Acqua: {acqua_seq}, Neoporous: {neoporous_seq}"
        
        print("PASS: Helix GM Neoporous produces same protocol as Acqua")
    
    # ========== Plus Drill Depth and Note Tests ==========
    
    def test_plus_drill_depth_coronal_only(self):
        """Feature 14: Plus Drill depth must be 'Coronal ONLY' (not implant length)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 16,  # Long implant
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        plus_steps = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_steps) == 1, "Should have exactly one Plus drill for D1"
        
        plus_step = plus_steps[0]
        assert plus_step["depth"] == "Coronal ONLY", f"Plus drill depth should be 'Coronal ONLY', got: {plus_step['depth']}"
        assert plus_step["depth"] != "16", "Plus drill depth should NOT be implant length"
        
        print("PASS: Plus Drill depth is 'Coronal ONLY'")
    
    def test_plus_drill_note_crestal_expansion(self):
        """Feature 15: Plus Drill note must mention 'Crestal cortical expansion only'"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 5.0,
                "length": 13,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        plus_steps = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_steps) == 1
        
        plus_step = plus_steps[0]
        note = plus_step.get("note", "")
        assert "Crestal cortical expansion only" in note, f"Plus drill note should mention 'Crestal cortical expansion only', got: {note}"
        
        print("PASS: Plus Drill note mentions 'Crestal cortical expansion only'")
    
    def test_non_plus_drill_depths_equal_implant_length(self):
        """Feature 16: All non-Plus drill depths = implant length"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.0,
                "length": 11.5,
                "bone_density": "D1"
            }
        )
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        for step in steps:
            if "Plus" not in step["drill_type"] and step["drill_type"] != "Implant Placement":
                # Depth can be "11.5" or "11.5" depending on API response format
                assert str(step["depth"]) == "11.5", f"Non-Plus drill depth should be implant length (11.5), got: {step['depth']} for {step['drill_type']}"
        
        print("PASS: All non-Plus drill depths equal implant length")
    
    # ========== PDF Export Test ==========
    
    def test_helix_gm_pdf_export(self):
        """Feature 17: PDF export for Helix GM returns 200"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/export-pdf",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf" or len(response.content) > 0
        
        print("PASS: Helix GM PDF export returns 200")
    
    # ========== Regression Tests ==========
    
    def test_regression_drive_gm_acqua_4_3mm_d2(self):
        """Feature 18: Regression - Drive GM Acqua 4.3mm D2 still works (not helix family)"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Drive GM Acqua",
                "diameter": 4.3,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Drive GM Acqua failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Drive GM should NOT have Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0, "Drive GM should NOT have Plus drill"
        
        # Verify it has proper sequence
        assert len(steps) >= 3, "Drive GM should have at least 3 steps"
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Regression - Drive GM Acqua 4.3mm D2 still works")
    
    def test_regression_titamax_gm_acqua_3_75mm_d2(self):
        """Feature 19: Regression - Titamax GM Acqua 3.75mm D2 still works"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Neodent",
                "system": "Titamax GM Acqua",
                "diameter": 3.75,
                "length": 11,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Titamax GM Acqua failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        # Titamax GM should NOT have Plus drill
        plus_drills = [s for s in steps if "Plus" in s["drill_type"]]
        assert len(plus_drills) == 0, "Titamax GM should NOT have Plus drill"
        
        # Verify it has proper sequence
        assert len(steps) >= 3, "Titamax GM should have at least 3 steps"
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Regression - Titamax GM Acqua 3.75mm D2 still works")
    
    def test_regression_bredent_blue_sky(self):
        """Feature 20: Regression - Bredent Blue Sky still works"""
        response = requests.post(
            f"{BASE_URL}/api/drilling-protocols/generate",
            headers=self.headers,
            json={
                "brand": "Bredent",
                "system": "Blue Sky",
                "diameter": 4.0,
                "length": 10,
                "bone_density": "D2"
            }
        )
        assert response.status_code == 200, f"Bredent Blue Sky failed: {response.text}"
        data = response.json()
        steps = data["steps"]
        
        assert len(steps) >= 3, "Bredent Blue Sky should have at least 3 steps"
        assert steps[-1]["drill_type"] == "Implant Placement"
        
        print("PASS: Regression - Bredent Blue Sky still works")
    
    # ========== Available Protocols Test ==========
    
    def test_helix_gm_in_available_protocols(self):
        """Feature 21: Helix GM Acqua and Neoporous in available protocols"""
        response = requests.get(
            f"{BASE_URL}/api/drilling-protocols/available",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # API returns a flat list of systems
        system_entries = [(s["brand"], s["system"]) for s in data]
        
        assert ("Neodent", "Helix GM Acqua") in system_entries, "Helix GM Acqua should be in available protocols"
        assert ("Neodent", "Helix GM Neoporous") in system_entries, "Helix GM Neoporous should be in available protocols"
        
        print("PASS: Helix GM Acqua and Neoporous in available protocols")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
