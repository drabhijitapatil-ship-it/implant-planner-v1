"""
Test Suite: Delayed Phase 1 Approval Workflow (Iteration 33)

Tests the workflow where:
1. POST /api/procedures creates a case with status='draft' (NOT pending_phase1)
2. POST /api/procedures/{id}/request-phase1-approval transitions draft -> pending_phase1
3. The approval request creates notifications for supervisor and implant_incharge
4. Only the student who created the case can request approval (403 for others)
5. Request approval fails with 400 if case is not in 'draft' status
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://torque-visibility.preview.emergentagent.com')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "password"
SUPERVISOR_EMAIL = "vasantha.n@dental.edu"
SUPERVISOR_PASSWORD = "password"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "password"
OTHER_STUDENT_EMAIL = "atharva.mahadik@student.dental.edu"


class TestDelayedPhase1Approval:
    """Tests for the Delayed Phase 1 Approval Workflow."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.student_token = None
        self.supervisor_token = None
        self.incharge_token = None
        self.other_student_token = None
        self.procedure_id = None
        
    def login(self, email, password):
        """Login and return token."""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def get_student_token(self):
        if not self.student_token:
            self.student_token = self.login(STUDENT_EMAIL, STUDENT_PASSWORD)
        return self.student_token
    
    def get_supervisor_token(self):
        if not self.supervisor_token:
            self.supervisor_token = self.login(SUPERVISOR_EMAIL, SUPERVISOR_PASSWORD)
        return self.supervisor_token
    
    def get_incharge_token(self):
        if not self.incharge_token:
            self.incharge_token = self.login(INCHARGE_EMAIL, INCHARGE_PASSWORD)
        return self.incharge_token

    # ─────────────────────────────────────────────────────────────────────
    # Test 1: POST /api/procedures creates case with status='draft'
    # ─────────────────────────────────────────────────────────────────────
    def get_valid_weekday(self, days_ahead=5):
        """Get a valid weekday (Mon-Fri) for procedure scheduling."""
        future_date = datetime.now() + timedelta(days=days_ahead)
        while future_date.weekday() >= 5:  # Skip Sat (5) and Sun (6)
            future_date += timedelta(days=1)
        return future_date.strftime("%Y-%m-%d")

    def test_create_procedure_returns_draft_status(self):
        """POST /api/procedures creates a new case with status='draft' (not pending_phase1)."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Get supervisor and incharge IDs
        supervisor_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
        ).json()
        incharge_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        ).json()
        
        supervisor_id = supervisor_info["user"]["id"]
        incharge_id = incharge_info["user"]["id"]
        
        # Create a procedure with required fields - ensure it's a weekday
        procedure_date = self.get_valid_weekday(5)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_Draft_Patient_Iteration33",
            "registration_number": "REG-TEST-33001",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-33001",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # CRITICAL: Verify status is 'draft'
        assert data.get("status") == "draft", f"Expected status='draft', got '{data.get('status')}'"
        assert data.get("current_phase") == 1, "Expected current_phase=1"
        assert data.get("id"), "Expected procedure id"
        
        self.procedure_id = data["id"]
        print(f"✓ Test 1 PASSED: Created procedure {self.procedure_id} with status='draft'")
        return data["id"]

    # ─────────────────────────────────────────────────────────────────────
    # Test 2: POST /api/procedures/{id}/request-phase1-approval changes status
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_changes_status_to_pending(self):
        """POST /api/procedures/{id}/request-phase1-approval changes draft -> pending_phase1."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # First create a procedure
        procedure_id = self.test_create_procedure_returns_draft_status()
        
        # Request phase 1 approval
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify status changed to 'pending_phase1'
        assert data.get("status") == "pending_phase1", f"Expected status='pending_phase1', got '{data.get('status')}'"
        assert data.get("phase1_requested_at"), "Expected phase1_requested_at timestamp"
        
        print(f"✓ Test 2 PASSED: Status changed from 'draft' to 'pending_phase1'")
        return procedure_id

    # ─────────────────────────────────────────────────────────────────────
    # Test 3: Request approval creates notifications for supervisor & incharge
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_creates_notifications(self):
        """POST /api/procedures/{id}/request-phase1-approval creates approval_request notifications."""
        token = self.get_student_token()
        supervisor_token = self.get_supervisor_token()
        incharge_token = self.get_incharge_token()
        
        assert token, "Failed to login as student"
        assert supervisor_token, "Failed to login as supervisor"
        assert incharge_token, "Failed to login as incharge"
        
        # Get supervisor and incharge IDs for procedure creation
        supervisor_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
        ).json()
        incharge_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        ).json()
        
        supervisor_id = supervisor_info["user"]["id"]
        incharge_id = incharge_info["user"]["id"]
        
        # Create a procedure - find a weekday (Mon-Fri)
        procedure_date = self.get_valid_weekday(6)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_Notification_Patient_33",
            "registration_number": "REG-TEST-33002",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-33002",
            "amount_paid": 6000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Request phase 1 approval
        approval_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert approval_response.status_code == 200
        
        # Check supervisor notifications
        supervisor_notif_response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        assert supervisor_notif_response.status_code == 200
        supervisor_notifications = supervisor_notif_response.json()
        
        # Find the approval_request notification for this procedure
        supervisor_approval_notif = [
            n for n in supervisor_notifications 
            if n.get("procedure_id") == procedure_id and n.get("type") == "approval_request"
        ]
        assert len(supervisor_approval_notif) > 0, "Supervisor should have received approval_request notification"
        assert "Phase 1 approval requested" in supervisor_approval_notif[0].get("message", "")
        
        # Check incharge notifications
        incharge_notif_response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert incharge_notif_response.status_code == 200
        incharge_notifications = incharge_notif_response.json()
        
        incharge_approval_notif = [
            n for n in incharge_notifications 
            if n.get("procedure_id") == procedure_id and n.get("type") == "approval_request"
        ]
        assert len(incharge_approval_notif) > 0, "Implant incharge should have received approval_request notification"
        
        print(f"✓ Test 3 PASSED: Approval request notifications sent to supervisor and implant_incharge")

    # ─────────────────────────────────────────────────────────────────────
    # Test 4: Request approval returns 400 if status is NOT 'draft'
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_returns_400_if_not_draft(self):
        """POST /api/procedures/{id}/request-phase1-approval returns 400 if status != draft."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # First create and approve a procedure
        procedure_id = self.test_request_phase1_approval_changes_status_to_pending()
        
        # Try to request approval again (status is now pending_phase1)
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "not in draft" in data.get("detail", "").lower(), f"Expected 'not in draft' error, got: {data}"
        
        print(f"✓ Test 4 PASSED: Returns 400 when status is not 'draft'")

    # ─────────────────────────────────────────────────────────────────────
    # Test 5: Request approval returns 403 if called by non-owner student
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_returns_403_for_non_owner(self):
        """POST /api/procedures/{id}/request-phase1-approval returns 403 if called by non-owner."""
        # Get both student tokens
        owner_token = self.get_student_token()
        assert owner_token, "Failed to login as owner student"
        
        # Reset password for other student and get their token
        other_student_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": OTHER_STUDENT_EMAIL, "password": "password"}
        )
        
        # If other student login fails, we need to check or reset password
        if other_student_response.status_code != 200:
            pytest.skip("Cannot test with other student - login failed")
        
        other_student_token = other_student_response.json().get("token")
        
        # Get supervisor and incharge IDs
        supervisor_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
        ).json()
        incharge_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        ).json()
        
        supervisor_id = supervisor_info["user"]["id"]
        incharge_id = incharge_info["user"]["id"]
        
        # Create a procedure as owner student - use a valid weekday
        procedure_date = self.get_valid_weekday(7)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_NonOwner_Patient_33",
            "registration_number": "REG-TEST-33003",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-33003",
            "amount_paid": 7000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=payload,
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Try to request approval as DIFFERENT student
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {other_student_token}"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        print(f"✓ Test 5 PASSED: Returns 403 for non-owner student")

    # ─────────────────────────────────────────────────────────────────────
    # Test 6: Request approval returns 403 for supervisor/incharge roles
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_returns_403_for_non_student_roles(self):
        """POST /api/procedures/{id}/request-phase1-approval returns 403 for supervisor/incharge."""
        owner_token = self.get_student_token()
        supervisor_token = self.get_supervisor_token()
        incharge_token = self.get_incharge_token()
        
        assert owner_token, "Failed to login as student"
        assert supervisor_token, "Failed to login as supervisor"
        
        # Get IDs
        supervisor_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
        ).json()
        incharge_info = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        ).json()
        
        supervisor_id = supervisor_info["user"]["id"]
        incharge_id = incharge_info["user"]["id"]
        
        # Create a procedure - use a valid weekday
        procedure_date = self.get_valid_weekday(8)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_RoleForbidden_Patient_33",
            "registration_number": "REG-TEST-33004",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-33004",
            "amount_paid": 8000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=payload,
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Try as supervisor
        supervisor_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        assert supervisor_response.status_code == 403, f"Expected 403 for supervisor, got {supervisor_response.status_code}"
        
        # Try as implant_incharge
        incharge_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert incharge_response.status_code == 403, f"Expected 403 for incharge, got {incharge_response.status_code}"
        
        print(f"✓ Test 6 PASSED: Returns 403 for supervisor and implant_incharge roles")

    # ─────────────────────────────────────────────────────────────────────
    # Test 7: Verify GET /api/procedures returns draft status
    # ─────────────────────────────────────────────────────────────────────
    def test_get_procedure_shows_draft_status(self):
        """GET /api/procedures/{id} returns status='draft' for newly created case."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Create a procedure
        procedure_id = self.test_create_procedure_returns_draft_status()
        
        # Fetch the procedure
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "draft", f"Expected status='draft', got '{data.get('status')}'"
        
        print(f"✓ Test 7 PASSED: GET returns draft status")

    # ─────────────────────────────────────────────────────────────────────
    # Test 8: Verify procedure list can filter by draft status
    # ─────────────────────────────────────────────────────────────────────
    def test_get_procedures_list_with_draft_filter(self):
        """GET /api/procedures?status=draft returns draft cases."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Create a new draft procedure
        self.test_create_procedure_returns_draft_status()
        
        # Get all draft procedures
        response = requests.get(
            f"{BASE_URL}/api/procedures?status=draft",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        procedures = response.json()
        
        # All returned should have draft status
        for proc in procedures:
            assert proc.get("status") == "draft", f"Expected draft status, got {proc.get('status')}"
        
        print(f"✓ Test 8 PASSED: Procedure list filter by draft works ({len(procedures)} draft cases)")


# Cleanup test data after tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests complete."""
    yield
    # Cleanup happens after all tests
    try:
        token = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        ).json().get("token")
        
        if token:
            # Get all procedures
            procedures = requests.get(
                f"{BASE_URL}/api/procedures",
                headers={"Authorization": f"Bearer {token}"}
            ).json()
            
            # Delete test procedures
            for proc in procedures:
                if proc.get("patient_name", "").startswith("TEST_"):
                    requests.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {token}"}
                    )
    except Exception as e:
        print(f"Cleanup error: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
