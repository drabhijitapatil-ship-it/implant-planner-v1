"""
B&B Dental Drilling Protocol Tests - Iteration 50
Tests all 5 B&B Dental implant systems: EV Line, 3P, 3P Long, Wide Line, Dura-Vit Slim

Key Rules:
- Drill Depth = Implant Length + 0.5mm
- Dense bone (D1/D2): Final Drill + Countersink
- Soft bone (D3/D4): Undersized Final Drill + optional Compactor (3P/3P Long only)
- Wide Line: Standard sequential drilling
- Dura-Vit Slim: Simplified narrow sequence

Countersink mapping:
- 3.5 → NECK-334
- 3.75 → NECK-334
- 4.0 → NECK-354
- 4.5 → NECK-455
- 5.0 → NECK-455
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def auth_session():
    """Session-scoped authentication to avoid rate limiting"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login once for all tests
    login_response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "Abhijit.patil",
        "password": "Admin@123"
    })
    assert login_response.status_code == 200, f"Login failed: {login_response.text}"
    token = login_response.json().get("token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    
    return session


class TestBBDentalDrillingProtocols:
    """B&B Dental drilling protocol tests"""
    
    # ─── Test 1: All B&B systems appear in available protocols ───
    def test_bb_dental_systems_in_available_protocols(self, auth_session):
        """All 5 B&B Dental systems should appear in GET /api/drilling-protocols/available"""
        response = auth_session.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Response is a list of systems
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # Find B&B Dental systems
        bb_systems = [s["system"] for s in data if s.get("brand") == "B&B Dental"]
        expected_systems = ["EV Line", "3P", "3P Long", "Wide Line", "Dura-Vit Slim"]
        
        for expected in expected_systems:
            assert expected in bb_systems, f"B&B Dental {expected} not found in available protocols"
        
        print(f"PASS: All 5 B&B Dental systems found: {bb_systems}")
    
    # ─── Test 2: EV Line 4.5x10 D3 - 5 steps ───
    def test_ev_line_4_5x10_d3(self, auth_session):
        """EV Line 4.5x10 D3: 5 steps (Pilot 2.1, Drill 3.0, 3.5, Final 4.0, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "EV Line",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D3",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 5 steps
        assert len(steps) == 5, f"Expected 5 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Final Drill" and steps[3]["diameter"] == 4.0
        assert "Implant Placement" in steps[4]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: EV Line 4.5x10 D3 - {len(steps)} steps, depth={steps[0]['depth']}")
    
    # ─── Test 3: EV Line 4.5x10 D1 - 7 steps with Countersink ───
    def test_ev_line_4_5x10_d1(self, auth_session):
        """EV Line 4.5x10 D1: 7 steps (Pilot 2.1, Drill 3.0, 3.5, 4.0, Final 4.5, Countersink NECK-455, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "EV Line",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D1",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 7 steps for dense bone
        assert len(steps) == 7, f"Expected 7 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Drill" and steps[3]["diameter"] == 4.0
        assert steps[4]["drill_type"] == "Final Drill" and steps[4]["diameter"] == 4.5
        assert "Countersink" in steps[5]["drill_type"] and "NECK-455" in steps[5]["drill_type"]
        assert "Implant Placement" in steps[6]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: EV Line 4.5x10 D1 - {len(steps)} steps with Countersink NECK-455")
    
    # ─── Test 4: EV Line 5.0x12 D3 - 6 steps ───
    def test_ev_line_5_0x12_d3(self, auth_session):
        """EV Line 5.0x12 D3: 6 steps (Pilot 2.1, 3.0, 3.5, 4.0, Final 4.5, Place). Depth=12.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "EV Line",
            "diameter": 5.0,
            "length": 12,
            "bone_density": "D3",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 6 steps
        assert len(steps) == 6, f"Expected 6 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Drill" and steps[3]["diameter"] == 4.0
        assert steps[4]["drill_type"] == "Final Drill" and steps[4]["diameter"] == 4.5
        assert "Implant Placement" in steps[5]["drill_type"]
        
        # Verify depth = 12.5
        assert steps[0]["depth"] == "12.5", f"Expected depth 12.5, got {steps[0]['depth']}"
        
        print(f"PASS: EV Line 5.0x12 D3 - {len(steps)} steps, depth={steps[0]['depth']}")
    
    # ─── Test 5: 3P 4.0x12 D2 - 6 steps with Countersink ───
    def test_3p_4_0x12_d2(self, auth_session):
        """3P 4.0x12 D2: 6 steps (Pilot, 3.0, 3.5, Final 4.0, Countersink NECK-354, Place). Depth=12.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P",
            "diameter": 4.0,
            "length": 12,
            "bone_density": "D2",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 6 steps for dense bone
        assert len(steps) == 6, f"Expected 6 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Final Drill" and steps[3]["diameter"] == 4.0
        assert "Countersink" in steps[4]["drill_type"] and "NECK-354" in steps[4]["drill_type"]
        assert "Implant Placement" in steps[5]["drill_type"]
        
        # Verify depth = 12.5
        assert steps[0]["depth"] == "12.5", f"Expected depth 12.5, got {steps[0]['depth']}"
        
        print(f"PASS: 3P 4.0x12 D2 - {len(steps)} steps with Countersink NECK-354")
    
    # ─── Test 6: 3P 4.0x12 D4 - 5 steps with Compactor ───
    def test_3p_4_0x12_d4(self, auth_session):
        """3P 4.0x12 D4: 5 steps (Pilot, 3.0, Final 3.5, Compactor 4.0, Place). Depth=12.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P",
            "diameter": 4.0,
            "length": 12,
            "bone_density": "D4",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 5 steps for soft bone with compactor
        assert len(steps) == 5, f"Expected 5 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Final Drill" and steps[2]["diameter"] == 3.5
        assert "Compactor" in steps[3]["drill_type"] and steps[3]["diameter"] == 4.0
        assert "Implant Placement" in steps[4]["drill_type"]
        
        # Verify depth = 12.5
        assert steps[0]["depth"] == "12.5", f"Expected depth 12.5, got {steps[0]['depth']}"
        
        print(f"PASS: 3P 4.0x12 D4 - {len(steps)} steps with Compactor")
    
    # ─── Test 7: 3P 5.0x10 D1 - 8 steps ───
    def test_3p_5_0x10_d1(self, auth_session):
        """3P 5.0x10 D1: 8 steps (Pilot, 3.0, 3.5, 4.0, 4.5, Final 5.0, Countersink NECK-455, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P",
            "diameter": 5.0,
            "length": 10,
            "bone_density": "D1",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 8 steps for dense bone with 5.0mm diameter
        assert len(steps) == 8, f"Expected 8 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Drill" and steps[3]["diameter"] == 4.0
        assert steps[4]["drill_type"] == "Drill" and steps[4]["diameter"] == 4.5
        assert steps[5]["drill_type"] == "Final Drill" and steps[5]["diameter"] == 5.0
        assert "Countersink" in steps[6]["drill_type"] and "NECK-455" in steps[6]["drill_type"]
        assert "Implant Placement" in steps[7]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: 3P 5.0x10 D1 - {len(steps)} steps with Countersink NECK-455")
    
    # ─── Test 8: 3P Long 3.75x20 D1 - 6 steps ───
    def test_3p_long_3_75x20_d1(self, auth_session):
        """3P Long 3.75x20 D1: 6 steps (Pilot, 3.0, 3.5, Final 3.75, Countersink NECK-334, Place). Depth=20.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P Long",
            "diameter": 3.75,
            "length": 20,
            "bone_density": "D1",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 6 steps for dense bone
        assert len(steps) == 6, f"Expected 6 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Drill" and steps[2]["diameter"] == 3.5
        assert steps[3]["drill_type"] == "Final Drill" and steps[3]["diameter"] == 3.75
        assert "Countersink" in steps[4]["drill_type"] and "NECK-334" in steps[4]["drill_type"]
        assert "Implant Placement" in steps[5]["drill_type"]
        
        # Verify depth = 20.5
        assert steps[0]["depth"] == "20.5", f"Expected depth 20.5, got {steps[0]['depth']}"
        
        print(f"PASS: 3P Long 3.75x20 D1 - {len(steps)} steps with Countersink NECK-334")
    
    # ─── Test 9: 3P Long 3.75x20 D3 - 5 steps with Compactor ───
    def test_3p_long_3_75x20_d3(self, auth_session):
        """3P Long 3.75x20 D3: 5 steps (Pilot, 3.0, Final 3.5, Compactor 3.75, Place). Depth=20.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "3P Long",
            "diameter": 3.75,
            "length": 20,
            "bone_density": "D3",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 5 steps for soft bone with compactor
        assert len(steps) == 5, f"Expected 5 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Final Drill" and steps[2]["diameter"] == 3.5
        assert "Compactor" in steps[3]["drill_type"] and steps[3]["diameter"] == 3.75
        assert "Implant Placement" in steps[4]["drill_type"]
        
        # Verify depth = 20.5
        assert steps[0]["depth"] == "20.5", f"Expected depth 20.5, got {steps[0]['depth']}"
        
        print(f"PASS: 3P Long 3.75x20 D3 - {len(steps)} steps with Compactor")
    
    # ─── Test 10: Wide Line 6.0x10 D3 - 9 steps ───
    def test_wide_line_6_0x10_d3(self, auth_session):
        """Wide Line 6.0x10 D3: 9 steps (Pilot, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, Final 6.0, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Wide Line",
            "diameter": 6.0,
            "length": 10,
            "bone_density": "D3",
            "tooth": "16"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 9 steps for Wide Line 6.0mm
        assert len(steps) == 9, f"Expected 9 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["diameter"] == 3.0
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 4.0
        assert steps[4]["diameter"] == 4.5
        assert steps[5]["diameter"] == 5.0
        assert steps[6]["diameter"] == 5.5
        assert steps[7]["drill_type"] == "Final Drill" and steps[7]["diameter"] == 6.0
        assert "Implant Placement" in steps[8]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: Wide Line 6.0x10 D3 - {len(steps)} steps, depth={steps[0]['depth']}")
    
    # ─── Test 11: Wide Line 5.5x8 D3 - 8 steps ───
    def test_wide_line_5_5x8_d3(self, auth_session):
        """Wide Line 5.5x8 D3: 8 steps (Pilot, 3.0, 3.5, 4.0, 4.5, 5.0, Final 5.5, Place). Depth=8.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Wide Line",
            "diameter": 5.5,
            "length": 8,
            "bone_density": "D3",
            "tooth": "16"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 8 steps for Wide Line 5.5mm
        assert len(steps) == 8, f"Expected 8 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["diameter"] == 3.0
        assert steps[2]["diameter"] == 3.5
        assert steps[3]["diameter"] == 4.0
        assert steps[4]["diameter"] == 4.5
        assert steps[5]["diameter"] == 5.0
        assert steps[6]["drill_type"] == "Final Drill" and steps[6]["diameter"] == 5.5
        assert "Implant Placement" in steps[7]["drill_type"]
        
        # Verify depth = 8.5
        assert steps[0]["depth"] == "8.5", f"Expected depth 8.5, got {steps[0]['depth']}"
        
        print(f"PASS: Wide Line 5.5x8 D3 - {len(steps)} steps, depth={steps[0]['depth']}")
    
    # ─── Test 12: Dura-Vit Slim 3.4x10 D3 - 4 steps ───
    def test_dura_vit_slim_3_4x10_d3(self, auth_session):
        """Dura-Vit Slim 3.4x10 D3: 4 steps (Pilot 2.1, Drill 3.0, Optional 3.2, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Dura-Vit Slim",
            "diameter": 3.4,
            "length": 10,
            "bone_density": "D3",
            "tooth": "12"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 4 steps for Dura-Vit Slim in soft bone
        assert len(steps) == 4, f"Expected 4 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert "Optional" in steps[2]["drill_type"] and steps[2]["diameter"] == 3.2
        assert "Implant Placement" in steps[3]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: Dura-Vit Slim 3.4x10 D3 - {len(steps)} steps with Optional drill")
    
    # ─── Test 13: Dura-Vit Slim 3.4x10 D1 - 4 steps ───
    def test_dura_vit_slim_3_4x10_d1(self, auth_session):
        """Dura-Vit Slim 3.4x10 D1: 4 steps (Pilot 2.1, Drill 3.0, Final 3.4, Place). Depth=10.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Dura-Vit Slim",
            "diameter": 3.4,
            "length": 10,
            "bone_density": "D1",
            "tooth": "12"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 4 steps for Dura-Vit Slim in dense bone
        assert len(steps) == 4, f"Expected 4 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert steps[2]["drill_type"] == "Final Drill" and steps[2]["diameter"] == 3.4
        assert "Implant Placement" in steps[3]["drill_type"]
        
        # Verify depth = 10.5
        assert steps[0]["depth"] == "10.5", f"Expected depth 10.5, got {steps[0]['depth']}"
        
        print(f"PASS: Dura-Vit Slim 3.4x10 D1 - {len(steps)} steps with Final Drill")
    
    # ─── Test 14: Dura-Vit Slim 3.0x12 D3 - 3 steps ───
    def test_dura_vit_slim_3_0x12_d3(self, auth_session):
        """Dura-Vit Slim 3.0x12 D3: 3 steps (Pilot 2.1, Drill 3.0, Place). Depth=12.5"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Dura-Vit Slim",
            "diameter": 3.0,
            "length": 12,
            "bone_density": "D3",
            "tooth": "12"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Should have 3 steps for Dura-Vit Slim 3.0mm
        assert len(steps) == 3, f"Expected 3 steps, got {len(steps)}: {[s['drill_type'] for s in steps]}"
        
        # Verify step sequence
        assert steps[0]["drill_type"] == "Pilot Drill" and steps[0]["diameter"] == 2.1
        assert steps[1]["drill_type"] == "Drill" and steps[1]["diameter"] == 3.0
        assert "Implant Placement" in steps[2]["drill_type"]
        
        # Verify depth = 12.5
        assert steps[0]["depth"] == "12.5", f"Expected depth 12.5, got {steps[0]['depth']}"
        
        print(f"PASS: Dura-Vit Slim 3.0x12 D3 - {len(steps)} steps, depth={steps[0]['depth']}")
    
    # ─── Test 15: PDF Export for B&B Dental ───
    def test_pdf_export_bb_dental(self, auth_session):
        """PDF export works for B&B Dental systems"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "B&B Dental",
            "system": "EV Line",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D3",
            "tooth": "14"
        })
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        # Check content type is PDF
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or len(response.content) > 0, "Response is not a PDF"
        
        # Check PDF content starts with %PDF
        assert response.content[:4] == b'%PDF', "Response content is not a valid PDF"
        
        print(f"PASS: PDF export for B&B Dental EV Line - {len(response.content)} bytes")
    
    # ─── Test 16: Verify EV Line does NOT have Compactor in soft bone ───
    def test_ev_line_no_compactor_soft_bone(self, auth_session):
        """EV Line should NOT have Compactor step in soft bone (only 3P/3P Long have it)"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "EV Line",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D4",
            "tooth": "14"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Check no Compactor step
        compactor_steps = [s for s in steps if "Compactor" in s.get("drill_type", "")]
        assert len(compactor_steps) == 0, f"EV Line should not have Compactor, found: {compactor_steps}"
        
        print(f"PASS: EV Line D4 has no Compactor step (correct behavior)")
    
    # ─── Test 17: Verify Wide Line does NOT have Countersink in dense bone ───
    def test_wide_line_no_countersink_dense_bone(self, auth_session):
        """Wide Line uses standard sequential drilling, no Countersink even in dense bone"""
        response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "B&B Dental",
            "system": "Wide Line",
            "diameter": 5.5,
            "length": 10,
            "bone_density": "D1",
            "tooth": "16"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        steps = data.get("steps", [])
        
        # Check no Countersink step
        countersink_steps = [s for s in steps if "Countersink" in s.get("drill_type", "")]
        assert len(countersink_steps) == 0, f"Wide Line should not have Countersink, found: {countersink_steps}"
        
        print(f"PASS: Wide Line D1 has no Countersink step (standard sequential drilling)")
    
    # ─── Test 18: Verify depth calculation for all systems ───
    def test_depth_calculation_all_systems(self, auth_session):
        """Verify Drill Depth = Implant Length + 0.5mm for all systems"""
        test_cases = [
            ("EV Line", 4.5, 10, "10.5"),
            ("3P", 4.0, 12, "12.5"),
            ("3P Long", 3.75, 20, "20.5"),
            ("Wide Line", 5.5, 8, "8.5"),
            ("Dura-Vit Slim", 3.4, 14, "14.5"),
        ]
        
        for system, diameter, length, expected_depth in test_cases:
            response = auth_session.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "B&B Dental",
                "system": system,
                "diameter": diameter,
                "length": length,
                "bone_density": "D3",
                "tooth": "14"
            })
            assert response.status_code == 200, f"Failed for {system}: {response.text}"
            
            data = response.json()
            steps = data.get("steps", [])
            
            # Check first step depth
            actual_depth = steps[0]["depth"]
            assert actual_depth == expected_depth, f"{system}: Expected depth {expected_depth}, got {actual_depth}"
            
            print(f"  {system} {diameter}x{length}: depth={actual_depth} ✓")
        
        print(f"PASS: Depth calculation correct for all 5 B&B Dental systems")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
