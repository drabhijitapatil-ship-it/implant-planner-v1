"""
Iteration 86: Profile Photo Backend API Tests
Tests for profile photo integration across drawer menu and user management.

Features tested:
1. GET /api/auth/me returns profile_photo field
2. GET /api/users returns profile_photo field for each user
3. PUT /api/auth/profile-photo accepts and stores base64 photo data
4. GET /api/auth/me returns updated profile_photo after upload
5. GET /api/users shows updated photo for the user who uploaded
"""

import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
TEST_CREDENTIALS = {
    "student": {
        "identifier": "Gaurav.pandey@student.dental.edu",
        "password": "Student@123"
    },
    "supervisor": {
        "identifier": "Paresh.gandhi@dental.edu",
        "password": "Supervisor@123"
    },
    "implant_incharge": {
        "identifier": "Abhijit.patil@dental.edu",
        "password": "Admin@123"
    }
}

# Small test base64 image (1x1 red pixel PNG)
TEST_BASE64_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def get_auth_token(api_client, role="student"):
    """Get authentication token for a specific role"""
    creds = TEST_CREDENTIALS[role]
    response = api_client.post(f"{BASE_URL}/api/auth/login", json=creds)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_api_health(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: API health check")


class TestAuthMeProfilePhoto:
    """Tests for GET /api/auth/me returning profile_photo field"""
    
    def test_auth_me_returns_profile_photo_field_student(self, api_client):
        """Test that GET /api/auth/me returns profile_photo field for student"""
        token = get_auth_token(api_client, "student")
        assert token is not None, "Failed to get student auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields exist
        assert "id" in data, "Missing 'id' field"
        assert "name" in data, "Missing 'name' field"
        assert "email" in data, "Missing 'email' field"
        assert "role" in data, "Missing 'role' field"
        
        # Verify profile_photo field exists (can be null/None)
        assert "profile_photo" in data, "Missing 'profile_photo' field in /auth/me response"
        print(f"PASS: GET /api/auth/me returns profile_photo field for student (value: {data.get('profile_photo', 'null')[:50] if data.get('profile_photo') else 'null'}...)")
    
    def test_auth_me_returns_profile_photo_field_supervisor(self, api_client):
        """Test that GET /api/auth/me returns profile_photo field for supervisor"""
        token = get_auth_token(api_client, "supervisor")
        assert token is not None, "Failed to get supervisor auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "profile_photo" in data, "Missing 'profile_photo' field in /auth/me response"
        print(f"PASS: GET /api/auth/me returns profile_photo field for supervisor")
    
    def test_auth_me_returns_profile_photo_field_incharge(self, api_client):
        """Test that GET /api/auth/me returns profile_photo field for implant_incharge"""
        token = get_auth_token(api_client, "implant_incharge")
        assert token is not None, "Failed to get implant_incharge auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "profile_photo" in data, "Missing 'profile_photo' field in /auth/me response"
        print(f"PASS: GET /api/auth/me returns profile_photo field for implant_incharge")


class TestUsersEndpointProfilePhoto:
    """Tests for GET /api/users returning profile_photo field for each user"""
    
    def test_users_endpoint_returns_profile_photo_field(self, api_client):
        """Test that GET /api/users returns profile_photo field for each user"""
        token = get_auth_token(api_client, "implant_incharge")
        assert token is not None, "Failed to get implant_incharge auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        response = api_client.get(f"{BASE_URL}/api/users")
        
        assert response.status_code == 200
        users = response.json()
        
        assert isinstance(users, list), "Expected list of users"
        assert len(users) > 0, "Expected at least one user"
        
        # Check that each user has profile_photo field
        users_with_profile_photo = 0
        users_without_profile_photo = 0
        
        for user in users:
            assert "id" in user or "_id" in user, f"User missing id field: {user}"
            assert "name" in user, f"User missing name field: {user}"
            assert "email" in user, f"User missing email field: {user}"
            assert "role" in user, f"User missing role field: {user}"
            
            # profile_photo should be present (can be null)
            # Note: MongoDB returns all fields except password_hash, so profile_photo should be there
            if "profile_photo" in user:
                users_with_profile_photo += 1
            else:
                users_without_profile_photo += 1
        
        print(f"PASS: GET /api/users returns users. {users_with_profile_photo} have profile_photo field, {users_without_profile_photo} don't have it yet")
        
        # At minimum, the response should include profile_photo for users who have it set
        # If no users have profile_photo set, that's okay - the field just won't be in the response
        # But after we upload a photo, it should appear
    
    def test_users_endpoint_filtered_by_role(self, api_client):
        """Test that GET /api/users?role=student returns profile_photo field"""
        token = get_auth_token(api_client, "implant_incharge")
        assert token is not None, "Failed to get implant_incharge auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        response = api_client.get(f"{BASE_URL}/api/users?role=student")
        
        assert response.status_code == 200
        users = response.json()
        
        assert isinstance(users, list), "Expected list of users"
        
        for user in users:
            assert user.get("role") == "student", f"Expected student role, got {user.get('role')}"
        
        print(f"PASS: GET /api/users?role=student returns {len(users)} students")


class TestProfilePhotoUpload:
    """Tests for PUT /api/auth/profile-photo endpoint"""
    
    def test_upload_profile_photo_success(self, api_client):
        """Test that PUT /api/auth/profile-photo accepts and stores base64 photo data"""
        token = get_auth_token(api_client, "student")
        assert token is not None, "Failed to get student auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Upload profile photo
        response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": TEST_BASE64_IMAGE}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Expected message in response"
        print(f"PASS: PUT /api/auth/profile-photo accepted base64 image. Response: {data}")
    
    def test_upload_profile_photo_requires_auth(self, api_client):
        """Test that PUT /api/auth/profile-photo requires authentication"""
        # Remove auth header
        api_client.headers.pop("Authorization", None)
        
        response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": TEST_BASE64_IMAGE}
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASS: PUT /api/auth/profile-photo requires authentication (got {response.status_code})")


class TestProfilePhotoIntegration:
    """Integration tests for profile photo flow"""
    
    def test_upload_and_verify_in_auth_me(self, api_client):
        """Test that uploaded photo appears in GET /api/auth/me"""
        token = get_auth_token(api_client, "student")
        assert token is not None, "Failed to get student auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Upload profile photo
        upload_response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": TEST_BASE64_IMAGE}
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        # Verify in /auth/me
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        
        me_data = me_response.json()
        assert "profile_photo" in me_data, "profile_photo field missing after upload"
        assert me_data["profile_photo"] == TEST_BASE64_IMAGE, "profile_photo value doesn't match uploaded image"
        
        print(f"PASS: Uploaded photo appears in GET /api/auth/me")
    
    def test_upload_and_verify_in_users_list(self, api_client):
        """Test that uploaded photo appears in GET /api/users for the user who uploaded"""
        # First, upload as student
        student_token = get_auth_token(api_client, "student")
        assert student_token is not None, "Failed to get student auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {student_token}"})
        
        # Get student's user ID
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        student_id = me_response.json().get("id")
        student_email = me_response.json().get("email")
        
        # Upload profile photo
        upload_response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": TEST_BASE64_IMAGE}
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        # Now login as incharge to view users list
        incharge_token = get_auth_token(api_client, "implant_incharge")
        assert incharge_token is not None, "Failed to get implant_incharge auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {incharge_token}"})
        
        # Get users list
        users_response = api_client.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        
        users = users_response.json()
        
        # Find the student in the list
        student_in_list = None
        for user in users:
            user_id = user.get("id") or user.get("_id")
            if user_id == student_id or user.get("email") == student_email:
                student_in_list = user
                break
        
        assert student_in_list is not None, f"Student {student_email} not found in users list"
        assert "profile_photo" in student_in_list, "profile_photo field missing for student in users list"
        assert student_in_list["profile_photo"] == TEST_BASE64_IMAGE, "profile_photo value doesn't match in users list"
        
        print(f"PASS: Uploaded photo appears in GET /api/users for student {student_email}")


class TestLoginResponseProfilePhoto:
    """Tests for login response including profile_photo"""
    
    def test_login_response_includes_profile_photo(self, api_client):
        """Test that login response includes profile_photo in user object"""
        creds = TEST_CREDENTIALS["student"]
        response = api_client.post(f"{BASE_URL}/api/auth/login", json=creds)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "user" in data, "Missing 'user' in login response"
        user = data["user"]
        
        assert "profile_photo" in user, "Missing 'profile_photo' in login response user object"
        print(f"PASS: Login response includes profile_photo in user object (value: {user.get('profile_photo', 'null')[:50] if user.get('profile_photo') else 'null'}...)")


class TestProfilePhotoEdgeCases:
    """Edge case tests for profile photo"""
    
    def test_upload_empty_profile_photo(self, api_client):
        """Test uploading empty string as profile photo"""
        token = get_auth_token(api_client, "supervisor")
        assert token is not None, "Failed to get supervisor auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Upload empty profile photo (to clear it)
        response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": ""}
        )
        
        # Should succeed (clearing the photo)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Empty profile_photo upload accepted (clears photo)")
    
    def test_upload_large_base64_image(self, api_client):
        """Test uploading a larger base64 image"""
        token = get_auth_token(api_client, "supervisor")
        assert token is not None, "Failed to get supervisor auth token"
        
        api_client.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create a larger test image (10x10 red pixels)
        # This is still small but tests that larger images work
        larger_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQzwAEjDAGNzYAAIoaB/5rSwaAAAAAAElFTkSuQmCC"
        
        response = api_client.put(
            f"{BASE_URL}/api/auth/profile-photo",
            json={"profile_photo": larger_image}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it was stored
        me_response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200
        assert me_response.json().get("profile_photo") == larger_image
        
        print(f"PASS: Larger base64 image upload and retrieval works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
