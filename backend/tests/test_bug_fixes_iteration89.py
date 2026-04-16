"""
Test Bug Fixes - Iteration 89
Tests for 3 P0 bug fixes:
1. Step 1 to Step 2 transition (procedure creation returns id)
2. Draft data hydration (GET procedure returns all Step 1 fields)
3. Standalone AI explain endpoint (POST /api/ai/explain-standalone)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Helper to get a valid future date (weekday, at least 3 days ahead)
def get_future_date():
    """Get a future date that is a weekday (Mon-Sat) and at least 3 days ahead"""
    future = datetime.now() + timedelta(days=3)
    # Skip Sunday (weekday 6)
    while future.weekday() == 6:  # Sunday
        future += timedelta(days=1)
    return future.strftime("%Y-%m-%d")

# Test credentials from test_credentials.md
TEST_CREDENTIALS = {
    "student": {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"},
    "supervisor": {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"},
    "implant_incharge": {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"},
}


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("PASS: Health endpoint returns 200")


class TestAuthentication:
    """Test authentication to get tokens for subsequent tests"""
    
    def test_student_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDENTIALS["student"])
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        print(f"PASS: Student login successful, token received")
        return data["access_token"]
    
    def test_implant_incharge_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDENTIALS["implant_incharge"])
        assert response.status_code == 200, f"Implant incharge login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        print(f"PASS: Implant incharge login successful")
        return data["access_token"]


@pytest.fixture(scope="module")
def student_token():
    """Get student auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDENTIALS["student"])
    if response.status_code != 200:
        pytest.skip(f"Student login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def incharge_token():
    """Get implant incharge auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_CREDENTIALS["implant_incharge"])
    if response.status_code != 200:
        pytest.skip(f"Implant incharge login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def supervisor_list(student_token):
    """Get list of supervisors for procedure creation"""
    headers = {"Authorization": f"Bearer {student_token}"}
    response = requests.get(f"{BASE_URL}/api/users?role=supervisor", headers=headers)
    if response.status_code == 200:
        return response.json()
    return []


@pytest.fixture(scope="module")
def incharge_list(student_token):
    """Get list of implant incharges for procedure creation"""
    headers = {"Authorization": f"Bearer {student_token}"}
    response = requests.get(f"{BASE_URL}/api/users?role=implant_incharge", headers=headers)
    if response.status_code == 200:
        return response.json()
    return []


class TestBugFix1_StepTransition:
    """
    Bug Fix 1: Step 1 to Step 2 transition
    After filling required fields and clicking 'Continue to Implant Selection',
    the Step 2 view should render properly (no black screen).
    
    Backend test: Create procedure via API, verify response has 'id' field.
    """
    
    def test_create_procedure_returns_id(self, student_token, supervisor_list, incharge_list):
        """Test that POST /api/procedures returns an id for the created procedure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Get supervisor and incharge IDs
        supervisor_id = supervisor_list[0]["id"] if supervisor_list else ""
        supervisor_name = supervisor_list[0]["name"] if supervisor_list else "Dr. Test Supervisor"
        incharge_id = incharge_list[0]["id"] if incharge_list else ""
        incharge_name = incharge_list[0]["name"] if incharge_list else "Dr. Test Incharge"
        
        payload = {
            "patient_name": "TEST_BugFix1_Patient",
            "registration_number": "TEST-BF1-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "receipt_number": "RCP-TEST-001",
            "amount_paid": 5000,
            "procedure_date": get_future_date(),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Immediate Loading"],
            "prosthetic_plan": "Screw-retained crown",
            "status": "draft",
            # Clinical examination fields
            "occlusocervical_height": "10mm",
            "mesiodistal_space": "8mm",
            "arch_condition": "Normal",
            "ridge_contour": "Adequate",
            "soft_tissue_thickness": "2mm",
            "keratinized_mucosa": "3mm",
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code in [200, 201], f"Procedure creation failed: {response.status_code} - {response.text}"
        
        data = response.json()
        # Check that 'id' field is present (critical for Step 2 transition)
        assert "id" in data or "_id" in data, f"Response missing 'id' field: {data}"
        
        procedure_id = data.get("id") or data.get("_id")
        assert procedure_id is not None, "Procedure ID is None"
        assert len(str(procedure_id)) > 0, "Procedure ID is empty"
        
        print(f"PASS: Procedure created with ID: {procedure_id}")
        return procedure_id
    
    def test_created_procedure_has_draft_status(self, student_token, supervisor_list, incharge_list):
        """Verify created procedure has draft status"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        supervisor_id = supervisor_list[0]["id"] if supervisor_list else ""
        supervisor_name = supervisor_list[0]["name"] if supervisor_list else "Dr. Test Supervisor"
        incharge_id = incharge_list[0]["id"] if incharge_list else ""
        incharge_name = incharge_list[0]["name"] if incharge_list else "Dr. Test Incharge"
        
        payload = {
            "patient_name": "TEST_BugFix1_Status",
            "registration_number": "TEST-BF1-002",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "receipt_number": "RCP-TEST-002",
            "amount_paid": 5000,
            "procedure_date": get_future_date(),
            "procedure_time": "11:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement-retained crown",
            "status": "draft",
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        procedure_id = data.get("id") or data.get("_id")
        
        # Verify status is draft
        get_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert get_response.status_code == 200, f"GET procedure failed: {get_response.text}"
        
        proc_data = get_response.json()
        assert proc_data.get("status") == "draft", f"Expected status 'draft', got: {proc_data.get('status')}"
        
        print(f"PASS: Procedure {procedure_id} has draft status")


class TestBugFix2_DraftDataHydration:
    """
    Bug Fix 2: Draft data hydration
    When continuing a draft case from the dashboard, ALL Step 1 fields should be loaded.
    
    Backend test: GET a procedure and verify all fields are returned for hydration.
    """
    
    @pytest.fixture
    def created_draft_procedure(self, student_token, supervisor_list, incharge_list):
        """Create a draft procedure with all Step 1 fields populated"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        supervisor_id = supervisor_list[0]["id"] if supervisor_list else ""
        supervisor_name = supervisor_list[0]["name"] if supervisor_list else "Dr. Test Supervisor"
        incharge_id = incharge_list[0]["id"] if incharge_list else ""
        incharge_name = incharge_list[0]["name"] if incharge_list else "Dr. Test Incharge"
        
        # Create procedure with ALL Step 1 fields
        payload = {
            "patient_name": "TEST_DraftHydration_Patient",
            "registration_number": "TEST-DH-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "receipt_number": "RCP-DH-001",
            "amount_paid": 7500,
            "procedure_date": get_future_date(),
            "procedure_time": "14:30",
            "implant_procedure_type": "Multiple Conventional Implants",
            "arch": "maxilla",
            "loading_type": ["Immediate Loading", "Early Loading"],
            "prosthetic_plan": "Fixed partial denture",
            "prosthetic_plan_other": "",
            "bone_graft_specifications": "Xenograft 0.5cc",
            "status": "draft",
            # Clinical Examination fields
            "occlusocervical_height": "12mm",
            "mesiodistal_space": "10mm",
            "arch_condition": "Partially edentulous",
            "ridge_contour": "Knife-edge",
            "soft_tissue_thickness": "1.5mm",
            "keratinized_mucosa": "2mm",
            # Occlusal Analysis (non-full-arch)
            "occlusal_scheme": "Mutually protected",
            "parafunction_habit": "Bruxism",
            "vertical_dimension": "Normal",
            "opposing_dentition": "Natural teeth",
            # Aesthetic Risk Assessment
            "smile_line": "High",
            "gingival_biotype": "Thin",
            # Medical Assessment
            "medical_risk_level": "Low",
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code in [200, 201], f"Failed to create draft: {response.text}"
        
        data = response.json()
        procedure_id = data.get("id") or data.get("_id")
        return procedure_id, payload
    
    def test_get_draft_returns_all_step1_fields(self, student_token, created_draft_procedure):
        """Verify GET /api/procedures/{id} returns all Step 1 fields for draft hydration"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id, original_payload = created_draft_procedure
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200, f"GET procedure failed: {response.text}"
        
        data = response.json()
        
        # Verify all critical Step 1 fields are present and match
        critical_fields = [
            "patient_name",
            "registration_number",
            "supervisor_id",
            "supervisor_name",
            "implant_incharge_id",
            "implant_incharge_name",
            "receipt_number",
            "amount_paid",
            "procedure_date",
            "procedure_time",
            "implant_procedure_type",
            "loading_type",
            "prosthetic_plan",
        ]
        
        missing_fields = []
        mismatched_fields = []
        
        for field in critical_fields:
            if field not in data:
                missing_fields.append(field)
            elif data.get(field) != original_payload.get(field):
                # Special handling for amount_paid (might be int vs string)
                if field == "amount_paid":
                    if str(data.get(field)) != str(original_payload.get(field)):
                        mismatched_fields.append(f"{field}: expected {original_payload.get(field)}, got {data.get(field)}")
                else:
                    mismatched_fields.append(f"{field}: expected {original_payload.get(field)}, got {data.get(field)}")
        
        assert len(missing_fields) == 0, f"Missing fields in response: {missing_fields}"
        assert len(mismatched_fields) == 0, f"Mismatched fields: {mismatched_fields}"
        
        print(f"PASS: All {len(critical_fields)} critical Step 1 fields present and correct")
    
    def test_get_draft_returns_clinical_examination_fields(self, student_token, created_draft_procedure):
        """Verify clinical examination fields are returned"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id, original_payload = created_draft_procedure
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        
        clinical_fields = [
            "occlusocervical_height",
            "mesiodistal_space",
            "arch_condition",
            "ridge_contour",
            "soft_tissue_thickness",
            "keratinized_mucosa",
        ]
        
        for field in clinical_fields:
            assert field in data, f"Missing clinical field: {field}"
            if original_payload.get(field):
                assert data.get(field) == original_payload.get(field), f"Field {field} mismatch"
        
        print(f"PASS: All {len(clinical_fields)} clinical examination fields present")
    
    def test_get_draft_returns_occlusal_analysis_fields(self, student_token, created_draft_procedure):
        """Verify occlusal analysis fields are returned"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id, original_payload = created_draft_procedure
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        
        occlusal_fields = [
            "occlusal_scheme",
            "parafunction_habit",
            "vertical_dimension",
            "opposing_dentition",
        ]
        
        for field in occlusal_fields:
            assert field in data, f"Missing occlusal field: {field}"
        
        print(f"PASS: All {len(occlusal_fields)} occlusal analysis fields present")
    
    def test_get_draft_returns_aesthetic_fields(self, student_token, created_draft_procedure):
        """Verify aesthetic risk assessment fields are returned"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id, original_payload = created_draft_procedure
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        
        aesthetic_fields = ["smile_line", "gingival_biotype"]
        
        for field in aesthetic_fields:
            assert field in data, f"Missing aesthetic field: {field}"
        
        print(f"PASS: All {len(aesthetic_fields)} aesthetic risk fields present")


class TestBugFix3_StandaloneAIExplain:
    """
    Bug Fix 3: Standalone AI Explain button
    On the 'Implant Selection' tab, after getting a result, there should be an
    'Explain Recommendation' AI button that calls POST /api/ai/explain-standalone.
    
    Backend test: POST /api/ai/explain-standalone accepts implant data and returns explanation.
    """
    
    def test_ai_explain_standalone_endpoint_exists(self, student_token):
        """Verify the endpoint exists and requires auth"""
        # Test without auth - should fail
        response = requests.post(f"{BASE_URL}/api/ai/explain-standalone", json={})
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got: {response.status_code}"
        print("PASS: Endpoint requires authentication")
    
    def test_ai_explain_standalone_success(self, student_token):
        """Test POST /api/ai/explain-standalone returns explanation"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        payload = {
            "tooth": "36",
            "tooth_region": "Mandibular Left First Molar",
            "brand": "Nobel Biocare",
            "system": "NobelActive",
            "diameter": 4.3,
            "length": 11.5,
            "bone_width": 8.0,
            "bone_height": 12.0,
            "bone_type": "Type II",
            "risk_level": "Low",
            "risk_score": 15,
        }
        
        response = requests.post(f"{BASE_URL}/api/ai/explain-standalone", json=payload, headers=headers)
        assert response.status_code == 200, f"AI explain failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "explanation" in data, f"Response missing 'explanation' field: {data}"
        assert len(data["explanation"]) > 0, "Explanation is empty"
        
        print(f"PASS: AI explain-standalone returned explanation ({len(data['explanation'])} chars)")
        print(f"  Explanation preview: {data['explanation'][:100]}...")
    
    def test_ai_explain_standalone_with_minimal_data(self, student_token):
        """Test endpoint works with minimal required data"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        payload = {
            "tooth": "11",
            "brand": "Straumann",
            "system": "BLT",
            "diameter": 3.3,
            "length": 10,
            "bone_width": 6.0,
            "bone_height": 10.0,
        }
        
        response = requests.post(f"{BASE_URL}/api/ai/explain-standalone", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed with minimal data: {response.text}"
        
        data = response.json()
        assert "explanation" in data
        assert len(data["explanation"]) > 0
        
        print("PASS: AI explain-standalone works with minimal data")
    
    def test_ai_explain_standalone_with_procedures(self, student_token):
        """Test endpoint handles procedures array"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        payload = {
            "tooth": "46",
            "brand": "Osstem",
            "system": "TS III",
            "diameter": 4.0,
            "length": 10,
            "bone_width": 7.0,
            "bone_height": 11.0,
            "bone_type": "Type III",
            "procedures": ["Bone Grafting", "Sinus Lift"],
        }
        
        response = requests.post(f"{BASE_URL}/api/ai/explain-standalone", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed with procedures: {response.text}"
        
        data = response.json()
        assert "explanation" in data
        
        print("PASS: AI explain-standalone handles procedures array")


class TestCleanup:
    """Cleanup test data created during testing"""
    
    def test_cleanup_test_procedures(self, student_token):
        """Delete TEST_ prefixed procedures"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Get all procedures
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        if response.status_code != 200:
            print("SKIP: Could not fetch procedures for cleanup")
            return
        
        procedures = response.json()
        deleted_count = 0
        
        for proc in procedures:
            patient_name = proc.get("patient_name", "")
            if patient_name.startswith("TEST_"):
                proc_id = proc.get("id") or proc.get("_id")
                if proc_id:
                    del_response = requests.delete(f"{BASE_URL}/api/procedures/{proc_id}", headers=headers)
                    if del_response.status_code in [200, 204]:
                        deleted_count += 1
        
        print(f"CLEANUP: Deleted {deleted_count} test procedures")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
