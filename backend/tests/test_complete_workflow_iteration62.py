"""
Iteration 62: Complete Workflow Test - Student Case and Incharge Self-Approval
Tests the full workflow from case creation to completion through all 5 phases:
1. Student creates case → saves implant plan → requests Phase 1 approval
2. Supervisor approves Phase 1 with comment → Incharge approves Phase 1 with comment → status=phase1_approved
3. Student submits Phase 2 with array healing abutment → Supervisor approves → Incharge approves → status=phase2_approved
4. Student submits Phase 3 → Supervisor approves → Incharge approves → status=stage2_surgical_approved
5. Student submits Phase 4 Step 1 → Supervisor approves → Incharge approves → status=stage2_prosthetic_step1_approved
6. Student submits Phase 4 Step 2 → Supervisor approves → Incharge approves → status=completed
7. Incharge-created case: Incharge creates case and can self-approve all phases
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


class TestHealthAndAuth:
    """Basic health and authentication tests"""
    
    def test_01_health_endpoint(self):
        """Test health endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"Health check passed: {response.json()}")
    
    def test_02_student_login(self):
        """Test student login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Student login successful")
    
    def test_03_supervisor_login(self):
        """Test supervisor login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Supervisor login successful")
    
    def test_04_incharge_login(self):
        """Test incharge login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Incharge login successful")


class TestCompleteStudentWorkflow:
    """Test complete workflow: Student creates case → all phases → completed"""
    
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
    def procedure_id(self, student_token, user_ids):
        """Create a test procedure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "patient_name": f"TEST_CompleteWorkflow_{datetime.now().strftime('%H%M%S')}",
            "registration_number": f"REG_CW{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": user_ids["supervisor_id"],
            "supervisor_name": user_ids["supervisor_name"],
            "implant_incharge_id": user_ids["incharge_id"],
            "implant_incharge_name": user_ids["incharge_name"],
            "receipt_number": f"RCP_CW{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 50000.0,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Multiple Conventional Implants",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Bridge"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"Created test procedure: {data['id']}")
        return data["id"]
    
    def test_01_procedure_created_with_student_role(self, student_token, procedure_id):
        """Verify procedure has created_by_role='student'"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("created_by_role") == "student"
        assert data.get("status") == "draft"
        print(f"Procedure created with role: {data['created_by_role']}, status: {data['status']}")
    
    def test_02_save_implant_plan(self, student_token, procedure_id):
        """Save implant plan with 2 implants"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
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
        print("Implant plan saved with 2 implants")
    
    def test_03_request_phase1_approval(self, student_token, procedure_id):
        """Request Phase 1 approval - status should become pending_phase1"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200, f"Failed to request Phase 1 approval: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_phase1", f"Expected status 'pending_phase1', got '{data.get('status')}'"
        print(f"Phase 1 approval requested, status: {data['status']}")
    
    def test_04_supervisor_approve_phase1_with_comment(self, supervisor_token, procedure_id):
        """Supervisor approves Phase 1 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 1 comment - implant plan looks good"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 1: {response.text}"
        
        data = response.json()
        assert data.get("phase1_supervisor_notes") == approval_data["comment"]
        print(f"Supervisor approved Phase 1, comment saved: {data.get('phase1_supervisor_notes')}")
    
    def test_05_incharge_approve_phase1_with_comment(self, incharge_token, procedure_id):
        """Incharge approves Phase 1 with comment - status becomes phase1_approved"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 1 comment - approved for surgery"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 1: {response.text}"
        
        data = response.json()
        assert data.get("phase1_incharge_notes") == approval_data["comment"]
        assert data.get("status") == "phase1_approved"
        print(f"Incharge approved Phase 1, status: {data['status']}")
    
    def test_06_submit_phase2_with_array_healing_abutment(self, student_token, procedure_id):
        """Submit Phase 2 with healing_abutment_cuff_height as array"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
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
            "torque_values": [35.0, 40.0],
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": ["3.0", "4.5"],
            "implant_site": "14, 16",
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions_given": True,
                "prescription_provided": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST_Phase 2 surgical notes - both implants placed successfully"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 2: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_phase2"
        phase2_response = data.get("phase2_data", {})
        assert phase2_response.get("healing_abutment_cuff_height") == ["3.0", "4.5"]
        print(f"Phase 2 submitted, status: {data['status']}, healing_abutment: {phase2_response.get('healing_abutment_cuff_height')}")
    
    def test_07_supervisor_approve_phase2_with_comment(self, supervisor_token, procedure_id):
        """Supervisor approves Phase 2 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 2 comment - surgical protocol approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 2: {response.text}"
        
        data = response.json()
        assert data.get("phase2_supervisor_notes") == approval_data["comment"]
        print(f"Supervisor approved Phase 2, comment saved: {data.get('phase2_supervisor_notes')}")
    
    def test_08_incharge_approve_phase2_with_comment(self, incharge_token, procedure_id):
        """Incharge approves Phase 2 with comment - status becomes phase2_approved"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 2 comment - proceed to healing phase"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 2: {response.text}"
        
        data = response.json()
        assert data.get("phase2_incharge_notes") == approval_data["comment"]
        assert data.get("status") == "phase2_approved"
        print(f"Incharge approved Phase 2, status: {data['status']}")
    
    def test_09_submit_phase3(self, student_token, procedure_id):
        """Submit Phase 3 (Stage 2 Surgical) - healing verification"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        phase3_data = {
            "checklist_items": {
                "healing_verified": True,
                "soft_tissue_healthy": True,
                "no_infection": True,
                "implant_stable": True
            },
            "isq_value": "78",
            "healing_abutment_height": ["4.0", "4.5"],
            "student_notes": "TEST_Phase 3 notes - healing progressing well"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 3: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_stage2_surgical"
        print(f"Phase 3 submitted, status: {data['status']}")
    
    def test_10_supervisor_approve_phase3_with_comment(self, supervisor_token, procedure_id):
        """Supervisor approves Phase 3 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 3 comment - healing verified"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 3: {response.text}"
        
        data = response.json()
        assert data.get("phase3_supervisor_notes") == approval_data["comment"]
        print(f"Supervisor approved Phase 3, comment saved: {data.get('phase3_supervisor_notes')}")
    
    def test_11_incharge_approve_phase3_with_comment(self, incharge_token, procedure_id):
        """Incharge approves Phase 3 with comment - status becomes stage2_surgical_approved"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 3 comment - ready for prosthetic phase"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 3: {response.text}"
        
        data = response.json()
        assert data.get("phase3_incharge_notes") == approval_data["comment"]
        assert data.get("status") == "stage2_surgical_approved"
        print(f"Incharge approved Phase 3, status: {data['status']}")
    
    def test_12_submit_phase4_step1(self, student_token, procedure_id):
        """Submit Phase 4 Step 1 (Prosthetic planning)"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # checklist requires items: List[ChecklistItem] format
        phase4_data = {
            "final_prosthetic_plan": "Bridge",
            "prosthetic_material": "Zirconia",
            "custom_abutment": "Yes",
            "payment_complete": True,
            "components_available": True,
            "impression_type": "intraoral_scans",
            "checklist": {
                "items": [
                    {"label": "Abutment selected", "value": True},
                    {"label": "Shade selected", "value": True},
                    {"label": "Lab order placed", "value": True}
                ]
            },
            "student_notes": "TEST_Phase 4 Step 1 notes - prosthetic planning complete"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 4 Step 1: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_stage2_prosthetic"
        print(f"Phase 4 Step 1 submitted, status: {data['status']}")
    
    def test_13_supervisor_approve_phase4_step1_with_comment(self, supervisor_token, procedure_id):
        """Supervisor approves Phase 4 Step 1 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 4 Step 1 comment - prosthetic plan approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 1: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step1_supervisor_notes") == approval_data["comment"]
        print(f"Supervisor approved Phase 4 Step 1, comment saved: {data.get('phase4_step1_supervisor_notes')}")
    
    def test_14_incharge_approve_phase4_step1_with_comment(self, incharge_token, procedure_id):
        """Incharge approves Phase 4 Step 1 with comment - status becomes stage2_prosthetic_step1_approved"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 4 Step 1 comment - proceed to trial"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 1: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step1_incharge_notes") == approval_data["comment"]
        assert data.get("status") == "stage2_prosthetic_step1_approved"
        print(f"Incharge approved Phase 4 Step 1, status: {data['status']}")
    
    def test_15_submit_phase4_step2(self, student_token, procedure_id):
        """Submit Phase 4 Step 2 (Final delivery)"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        phase4_step2_data = {
            "trial_checklist": {
                "fit_verified": True,
                "occlusion_checked": True,
                "aesthetics_approved": True,
                "patient_satisfied": True
            },
            "student_notes": "TEST_Phase 4 Step 2 notes - final delivery ready",
            "confirmation_statement": True
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2", json=phase4_step2_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit Phase 4 Step 2: {response.text}"
        
        data = response.json()
        assert data.get("status") == "pending_final_delivery"
        print(f"Phase 4 Step 2 submitted, status: {data['status']}")
    
    def test_16_supervisor_approve_phase4_step2_with_comment(self, supervisor_token, procedure_id):
        """Supervisor approves Phase 4 Step 2 with comment"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Supervisor Phase 4 Step 2 comment - final delivery approved"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 2: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step2_supervisor_notes") == approval_data["comment"]
        print(f"Supervisor approved Phase 4 Step 2, comment saved: {data.get('phase4_step2_supervisor_notes')}")
    
    def test_17_incharge_approve_phase4_step2_with_comment(self, incharge_token, procedure_id):
        """Incharge approves Phase 4 Step 2 with comment - status becomes completed"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        approval_data = {
            "action": "approve",
            "comment": "TEST_Incharge Phase 4 Step 2 comment - case completed successfully"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 4 Step 2: {response.text}"
        
        data = response.json()
        assert data.get("phase4_step2_incharge_notes") == approval_data["comment"]
        assert data.get("status") == "completed"
        print(f"Incharge approved Phase 4 Step 2, status: {data['status']} - CASE COMPLETED!")
    
    def test_18_verify_all_comments_saved(self, student_token, procedure_id):
        """Verify all approval comments are saved on the procedure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all comments
        assert "TEST_Supervisor Phase 1 comment" in data.get("phase1_supervisor_notes", "")
        assert "TEST_Incharge Phase 1 comment" in data.get("phase1_incharge_notes", "")
        assert "TEST_Supervisor Phase 2 comment" in data.get("phase2_supervisor_notes", "")
        assert "TEST_Incharge Phase 2 comment" in data.get("phase2_incharge_notes", "")
        assert "TEST_Supervisor Phase 3 comment" in data.get("phase3_supervisor_notes", "")
        assert "TEST_Incharge Phase 3 comment" in data.get("phase3_incharge_notes", "")
        assert "TEST_Supervisor Phase 4 Step 1 comment" in data.get("phase4_step1_supervisor_notes", "")
        assert "TEST_Incharge Phase 4 Step 1 comment" in data.get("phase4_step1_incharge_notes", "")
        assert "TEST_Supervisor Phase 4 Step 2 comment" in data.get("phase4_step2_supervisor_notes", "")
        assert "TEST_Incharge Phase 4 Step 2 comment" in data.get("phase4_step2_incharge_notes", "")
        
        print("All approval comments verified on procedure document")


class TestInchargeSelfApprovalWorkflow:
    """Test Incharge-created case with self-approval through all phases"""
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def user_ids(self, incharge_token):
        return get_user_ids(incharge_token)
    
    @pytest.fixture(scope="class")
    def incharge_procedure_id(self, incharge_token, user_ids):
        """Create a procedure as incharge"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "patient_name": f"TEST_InchargeSelfApproval_{datetime.now().strftime('%H%M%S')}",
            "registration_number": f"REG_ISA{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": user_ids["supervisor_id"],
            "supervisor_name": user_ids["supervisor_name"],
            "implant_incharge_id": user_ids["incharge_id"],
            "implant_incharge_name": user_ids["incharge_name"],
            "receipt_number": f"RCP_ISA{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 75000.0,
            "procedure_date": future_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Immediate Loading"],
            "prosthetic_plan": "Single crown"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        data = response.json()
        assert data.get("created_by_role") == "implant_incharge"
        print(f"Incharge created procedure: {data['id']}, role: {data['created_by_role']}")
        return data["id"]
    
    def test_01_incharge_save_implant_plan(self, incharge_token, incharge_procedure_id):
        """Incharge saves implant plan"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        implant_plan = {
            "implants": [
                {
                    "position": "21",
                    "brand": "Nobel",
                    "system": "Active",
                    "diameter": 4.3,
                    "length": 13.0,
                    "bone_width": 8.0,
                    "bone_height": 14.0,
                    "bone_type": "D2"
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/implant-plan", json=implant_plan, headers=headers)
        assert response.status_code == 200
        print("Incharge saved implant plan")
    
    def test_02_incharge_request_phase1_approval(self, incharge_token, incharge_procedure_id):
        """Incharge requests Phase 1 approval"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_phase1"
        print(f"Phase 1 approval requested, status: {data['status']}")
    
    def test_03_incharge_self_approve_phase1(self, incharge_token, incharge_procedure_id):
        """Incharge self-approves Phase 1 (auto-approves both roles at once)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Single approval - incharge self-created case auto-approves both roles
        approval_data = {"action": "approve", "comment": "TEST_Incharge self-approval Phase 1"}
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/approve", json=approval_data, headers=headers)
        assert response.status_code == 200, f"Failed to approve Phase 1: {response.text}"
        data = response.json()
        assert data.get("status") == "phase1_approved", f"Expected status 'phase1_approved', got '{data.get('status')}'"
        print(f"Incharge self-approved Phase 1, status: {data['status']}")
    
    def test_04_incharge_submit_phase2(self, incharge_token, incharge_procedure_id):
        """Incharge submits Phase 2"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
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
            "torque_values": [45.0],
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "4.0",
            "implant_site": "21",
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions_given": True,
                "prescription_provided": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST_Incharge Phase 2 notes"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_phase2"
        print(f"Phase 2 submitted, status: {data['status']}")
    
    def test_05_incharge_self_approve_phase2(self, incharge_token, incharge_procedure_id):
        """Incharge self-approves Phase 2 (auto-approves both roles at once)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Single approval - incharge self-created case auto-approves both roles
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/approve", 
                                json={"action": "approve", "comment": "TEST_Self Phase 2"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "phase2_approved"
        print(f"Incharge self-approved Phase 2, status: {data['status']}")
    
    def test_06_incharge_submit_phase3(self, incharge_token, incharge_procedure_id):
        """Incharge submits Phase 3"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        phase3_data = {
            "checklist_items": {
                "healing_verified": True,
                "soft_tissue_healthy": True,
                "no_infection": True
            },
            "isq_value": "80",
            "healing_abutment_height": "4.5",
            "student_notes": "TEST_Incharge Phase 3 notes"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/surgical", json=phase3_data, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_stage2_surgical"
        print(f"Phase 3 submitted, status: {data['status']}")
    
    def test_07_incharge_self_approve_phase3(self, incharge_token, incharge_procedure_id):
        """Incharge self-approves Phase 3 (auto-approves both roles at once)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Single approval - incharge self-created case auto-approves both roles
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/surgical/approve", 
                                json={"action": "approve", "comment": "TEST_Self Phase 3"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "stage2_surgical_approved"
        print(f"Incharge self-approved Phase 3, status: {data['status']}")
    
    def test_08_incharge_submit_phase4_step1(self, incharge_token, incharge_procedure_id):
        """Incharge submits Phase 4 Step 1"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # checklist requires items: List[ChecklistItem] format
        phase4_data = {
            "final_prosthetic_plan": "Single crown",
            "prosthetic_material": "E-max",
            "custom_abutment": "No",
            "payment_complete": True,
            "components_available": True,
            "impression_type": "conventional",
            "checklist": {
                "items": [
                    {"label": "Abutment selected", "value": True},
                    {"label": "Shade selected", "value": True}
                ]
            },
            "student_notes": "TEST_Incharge Phase 4 Step 1 notes"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/prosthetic", json=phase4_data, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_stage2_prosthetic"
        print(f"Phase 4 Step 1 submitted, status: {data['status']}")
    
    def test_09_incharge_self_approve_phase4_step1(self, incharge_token, incharge_procedure_id):
        """Incharge self-approves Phase 4 Step 1 (auto-approves both roles at once)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Single approval - incharge self-created case auto-approves both roles
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/prosthetic/approve", 
                                json={"action": "approve", "comment": "TEST_Self Phase 4 Step 1"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "stage2_prosthetic_step1_approved"
        print(f"Incharge self-approved Phase 4 Step 1, status: {data['status']}")
    
    def test_10_incharge_submit_phase4_step2(self, incharge_token, incharge_procedure_id):
        """Incharge submits Phase 4 Step 2"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        phase4_step2_data = {
            "trial_checklist": {
                "fit_verified": True,
                "occlusion_checked": True,
                "aesthetics_approved": True
            },
            "student_notes": "TEST_Incharge Phase 4 Step 2 notes",
            "confirmation_statement": True
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/prosthetic/step2", json=phase4_step2_data, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pending_final_delivery"
        print(f"Phase 4 Step 2 submitted, status: {data['status']}")
    
    def test_11_incharge_self_approve_phase4_step2_completed(self, incharge_token, incharge_procedure_id):
        """Incharge self-approves Phase 4 Step 2 - case completed (auto-approves both roles at once)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Single approval - incharge self-created case auto-approves both roles
        response = requests.post(f"{BASE_URL}/api/procedures/{incharge_procedure_id}/stage2/prosthetic/step2/approve", 
                                json={"action": "approve", "comment": "TEST_Self Phase 4 Step 2 - COMPLETED"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "completed"
        print(f"Incharge self-approved Phase 4 Step 2, status: {data['status']} - CASE COMPLETED!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
