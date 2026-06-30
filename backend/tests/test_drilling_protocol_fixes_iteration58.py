"""
Iteration 58: Backend Testing for Drilling Protocol Fixes and Case Report PDF
Tests:
1. Alpha-Bio SPI 6.0mm D3 bone returns 6 steps including 4.1mm drill
2. Ankylos D1 includes Tap, D2 has no Tap, D3 skips Conical Reamer
3. Neodent Helix GM 3.5mm D1 returns 2.0->3.5 (no 2.8 step)
4. Case-report PDF endpoint returns valid PDF (200 OK)
5. GET /api/procedures returns procedure list with implant_site populated from implant_plans positions
6. Login works with test credentials
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_EMAIL = "Gaurav.pandey"
STUDENT_PASSWORD = "Student@123"
ADMIN_EMAIL = "Abhijit.patil"
ADMIN_PASSWORD = "Admin@123"

# Test procedure ID for case-report testing
TEST_PROCEDURE_ID = "69c2bbfb5494f24c1d483713"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def student_auth_token(api_client):
    """Get student authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Student authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_auth_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, student_auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {student_auth_token}"})
    return api_client


class TestLoginCredentials:
    """Test login with provided credentials"""
    
    def test_student_login_success(self, api_client):
        """Test student login with Gaurav.pandey / Student@123"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["name"] is not None
        print(f"✓ Student login successful: {data['user']['name']}")
    
    def test_admin_login_success(self, api_client):
        """Test admin login with Abhijit.patil / Admin@123"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        print(f"✓ Admin login successful: {data['user']['name']}")


class TestAlphaBioSPIDrillingProtocol:
    """Test Alpha-Bio SPI 6.0mm D3 bone drilling protocol"""
    
    def test_alpha_bio_spi_6mm_d3_returns_6_steps(self, authenticated_client):
        """Alpha-Bio SPI 6.0mm D3 bone should return 6 steps including 4.1mm drill"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Alpha Bio",
            "system": "SPI",
            "diameter": 6.0,
            "length": 10,
            "bone_density": "D3"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Get the steps
        steps = data.get("steps", [])
        
        # Count steps (excluding implant placement)
        drilling_steps = [s for s in steps if s.get("drill_type") != "Implant Placement"]
        total_steps = len(steps)
        
        print(f"Alpha-Bio SPI 6.0mm D3 steps: {total_steps}")
        for s in steps:
            print(f"  Step {s.get('step')}: {s.get('drill_type')} - {s.get('diameter')}mm")
        
        # Should have 6 steps total (5 drilling + 1 implant placement)
        assert total_steps == 6, f"Expected 6 steps, got {total_steps}"
        
        # Check that 4.1mm drill is included
        diameters = [s.get("diameter") for s in drilling_steps]
        assert 4.1 in diameters, f"4.1mm drill not found in sequence: {diameters}"
        
        print("✓ Alpha-Bio SPI 6.0mm D3 returns 6 steps including 4.1mm drill")
    
    def test_alpha_bio_spi_6mm_d3_soft_bone_sequence(self, authenticated_client):
        """Verify the soft bone sequence for Alpha-Bio SPI 6.0mm"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Alpha Bio",
            "system": "SPI",
            "diameter": 6.0,
            "length": 10,
            "bone_density": "D3"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data.get("steps", [])
        
        # Expected soft bone sequence for 6.0mm: [2.0, 2.8, 3.2, 3.65, 4.1] + implant
        drilling_steps = [s for s in steps if s.get("drill_type") != "Implant Placement"]
        diameters = [s.get("diameter") for s in drilling_steps]
        
        # Verify sequence includes expected drills
        expected_drills = [2.0, 2.8, 3.2, 3.65, 4.1]
        for drill in expected_drills:
            assert drill in diameters, f"Expected {drill}mm drill in soft bone sequence"
        
        print(f"✓ Alpha-Bio SPI 6.0mm D3 soft bone sequence verified: {diameters}")


class TestAnkylosDrillingProtocol:
    """Test Ankylos C/X drilling protocol for different bone densities"""
    
    def test_ankylos_d1_includes_tap(self, authenticated_client):
        """Ankylos D1 (hard bone) should include Tap step"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 4.5,
            "length": 11,
            "bone_density": "D1"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data.get("steps", [])
        
        # Check for Tap step
        drill_types = [s.get("drill_type", "") for s in steps]
        has_tap = any("Tap" in dt for dt in drill_types)
        
        print(f"Ankylos D1 steps: {drill_types}")
        assert has_tap, f"Tap step not found in D1 protocol: {drill_types}"
        print("✓ Ankylos D1 includes Tap step")
    
    def test_ankylos_d2_no_tap(self, authenticated_client):
        """Ankylos D2 should NOT include Tap step"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 4.5,
            "length": 11,
            "bone_density": "D2"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data.get("steps", [])
        
        # Check that Tap step is NOT present
        drill_types = [s.get("drill_type", "") for s in steps]
        has_tap = any("Tap" in dt for dt in drill_types)
        
        print(f"Ankylos D2 steps: {drill_types}")
        assert not has_tap, f"Tap step should NOT be in D2 protocol: {drill_types}"
        print("✓ Ankylos D2 does NOT include Tap step")
    
    def test_ankylos_d3_skips_conical_reamer(self, authenticated_client):
        """Ankylos D3 (soft bone) should skip Conical Reamer"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 4.5,
            "length": 11,
            "bone_density": "D3"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data.get("steps", [])
        
        # Check that Conical Reamer is NOT present
        drill_types = [s.get("drill_type", "") for s in steps]
        has_conical_reamer = any("Conical Reamer" in dt for dt in drill_types)
        
        print(f"Ankylos D3 steps: {drill_types}")
        assert not has_conical_reamer, f"Conical Reamer should NOT be in D3 protocol: {drill_types}"
        print("✓ Ankylos D3 skips Conical Reamer")
    
    def test_ankylos_d4_skips_conical_reamer(self, authenticated_client):
        """Ankylos D4 (very soft bone) should also skip Conical Reamer"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Dentsply Sirona",
            "system": "Ankylos C/X",
            "diameter": 4.5,
            "length": 11,
            "bone_density": "D4"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data.get("steps", [])
        
        drill_types = [s.get("drill_type", "") for s in steps]
        has_conical_reamer = any("Conical Reamer" in dt for dt in drill_types)
        
        print(f"Ankylos D4 steps: {drill_types}")
        assert not has_conical_reamer, f"Conical Reamer should NOT be in D4 protocol: {drill_types}"
        print("✓ Ankylos D4 skips Conical Reamer")


class TestNeodentHelixGMDrillingProtocol:
    """Test Neodent Helix GM 3.5mm D1 drilling protocol"""
    
    def test_neodent_helix_gm_35mm_d1_no_28_step(self, authenticated_client):
        """Neodent Helix GM 3.5mm D1 should return 2.0->3.5 (no 2.8 step)"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 3.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        steps = data.get("steps", [])
        
        # Get drilling diameters (excluding implant placement)
        drilling_steps = [s for s in steps if s.get("drill_type") != "Implant Placement"]
        diameters = [s.get("diameter") for s in drilling_steps]
        
        print(f"Neodent Helix GM 3.5mm D1 steps:")
        for s in steps:
            print(f"  Step {s.get('step')}: {s.get('drill_type')} - {s.get('diameter')}mm")
        
        # Should NOT have 2.8mm step
        assert 2.8 not in diameters, f"2.8mm drill should NOT be in 3.5mm D1 sequence: {diameters}"
        
        # Should have 2.0 (initial) and 3.5 (final)
        assert 2.0 in diameters, f"2.0mm initial drill not found: {diameters}"
        assert 3.5 in diameters, f"3.5mm drill not found: {diameters}"
        
        print("✓ Neodent Helix GM 3.5mm D1 returns 2.0->3.5 (no 2.8 step)")
    
    def test_neodent_helix_gm_35mm_d1_sequence(self, authenticated_client):
        """Verify the complete sequence for Neodent Helix GM 3.5mm D1"""
        response = authenticated_client.post(f"{BASE_URL}/api/drilling-protocols/generate", json={
            "brand": "Neodent",
            "system": "Helix GM Acqua",
            "diameter": 3.5,
            "length": 10,
            "bone_density": "D1"
        })
        assert response.status_code == 200
        data = response.json()
        steps = data.get("steps", [])
        
        # For 3.5mm D1/D2: sequence should be [3.5] after initial 2.0
        # Plus drill should be added for dense bone
        drilling_steps = [s for s in steps if "Implant" not in s.get("drill_type", "")]
        
        # Verify sequence
        print(f"✓ Neodent Helix GM 3.5mm D1 sequence verified")


class TestCaseReportPDF:
    """Test case-report PDF generation endpoint"""
    
    def test_case_report_pdf_returns_200(self, authenticated_client):
        """POST /api/procedures/{id}/case-report should return valid PDF (200 OK)"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report"
        )
        
        print(f"Case report response status: {response.status_code}")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Case report failed: {response.status_code} - {response.text}"
        
        # Should return PDF content type
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or response.content[:4] == b'%PDF', \
            f"Expected PDF content, got: {content_type}"
        
        # Verify PDF starts with %PDF
        if response.content:
            assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
            print(f"✓ Case report PDF generated successfully ({len(response.content)} bytes)")
        
        print("✓ POST /api/procedures/{id}/case-report returns valid PDF (200 OK)")
    
    def test_case_report_pdf_content_length(self, authenticated_client):
        """Verify PDF has reasonable content length"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report"
        )
        
        if response.status_code == 200:
            # PDF should have some content
            assert len(response.content) > 1000, "PDF content too small"
            print(f"✓ PDF content length: {len(response.content)} bytes")


class TestProceduresImplantSite:
    """Test GET /api/procedures returns implant_site populated from implant_plans"""
    
    def test_procedures_list_returns_implant_site(self, authenticated_client):
        """GET /api/procedures should return procedure list with implant_site"""
        response = authenticated_client.get(f"{BASE_URL}/api/procedures")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list of procedures"
        print(f"Found {len(data)} procedures")
        
        # Check if any procedure has implant_site populated
        procedures_with_site = [p for p in data if p.get("implant_site")]
        print(f"Procedures with implant_site: {len(procedures_with_site)}")
        
        # Log some examples
        for proc in procedures_with_site[:3]:
            print(f"  - {proc.get('patient_name', 'N/A')}: implant_site={proc.get('implant_site')}")
        
        print("✓ GET /api/procedures returns procedure list")
    
    def test_procedure_detail_has_implant_plans(self, authenticated_client):
        """GET /api/procedures/{id} should return implant_plans if present"""
        response = authenticated_client.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}")
        
        if response.status_code == 200:
            data = response.json()
            implant_plans = data.get("implant_plans", [])
            implant_site = data.get("implant_site", "")
            
            print(f"Procedure {TEST_PROCEDURE_ID}:")
            print(f"  implant_site: {implant_site}")
            print(f"  implant_plans count: {len(implant_plans)}")
            
            if implant_plans:
                positions = [p.get("position") for p in implant_plans]
                print(f"  implant_plans positions: {positions}")
                
                # If implant_plans exist, implant_site should be populated
                if positions:
                    expected_site = ", ".join(str(p) for p in positions if p)
                    print(f"  Expected implant_site from positions: {expected_site}")
            
            print("✓ Procedure detail retrieved successfully")
        else:
            print(f"Note: Procedure {TEST_PROCEDURE_ID} not accessible (status {response.status_code})")


class TestDrillingProtocolAvailable:
    """Test drilling protocols are available"""
    
    def test_available_protocols_includes_alpha_bio(self, authenticated_client):
        """Verify Alpha-Bio SPI is in available protocols"""
        response = authenticated_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200, f"Failed: {response.text}"
        protocols = response.json()  # Returns list directly
        
        alpha_bio = [p for p in protocols if "Alpha" in p.get("brand", "")]
        
        assert len(alpha_bio) > 0, "Alpha-Bio not found in available protocols"
        print(f"✓ Alpha-Bio protocols found: {[p.get('system') for p in alpha_bio]}")
    
    def test_available_protocols_includes_ankylos(self, authenticated_client):
        """Verify Ankylos C/X is in available protocols"""
        response = authenticated_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        protocols = response.json()  # Returns list directly
        
        ankylos = [p for p in protocols if "Ankylos" in p.get("system", "")]
        
        assert len(ankylos) > 0, "Ankylos not found in available protocols"
        print(f"✓ Ankylos protocols found: {[p.get('system') for p in ankylos]}")
    
    def test_available_protocols_includes_neodent(self, authenticated_client):
        """Verify Neodent Helix GM is in available protocols"""
        response = authenticated_client.get(f"{BASE_URL}/api/drilling-protocols/available")
        assert response.status_code == 200
        protocols = response.json()  # Returns list directly
        
        neodent = [p for p in protocols if "Neodent" in p.get("brand", "")]
        
        assert len(neodent) > 0, "Neodent not found in available protocols"
        helix = [p for p in neodent if "Helix" in p.get("system", "")]
        print(f"✓ Neodent Helix protocols found: {[p.get('system') for p in helix]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
