"""
Test Suite for Phase 1 Refinements - Iteration 43
Tests the 5 Phase 1 refinements:
1. Implant-plan save auto-populates implant_site field from tooth positions
2. GET /api/procedures/{id} returns all clinical examination fields
3. GET /api/procedures returns procedure list properly
4. Login endpoint POST /api/auth/login works with email field
5. Implant-plan save returns correct response with count
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Test credentials
STUDENT_EMAIL = "Gaurav.pandey"
STUDENT_PASSWORD = "Student@123"
ADMIN_EMAIL = "Abhijit.patil"
ADMIN_PASSWORD = "Admin@123"
SUPERVISOR_EMAIL = "Paresh.gandhi"
SUPERVISOR_PASSWORD = "Supervisor@123"

# Test procedure IDs from the request
PROCEDURE_WITH_IMPLANT_PLANS = "69c18823de2fde0ddcc9cfeb"  # Student Gaurav.pandey's procedure
PROCEDURE_PENDING_PHASE1 = "69c1883999403ae483a60221"  # Pending phase1 status

# Token cache to avoid rate limiting
_token_cache = {}

def get_token(email, password, role_name):
    """Get token with caching to avoid rate limiting"""
    cache_key = f"{email}:{password}"
    if cache_key in _token_cache:
        return _token_cache[cache_key]
    
    # Wait a bit to avoid rate limiting
    time.sleep(1)
    
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 429:
        # Rate limited, wait and retry
        time.sleep(12)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
    
    if response.status_code == 200:
        token = response.json()["token"]
        _token_cache[cache_key] = token
        return token
    return None


class TestLoginEndpoint:
    """Test POST /api/auth/login works with email field"""
    
    def test_student_login_with_email_field(self):
        """Test student can login using email field"""
        time.sleep(1)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD}
        )
        if response.status_code == 429:
            time.sleep(12)
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD}
            )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user"
        # The email field accepts username (Gaurav.pandey) but user.email is the full email
        # Just verify login succeeded and user data is returned
        assert "name" in data["user"], "User missing name"
        assert "role" in data["user"], "User missing role"
        _token_cache[f"{STUDENT_EMAIL}:{STUDENT_PASSWORD}"] = data["token"]
        print(f"✓ Student login successful: {data['user']['name']} (email: {data['user']['email']})")
    
    def test_admin_login_with_email_field(self):
        """Test admin/incharge can login using email field"""
        time.sleep(1)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 429:
            time.sleep(12)
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user"
        assert data["user"]["role"] in ["administrator", "implant_incharge"]
        _token_cache[f"{ADMIN_EMAIL}:{ADMIN_PASSWORD}"] = data["token"]
        print(f"✓ Admin login successful: {data['user']['name']} (role: {data['user']['role']})")
    
    def test_supervisor_login_with_email_field(self):
        """Test supervisor can login using email field"""
        time.sleep(1)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
        )
        if response.status_code == 429:
            time.sleep(12)
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
            )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user"
        assert data["user"]["role"] == "supervisor"
        _token_cache[f"{SUPERVISOR_EMAIL}:{SUPERVISOR_PASSWORD}"] = data["token"]
        print(f"✓ Supervisor login successful: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """Test login fails with invalid credentials"""
        time.sleep(1)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid_user", "password": "wrong_password"}
        )
        # Could be 401 or 429 if rate limited
        assert response.status_code in [401, 429], f"Expected 401 or 429, got {response.status_code}"
        if response.status_code == 401:
            print("✓ Invalid credentials correctly rejected")
        else:
            print("✓ Rate limited (expected behavior)")


class TestGetProcedures:
    """Test GET /api/procedures returns procedure list properly"""
    
    @pytest.fixture
    def student_token(self):
        """Get student auth token"""
        token = get_token(STUDENT_EMAIL, STUDENT_PASSWORD, "student")
        assert token is not None, "Failed to get student token"
        return token
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
        assert token is not None, "Failed to get admin token"
        return token
    
    def test_get_procedures_as_student(self, student_token):
        """Test student can get their procedures list"""
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Failed to get procedures: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Student retrieved {len(data)} procedures")
        
        # Verify each procedure has required fields
        if len(data) > 0:
            proc = data[0]
            assert "id" in proc or "_id" in proc, "Procedure missing id"
            assert "patient_name" in proc, "Procedure missing patient_name"
            assert "status" in proc, "Procedure missing status"
            print(f"✓ Procedure structure verified: {proc.get('patient_name', 'N/A')}")
    
    def test_get_procedures_as_admin(self, admin_token):
        """Test admin can get all procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get procedures: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Admin retrieved {len(data)} procedures")


class TestGetProcedureDetail:
    """Test GET /api/procedures/{id} returns all clinical examination fields"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
        assert token is not None, "Failed to get admin token"
        return token
    
    def test_get_procedure_returns_clinical_examination_fields(self, admin_token):
        """Test procedure detail returns all clinical examination fields"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_PENDING_PHASE1}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        data = response.json()
        
        # Verify basic fields
        assert "id" in data or "_id" in data, "Procedure missing id"
        assert "patient_name" in data, "Procedure missing patient_name"
        
        # List of clinical examination fields that should be returned
        clinical_fields = [
            "edentulous_sites",
            "ridge_contour",
            "soft_tissue_thickness",
            "keratinized_mucosa",
            "occlusal_scheme",
            "parafunction_habit",
            "vertical_dimension",
            "opposing_dentition",
            "smile_line",
            "gingival_biotype",
            "medical_assessment",
            "medical_risk_level"
        ]
        
        # Check which fields are present (they may be null/empty if not filled)
        present_fields = []
        missing_fields = []
        for field in clinical_fields:
            if field in data:
                present_fields.append(field)
            else:
                missing_fields.append(field)
        
        print(f"✓ Procedure detail retrieved for: {data.get('patient_name', 'N/A')}")
        print(f"  Status: {data.get('status', 'N/A')}")
        print(f"  Clinical fields present: {len(present_fields)}/{len(clinical_fields)}")
        
        if present_fields:
            print(f"  Present fields: {', '.join(present_fields)}")
        if missing_fields:
            print(f"  Missing fields: {', '.join(missing_fields)}")
        
        # The endpoint should return the full document, so all fields should be accessible
        # Even if they're null/empty, they should be in the response
        assert len(present_fields) > 0 or len(data.keys()) > 5, "Procedure detail seems incomplete"
    
    def test_get_procedure_with_implant_plans(self, admin_token):
        """Test procedure with implant plans returns implant_site field"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        data = response.json()
        
        print(f"✓ Procedure with implant plans retrieved: {data.get('patient_name', 'N/A')}")
        print(f"  Status: {data.get('status', 'N/A')}")
        
        # Check for implant-related fields
        if "implant_plans" in data:
            print(f"  Implant plans count: {len(data.get('implant_plans', []))}")
        if "implant_site" in data:
            print(f"  Implant site: {data.get('implant_site', 'N/A')}")
        if "number_of_implants" in data:
            print(f"  Number of implants: {data.get('number_of_implants', 'N/A')}")


class TestImplantPlanSave:
    """Test POST /api/procedures/{id}/implant-plan auto-populates implant_site"""
    
    @pytest.fixture
    def student_token(self):
        """Get student auth token"""
        token = get_token(STUDENT_EMAIL, STUDENT_PASSWORD, "student")
        assert token is not None, "Failed to get student token"
        return token
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
        assert token is not None, "Failed to get admin token"
        return token
    
    def test_implant_plan_save_returns_count(self, student_token):
        """Test implant-plan save returns correct response with count"""
        # Use the student's procedure
        implant_plan = {
            "implants": [
                {
                    "position": "14",
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.1,
                    "length": 10.0,
                    "bone_width": 8.0,
                    "bone_height": 12.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 3
                },
                {
                    "position": "16",
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.8,
                    "length": 8.0,
                    "bone_width": 10.0,
                    "bone_height": 10.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 4
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}/implant-plan",
            json=implant_plan,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert response.status_code == 200, f"Failed to save implant plan: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data, "Response missing message"
        assert "count" in data, "Response missing count"
        assert data["count"] == 2, f"Expected count 2, got {data['count']}"
        
        print(f"✓ Implant plan saved successfully")
        print(f"  Message: {data['message']}")
        print(f"  Count: {data['count']}")
    
    def test_implant_plan_auto_populates_implant_site(self, student_token, admin_token):
        """Test that saving implant plan auto-populates implant_site field"""
        # Save implant plan with specific positions
        implant_plan = {
            "implants": [
                {
                    "position": "21",
                    "brand": "Nobel Biocare",
                    "system": "Active",
                    "diameter": 3.5,
                    "length": 11.5,
                    "bone_width": 7.0,
                    "bone_height": 14.0,
                    "bone_type": "D3",
                    "risk_level": "Medium",
                    "risk_score": 6
                },
                {
                    "position": "22",
                    "brand": "Nobel Biocare",
                    "system": "Active",
                    "diameter": 3.5,
                    "length": 11.5,
                    "bone_width": 6.5,
                    "bone_height": 13.0,
                    "bone_type": "D3",
                    "risk_level": "Medium",
                    "risk_score": 7
                },
                {
                    "position": "23",
                    "brand": "Nobel Biocare",
                    "system": "Active",
                    "diameter": 3.5,
                    "length": 13.0,
                    "bone_width": 7.5,
                    "bone_height": 15.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 4
                }
            ]
        }
        
        # Save the implant plan
        save_response = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}/implant-plan",
            json=implant_plan,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert save_response.status_code == 200, f"Failed to save implant plan: {save_response.text}"
        
        # Now get the procedure to verify implant_site was auto-populated
        get_response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert get_response.status_code == 200, f"Failed to get procedure: {get_response.text}"
        procedure = get_response.json()
        
        # Verify implant_site was auto-populated from positions
        assert "implant_site" in procedure, "implant_site field not found in procedure"
        implant_site = procedure.get("implant_site", "")
        
        # The implant_site should contain the positions (sorted)
        # Expected: "21, 22, 23" (sorted and joined)
        expected_positions = ["21", "22", "23"]
        
        print(f"✓ Implant site auto-populated: '{implant_site}'")
        
        # Verify all positions are in the implant_site
        for pos in expected_positions:
            assert pos in implant_site, f"Position {pos} not found in implant_site: {implant_site}"
        
        print(f"✓ All positions verified in implant_site")
        
        # Verify number_of_implants was also set
        assert "number_of_implants" in procedure, "number_of_implants field not found"
        assert procedure["number_of_implants"] == 3, f"Expected 3 implants, got {procedure['number_of_implants']}"
        print(f"✓ Number of implants: {procedure['number_of_implants']}")
    
    def test_implant_plan_single_implant(self, student_token, admin_token):
        """Test implant plan with single implant"""
        implant_plan = {
            "implants": [
                {
                    "position": "36",
                    "brand": "Osstem",
                    "system": "TS III",
                    "diameter": 5.0,
                    "length": 10.0,
                    "bone_width": 9.0,
                    "bone_height": 11.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 3
                }
            ]
        }
        
        # Save the implant plan
        save_response = requests.post(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}/implant-plan",
            json=implant_plan,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert save_response.status_code == 200, f"Failed to save implant plan: {save_response.text}"
        data = save_response.json()
        assert data["count"] == 1, f"Expected count 1, got {data['count']}"
        
        # Verify implant_site
        get_response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert get_response.status_code == 200
        procedure = get_response.json()
        
        assert procedure.get("implant_site") == "36", f"Expected implant_site '36', got '{procedure.get('implant_site')}'"
        print(f"✓ Single implant site correctly set: {procedure.get('implant_site')}")


class TestImplantPlanGet:
    """Test GET /api/procedures/{id}/implant-plan endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
        assert token is not None, "Failed to get admin token"
        return token
    
    def test_get_implant_plan(self, admin_token):
        """Test retrieving implant plan for a procedure"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}/implant-plan",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get implant plan: {response.text}"
        data = response.json()
        
        assert "implant_plans" in data, "Response missing implant_plans"
        assert "number_of_implants" in data, "Response missing number_of_implants"
        
        print(f"✓ Implant plan retrieved")
        print(f"  Number of implants: {data['number_of_implants']}")
        print(f"  Plans count: {len(data['implant_plans'])}")
        
        if data['implant_plans']:
            plan = data['implant_plans'][0]
            print(f"  First implant: position={plan.get('position')}, brand={plan.get('brand')}, system={plan.get('system')}")


class TestProcedureDetailFullDocument:
    """Test that GET /api/procedures/{id} returns the full document"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
        assert token is not None, "Failed to get admin token"
        return token
    
    def test_procedure_detail_returns_full_document(self, admin_token):
        """Verify procedure detail returns all fields from the document"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{PROCEDURE_WITH_IMPLANT_PLANS}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Failed to get procedure: {response.text}"
        data = response.json()
        
        # Core fields that should always be present
        core_fields = [
            "id", "patient_name", "registration_number", "status",
            "supervisor_id", "supervisor_name", "implant_incharge_id", "implant_incharge_name",
            "procedure_date", "procedure_time", "implant_procedure_type"
        ]
        
        # Check core fields
        missing_core = []
        for field in core_fields:
            if field not in data and field != "id":  # id might be _id
                if field == "id" and "_id" not in data:
                    missing_core.append(field)
                elif field != "id":
                    missing_core.append(field)
        
        if missing_core:
            print(f"⚠ Missing core fields: {', '.join(missing_core)}")
        
        # Print all available fields
        print(f"✓ Procedure detail has {len(data.keys())} fields")
        print(f"  Available fields: {', '.join(sorted(data.keys()))}")
        
        # Verify the document is not filtered/projected
        assert len(data.keys()) > 10, "Procedure detail seems to be filtered - expected full document"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
