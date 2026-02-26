"""
Comprehensive Backend API Tests for Dental Implant Management System
Testing 10 features from review request:
1. Dr. Abhijit Patil (implant_incharge) can create a new user
2. Dr. Abhijit Patil can delete a user
3. Sunday scheduling is blocked
4. Saturday scheduling only allows 9:30 AM time slot
5. Saturday scheduling with 9:30 AM works
6. All supervisors have role 'supervisor' not 'instructor'
7. Full Phase 1 -> Phase 2 workflow
8. Phase 2 approval succeeds when same person is both supervisor AND implant incharge
9. Student cannot approve procedures
10. Nurse cannot approve procedures
"""
import pytest
import requests
from datetime import datetime, timedelta
import os

# Use environment variable for BASE_URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-mgmt-1.preview.emergentagent.com"

# Test credentials
ABHIJIT_EMAIL = "abhijit.patil@dental.edu"
ABHIJIT_PASSWORD = "Admin@123"
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"
NURSE_EMAIL = "nurse1@dental.edu"
NURSE_PASSWORD = "Nurse@123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def abhijit_token(api_client):
    """Get Dr. Abhijit Patil's token (implant_incharge role)"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ABHIJIT_EMAIL,
        "password": ABHIJIT_PASSWORD
    })
    assert response.status_code == 200, f"Abhijit login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def student_token(api_client):
    """Get student token (Gaurav Pandey)"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD
    })
    assert response.status_code == 200, f"Student login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def nurse_token(api_client):
    """Get nurse token (Nurse 1)"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": NURSE_EMAIL,
        "password": NURSE_PASSWORD
    })
    assert response.status_code == 200, f"Nurse login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def abhijit_user_id(api_client, abhijit_token):
    """Get Dr. Abhijit Patil's user ID"""
    response = api_client.get(
        f"{BASE_URL}/api/users",
        headers={"Authorization": f"Bearer {abhijit_token}"}
    )
    assert response.status_code == 200
    users = response.json()
    for user in users:
        if user["email"] == ABHIJIT_EMAIL:
            return user["id"]
    pytest.fail("Dr. Abhijit Patil not found in users list")


class TestUserManagement:
    """Test 1-2: Dr. Abhijit Patil (implant_incharge) user management"""
    
    def test_01_abhijit_can_create_user(self, api_client, abhijit_token):
        """Test 1: Dr. Abhijit Patil (implant_incharge) can create a new user (POST /api/users)"""
        test_email = f"test_user_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {abhijit_token}"},
            json={
                "name": "TEST_Created User",
                "email": test_email,
                "password": "TestPass@123",
                "role": "student"
            }
        )
        
        print(f"Create user response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"User creation failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain user id"
        assert "message" in data, "Response should contain success message"
        
        # Store the created user ID for deletion test
        pytest.created_user_id = data["id"]
        print(f"✅ Test 1 PASSED: Dr. Abhijit Patil successfully created user with ID: {data['id']}")
    
    def test_02_abhijit_can_delete_user(self, api_client, abhijit_token):
        """Test 2: Dr. Abhijit Patil can delete a user (DELETE /api/users/{id})"""
        # Use the user created in test_01
        if not hasattr(pytest, 'created_user_id'):
            pytest.skip("No user was created in previous test")
        
        user_id = pytest.created_user_id
        
        response = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {abhijit_token}"}
        )
        
        print(f"Delete user response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"User deletion failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain success message"
        print(f"✅ Test 2 PASSED: Dr. Abhijit Patil successfully deleted user with ID: {user_id}")


class TestSchedulingRestrictions:
    """Tests 3-5: Sunday blocked, Saturday only 9:30 AM"""
    
    def test_03_sunday_scheduling_blocked(self, api_client, student_token, abhijit_user_id):
        """Test 3: Sunday scheduling is blocked (POST /api/procedures with Sunday date should return 400)"""
        # Find next Sunday
        today = datetime.now()
        days_until_sunday = (6 - today.weekday()) % 7
        if days_until_sunday == 0:
            days_until_sunday = 7
        next_sunday = today + timedelta(days=days_until_sunday)
        sunday_date = next_sunday.strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Sunday Patient",
                "registration_number": "REG_SUN001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_SUN001",
                "amount_paid": 50000.0,
                "procedure_date": sunday_date,
                "procedure_time": "10:00",
                "implant_specifications": "Test Implant Spec",
                "bone_graft_specifications": "Test Bone Graft Spec"
            }
        )
        
        print(f"Sunday scheduling response: {response.status_code} - {response.text}")
        
        assert response.status_code == 400, f"Sunday scheduling should be blocked with 400 error, got {response.status_code}"
        assert "sunday" in response.text.lower() or "no scheduling" in response.text.lower(), \
            "Error message should mention Sunday restriction"
        print(f"✅ Test 3 PASSED: Sunday scheduling correctly blocked for date {sunday_date}")
    
    def test_04_saturday_wrong_time_blocked(self, api_client, student_token, abhijit_user_id):
        """Test 4: Saturday scheduling only allows 9:30 AM (POST /api/procedures with Saturday + 10:00 should return 400)"""
        # Find next Saturday
        today = datetime.now()
        days_until_saturday = (5 - today.weekday()) % 7
        if days_until_saturday == 0:
            days_until_saturday = 7
        next_saturday = today + timedelta(days=days_until_saturday)
        saturday_date = next_saturday.strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Saturday Wrong Time Patient",
                "registration_number": "REG_SAT001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_SAT001",
                "amount_paid": 50000.0,
                "procedure_date": saturday_date,
                "procedure_time": "10:00",  # Wrong time - should only allow 09:30
                "implant_specifications": "Test Implant Spec",
                "bone_graft_specifications": "Test Bone Graft Spec"
            }
        )
        
        print(f"Saturday 10:00 response: {response.status_code} - {response.text}")
        
        assert response.status_code == 400, f"Saturday 10:00 should be blocked with 400 error, got {response.status_code}"
        assert "9:30" in response.text or "saturday" in response.text.lower(), \
            "Error message should mention 9:30 AM restriction"
        print(f"✅ Test 4 PASSED: Saturday 10:00 AM correctly blocked for date {saturday_date}")
    
    def test_05_saturday_correct_time_works(self, api_client, student_token, abhijit_user_id):
        """Test 5: Saturday scheduling with 9:30 AM works (POST /api/procedures with Saturday + 09:30 should succeed)"""
        # Find next Saturday
        today = datetime.now()
        days_until_saturday = (5 - today.weekday()) % 7
        if days_until_saturday == 0:
            days_until_saturday = 7
        next_saturday = today + timedelta(days=days_until_saturday)
        saturday_date = next_saturday.strftime("%Y-%m-%d")
        
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Saturday Correct Time Patient",
                "registration_number": "REG_SAT002",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_SAT002",
                "amount_paid": 50000.0,
                "procedure_date": saturday_date,
                "procedure_time": "09:30",  # Correct time for Saturday
                "implant_specifications": "Test Implant Spec",
                "bone_graft_specifications": "Test Bone Graft Spec"
            }
        )
        
        print(f"Saturday 09:30 response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Saturday 09:30 should work, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain procedure id"
        pytest.saturday_procedure_id = data["id"]
        print(f"✅ Test 5 PASSED: Saturday 09:30 AM procedure created successfully with ID: {data['id']}")


class TestSupervisorRoles:
    """Test 6: All supervisors have role 'supervisor' not 'instructor'"""
    
    def test_06_supervisors_have_correct_role(self, api_client, abhijit_token):
        """Test 6: All supervisors (Dr. Rajeshree Jadhav, Dr. Vasantha N, Dr. Rupali Patil, Dr. Pankaj Kadam) have role 'supervisor' not 'instructor'"""
        response = api_client.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {abhijit_token}"}
        )
        
        assert response.status_code == 200
        users = response.json()
        
        expected_supervisors = [
            "Dr. Rajeshree Jadhav",
            "Dr. Vasantha N",
            "Dr. Rupali Patil",
            "Dr. Pankaj Kadam"
        ]
        
        found_supervisors = []
        incorrect_roles = []
        
        for user in users:
            if user["name"] in expected_supervisors:
                found_supervisors.append(user["name"])
                if user["role"] != "supervisor":
                    incorrect_roles.append(f"{user['name']}: {user['role']}")
        
        print(f"Found supervisors: {found_supervisors}")
        print(f"Incorrect roles: {incorrect_roles}")
        
        # Check all expected supervisors were found
        assert len(found_supervisors) == len(expected_supervisors), \
            f"Expected {len(expected_supervisors)} supervisors, found {len(found_supervisors)}"
        
        # Check no supervisor has 'instructor' role
        assert len(incorrect_roles) == 0, \
            f"Some supervisors have incorrect roles: {incorrect_roles}"
        
        # Verify no 'instructor' role exists in the system
        instructors = [u for u in users if u["role"] == "instructor"]
        assert len(instructors) == 0, f"Found users with 'instructor' role: {instructors}"
        
        print(f"✅ Test 6 PASSED: All {len(found_supervisors)} supervisors have role 'supervisor', no 'instructor' roles found")


class TestFullWorkflow:
    """Tests 7-8: Complete Phase 1 -> Phase 2 workflow and auto-approve"""
    
    def test_07_full_phase1_to_phase2_workflow(self, api_client, student_token, abhijit_token, abhijit_user_id):
        """Test 7: Full Phase 1 -> Phase 2 workflow: create procedure, Phase 1 approval, submit phase 2, Phase 2 approval"""
        # Step 1: Create procedure with a weekday date
        today = datetime.now()
        # Find next Wednesday (weekday)
        days_until_wednesday = (2 - today.weekday()) % 7
        if days_until_wednesday <= 1:
            days_until_wednesday += 7
        procedure_date = (today + timedelta(days=days_until_wednesday)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Full Workflow Patient",
                "registration_number": "REG_WORKFLOW001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_WORKFLOW001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "10:00",
                "implant_specifications": "Test Implant Spec for Full Workflow",
                "bone_graft_specifications": "Test Bone Graft Spec for Full Workflow",
                "checklist": {
                    "pre_surgical": {
                        "items": [
                            {"id": "1", "label": "Case Selection Approved", "value": True},
                            {"id": "2", "label": "Academic Readiness", "value": True}
                        ],
                        "additional_fields": {}
                    }
                }
            }
        )
        
        print(f"Create procedure response: {create_response.status_code}")
        assert create_response.status_code == 200, f"Procedure creation failed: {create_response.text}"
        
        procedure_id = create_response.json()["id"]
        assert create_response.json()["status"] == "pending_phase1"
        print(f"Step 1: Procedure created with ID {procedure_id}, status: pending_phase1")
        
        # Step 2: Phase 1 approval (by Dr. Abhijit who is both supervisor AND implant_incharge)
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {abhijit_token}"},
            json={"action": "approve"}
        )
        
        print(f"Phase 1 approval response: {approve_response.status_code}")
        assert approve_response.status_code == 200, f"Phase 1 approval failed: {approve_response.text}"
        
        approval_data = approve_response.json()
        assert approval_data["status"] == "phase1_approved", f"Status should be phase1_approved, got {approval_data['status']}"
        assert approval_data["supervisor_phase1_approved"] == True
        assert approval_data["implant_incharge_phase1_approved"] == True
        print(f"Step 2: Phase 1 approved, status: phase1_approved")
        
        # Step 3: Submit Phase 2
        phase2_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "checklist_surgical": {
                    "items": [
                        {"id": "1", "label": "Surgical Item 1", "value": True},
                        {"id": "2", "label": "Surgical Item 2", "value": True}
                    ],
                    "additional_fields": {}
                },
                "remark": "Surgery completed successfully"
            }
        )
        
        print(f"Phase 2 submit response: {phase2_response.status_code}")
        assert phase2_response.status_code == 200, f"Phase 2 submission failed: {phase2_response.text}"
        
        phase2_data = phase2_response.json()
        assert phase2_data["status"] == "pending_phase2"
        print(f"Step 3: Phase 2 submitted, status: pending_phase2")
        
        # Step 4: Phase 2 approval
        phase2_approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {abhijit_token}"},
            json={"action": "approve"}
        )
        
        print(f"Phase 2 approval response: {phase2_approve_response.status_code}")
        assert phase2_approve_response.status_code == 200, f"Phase 2 approval failed: {phase2_approve_response.text}"
        
        final_data = phase2_approve_response.json()
        assert final_data["status"] == "phase2_approved", f"Final status should be phase2_approved, got {final_data['status']}"
        assert final_data["supervisor_phase2_approved"] == True
        assert final_data["implant_incharge_phase2_approved"] == True
        
        print(f"✅ Test 7 PASSED: Full workflow completed successfully!")
        print(f"   - Procedure ID: {procedure_id}")
        print(f"   - Final status: phase2_approved")
        print(f"   - All phase approvals verified")
    
    def test_08_auto_approve_same_person_both_roles(self, api_client, student_token, abhijit_token, abhijit_user_id):
        """Test 8: Phase 2 approval succeeds when Dr. Abhijit Patil is both supervisor AND implant incharge (auto-approve)"""
        # Create procedure with Dr. Abhijit as BOTH supervisor AND implant_incharge
        today = datetime.now()
        days_until_thursday = (3 - today.weekday()) % 7
        if days_until_thursday <= 1:
            days_until_thursday += 7
        procedure_date = (today + timedelta(days=days_until_thursday)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Auto Approve Patient",
                "registration_number": "REG_AUTOAPPROVE001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,  # Same person
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_AUTOAPPROVE001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "11:00",
                "implant_specifications": "Test Auto Approve Implant Spec",
                "bone_graft_specifications": "Test Auto Approve Bone Graft Spec"
            }
        )
        
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Single approval should set both flags due to auto-approve
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {abhijit_token}"},
            json={"action": "approve"}
        )
        
        print(f"Auto-approve response: {approve_response.status_code} - {approve_response.text}")
        
        assert approve_response.status_code == 200
        data = approve_response.json()
        
        # Both flags should be set to True with single approval
        assert data["supervisor_phase1_approved"] == True, "supervisor_phase1_approved should be True"
        assert data["implant_incharge_phase1_approved"] == True, "implant_incharge_phase1_approved should be True"
        assert data["status"] == "phase1_approved", f"Status should be phase1_approved, got {data['status']}"
        
        print(f"✅ Test 8 PASSED: Auto-approve works when same person is both supervisor AND implant incharge")
        print(f"   - Single approval set both supervisor_phase1_approved AND implant_incharge_phase1_approved to True")
        print(f"   - Status correctly changed to phase1_approved")


class TestApprovalRestrictions:
    """Tests 9-10: Student and Nurse cannot approve procedures"""
    
    def test_09_student_cannot_approve(self, api_client, student_token, abhijit_token, abhijit_user_id):
        """Test 9: Student cannot approve procedures (should return 403)"""
        # First, create a procedure
        today = datetime.now()
        days_until_friday = (4 - today.weekday()) % 7
        if days_until_friday <= 1:
            days_until_friday += 7
        procedure_date = (today + timedelta(days=days_until_friday)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Student Approve Test",
                "registration_number": "REG_STUAPPROVE001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_STUAPPROVE001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "14:00",
                "implant_specifications": "Test Student Approve Implant Spec",
                "bone_graft_specifications": "Test Student Approve Bone Graft Spec"
            }
        )
        
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Try to approve as student
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"action": "approve"}
        )
        
        print(f"Student approve response: {approve_response.status_code} - {approve_response.text}")
        
        assert approve_response.status_code == 403, f"Student should get 403, got {approve_response.status_code}"
        print(f"✅ Test 9 PASSED: Student correctly blocked from approving procedures (403)")
    
    def test_10_nurse_cannot_approve(self, api_client, nurse_token, student_token, abhijit_token, abhijit_user_id):
        """Test 10: Nurse cannot approve procedures (should return 403)"""
        # First, create a procedure and get it approved to phase1 so nurse can see it
        today = datetime.now()
        days_until_monday = (0 - today.weekday()) % 7
        if days_until_monday <= 1:
            days_until_monday += 7
        procedure_date = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
        
        create_response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Nurse Approve Test",
                "registration_number": "REG_NURSEAPPROVE001",
                "supervisor_id": abhijit_user_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": abhijit_user_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_NURSEAPPROVE001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "09:00",
                "implant_specifications": "Test Nurse Approve Implant Spec",
                "bone_graft_specifications": "Test Nurse Approve Bone Graft Spec"
            }
        )
        
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Try to approve as nurse
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {nurse_token}"},
            json={"action": "approve"}
        )
        
        print(f"Nurse approve response: {approve_response.status_code} - {approve_response.text}")
        
        assert approve_response.status_code == 403, f"Nurse should get 403, got {approve_response.status_code}"
        print(f"✅ Test 10 PASSED: Nurse correctly blocked from approving procedures (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
