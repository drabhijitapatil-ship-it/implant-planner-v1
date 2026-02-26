"""
Iteration 2: Backend API Tests for Dental Implant Management System
Testing:
1-7: Login with all 7 specified user credentials
8: POST /api/auth/push-token endpoint registers push token successfully
9: Creating a procedure triggers push notification helper (no crash, returns 200)
10: Phase 2 submission still works correctly
11: Approval endpoint still works correctly
12: Nurse gets 403 when trying to approve
"""
import pytest
import requests
from datetime import datetime, timedelta
import os

# Use environment variable for BASE_URL
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-mgmt-1.preview.emergentagent.com"

# All test credentials from setup_users.py
TEST_CREDENTIALS = [
    # 1. Implant Incharge
    {"role": "implant_incharge", "email": "abhijit.patil@dental.edu", "password": "Admin@123", "name": "Dr. Abhijit Patil"},
    # 2. Administrator
    {"role": "administrator", "email": "ajay.sabane@dental.edu", "password": "Admin@123", "name": "Dr. Ajay Sabane"},
    # 3. Supervisor 1
    {"role": "supervisor", "email": "rajeshree.jadhav@dental.edu", "password": "Supervisor@123", "name": "Dr. Rajeshree Jadhav"},
    # 4. Supervisor 2
    {"role": "supervisor", "email": "vasantha.n@dental.edu", "password": "Supervisor@123", "name": "Dr. Vasantha N"},
    # 5. Student
    {"role": "student", "email": "gaurav.pandey@student.dental.edu", "password": "Student@123", "name": "Dr. Gaurav Pandey"},
    # 6. Nurse 1
    {"role": "nurse", "email": "priya.sharma@dental.edu", "password": "Nurse@123", "name": "Nurse Priya Sharma"},
    # 7. Nurse 2
    {"role": "nurse", "email": "anjali.desai@dental.edu", "password": "Nurse@123", "name": "Nurse Anjali Desai"},
]


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestUserLogins:
    """Tests 1-7: Login with all specified credentials"""

    def test_01_login_implant_incharge(self, api_client):
        """Test 1: Login with Implant Incharge - abhijit.patil@dental.edu / Admin@123"""
        cred = TEST_CREDENTIALS[0]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_02_login_administrator(self, api_client):
        """Test 2: Login with Administrator - ajay.sabane@dental.edu / Admin@123"""
        cred = TEST_CREDENTIALS[1]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_03_login_supervisor_1(self, api_client):
        """Test 3: Login with Supervisor 1 - rajeshree.jadhav@dental.edu / Supervisor@123"""
        cred = TEST_CREDENTIALS[2]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_04_login_supervisor_2(self, api_client):
        """Test 4: Login with Supervisor 2 - vasantha.n@dental.edu / Supervisor@123"""
        cred = TEST_CREDENTIALS[3]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_05_login_student(self, api_client):
        """Test 5: Login with Student - gaurav.pandey@student.dental.edu / Student@123"""
        cred = TEST_CREDENTIALS[4]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_06_login_nurse_1(self, api_client):
        """Test 6: Login with Nurse 1 - priya.sharma@dental.edu / Nurse@123"""
        cred = TEST_CREDENTIALS[5]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")

    def test_07_login_nurse_2(self, api_client):
        """Test 7: Login with Nurse 2 - anjali.desai@dental.edu / Nurse@123"""
        cred = TEST_CREDENTIALS[6]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": cred["email"],
            "password": cred["password"]
        })
        
        print(f"Login {cred['role']}: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == cred["email"], f"Email mismatch"
        assert data["user"]["role"] == cred["role"], f"Expected role {cred['role']}, got {data['user']['role']}"
        assert data["user"]["name"] == cred["name"], f"Expected name {cred['name']}, got {data['user']['name']}"
        
        print(f"PASSED: Login {cred['name']} ({cred['role']}) successful")


class TestPushTokenEndpoint:
    """Test 8: Push token registration endpoint"""

    def test_08_push_token_registration(self, api_client):
        """Test 8: POST /api/auth/push-token registers push token successfully"""
        # First login to get a token
        login_response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[4]["email"],  # Student
            "password": TEST_CREDENTIALS[4]["password"]
        })
        assert login_response.status_code == 200
        auth_token = login_response.json()["token"]
        
        # Test push token registration with a mock Expo push token
        mock_expo_token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxxx]"
        
        response = api_client.post(
            f"{BASE_URL}/api/auth/push-token",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"push_token": mock_expo_token}
        )
        
        print(f"Push token registration: {response.status_code} - {response.text}")
        
        assert response.status_code == 200, f"Push token registration failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert data["message"] == "Push token registered", f"Unexpected message: {data['message']}"
        
        print(f"PASSED: Push token registered successfully")


class TestProcedureWithPushNotifications:
    """Tests 9-11: Procedure creation triggers push notifications, Phase 2, Approval"""

    def test_09_create_procedure_triggers_push_no_crash(self, api_client):
        """Test 9: Creating a procedure triggers push notification helper (no crash, returns 200)"""
        # Login as student
        student_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[4]["email"],
            "password": TEST_CREDENTIALS[4]["password"]
        })
        assert student_login.status_code == 200
        student_token = student_login.json()["token"]
        
        # Login as implant incharge to get user ID
        incharge_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[0]["email"],
            "password": TEST_CREDENTIALS[0]["password"]
        })
        assert incharge_login.status_code == 200
        incharge_token = incharge_login.json()["token"]
        incharge_id = incharge_login.json()["user"]["id"]
        
        # Find a valid weekday date (>24 hours from now)
        today = datetime.now()
        days_ahead = 3
        future_date = today + timedelta(days=days_ahead)
        # Skip weekends
        while future_date.weekday() >= 5:  # Saturday or Sunday
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        # Create procedure - should trigger push notifications but not crash
        response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Push_Notification_Patient",
                "registration_number": "REG_PUSH001",
                "supervisor_id": incharge_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": incharge_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_PUSH001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "10:00",
                "implant_specifications": "Test Implant Spec for Push Test",
                "bone_graft_specifications": "Test Bone Graft Spec for Push Test"
            }
        )
        
        print(f"Create procedure response: {response.status_code}")
        
        assert response.status_code == 200, f"Procedure creation failed (push notification may have crashed): {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain procedure id"
        
        # Store for later tests
        pytest.test_procedure_id = data["id"]
        pytest.incharge_token = incharge_token
        pytest.student_token = student_token
        
        print(f"PASSED: Procedure created successfully with push notifications (ID: {data['id']})")

    def test_10_phase2_submission_works(self, api_client):
        """Test 10: Phase 2 submission still works correctly"""
        if not hasattr(pytest, 'test_procedure_id'):
            pytest.skip("No procedure created in previous test")
        
        procedure_id = pytest.test_procedure_id
        incharge_token = pytest.incharge_token
        student_token = pytest.student_token
        
        # First approve Phase 1 as implant incharge
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {incharge_token}"},
            json={"action": "approve"}
        )
        
        print(f"Phase 1 approval: {approve_response.status_code}")
        assert approve_response.status_code == 200, f"Phase 1 approval failed: {approve_response.text}"
        
        approval_data = approve_response.json()
        assert approval_data["status"] == "phase1_approved", f"Status should be phase1_approved, got {approval_data['status']}"
        
        # Now submit Phase 2 as student
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
                "remark": "Surgery completed for push notification test"
            }
        )
        
        print(f"Phase 2 submit: {phase2_response.status_code}")
        assert phase2_response.status_code == 200, f"Phase 2 submission failed: {phase2_response.text}"
        
        phase2_data = phase2_response.json()
        assert phase2_data["status"] == "pending_phase2", f"Status should be pending_phase2, got {phase2_data['status']}"
        
        print(f"PASSED: Phase 2 submission works correctly")

    def test_11_approval_endpoint_works(self, api_client):
        """Test 11: Approval endpoint still works correctly"""
        if not hasattr(pytest, 'test_procedure_id'):
            pytest.skip("No procedure created in previous test")
        
        procedure_id = pytest.test_procedure_id
        incharge_token = pytest.incharge_token
        
        # Approve Phase 2 - this should also trigger push notifications
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {incharge_token}"},
            json={"action": "approve"}
        )
        
        print(f"Phase 2 approval: {approve_response.status_code}")
        assert approve_response.status_code == 200, f"Phase 2 approval failed: {approve_response.text}"
        
        approval_data = approve_response.json()
        assert approval_data["status"] == "phase2_approved", f"Status should be phase2_approved, got {approval_data['status']}"
        assert approval_data["supervisor_phase2_approved"] == True
        assert approval_data["implant_incharge_phase2_approved"] == True
        
        print(f"PASSED: Approval endpoint works correctly, procedure fully approved")


class TestNurseApprovalRestriction:
    """Test 12: Nurse cannot approve procedures"""

    def test_12_nurse_cannot_approve(self, api_client):
        """Test 12: Nurse should get 403 when trying to approve"""
        # Login as student to create procedure
        student_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[4]["email"],
            "password": TEST_CREDENTIALS[4]["password"]
        })
        assert student_login.status_code == 200
        student_token = student_login.json()["token"]
        
        # Login as implant incharge to get user ID
        incharge_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[0]["email"],
            "password": TEST_CREDENTIALS[0]["password"]
        })
        assert incharge_login.status_code == 200
        incharge_id = incharge_login.json()["user"]["id"]
        
        # Login as nurse
        nurse_login = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_CREDENTIALS[5]["email"],  # Nurse Priya
            "password": TEST_CREDENTIALS[5]["password"]
        })
        assert nurse_login.status_code == 200
        nurse_token = nurse_login.json()["token"]
        
        # Find a valid weekday date
        today = datetime.now()
        days_ahead = 5
        future_date = today + timedelta(days=days_ahead)
        while future_date.weekday() >= 5:
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        # Create procedure as student
        create_response = api_client.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "student_name": "Dr. Gaurav Pandey",
                "patient_name": "TEST_Nurse_Approval_Test",
                "registration_number": "REG_NURSE_TEST001",
                "supervisor_id": incharge_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": incharge_id,
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16",
                "receipt_number": "REC_NURSE_TEST001",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": "11:00",
                "implant_specifications": "Test Implant Spec for Nurse Test",
                "bone_graft_specifications": "Test Bone Graft Spec for Nurse Test"
            }
        )
        
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # Try to approve as nurse - should get 403
        approve_response = api_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {nurse_token}"},
            json={"action": "approve"}
        )
        
        print(f"Nurse approve attempt: {approve_response.status_code} - {approve_response.text}")
        
        assert approve_response.status_code == 403, f"Nurse should get 403, got {approve_response.status_code}"
        
        print(f"PASSED: Nurse correctly blocked from approving procedures (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
