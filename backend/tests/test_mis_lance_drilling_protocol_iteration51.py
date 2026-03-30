"""
MIS Lance+ Drilling Protocol Tests - Iteration 51
Tests the new MIS Lance+ drilling protocol implementation including:
- Protocol generation for all diameters (3.3, 3.75, 4.2, 5.0)
- Protocol generation for all lengths (8, 10, 11.5, 13, 16)
- Bone density variations (D1, D2, D3, D4)
- D1 should include Countersink step
- D2 should have full sequential drilling
- D3/D4 should have under-preparation (skip final drill)
- PDF export functionality
- MIS Lance+ appears in available protocols list
- Regression tests for Ankylos C/X, B&B Dental, and generic protocols
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Global session to avoid rate limiting
_session = None
_token = None

def get_authenticated_session():
    global _session, _token
    if _session is None or _token is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = _session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "Abhijit.patil",
            "password": "Admin@123"
        })
        if login_response.status_code == 429:
            # Rate limited, wait and retry
            time.sleep(60)
            login_response = _session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "Abhijit.patil",
                "password": "Admin@123"
            })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        _token = login_response.json().get("token")
        _session.headers.update({"Authorization": f"Bearer {_token}"})
    return _session


class TestMISLanceDrillingProtocol:
    """MIS Lance+ drilling protocol tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: get authenticated session"""
        self.session = get_authenticated_session()
    
    # ── MIS Lance+ in Available Protocols ──
    def test_mis_lance_in_available_protocols(self):
        """Test that MIS Lance+ appears in available protocols list"""
        response = self.session.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        protocols = response.json()
        
        mis_lance = next((p for p in protocols if p["brand"] == "MIS" and p["system"] == "Lance +"), None)
        assert mis_lance is not None, "MIS Lance+ not found in available protocols"
        assert mis_lance["system_name"] == "MIS LANCE+"
        assert mis_lance["lengths"] == [8, 10, 11.5, 13, 16]
        print("PASS: MIS Lance+ found in available protocols with correct lengths")
    
    # ── D1 Dense Bone Tests (with Countersink) ──
    def test_mis_lance_d1_3_3mm_includes_countersink(self):
        """Test D1 bone density includes Countersink step for 3.3mm"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 3.3,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check protocol type
        assert "Dense Bone Protocol (MIS LANCE+)" in data["protocol_type"]
        
        # Check steps include Countersink
        steps = data["steps"]
        countersink_step = next((s for s in steps if "Countersink" in s["drill_type"]), None)
        assert countersink_step is not None, "D1 should include Countersink step"
        assert countersink_step["note"] == "Dense cortical bone (D1) only"
        
        # Check insertion torque
        assert "35-50 Ncm" in data["notes"][2]
        print(f"PASS: D1 3.3mm has Countersink step, {len(steps)} total steps")
    
    def test_mis_lance_d1_5_0mm_full_sequence(self):
        """Test D1 bone density with 5.0mm diameter - full sequence + countersink"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 5.0,
            "length": 13,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # Should have: Marking, Pilot, 3.1, 3.65, 4.1, 4.9 (Final), Countersink, Implant = 8 steps
        assert len(steps) >= 7, f"Expected at least 7 steps for D1 5.0mm, got {len(steps)}"
        
        # Check Countersink present
        countersink = next((s for s in steps if "Countersink" in s["drill_type"]), None)
        assert countersink is not None, "D1 5.0mm should have Countersink"
        
        # Check final drill is 4.9mm
        final_drill = next((s for s in steps if "Final Drill" in s["drill_type"]), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 4.9
        print(f"PASS: D1 5.0mm has {len(steps)} steps with Countersink and Final Drill 4.9mm")
    
    # ── D2 Dense Bone Tests (full sequence, no Countersink) ──
    def test_mis_lance_d2_3_75mm_full_sequence(self):
        """Test D2 bone density has full sequential drilling without Countersink"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 3.75,
            "length": 11.5,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # D2 should NOT have Countersink
        countersink = next((s for s in steps if "Countersink" in s["drill_type"]), None)
        assert countersink is None, "D2 should NOT have Countersink step"
        
        # Should have: Marking, Pilot, 3.1, 3.65 (Final), Implant = 5 steps
        assert len(steps) == 5, f"Expected 5 steps for D2 3.75mm, got {len(steps)}"
        
        # Check final drill is 3.65mm
        final_drill = next((s for s in steps if "Final Drill" in s["drill_type"]), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 3.65
        print(f"PASS: D2 3.75mm has {len(steps)} steps, no Countersink, Final Drill 3.65mm")
    
    def test_mis_lance_d2_4_2mm_full_sequence(self):
        """Test D2 bone density with 4.2mm diameter"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 4.2,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # Should have: Marking, Pilot, 3.1, 3.65, 4.1 (Final), Implant = 6 steps
        assert len(steps) == 6, f"Expected 6 steps for D2 4.2mm, got {len(steps)}"
        
        # Check final drill is 4.1mm
        final_drill = next((s for s in steps if "Final Drill" in s["drill_type"]), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 4.1
        print(f"PASS: D2 4.2mm has {len(steps)} steps, Final Drill 4.1mm")
    
    # ── D3/D4 Soft Bone Tests (under-preparation) ──
    def test_mis_lance_d3_under_preparation(self):
        """Test D3 bone density uses under-preparation (skips final drill)"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 4.2,
            "length": 10,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check protocol type
        assert "Under-Preparation Protocol (MIS LANCE+)" in data["protocol_type"]
        
        steps = data["steps"]
        
        # D3 4.2mm should stop at 3.65mm (skip 4.1mm final)
        # Should have: Marking, Pilot, 3.1, 3.65, Implant = 5 steps
        assert len(steps) == 5, f"Expected 5 steps for D3 4.2mm (under-prep), got {len(steps)}"
        
        # Should NOT have 4.1mm drill
        drill_4_1 = next((s for s in steps if s.get("diameter") == 4.1), None)
        assert drill_4_1 is None, "D3 4.2mm should skip 4.1mm drill (under-preparation)"
        
        # Should have 3.65mm as last drill before implant
        drill_3_65 = next((s for s in steps if s.get("diameter") == 3.65), None)
        assert drill_3_65 is not None, "D3 4.2mm should have 3.65mm drill"
        print(f"PASS: D3 4.2mm under-preparation - {len(steps)} steps, stops at 3.65mm")
    
    def test_mis_lance_d4_under_preparation(self):
        """Test D4 bone density uses under-preparation"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 5.0,
            "length": 16,
            "bone_density": "D4"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "Under-Preparation Protocol (MIS LANCE+)" in data["protocol_type"]
        
        steps = data["steps"]
        
        # D4 5.0mm should stop at 4.1mm (skip 4.9mm final)
        # Should have: Marking, Pilot, 3.1, 3.65, 4.1, Implant = 6 steps
        assert len(steps) == 6, f"Expected 6 steps for D4 5.0mm (under-prep), got {len(steps)}"
        
        # Should NOT have 4.9mm drill
        drill_4_9 = next((s for s in steps if s.get("diameter") == 4.9), None)
        assert drill_4_9 is None, "D4 5.0mm should skip 4.9mm drill (under-preparation)"
        
        # Should have 4.1mm as last drill before implant
        drill_4_1 = next((s for s in steps if s.get("diameter") == 4.1), None)
        assert drill_4_1 is not None, "D4 5.0mm should have 4.1mm drill"
        print(f"PASS: D4 5.0mm under-preparation - {len(steps)} steps, stops at 4.1mm")
    
    def test_mis_lance_d3_3_3mm_under_preparation(self):
        """Test D3 3.3mm under-preparation (stops at pilot 2.4mm)"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 3.3,
            "length": 8,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data["steps"]
        
        # D3 3.3mm should stop at 2.4mm (skip 3.1mm final)
        # Should have: Marking, Pilot 2.4, Implant = 3 steps
        assert len(steps) == 3, f"Expected 3 steps for D3 3.3mm (under-prep), got {len(steps)}"
        
        # Should NOT have 3.1mm drill
        drill_3_1 = next((s for s in steps if s.get("diameter") == 3.1), None)
        assert drill_3_1 is None, "D3 3.3mm should skip 3.1mm drill (under-preparation)"
        print(f"PASS: D3 3.3mm under-preparation - {len(steps)} steps, stops at pilot 2.4mm")
    
    # ── Depth and Length Tests ──
    def test_mis_lance_depth_equals_length(self):
        """Test that osteotomy depth equals implant length (no offset)"""
        for length in [8, 10, 11.5, 13, 16]:
            response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "MIS",
                "system": "Lance +",
                "diameter": 4.2,
                "length": length,
                "bone_density": "D2"
            })
            assert response.status_code == 200
            data = response.json()
            steps = data["steps"]
            
            # Check pilot drill depth equals implant length
            pilot = next((s for s in steps if "Pilot" in s["drill_type"]), None)
            assert pilot is not None
            # Handle both "8" and "8.0" formats
            expected_depths = [str(length), str(float(length))]
            assert pilot["depth"] in expected_depths, f"Depth should be {length}, got {pilot['depth']}"
        print("PASS: All lengths verified - depth equals implant length (no offset)")
    
    # ── PDF Export Test ──
    def test_mis_lance_pdf_export(self):
        """Test PDF export for MIS Lance+ protocol"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 4.2,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 1000, "PDF content too small"
        print("PASS: PDF export returns valid PDF content")
    
    # ── Insertion Torque Test ──
    def test_mis_lance_insertion_torque(self):
        """Test that MIS Lance+ has correct insertion torque (35-50 Ncm)"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 3.75,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check insertion torque in notes
        torque_note = next((n for n in data["notes"] if "torque" in n.lower()), None)
        assert torque_note is not None
        assert "35-50 Ncm" in torque_note
        print("PASS: Insertion torque is 35-50 Ncm")


class TestRegressionAnkylosCX:
    """Regression tests for Ankylos C/X protocol"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = get_authenticated_session()
    
    def test_ankylos_cx_still_works(self):
        """Regression: Ankylos C/X protocol still generates correctly"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 4.5,
            "length": 9.5,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check it's Ankylos protocol
        assert "ankylos_info" in data
        assert data["ankylos_info"]["series"] == "B"
        assert data["ankylos_info"]["color"] == "Yellow"
        
        # D2 should have Tap step (7 steps total)
        steps = data["steps"]
        tap_step = next((s for s in steps if "Tap" in s["drill_type"]), None)
        assert tap_step is not None, "D2 Ankylos should have Tap step"
        assert len(steps) == 7, f"Expected 7 steps for D2 Ankylos, got {len(steps)}"
        print("PASS: Ankylos C/X regression - B Series, Yellow, 7 steps with Tap")


class TestRegressionBBDental:
    """Regression tests for B&B Dental protocols"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = get_authenticated_session()
    
    def test_bb_dental_3p_still_works(self):
        """Regression: B&B Dental 3P protocol still generates correctly"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check protocol type
        assert "Dense Bone Protocol (3P)" in data["protocol_type"]
        
        # D2 should have Countersink
        steps = data["steps"]
        countersink = next((s for s in steps if "Countersink" in s["drill_type"]), None)
        assert countersink is not None, "D2 B&B Dental 3P should have Countersink"
        
        # Check depth is length + 0.5
        pilot = next((s for s in steps if "Pilot" in s["drill_type"]), None)
        assert pilot is not None
        assert pilot["depth"] == "10.5", f"B&B Dental depth should be 10.5, got {pilot['depth']}"
        print("PASS: B&B Dental 3P regression - Dense Bone Protocol with Countersink, depth=10.5")


class TestRegressionGenericProtocol:
    """Regression tests for generic protocols (e.g., BioHorizons)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = get_authenticated_session()
    
    def test_biohorizons_tapered_pro_still_works(self):
        """Regression: BioHorizons Tapered Pro protocol still generates correctly"""
        response = self.session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check it generates steps
        steps = data["steps"]
        assert len(steps) > 0, "BioHorizons should generate drilling steps"
        
        # Check protocol type (generic)
        assert "Protocol" in data["protocol_type"]
        print(f"PASS: BioHorizons Tapered Pro regression - {len(steps)} steps generated")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
