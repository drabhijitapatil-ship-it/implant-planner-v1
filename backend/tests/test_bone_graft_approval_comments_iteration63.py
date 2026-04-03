"""
Iteration 63: Test Bone Graft and Approval Comments Features
Tests:
1. Phase 2 submit with bone_graft_used=true and bone_graft_details saves correctly
2. Phase 2 submit with bone_graft_used=false stores false, no details
3. Supervisor approves Phase 2 with comment saves phase2_supervisor_notes
4. InCharge approves Phase 2 with comment saves phase2_incharge_notes
5. Phase 3 approve with comment saves phase3_supervisor_notes / phase3_incharge_notes
6. Phase 4 Step 1 approve with comment saves phase4_step1_supervisor_notes / phase4_step1_incharge_notes
7. Phase 4 Step 2 approve with comment saves phase4_step2_supervisor_notes / phase4_step2_incharge_notes
8. Phase 1 approval still works WITHOUT comment field (no regression)
9. Approving without comment field still works (comment is optional)
10. PDF export includes bone graft data and supervisor/incharge notes
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}

# Known IDs from context
SUPERVISOR_ID = "69b79407a17f36c024eb2d60"
SUPERVISOR_NAME = "Dr. Paresh Gandhi"
INCHARGE_ID = "69b79407a17f36c024eb2d5e"
INCHARGE_NAME = "Dr. Abhijit Patil"


class TestBoneGraftAndApprovalComments:
    """Test bone graft feature and approval comments for Phase 2-4"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        """Get student auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get supervisor auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200, f"Supervisor login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        """Get incharge auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200, f"Incharge login failed: {response.text}"
        return response.json()["access_token"]
    
    def create_procedure(self, token, prefix="TEST_BONEGRAFT"):
        """Helper to create a new procedure"""
        headers = {"Authorization": f"Bearer {token}"}
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")  # 7 days in future
        procedure_data = {
            "patient_name": f"{prefix}_{datetime.now().strftime('%H%M%S')}",
            "registration_number": f"REG{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": SUPERVISOR_ID,
            "supervisor_name": SUPERVISOR_NAME,
            "implant_incharge_id": INCHARGE_ID,
            "implant_incharge_name": INCHARGE_NAME,
            "receipt_number": f"RCP{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 5000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],  # Must be a list
            "prosthetic_plan": "Single Crown"
        }
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
        assert response.status_code == 200, f"Create procedure failed: {response.text}"
        return response.json()["id"]
    
    def save_implant_plan(self, token, procedure_id):
        """Helper to save implant plan"""
        headers = {"Authorization": f"Bearer {token}"}
        implant_plan = {
            "implants": [{
                "position": "16",
                "brand": "Nobel Biocare",
                "system": "Active",
                "diameter": 4.3,
                "length": 10.0,
                "bone_width": 8.0,
                "bone_height": 12.0,
                "bone_type": "D2"
            }]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=headers)
        assert response.status_code == 200, f"Save implant plan failed: {response.text}"
    
    def request_phase1_approval(self, token, procedure_id):
        """Helper to request Phase 1 approval"""
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200, f"Request Phase 1 approval failed: {response.text}"
    
    def approve_phase1(self, token, procedure_id, with_comment=False):
        """Helper to approve Phase 1"""
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"action": "approve"}
        if with_comment:
            payload["comment"] = "Phase 1 comment test"
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=payload, headers=headers)
        assert response.status_code == 200, f"Approve Phase 1 failed: {response.text}"
    
    def get_procedure(self, token, procedure_id):
        """Helper to get procedure details"""
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        return response.json()
    
    # ============ TEST: Phase 1 Approval Without Comment (No Regression) ============
    def test_phase1_approval_without_comment_no_regression(self, student_token, supervisor_token, incharge_token):
        """Test that Phase 1 approval still works WITHOUT comment field (backward compatibility)"""
        # Create procedure and get to Phase 1 pending
        procedure_id = self.create_procedure(student_token, "TEST_P1_NOCOMMENT")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        
        # Supervisor approves WITHOUT comment
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve"},  # No comment field
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 1 approve failed: {response.text}"
        
        # Incharge approves WITHOUT comment
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve"},  # No comment field
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 1 approve failed: {response.text}"
        
        # Verify status is phase1_approved
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure["status"] == "phase1_approved", f"Expected phase1_approved, got {procedure['status']}"
        print("PASS: Phase 1 approval without comment works (no regression)")
    
    # ============ TEST: Phase 2 Submit with Bone Graft TRUE ============
    def test_phase2_submit_with_bone_graft_true(self, student_token, supervisor_token, incharge_token):
        """Test Phase 2 submit with bone_graft_used=true and bone_graft_details saves correctly"""
        # Create and approve Phase 1
        procedure_id = self.create_procedure(student_token, "TEST_BONEGRAFT_TRUE")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        # Submit Phase 2 with bone graft = true
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "pre_surgery_checklist": {"consent_signed": True, "cbct_reviewed": True},
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "bone_graft_used": True,
            "bone_graft_details": "Bio-Oss 0.5g with collagen membrane",
            "implant_other_notes": "Procedure went smoothly",
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": ["3.0"],
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {"antibiotics_prescribed": True, "analgesics_prescribed": True}
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Submit Phase 2 failed: {response.text}"
        
        # Verify bone graft data saved
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure["status"] == "pending_phase2", f"Expected pending_phase2, got {procedure['status']}"
        
        phase2_saved = procedure.get("phase2_data", {})
        assert phase2_saved.get("bone_graft_used") == True, f"bone_graft_used should be True, got {phase2_saved.get('bone_graft_used')}"
        assert phase2_saved.get("bone_graft_details") == "Bio-Oss 0.5g with collagen membrane", f"bone_graft_details mismatch: {phase2_saved.get('bone_graft_details')}"
        print("PASS: Phase 2 submit with bone_graft_used=true saves correctly")
        
        return procedure_id
    
    # ============ TEST: Phase 2 Submit with Bone Graft FALSE ============
    def test_phase2_submit_with_bone_graft_false(self, student_token, supervisor_token, incharge_token):
        """Test Phase 2 submit with bone_graft_used=false stores false, no details"""
        # Create and approve Phase 1
        procedure_id = self.create_procedure(student_token, "TEST_BONEGRAFT_FALSE")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        # Submit Phase 2 with bone graft = false
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "pre_surgery_checklist": {"consent_signed": True},
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [40.0],
            "bone_graft_used": False,
            # No bone_graft_details since not used
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": ["4.0"],
            "sutures_placed": True,
            "hemostasis_achieved": True
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Submit Phase 2 failed: {response.text}"
        
        # Verify bone graft data saved as false
        procedure = self.get_procedure(student_token, procedure_id)
        phase2_saved = procedure.get("phase2_data", {})
        assert phase2_saved.get("bone_graft_used") == False, f"bone_graft_used should be False, got {phase2_saved.get('bone_graft_used')}"
        assert phase2_saved.get("bone_graft_details") is None, f"bone_graft_details should be None, got {phase2_saved.get('bone_graft_details')}"
        print("PASS: Phase 2 submit with bone_graft_used=false stores correctly")
    
    # ============ TEST: Phase 2 Approval with Comments ============
    def test_phase2_approval_with_comments(self, student_token, supervisor_token, incharge_token):
        """Test Supervisor and InCharge approve Phase 2 with comments"""
        # Create and approve Phase 1
        procedure_id = self.create_procedure(student_token, "TEST_P2_COMMENTS")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        # Submit Phase 2
        headers_student = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "torque_values": [35.0],
            "bone_graft_used": True,
            "bone_graft_details": "Test bone graft details",
            "healing_abutment_cuff_height": ["3.0"]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        assert response.status_code == 200
        
        # Supervisor approves with comment
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        sup_comment = "Supervisor Phase 2 comment: Good surgical technique"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve", "comment": sup_comment},
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 2 approve failed: {response.text}"
        
        # Verify supervisor comment saved
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase2_supervisor_notes") == sup_comment, f"phase2_supervisor_notes mismatch: {procedure.get('phase2_supervisor_notes')}"
        print("PASS: Supervisor Phase 2 comment saved correctly")
        
        # Incharge approves with comment
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        inc_comment = "InCharge Phase 2 comment: Approved for next phase"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve", "comment": inc_comment},
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 2 approve failed: {response.text}"
        
        # Verify incharge comment saved and status
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase2_incharge_notes") == inc_comment, f"phase2_incharge_notes mismatch: {procedure.get('phase2_incharge_notes')}"
        assert procedure["status"] == "phase2_approved", f"Expected phase2_approved, got {procedure['status']}"
        print("PASS: InCharge Phase 2 comment saved correctly")
        
        return procedure_id
    
    # ============ TEST: Phase 2 Approval WITHOUT Comment (Optional) ============
    def test_phase2_approval_without_comment_optional(self, student_token, supervisor_token, incharge_token):
        """Test that approving Phase 2 without comment still works (comment is optional)"""
        # Create and approve Phase 1
        procedure_id = self.create_procedure(student_token, "TEST_P2_NOCOMMENT")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        # Submit Phase 2
        headers_student = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "anesthesia_adequate": "Yes",
            "torque_values": [35.0],
            "bone_graft_used": False,
            "healing_abutment_cuff_height": ["3.0"]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        assert response.status_code == 200
        
        # Supervisor approves WITHOUT comment
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve"},  # No comment
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 2 approve without comment failed: {response.text}"
        
        # Incharge approves WITHOUT comment
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve"},  # No comment
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 2 approve without comment failed: {response.text}"
        
        # Verify status
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure["status"] == "phase2_approved", f"Expected phase2_approved, got {procedure['status']}"
        print("PASS: Phase 2 approval without comment works (optional)")
    
    # ============ TEST: Phase 3 Approval with Comments ============
    def test_phase3_approval_with_comments(self, student_token, supervisor_token, incharge_token):
        """Test Phase 3 approve with comment saves phase3_supervisor_notes / phase3_incharge_notes"""
        # Create and get to Phase 2 approved
        procedure_id = self.create_procedure(student_token, "TEST_P3_COMMENTS")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        # Submit Phase 2
        headers_student = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "anesthesia_adequate": "Yes",
            "torque_values": [35.0],
            "bone_graft_used": False,
            "healing_abutment_cuff_height": ["3.0"]
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        
        # Approve Phase 2
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit Phase 3
        phase3_data = {
            "checklist_items": {"tissue_health_verified": True, "implant_stability_checked": True},
            "isq_value": "75",
            "healing_abutment_height": "4.0"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        assert response.status_code == 200, f"Submit Phase 3 failed: {response.text}"
        
        # Supervisor approves Phase 3 with comment
        sup_comment = "Supervisor Phase 3 comment: Excellent healing"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve",
            json={"action": "approve", "comment": sup_comment},
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 3 approve failed: {response.text}"
        
        # Verify supervisor comment
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase3_supervisor_notes") == sup_comment, f"phase3_supervisor_notes mismatch: {procedure.get('phase3_supervisor_notes')}"
        print("PASS: Supervisor Phase 3 comment saved correctly")
        
        # Incharge approves Phase 3 with comment
        inc_comment = "InCharge Phase 3 comment: Ready for prosthetic phase"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve",
            json={"action": "approve", "comment": inc_comment},
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 3 approve failed: {response.text}"
        
        # Verify incharge comment and status
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase3_incharge_notes") == inc_comment, f"phase3_incharge_notes mismatch: {procedure.get('phase3_incharge_notes')}"
        assert procedure["status"] == "stage2_surgical_approved", f"Expected stage2_surgical_approved, got {procedure['status']}"
        print("PASS: InCharge Phase 3 comment saved correctly")
        
        return procedure_id
    
    # ============ TEST: Phase 4 Step 1 Approval with Comments ============
    def test_phase4_step1_approval_with_comments(self, student_token, supervisor_token, incharge_token):
        """Test Phase 4 Step 1 approve with comment saves phase4_step1_supervisor_notes / phase4_step1_incharge_notes"""
        # Create and get to Phase 3 approved
        procedure_id = self.create_procedure(student_token, "TEST_P4S1_COMMENTS")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        
        # Submit and approve Phase 2
        phase2_data = {"anesthesia_adequate": "Yes", "torque_values": [35.0], "bone_graft_used": False, "healing_abutment_cuff_height": ["3.0"]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit and approve Phase 3
        phase3_data = {"checklist_items": {"tissue_health_verified": True}, "isq_value": "75", "healing_abutment_height": "4.0"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit Phase 4 Step 1
        phase4_step1_data = {
            "final_prosthetic_plan": "Single Crown",
            "prosthetic_material": "Zirconia",
            "impression_type": "intraoral_scans",
            "checklist": {
                "items": [
                    {"label": "Impression taken", "value": True},
                    {"label": "Shade selected", "value": True}
                ]
            }
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_step1_data, headers=headers_student)
        assert response.status_code == 200, f"Submit Phase 4 Step 1 failed: {response.text}"
        
        # Supervisor approves Phase 4 Step 1 with comment
        sup_comment = "Supervisor Phase 4 Step 1 comment: Impression quality excellent"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve",
            json={"action": "approve", "comment": sup_comment},
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 4 Step 1 approve failed: {response.text}"
        
        # Verify supervisor comment
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase4_step1_supervisor_notes") == sup_comment, f"phase4_step1_supervisor_notes mismatch: {procedure.get('phase4_step1_supervisor_notes')}"
        print("PASS: Supervisor Phase 4 Step 1 comment saved correctly")
        
        # Incharge approves Phase 4 Step 1 with comment
        inc_comment = "InCharge Phase 4 Step 1 comment: Proceed to trial"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve",
            json={"action": "approve", "comment": inc_comment},
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 4 Step 1 approve failed: {response.text}"
        
        # Verify incharge comment and status
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase4_step1_incharge_notes") == inc_comment, f"phase4_step1_incharge_notes mismatch: {procedure.get('phase4_step1_incharge_notes')}"
        assert procedure["status"] == "stage2_prosthetic_step1_approved", f"Expected stage2_prosthetic_step1_approved, got {procedure['status']}"
        print("PASS: InCharge Phase 4 Step 1 comment saved correctly")
        
        return procedure_id
    
    # ============ TEST: Phase 4 Step 2 Approval with Comments ============
    def test_phase4_step2_approval_with_comments(self, student_token, supervisor_token, incharge_token):
        """Test Phase 4 Step 2 approve with comment saves phase4_step2_supervisor_notes / phase4_step2_incharge_notes"""
        # Create and get to Phase 4 Step 1 approved
        procedure_id = self.create_procedure(student_token, "TEST_P4S2_COMMENTS")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        
        # Submit and approve Phase 2
        phase2_data = {"anesthesia_adequate": "Yes", "torque_values": [35.0], "bone_graft_used": False, "healing_abutment_cuff_height": ["3.0"]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit and approve Phase 3
        phase3_data = {"checklist_items": {"tissue_health_verified": True}, "isq_value": "75", "healing_abutment_height": "4.0"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit and approve Phase 4 Step 1
        phase4_step1_data = {
            "final_prosthetic_plan": "Single Crown",
            "prosthetic_material": "Zirconia",
            "impression_type": "intraoral_scans",
            "checklist": {"items": [{"label": "Impression taken", "value": True}]}
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_step1_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve"}, headers=headers_inc)
        
        # Submit Phase 4 Step 2
        phase4_step2_data = {
            "trial_completed": True,
            "occlusion_verified": True,
            "prosthesis_delivered": True,
            "patient_instructions_given": True
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2", json=phase4_step2_data, headers=headers_student)
        assert response.status_code == 200, f"Submit Phase 4 Step 2 failed: {response.text}"
        
        # Supervisor approves Phase 4 Step 2 with comment
        sup_comment = "Supervisor Phase 4 Step 2 comment: Final delivery successful"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve",
            json={"action": "approve", "comment": sup_comment},
            headers=headers_sup
        )
        assert response.status_code == 200, f"Supervisor Phase 4 Step 2 approve failed: {response.text}"
        
        # Verify supervisor comment
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase4_step2_supervisor_notes") == sup_comment, f"phase4_step2_supervisor_notes mismatch: {procedure.get('phase4_step2_supervisor_notes')}"
        print("PASS: Supervisor Phase 4 Step 2 comment saved correctly")
        
        # Incharge approves Phase 4 Step 2 with comment
        inc_comment = "InCharge Phase 4 Step 2 comment: Case completed successfully"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve",
            json={"action": "approve", "comment": inc_comment},
            headers=headers_inc
        )
        assert response.status_code == 200, f"Incharge Phase 4 Step 2 approve failed: {response.text}"
        
        # Verify incharge comment and status
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure.get("phase4_step2_incharge_notes") == inc_comment, f"phase4_step2_incharge_notes mismatch: {procedure.get('phase4_step2_incharge_notes')}"
        assert procedure["status"] == "completed", f"Expected completed, got {procedure['status']}"
        print("PASS: InCharge Phase 4 Step 2 comment saved correctly")
        print("PASS: Case completed successfully with all approval comments")
        
        return procedure_id
    
    # ============ TEST: PDF Export with Bone Graft and Notes ============
    def test_pdf_export_includes_bone_graft_and_notes(self, student_token, supervisor_token, incharge_token):
        """Test PDF export includes bone graft data and supervisor/incharge notes"""
        # Create a complete case with bone graft and all comments
        procedure_id = self.create_procedure(student_token, "TEST_PDF_EXPORT")
        self.save_implant_plan(student_token, procedure_id)
        self.request_phase1_approval(student_token, procedure_id)
        self.approve_phase1(supervisor_token, procedure_id)
        self.approve_phase1(incharge_token, procedure_id)
        
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_sup = {"Authorization": f"Bearer {supervisor_token}"}
        headers_inc = {"Authorization": f"Bearer {incharge_token}"}
        
        # Submit Phase 2 with bone graft
        phase2_data = {
            "anesthesia_adequate": "Yes",
            "torque_values": [35.0],
            "bone_graft_used": True,
            "bone_graft_details": "PDF Test: Bio-Oss with membrane",
            "healing_abutment_cuff_height": ["3.0"]
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=headers_student)
        
        # Approve Phase 2 with comments
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve", "comment": "PDF Test: Supervisor P2 note"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve", "comment": "PDF Test: InCharge P2 note"}, headers=headers_inc)
        
        # Submit and approve Phase 3 with comments
        phase3_data = {"checklist_items": {"tissue_health_verified": True}, "isq_value": "75", "healing_abutment_height": "4.0"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical", json=phase3_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve", "comment": "PDF Test: Supervisor P3 note"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve", json={"action": "approve", "comment": "PDF Test: InCharge P3 note"}, headers=headers_inc)
        
        # Submit and approve Phase 4 Step 1 with comments
        phase4_step1_data = {"final_prosthetic_plan": "Single Crown", "prosthetic_material": "Zirconia", "impression_type": "intraoral_scans", "checklist": {"items": [{"label": "Impression taken", "value": True}]}}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic", json=phase4_step1_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve", "comment": "PDF Test: Supervisor P4S1 note"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve", json={"action": "approve", "comment": "PDF Test: InCharge P4S1 note"}, headers=headers_inc)
        
        # Submit and approve Phase 4 Step 2 with comments
        phase4_step2_data = {"trial_completed": True, "occlusion_verified": True, "prosthesis_delivered": True}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2", json=phase4_step2_data, headers=headers_student)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json={"action": "approve", "comment": "PDF Test: Supervisor P4S2 note"}, headers=headers_sup)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/step2/approve", json={"action": "approve", "comment": "PDF Test: InCharge P4S2 note"}, headers=headers_inc)
        
        # Verify all notes are saved
        procedure = self.get_procedure(student_token, procedure_id)
        assert procedure["status"] == "completed", f"Expected completed, got {procedure['status']}"
        
        # Verify bone graft data
        phase2_saved = procedure.get("phase2_data", {})
        assert phase2_saved.get("bone_graft_used") == True
        assert phase2_saved.get("bone_graft_details") == "PDF Test: Bio-Oss with membrane"
        
        # Verify all approval notes
        assert procedure.get("phase2_supervisor_notes") == "PDF Test: Supervisor P2 note"
        assert procedure.get("phase2_incharge_notes") == "PDF Test: InCharge P2 note"
        assert procedure.get("phase3_supervisor_notes") == "PDF Test: Supervisor P3 note"
        assert procedure.get("phase3_incharge_notes") == "PDF Test: InCharge P3 note"
        assert procedure.get("phase4_step1_supervisor_notes") == "PDF Test: Supervisor P4S1 note"
        assert procedure.get("phase4_step1_incharge_notes") == "PDF Test: InCharge P4S1 note"
        assert procedure.get("phase4_step2_supervisor_notes") == "PDF Test: Supervisor P4S2 note"
        assert procedure.get("phase4_step2_incharge_notes") == "PDF Test: InCharge P4S2 note"
        
        # Generate PDF
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/case-report", headers=headers_student)
        assert response.status_code == 200, f"PDF generation failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", f"Expected PDF content type, got {response.headers.get('content-type')}"
        assert len(response.content) > 1000, "PDF content seems too small"
        
        print("PASS: PDF export generated successfully")
        print("PASS: All bone graft data and approval notes verified in procedure document")


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """Test health endpoint is working"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print("PASS: Health endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
