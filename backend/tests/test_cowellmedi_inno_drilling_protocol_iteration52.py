"""
Iteration 52: Cowellmedi INNO Drilling Protocol Tests
Tests for Cowellmedi INNO Submerged and INNO Submerged Narrow drilling protocols.

Protocol Rules:
- INNO Submerged: diameters (3.5, 4.0, 4.5, 5.0), lengths (7, 8, 10, 12, 14, 16, 18)
- INNO Narrow: diameters (3.1, 3.3), lengths (8, 10, 12, 14)
- D1: Full drilling + mandatory Countersink + optional Bone Tap
- D2: Full drilling + Countersink (if cortical thick), NO Bone Tap
- D3/D4: Under-preparation (skip final drill)
- Depth = Implant Length (no offset)
- Insertion torque: 25-45 Ncm
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Module-level session to avoid rate limiting
_session = None

def get_session():
    """Get or create authenticated session"""
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = _session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "Gaurav.pandey",
            "password": "Student@123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            _session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            raise Exception(f"Authentication failed: {login_response.status_code}")
    return _session


class TestCowellmediINNOProtocol:
    """Cowellmedi INNO Submerged and Narrow drilling protocol tests"""
    
    # ========== AVAILABLE PROTOCOLS TESTS ==========
    
    def test_cowellmedi_inno_submerged_in_available_protocols(self):
        """Feature 1: Cowellmedi INNO Submerged appears in available protocols"""
        session = get_session()
        response = session.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        
        protocols = response.json()
        inno_submerged = next((p for p in protocols if p["brand"] == "Cowellmedi" and p["system"] == "INNO Submerged"), None)
        
        assert inno_submerged is not None, "Cowellmedi INNO Submerged not found in available protocols"
        assert inno_submerged["system_name"] == "Cowellmedi INNO Submerged"
        assert inno_submerged["lengths"] == [7, 8, 10, 12, 14, 16, 18]
        print(f"PASS: INNO Submerged found with lengths {inno_submerged['lengths']}")
    
    def test_cowellmedi_inno_narrow_in_available_protocols(self):
        """Feature 2: Cowellmedi INNO Submerged Narrow appears in available protocols"""
        session = get_session()
        response = session.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        
        protocols = response.json()
        inno_narrow = next((p for p in protocols if p["brand"] == "Cowellmedi" and p["system"] == "INNO Submerged Narrow"), None)
        
        assert inno_narrow is not None, "Cowellmedi INNO Submerged Narrow not found in available protocols"
        assert inno_narrow["system_name"] == "Cowellmedi INNO Submerged Narrow"
        assert inno_narrow["lengths"] == [8, 10, 12, 14]
        print(f"PASS: INNO Narrow found with lengths {inno_narrow['lengths']}")
    
    # ========== INNO SUBMERGED D1 TESTS ==========
    
    def test_inno_submerged_d1_full_drilling_with_countersink_and_bone_tap(self):
        """Feature 3: INNO Submerged D1 - Full drilling + mandatory Countersink + optional Bone Tap"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Dense Bone Protocol" in data["protocol_type"]
        assert "INNO Submerged" in data["protocol_type"]
        
        # Verify Countersink step exists
        countersink_step = next((s for s in steps if s["drill_type"] == "Countersink"), None)
        assert countersink_step is not None, "Countersink step missing for D1"
        assert "Mandatory" in countersink_step.get("note", "") or "dense cortical" in countersink_step.get("note", "").lower()
        
        # Verify Bone Tap step exists (optional for D1)
        bone_tap_step = next((s for s in steps if s["drill_type"] == "Bone Tap"), None)
        assert bone_tap_step is not None, "Bone Tap step missing for D1"
        assert "D1" in bone_tap_step.get("note", "") or "dense" in bone_tap_step.get("note", "").lower()
        
        # Verify insertion torque
        assert any("25-45 Ncm" in note for note in data["notes"])
        
        print(f"PASS: D1 4.0mm has {len(steps)} steps with Countersink and Bone Tap")
    
    def test_inno_submerged_d1_3_5mm_full_sequence(self):
        """Feature 4: INNO Submerged D1 3.5mm - Full drilling sequence"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 3.5,
            "length": 12,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify drill sequence: Round → 2.0 → 2.8 → 3.2 (final for 3.5mm) → Countersink → Bone Tap → Implant
        drill_types = [s["drill_type"] for s in steps]
        
        assert "Round Drill" in drill_types
        assert "Pilot Drill" in drill_types
        assert "Countersink" in drill_types
        assert "Bone Tap" in drill_types
        assert "Implant Placement" in drill_types
        
        # Verify final drill is 3.2mm for 3.5mm implant
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 3.2
        
        # Verify depth equals length (handle both "12" and "12.0")
        implant_step = next((s for s in steps if s["drill_type"] == "Implant Placement"), None)
        assert float(implant_step["depth"]) == 12.0
        
        print(f"PASS: D1 3.5mm has correct sequence with final drill 3.2mm")
    
    def test_inno_submerged_d1_5_0mm_full_sequence(self):
        """Feature 5: INNO Submerged D1 5.0mm - Full drilling sequence"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 5.0,
            "length": 14,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify final drill is 4.8mm for 5.0mm implant
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 4.8
        
        # Verify all intermediate drills present: 2.8, 3.2, 3.6, 4.2, 4.8
        drill_diameters = [s["diameter"] for s in steps if s["drill_type"] in ("Drill", "Final Drill")]
        assert 2.8 in drill_diameters
        assert 3.2 in drill_diameters
        assert 3.6 in drill_diameters
        assert 4.2 in drill_diameters
        assert 4.8 in drill_diameters
        
        print(f"PASS: D1 5.0mm has full sequence with final drill 4.8mm")
    
    # ========== INNO SUBMERGED D2 TESTS ==========
    
    def test_inno_submerged_d2_full_drilling_with_countersink_no_bone_tap(self):
        """Feature 6: INNO Submerged D2 - Full drilling + Countersink (if cortical thick), NO Bone Tap"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Dense Bone Protocol" in data["protocol_type"]
        
        # Verify Countersink step exists
        countersink_step = next((s for s in steps if s["drill_type"] == "Countersink"), None)
        assert countersink_step is not None, "Countersink step missing for D2"
        assert "cortical" in countersink_step.get("note", "").lower()
        
        # Verify NO Bone Tap for D2
        bone_tap_step = next((s for s in steps if s["drill_type"] == "Bone Tap"), None)
        assert bone_tap_step is None, "Bone Tap should NOT be present for D2"
        
        # Verify final drill is 4.2mm for 4.5mm implant
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 4.2
        
        print(f"PASS: D2 4.5mm has Countersink but NO Bone Tap")
    
    # ========== INNO SUBMERGED D3/D4 TESTS ==========
    
    def test_inno_submerged_d3_under_preparation(self):
        """Feature 7: INNO Submerged D3 - Under-preparation (skip final drill)"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Under-Preparation" in data["protocol_type"]
        
        # For 4.0mm implant, under-prep stops at 3.2mm (skips 3.6mm final)
        drill_diameters = [s["diameter"] for s in steps if s["drill_type"] in ("Drill", "Final Drill")]
        assert 3.6 not in drill_diameters, "D3 should skip final drill 3.6mm for 4.0mm implant"
        assert 3.2 in drill_diameters, "D3 should stop at 3.2mm for 4.0mm implant"
        
        # Verify NO Countersink or Bone Tap
        assert not any(s["drill_type"] == "Countersink" for s in steps)
        assert not any(s["drill_type"] == "Bone Tap" for s in steps)
        
        print(f"PASS: D3 4.0mm under-preparation stops at 3.2mm")
    
    def test_inno_submerged_d4_under_preparation(self):
        """Feature 8: INNO Submerged D4 - Under-preparation (skip final drill)"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 5.0,
            "length": 16,
            "bone_density": "D4"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Under-Preparation" in data["protocol_type"]
        
        # For 5.0mm implant, under-prep stops at 4.2mm (skips 4.8mm final)
        drill_diameters = [s["diameter"] for s in steps if s["drill_type"] in ("Drill", "Final Drill")]
        assert 4.8 not in drill_diameters, "D4 should skip final drill 4.8mm for 5.0mm implant"
        assert 4.2 in drill_diameters, "D4 should stop at 4.2mm for 5.0mm implant"
        
        print(f"PASS: D4 5.0mm under-preparation stops at 4.2mm")
    
    def test_inno_submerged_d3_3_5mm_under_preparation(self):
        """Feature 9: INNO Submerged D3 3.5mm - Under-preparation stops at 2.8mm"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 3.5,
            "length": 8,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # For 3.5mm implant, under-prep stops at 2.8mm (skips 3.2mm final)
        drill_diameters = [s["diameter"] for s in steps if s["drill_type"] in ("Drill", "Final Drill")]
        assert 3.2 not in drill_diameters, "D3 should skip final drill 3.2mm for 3.5mm implant"
        assert 2.8 in drill_diameters, "D3 should stop at 2.8mm for 3.5mm implant"
        
        print(f"PASS: D3 3.5mm under-preparation stops at 2.8mm")
    
    # ========== INNO NARROW TESTS ==========
    
    def test_inno_narrow_d1_full_sequence(self):
        """Feature 10: INNO Narrow D1 - Pilot + 2.8 + Final Drill + Implant"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged Narrow",
            "diameter": 3.3,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Dense Bone Protocol" in data["protocol_type"]
        assert "INNO Narrow" in data["protocol_type"]
        
        # Verify sequence: Round → Pilot 2.0 → Drill 2.8 → Final Drill 3.3 → Implant
        drill_types = [s["drill_type"] for s in steps]
        assert "Round Drill" in drill_types
        assert "Pilot Drill" in drill_types
        assert "Implant Placement" in drill_types
        
        # Verify 2.8mm drill present
        assert any(s["diameter"] == 2.8 for s in steps if s["drill_type"] == "Drill")
        
        # Verify final drill matches implant diameter (3.3mm)
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 3.3
        
        print(f"PASS: INNO Narrow D1 3.3mm has correct sequence with final drill 3.3mm")
    
    def test_inno_narrow_d2_full_sequence(self):
        """Feature 11: INNO Narrow D2 - Pilot + 2.8 + Final Drill + Implant"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged Narrow",
            "diameter": 3.1,
            "length": 12,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Dense Bone Protocol" in data["protocol_type"]
        
        # Verify 2.8mm drill present
        assert any(s["diameter"] == 2.8 for s in steps if s["drill_type"] == "Drill")
        
        # Verify final drill matches implant diameter (3.1mm)
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is not None
        assert final_drill["diameter"] == 3.1
        
        print(f"PASS: INNO Narrow D2 3.1mm has correct sequence with final drill 3.1mm")
    
    def test_inno_narrow_d3_under_preparation(self):
        """Feature 12: INNO Narrow D3 - Pilot + 2.8 (skip final drill) + Implant"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged Narrow",
            "diameter": 3.3,
            "length": 10,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Under-Preparation" in data["protocol_type"]
        
        # Verify NO final drill (skipped for soft bone)
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is None, "D3 should skip final drill for INNO Narrow"
        
        # Verify 2.8mm drill present with under-preparation note
        drill_2_8 = next((s for s in steps if s["diameter"] == 2.8 and s["drill_type"] == "Drill"), None)
        assert drill_2_8 is not None
        assert "Under-preparation" in drill_2_8.get("note", "") or "skip" in drill_2_8.get("note", "").lower()
        
        print(f"PASS: INNO Narrow D3 3.3mm under-preparation skips final drill")
    
    def test_inno_narrow_d4_under_preparation(self):
        """Feature 13: INNO Narrow D4 - Pilot + 2.8 (skip final drill) + Implant"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged Narrow",
            "diameter": 3.1,
            "length": 14,
            "bone_density": "D4"
        })
        assert response.status_code == 200
        
        data = response.json()
        steps = data["steps"]
        
        # Verify protocol type
        assert "Under-Preparation" in data["protocol_type"]
        
        # Verify NO final drill
        final_drill = next((s for s in steps if s["drill_type"] == "Final Drill"), None)
        assert final_drill is None, "D4 should skip final drill for INNO Narrow"
        
        print(f"PASS: INNO Narrow D4 3.1mm under-preparation skips final drill")
    
    # ========== DEPTH AND TORQUE TESTS ==========
    
    def test_depth_equals_implant_length(self):
        """Feature 14: Depth = Implant Length (no offset)"""
        session = get_session()
        test_cases = [
            ("INNO Submerged", 4.0, 7),
            ("INNO Submerged", 4.5, 18),
            ("INNO Submerged Narrow", 3.3, 8),
            ("INNO Submerged Narrow", 3.1, 14),
        ]
        
        for system, diameter, length in test_cases:
            response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "Cowellmedi",
                "system": system,
                "diameter": diameter,
                "length": length,
                "bone_density": "D2"
            })
            assert response.status_code == 200
            
            data = response.json()
            steps = data["steps"]
            
            # Verify depth in drilling steps equals implant length
            for step in steps:
                if step["drill_type"] in ("Pilot Drill", "Drill", "Final Drill", "Implant Placement"):
                    if step["depth"] != "Mark site" and step["depth"] != "Cortical":
                        assert float(step["depth"]) == float(length), f"Depth should be {length} for {system} {diameter}x{length}"
            
            print(f"PASS: {system} {diameter}x{length} depth = {length}")
    
    def test_insertion_torque_25_45_ncm(self):
        """Feature 15: Insertion torque = 25-45 Ncm in notes"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 4.0,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert any("25-45 Ncm" in note for note in data["notes"]), "Insertion torque 25-45 Ncm not found in notes"
        
        print(f"PASS: Insertion torque 25-45 Ncm in notes")
    
    # ========== PDF EXPORT TESTS ==========
    
    def test_pdf_export_inno_submerged(self):
        """Feature 16: PDF export for INNO Submerged returns valid PDF"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged",
            "diameter": 4.5,
            "length": 12,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 1000, "PDF content too small"
        
        print(f"PASS: INNO Submerged PDF export returns valid PDF ({len(response.content)} bytes)")
    
    def test_pdf_export_inno_narrow(self):
        """Feature 17: PDF export for INNO Narrow returns valid PDF"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "Cowellmedi",
            "system": "INNO Submerged Narrow",
            "diameter": 3.3,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 1000, "PDF content too small"
        
        print(f"PASS: INNO Narrow PDF export returns valid PDF ({len(response.content)} bytes)")
    
    # ========== REGRESSION TESTS ==========
    
    def test_regression_mis_lance_still_works(self):
        """Regression: MIS Lance+ still works"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "MIS",
            "system": "Lance +",
            "diameter": 4.2,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["system_name"] == "MIS LANCE+"
        assert len(data["steps"]) > 0
        assert any("35-50 Ncm" in note for note in data["notes"])
        
        print(f"PASS: MIS Lance+ regression - {len(data['steps'])} steps")
    
    def test_regression_ankylos_still_works(self):
        """Regression: Ankylos C/X still works"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 3.5,
            "length": 9.5,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "Ankylos" in data["system_name"]
        assert len(data["steps"]) > 0
        
        print(f"PASS: Ankylos C/X regression - {len(data['steps'])} steps")
    
    def test_regression_bb_dental_3p_still_works(self):
        """Regression: B&B Dental 3P still works"""
        session = get_session()
        response = session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P",
            "diameter": 3.75,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "3P" in data["system_name"]
        assert len(data["steps"]) > 0
        
        # B&B Dental: drilling depth = length + 0.5, but implant placement depth = length
        implant_step = next((s for s in data["steps"] if s["drill_type"] == "Implant Placement"), None)
        assert implant_step is not None
        assert float(implant_step["depth"]) == 10.0  # Implant placement uses actual length
        
        # Verify drilling steps use depth + 0.5
        pilot_step = next((s for s in data["steps"] if s["drill_type"] == "Pilot Drill"), None)
        assert pilot_step is not None
        assert float(pilot_step["depth"]) == 10.5  # Drilling uses length + 0.5
        
        print(f"PASS: B&B Dental 3P regression - {len(data['steps'])} steps")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
