"""
Iteration 60: Implant Plan Bug Fix Testing
Tests the P0 bug fix for 'Add Implant Position' blank screen crash.

Key fixes being tested:
1. GET /api/procedures/{id}/implant-plan returns empty plans for new procedures (was 404)
2. GET /api/procedures/NONE/implant-plan returns 400 (ObjectId validation)
3. GET /api/procedures/000000000000000000000000/implant-plan returns 404 for non-existent
4. POST /api/procedures creates procedure correctly
5. POST /api/procedures/{id}/implant-plan saves and retrieves implant plans
6. Full flow: Create -> Read empty -> Save -> Read saved
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com"

# Test credentials
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") in ("healthy", "ok"), f"Unexpected status: {data}"
        print("✓ Health endpoint working")
    
    def test_student_login(self):
        """Test student login returns access_token and refresh_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert "refresh_token" in data, "Missing refresh_token"
        assert "user" in data, "Missing user"
        assert data["user"]["role"] == "student"
        print("✓ Student login working")
    
    def test_incharge_login(self):
        """Test implant incharge login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200, f"Incharge login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] in ("implant_incharge", "administrator")
        print("✓ Implant incharge login working")


class TestImplantPlanObjectIdValidation:
    """Test ObjectId validation for implant-plan endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get student auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_implant_plan_invalid_id_returns_400(self, auth_token):
        """GET /api/procedures/NONE/implant-plan should return 400 for invalid ObjectId"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/NONE/implant-plan", headers=headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Invalid procedure ID" in data.get("detail", ""), f"Unexpected error: {data}"
        print("✓ Invalid ObjectId 'NONE' returns 400")
    
    def test_get_implant_plan_invalid_short_id_returns_400(self, auth_token):
        """GET /api/procedures/abc123/implant-plan should return 400 for short invalid ID"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/abc123/implant-plan", headers=headers)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Invalid short ObjectId returns 400")
    
    def test_get_implant_plan_nonexistent_returns_404(self, auth_token):
        """GET /api/procedures/000000000000000000000000/implant-plan should return 404"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Valid ObjectId format but doesn't exist
        response = requests.get(f"{BASE_URL}/api/procedures/000000000000000000000000/implant-plan", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Procedure not found" in data.get("detail", ""), f"Unexpected error: {data}"
        print("✓ Non-existent procedure returns 404")
    
    def test_post_implant_plan_invalid_id_returns_400(self, auth_token):
        """POST /api/procedures/NONE/implant-plan should return 400 for invalid ObjectId"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        payload = {
            "implants": [{
                "position": "11",
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "diameter": 4.3,
                "length": 10.0,
                "bone_width": 8.0,
                "bone_height": 12.0,
                "bone_type": "D2",
                "risk_level": "Low",
                "risk_score": 2
            }]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/NONE/implant-plan", headers=headers, json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ POST with invalid ObjectId returns 400")


class TestImplantPlanFullFlow:
    """Test the full implant plan flow: Create procedure -> Read empty plan -> Save plan -> Read saved plan"""
    
    @pytest.fixture
    def student_auth(self):
        """Get student auth token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def incharge_auth(self):
        """Get incharge auth token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def supervisor_auth(self):
        """Get supervisor auth token and user info"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    def get_valid_procedure_date(self):
        """Get a valid procedure date (at least 48 hours in future, not Sunday)"""
        future_date = datetime.now() + timedelta(days=3)
        # Skip Sunday
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        return future_date.strftime("%Y-%m-%d")
    
    def create_procedure_payload(self, supervisor_auth, incharge_auth, patient_name="TEST_Patient"):
        """Create a valid procedure payload with all required fields"""
        procedure_date = self.get_valid_procedure_date()
        return {
            "patient_name": patient_name,
            "registration_number": f"REG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "supervisor_id": supervisor_auth["user"]["id"],
            "supervisor_name": supervisor_auth["user"]["name"],
            "implant_incharge_id": incharge_auth["user"]["id"],
            "implant_incharge_name": incharge_auth["user"]["name"],
            "receipt_number": f"RCP-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
        }
    
    def test_create_procedure_returns_id(self, student_auth, supervisor_auth, incharge_auth):
        """POST /api/procedures creates a procedure and returns id correctly"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_ImplantPlanBugFix_Patient")
        
        response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=payload)
        assert response.status_code in (200, 201), f"Create procedure failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "id" in data, f"Missing 'id' in response: {data}"
        assert len(data["id"]) == 24, f"Invalid ObjectId format: {data['id']}"
        print(f"✓ Procedure created with id: {data['id']}")
        return data["id"]
    
    def test_new_procedure_returns_empty_implant_plan(self, student_auth, supervisor_auth, incharge_auth):
        """GET /api/procedures/{id}/implant-plan returns empty plans for newly created procedures"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_EmptyPlan_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=payload)
        assert create_response.status_code in (200, 201), f"Create failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        
        # Now get the implant plan - should return empty, NOT 404
        plan_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers)
        assert plan_response.status_code == 200, f"Expected 200, got {plan_response.status_code}: {plan_response.text}"
        
        plan_data = plan_response.json()
        assert "implant_plans" in plan_data, f"Missing 'implant_plans' key: {plan_data}"
        assert "number_of_implants" in plan_data, f"Missing 'number_of_implants' key: {plan_data}"
        assert plan_data["implant_plans"] == [], f"Expected empty list, got: {plan_data['implant_plans']}"
        assert plan_data["number_of_implants"] == 0, f"Expected 0, got: {plan_data['number_of_implants']}"
        
        print(f"✓ New procedure {procedure_id} returns empty implant plan (not 404)")
    
    def test_full_implant_plan_flow(self, student_auth, supervisor_auth, incharge_auth):
        """Full flow: Create procedure -> Read empty plan -> Save plan -> Read saved plan"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Step 1: Create procedure
        create_payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_FullFlow_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=create_payload)
        assert create_response.status_code in (200, 201), f"Create failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        print(f"  Step 1: Created procedure {procedure_id}")
        
        # Step 2: Read empty plan
        plan_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers)
        assert plan_response.status_code == 200, f"Read empty plan failed: {plan_response.text}"
        plan_data = plan_response.json()
        assert plan_data["implant_plans"] == [], "Expected empty implant_plans"
        assert plan_data["number_of_implants"] == 0, "Expected 0 implants"
        print("  Step 2: Read empty plan - OK")
        
        # Step 3: Save implant plan
        save_payload = {
            "implants": [{
                "position": "21",
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "diameter": 4.3,
                "length": 11.5,
                "bone_width": 9.0,
                "bone_height": 14.0,
                "bone_type": "D2",
                "risk_level": "Low",
                "risk_score": 3
            }]
        }
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers, json=save_payload)
        assert save_response.status_code == 200, f"Save plan failed: {save_response.text}"
        save_data = save_response.json()
        assert "message" in save_data, f"Missing message: {save_data}"
        assert save_data.get("count") == 1, f"Expected count=1, got: {save_data}"
        print("  Step 3: Saved implant plan - OK")
        
        # Step 4: Read saved plan
        read_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers)
        assert read_response.status_code == 200, f"Read saved plan failed: {read_response.text}"
        read_data = read_response.json()
        
        assert len(read_data["implant_plans"]) == 1, f"Expected 1 implant, got: {len(read_data['implant_plans'])}"
        assert read_data["number_of_implants"] == 1, f"Expected number_of_implants=1, got: {read_data['number_of_implants']}"
        
        saved_implant = read_data["implant_plans"][0]
        assert saved_implant["position"] == "21", f"Position mismatch: {saved_implant}"
        assert saved_implant["brand"] == "Nobel Biocare", f"Brand mismatch: {saved_implant}"
        assert saved_implant["diameter"] == 4.3, f"Diameter mismatch: {saved_implant}"
        print("  Step 4: Read saved plan - OK")
        
        print(f"✓ Full implant plan flow completed successfully for procedure {procedure_id}")
    
    def test_multiple_implants_save_and_retrieve(self, student_auth, supervisor_auth, incharge_auth):
        """Test saving and retrieving multiple implants"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Create procedure with correct payload
        create_payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_MultipleImplants_Patient")
        create_payload["implant_procedure_type"] = "Multiple Conventional Implants"
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=create_payload)
        assert create_response.status_code in (200, 201), f"Create failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        
        # Save multiple implants
        save_payload = {
            "implants": [
                {
                    "position": "11",
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.1,
                    "length": 10.0,
                    "bone_width": 8.0,
                    "bone_height": 12.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 2
                },
                {
                    "position": "21",
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.1,
                    "length": 10.0,
                    "bone_width": 8.5,
                    "bone_height": 13.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 2
                },
                {
                    "position": "36",
                    "brand": "Nobel Biocare",
                    "system": "NobelActive",
                    "diameter": 5.0,
                    "length": 8.0,
                    "bone_width": 10.0,
                    "bone_height": 10.0,
                    "bone_type": "D3",
                    "risk_level": "Medium",
                    "risk_score": 5
                }
            ]
        }
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers, json=save_payload)
        assert save_response.status_code == 200, f"Save failed: {save_response.text}"
        assert save_response.json().get("count") == 3
        
        # Read and verify
        read_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers)
        assert read_response.status_code == 200
        read_data = read_response.json()
        
        assert len(read_data["implant_plans"]) == 3, f"Expected 3 implants, got {len(read_data['implant_plans'])}"
        assert read_data["number_of_implants"] == 3
        
        positions = [imp["position"] for imp in read_data["implant_plans"]]
        assert "11" in positions and "21" in positions and "36" in positions
        
        print(f"✓ Multiple implants (3) saved and retrieved successfully")


class TestImplantPlanEdgeCases:
    """Test edge cases for implant plan endpoints"""
    
    @pytest.fixture
    def student_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def incharge_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def supervisor_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    def get_valid_procedure_date(self):
        future_date = datetime.now() + timedelta(days=3)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        return future_date.strftime("%Y-%m-%d")
    
    def create_procedure_payload(self, supervisor_auth, incharge_auth, patient_name="TEST_Patient"):
        """Create a valid procedure payload with all required fields"""
        procedure_date = self.get_valid_procedure_date()
        return {
            "patient_name": patient_name,
            "registration_number": f"REG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "supervisor_id": supervisor_auth["user"]["id"],
            "supervisor_name": supervisor_auth["user"]["name"],
            "implant_incharge_id": incharge_auth["user"]["id"],
            "implant_incharge_name": incharge_auth["user"]["name"],
            "receipt_number": f"RCP-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
        }
    
    def test_duplicate_positions_rejected(self, student_auth, supervisor_auth, incharge_auth):
        """Test that duplicate tooth positions are rejected"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Create procedure
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_DuplicatePos_Patient")
        payload["implant_procedure_type"] = "Multiple Conventional Implants"
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=payload)
        assert create_response.status_code in (200, 201)
        procedure_id = create_response.json()["id"]
        
        # Try to save with duplicate positions
        save_payload = {
            "implants": [
                {
                    "position": "11",
                    "brand": "Nobel Biocare",
                    "system": "NobelActive",
                    "diameter": 4.3,
                    "length": 10.0,
                    "bone_width": 8.0,
                    "bone_height": 12.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 2
                },
                {
                    "position": "11",  # Duplicate!
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.1,
                    "length": 10.0,
                    "bone_width": 8.0,
                    "bone_height": 12.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 2
                }
            ]
        }
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers, json=save_payload)
        assert save_response.status_code == 400, f"Expected 400 for duplicate positions, got {save_response.status_code}"
        assert "unique" in save_response.json().get("detail", "").lower()
        print("✓ Duplicate positions correctly rejected with 400")
    
    def test_empty_implants_rejected(self, student_auth, supervisor_auth, incharge_auth):
        """Test that empty implants list is rejected"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Create procedure
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_EmptyImplants_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=payload)
        assert create_response.status_code in (200, 201)
        procedure_id = create_response.json()["id"]
        
        # Try to save empty implants
        save_payload = {"implants": []}
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers, json=save_payload)
        assert save_response.status_code == 400, f"Expected 400 for empty implants, got {save_response.status_code}"
        print("✓ Empty implants list correctly rejected with 400")
    
    def test_too_many_implants_rejected(self, student_auth, supervisor_auth, incharge_auth):
        """Test that more than 6 implants is rejected"""
        headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Create procedure with correct payload
        create_payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_TooManyImplants_Patient")
        create_payload["implant_procedure_type"] = "All on 6"
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=headers, json=create_payload)
        assert create_response.status_code in (200, 201), f"Create failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        
        # Try to save 7 implants
        base_implant = {
            "brand": "Nobel Biocare",
            "system": "NobelActive",
            "diameter": 4.3,
            "length": 10.0,
            "bone_width": 8.0,
            "bone_height": 12.0,
            "bone_type": "D2",
            "risk_level": "Low",
            "risk_score": 2
        }
        
        save_payload = {
            "implants": [
                {**base_implant, "position": "11"},
                {**base_implant, "position": "12"},
                {**base_implant, "position": "13"},
                {**base_implant, "position": "21"},
                {**base_implant, "position": "22"},
                {**base_implant, "position": "23"},
                {**base_implant, "position": "24"},  # 7th implant
            ]
        }
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=headers, json=save_payload)
        assert save_response.status_code == 400, f"Expected 400 for >6 implants, got {save_response.status_code}"
        assert "1 and 6" in save_response.json().get("detail", "")
        print("✓ More than 6 implants correctly rejected with 400")
    
    def test_unauthorized_access_rejected(self, student_auth, supervisor_auth, incharge_auth):
        """Test that unauthorized users cannot access other's procedures"""
        # Create procedure as student
        student_headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        # Create procedure with correct payload
        create_payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_Unauthorized_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=student_headers, json=create_payload)
        assert create_response.status_code in (200, 201), f"Create failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        
        # Try to access without auth
        no_auth_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan")
        assert no_auth_response.status_code in (401, 403), f"Expected 401 or 403 without auth, got {no_auth_response.status_code}"
        print("✓ Unauthorized access correctly rejected")


class TestInchargeImplantPlanAccess:
    """Test that implant incharge can access and modify implant plans"""
    
    @pytest.fixture
    def student_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def incharge_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    @pytest.fixture
    def supervisor_auth(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        return {"token": data["access_token"], "user": data["user"]}
    
    def get_valid_procedure_date(self):
        future_date = datetime.now() + timedelta(days=3)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        return future_date.strftime("%Y-%m-%d")
    
    def create_procedure_payload(self, supervisor_auth, incharge_auth, patient_name="TEST_Patient"):
        """Create a valid procedure payload with all required fields"""
        procedure_date = self.get_valid_procedure_date()
        return {
            "patient_name": patient_name,
            "registration_number": f"REG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "supervisor_id": supervisor_auth["user"]["id"],
            "supervisor_name": supervisor_auth["user"]["name"],
            "implant_incharge_id": incharge_auth["user"]["id"],
            "implant_incharge_name": incharge_auth["user"]["name"],
            "receipt_number": f"RCP-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
        }
    
    def test_incharge_can_read_implant_plan(self, student_auth, supervisor_auth, incharge_auth):
        """Test that implant incharge can read implant plans"""
        # Create procedure as student
        student_headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_InchargeRead_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=student_headers, json=payload)
        assert create_response.status_code in (200, 201)
        procedure_id = create_response.json()["id"]
        
        # Incharge reads the plan
        incharge_headers = {"Authorization": f"Bearer {incharge_auth['token']}"}
        read_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=incharge_headers)
        assert read_response.status_code == 200, f"Incharge read failed: {read_response.text}"
        print("✓ Implant incharge can read implant plans")
    
    def test_incharge_can_save_implant_plan(self, student_auth, supervisor_auth, incharge_auth):
        """Test that implant incharge can save implant plans"""
        # Create procedure as student
        student_headers = {"Authorization": f"Bearer {student_auth['token']}"}
        
        payload = self.create_procedure_payload(supervisor_auth, incharge_auth, "TEST_InchargeSave_Patient")
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", headers=student_headers, json=payload)
        assert create_response.status_code in (200, 201)
        procedure_id = create_response.json()["id"]
        
        # Incharge saves the plan
        incharge_headers = {"Authorization": f"Bearer {incharge_auth['token']}"}
        save_payload = {
            "implants": [{
                "position": "11",
                "brand": "Nobel Biocare",
                "system": "NobelActive",
                "diameter": 4.3,
                "length": 10.0,
                "bone_width": 8.0,
                "bone_height": 12.0,
                "bone_type": "D2",
                "risk_level": "Low",
                "risk_score": 2
            }]
        }
        
        save_response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", headers=incharge_headers, json=save_payload)
        assert save_response.status_code == 200, f"Incharge save failed: {save_response.text}"
        print("✓ Implant incharge can save implant plans")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
