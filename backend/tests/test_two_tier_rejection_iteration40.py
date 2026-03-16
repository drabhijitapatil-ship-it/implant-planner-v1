"""
Iteration 40: Two-Tier Rejection System Testing

Tests the two-tier rejection system for Prosthodontics case management:
1. Phase 1 permanent rejection -> permanently_rejected status
2. Phase 1 reconsider rejection -> draft status, approval flags reset
3. After Phase 1 reconsider, student can resubmit (request-phase1-approval)
4. Phase 2 permanent rejection -> permanently_rejected status
5. Phase 2 reconsider rejection -> phase1_approved status
6. Notifications sent to case creator for both rejection types
7. Full flow: create -> phase1 approve -> submit phase2 -> reconsider reject -> resubmit phase2
8. permanently_rejected status prevents further actions
9. rejection_type field accepted in ApprovalAction model
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_CREDS = {"email": "Gaurav.pandey", "password": "Student@123"}
SUPERVISOR_CREDS = {"email": "Vasantha.n", "password": "Supervisor@123"}
INCHARGE_CREDS = {"email": "Abhijit.patil", "password": "Admin@123"}

STUDENT_ID = "69b79409a17f36c024eb2d65"
SUPERVISOR_ID = "69b79408a17f36c024eb2d62"
INCHARGE_ID = "69b79407a17f36c024eb2d5e"


@pytest.fixture(scope="module")
def student_token():
    """Get student auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
    assert response.status_code == 200, f"Student login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def supervisor_token():
    """Get supervisor auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
    assert response.status_code == 200, f"Supervisor login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def incharge_token():
    """Get implant incharge auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
    assert response.status_code == 200, f"Incharge login failed: {response.text}"
    return response.json()["token"]


def create_test_procedure(student_token: str, suffix: str = "") -> dict:
    """Helper to create a test procedure with future weekday date"""
    # Calculate a future weekday date (not Sunday)
    future_date = datetime.now() + timedelta(days=3)
    while future_date.weekday() == 6:  # Sunday
        future_date += timedelta(days=1)
    
    procedure_date = future_date.strftime("%Y-%m-%d")
    procedure_time = "10:00"  # Valid slot
    
    procedure_data = {
        "student_name": "TEST_TwoTierRejection" + suffix,
        "patient_name": f"TEST_Patient_{suffix}",
        "registration_number": f"TEST-REG-{suffix}",
        "supervisor_id": SUPERVISOR_ID,
        "supervisor_name": "Dr. Vasantha",
        "implant_incharge_id": INCHARGE_ID,
        "implant_incharge_name": "Dr. Abhijit",
        "receipt_number": f"REC-{suffix}",
        "amount_paid": 5000.0,
        "procedure_date": procedure_date,
        "procedure_time": procedure_time,
        "implant_procedure_type": "Single Conventional Implant",
        "loading_type": ["Delayed Loading"],
        "prosthetic_plan": "Cement Retained Crown - Zirconia"
    }
    
    headers = {"Authorization": f"Bearer {student_token}"}
    response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
    assert response.status_code == 200, f"Failed to create procedure: {response.text}"
    return response.json()


class TestPhase1PermanentRejection:
    """Test Phase 1 permanent rejection sets status to permanently_rejected"""
    
    def test_phase1_permanent_rejection(self, student_token, supervisor_token):
        """Test: Phase 1 permanent rejection sets correct status and fields"""
        # Create procedure
        procedure = create_test_procedure(student_token, "P1_PERM")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200, f"Failed to request phase1 approval: {response.text}"
        assert response.json()["status"] == "pending_phase1"
        
        # Supervisor rejects permanently
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Insufficient documentation for permanent rejection test",
            "rejection_type": "permanent"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=reject_data, headers=headers)
        assert response.status_code == 200, f"Failed to reject: {response.text}"
        
        result = response.json()
        # Verify status and rejection fields
        assert result["status"] == "permanently_rejected", f"Expected permanently_rejected, got {result['status']}"
        assert result["rejection_reason"] == "Insufficient documentation for permanent rejection test"
        assert result["rejection_type"] == "permanent"
        assert result["rejected_by"] is not None
        assert result["rejected_phase"] == "phase1"
        print(f"PASS: Phase 1 permanent rejection - status={result['status']}, rejection_type={result['rejection_type']}")


class TestPhase1ReconsiderRejection:
    """Test Phase 1 reconsider rejection resets to draft status"""
    
    def test_phase1_reconsider_rejection(self, student_token, supervisor_token):
        """Test: Phase 1 reconsider rejection sets status to draft with approval flags reset"""
        # Create procedure
        procedure = create_test_procedure(student_token, "P1_RECON")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200
        
        # Supervisor rejects with reconsideration
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Please add more implant plan details",
            "rejection_type": "reconsider"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=reject_data, headers=headers)
        assert response.status_code == 200, f"Failed to reconsider reject: {response.text}"
        
        result = response.json()
        # Verify status is back to draft
        assert result["status"] == "draft", f"Expected draft, got {result['status']}"
        assert result["rejection_reason"] == "Please add more implant plan details"
        assert result["rejection_type"] == "reconsider"
        assert result["supervisor_phase1_approved"] == False
        assert result["implant_incharge_phase1_approved"] == False
        assert result["rejected_phase"] == "phase1"
        print(f"PASS: Phase 1 reconsider rejection - status={result['status']}, flags reset correctly")


class TestPhase1ReconsiderResubmit:
    """Test that after Phase 1 reconsider, student can resubmit"""
    
    def test_phase1_reconsider_then_resubmit(self, student_token, supervisor_token):
        """Test: After Phase 1 reconsider rejection, student can request-phase1-approval again"""
        # Create procedure
        procedure = create_test_procedure(student_token, "P1_RESUB")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200
        
        # Supervisor rejects with reconsideration
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Need revisions for resubmit test",
            "rejection_type": "reconsider"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=reject_data, headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "draft"
        
        # Student can now resubmit
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200, f"Failed to resubmit after reconsider: {response.text}"
        
        result = response.json()
        assert result["status"] == "pending_phase1", f"Expected pending_phase1 after resubmit, got {result['status']}"
        print(f"PASS: After Phase 1 reconsider rejection, student resubmitted successfully - status={result['status']}")


class TestPhase2PermanentRejection:
    """Test Phase 2 permanent rejection sets status to permanently_rejected"""
    
    def test_phase2_permanent_rejection(self, student_token, supervisor_token, incharge_token):
        """Test: Phase 2 permanent rejection sets correct status and phase2_rejection fields"""
        # Create procedure and get to pending_phase2
        procedure = create_test_procedure(student_token, "P2_PERM")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        # Supervisor approves Phase 1
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                     json={"action": "approve"}, headers=headers)
        
        # Incharge approves Phase 1
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers)
        assert response.json()["status"] == "phase1_approved"
        
        # Submit Phase 2 with surgical checklist
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "checklist_surgical": {
                "items": [
                    {"id": "surgical_item1", "label": "Surgical prep completed", "value": True},
                    {"id": "surgical_item2", "label": "Sterile field confirmed", "value": True}
                ],
                "additional_fields": {}
            },
            "remark": "Surgery completed successfully",
            "torque_values": [35.0]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", 
                                json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Failed to submit phase2: {response.text}"
        assert response.json()["status"] == "pending_phase2"
        
        # Supervisor permanently rejects Phase 2
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Critical protocol violation - permanent rejection",
            "rejection_type": "permanent"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200, f"Failed to permanently reject phase2: {response.text}"
        
        result = response.json()
        assert result["status"] == "permanently_rejected", f"Expected permanently_rejected, got {result['status']}"
        assert result["phase2_rejection_reason"] == "Critical protocol violation - permanent rejection"
        assert result["phase2_rejection_type"] == "permanent"
        assert result["rejected_phase"] == "phase2"
        print(f"PASS: Phase 2 permanent rejection - status={result['status']}, phase2_rejection_type={result['phase2_rejection_type']}")


class TestPhase2ReconsiderRejection:
    """Test Phase 2 reconsider rejection sets status back to phase1_approved"""
    
    def test_phase2_reconsider_rejection(self, student_token, supervisor_token, incharge_token):
        """Test: Phase 2 reconsider rejection sets status to phase1_approved"""
        # Create procedure and get to pending_phase2
        procedure = create_test_procedure(student_token, "P2_RECON")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        # Supervisor approves Phase 1
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                     json={"action": "approve"}, headers=headers)
        
        # Incharge approves Phase 1
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers)
        assert response.json()["status"] == "phase1_approved"
        
        # Submit Phase 2
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "checklist_surgical": {
                "items": [
                    {"id": "surgical_item1", "label": "Surgical prep", "value": True}
                ],
                "additional_fields": {}
            }
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", 
                                json=phase2_data, headers=headers)
        assert response.status_code == 200
        
        # Supervisor rejects with reconsideration
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Documentation incomplete - please revise surgical notes",
            "rejection_type": "reconsider"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200, f"Failed to reconsider reject phase2: {response.text}"
        
        result = response.json()
        # Status should be back to phase1_approved
        assert result["status"] == "phase1_approved", f"Expected phase1_approved, got {result['status']}"
        assert result["phase2_rejection_reason"] == "Documentation incomplete - please revise surgical notes"
        assert result["phase2_rejection_type"] == "reconsider"
        assert result["supervisor_phase2_approved"] == False
        assert result["implant_incharge_phase2_approved"] == False
        assert result["rejected_phase"] == "phase2"
        print(f"PASS: Phase 2 reconsider rejection - status={result['status']}, phase2 flags reset")


class TestRejectionNotifications:
    """Test notifications sent to case creator for both rejection types"""
    
    def test_notification_on_permanent_rejection(self, student_token, supervisor_token):
        """Test: Notification sent with permanently rejected message"""
        # Create procedure
        procedure = create_test_procedure(student_token, "NOTIF_PERM")
        procedure_id = procedure["id"]
        
        # Get initial notification count
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        initial_count = len(response.json()) if response.status_code == 200 else 0
        
        # Request Phase 1 approval
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        # Supervisor permanently rejects
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Case permanently rejected for notification test",
            "rejection_type": "permanent"
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=reject_data, headers=headers)
        
        # Check notifications
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        
        notifications = response.json()
        # Find notification for this procedure
        proc_notifs = [n for n in notifications if n.get("procedure_id") == procedure_id and "permanently rejected" in n.get("message", "").lower()]
        assert len(proc_notifs) >= 1, f"No permanent rejection notification found for procedure {procedure_id}"
        
        notif = proc_notifs[0]
        assert "permanently rejected" in notif["message"].lower()
        assert "Phase 1" in notif["message"]
        print(f"PASS: Notification for permanent rejection received: '{notif['message'][:80]}...'")
    
    def test_notification_on_reconsider_rejection(self, student_token, supervisor_token):
        """Test: Notification sent with reconsider message"""
        # Create procedure
        procedure = create_test_procedure(student_token, "NOTIF_RECON")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        # Supervisor rejects with reconsideration
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Please revise and resubmit for notification test",
            "rejection_type": "reconsider"
        }
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json=reject_data, headers=headers)
        
        # Check notifications
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200
        
        notifications = response.json()
        # Find notification for this procedure with "rejected with consideration"
        proc_notifs = [n for n in notifications if n.get("procedure_id") == procedure_id and "rejected with consideration" in n.get("message", "").lower()]
        assert len(proc_notifs) >= 1, f"No reconsider rejection notification found for procedure {procedure_id}"
        
        notif = proc_notifs[0]
        assert "rejected with consideration" in notif["message"].lower()
        print(f"PASS: Notification for reconsider rejection received: '{notif['message'][:80]}...'")


class TestFullFlowPhase2ReconsiderResubmit:
    """Test full flow: create -> phase1 approve -> submit phase2 -> reconsider reject -> resubmit phase2"""
    
    def test_full_flow_phase2_reconsider_resubmit(self, student_token, supervisor_token, incharge_token):
        """Test complete workflow with Phase 2 reconsider rejection and resubmission"""
        # Create procedure
        procedure = create_test_procedure(student_token, "FULLFLOW")
        procedure_id = procedure["id"]
        print(f"Step 1: Created procedure {procedure_id}")
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        assert response.status_code == 200
        print("Step 2: Requested Phase 1 approval")
        
        # Supervisor approves Phase 1
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                     json={"action": "approve"}, headers=headers)
        print("Step 3: Supervisor approved Phase 1")
        
        # Incharge approves Phase 1
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers)
        assert response.json()["status"] == "phase1_approved"
        print("Step 4: Incharge approved Phase 1 - status=phase1_approved")
        
        # Submit Phase 2 (first submission)
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "checklist_surgical": {
                "items": [
                    {"id": "surgical_item1", "label": "Initial submission", "value": True}
                ],
                "additional_fields": {}
            },
            "remark": "First Phase 2 submission"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", 
                                json=phase2_data, headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "pending_phase2"
        print("Step 5: Submitted Phase 2 (first submission) - status=pending_phase2")
        
        # Supervisor rejects Phase 2 with reconsideration
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Please add torque values and more details",
            "rejection_type": "reconsider"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "phase1_approved", f"Expected phase1_approved after reconsider, got {result['status']}"
        print("Step 6: Supervisor reconsider rejected Phase 2 - status=phase1_approved")
        
        # Student resubmits Phase 2 with additional details
        headers = {"Authorization": f"Bearer {student_token}"}
        phase2_data = {
            "checklist_surgical": {
                "items": [
                    {"id": "surgical_item1", "label": "Revised submission", "value": True},
                    {"id": "surgical_item2", "label": "Torque values recorded", "value": True}
                ],
                "additional_fields": {"notes": "Added torque values as requested"}
            },
            "remark": "Revised Phase 2 submission with torque values",
            "torque_values": [35.0, 40.0]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", 
                                json=phase2_data, headers=headers)
        assert response.status_code == 200, f"Failed to resubmit phase2: {response.text}"
        assert response.json()["status"] == "pending_phase2"
        print("Step 7: Student resubmitted Phase 2 - status=pending_phase2")
        
        # Verify the flow worked correctly
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        final_proc = response.json()
        assert final_proc["status"] == "pending_phase2"
        assert final_proc.get("phase2_remark") == "Revised Phase 2 submission with torque values"
        print(f"PASS: Full flow completed - final status={final_proc['status']}")


class TestPermanentlyRejectedPreventsFurtherActions:
    """Test that permanently_rejected status blocks further actions"""
    
    def test_permanently_rejected_blocks_phase1_approval(self, student_token, supervisor_token):
        """Test: Cannot request approval on permanently rejected case"""
        # Create and permanently reject a procedure
        procedure = create_test_procedure(student_token, "BLOCK_P1")
        procedure_id = procedure["id"]
        
        # Request Phase 1 approval
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        # Permanently reject
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                     json={"action": "reject", "rejection_reason": "Test", "rejection_type": "permanent"}, 
                     headers=headers)
        
        # Verify status
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert response.json()["status"] == "permanently_rejected"
        
        # Try to request approval again - should fail with 400 (wrong status)
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        # The endpoint checks for "draft" status, so permanently_rejected will fail
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "not in draft" in response.text.lower() or "draft" in response.text.lower()
        print(f"PASS: permanently_rejected blocks request-phase1-approval - got expected 400")
    
    def test_permanently_rejected_blocks_approve_action(self, student_token, supervisor_token, incharge_token):
        """Test: Cannot approve a permanently rejected case"""
        # Create, get to pending_phase2, then permanently reject
        procedure = create_test_procedure(student_token, "BLOCK_APPROVE")
        procedure_id = procedure["id"]
        
        # Get to pending_phase1 and reject
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                     json={"action": "reject", "rejection_reason": "Test", "rejection_type": "permanent"}, 
                     headers=headers)
        
        # Try to approve - should fail
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json={"action": "approve"}, headers=headers)
        # Should fail because status is not pending_phase1 or pending_phase2
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"PASS: permanently_rejected blocks approve action - got expected 400")


class TestRejectionTypeFieldAccepted:
    """Test that rejection_type field is accepted in ApprovalAction model"""
    
    def test_rejection_type_permanent_accepted(self, student_token, supervisor_token):
        """Test: rejection_type='permanent' is accepted"""
        procedure = create_test_procedure(student_token, "TYPE_PERM")
        procedure_id = procedure["id"]
        
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Testing rejection_type=permanent",
            "rejection_type": "permanent"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200, f"rejection_type='permanent' not accepted: {response.text}"
        assert response.json()["rejection_type"] == "permanent"
        print("PASS: rejection_type='permanent' accepted in ApprovalAction")
    
    def test_rejection_type_reconsider_accepted(self, student_token, supervisor_token):
        """Test: rejection_type='reconsider' is accepted"""
        procedure = create_test_procedure(student_token, "TYPE_RECON")
        procedure_id = procedure["id"]
        
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Testing rejection_type=reconsider",
            "rejection_type": "reconsider"
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200, f"rejection_type='reconsider' not accepted: {response.text}"
        assert response.json()["rejection_type"] == "reconsider"
        print("PASS: rejection_type='reconsider' accepted in ApprovalAction")
    
    def test_rejection_type_defaults_to_permanent(self, student_token, supervisor_token):
        """Test: rejection_type defaults to 'permanent' when not specified"""
        procedure = create_test_procedure(student_token, "TYPE_DEF")
        procedure_id = procedure["id"]
        
        headers = {"Authorization": f"Bearer {student_token}"}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=headers)
        
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        reject_data = {
            "action": "reject",
            "rejection_reason": "Testing default rejection_type"
            # rejection_type not specified
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", 
                                json=reject_data, headers=headers)
        assert response.status_code == 200
        # Should default to permanent
        assert response.json()["status"] == "permanently_rejected"
        assert response.json()["rejection_type"] == "permanent"
        print("PASS: rejection_type defaults to 'permanent' when not specified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
