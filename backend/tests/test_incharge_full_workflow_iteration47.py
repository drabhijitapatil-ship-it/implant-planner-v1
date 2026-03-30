"""
Iteration 47: In-Charge FULL Workflow Backend Tests (Phase 1 → Phase 4 Complete)

Tests the COMPLETE In-Charge self-approval workflow through ALL phases:
1. In-Charge creates procedure → status='draft'
2. In-Charge requests Phase 1 approval → status='pending_phase1'
3. In-Charge self-approves Phase 1 → status='phase1_approved'
4. In-Charge submits Phase 2 → status='pending_phase2'
5. In-Charge self-approves Phase 2 → status='phase2_approved'
6. In-Charge submits Phase 3 (Second Stage Surgical) → status='pending_stage2_surgical'
7. In-Charge self-approves Phase 3 → status='stage2_surgical_approved'
8. In-Charge submits Phase 4 Step 1 (Prosthetic) → status='pending_stage2_prosthetic'
9. In-Charge self-approves Phase 4 Step 1 → status='stage2_prosthetic_step1_approved'
10. In-Charge submits Phase 4 Step 2 (Trial & Delivery) → status='pending_final_delivery'
11. In-Charge self-approves Phase 4 Step 2 → status='completed'
12. Supervisor listing excludes in-charge-created cases
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials
INCHARGE_EMAIL = "Abhijit.patil"
INCHARGE_PASSWORD = "Admin@123"
SUPERVISOR_EMAIL = "Paresh.gandhi"
SUPERVISOR_PASSWORD = "Supervisor@123"

# Global state to store tokens and IDs
_tokens = {}
_procedure_id = None


def get_token(email, password, role_name):
    """Get token with caching to avoid rate limits"""
    global _tokens
    if email in _tokens:
        return _tokens[email]
    
    time.sleep(1)  # Avoid rate limits
    
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    
    if response.status_code == 429:
        time.sleep(12)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
    
    assert response.status_code == 200, f"{role_name} login failed: {response.text}"
    data = response.json()
    _tokens[email] = {
        "token": data["token"],
        "user_id": data["user"]["id"],
        "role": data["user"]["role"]
    }
    return _tokens[email]


def get_incharge_headers():
    token_data = get_token(INCHARGE_EMAIL, INCHARGE_PASSWORD, "In-Charge")
    return {"Authorization": f"Bearer {token_data['token']}", "Content-Type": "application/json"}


def get_supervisor_headers():
    token_data = get_token(SUPERVISOR_EMAIL, SUPERVISOR_PASSWORD, "Supervisor")
    return {"Authorization": f"Bearer {token_data['token']}", "Content-Type": "application/json"}


def get_incharge_user_id():
    token_data = get_token(INCHARGE_EMAIL, INCHARGE_PASSWORD, "In-Charge")
    return token_data["user_id"]


def get_supervisor_user_id():
    token_data = get_token(SUPERVISOR_EMAIL, SUPERVISOR_PASSWORD, "Supervisor")
    return token_data["user_id"]


class TestInChargeFullWorkflow:
    """Test the COMPLETE In-Charge self-approval workflow through ALL phases (1-4)"""
    
    # ==================== PHASE 1 ====================
    
    def test_01_incharge_login_success(self):
        """Test 1: Verify In-Charge can login successfully"""
        token_data = get_token(INCHARGE_EMAIL, INCHARGE_PASSWORD, "In-Charge")
        assert token_data["token"]
        assert token_data["role"] in ["implant_incharge", "administrator"]
        print(f"PASS: In-Charge login successful, user_id={token_data['user_id']}, role={token_data['role']}")
    
    def test_02_supervisor_login_success(self):
        """Test 2: Verify Supervisor can login successfully"""
        token_data = get_token(SUPERVISOR_EMAIL, SUPERVISOR_PASSWORD, "Supervisor")
        assert token_data["token"]
        assert token_data["role"] == "supervisor"
        print(f"PASS: Supervisor login successful, user_id={token_data['user_id']}")
    
    def test_03_incharge_create_procedure(self):
        """Test 3: In-Charge creates procedure → status='draft'"""
        global _procedure_id
        
        future_date = datetime.now() + timedelta(days=3)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_FullWorkflow_Phase1to4_Patient",
            "registration_number": "TEST-FW-001",
            "supervisor_id": get_supervisor_user_id(),
            "supervisor_name": "Paresh Gandhi",
            "implant_incharge_id": get_incharge_user_id(),
            "implant_incharge_name": "Abhijit Patil",
            "receipt_number": "TEST-REC-FW-001",
            "amount_paid": 5000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Procedure creation failed: {response.text}"
        data = response.json()
        
        _procedure_id = data.get("id") or data.get("_id")
        assert _procedure_id, "No procedure ID returned"
        
        assert data.get("created_by_role") == "implant_incharge", f"Expected created_by_role='implant_incharge', got '{data.get('created_by_role')}'"
        assert data.get("created_by_id") == get_incharge_user_id()
        assert data.get("status") == "draft", f"Expected status='draft', got '{data.get('status')}'"
        
        print(f"PASS: In-Charge created procedure {_procedure_id}, status='draft'")
    
    def test_04_add_implant_plan(self):
        """Test 4: Add implant plan (required before Phase 1 approval)"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        implant_plan_data = {
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
                    "risk_level": "Low"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/implant-plan",
            json=implant_plan_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Implant plan save failed: {response.text}"
        print(f"PASS: Implant plan added to procedure {_procedure_id}")
    
    def test_05_incharge_request_phase1_approval(self):
        """Test 5: In-Charge requests Phase 1 approval → status='pending_phase1'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/request-phase1-approval",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Request Phase 1 approval failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_phase1", f"Expected status='pending_phase1', got '{data.get('status')}'"
        print(f"PASS: Phase 1 approval requested, status='pending_phase1'")
    
    def test_06_incharge_self_approve_phase1(self):
        """Test 6: In-Charge self-approves Phase 1 → status='phase1_approved'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 1 self-approval failed: {response.text}"
        data = response.json()
        
        assert data.get("supervisor_phase1_approved") == True, f"Expected supervisor_phase1_approved=True"
        assert data.get("implant_incharge_phase1_approved") == True, f"Expected implant_incharge_phase1_approved=True"
        assert data.get("status") == "phase1_approved", f"Expected status='phase1_approved', got '{data.get('status')}'"
        
        print(f"PASS: Phase 1 self-approved, status='phase1_approved'")
    
    # ==================== PHASE 2 ====================
    
    def test_07_incharge_submit_phase2(self):
        """Test 7: In-Charge submits Phase 2 → status='pending_phase2'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        phase2_data = {
            "pre_surgery_checklist": {
                "patient_consent": True,
                "medical_clearance": True,
                "cbct_reviewed": True,
                "surgical_guide_ready": True,
                "implant_kit_available": True,
                "asepsis_protocol": True,
                "patient_preparation": True
            },
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness mucoperiosteal flap",
            "drilling_type": "Sequential drilling protocol",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "prosthetic_component": "Healing abutment",
            "healing_abutment_cuff_height": "3.5",
            "sutures_placed": True,
            "hemostasis_achieved": True,
            "post_op_checklist": {
                "post_op_instructions": True,
                "prescription_given": True,
                "follow_up_scheduled": True
            },
            "student_notes": "TEST: Phase 2 submitted by In-Charge"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/submit-phase2",
            json=phase2_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 2 submission failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_phase2", f"Expected status='pending_phase2', got '{data.get('status')}'"
        print(f"PASS: Phase 2 submitted, status='pending_phase2'")
    
    def test_08_incharge_self_approve_phase2(self):
        """Test 8: In-Charge self-approves Phase 2 → status='phase2_approved'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 2 self-approval failed: {response.text}"
        data = response.json()
        
        assert data.get("supervisor_phase2_approved") == True
        assert data.get("implant_incharge_phase2_approved") == True
        assert data.get("status") == "phase2_approved", f"Expected status='phase2_approved', got '{data.get('status')}'"
        
        print(f"PASS: Phase 2 self-approved, status='phase2_approved'")
    
    # ==================== PHASE 3 (Second Stage Surgical) ====================
    
    def test_09_incharge_submit_phase3(self):
        """Test 9: In-Charge submits Phase 3 (Second Stage Surgical) → status='pending_stage2_surgical'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        phase3_data = {
            "checklist_items": {
                "soft_tissue_healed": True,
                "implant_stable": True,
                "no_infection": True,
                "radiograph_reviewed": True,
                "isq_measured": True
            },
            "isq_value": "75",
            "healing_abutment_height": "4.0",
            "student_notes": "TEST: Phase 3 submitted by In-Charge for full workflow test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/surgical",
            json=phase3_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 3 submission failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_stage2_surgical", f"Expected status='pending_stage2_surgical', got '{data.get('status')}'"
        print(f"PASS: Phase 3 submitted, status='pending_stage2_surgical'")
    
    def test_10_incharge_self_approve_phase3(self):
        """Test 10: In-Charge self-approves Phase 3 → status='stage2_surgical_approved'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/surgical/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 3 self-approval failed: {response.text}"
        data = response.json()
        
        assert data.get("supervisor_stage2_surgical_approved") == True, f"Expected supervisor_stage2_surgical_approved=True"
        assert data.get("implant_incharge_stage2_surgical_approved") == True, f"Expected implant_incharge_stage2_surgical_approved=True"
        assert data.get("status") == "stage2_surgical_approved", f"Expected status='stage2_surgical_approved', got '{data.get('status')}'"
        
        print(f"PASS: Phase 3 self-approved, status='stage2_surgical_approved'")
    
    def test_11_verify_phase3_approved_status(self):
        """Test 11: Verify status is 'stage2_surgical_approved' after Phase 3 self-approval"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{_procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "stage2_surgical_approved", f"Expected status='stage2_surgical_approved', got '{data.get('status')}'"
        print(f"PASS: Verified status='stage2_surgical_approved'")
    
    # ==================== PHASE 4 STEP 1 (Prosthetic) ====================
    
    def test_12_incharge_submit_phase4_step1(self):
        """Test 12: In-Charge submits Phase 4 Step 1 (Prosthetic) → status='pending_stage2_prosthetic'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        phase4_step1_data = {
            "final_prosthetic_plan": "Cement Retained Crown - Zirconia",
            "prosthetic_material": "Zirconia",
            "impression_type": "intraoral_scans",
            "payment_complete": True,
            "components_available": True,
            "student_notes": "TEST: Phase 4 Step 1 submitted by In-Charge"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/prosthetic",
            json=phase4_step1_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 4 Step 1 submission failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_stage2_prosthetic", f"Expected status='pending_stage2_prosthetic', got '{data.get('status')}'"
        print(f"PASS: Phase 4 Step 1 submitted, status='pending_stage2_prosthetic'")
    
    def test_13_incharge_self_approve_phase4_step1(self):
        """Test 13: In-Charge self-approves Phase 4 Step 1 → status='stage2_prosthetic_step1_approved'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/prosthetic/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 4 Step 1 self-approval failed: {response.text}"
        data = response.json()
        
        assert data.get("supervisor_stage2_prosthetic_approved") == True, f"Expected supervisor_stage2_prosthetic_approved=True"
        assert data.get("implant_incharge_stage2_prosthetic_approved") == True, f"Expected implant_incharge_stage2_prosthetic_approved=True"
        assert data.get("status") == "stage2_prosthetic_step1_approved", f"Expected status='stage2_prosthetic_step1_approved', got '{data.get('status')}'"
        
        print(f"PASS: Phase 4 Step 1 self-approved, status='stage2_prosthetic_step1_approved'")
    
    def test_14_verify_phase4_step1_approved_status(self):
        """Test 14: Verify status is 'stage2_prosthetic_step1_approved' after Phase 4 Step 1 self-approval"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{_procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "stage2_prosthetic_step1_approved", f"Expected status='stage2_prosthetic_step1_approved', got '{data.get('status')}'"
        print(f"PASS: Verified status='stage2_prosthetic_step1_approved'")
    
    # ==================== PHASE 4 STEP 2 (Trial & Delivery) ====================
    
    def test_15_incharge_submit_phase4_step2(self):
        """Test 15: In-Charge submits Phase 4 Step 2 (Trial & Delivery) → status='pending_final_delivery'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        phase4_step2_data = {
            "trial_checklist": {
                "framework_fit_verified": True,
                "occlusion_checked": True,
                "aesthetics_approved": True,
                "patient_satisfied": True,
                "final_torque_applied": True
            },
            "confirmation_statement": True,
            "student_notes": "TEST: Phase 4 Step 2 submitted by In-Charge"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/prosthetic/step2",
            json=phase4_step2_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 4 Step 2 submission failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_final_delivery", f"Expected status='pending_final_delivery', got '{data.get('status')}'"
        print(f"PASS: Phase 4 Step 2 submitted, status='pending_final_delivery'")
    
    def test_16_incharge_self_approve_phase4_step2(self):
        """Test 16: In-Charge self-approves Phase 4 Step 2 → status='completed'"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/stage2/prosthetic/step2/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 4 Step 2 self-approval failed: {response.text}"
        data = response.json()
        
        assert data.get("supervisor_final_delivery_approved") == True, f"Expected supervisor_final_delivery_approved=True"
        assert data.get("implant_incharge_final_delivery_approved") == True, f"Expected implant_incharge_final_delivery_approved=True"
        assert data.get("status") == "completed", f"Expected status='completed', got '{data.get('status')}'"
        
        print(f"PASS: Phase 4 Step 2 self-approved, status='completed' - FULL WORKFLOW COMPLETE!")
    
    def test_17_verify_completed_status(self):
        """Test 17: Verify final status is 'completed' after full workflow"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{_procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "completed", f"Expected status='completed', got '{data.get('status')}'"
        
        # Verify all approval flags are True
        assert data.get("supervisor_phase1_approved") == True
        assert data.get("implant_incharge_phase1_approved") == True
        assert data.get("supervisor_phase2_approved") == True
        assert data.get("implant_incharge_phase2_approved") == True
        assert data.get("supervisor_stage2_surgical_approved") == True
        assert data.get("implant_incharge_stage2_surgical_approved") == True
        assert data.get("supervisor_stage2_prosthetic_approved") == True
        assert data.get("implant_incharge_stage2_prosthetic_approved") == True
        assert data.get("supervisor_final_delivery_approved") == True
        assert data.get("implant_incharge_final_delivery_approved") == True
        
        print(f"PASS: Verified status='completed' with ALL approval flags True")


class TestSupervisorListingExclusion:
    """Test that supervisor listing excludes in-charge-created cases"""
    
    def test_18_supervisor_listing_excludes_incharge_cases(self):
        """Test 18: Supervisor listing should NOT include in-charge-created cases"""
        global _procedure_id
        
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers=get_supervisor_headers()
        )
        
        assert response.status_code == 200, f"Get procedures failed: {response.text}"
        procedures = response.json()
        
        # Check that the in-charge-created procedure is NOT in the supervisor's list
        if _procedure_id:
            procedure_ids = [p.get("id") or p.get("_id") for p in procedures]
            assert _procedure_id not in procedure_ids, \
                f"In-charge-created procedure {_procedure_id} should NOT appear in supervisor's listing"
        
        # Verify no procedures with created_by_role='implant_incharge' appear
        incharge_created = [p for p in procedures if p.get("created_by_role") == "implant_incharge"]
        assert len(incharge_created) == 0, \
            f"Supervisor listing should not contain any implant_incharge-created cases, found {len(incharge_created)}"
        
        print(f"PASS: Supervisor listing correctly excludes in-charge-created cases")


class TestCleanup:
    """Cleanup test data"""
    
    def test_99_cleanup_test_procedures(self):
        """Test 99: Cleanup TEST_ prefixed procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers=get_incharge_headers()
        )
        
        if response.status_code == 200:
            procedures = response.json()
            test_procedures = [p for p in procedures if p.get("patient_name", "").startswith("TEST_")]
            
            deleted_count = 0
            for proc in test_procedures:
                proc_id = proc.get("id") or proc.get("_id")
                delete_response = requests.delete(
                    f"{BASE_URL}/api/procedures/{proc_id}",
                    headers=get_incharge_headers()
                )
                if delete_response.status_code == 200:
                    deleted_count += 1
            
            print(f"PASS: Cleaned up {deleted_count} test procedures")
        else:
            print("SKIP: Could not fetch procedures for cleanup")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
