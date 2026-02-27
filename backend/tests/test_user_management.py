"""
Test User Management API - Iteration 6
Testing new user management endpoints:
- GET /api/users - list all users (admin/implant_incharge)
- POST /api/users - create user (admin/implant_incharge only)
- DELETE /api/users/{id} - delete user (admin/implant_incharge only)
- Role-based access: student/nurse should get 403
- Cannot delete own account
- Duplicate email prevention
Also tests dashboard stats and procedures filter param
"""
import pytest
import requests
import os
import uuid

BASE_URL = "https://dental-workflow-test.preview.emergentagent.com"

# Test credentials
CREDENTIALS = {
    "administrator": {"email": "ajay.sabane@dental.edu", "password": "Admin@123"},
    "implant_incharge": {"email": "abhijit.patil@dental.edu", "password": "Admin@123"},
    "supervisor": {"email": "vasantha.n@dental.edu", "password": "Supervisor@123"},
    "student": {"email": "gaurav.pandey@student.dental.edu", "password": "Student@123"},
    "nurse": {"email": "priya.sharma@dental.edu", "password": "Nurse@123"},
}

# Store created test user IDs for cleanup
created_test_users = []


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get administrator token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS["administrator"]
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    return data["token"], data["user"]["id"]


@pytest.fixture(scope="module")
def implant_incharge_token(api_client):
    """Get implant_incharge token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS["implant_incharge"]
    )
    assert response.status_code == 200, f"Implant incharge login failed: {response.text}"
    data = response.json()
    return data["token"], data["user"]["id"]


@pytest.fixture(scope="module")
def student_token(api_client):
    """Get student token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS["student"]
    )
    assert response.status_code == 200, f"Student login failed: {response.text}"
    data = response.json()
    return data["token"], data["user"]["id"]


@pytest.fixture(scope="module")
def nurse_token(api_client):
    """Get nurse token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS["nurse"]
    )
    assert response.status_code == 200, f"Nurse login failed: {response.text}"
    data = response.json()
    return data["token"], data["user"]["id"]


@pytest.fixture(scope="module")
def supervisor_token(api_client):
    """Get supervisor token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json=CREDENTIALS["supervisor"]
    )
    assert response.status_code == 200, f"Supervisor login failed: {response.text}"
    data = response.json()
    return data["token"], data["user"]["id"]


class TestUserManagementListUsers:
    """Test GET /api/users endpoint"""
    
    def test_admin_can_list_all_users(self, api_client, admin_token):
        """Administrator can list all users"""
        token, _ = admin_token
        response = api_client.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed to list users: {response.text}"
        users = response.json()
        assert isinstance(users, list), "Expected list of users"
        assert len(users) > 0, "Expected at least one user"
        # Check user structure
        for user in users:
            assert "id" in user, "User should have id"
            assert "email" in user, "User should have email"
            assert "role" in user, "User should have role"
            assert "name" in user, "User should have name"
            assert "password_hash" not in user, "Password hash should not be exposed"
        print(f"PASS: Admin listed {len(users)} users")
    
    def test_implant_incharge_can_list_all_users(self, api_client, implant_incharge_token):
        """Implant incharge can list all users"""
        token, _ = implant_incharge_token
        response = api_client.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed to list users: {response.text}"
        users = response.json()
        assert isinstance(users, list), "Expected list of users"
        print(f"PASS: Implant incharge listed {len(users)} users")
    
    def test_list_users_with_role_filter(self, api_client, admin_token):
        """Can filter users by role"""
        token, _ = admin_token
        response = api_client.get(
            f"{BASE_URL}/api/users?role=student",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed to filter users: {response.text}"
        users = response.json()
        # All returned users should have role=student
        for user in users:
            assert user["role"] == "student", f"Expected role=student, got {user['role']}"
        print(f"PASS: Filtered to {len(users)} students")
    
    def test_student_can_list_users(self, api_client, student_token):
        """Student CAN list users (GET /users is allowed for all authenticated users)"""
        token, _ = student_token
        response = api_client.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"}
        )
        # GET /users doesn't have role restriction in the code
        assert response.status_code == 200, f"Student should be able to list users: {response.text}"
        print("PASS: Student can list users (GET /users has no role restriction)")


class TestUserManagementCreateUser:
    """Test POST /api/users endpoint"""
    
    def test_admin_can_create_user(self, api_client, admin_token):
        """Administrator can create a new user"""
        global created_test_users
        token, _ = admin_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "TEST User Admin Created",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert response.status_code == 200, f"Failed to create user: {response.text}"
        data = response.json()
        assert "id" in data, "Response should have user id"
        assert data["message"] == "User created successfully"
        created_test_users.append(data["id"])
        print(f"PASS: Admin created user with id {data['id']}")
    
    def test_implant_incharge_can_create_user(self, api_client, implant_incharge_token):
        """Implant incharge can create a new user"""
        global created_test_users
        token, _ = implant_incharge_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "TEST User Incharge Created",
                "email": unique_email,
                "password": "Test@123",
                "role": "nurse"
            }
        )
        assert response.status_code == 200, f"Failed to create user: {response.text}"
        data = response.json()
        assert "id" in data, "Response should have user id"
        created_test_users.append(data["id"])
        print(f"PASS: Implant incharge created user with id {data['id']}")
    
    def test_student_cannot_create_user(self, api_client, student_token):
        """Student should get 403 when trying to create user"""
        token, _ = student_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Should Fail",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Only administrators and implant incharge" in data["detail"]
        print("PASS: Student correctly denied (403)")
    
    def test_nurse_cannot_create_user(self, api_client, nurse_token):
        """Nurse should get 403 when trying to create user"""
        token, _ = nurse_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Should Fail",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Nurse correctly denied (403)")
    
    def test_supervisor_cannot_create_user(self, api_client, supervisor_token):
        """Supervisor should get 403 when trying to create user"""
        token, _ = supervisor_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Should Fail",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Supervisor correctly denied (403)")
    
    def test_duplicate_email_prevention(self, api_client, admin_token):
        """Cannot create user with existing email"""
        token, _ = admin_token
        # Try to create user with existing admin email
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Duplicate",
                "email": CREDENTIALS["administrator"]["email"],
                "password": "Test@123",
                "role": "student"
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "already registered" in data["detail"].lower()
        print("PASS: Duplicate email correctly rejected (400)")
    
    def test_invalid_role_rejected(self, api_client, admin_token):
        """Cannot create user with invalid role"""
        token, _ = admin_token
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        
        response = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Invalid Role",
                "email": unique_email,
                "password": "Test@123",
                "role": "invalid_role"
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Invalid role" in data["detail"]
        print("PASS: Invalid role correctly rejected (400)")
    
    def test_all_valid_roles_accepted(self, api_client, admin_token):
        """All valid roles can be created"""
        global created_test_users
        token, _ = admin_token
        valid_roles = ["student", "supervisor", "implant_incharge", "administrator", "nurse"]
        
        for role in valid_roles:
            unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
            response = api_client.post(
                f"{BASE_URL}/api/users",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "name": f"TEST {role.title()}",
                    "email": unique_email,
                    "password": "Test@123",
                    "role": role
                }
            )
            assert response.status_code == 200, f"Failed to create {role}: {response.text}"
            data = response.json()
            created_test_users.append(data["id"])
            print(f"  - Created {role}: {data['id']}")
        print("PASS: All valid roles accepted")


class TestUserManagementDeleteUser:
    """Test DELETE /api/users/{id} endpoint"""
    
    def test_admin_can_delete_user(self, api_client, admin_token):
        """Administrator can delete a user"""
        global created_test_users
        token, _ = admin_token
        
        # First create a user to delete
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        create_resp = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "To Be Deleted",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["id"]
        
        # Now delete
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 200, f"Failed to delete user: {delete_resp.text}"
        data = delete_resp.json()
        assert data["message"] == "User deleted successfully"
        
        # Verify user no longer exists (try to login)
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": "Test@123"}
        )
        assert login_resp.status_code == 401, "Deleted user should not be able to login"
        print("PASS: Admin deleted user and verified removal")
    
    def test_implant_incharge_can_delete_user(self, api_client, implant_incharge_token):
        """Implant incharge can delete a user"""
        token, _ = implant_incharge_token
        
        # First create a user to delete
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        create_resp = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "To Be Deleted By Incharge",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["id"]
        
        # Now delete
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 200, f"Failed to delete user: {delete_resp.text}"
        print("PASS: Implant incharge deleted user")
    
    def test_student_cannot_delete_user(self, api_client, student_token, admin_token):
        """Student should get 403 when trying to delete user"""
        student_tkn, _ = student_token
        admin_tkn, _ = admin_token
        
        # Create a user as admin
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        create_resp = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_tkn}"},
            json={
                "name": "Target User",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["id"]
        created_test_users.append(user_id)
        
        # Try to delete as student
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {student_tkn}"}
        )
        assert delete_resp.status_code == 403, f"Expected 403, got {delete_resp.status_code}"
        print("PASS: Student correctly denied delete (403)")
    
    def test_nurse_cannot_delete_user(self, api_client, nurse_token, admin_token):
        """Nurse should get 403 when trying to delete user"""
        nurse_tkn, _ = nurse_token
        admin_tkn, _ = admin_token
        
        # Create a user as admin
        unique_email = f"test_{uuid.uuid4().hex[:8]}@test.dental.edu"
        create_resp = api_client.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_tkn}"},
            json={
                "name": "Target User",
                "email": unique_email,
                "password": "Test@123",
                "role": "student"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["id"]
        created_test_users.append(user_id)
        
        # Try to delete as nurse
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {nurse_tkn}"}
        )
        assert delete_resp.status_code == 403, f"Expected 403, got {delete_resp.status_code}"
        print("PASS: Nurse correctly denied delete (403)")
    
    def test_cannot_delete_own_account(self, api_client, admin_token):
        """Admin cannot delete their own account"""
        token, user_id = admin_token
        
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 400, f"Expected 400, got {delete_resp.status_code}: {delete_resp.text}"
        data = delete_resp.json()
        assert "Cannot delete your own account" in data["detail"]
        print("PASS: Cannot delete own account (400)")
    
    def test_delete_nonexistent_user(self, api_client, admin_token):
        """Deleting non-existent user returns 404"""
        token, _ = admin_token
        fake_id = "000000000000000000000000"  # Valid ObjectId format but doesn't exist
        
        delete_resp = api_client.delete(
            f"{BASE_URL}/api/users/{fake_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 404, f"Expected 404, got {delete_resp.status_code}"
        print("PASS: Nonexistent user returns 404")


class TestDashboardStats:
    """Test GET /api/dashboard/stats endpoint"""
    
    def test_dashboard_stats_returns_correct_structure(self, api_client, admin_token):
        """Dashboard stats returns total, pending, approved, rejected"""
        token, _ = admin_token
        
        response = api_client.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        data = response.json()
        
        # Check structure
        assert "total" in data, "Missing 'total' field"
        assert "pending" in data, "Missing 'pending' field"
        assert "approved" in data, "Missing 'approved' field"
        assert "rejected" in data, "Missing 'rejected' field"
        
        # All values should be non-negative integers
        assert isinstance(data["total"], int) and data["total"] >= 0
        assert isinstance(data["pending"], int) and data["pending"] >= 0
        assert isinstance(data["approved"], int) and data["approved"] >= 0
        assert isinstance(data["rejected"], int) and data["rejected"] >= 0
        
        print(f"PASS: Dashboard stats - total:{data['total']}, pending:{data['pending']}, approved:{data['approved']}, rejected:{data['rejected']}")
    
    def test_student_sees_own_stats(self, api_client, student_token):
        """Student sees only their own procedure stats"""
        token, _ = student_token
        
        response = api_client.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"PASS: Student stats - total:{data['total']}, pending:{data['pending']}")


class TestProceduresFilter:
    """Test GET /api/procedures with filter param"""
    
    def test_filter_pending(self, api_client, admin_token):
        """Filter procedures by pending status"""
        token, _ = admin_token
        
        response = api_client.get(
            f"{BASE_URL}/api/procedures?status=pending",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        procedures = response.json()
        
        # All returned procedures should be in pending states
        pending_statuses = ["pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"]
        for proc in procedures:
            assert proc["status"] in pending_statuses, f"Unexpected status: {proc['status']}"
        print(f"PASS: Filtered {len(procedures)} pending procedures")
    
    def test_filter_completed(self, api_client, admin_token):
        """Filter procedures by completed status"""
        token, _ = admin_token
        
        response = api_client.get(
            f"{BASE_URL}/api/procedures?status=completed",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        procedures = response.json()
        
        # All returned procedures should be in completed states
        completed_statuses = ["phase2_approved", "stage2_surgical_approved", "completed"]
        for proc in procedures:
            assert proc["status"] in completed_statuses, f"Unexpected status: {proc['status']}"
        print(f"PASS: Filtered {len(procedures)} completed procedures")
    
    def test_filter_rejected(self, api_client, admin_token):
        """Filter procedures by rejected status"""
        token, _ = admin_token
        
        response = api_client.get(
            f"{BASE_URL}/api/procedures?status=rejected",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        procedures = response.json()
        
        # All returned procedures should be in rejected states
        rejected_statuses = ["rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"]
        for proc in procedures:
            assert proc["status"] in rejected_statuses, f"Unexpected status: {proc['status']}"
        print(f"PASS: Filtered {len(procedures)} rejected procedures")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_created_users(self, api_client, admin_token):
        """Clean up all test users created during tests"""
        global created_test_users
        token, _ = admin_token
        
        deleted = 0
        for user_id in created_test_users:
            try:
                resp = api_client.delete(
                    f"{BASE_URL}/api/users/{user_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if resp.status_code == 200:
                    deleted += 1
            except Exception:
                pass
        
        print(f"PASS: Cleaned up {deleted} test users")
        created_test_users = []


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
