"""
Iteration 61: Test Approval Comments and Healing Abutment Array Features
Tests:
1. ApprovalAction model accepts optional 'comment' field
2. Phase 1 approval saves comment as phase1_supervisor_notes or phase1_incharge_notes
3. Phase 2 approval saves comment as phase2_supervisor_notes or phase2_incharge_notes
4. Phase 3 approval saves comment as phase3_supervisor_notes or phase3_incharge_notes
5. Phase 4 Step 1 approval saves comment as phase4_step1_supervisor_notes or phase4_step1_incharge_notes
6. Phase 4 Step 2 approval saves comment as phase4_step2_supervisor_notes or phase4_step2_incharge_notes
7. healing_abutment_cuff_height accepts array of strings (per-implant)
8. healing_abutment_cuff_height backward compatibility with single string
9. Procedure detail includes created_by_role field
10. Full flow test: Create → Save implant plan → Request Phase 1 → Approve with comment → Submit Phase 2 with array healing abutment → Approve Phase 2 with comment
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}


def get_user_ids(token):
    """Get supervisor and incharge IDs and names"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/users", headers=headers)
    assert response.status_code == 200
    users = response.json()
    
    supervisor_id = None
    supervisor_name = None
    incharge_id = None
    incharge_name = None
    
    for user in users:
        if user.get("email", "").lower() == "paresh.gandhi@dental.edu":
            supervisor_id = user["id"]
            supervisor_name = user.get("name", "Dr. Paresh Gandhi")
        if user.get("email", "").lower() == "abhijit.patil@dental.edu":
            incharge_id = user["id"]
            incharge_name = user.get("name", "Dr. Abhijit Patil")
    
    return {
        "supervisor_id": supervisor_id,
        "supervisor_name": supervisor_name,
        "incharge_id": incharge_id,
        "incharge_name": incharge_name
    }


def create_procedure(token, user_ids, patient_name_suffix=""):
    """Create a procedure with all required fields"""
    headers = {"Authorization": f"Bearer {token}"}
    
    future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    
    procedure_data = {
        "patient_name": f"TEST_ApprovalComments{patient_name_suffix}",
        "registration_number": f"REG{datetime.now().strftime('%H%M%S')}",
        "supervisor_id": user_ids["supervisor_id"],
        "supervisor_name": user_ids["supervisor_name"],
        "implant_incharge_id": user_ids["incharge_id"],
        "implant_incharge_name": user_ids["incharge_name"],
        "receipt_number": f"RCP{datetime.now().strftime('%H%M%S')}",
        "amount_paid": 50000.0,
        "procedure_date": future_date,
        "procedure_time": "10:00",
        "implant_procedure_type": "Single Conventional Implant",
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Single crown"
    }
    
    response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
    return response


class TestSetup:
    """Setup and health check tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"Health check passed: {response.json()}")
    
    def test_student_login(self):
        """Test student login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"Student login successful")
        return data["access_token"]
    
    def test_supervisor_login(self):
        """Test supervisor login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"Supervisor login successful")
        return data["access_token"]
    
    def test_incharge_login(self):
        """Test incharge login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"Incharge login successful")
        return data["access_token"]


class TestApprovalCommentsAndHealingAbutment:
    """Test approval comments and healing abutment array features"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, student_token):
        """Get supervisor and incharge IDs"""
        return get_user_ids(student_token)
    
    @pytest.fixture(scope="class")
    def test_procedure(self, student_token, user_ids):
        """Create a test procedure for the full flow"""
        response = create_procedure(student_token, user_ids, "_FullFlow")
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"Created test procedure: {data['id']}")
        return data
    
    def test_procedure_has_created_by_role(self, student_token, test_procedure):
        """Test that procedure detail includes created_by_role field"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id = test_procedure["id"]
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify created_by_role field exists
        assert "created_by_role" in data, "created_by_role field missing from procedure"
        assert data["created_by_role"] == "student", f"Expected created_by_role='student', got '{data.get('created_by_role')}'"
        print(f"Procedure has created_by_role: {data['created_by_role']}")
    
    def test_save_implant_plan(self, student_token, test_procedure):
        """Save implant plan for the procedure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id = test_procedure["id"]
        
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
                    "bone_type": "D2"
                },
                {
                    "position": "16",
                    "brand": "Straumann",
                    "system": "BLT",
                    "diameter": 4.8,
                    "length": 8.0,
                    "bone_width": 9.0,
                    "bone_height": 10.0,
                    "bone_type": "D3"
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers)
        assert response.status_code == 200, f"Failed to save implant plan: {response.text}"
        print("Implant plan saved successfully")
    
    def test_request_phase1_approval(self, student_token, test_procedure):
        """Request Phase 1 approval"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id = test_procedure["id"]
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200, f"Failed to request Phase 1 approval: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_phase1", f"Expected status 'pending_phase1', got '{data.get('status')}'"
        print("Phase 1 approval requested successfully")
    
    def test_supervisor_approve_phase1_with_comment(self, supervisor_token, test_procedure):
        """Test supervisor approves Phase 1 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        procedure_id = test_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 1 approval comment - looks good"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 1: {response.text}"
        
        data = response.json()
        # Check that supervisor comment was saved
        assert data.get("phase1_supervisor_notes") == approval_data["comment"], \
            f"Expected phase1_supervisor_notes='{approval_data['comment']}', got '{data.get('phase1_supervisor_notes')}'"
        print(f"Supervisor Phase 1 approval with comment saved: {data.get('phase1_supervisor_notes')}")
    
    def test_incharge_approve_phase1_with_comment(self, incharge_token, test_procedure):
        """Test incharge approves Phase 1 with comment"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = test_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 1 approval comment - approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 1: {response.text}"
        
        data = response.json()
        # Check that incharge comment was saved
        assert data.get("phase1_incharge_notes") == approval_data["comment"], \
            f"Expected phase1_incharge_notes='{approval_data['comment']}', got '{data.get('phase1_incharge_notes')}'"
        # Status should now be phase1_approved
        assert data.get("status") == "phase1_approved", f"Expected status 'phase1_approved', got '{data.get('status')}'"
        print(f"Incharge Phase 1 approval with comment saved: {data.get('phase1_incharge_notes')}")
        print(f"Phase 1 fully approved, status: {data.get('status')}")
    
    def test_submit_phase2_with_array_healing_abutment(self, student_token, test_procedure):
        """Test submitting Phase 2 with healing_abutment_cuff_height as array"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id = test_procedure["id"]
        
        phase2_data = {
            "pre_surgery_checklist": {
                "patient_consent": True,
                "medical_clearance": True,
                "cbct_reviewed": True,
                "surgical_guide_ready": True,
                "implant_components_available": True,
                "sterilization_complete": True,
                "patient_vitals_checked": True
            },
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [35.0, 40.0],  # Per implant
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": ["3.0", "4.5"],  # Array of strings (per implant)
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions_given": True,
                "prescription_provided": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST_Phase 2 surgical notes"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 2: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_phase2", f"Expected status 'pending_phase2', got '{data.get('status')}'"
        
        # Verify healing_abutment_cuff_height was saved inside phase2_data
        phase2_response = data.get("phase2_data", {})
        assert phase2_response.get("healing_abutment_cuff_height") == ["3.0", "4.5"], \
            f"Expected phase2_data.healing_abutment_cuff_height=['3.0', '4.5'], got '{phase2_response.get('healing_abutment_cuff_height')}'"
        print(f"Phase 2 submitted with array healing_abutment_cuff_height: {phase2_response.get('healing_abutment_cuff_height')}")
    
    def test_supervisor_approve_phase2_with_comment(self, supervisor_token, test_procedure):
        """Test supervisor approves Phase 2 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        procedure_id = test_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 2 approval comment - surgical protocol approved"
        }
        
        # Phase 2 approval uses the same /approve endpoint (status-based routing)
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 2: {response.text}"
        
        data = response.json()
        # Check that supervisor comment was saved
        assert data.get("phase2_supervisor_notes") == approval_data["comment"], \
            f"Expected phase2_supervisor_notes='{approval_data['comment']}', got '{data.get('phase2_supervisor_notes')}'"
        print(f"Supervisor Phase 2 approval with comment saved: {data.get('phase2_supervisor_notes')}")
    
    def test_incharge_approve_phase2_with_comment(self, incharge_token, test_procedure):
        """Test incharge approves Phase 2 with comment"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = test_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 2 approval comment - all good"
        }
        
        # Phase 2 approval uses the same /approve endpoint (status-based routing)
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 2: {response.text}"
        
        data = response.json()
        # Check that incharge comment was saved
        assert data.get("phase2_incharge_notes") == approval_data["comment"], \
            f"Expected phase2_incharge_notes='{approval_data['comment']}', got '{data.get('phase2_incharge_notes')}'"
        # Status should now be phase2_approved
        assert data.get("status") == "phase2_approved", f"Expected status 'phase2_approved', got '{data.get('status')}'"
        print(f"Incharge Phase 2 approval with comment saved: {data.get('phase2_incharge_notes')}")
        print(f"Phase 2 fully approved, status: {data.get('status')}")


class TestHealingAbutmentBackwardCompatibility:
    """Test backward compatibility for healing_abutment_cuff_height with single string"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, student_token):
        """Get supervisor and incharge IDs"""
        return get_user_ids(student_token)
    
    @pytest.fixture(scope="class")
    def backward_compat_procedure(self, student_token, user_ids):
        """Create a procedure for backward compatibility test"""
        response = create_procedure(student_token, user_ids, "_BackwardCompat")
        assert response.status_code == 200
        return response.json()
    
    def test_setup_backward_compat_procedure(self, student_token, supervisor_token, incharge_token, backward_compat_procedure):
        """Setup: Save implant plan and get Phase 1 approved"""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_supervisor = {"Authorization": f"Bearer {supervisor_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = backward_compat_procedure["id"]
        
        # Save implant plan
        implant_plan = {
            "implants": [
                {
                    "position": "21",
                    "brand": "Nobel",
                    "system": "Active",
                    "diameter": 4.3,
                    "length": 11.5,
                    "bone_width": 7.0,
                    "bone_height": 11.0,
                    "bone_type": "D2"
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers_student)
        assert response.status_code == 200
        
        # Request Phase 1 approval
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers_student)
        assert response.status_code == 200
        
        # Supervisor approve
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers_supervisor)
        assert response.status_code == 200
        
        # Incharge approve
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers_incharge)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "phase1_approved"
        print("Backward compat procedure Phase 1 approved")
    
    def test_submit_phase2_with_single_string_healing_abutment(self, student_token, backward_compat_procedure):
        """Test submitting Phase 2 with healing_abutment_cuff_height as single string (backward compatibility)"""
        headers = {"Authorization": f"Bearer {student_token}"}
        procedure_id = backward_compat_procedure["id"]
        
        phase2_data = {
            "pre_surgery_checklist": {
                "patient_consent": True,
                "medical_clearance": True,
                "cbct_reviewed": True,
                "surgical_guide_ready": True,
                "implant_components_available": True,
                "sterilization_complete": True,
                "patient_vitals_checked": True
            },
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "3.5",  # Single string (backward compatibility)
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions_given": True,
                "prescription_provided": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST_Phase 2 backward compat notes"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 2 with single string: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_phase2"
        # Verify healing_abutment_cuff_height was saved inside phase2_data (as single string)
        phase2_response = data.get("phase2_data", {})
        assert phase2_response.get("healing_abutment_cuff_height") == "3.5", \
            f"Expected phase2_data.healing_abutment_cuff_height='3.5', got '{phase2_response.get('healing_abutment_cuff_height')}'"
        print(f"Phase 2 submitted with single string healing_abutment_cuff_height: {phase2_response.get('healing_abutment_cuff_height')}")


class TestInchargeCreatedProcedure:
    """Test incharge-created procedure has correct created_by_role"""
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, incharge_token):
        """Get supervisor and incharge IDs"""
        return get_user_ids(incharge_token)
    
    def test_incharge_created_procedure_has_correct_role(self, incharge_token, user_ids):
        """Test that incharge-created procedure has created_by_role='implant_incharge'"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "patient_name": f"TEST_InchargeCreated_{datetime.now().strftime('%H%M%S')}",
            "registration_number": f"REG_IC{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": user_ids["supervisor_id"],
            "supervisor_name": user_ids["supervisor_name"],
            "implant_incharge_id": user_ids["incharge_id"],
            "implant_incharge_name": user_ids["incharge_name"],
            "receipt_number": f"RCP_IC{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 60000.0,
            "procedure_date": future_date,
            "procedure_time": "11:00",
            "implant_procedure_type": "Multiple Conventional Implants",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Bridge"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        data = response.json()
        
        # Verify created_by_role is 'implant_incharge'
        assert "created_by_role" in data, "created_by_role field missing"
        assert data["created_by_role"] == "implant_incharge", \
            f"Expected created_by_role='implant_incharge', got '{data.get('created_by_role')}'"
        print(f"Incharge-created procedure has created_by_role: {data['created_by_role']}")


class TestPhase3ApprovalComment:
    """Test Phase 3 (Stage 2 Surgical) approval with comment"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, student_token):
        return get_user_ids(student_token)
    
    @pytest.fixture(scope="class")
    def phase3_procedure(self, student_token, supervisor_token, incharge_token, user_ids):
        """Create and progress a procedure to Phase 3"""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_supervisor = {"Authorization": f"Bearer {supervisor_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        
        # Create procedure
        response = create_procedure(student_token, user_ids, "_Phase3Comment")
        assert response.status_code == 200
        procedure_id = response.json()["id"]
        
        # Save implant plan
        implant_plan = {"implants": [{"position": "36", "brand": "Straumann", "system": "BLT", "diameter": 4.1, "length": 10.0}]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers_student)
        
        # Request and approve Phase 1
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        # Submit and approve Phase 2
        phase2_data = {
            "pre_surgery_checklist": {"patient_consent": True, "medical_clearance": True, "cbct_reviewed": True, "surgical_guide_ready": True, "implant_components_available": True, "sterilization_complete": True, "patient_vitals_checked": True},
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "3.0",
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {"post_op_instructions_given": True, "prescription_provided": True, "follow_up_scheduled": True}
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        # Submit Phase 3 (Stage 2 Surgical) - endpoint is /stage2/surgical (not /submit)
        phase3_data = {
            "checklist_items": {"healing_verified": True, "soft_tissue_healthy": True},
            "isq_value": "75",
            "healing_abutment_height": "4.0",
            "student_notes": "TEST_Phase 3 notes"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_stage2_surgical"
        
        return {"id": procedure_id}
    
    def test_supervisor_approve_phase3_with_comment(self, supervisor_token, phase3_procedure):
        """Test supervisor approves Phase 3 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        procedure_id = phase3_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 3 approval comment - healing looks good"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 3: {response.text}"
        
        data = response.json()
        assert data.get("phase3_supervisor_notes") == approval_data["comment"], \
            f"Expected phase3_supervisor_notes='{approval_data['comment']}', got '{data.get('phase3_supervisor_notes')}'"
        print(f"Supervisor Phase 3 approval with comment saved: {data.get('phase3_supervisor_notes')}")
    
    def test_incharge_approve_phase3_with_comment(self, incharge_token, phase3_procedure):
        """Test incharge approves Phase 3 with comment"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = phase3_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 3 approval comment - approved for prosthetic"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 3: {response.text}"
        
        data = response.json()
        assert data.get("phase3_incharge_notes") == approval_data["comment"], \
            f"Expected phase3_incharge_notes='{approval_data['comment']}', got '{data.get('phase3_incharge_notes')}'"
        assert data.get("status") == "stage2_surgical_approved"
        print(f"Incharge Phase 3 approval with comment saved: {data.get('phase3_incharge_notes')}")


class TestPhase4Step1ApprovalComment:
    """Test Phase 4 Step 1 (Prosthetic) approval with comment"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, student_token):
        return get_user_ids(student_token)
    
    @pytest.fixture(scope="class")
    def phase4_procedure(self, student_token, supervisor_token, incharge_token, user_ids):
        """Create and progress a procedure to Phase 4 Step 1"""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_supervisor = {"Authorization": f"Bearer {supervisor_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        
        # Create procedure
        response = create_procedure(student_token, user_ids, "_Phase4Step1Comment")
        assert response.status_code == 200
        procedure_id = response.json()["id"]
        
        # Save implant plan
        implant_plan = {"implants": [{"position": "46", "brand": "Straumann", "system": "BLT", "diameter": 4.1, "length": 10.0}]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers_student)
        
        # Progress through Phase 1, 2, 3
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        phase2_data = {
            "pre_surgery_checklist": {"patient_consent": True, "medical_clearance": True, "cbct_reviewed": True, "surgical_guide_ready": True, "implant_components_available": True, "sterilization_complete": True, "patient_vitals_checked": True},
            "anesthesia_adequate": "Yes", "flap_design": "Full thickness", "drilling_type": "Sequential",
            "implant_seated_correctly": True, "torque_values": [35.0], "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "3.0", "sutures_placed": True, "hemostasis_achieved": True,
            "post_op_checklist": {"post_op_instructions_given": True, "prescription_provided": True, "follow_up_scheduled": True}
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        phase3_data = {"checklist_items": {"healing_verified": True}, "isq_value": "75", "healing_abutment_height": "4.0"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_incharge)
        
        # Submit Phase 4 Step 1 (Prosthetic)
        phase4_data = {
            "final_prosthetic_plan": "Single crown",
            "prosthetic_material": "Zirconia",
            "custom_abutment": "Yes",
            "payment_complete": True,
            "components_available": True,
            "impression_type": "intraoral_scans",
            "student_notes": "TEST_Phase 4 Step 1 notes"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_data, headers=headers_student)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_stage2_prosthetic"
        
        return {"id": procedure_id}
    
    def test_supervisor_approve_phase4_step1_with_comment(self, supervisor_token, phase4_procedure):
        """Test supervisor approves Phase 4 Step 1 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        procedure_id = phase4_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 4 Step 1 approval comment - prosthetic plan approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 1: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step1_supervisor_notes") == approval_data["comment"], \
            f"Expected phase4_step1_supervisor_notes='{approval_data['comment']}', got '{data.get('phase4_step1_supervisor_notes')}'"
        print(f"Supervisor Phase 4 Step 1 approval with comment saved: {data.get('phase4_step1_supervisor_notes')}")
    
    def test_incharge_approve_phase4_step1_with_comment(self, incharge_token, phase4_procedure):
        """Test incharge approves Phase 4 Step 1 with comment"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = phase4_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 4 Step 1 approval comment - proceed to trial"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 1: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step1_incharge_notes") == approval_data["comment"], \
            f"Expected phase4_step1_incharge_notes='{approval_data['comment']}', got '{data.get('phase4_step1_incharge_notes')}'"
        assert data.get("status") == "stage2_prosthetic_step1_approved"
        print(f"Incharge Phase 4 Step 1 approval with comment saved: {data.get('phase4_step1_incharge_notes')}")


class TestPhase4Step2ApprovalComment:
    """Test Phase 4 Step 2 (Final Delivery) approval with comment"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, student_token):
        return get_user_ids(student_token)
    
    @pytest.fixture(scope="class")
    def phase4_step2_procedure(self, student_token, supervisor_token, incharge_token, user_ids):
        """Create and progress a procedure to Phase 4 Step 2"""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_supervisor = {"Authorization": f"Bearer {supervisor_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        
        # Create procedure
        response = create_procedure(student_token, user_ids, "_Phase4Step2Comment")
        assert response.status_code == 200
        procedure_id = response.json()["id"]
        
        # Save implant plan
        implant_plan = {"implants": [{"position": "26", "brand": "Straumann", "system": "BLT", "diameter": 4.1, "length": 10.0}]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers_student)
        
        # Progress through Phase 1, 2, 3, 4 Step 1
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        phase2_data = {
            "pre_surgery_checklist": {"patient_consent": True, "medical_clearance": True, "cbct_reviewed": True, "surgical_guide_ready": True, "implant_components_available": True, "sterilization_complete": True, "patient_vitals_checked": True},
            "anesthesia_adequate": "Yes", "flap_design": "Full thickness", "drilling_type": "Sequential",
            "implant_seated_correctly": True, "torque_values": [35.0], "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "3.0", "sutures_placed": True, "hemostasis_achieved": True,
            "post_op_checklist": {"post_op_instructions_given": True, "prescription_provided": True, "follow_up_scheduled": True}
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_incharge)
        
        phase3_data = {"checklist_items": {"healing_verified": True}, "isq_value": "75", "healing_abutment_height": "4.0"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_incharge)
        
        phase4_data = {"final_prosthetic_plan": "Single crown", "prosthetic_material": "Zirconia", "custom_abutment": "Yes", "payment_complete": True, "components_available": True, "impression_type": "intraoral_scans"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve"}, headers=headers_supervisor)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve"}, headers=headers_incharge)
        
        # Submit Phase 4 Step 2 (Final Delivery)
        phase4_step2_data = {
            "trial_checklist": {"fit_verified": True, "occlusion_checked": True, "aesthetics_approved": True},
            "student_notes": "TEST_Phase 4 Step 2 notes",
            "confirmation_statement": True
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2", json=phase4_step2_data, headers=headers_student)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_final_delivery"
        
        return {"id": procedure_id}
    
    def test_supervisor_approve_phase4_step2_with_comment(self, supervisor_token, phase4_step2_procedure):
        """Test supervisor approves Phase 4 Step 2 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        procedure_id = phase4_step2_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 4 Step 2 approval comment - final delivery approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 2: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step2_supervisor_notes") == approval_data["comment"], \
            f"Expected phase4_step2_supervisor_notes='{approval_data['comment']}', got '{data.get('phase4_step2_supervisor_notes')}'"
        print(f"Supervisor Phase 4 Step 2 approval with comment saved: {data.get('phase4_step2_supervisor_notes')}")
    
    def test_incharge_approve_phase4_step2_with_comment(self, incharge_token, phase4_step2_procedure):
        """Test incharge approves Phase 4 Step 2 with comment - case completed"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        procedure_id = phase4_step2_procedure["id"]
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 4 Step 2 approval comment - case completed successfully"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 2: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step2_incharge_notes") == approval_data["comment"], \
            f"Expected phase4_step2_incharge_notes='{approval_data['comment']}', got '{data.get('phase4_step2_incharge_notes')}'"
        assert data.get("status") == "completed"
        print(f"Incharge Phase 4 Step 2 approval with comment saved: {data.get('phase4_step2_incharge_notes')}")
        print(f"Case completed! Status: {data.get('status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
