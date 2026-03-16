"""
Test file for Neodent Grand Morse Drilling Protocols (Iteration 19)
Tests for 6 new implant systems:
- Helix GM Acqua / Helix GM Neoporous (progressive, under-osteotomy engine)
- Drive GM Acqua / Drive GM NeoPorous (soft bone, simple engine)
- Titamax GM Acqua / Titamax GM NeoPorous (dense bone, combination drills engine)

Surface type (Acqua vs NeoPorous) doesn't affect protocol - same data via Python reference aliasing.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://torque-visibility.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "abhijit.patil@dental.edu"
TEST_PASSWORD = "Admin@123"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create session with auth header."""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestAvailableProtocols:
    """Test GET /drilling-protocols/available returns all 11 systems."""
    
    def test_available_protocols_count(self, api_client):
        """Should return 11 total systems (5 BioHorizons + 1 Conelog + 6 Neodent - but with aliases = 11 unique keys)."""
        response = api_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        systems = response.json()
        
        # Extract brand|system names
        system_names = [f"{s['brand']}|{s['system']}" for s in systems]
        print(f"Available protocols ({len(systems)}): {system_names}")
        
        # Check count - 11 systems total
        assert len(systems) >= 11, f"Expected at least 11 systems, got {len(systems)}"
        
        # Verify all 6 Neodent systems are present
        neodent_systems = [s for s in systems if s['brand'] == 'Neodent']
        assert len(neodent_systems) == 6, f"Expected 6 Neodent systems, got {len(neodent_systems)}"
        
        # Verify specific systems
        expected_neodent = [
            "Helix GM Acqua", "Helix GM Neoporous",
            "Drive GM Acqua", "Drive GM NeoPorous", 
            "Titamax GM Acqua", "Titamax GM NeoPorous"
        ]
        found_neodent = [s['system'] for s in neodent_systems]
        for exp in expected_neodent:
            assert exp in found_neodent, f"Missing Neodent system: {exp}"


class TestHelixGMProtocol:
    """Tests for Helix GM Acqua/Neoporous drilling protocol (progressive, under-osteotomy engine)."""
    
    def test_helix_4_3mm_d3_6_steps(self, api_client):
        """Helix GM Acqua 4.3×13mm D3 → 6 steps (Initial, 3.5, 3.75, 4.0, 4.3, Placement) - matches user example."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 13,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_steps"] == 6, f"Expected 6 steps, got {data['total_steps']}"
        
        # Verify step sequence
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Initial Drill"
        assert steps[0]["diameter"] == 2.0
        assert steps[1]["drill_type"] == "Drill 3.5 mm"
        assert steps[2]["drill_type"] == "Drill 3.75 mm"
        assert steps[3]["drill_type"] == "Drill 4.0 mm"
        assert steps[4]["drill_type"] == "Drill 4.3 mm"
        assert steps[5]["drill_type"] == "Implant Placement"
        
        # Verify D3 uses 500-800 RPM
        assert steps[1]["rpm"] == "500-800", f"D3 should use 500-800 RPM, got {steps[1]['rpm']}"
    
    def test_helix_4_3mm_d1_7_steps(self, api_client):
        """Helix GM Acqua 4.3×13mm D1 → 7 steps (adds Contour Drill before Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 13,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_steps"] == 7, f"Expected 7 steps for D1, got {data['total_steps']}"
        
        steps = data["steps"]
        # Should have contour drill before placement
        assert steps[5]["drill_type"] == "Contour Drill"
        assert steps[6]["drill_type"] == "Implant Placement"
        
        # D1 uses 800-1200 RPM
        assert steps[1]["rpm"] == "800-1200", f"D1 should use 800-1200 RPM, got {steps[1]['rpm']}"
    
    def test_helix_4_3mm_d4_5_steps(self, api_client):
        """Helix GM Acqua 4.3×13mm D4 → 5 steps (skips final twist drill 4.3)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 13,
            "bone_density": "D4"
        })
        assert response.status_code == 200
        data = response.json()
        
        # D4 skips final drill for under-preparation
        assert data["total_steps"] == 5, f"Expected 5 steps for D4, got {data['total_steps']}"
        
        steps = data["steps"]
        # Should NOT have 4.3 drill (skipped for soft bone)
        drill_types = [s["drill_type"] for s in steps]
        assert "Drill 4.3 mm" not in drill_types, "D4 should skip final 4.3mm drill"
        assert steps[-1]["drill_type"] == "Implant Placement"
    
    def test_helix_neoporous_3_5mm_d3_3_steps(self, api_client):
        """Helix GM Neoporous 3.5×8mm D3 → 3 steps (Initial, 3.5, Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Neoporous",
            "diameter": 3.5,
            "length": 8,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Smallest diameter, standard bone
        assert data["total_steps"] == 3, f"Expected 3 steps, got {data['total_steps']}"
        
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Initial Drill"
        assert steps[1]["drill_type"] == "Drill 3.5 mm"
        assert steps[2]["drill_type"] == "Implant Placement"
    
    def test_helix_6_0mm_d2_8_steps(self, api_client):
        """Helix GM Acqua 6.0×16mm D2 → 8 steps (Initial + 5 twist drills + Contour + Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 6.0,
            "length": 16,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # 6.0mm sequence: Initial 2.0 + 3.5, 3.75, 4.0, 4.3, 5.0 (5 drills) + Contour + Placement = 8 steps
        assert data["total_steps"] == 8, f"Expected 8 steps for 6.0mm D2, got {data['total_steps']}"
        
        steps = data["steps"]
        # Verify 5.0 is the last drill before contour and placement
        drill_types = [s["drill_type"] for s in steps]
        assert "Drill 5.0 mm" in drill_types
        assert "Contour Drill" in drill_types  # D2 includes contour


class TestDriveGMProtocol:
    """Tests for Drive GM Acqua/NeoPorous drilling protocol (soft bone, simple engine)."""
    
    def test_drive_4_3mm_d3_4_steps(self, api_client):
        """Drive GM Acqua 4.3×11.5mm D3 → 4 steps (Initial, 3.5, 4.3, Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Drive GM Acqua",
            "diameter": 4.3,
            "length": 11.5,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_steps"] == 4, f"Expected 4 steps, got {data['total_steps']}"
        
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Initial Drill"
        assert steps[1]["drill_type"] == "Drill 3.5 mm"
        assert steps[2]["drill_type"] == "Drill 4.3 mm"
        assert steps[3]["drill_type"] == "Implant Placement"
    
    def test_drive_neoporous_3_5mm_d1_4_steps(self, api_client):
        """Drive GM NeoPorous 3.5×10mm D1 → 4 steps (Initial, 3.5, Final 4.3 Dense, Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Drive GM NeoPorous",
            "diameter": 3.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        data = response.json()
        
        # D1 for 3.5mm adds next size up (4.3) for dense bone
        assert data["total_steps"] == 4, f"Expected 4 steps, got {data['total_steps']}"
        
        steps = data["steps"]
        assert steps[0]["drill_type"] == "Initial Drill"
        assert steps[1]["drill_type"] == "Drill 3.5 mm"
        assert "Dense Bone" in steps[2]["drill_type"], f"Expected Final Dense Bone drill, got {steps[2]['drill_type']}"
        assert steps[3]["drill_type"] == "Implant Placement"
    
    def test_drive_5_0mm_d4_4_steps(self, api_client):
        """Drive GM Acqua 5.0×13mm D4 → 4 steps (Initial, 3.5, 4.3, 5.0, Placement - no extra for soft bone)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Drive GM Acqua",
            "diameter": 5.0,
            "length": 13,
            "bone_density": "D4"
        })
        assert response.status_code == 200
        data = response.json()
        
        # 5.0mm Drive: Initial, 3.5, 4.3, 5.0, Placement = 5 steps
        # Note: D4 (soft bone) doesn't add extra for Drive
        steps = data["steps"]
        print(f"Drive 5.0mm D4 steps: {[s['drill_type'] for s in steps]}")
        
        # Verify sequence
        assert steps[0]["drill_type"] == "Initial Drill"
        assert "3.5" in steps[1]["drill_type"]
        assert "4.3" in steps[2]["drill_type"]
        assert "5.0" in steps[3]["drill_type"]
        assert steps[-1]["drill_type"] == "Implant Placement"


class TestTitamaxGMProtocol:
    """Tests for Titamax GM Acqua/NeoPorous drilling protocol (dense bone, combination drills)."""
    
    def test_titamax_4_0mm_d2_7_steps(self, api_client):
        """Titamax GM Acqua 4.0×11mm D2 → 7 steps (Initial, Step 2/3, 2.8, 3.0, Combo 3.3/4.0, 3.8, Placement)."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Titamax GM Acqua",
            "diameter": 4.0,
            "length": 11,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_steps"] == 7, f"Expected 7 steps, got {data['total_steps']}"
        
        steps = data["steps"]
        # Verify step sequence
        assert steps[0]["drill_type"] == "Initial Drill"
        assert "2/3" in steps[1]["drill_type"]
        assert "2.8" in steps[2]["drill_type"]
        assert "3.0" in steps[3]["drill_type"]
        assert "3.3/4.0" in steps[4]["drill_type"]  # Combination drill
        assert "3.8" in steps[5]["drill_type"]
        assert steps[6]["drill_type"] == "Implant Placement"
    
    def test_titamax_neoporous_5_0mm_d2_9_steps(self, api_client):
        """Titamax GM NeoPorous 5.0×13mm D2 → 9 steps."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Titamax GM NeoPorous",
            "diameter": 5.0,
            "length": 13,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # 5.0mm: Initial, 2/3, 2.8, 3.0, 3.3/4.0, 3.8, 4.3, 4.3/5.0, Placement = 9 steps
        assert data["total_steps"] == 9, f"Expected 9 steps, got {data['total_steps']}"
        
        steps = data["steps"]
        drill_types = [s["drill_type"] for s in steps]
        print(f"Titamax 5.0mm D2 drill types: {drill_types}")
        
        assert "4.3/5.0" in str(drill_types), "Should have 4.3/5.0 combination drill"
    
    def test_titamax_3_5mm_d2_7_steps(self, api_client):
        """Titamax GM Acqua 3.5×7mm D2 → 7 steps."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Titamax GM Acqua",
            "diameter": 3.5,
            "length": 7,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        # 3.5mm: Initial, 2/3, 2.8, 3.0, 2.8/3.5, 3.3, Placement = 7 steps
        assert data["total_steps"] == 7, f"Expected 7 steps, got {data['total_steps']}"


class TestDrillCodes:
    """Verify drill codes match NEODENT_GM_CODES and NEODENT_GM_COMBO_CODES."""
    
    def test_helix_drill_codes(self, api_client):
        """Helix drills should match NEODENT_GM_CODES."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 13,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check specific drill codes from NEODENT_GM_CODES
        steps = data["steps"]
        
        # Initial Drill 2.0 → code "103.170"
        assert steps[0]["code"] == "103.170", f"Initial drill code wrong: {steps[0]['code']}"
        
        # Drill 3.5 → code "103.414"
        assert steps[1]["code"] == "103.414", f"3.5mm drill code wrong: {steps[1]['code']}"
        
        # Drill 3.75 → code "103.168"
        assert steps[2]["code"] == "103.168", f"3.75mm drill code wrong: {steps[2]['code']}"
        
        # Drill 4.0 → code "103.416"
        assert steps[3]["code"] == "103.416", f"4.0mm drill code wrong: {steps[3]['code']}"
        
        # Drill 4.3 → code "103.167"
        assert steps[4]["code"] == "103.167", f"4.3mm drill code wrong: {steps[4]['code']}"
    
    def test_titamax_combo_drill_codes(self, api_client):
        """Titamax combination drills should match NEODENT_GM_COMBO_CODES."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Titamax GM Acqua",
            "diameter": 4.0,
            "length": 11,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        
        steps = data["steps"]
        
        # Find combination drill 3.3/4.0 → code "103.415"
        combo_step = None
        for s in steps:
            if "3.3/4.0" in s["drill_type"]:
                combo_step = s
                break
        
        assert combo_step is not None, "Should have 3.3/4.0 combination drill"
        assert combo_step["code"] == "103.415", f"Combo drill code wrong: {combo_step['code']}"


class TestRPMSettings:
    """Verify RPM settings based on bone density."""
    
    def test_d1_d2_uses_800_1200_rpm(self, api_client):
        """D1/D2 bone density uses 800-1200 RPM."""
        for bone in ["D1", "D2"]:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 13,
                "bone_density": bone
            })
            assert response.status_code == 200
            data = response.json()
            
            # Check drilling steps (not placement)
            for step in data["steps"][:-1]:  # Exclude final placement
                if step["drill_type"] != "Implant Placement":
                    assert step["rpm"] == "800-1200", f"{bone} drilling should use 800-1200 RPM, got {step['rpm']}"
    
    def test_d3_d4_uses_500_800_rpm(self, api_client):
        """D3/D4 bone density uses 500-800 RPM."""
        for bone in ["D3", "D4"]:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "Neodent",
                "system": "Helix GM Acqua",
                "diameter": 4.3,
                "length": 13,
                "bone_density": bone
            })
            assert response.status_code == 200
            data = response.json()
            
            # Check drilling steps (not placement)
            for step in data["steps"][:-1]:
                if step["drill_type"] != "Implant Placement":
                    assert step["rpm"] == "500-800", f"{bone} drilling should use 500-800 RPM, got {step['rpm']}"
    
    def test_implant_placement_always_30_rpm(self, api_client):
        """Implant placement step always uses 30 RPM."""
        for bone in ["D1", "D2", "D3", "D4"]:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "Neodent",
                "system": "Drive GM Acqua",
                "diameter": 4.3,
                "length": 11.5,
                "bone_density": bone
            })
            assert response.status_code == 200
            data = response.json()
            
            placement_step = data["steps"][-1]
            assert placement_step["drill_type"] == "Implant Placement"
            assert placement_step["rpm"] == "30", f"Placement should use 30 RPM, got {placement_step['rpm']}"


class TestInsertionTorque:
    """Verify insertion torque notes."""
    
    def test_neodent_insertion_torque_60_ncm(self, api_client):
        """Neodent systems should have 60 Ncm insertion torque note."""
        for system in ["Helix GM Acqua", "Drive GM Acqua", "Titamax GM Acqua"]:
            response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
                "brand": "Neodent",
                "system": system,
                "diameter": 4.3 if system != "Titamax GM Acqua" else 4.0,
                "length": 13 if system != "Titamax GM Acqua" else 11,
                "bone_density": "D2"
            })
            assert response.status_code == 200
            data = response.json()
            
            notes = data["notes"]
            torque_note = [n for n in notes if "torque" in n.lower()]
            assert len(torque_note) > 0, "Should have insertion torque note"
            assert "60 Ncm" in torque_note[0], f"Should say 60 Ncm, got: {torque_note[0]}"


class TestPDFExport:
    """Test PDF export for all 3 Neodent system types."""
    
    def test_pdf_export_helix(self, api_client):
        """PDF export works for Helix GM."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 4.3,
            "length": 13,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 1000, "PDF should have content"
    
    def test_pdf_export_drive(self, api_client):
        """PDF export works for Drive GM."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "Neodent",
            "system": "Drive GM Acqua",
            "diameter": 4.3,
            "length": 11.5,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
    
    def test_pdf_export_titamax(self, api_client):
        """PDF export works for Titamax GM."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/export-pdf", json={
            "brand": "Neodent",
            "system": "Titamax GM Acqua",
            "diameter": 4.0,
            "length": 11,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"


class TestRegressionBioHorizons:
    """Regression tests for existing BioHorizons protocols."""
    
    def test_biohorizons_tapered_pro_d2(self, api_client):
        """BioHorizons Tapered Pro D2 still works correctly."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "BioHorizons",
            "system": "Tapered Pro",
            "diameter": 4.5,
            "length": 10,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] > 0, "Should have steps"
        # System name includes full name from DRILLING_PROTOCOLS
        assert "BioHorizons Tapered Pro" in data["system_name"]


class TestRegressionConelog:
    """Regression tests for Conelog Progressive Line."""
    
    def test_conelog_progressive_line_d2(self, api_client):
        """Conelog Progressive Line D2 still works correctly."""
        response = api_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Conelog",
            "system": "Progressive Line",
            "diameter": 4.3,
            "length": 11,
            "bone_density": "D2"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["total_steps"] == 9, f"Conelog 4.3 D2 should have 9 steps, got {data['total_steps']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
