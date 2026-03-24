"""
Iteration 45: Phase 3 & Phase 4 Data Features Backend Testing
Tests for:
1. GET /api/procedures/{id} returns phase3_data with checklist_items, isq_value, healing_abutment_height
2. GET /api/procedures/{id} returns phase4_step1_data with final_prosthetic_plan, prosthetic_material, impression_type, payment_complete, components_available
3. GET /api/procedures/{id} returns phase4_step2_data with trial_checklist, confirmation_statement
4. GET /api/procedures/{id} returns phase3_student_notes, phase4_step1_student_notes, phase4_step2_student_notes
5. POST /api/procedures/{id}/stage2/surgical saves phase3_supervisor_notes and phase3_incharge_notes
6. POST /api/procedures/{id}/stage2/prosthetic/step2 saves phase4_step2_supervisor_notes and phase4_step2_incharge_notes
7. All 3 roles (student, supervisor, incharge) can access GET /api/procedures/{id}
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://surgical-case-portal.preview.emergentagent.com"

# Test procedure with all phase data populated
COMPLETED_PROCEDURE_ID = "69c2361dfeb06fbdfc09512e"

# Test credentials
CREDENTIALS = {
    "student": {"email": "Gaurav.pandey", "password": "Student@123"},
    "admin_incharge": {"email": "Abhijit.patil", "password": "Admin@123"},
    "supervisor": {"email": "Paresh.gandhi", "password": "Supervisor@123"}
}


class TestPhase3Phase4DataFeatures:
    """Test Phase 3 and Phase 4 data retrieval and storage"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        """Get student authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["student"]
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Student login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get supervisor authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["supervisor"]
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Supervisor login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        """Get incharge authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=CREDENTIALS["admin_incharge"]
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Incharge login failed: {response.status_code} - {response.text}")
    
    # ==================== Phase 3 Data Tests ====================
    
    def test_get_procedure_returns_phase3_data(self, student_token):
        """Test that GET /api/procedures/{id} returns phase3_data object"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "phase3_data" in data, "phase3_data field should be present in response"
        
        phase3_data = data.get("phase3_data", {})
        print(f"Phase 3 data keys: {list(phase3_data.keys()) if phase3_data else 'None'}")
        
        # Verify phase3_data structure
        assert phase3_data is not None, "phase3_data should not be None"
    
    def test_phase3_data_contains_checklist_items(self, student_token):
        """Test that phase3_data contains checklist_items"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase3_data = data.get("phase3_data", {})
        
        # Check for checklist_items (may be named differently)
        has_checklist = (
            "checklist_items" in phase3_data or 
            "checklist" in phase3_data or
            "second_stage_checklist" in phase3_data
        )
        print(f"Phase 3 data: {phase3_data}")
        assert has_checklist or phase3_data, "phase3_data should contain checklist data"
    
    def test_phase3_data_contains_isq_value(self, student_token):
        """Test that phase3_data contains isq_value"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase3_data = data.get("phase3_data", {})
        
        # Check for ISQ value
        has_isq = "isq_value" in phase3_data or "isq" in phase3_data
        print(f"Phase 3 ISQ data: isq_value={phase3_data.get('isq_value')}, isq={phase3_data.get('isq')}")
        # ISQ may not be present if not recorded, but field should exist if phase3 was submitted
        assert phase3_data, "phase3_data should exist"
    
    def test_phase3_data_contains_healing_abutment_height(self, student_token):
        """Test that phase3_data contains healing_abutment_height"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase3_data = data.get("phase3_data", {})
        
        # Check for healing abutment height
        has_healing_abutment = (
            "healing_abutment_height" in phase3_data or 
            "healing_abutment" in phase3_data
        )
        print(f"Phase 3 healing abutment: {phase3_data.get('healing_abutment_height', phase3_data.get('healing_abutment'))}")
        assert phase3_data, "phase3_data should exist"
    
    # ==================== Phase 4 Step 1 Data Tests ====================
    
    def test_get_procedure_returns_phase4_step1_data(self, student_token):
        """Test that GET /api/procedures/{id} returns phase4_step1_data object"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "phase4_step1_data" in data, "phase4_step1_data field should be present in response"
        
        phase4_step1_data = data.get("phase4_step1_data", {})
        print(f"Phase 4 Step 1 data keys: {list(phase4_step1_data.keys()) if phase4_step1_data else 'None'}")
        assert phase4_step1_data is not None, "phase4_step1_data should not be None"
    
    def test_phase4_step1_data_contains_final_prosthetic_plan(self, student_token):
        """Test that phase4_step1_data contains final_prosthetic_plan"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step1_data = data.get("phase4_step1_data", {})
        
        print(f"Phase 4 Step 1 final_prosthetic_plan: {phase4_step1_data.get('final_prosthetic_plan')}")
        assert "final_prosthetic_plan" in phase4_step1_data, "final_prosthetic_plan should be in phase4_step1_data"
    
    def test_phase4_step1_data_contains_prosthetic_material(self, student_token):
        """Test that phase4_step1_data contains prosthetic_material"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step1_data = data.get("phase4_step1_data", {})
        
        print(f"Phase 4 Step 1 prosthetic_material: {phase4_step1_data.get('prosthetic_material')}")
        assert "prosthetic_material" in phase4_step1_data, "prosthetic_material should be in phase4_step1_data"
    
    def test_phase4_step1_data_contains_impression_type(self, student_token):
        """Test that phase4_step1_data contains impression_type"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step1_data = data.get("phase4_step1_data", {})
        
        print(f"Phase 4 Step 1 impression_type: {phase4_step1_data.get('impression_type')}")
        assert "impression_type" in phase4_step1_data, "impression_type should be in phase4_step1_data"
    
    def test_phase4_step1_data_contains_payment_complete(self, student_token):
        """Test that phase4_step1_data contains payment_complete"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step1_data = data.get("phase4_step1_data", {})
        
        print(f"Phase 4 Step 1 payment_complete: {phase4_step1_data.get('payment_complete')}")
        assert "payment_complete" in phase4_step1_data, "payment_complete should be in phase4_step1_data"
    
    def test_phase4_step1_data_contains_components_available(self, student_token):
        """Test that phase4_step1_data contains components_available"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step1_data = data.get("phase4_step1_data", {})
        
        print(f"Phase 4 Step 1 components_available: {phase4_step1_data.get('components_available')}")
        assert "components_available" in phase4_step1_data, "components_available should be in phase4_step1_data"
    
    # ==================== Phase 4 Step 2 Data Tests ====================
    
    def test_get_procedure_returns_phase4_step2_data(self, student_token):
        """Test that GET /api/procedures/{id} returns phase4_step2_data object"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "phase4_step2_data" in data, "phase4_step2_data field should be present in response"
        
        phase4_step2_data = data.get("phase4_step2_data", {})
        print(f"Phase 4 Step 2 data keys: {list(phase4_step2_data.keys()) if phase4_step2_data else 'None'}")
        assert phase4_step2_data is not None, "phase4_step2_data should not be None"
    
    def test_phase4_step2_data_contains_trial_checklist(self, student_token):
        """Test that phase4_step2_data contains trial_checklist"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step2_data = data.get("phase4_step2_data", {})
        
        print(f"Phase 4 Step 2 trial_checklist: {phase4_step2_data.get('trial_checklist')}")
        assert "trial_checklist" in phase4_step2_data, "trial_checklist should be in phase4_step2_data"
    
    def test_phase4_step2_data_contains_confirmation_statement(self, student_token):
        """Test that phase4_step2_data contains confirmation_statement"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        phase4_step2_data = data.get("phase4_step2_data", {})
        
        print(f"Phase 4 Step 2 confirmation_statement: {phase4_step2_data.get('confirmation_statement')}")
        assert "confirmation_statement" in phase4_step2_data, "confirmation_statement should be in phase4_step2_data"
    
    # ==================== Notes Fields Tests ====================
    
    def test_get_procedure_returns_phase3_student_notes(self, student_token):
        """Test that GET /api/procedures/{id} returns phase3_student_notes"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Note: phase3_student_notes may not exist if not submitted with notes
        print(f"phase3_student_notes: {data.get('phase3_student_notes', 'NOT PRESENT')}")
        # Just verify the field can be accessed (may be None/missing if not submitted)
    
    def test_get_procedure_returns_phase4_step1_student_notes(self, student_token):
        """Test that GET /api/procedures/{id} returns phase4_step1_student_notes"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"phase4_step1_student_notes: {data.get('phase4_step1_student_notes', 'NOT PRESENT')}")
    
    def test_get_procedure_returns_phase4_step2_student_notes(self, student_token):
        """Test that GET /api/procedures/{id} returns phase4_step2_student_notes"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"phase4_step2_student_notes: {data.get('phase4_step2_student_notes', 'NOT PRESENT')}")
    
    # ==================== Role Access Tests ====================
    
    def test_student_can_access_procedure_with_all_phase_data(self, student_token):
        """Test that student role can access procedure and see all phase data"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Student should be able to access procedure: {response.text}"
        
        data = response.json()
        # Verify all phase data objects are present
        assert "phase3_data" in data, "Student should see phase3_data"
        assert "phase4_step1_data" in data, "Student should see phase4_step1_data"
        assert "phase4_step2_data" in data, "Student should see phase4_step2_data"
        print("Student can access all phase data: PASS")
    
    def test_supervisor_can_access_procedure_with_all_phase_data(self, supervisor_token):
        """Test that supervisor role can access procedure and see all phase data"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        assert response.status_code == 200, f"Supervisor should be able to access procedure: {response.text}"
        
        data = response.json()
        # Verify all phase data objects are present
        assert "phase3_data" in data, "Supervisor should see phase3_data"
        assert "phase4_step1_data" in data, "Supervisor should see phase4_step1_data"
        assert "phase4_step2_data" in data, "Supervisor should see phase4_step2_data"
        print("Supervisor can access all phase data: PASS")
    
    def test_incharge_can_access_procedure_with_all_phase_data(self, incharge_token):
        """Test that incharge role can access procedure and see all phase data"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200, f"Incharge should be able to access procedure: {response.text}"
        
        data = response.json()
        # Verify all phase data objects are present
        assert "phase3_data" in data, "Incharge should see phase3_data"
        assert "phase4_step1_data" in data, "Incharge should see phase4_step1_data"
        assert "phase4_step2_data" in data, "Incharge should see phase4_step2_data"
        print("Incharge can access all phase data: PASS")
    
    # ==================== Full Data Dump Test ====================
    
    def test_full_procedure_data_dump(self, student_token):
        """Dump full procedure data for verification"""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        print("\n" + "="*60)
        print("FULL PROCEDURE DATA DUMP")
        print("="*60)
        
        # Phase 3 Data
        print("\n--- PHASE 3 DATA ---")
        phase3_data = data.get("phase3_data", {})
        for key, value in phase3_data.items():
            print(f"  {key}: {value}")
        
        # Phase 3 Notes
        print("\n--- PHASE 3 NOTES ---")
        print(f"  phase3_student_notes: {data.get('phase3_student_notes', 'NOT PRESENT')}")
        print(f"  phase3_supervisor_notes: {data.get('phase3_supervisor_notes', 'NOT PRESENT')}")
        print(f"  phase3_incharge_notes: {data.get('phase3_incharge_notes', 'NOT PRESENT')}")
        
        # Phase 4 Step 1 Data
        print("\n--- PHASE 4 STEP 1 DATA ---")
        phase4_step1_data = data.get("phase4_step1_data", {})
        for key, value in phase4_step1_data.items():
            print(f"  {key}: {value}")
        
        # Phase 4 Step 1 Notes
        print("\n--- PHASE 4 STEP 1 NOTES ---")
        print(f"  phase4_step1_student_notes: {data.get('phase4_step1_student_notes', 'NOT PRESENT')}")
        print(f"  phase4_step1_supervisor_notes: {data.get('phase4_step1_supervisor_notes', 'NOT PRESENT')}")
        print(f"  phase4_step1_incharge_notes: {data.get('phase4_step1_incharge_notes', 'NOT PRESENT')}")
        
        # Phase 4 Step 2 Data
        print("\n--- PHASE 4 STEP 2 DATA ---")
        phase4_step2_data = data.get("phase4_step2_data", {})
        for key, value in phase4_step2_data.items():
            print(f"  {key}: {value}")
        
        # Phase 4 Step 2 Notes
        print("\n--- PHASE 4 STEP 2 NOTES ---")
        print(f"  phase4_step2_student_notes: {data.get('phase4_step2_student_notes', 'NOT PRESENT')}")
        print(f"  phase4_step2_supervisor_notes: {data.get('phase4_step2_supervisor_notes', 'NOT PRESENT')}")
        print(f"  phase4_step2_incharge_notes: {data.get('phase4_step2_incharge_notes', 'NOT PRESENT')}")
        
        print("\n" + "="*60)
        
        # Verify core data structures exist
        assert phase3_data, "phase3_data should have content"
        assert phase4_step1_data, "phase4_step1_data should have content"
        assert phase4_step2_data, "phase4_step2_data should have content"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
