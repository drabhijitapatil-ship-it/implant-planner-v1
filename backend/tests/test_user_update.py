"""
Test PUT /api/users/{user_id} - Edit User Endpoint
Iteration 7 - Testing user update functionality (role change, password reset, name update)

Valid roles: student, supervisor, implant_incharge, administrator, nurse
Authorization: Only administrator and implant_incharge can update users
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://case-completion-lab.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "ajay.sabane@dental.edu"
ADMIN_PASSWORD = "Admin@123"
IMPLANT_INCHARGE_EMAIL = "abhijit.patil@dental.edu"
IMPLANT_INCHARGE_PASSWORD = "Admin@123"
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"

class TestUserUpdateEndpoint:
    """Tests for PUT /api/users/{user_id} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self, email, password):
        """Helper to get auth token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def create_test_user(self, token, suffix=""):
        """Helper to create a test user for update tests"""
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": f"TEST_UpdateTarget_{suffix}",
            "email": f"test_update_target_{suffix}@test.dental.edu",
            "password": "InitialPassword@123",
            "role": "student"
        })
        if response.status_code in [200, 201]:
            data = response.json()
            return data.get("id")
        return None
    
    def delete_test_user(self, token, user_id):
        """Helper to clean up test user"""
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.session.delete(f"{BASE_URL}/api/users/{user_id}")
    
    # ========== TEST 1: Role change only ==========
    def test_update_user_role_change_only(self):
        """PUT /api/users/{id} with role change only"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        # Create test user
        user_id = self.create_test_user(token, "role_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Update role only
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "role": "supervisor"
            })
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            assert "message" in data
            assert data["message"] == "User updated successfully"
            
            # Verify role persisted via GET
            users_response = self.session.get(f"{BASE_URL}/api/users")
            assert users_response.status_code == 200
            users = users_response.json()
            updated_user = next((u for u in users if u.get("id") == user_id), None)
            assert updated_user, "User not found after update"
            assert updated_user["role"] == "supervisor", f"Role not updated: {updated_user['role']}"
            print("TEST PASSED: Role change only")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 2: Password reset only ==========
    def test_update_user_password_reset_only(self):
        """PUT /api/users/{id} with password reset only"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        # Create test user
        user_id = self.create_test_user(token, "password_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Update password only
            new_password = "NewPassword@456"
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "password": new_password
            })
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            assert "message" in data
            print("TEST PASSED: Password reset only")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 3: Name change only ==========
    def test_update_user_name_change_only(self):
        """PUT /api/users/{id} with name change only"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "name_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Update name only
            new_name = "TEST_UpdatedName"
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "name": new_name
            })
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify name persisted via GET
            users_response = self.session.get(f"{BASE_URL}/api/users")
            assert users_response.status_code == 200
            users = users_response.json()
            updated_user = next((u for u in users if u.get("id") == user_id), None)
            assert updated_user, "User not found after update"
            assert updated_user["name"] == new_name, f"Name not updated: {updated_user['name']}"
            print("TEST PASSED: Name change only")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 4: Multiple fields (name + role + password) ==========
    def test_update_user_multiple_fields(self):
        """PUT /api/users/{id} with multiple fields (name + role + password)"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "multi_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Update all fields
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "name": "TEST_MultiUpdatedName",
                "role": "nurse",
                "password": "MultiNewPassword@789"
            })
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify name and role persisted via GET
            users_response = self.session.get(f"{BASE_URL}/api/users")
            assert users_response.status_code == 200
            users = users_response.json()
            updated_user = next((u for u in users if u.get("id") == user_id), None)
            assert updated_user, "User not found after update"
            assert updated_user["name"] == "TEST_MultiUpdatedName", f"Name not updated: {updated_user['name']}"
            assert updated_user["role"] == "nurse", f"Role not updated: {updated_user['role']}"
            print("TEST PASSED: Multiple fields update")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 5: Empty payload returns 400 ==========
    def test_update_user_empty_payload_returns_400(self):
        """PUT /api/users/{id} with empty payload returns 400"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "empty_test")
        assert user_id, "Failed to create test user"
        
        try:
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={})
            
            assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
            data = response.json()
            assert "detail" in data
            assert "No fields to update" in data["detail"]
            print("TEST PASSED: Empty payload returns 400")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 6: Invalid role returns 400 ==========
    def test_update_user_invalid_role_returns_400(self):
        """PUT /api/users/{id} with invalid role returns 400"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "invalid_role_test")
        assert user_id, "Failed to create test user"
        
        try:
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "role": "invalid_role"
            })
            
            assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
            data = response.json()
            assert "detail" in data
            assert "Invalid role" in data["detail"]
            print("TEST PASSED: Invalid role returns 400")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 7: Nonexistent user returns 404 ==========
    def test_update_nonexistent_user_returns_404(self):
        """PUT /api/users/{id} with nonexistent user returns 404"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        # Use a valid ObjectId format but nonexistent
        fake_user_id = "507f1f77bcf86cd799439011"
        response = self.session.put(f"{BASE_URL}/api/users/{fake_user_id}", json={
            "name": "Should Not Update"
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "User not found" in data["detail"]
        print("TEST PASSED: Nonexistent user returns 404")
    
    # ========== TEST 8: Non-admin (student) role returns 403 ==========
    def test_update_user_student_returns_403(self):
        """PUT /api/users/{id} non-admin role (student) returns 403"""
        admin_token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert admin_token, "Admin login failed"
        
        # Create test user as admin
        user_id = self.create_test_user(admin_token, "student_403_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Login as student
            student_token = self.get_auth_token(STUDENT_EMAIL, STUDENT_PASSWORD)
            assert student_token, "Student login failed"
            
            # Try to update as student
            self.session.headers.update({"Authorization": f"Bearer {student_token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "role": "supervisor"
            })
            
            assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
            data = response.json()
            assert "detail" in data
            print("TEST PASSED: Student returns 403")
        finally:
            self.delete_test_user(admin_token, user_id)
    
    # ========== TEST 9: Verify password reset works (login with new password) ==========
    def test_password_reset_login_verification(self):
        """Verify password reset actually works (login with new password after reset)"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        # Create test user with known credentials
        test_email = "test_password_login@test.dental.edu"
        initial_password = "InitialPassword@123"
        new_password = "NewPassword@456"
        
        # Create user
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        create_response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_PasswordLoginTest",
            "email": test_email,
            "password": initial_password,
            "role": "student"
        })
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test user: {create_response.text}")
        
        user_id = create_response.json().get("id")
        
        try:
            # Verify initial login works
            login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": test_email,
                "password": initial_password
            })
            assert login_response.status_code == 200, f"Initial login failed: {login_response.text}"
            
            # Reset password
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            update_response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "password": new_password
            })
            assert update_response.status_code == 200, f"Password reset failed: {update_response.text}"
            
            # Verify old password no longer works
            old_login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": test_email,
                "password": initial_password
            })
            assert old_login_response.status_code == 401, "Old password should not work after reset"
            
            # Verify new password works
            new_login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": test_email,
                "password": new_password
            })
            assert new_login_response.status_code == 200, f"New password login failed: {new_login_response.text}"
            print("TEST PASSED: Password reset login verification")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 10: Verify role change persists (GET after role update) ==========
    def test_role_change_persistence(self):
        """Verify role change persists (GET user after role update)"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "role_persist_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Update role to each valid role and verify
            valid_roles = ["supervisor", "implant_incharge", "administrator", "nurse", "student"]
            
            for target_role in valid_roles:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                update_response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                    "role": target_role
                })
                assert update_response.status_code == 200, f"Role update to {target_role} failed"
                
                # GET and verify
                users_response = self.session.get(f"{BASE_URL}/api/users")
                assert users_response.status_code == 200
                users = users_response.json()
                updated_user = next((u for u in users if u.get("id") == user_id), None)
                assert updated_user, f"User not found after updating to {target_role}"
                assert updated_user["role"] == target_role, f"Role {target_role} not persisted: {updated_user['role']}"
            
            print("TEST PASSED: Role change persistence verified for all roles")
        finally:
            self.delete_test_user(token, user_id)
    
    # ========== TEST 11: Implant Incharge can update users ==========
    def test_implant_incharge_can_update_users(self):
        """Verify implant_incharge role can also update users"""
        admin_token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert admin_token, "Admin login failed"
        
        # Create test user as admin
        user_id = self.create_test_user(admin_token, "incharge_update_test")
        assert user_id, "Failed to create test user"
        
        try:
            # Login as implant incharge
            incharge_token = self.get_auth_token(IMPLANT_INCHARGE_EMAIL, IMPLANT_INCHARGE_PASSWORD)
            assert incharge_token, "Implant Incharge login failed"
            
            # Update as implant incharge
            self.session.headers.update({"Authorization": f"Bearer {incharge_token}"})
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "name": "TEST_UpdatedByIncharge"
            })
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify update
            users_response = self.session.get(f"{BASE_URL}/api/users")
            users = users_response.json()
            updated_user = next((u for u in users if u.get("id") == user_id), None)
            assert updated_user["name"] == "TEST_UpdatedByIncharge"
            print("TEST PASSED: Implant Incharge can update users")
        finally:
            self.delete_test_user(admin_token, user_id)
    
    # ========== TEST 12: Empty string fields should be ignored ==========
    def test_update_user_whitespace_only_name(self):
        """PUT /api/users/{id} with whitespace-only name should return 400"""
        token = self.get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Admin login failed"
        
        user_id = self.create_test_user(token, "whitespace_test")
        assert user_id, "Failed to create test user"
        
        try:
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            # Only whitespace in name - should be treated as no update
            response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
                "name": "   "
            })
            
            # Code strips and checks, so whitespace-only should result in "no fields to update"
            assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
            print("TEST PASSED: Whitespace-only name returns 400")
        finally:
            self.delete_test_user(token, user_id)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
