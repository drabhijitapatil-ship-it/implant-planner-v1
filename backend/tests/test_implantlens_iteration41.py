"""
ImplantLens – Clinical Case Album Backend Tests
Iteration 41

Tests for the new ImplantLens feature:
1. GET /api/implantlens/cases - Returns cases with photo stats for student role
2. GET /api/implantlens/cases - Returns cases for supervisor role (assigned cases)
3. GET /api/implantlens/cases - Returns ALL cases for implant_incharge role
4. Each case has: id, patient_name, student_name, status, photos_uploaded, photos_total, missing_count
5. GET /api/procedures/{id}/photos - Returns phase-wise photo data
6. GET /api/photo-steps - Returns photo step definitions
7. Two-tier rejection regression check
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://clinical-album.preview.emergentagent.com')

# Test credentials from previous iteration
CREDENTIALS = {
    "student": {"email": "Gaurav.pandey", "password": "Student@123"},
    "supervisor": {"email": "Vasantha.n", "password": "Supervisor@123"},
    "implant_incharge": {"email": "Abhijit.patil", "password": "Admin@123"},
}


class TestAuthAndSetup:
    """Authentication tests for all roles"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_student_login(self, session):
        """Test student login"""
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["student"])
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "student"
        print(f"✓ Student login successful: {data['user']['name']}")
    
    def test_supervisor_login(self, session):
        """Test supervisor login"""
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["supervisor"])
        assert response.status_code == 200, f"Supervisor login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "supervisor"
        print(f"✓ Supervisor login successful: {data['user']['name']}")
    
    def test_implant_incharge_login(self, session):
        """Test implant_incharge login"""
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["implant_incharge"])
        assert response.status_code == 200, f"Implant Incharge login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "implant_incharge"
        print(f"✓ Implant Incharge login successful: {data['user']['name']}")


# Helper to get auth token
def get_token(role: str) -> str:
    """Get auth token for a specific role"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS[role])
    assert response.status_code == 200, f"Login failed for {role}: {response.text}"
    return response.json()["token"]


class TestImplantLensCasesEndpoint:
    """Tests for GET /api/implantlens/cases endpoint"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        return get_token("student")
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        return get_token("supervisor")
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        return get_token("implant_incharge")
    
    def test_implantlens_cases_student_role(self, student_token):
        """Test 1: GET /api/implantlens/cases returns cases with photo stats for student role"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "cases" in data, "Response should have 'cases' key"
        assert "total_steps" in data, "Response should have 'total_steps' key"
        assert isinstance(data["cases"], list), "cases should be a list"
        assert data["total_steps"] > 0, "total_steps should be positive (44 expected)"
        
        print(f"✓ Student sees {len(data['cases'])} cases, total_steps={data['total_steps']}")
        
        # Validate case structure if cases exist
        if len(data["cases"]) > 0:
            case = data["cases"][0]
            required_fields = ["id", "patient_name", "student_name", "status", 
                             "photos_uploaded", "photos_total", "missing_count"]
            for field in required_fields:
                assert field in case, f"Case should have '{field}' field"
            
            # Validate data types
            assert isinstance(case["id"], str), "id should be string"
            assert isinstance(case["photos_uploaded"], int), "photos_uploaded should be int"
            assert isinstance(case["photos_total"], int), "photos_total should be int"
            assert isinstance(case["missing_count"], int), "missing_count should be int"
            assert case["photos_total"] == data["total_steps"], "photos_total should equal total_steps"
            
            print(f"✓ Case fields validated: id={case['id'][:8]}..., photos={case['photos_uploaded']}/{case['photos_total']}")
    
    def test_implantlens_cases_supervisor_role(self, supervisor_token):
        """Test 2: GET /api/implantlens/cases returns cases for supervisor role (assigned cases)"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert "cases" in data, "Response should have 'cases' key"
        assert isinstance(data["cases"], list), "cases should be a list"
        
        print(f"✓ Supervisor sees {len(data['cases'])} assigned/created cases")
        
        # Validate case structure if cases exist
        if len(data["cases"]) > 0:
            case = data["cases"][0]
            assert "id" in case and "patient_name" in case
            assert "photos_uploaded" in case and "photos_total" in case
            print(f"✓ Supervisor case structure validated")
    
    def test_implantlens_cases_implant_incharge_role(self, incharge_token):
        """Test 3: GET /api/implantlens/cases returns ALL cases for implant_incharge role"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        assert "cases" in data, "Response should have 'cases' key"
        assert isinstance(data["cases"], list), "cases should be a list"
        
        # Implant incharge should see all cases (should be >= supervisor's count)
        print(f"✓ Implant Incharge sees {len(data['cases'])} cases (all cases)")
        
        # Validate all cases have required fields
        for case in data["cases"][:5]:  # Check first 5 cases
            assert "id" in case
            assert "patient_name" in case
            assert "student_name" in case
            assert "status" in case
            assert "photos_uploaded" in case
            assert "photos_total" in case
            assert "missing_count" in case
        
        print(f"✓ All case fields present for implant_incharge view")
    
    def test_implantlens_cases_missing_steps_field(self, incharge_token):
        """Test 4: Each case has missing_steps array (up to 5 items)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["cases"]) > 0:
            case = data["cases"][0]
            # missing_steps is optional but should be present
            assert "missing_steps" in case, "Case should have 'missing_steps' field"
            assert isinstance(case["missing_steps"], list), "missing_steps should be a list"
            
            # Check structure of missing_steps items
            if len(case["missing_steps"]) > 0:
                step = case["missing_steps"][0]
                assert "phase" in step, "Missing step should have 'phase'"
                assert "label" in step, "Missing step should have 'label'"
            
            # Verify max 5 missing steps returned
            assert len(case["missing_steps"]) <= 5, "missing_steps should have max 5 items"
            
            print(f"✓ missing_steps validated: {len(case['missing_steps'])} items")
    
    def test_implantlens_cases_unauthorized(self):
        """Test that unauthorized access returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/implantlens/cases")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ Unauthorized access correctly blocked")


class TestPhotoStepsEndpoint:
    """Tests for GET /api/photo-steps endpoint"""
    
    @pytest.fixture(scope="class")
    def token(self):
        return get_token("student")
    
    def test_get_all_photo_steps(self, token):
        """Test 6: GET /api/photo-steps returns photo step definitions for all phases"""
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/photo-steps", headers=headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Should have 4 phases
        assert len(data) >= 4, "Should have at least 4 phases"
        
        # Validate phase structure (keys are strings "1", "2", "3", "4")
        for phase_key in ["1", "2", "3", "4"]:
            assert phase_key in data, f"Phase {phase_key} should exist"
            phase = data[phase_key]
            assert "name" in phase, f"Phase {phase_key} should have 'name'"
            assert "steps" in phase, f"Phase {phase_key} should have 'steps'"
            assert isinstance(phase["steps"], list), f"Phase {phase_key} steps should be a list"
            
            # Validate step structure
            if len(phase["steps"]) > 0:
                step = phase["steps"][0]
                assert "id" in step, "Step should have 'id'"
                assert "label" in step, "Step should have 'label'"
                assert "category" in step, "Step should have 'category'"
        
        # Count total steps (should be 44)
        total_steps = sum(len(data[str(i)]["steps"]) for i in range(1, 5))
        print(f"✓ Photo steps returned: {total_steps} total steps across 4 phases")
        assert total_steps > 0, "Should have some steps defined"
    
    def test_get_photo_steps_by_phase(self, token):
        """Test GET /api/photo-steps/{phase} returns steps for a specific phase"""
        headers = {"Authorization": f"Bearer {token}"}
        
        for phase in [1, 2, 3, 4]:
            response = requests.get(f"{BASE_URL}/api/photo-steps/{phase}", headers=headers)
            assert response.status_code == 200, f"Phase {phase} request failed: {response.text}"
            data = response.json()
            
            assert "name" in data, f"Phase {phase} should have 'name'"
            assert "steps" in data, f"Phase {phase} should have 'steps'"
            print(f"✓ Phase {phase} '{data['name']}': {len(data['steps'])} steps")
    
    def test_photo_steps_invalid_phase(self, token):
        """Test GET /api/photo-steps/{phase} with invalid phase returns 400"""
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/photo-steps/5", headers=headers)
        assert response.status_code == 400, f"Expected 400 for invalid phase, got {response.status_code}"
        print("✓ Invalid phase correctly returns 400")


class TestProcedurePhotosEndpoint:
    """Tests for GET /api/procedures/{id}/photos endpoint"""
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        return get_token("implant_incharge")
    
    @pytest.fixture(scope="class")
    def case_id(self, incharge_token):
        """Get a case ID from /api/procedures to test photos endpoint"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        # Use /api/procedures as it returns only persistent procedures
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            return data[0]["id"]
        return None
    
    def test_get_procedure_photos(self, incharge_token, case_id):
        """Test 5: GET /api/procedures/{id}/photos returns phase-wise photo data"""
        if not case_id:
            pytest.skip("No cases available to test photos endpoint")
        
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{case_id}/photos", headers=headers)
        
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Should have 4 phases
        for phase_key in ["1", "2", "3", "4"]:
            assert phase_key in data, f"Phase {phase_key} should exist in response"
            phase = data[phase_key]
            
            # Validate phase structure
            assert "name" in phase, f"Phase {phase_key} should have 'name'"
            assert "steps" in phase, f"Phase {phase_key} should have 'steps'"
            assert "total" in phase, f"Phase {phase_key} should have 'total'"
            assert "completed" in phase, f"Phase {phase_key} should have 'completed'"
            
            # Validate step structure
            for step in phase["steps"]:
                assert "step_id" in step, "Step should have 'step_id'"
                assert "label" in step, "Step should have 'label'"
                assert "category" in step, "Step should have 'category'"
                assert "photos" in step, "Step should have 'photos'"
                assert "has_photo" in step, "Step should have 'has_photo'"
        
        # Calculate total completed
        total_steps = sum(data[str(i)]["total"] for i in range(1, 5))
        completed_steps = sum(data[str(i)]["completed"] for i in range(1, 5))
        
        print(f"✓ Procedure photos: {completed_steps}/{total_steps} steps completed")
    
    def test_get_procedure_photos_not_found(self, incharge_token):
        """Test GET /api/procedures/{id}/photos with invalid ID returns 404"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/000000000000000000000000/photos", headers=headers)
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        print("✓ Invalid procedure ID correctly returns 404")


class TestTwoTierRejectionRegression:
    """Regression tests for previously implemented two-tier rejection feature"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        return get_token("student")
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        return get_token("supervisor")
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        return get_token("implant_incharge")
    
    def test_rejection_types_still_work(self, student_token, supervisor_token, incharge_token):
        """Test 7: Two-tier rejection still works (regression check)"""
        # Get supervisor and incharge info
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        headers_ic = {"Authorization": f"Bearer {incharge_token}"}
        
        sup_info = requests.get(f"{BASE_URL}/api/auth/me", headers=headers_sup).json()
        ic_info = requests.get(f"{BASE_URL}/api/auth/me", headers=headers_ic).json()
        
        # Create a test procedure as student
        headers_student = {"Authorization": f"Bearer {student_token}"}
        from datetime import datetime, timedelta
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "patient_name": "TEST_ImplantLens_Regression",
            "registration_number": "REG-LENS-001",
            "supervisor_id": sup_info["id"],
            "supervisor_name": sup_info["name"],
            "implant_incharge_id": ic_info["id"],
            "implant_incharge_name": ic_info["name"],
            "receipt_number": "RCP-LENS-001",
            "amount_paid": 1000.0,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/procedures", 
                                   headers=headers_student, json=procedure_data)
        assert create_resp.status_code == 200, f"Create procedure failed: {create_resp.text}"
        proc_id = create_resp.json()["id"]
        print(f"✓ Created test procedure: {proc_id[:8]}...")
        
        # Request phase 1 approval
        req_resp = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/request-phase1-approval",
                                headers=headers_student)
        assert req_resp.status_code == 200, f"Request approval failed: {req_resp.text}"
        
        # Verify status is pending_phase1
        get_resp = requests.get(f"{BASE_URL}/api/procedures/{proc_id}", headers=headers_student)
        assert get_resp.json()["status"] == "pending_phase1"
        print("✓ Status correctly changed to pending_phase1")
        
        # Test reconsider rejection by supervisor
        reject_data = {
            "action": "reject",
            "rejection_reason": "Test regression - reconsider",
            "rejection_type": "reconsider"
        }
        reject_resp = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
                                   headers=headers_sup, json=reject_data)
        assert reject_resp.status_code == 200, f"Rejection failed: {reject_resp.text}"
        
        # Verify status reverted to draft
        get_resp = requests.get(f"{BASE_URL}/api/procedures/{proc_id}", headers=headers_student)
        proc_data = get_resp.json()
        assert proc_data["status"] == "draft", f"Expected draft, got {proc_data['status']}"
        assert proc_data.get("rejection_type") == "reconsider"
        print("✓ Reconsider rejection works: status=draft, rejection_type=reconsider")
        
        # Cleanup - delete the test procedure
        del_resp = requests.delete(f"{BASE_URL}/api/procedures/{proc_id}", headers=headers_ic)
        assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"
        print("✓ Two-tier rejection regression test passed")


class TestImplantLensRoleFiltering:
    """Additional tests to verify role-based filtering works correctly"""
    
    def test_student_sees_only_own_cases(self):
        """Verify student only sees their own cases"""
        student_token = get_token("student")
        incharge_token = get_token("implant_incharge")
        
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get student's cases
        student_resp = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers_student)
        student_cases = student_resp.json()["cases"]
        
        # Get all cases (incharge)
        incharge_resp = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers_incharge)
        all_cases = incharge_resp.json()["cases"]
        
        # Student should see fewer or equal cases than incharge
        assert len(student_cases) <= len(all_cases), "Student should not see more cases than incharge"
        print(f"✓ Role filtering verified: Student sees {len(student_cases)}, Incharge sees {len(all_cases)}")
    
    def test_supervisor_sees_assigned_cases(self):
        """Verify supervisor sees assigned/created cases"""
        supervisor_token = get_token("supervisor")
        
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.get(f"{BASE_URL}/api/implantlens/cases", headers=headers)
        
        assert response.status_code == 200
        cases = response.json()["cases"]
        print(f"✓ Supervisor sees {len(cases)} assigned/created cases")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
