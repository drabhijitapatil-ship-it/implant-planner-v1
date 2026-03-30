"""
Iteration 46: In-Charge Self-Approval Workflow Backend Tests

Tests the NEW In-Charge self-approval workflow:
1. In-Charge (Abhijit.patil) can create a procedure via POST /api/procedures
2. In-Charge can request Phase 1 approval via POST /api/procedures/{id}/request-phase1-approval
3. In-Charge can self-approve Phase 1 via POST /api/procedures/{id}/approve (auto-approves both roles)
4. After Phase 1 self-approval, status should be 'phase1_approved'
5. In-Charge can submit Phase 2 via POST /api/procedures/{id}/submit-phase2
6. In-Charge can self-approve Phase 2 (status becomes 'phase2_approved')
7. Supervisor (Paresh.gandhi) listing via GET /api/procedures should NOT include in-charge-created cases
8. In-Charge listing via GET /api/procedures should include all cases including self-created ones
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

# Global state to store tokens and IDs (avoid repeated logins)
_tokens = {}
_procedure_id = None


def get_token(email, password, role_name):
    """Get token with caching to avoid rate limits"""
    global _tokens
    if email in _tokens:
        return _tokens[email]
    
    # Wait a bit to avoid rate limits
    time.sleep(1)
    
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": email,
        "password": password
    })
    
    if response.status_code == 429:
        # Rate limited, wait and retry
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


class TestInChargeSelfApprovalWorkflow:
    """Test the complete In-Charge self-approval workflow"""
    
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
        """Test 3: In-Charge can create a procedure via POST /api/procedures"""
        global _procedure_id
        
        # Get a future date that's not Sunday
        future_date = datetime.now() + timedelta(days=3)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_InCharge_SelfApproval_Patient",
            "registration_number": "TEST-IC-SA-001",
            "supervisor_id": get_supervisor_user_id(),
            "supervisor_name": "Paresh Gandhi",
            "implant_incharge_id": get_incharge_user_id(),
            "implant_incharge_name": "Abhijit Patil",
            "receipt_number": "TEST-REC-001",
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
        
        # Verify procedure was created with correct fields
        assert "id" in data or "_id" in data
        _procedure_id = data.get("id") or data.get("_id")
        
        assert data.get("created_by_role") == "implant_incharge", f"Expected created_by_role='implant_incharge', got '{data.get('created_by_role')}'"
        assert data.get("created_by_id") == get_incharge_user_id(), f"Expected created_by_id='{get_incharge_user_id()}', got '{data.get('created_by_id')}'"
        assert data.get("status") == "draft", f"Expected status='draft', got '{data.get('status')}'"
        
        print(f"PASS: In-Charge created procedure {_procedure_id} with created_by_role='implant_incharge'")
    
    def test_04_add_implant_plan(self):
        """Test 4: Add implant plan to the procedure (required before Phase 1 approval)"""
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
        """Test 5: In-Charge can request Phase 1 approval via POST /api/procedures/{id}/request-phase1-approval"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/request-phase1-approval",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Request Phase 1 approval failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_phase1", f"Expected status='pending_phase1', got '{data.get('status')}'"
        print(f"PASS: In-Charge requested Phase 1 approval, status is now 'pending_phase1'")
    
    def test_06_incharge_self_approve_phase1(self):
        """Test 6: In-Charge can self-approve Phase 1 via POST /api/procedures/{id}/approve (auto-approves both roles)"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 1 self-approval failed: {response.text}"
        data = response.json()
        
        # Verify both roles are auto-approved
        assert data.get("supervisor_phase1_approved") == True, f"Expected supervisor_phase1_approved=True, got {data.get('supervisor_phase1_approved')}"
        assert data.get("implant_incharge_phase1_approved") == True, f"Expected implant_incharge_phase1_approved=True, got {data.get('implant_incharge_phase1_approved')}"
        assert data.get("status") == "phase1_approved", f"Expected status='phase1_approved', got '{data.get('status')}'"
        
        print(f"PASS: In-Charge self-approved Phase 1, both roles auto-approved, status='phase1_approved'")
    
    def test_07_verify_phase1_approved_status(self):
        """Test 7: Verify status is 'phase1_approved' after self-approval"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{_procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "phase1_approved", f"Expected status='phase1_approved', got '{data.get('status')}'"
        assert data.get("supervisor_phase1_approved") == True
        assert data.get("implant_incharge_phase1_approved") == True
        
        print(f"PASS: Verified procedure status is 'phase1_approved' with both approvals")
    
    def test_08_incharge_submit_phase2(self):
        """Test 8: In-Charge can submit Phase 2 via POST /api/procedures/{id}/submit-phase2"""
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
            "student_notes": "TEST: Phase 2 submitted by In-Charge for self-approval workflow test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/submit-phase2",
            json=phase2_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 2 submission failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "pending_phase2", f"Expected status='pending_phase2', got '{data.get('status')}'"
        print(f"PASS: In-Charge submitted Phase 2, status is now 'pending_phase2'")
    
    def test_09_incharge_self_approve_phase2(self):
        """Test 9: In-Charge can self-approve Phase 2 (status becomes 'phase2_approved')"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{_procedure_id}/approve",
            json={"action": "approve"},
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Phase 2 self-approval failed: {response.text}"
        data = response.json()
        
        # Verify both roles are auto-approved for Phase 2
        assert data.get("supervisor_phase2_approved") == True, f"Expected supervisor_phase2_approved=True, got {data.get('supervisor_phase2_approved')}"
        assert data.get("implant_incharge_phase2_approved") == True, f"Expected implant_incharge_phase2_approved=True, got {data.get('implant_incharge_phase2_approved')}"
        assert data.get("status") == "phase2_approved", f"Expected status='phase2_approved', got '{data.get('status')}'"
        
        print(f"PASS: In-Charge self-approved Phase 2, both roles auto-approved, status='phase2_approved'")
    
    def test_10_verify_phase2_approved_status(self):
        """Test 10: Verify status is 'phase2_approved' after Phase 2 self-approval"""
        global _procedure_id
        assert _procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{_procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        assert data.get("status") == "phase2_approved", f"Expected status='phase2_approved', got '{data.get('status')}'"
        assert data.get("supervisor_phase2_approved") == True
        assert data.get("implant_incharge_phase2_approved") == True
        
        print(f"PASS: Verified procedure status is 'phase2_approved' with both Phase 2 approvals")


class TestSupervisorListingExclusion:
    """Test that supervisor listing excludes in-charge-created cases"""
    
    _listing_procedure_id = None
    
    def test_11_create_incharge_procedure_for_listing_test(self):
        """Test 11: Create a new in-charge procedure for listing exclusion test"""
        future_date = datetime.now() + timedelta(days=5)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_Listing_Exclusion_Patient",
            "registration_number": "TEST-LE-001",
            "supervisor_id": get_supervisor_user_id(),
            "supervisor_name": "Paresh Gandhi",
            "implant_incharge_id": get_incharge_user_id(),
            "implant_incharge_name": "Abhijit Patil",
            "receipt_number": "TEST-REC-LE-001",
            "amount_paid": 5000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Procedure creation failed: {response.text}"
        data = response.json()
        TestSupervisorListingExclusion._listing_procedure_id = data.get("id") or data.get("_id")
        
        assert data.get("created_by_role") == "implant_incharge"
        print(f"PASS: Created in-charge procedure {self._listing_procedure_id} for listing test")
    
    def test_12_supervisor_listing_excludes_incharge_cases(self):
        """Test 12: Supervisor listing via GET /api/procedures should NOT include in-charge-created cases"""
        assert self._listing_procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers=get_supervisor_headers()
        )
        
        assert response.status_code == 200, f"Get procedures failed: {response.text}"
        procedures = response.json()
        
        # Check that the in-charge-created procedure is NOT in the supervisor's list
        procedure_ids = [p.get("id") or p.get("_id") for p in procedures]
        
        assert self._listing_procedure_id not in procedure_ids, \
            f"In-charge-created procedure {self._listing_procedure_id} should NOT appear in supervisor's listing"
        
        # Also verify no procedures with created_by_role='implant_incharge' appear
        incharge_created = [p for p in procedures if p.get("created_by_role") == "implant_incharge"]
        assert len(incharge_created) == 0, \
            f"Supervisor listing should not contain any implant_incharge-created cases, found {len(incharge_created)}"
        
        print(f"PASS: Supervisor listing correctly excludes in-charge-created cases (checked {len(procedures)} procedures)")
    
    def test_13_incharge_listing_includes_all_cases(self):
        """Test 13: In-Charge listing via GET /api/procedures should include all cases including self-created ones"""
        assert self._listing_procedure_id, "No procedure ID from previous test"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"Get procedures failed: {response.text}"
        procedures = response.json()
        
        # Check that the in-charge-created procedure IS in the in-charge's list
        procedure_ids = [p.get("id") or p.get("_id") for p in procedures]
        
        assert self._listing_procedure_id in procedure_ids, \
            f"In-charge-created procedure {self._listing_procedure_id} should appear in in-charge's listing"
        
        # Verify in-charge can see their own created cases
        incharge_created = [p for p in procedures if p.get("created_by_role") == "implant_incharge"]
        assert len(incharge_created) > 0, \
            f"In-charge listing should contain implant_incharge-created cases"
        
        print(f"PASS: In-Charge listing includes all cases including self-created ones ({len(incharge_created)} in-charge-created cases found)")


class TestInChargeAccessControl:
    """Test access control for in-charge created procedures"""
    
    def test_14_incharge_can_view_own_created_procedure(self):
        """Test 14: In-Charge can view their own created procedure"""
        # First create a procedure
        future_date = datetime.now() + timedelta(days=7)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_Access_Control_Patient",
            "registration_number": "TEST-AC-001",
            "supervisor_id": get_supervisor_user_id(),
            "supervisor_name": "Paresh Gandhi",
            "implant_incharge_id": get_incharge_user_id(),
            "implant_incharge_name": "Abhijit Patil",
            "receipt_number": "TEST-REC-AC-001",
            "amount_paid": 5000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"]
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=get_incharge_headers()
        )
        assert create_response.status_code == 200
        procedure_id = create_response.json().get("id") or create_response.json().get("_id")
        
        # Now verify in-charge can view it
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200, f"In-Charge should be able to view own created procedure: {response.text}"
        data = response.json()
        assert data.get("created_by_role") == "implant_incharge"
        
        print(f"PASS: In-Charge can view their own created procedure {procedure_id}")
    
    def test_15_verify_created_by_fields_populated(self):
        """Test 15: Verify created_by_role, created_by_id, created_by_name are populated correctly"""
        future_date = datetime.now() + timedelta(days=8)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_CreatedBy_Fields_Patient",
            "registration_number": "TEST-CBF-001",
            "supervisor_id": get_supervisor_user_id(),
            "supervisor_name": "Paresh Gandhi",
            "implant_incharge_id": get_incharge_user_id(),
            "implant_incharge_name": "Abhijit Patil",
            "receipt_number": "TEST-REC-CBF-001",
            "amount_paid": 5000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=get_incharge_headers()
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("created_by_role") == "implant_incharge", f"Expected created_by_role='implant_incharge'"
        assert data.get("created_by_id") == get_incharge_user_id(), f"Expected created_by_id='{get_incharge_user_id()}'"
        assert data.get("created_by_name") is not None, "Expected created_by_name to be populated"
        
        print(f"PASS: created_by fields correctly populated: role={data.get('created_by_role')}, id={data.get('created_by_id')}, name={data.get('created_by_name')}")


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
