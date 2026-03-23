"""
Test Suite: Draft Cases Section & Dashboard Stats (Iteration 34)

Tests the Draft Cases feature on the student dashboard:
1. GET /api/dashboard/stats returns 'drafts' field with correct count
2. GET /api/procedures returns procedures with status='draft' for the student
3. POST /api/procedures/{id}/request-phase1-approval transitions draft -> pending_phase1
4. After approval, the draft count decreases in stats
5. Existing draft case with id '69b786d4cd1ead5c32a3cb18' is in the database

This tests the "quick-approve from dashboard" flow where a student can:
- See their draft cases count in stats
- Filter procedures by draft status
- Send a draft case for approval directly (quick-action)
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-case-builder.preview.emergentagent.com')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "password"
SUPERVISOR_EMAIL = "vasantha.n@dental.edu"
SUPERVISOR_PASSWORD = "password"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "password"

# Known draft procedure from the agent context
EXISTING_DRAFT_ID = "69b786d4cd1ead5c32a3cb18"


class TestDraftCasesStats:
    """Tests for Draft Cases section and dashboard stats 'drafts' field."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.student_token = None
        self.supervisor_token = None
        self.incharge_token = None
        self.created_procedure_ids = []
        
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

    def get_valid_weekday(self, days_ahead=5):
        """Get a valid weekday (Mon-Fri) for procedure scheduling."""
        future_date = datetime.now() + timedelta(days=days_ahead)
        while future_date.weekday() >= 5:  # Skip Sat (5) and Sun (6)
            future_date += timedelta(days=1)
        return future_date.strftime("%Y-%m-%d")

    # ─────────────────────────────────────────────────────────────────────
    # Test 1: Dashboard stats returns 'drafts' field
    # ─────────────────────────────────────────────────────────────────────
    def test_dashboard_stats_has_drafts_field(self):
        """GET /api/dashboard/stats includes a 'drafts' field in the response."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify required fields exist
        assert "total" in data, "Missing 'total' field in stats"
        assert "pending" in data, "Missing 'pending' field in stats"
        assert "approved" in data, "Missing 'approved' field in stats"
        assert "rejected" in data, "Missing 'rejected' field in stats"
        
        # CRITICAL: Verify 'drafts' field exists
        assert "drafts" in data, "Missing 'drafts' field in stats - FEATURE NOT IMPLEMENTED"
        assert isinstance(data["drafts"], int), f"'drafts' should be an integer, got {type(data['drafts'])}"
        
        print(f"✓ Test 1 PASSED: Dashboard stats includes 'drafts' field (value: {data['drafts']})")
        return data

    # ─────────────────────────────────────────────────────────────────────
    # Test 2: Dashboard stats drafts count is >= 0
    # ─────────────────────────────────────────────────────────────────────
    def test_dashboard_stats_drafts_count_valid(self):
        """GET /api/dashboard/stats 'drafts' count is a non-negative integer."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        drafts_count = data.get("drafts", -1)
        assert drafts_count >= 0, f"'drafts' count should be non-negative, got {drafts_count}"
        
        print(f"✓ Test 2 PASSED: Dashboard stats drafts count is valid ({drafts_count})")
        return drafts_count

    # ─────────────────────────────────────────────────────────────────────
    # Test 3: Get procedures filtered by status='draft'
    # ─────────────────────────────────────────────────────────────────────
    def test_get_procedures_draft_filter(self):
        """GET /api/procedures?status=draft returns only draft procedures."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        response = requests.get(
            f"{BASE_URL}/api/procedures?status=draft",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        procedures = response.json()
        
        # All returned procedures should have status='draft'
        for proc in procedures:
            assert proc.get("status") == "draft", f"Expected draft status, got {proc.get('status')}"
        
        print(f"✓ Test 3 PASSED: GET /api/procedures?status=draft returns {len(procedures)} draft cases")
        return procedures

    # ─────────────────────────────────────────────────────────────────────
    # Test 4: Drafts count matches filtered procedures count
    # ─────────────────────────────────────────────────────────────────────
    def test_drafts_count_matches_filtered_procedures(self):
        """The 'drafts' count in stats should match the number of draft procedures."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Get stats
        stats_response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert stats_response.status_code == 200
        stats = stats_response.json()
        drafts_from_stats = stats.get("drafts", 0)
        
        # Get draft procedures
        procedures_response = requests.get(
            f"{BASE_URL}/api/procedures?status=draft",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert procedures_response.status_code == 200
        draft_procedures = procedures_response.json()
        
        # Counts should match
        assert drafts_from_stats == len(draft_procedures), \
            f"Stats drafts count ({drafts_from_stats}) doesn't match actual draft procedures ({len(draft_procedures)})"
        
        print(f"✓ Test 4 PASSED: Drafts count ({drafts_from_stats}) matches filtered procedures count")

    # ─────────────────────────────────────────────────────────────────────
    # Test 5: Create draft procedure and verify count increases
    # ─────────────────────────────────────────────────────────────────────
    def test_create_draft_increases_drafts_count(self):
        """Creating a new procedure (with status='draft') should increase the drafts count."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Get initial draft count
        initial_stats = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        ).json()
        initial_drafts = initial_stats.get("drafts", 0)
        
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
        
        # Create a new procedure (should be created as 'draft')
        procedure_date = self.get_valid_weekday(5)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_DraftsCount_Patient_34",
            "registration_number": "REG-TEST-34001",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-34001",
            "amount_paid": 5000.0,
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
        
        assert create_response.status_code == 200, f"Failed to create procedure: {create_response.text}"
        created = create_response.json()
        assert created.get("status") == "draft", "Newly created procedure should have status='draft'"
        
        self.created_procedure_ids.append(created["id"])
        
        # Get new draft count
        new_stats = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        ).json()
        new_drafts = new_stats.get("drafts", 0)
        
        # Draft count should have increased by 1
        assert new_drafts == initial_drafts + 1, \
            f"Drafts count should have increased from {initial_drafts} to {initial_drafts + 1}, got {new_drafts}"
        
        print(f"✓ Test 5 PASSED: Creating draft increased drafts count from {initial_drafts} to {new_drafts}")
        return created["id"]

    # ─────────────────────────────────────────────────────────────────────
    # Test 6: Quick-approve (request-phase1-approval) decreases drafts count
    # ─────────────────────────────────────────────────────────────────────
    def test_request_approval_decreases_drafts_count(self):
        """Sending a draft for approval should decrease the drafts count."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # First create a new draft procedure
        procedure_id = self.test_create_draft_increases_drafts_count()
        
        # Get current draft count (after creation)
        stats_before = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        ).json()
        drafts_before = stats_before.get("drafts", 0)
        
        # Send for approval (quick-approve from dashboard)
        approval_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert approval_response.status_code == 200, f"Failed to request approval: {approval_response.text}"
        approved = approval_response.json()
        assert approved.get("status") == "pending_phase1", \
            f"After approval request, status should be 'pending_phase1', got '{approved.get('status')}'"
        
        # Get new draft count (after approval)
        stats_after = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        ).json()
        drafts_after = stats_after.get("drafts", 0)
        
        # Draft count should have decreased by 1
        assert drafts_after == drafts_before - 1, \
            f"Drafts count should have decreased from {drafts_before} to {drafts_before - 1}, got {drafts_after}"
        
        print(f"✓ Test 6 PASSED: Request approval decreased drafts count from {drafts_before} to {drafts_after}")

    # ─────────────────────────────────────────────────────────────────────
    # Test 7: Verify request-phase1-approval endpoint works correctly
    # ─────────────────────────────────────────────────────────────────────
    def test_request_phase1_approval_endpoint(self):
        """POST /api/procedures/{id}/request-phase1-approval transitions draft to pending_phase1."""
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
        
        # Create a draft procedure
        procedure_date = self.get_valid_weekday(6)
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_QuickApprove_Patient_34",
            "registration_number": "REG-TEST-34002",
            "supervisor_id": supervisor_id,
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "receipt_number": "RCPT-TEST-34002",
            "amount_paid": 6000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Screw Retained Crown - Zirconia"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        self.created_procedure_ids.append(procedure_id)
        
        # Verify initial status is draft
        get_response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert get_response.json().get("status") == "draft"
        
        # Send for approval
        approval_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert approval_response.status_code == 200
        result = approval_response.json()
        
        # Verify status transition
        assert result.get("status") == "pending_phase1", \
            f"Expected status='pending_phase1', got '{result.get('status')}'"
        assert result.get("phase1_requested_at"), "Expected 'phase1_requested_at' timestamp"
        
        print(f"✓ Test 7 PASSED: Request approval successfully transitions draft -> pending_phase1")

    # ─────────────────────────────────────────────────────────────────────
    # Test 8: Verify existing draft case (from context) if accessible
    # ─────────────────────────────────────────────────────────────────────
    def test_existing_draft_case_accessible(self):
        """Verify the existing draft case mentioned in context is accessible."""
        token = self.get_student_token()
        assert token, "Failed to login as student"
        
        # Try to get the existing draft procedure
        response = requests.get(
            f"{BASE_URL}/api/procedures/{EXISTING_DRAFT_ID}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # If 404, the case may have been approved/deleted - that's okay
        if response.status_code == 404:
            print(f"⚠ Test 8 SKIPPED: Existing draft case {EXISTING_DRAFT_ID} not found (may have been processed)")
            pytest.skip(f"Existing draft case {EXISTING_DRAFT_ID} not found")
            return
        
        if response.status_code == 403:
            print(f"⚠ Test 8 SKIPPED: No access to case {EXISTING_DRAFT_ID} (may belong to another student)")
            pytest.skip(f"No access to existing draft case")
            return
        
        assert response.status_code == 200, f"Unexpected response: {response.status_code} - {response.text}"
        data = response.json()
        
        print(f"✓ Test 8 PASSED: Existing case {EXISTING_DRAFT_ID} accessible, status: {data.get('status')}")


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
                    print(f"Cleaned up test procedure: {proc['id']}")
    except Exception as e:
        print(f"Cleanup error: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
