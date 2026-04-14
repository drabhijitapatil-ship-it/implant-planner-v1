"""
Iteration 87: Backend Tests for 3 Bug Fixes
1. Drawer menu username - GET /api/auth/me returns 'name' field (not 'full_name')
2. Draft cases:
   - Continuing own draft bypasses slot conflict (should succeed)
   - Another user's slot should fail with 409
   - Deleted drafts should not appear in GET /api/procedures
3. My Cases sorted by created_at descending (latest first)
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
STUDENT2_CREDS = {"identifier": "Atharva.mahadik@student.dental.edu", "password": "Student@123"}


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def incharge_token(api_client):
    """Get implant incharge auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Incharge login failed: {response.text}")


@pytest.fixture(scope="module")
def student_token(api_client):
    """Get student auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Student login failed: {response.text}")


@pytest.fixture(scope="module")
def student2_token(api_client):
    """Get second student auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=STUDENT2_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Student2 login failed: {response.text}")


@pytest.fixture(scope="module")
def supervisor_token(api_client):
    """Get supervisor auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Supervisor login failed: {response.text}")


@pytest.fixture(scope="module")
def incharge_user_data(api_client):
    """Get incharge user data from login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
    if response.status_code == 200:
        return response.json().get("user")
    pytest.skip("Incharge login failed")


@pytest.fixture(scope="module")
def student_user_data(api_client):
    """Get student user data from login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
    if response.status_code == 200:
        return response.json().get("user")
    pytest.skip("Student login failed")


@pytest.fixture(scope="module")
def supervisor_user_data(api_client):
    """Get supervisor user data from login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
    if response.status_code == 200:
        return response.json().get("user")
    pytest.skip("Supervisor login failed")


def get_future_weekday_date(days_ahead=3):
    """Get a future weekday date (Mon-Fri) for testing"""
    date = datetime.now() + timedelta(days=days_ahead)
    # Skip to Monday if weekend
    while date.weekday() >= 5:  # Saturday=5, Sunday=6
        date += timedelta(days=1)
    return date.strftime("%Y-%m-%d")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json().get("status") == "ok"
        print("PASS: API health check")


class TestDrawerUserName:
    """Bug Fix 1: Drawer menu should show username - GET /api/auth/me returns 'name' field"""
    
    def test_auth_me_returns_name_field_student(self, api_client, student_token):
        """Verify GET /api/auth/me returns 'name' field for student"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify 'name' field exists (not 'full_name')
        assert "name" in data, "Response should contain 'name' field"
        assert isinstance(data["name"], str), "'name' should be a string"
        assert len(data["name"]) > 0, "'name' should not be empty"
        
        # Verify 'full_name' is NOT in response (bug was using full_name)
        assert "full_name" not in data, "Response should NOT contain 'full_name' field"
        
        print(f"PASS: GET /api/auth/me returns name='{data['name']}' for student")
    
    def test_auth_me_returns_name_field_supervisor(self, api_client, supervisor_token):
        """Verify GET /api/auth/me returns 'name' field for supervisor"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "name" in data, "Response should contain 'name' field"
        assert isinstance(data["name"], str)
        assert "full_name" not in data
        
        print(f"PASS: GET /api/auth/me returns name='{data['name']}' for supervisor")
    
    def test_auth_me_returns_name_field_incharge(self, api_client, incharge_token):
        """Verify GET /api/auth/me returns 'name' field for implant incharge"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "name" in data, "Response should contain 'name' field"
        assert isinstance(data["name"], str)
        assert "full_name" not in data
        
        print(f"PASS: GET /api/auth/me returns name='{data['name']}' for incharge")


class TestDraftSlotConflictBypass:
    """Bug Fix 2: Continuing own draft should bypass slot conflict"""
    
    def test_create_draft_then_create_same_slot_bypasses_conflict(
        self, api_client, incharge_token, incharge_user_data, supervisor_user_data
    ):
        """
        InCharge creates a draft, then creates another procedure on same slot.
        Should succeed (bypass slot conflict for own draft).
        """
        test_date = get_future_weekday_date(5)
        test_time = "10:00"
        
        # First, clean up any existing procedures on this slot
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        if response.status_code == 200:
            for proc in response.json():
                if proc.get("procedure_date") == test_date and proc.get("procedure_time") == test_time:
                    api_client.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {incharge_token}"}
                    )
        
        # Create first draft procedure
        procedure_data = {
            "patient_name": "TEST_SlotBypass_Patient1",
            "registration_number": "TEST-SLOT-001",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-001",
            "amount_paid": 1000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200, f"First draft creation failed: {response.text}"
        first_draft_id = response.json()["id"]
        print(f"Created first draft: {first_draft_id}")
        
        # Now create another procedure on the SAME slot - should succeed (bypass own draft)
        procedure_data2 = {
            "patient_name": "TEST_SlotBypass_Patient2",
            "registration_number": "TEST-SLOT-002",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-002",
            "amount_paid": 2000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response2 = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data2,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        # This should succeed because the existing slot is the user's own draft
        assert response2.status_code == 200, f"Second procedure on same slot should succeed (bypass own draft): {response2.text}"
        second_proc_id = response2.json()["id"]
        print(f"PASS: Created second procedure on same slot (bypassed own draft): {second_proc_id}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/procedures/{first_draft_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        api_client.delete(
            f"{BASE_URL}/api/procedures/{second_proc_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
    
    def test_another_user_same_slot_fails_with_409(
        self, api_client, incharge_token, student_token, incharge_user_data, 
        student_user_data, supervisor_user_data
    ):
        """
        InCharge creates a procedure, then Student tries same slot.
        Should fail with 409 Conflict.
        """
        test_date = get_future_weekday_date(6)
        test_time = "14:00"
        
        # Clean up any existing procedures on this slot
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        if response.status_code == 200:
            for proc in response.json():
                if proc.get("procedure_date") == test_date and proc.get("procedure_time") == test_time:
                    api_client.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {incharge_token}"}
                    )
        
        # InCharge creates a procedure
        procedure_data = {
            "patient_name": "TEST_Conflict_Patient1",
            "registration_number": "TEST-CONF-001",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-CONF-001",
            "amount_paid": 1500.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200, f"InCharge procedure creation failed: {response.text}"
        incharge_proc_id = response.json()["id"]
        print(f"InCharge created procedure: {incharge_proc_id}")
        
        # Student tries to create on the SAME slot - should fail with 409
        student_procedure_data = {
            "patient_name": "TEST_Conflict_Patient2",
            "registration_number": "TEST-CONF-002",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-CONF-002",
            "amount_paid": 2500.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response2 = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=student_procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        # Should fail with 409 Conflict
        assert response2.status_code == 409, f"Expected 409 Conflict, got {response2.status_code}: {response2.text}"
        error_detail = response2.json().get("detail", "")
        assert "already booked" in error_detail.lower(), f"Error should mention 'already booked': {error_detail}"
        print(f"PASS: Student got 409 Conflict when trying same slot: {error_detail}")
        
        # Cleanup
        api_client.delete(
            f"{BASE_URL}/api/procedures/{incharge_proc_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )


class TestDraftDeletePersistence:
    """Bug Fix 2b: Deleted drafts should not appear in GET /api/procedures"""
    
    def test_delete_draft_removes_from_db(
        self, api_client, incharge_token, incharge_user_data, supervisor_user_data
    ):
        """
        Create a draft, delete it, verify it's gone from GET /api/procedures.
        """
        test_date = get_future_weekday_date(7)
        test_time = "10:00"
        
        # Create a draft procedure
        procedure_data = {
            "patient_name": "TEST_DeleteDraft_Patient",
            "registration_number": "TEST-DEL-001",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-DEL-001",
            "amount_paid": 3000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200, f"Draft creation failed: {response.text}"
        draft_id = response.json()["id"]
        print(f"Created draft: {draft_id}")
        
        # Verify draft exists in GET /api/procedures
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        procedures = response.json()
        draft_ids = [p["id"] for p in procedures]
        assert draft_id in draft_ids, "Draft should exist before deletion"
        print(f"Verified draft exists in procedures list")
        
        # Delete the draft
        response = api_client.delete(
            f"{BASE_URL}/api/procedures/{draft_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"Deleted draft: {draft_id}")
        
        # Verify draft is GONE from GET /api/procedures
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        procedures_after = response.json()
        draft_ids_after = [p["id"] for p in procedures_after]
        assert draft_id not in draft_ids_after, "Deleted draft should NOT appear in procedures list"
        print(f"PASS: Deleted draft no longer appears in GET /api/procedures")
    
    def test_get_deleted_draft_returns_404(
        self, api_client, incharge_token, incharge_user_data, supervisor_user_data
    ):
        """
        Create a draft, delete it, verify GET /api/procedures/{id} returns 404.
        """
        test_date = get_future_weekday_date(8)
        test_time = "14:00"
        
        # Create a draft procedure
        procedure_data = {
            "patient_name": "TEST_DeleteDraft404_Patient",
            "registration_number": "TEST-DEL404-001",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-DEL404-001",
            "amount_paid": 4000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        draft_id = response.json()["id"]
        
        # Delete the draft
        response = api_client.delete(
            f"{BASE_URL}/api/procedures/{draft_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        
        # Verify GET /api/procedures/{id} returns 404
        response = api_client.get(
            f"{BASE_URL}/api/procedures/{draft_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 404, f"Expected 404 for deleted draft, got {response.status_code}"
        print(f"PASS: GET /api/procedures/{draft_id} returns 404 after deletion")


class TestProceduresSortOrder:
    """Bug Fix 3: GET /api/procedures should return latest cases first (sorted by created_at descending)"""
    
    def test_procedures_sorted_by_created_at_descending(
        self, api_client, incharge_token, incharge_user_data, supervisor_user_data
    ):
        """
        Create multiple procedures with slight delay, verify they're returned newest first.
        """
        created_ids = []
        
        # Create 3 procedures with slight delay between each
        for i in range(3):
            test_date = get_future_weekday_date(10 + i)
            procedure_data = {
                "patient_name": f"TEST_SortOrder_Patient{i+1}",
                "registration_number": f"TEST-SORT-00{i+1}",
                "supervisor_id": supervisor_user_data["id"],
                "supervisor_name": supervisor_user_data["name"],
                "implant_incharge_id": incharge_user_data["id"],
                "implant_incharge_name": incharge_user_data["name"],
                "receipt_number": f"TEST-REC-SORT-00{i+1}",
                "amount_paid": 1000.0 * (i + 1),
                "procedure_date": test_date,
                "procedure_time": "10:00",
                "implant_procedure_type": "Single Conventional Implant",
                "loading_type": ["Delayed Loading"],
                "prosthetic_plan": "Cement Retained Crown - Zirconia"
            }
            
            response = api_client.post(
                f"{BASE_URL}/api/procedures",
                json=procedure_data,
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
            assert response.status_code == 200, f"Procedure {i+1} creation failed: {response.text}"
            created_ids.append(response.json()["id"])
            print(f"Created procedure {i+1}: {created_ids[-1]}")
            time.sleep(0.5)  # Small delay to ensure different created_at timestamps
        
        # Get all procedures
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert response.status_code == 200
        procedures = response.json()
        
        # Filter to only our test procedures
        test_procs = [p for p in procedures if p["id"] in created_ids]
        assert len(test_procs) == 3, f"Expected 3 test procedures, found {len(test_procs)}"
        
        # Verify order: newest first (last created should be first in list)
        test_proc_ids = [p["id"] for p in test_procs]
        
        # The last created (created_ids[2]) should appear before the first created (created_ids[0])
        idx_first = test_proc_ids.index(created_ids[0]) if created_ids[0] in test_proc_ids else -1
        idx_last = test_proc_ids.index(created_ids[2]) if created_ids[2] in test_proc_ids else -1
        
        assert idx_last < idx_first, f"Newest procedure should appear before oldest. Order: {test_proc_ids}"
        print(f"PASS: Procedures sorted by created_at descending (newest first)")
        
        # Cleanup
        for proc_id in created_ids:
            api_client.delete(
                f"{BASE_URL}/api/procedures/{proc_id}",
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
    
    def test_procedures_with_status_filter_sorted_descending(
        self, api_client, incharge_token, incharge_user_data, supervisor_user_data
    ):
        """
        Verify sorting works with status filter (pending, completed, rejected).
        """
        # Get procedures with different status filters
        for status_filter in ["pending", "completed", "rejected"]:
            response = api_client.get(
                f"{BASE_URL}/api/procedures?status={status_filter}",
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
            assert response.status_code == 200, f"GET procedures with status={status_filter} failed"
            procedures = response.json()
            
            if len(procedures) >= 2:
                # Verify created_at is in descending order
                created_ats = [p.get("created_at", "") for p in procedures if p.get("created_at")]
                if len(created_ats) >= 2:
                    # Check that list is sorted descending
                    is_sorted_desc = all(created_ats[i] >= created_ats[i+1] for i in range(len(created_ats)-1))
                    assert is_sorted_desc, f"Procedures with status={status_filter} not sorted descending"
                    print(f"PASS: Procedures with status={status_filter} sorted descending")
                else:
                    print(f"SKIP: Not enough procedures with created_at for status={status_filter}")
            else:
                print(f"SKIP: Less than 2 procedures with status={status_filter}")


class TestStudentDraftSlotBypass:
    """Additional test: Student continuing their own draft should bypass slot conflict"""
    
    def test_student_own_draft_bypass(
        self, api_client, student_token, student_user_data, incharge_user_data, supervisor_user_data
    ):
        """
        Student creates a draft, then creates another on same slot.
        Should succeed (bypass own draft).
        """
        # Use a date far enough in future for student (>24 hours)
        test_date = get_future_weekday_date(15)
        test_time = "10:00"
        
        # Clean up any existing procedures on this slot first
        incharge_response = api_client.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        incharge_token_temp = incharge_response.json().get("access_token")
        
        response = api_client.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token_temp}"}
        )
        if response.status_code == 200:
            for proc in response.json():
                if proc.get("procedure_date") == test_date and proc.get("procedure_time") == test_time:
                    api_client.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {incharge_token_temp}"}
                    )
        
        # Student creates first draft
        procedure_data = {
            "patient_name": "TEST_StudentDraft_Patient1",
            "registration_number": "TEST-STDRAFT-001",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-STDRAFT-001",
            "amount_paid": 5000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert response.status_code == 200, f"Student draft creation failed: {response.text}"
        first_draft_id = response.json()["id"]
        print(f"Student created first draft: {first_draft_id}")
        
        # Student creates another on same slot - should succeed (bypass own draft)
        procedure_data2 = {
            "patient_name": "TEST_StudentDraft_Patient2",
            "registration_number": "TEST-STDRAFT-002",
            "supervisor_id": supervisor_user_data["id"],
            "supervisor_name": supervisor_user_data["name"],
            "implant_incharge_id": incharge_user_data["id"],
            "implant_incharge_name": incharge_user_data["name"],
            "receipt_number": "TEST-REC-STDRAFT-002",
            "amount_paid": 6000.0,
            "procedure_date": test_date,
            "procedure_time": test_time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response2 = api_client.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data2,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert response2.status_code == 200, f"Student second procedure should succeed (bypass own draft): {response2.text}"
        second_proc_id = response2.json()["id"]
        print(f"PASS: Student created second procedure on same slot (bypassed own draft): {second_proc_id}")
        
        # Cleanup using incharge
        api_client.delete(
            f"{BASE_URL}/api/procedures/{first_draft_id}",
            headers={"Authorization": f"Bearer {incharge_token_temp}"}
        )
        api_client.delete(
            f"{BASE_URL}/api/procedures/{second_proc_id}",
            headers={"Authorization": f"Bearer {incharge_token_temp}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
