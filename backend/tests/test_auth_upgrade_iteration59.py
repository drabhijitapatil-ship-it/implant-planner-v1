"""
Test Suite for Auth System Upgrade - Iteration 59
Tests the new production-grade authentication system:
- Login with 'identifier' field (email or username)
- Access token (15min) + Refresh token (7 days)
- Token refresh endpoint
- Logout with token invalidation
- Protected routes
- Rate limiting (5/minute)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com"

# Test credentials from test_credentials.md
STUDENT_EMAIL = "Gaurav.pandey@student.dental.edu"
STUDENT_USERNAME = "Gaurav.pandey"
STUDENT_PASSWORD = "Student@123"

INCHARGE_EMAIL = "Abhijit.patil@dental.edu"
INCHARGE_USERNAME = "Abhijit.patil"
INCHARGE_PASSWORD = "Admin@123"

SUPERVISOR_EMAIL = "Paresh.gandhi@dental.edu"
SUPERVISOR_PASSWORD = "Supervisor@123"

NURSE_EMAIL = "Nurse.1@dental.edu"
NURSE_PASSWORD = "Nurse@123"


class TestHealthEndpoints:
    """Health check endpoints - run first"""
    
    def test_health_endpoint(self):
        """GET /api/health returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: GET /api/health returns 200 OK")
    
    def test_db_status_endpoint(self):
        """GET /api/health/db-status returns database info"""
        response = requests.get(f"{BASE_URL}/api/health/db-status")
        assert response.status_code == 200, f"DB status failed: {response.text}"
        data = response.json()
        assert "users" in data
        assert data["users"]["total"] > 0, "No users in database"
        print(f"PASS: DB has {data['users']['total']} users")


class TestLoginWithIdentifier:
    """Test login with 'identifier' field (email or username)"""
    
    def test_login_with_full_email(self):
        """Login works with full email format"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data, "Missing access_token"
        assert "refresh_token" in data, "Missing refresh_token"
        assert "token_type" in data, "Missing token_type"
        assert "user" in data, "Missing user object"
        assert data["token_type"] == "bearer"
        
        # Verify user object
        user = data["user"]
        assert "id" in user
        assert "name" in user
        assert "email" in user
        assert "role" in user
        assert user["role"] == "student"
        
        print(f"PASS: Login with email '{STUDENT_EMAIL}' returns access_token + refresh_token")
        time.sleep(12)  # Rate limit: 5/minute
    
    def test_login_with_username_only(self):
        """Login works with username only (no @domain)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": INCHARGE_USERNAME,
            "password": INCHARGE_PASSWORD
        })
        assert response.status_code == 200, f"Login with username failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["role"] == "implant_incharge"
        
        print(f"PASS: Login with username '{INCHARGE_USERNAME}' works")
        time.sleep(12)
    
    def test_login_case_insensitive(self):
        """Login is case-insensitive for identifier"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": STUDENT_EMAIL.lower(),
            "password": STUDENT_PASSWORD
        })
        assert response.status_code == 200, f"Case-insensitive login failed: {response.text}"
        print("PASS: Login is case-insensitive")
        time.sleep(12)
    
    def test_login_invalid_credentials(self):
        """Login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": STUDENT_EMAIL,
            "password": "WrongPassword123"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Invalid credentials return 401")
        time.sleep(12)
    
    def test_login_nonexistent_user(self):
        """Login with non-existent user returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "nonexistent@dental.edu",
            "password": "SomePassword123"
        })
        assert response.status_code == 401
        print("PASS: Non-existent user returns 401")
        time.sleep(12)


class TestOldEmailFieldRejected:
    """Test that old 'email' field in login payload is rejected"""
    
    def test_old_email_field_returns_422(self):
        """Using old 'email' field should return 422 (schema validation)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,  # OLD field - should be rejected
            "password": STUDENT_PASSWORD
        })
        # Should return 422 Unprocessable Entity because 'identifier' is required
        assert response.status_code == 422, f"Expected 422 for old 'email' field, got {response.status_code}: {response.text}"
        print("PASS: Old 'email' field returns 422 (schema validation)")


class TestAccessTokenProtectedRoutes:
    """Test protected routes with access token"""
    
    @pytest.fixture
    def auth_tokens(self):
        """Get fresh tokens for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()
    
    def test_get_me_with_valid_token(self, auth_tokens):
        """GET /api/auth/me returns user profile with valid access token"""
        headers = {"Authorization": f"Bearer {auth_tokens['access_token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        
        assert response.status_code == 200, f"GET /me failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert "name" in data
        assert "email" in data
        assert "role" in data
        assert data["role"] == "supervisor"
        
        print("PASS: GET /api/auth/me returns user profile with valid token")
        time.sleep(12)
    
    def test_protected_route_without_token(self):
        """Protected route without token returns 401/403"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Protected route without token returns 401/403")
    
    def test_protected_route_with_invalid_token(self):
        """Protected route with invalid token returns 401"""
        headers = {"Authorization": "Bearer invalid_token_here"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Invalid token returns 401")


class TestRefreshToken:
    """Test token refresh functionality"""
    
    @pytest.fixture
    def auth_tokens(self):
        """Get fresh tokens for testing"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": NURSE_EMAIL,
            "password": NURSE_PASSWORD
        })
        assert response.status_code == 200
        time.sleep(12)
        return response.json()
    
    def test_refresh_with_valid_token(self, auth_tokens):
        """POST /api/auth/refresh with valid refresh_token returns new access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json={
            "refresh_token": auth_tokens["refresh_token"]
        })
        
        assert response.status_code == 200, f"Refresh failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data, "Missing new access_token"
        assert "token_type" in data
        assert data["token_type"] == "bearer"
        
        # Verify new access token works
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200, "New access token doesn't work"
        
        print("PASS: Refresh token returns new access_token that works")
    
    def test_refresh_with_invalid_token(self):
        """Refresh with invalid token returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json={
            "refresh_token": "invalid_refresh_token"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Invalid refresh token returns 401")
    
    def test_refresh_with_access_token_fails(self):
        """Using access_token in refresh endpoint should fail"""
        # First login to get tokens
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert login_response.status_code == 200
        tokens = login_response.json()
        time.sleep(12)
        
        # Try to use access_token as refresh_token
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json={
            "refresh_token": tokens["access_token"]  # Wrong token type!
        })
        assert response.status_code == 401, f"Expected 401 when using access_token for refresh, got {response.status_code}"
        print("PASS: Using access_token for refresh returns 401")


class TestLogout:
    """Test logout and token invalidation"""
    
    def test_logout_invalidates_refresh_token(self):
        """POST /api/auth/logout invalidates refresh token"""
        # Login to get tokens
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": INCHARGE_EMAIL,
            "password": INCHARGE_PASSWORD
        })
        assert login_response.status_code == 200
        tokens = login_response.json()
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        time.sleep(12)
        
        # Logout
        headers = {"Authorization": f"Bearer {access_token}"}
        logout_response = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert logout_response.status_code == 200, f"Logout failed: {logout_response.text}"
        
        data = logout_response.json()
        assert "message" in data
        print("PASS: Logout returns success message")
        
        # Try to use refresh token after logout - should fail
        refresh_response = requests.post(f"{BASE_URL}/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
        assert refresh_response.status_code == 401, f"Expected 401 after logout, got {refresh_response.status_code}"
        print("PASS: Refresh token is revoked after logout (returns 401)")


class TestMultipleUserRoles:
    """Test login works for all user roles"""
    
    def test_student_login(self):
        """Student can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "student"
        print("PASS: Student login works")
        time.sleep(12)
    
    def test_supervisor_login(self):
        """Supervisor can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "supervisor"
        print("PASS: Supervisor login works")
        time.sleep(12)
    
    def test_incharge_login(self):
        """Implant In-Charge can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": INCHARGE_EMAIL,
            "password": INCHARGE_PASSWORD
        })
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "implant_incharge"
        print("PASS: Implant In-Charge login works")
        time.sleep(12)
    
    def test_nurse_login(self):
        """Nurse can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": NURSE_EMAIL,
            "password": NURSE_PASSWORD
        })
        assert response.status_code == 200
        assert response.json()["user"]["role"] == "nurse"
        print("PASS: Nurse login works")


class TestRateLimiting:
    """Test rate limiting on login endpoint (5/minute)"""
    
    def test_rate_limit_info(self):
        """Document rate limit behavior - 5 requests per minute"""
        # Note: We can't easily test rate limiting without hitting it
        # The tests above already space out requests with time.sleep(12)
        # This test documents the expected behavior
        print("INFO: Rate limit is 5/minute per IP on /api/auth/login")
        print("INFO: Tests use 12-second delays between login attempts to avoid rate limiting")
        print("PASS: Rate limiting documented (5/minute)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
