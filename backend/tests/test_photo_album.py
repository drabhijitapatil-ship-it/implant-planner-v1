"""
Test suite for Clinical Case Album Photo Management
Testing the new photo upload/delete/list endpoints and PDF album generation
Features: 26 photo steps across 4 phases
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"
SUPERVISOR_EMAIL = "vasantha.n@dental.edu"
SUPERVISOR_PASSWORD = "Supervisor@123"

# Test procedure ID
TEST_PROCEDURE_ID = "699fbfa15279dfa7819789b8"


@pytest.fixture(scope="module")
def student_token():
    """Get student authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip(f"Student login failed: {response.text}")


@pytest.fixture(scope="module")
def incharge_token():
    """Get implant incharge authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": INCHARGE_EMAIL,
        "password": INCHARGE_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip(f"Incharge login failed: {response.text}")


@pytest.fixture
def student_headers(student_token):
    """Headers with student auth token."""
    return {
        "Authorization": f"Bearer {student_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def incharge_headers(incharge_token):
    """Headers with incharge auth token."""
    return {
        "Authorization": f"Bearer {incharge_token}",
        "Content-Type": "application/json"
    }


class TestPhotoStepsEndpoints:
    """Test photo step definitions endpoints."""

    def test_get_all_photo_steps(self, incharge_headers):
        """GET /api/photo-steps - returns all photo step definitions."""
        response = requests.get(f"{BASE_URL}/api/photo-steps", headers=incharge_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Should have 4 phases
        assert len(data) == 4, f"Expected 4 phases, got {len(data)}"
        
        # Check each phase exists
        for phase_num in ["1", "2", "3", "4"]:
            assert phase_num in data, f"Phase {phase_num} missing"
            assert "name" in data[phase_num], f"Phase {phase_num} missing 'name'"
            assert "steps" in data[phase_num], f"Phase {phase_num} missing 'steps'"
            assert len(data[phase_num]["steps"]) > 0, f"Phase {phase_num} has no steps"
        
        print(f"All photo steps retrieved: {len(data)} phases")

    def test_get_photo_steps_phase1(self, incharge_headers):
        """GET /api/photo-steps/1 - returns Phase 1 Pre-Surgical steps."""
        response = requests.get(f"{BASE_URL}/api/photo-steps/1", headers=incharge_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "name" in data, "Missing 'name' field"
        assert data["name"] == "Pre-Surgical Documentation", f"Wrong phase name: {data['name']}"
        assert "steps" in data, "Missing 'steps' field"
        
        # Phase 1 should have 14 steps
        assert len(data["steps"]) == 14, f"Expected 14 steps in Phase 1, got {len(data['steps'])}"
        
        # Check step structure
        step = data["steps"][0]
        assert "id" in step
        assert "label" in step
        assert "category" in step
        assert "purpose" in step
        assert "armamentarium" in step
        assert "prompt" in step
        
        print(f"Phase 1 has {len(data['steps'])} steps")

    def test_get_photo_steps_phase2(self, incharge_headers):
        """GET /api/photo-steps/2 - returns Phase 2 Surgical steps."""
        response = requests.get(f"{BASE_URL}/api/photo-steps/2", headers=incharge_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "Surgical Documentation"
        # Phase 2 should have 12 steps
        assert len(data["steps"]) == 12, f"Expected 12 steps in Phase 2, got {len(data['steps'])}"
        print(f"Phase 2 has {len(data['steps'])} steps")

    def test_get_photo_steps_phase3(self, incharge_headers):
        """GET /api/photo-steps/3 - returns Phase 3 Second Stage Surgery steps."""
        response = requests.get(f"{BASE_URL}/api/photo-steps/3", headers=incharge_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "Second Stage Surgery"
        # Phase 3 should have 7 steps
        assert len(data["steps"]) == 7, f"Expected 7 steps in Phase 3, got {len(data['steps'])}"
        print(f"Phase 3 has {len(data['steps'])} steps")

    def test_get_photo_steps_phase4(self, incharge_headers):
        """GET /api/photo-steps/4 - returns Phase 4 Prosthetic Rehabilitation steps."""
        response = requests.get(f"{BASE_URL}/api/photo-steps/4", headers=incharge_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "Prosthetic Rehabilitation"
        # Phase 4 should have 11 steps
        assert len(data["steps"]) == 11, f"Expected 11 steps in Phase 4, got {len(data['steps'])}"
        print(f"Phase 4 has {len(data['steps'])} steps")

    def test_get_photo_steps_invalid_phase(self, incharge_headers):
        """GET /api/photo-steps/5 - returns error for invalid phase."""
        response = requests.get(f"{BASE_URL}/api/photo-steps/5", headers=incharge_headers)
        assert response.status_code == 400, f"Expected 400 for invalid phase, got {response.status_code}"
        assert "Invalid phase" in response.json().get("detail", "")


class TestPhotoListEndpoint:
    """Test GET /api/procedures/{id}/photos endpoint."""

    def test_get_procedure_photos(self, incharge_headers):
        """GET /api/procedures/{id}/photos - returns all photos grouped by step."""
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos",
            headers=incharge_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Should have 4 phases
        assert len(data) == 4, f"Expected 4 phases, got {len(data)}"
        
        # Check structure of each phase
        for phase_num in ["1", "2", "3", "4"]:
            assert phase_num in data, f"Phase {phase_num} missing"
            phase = data[phase_num]
            assert "name" in phase
            assert "steps" in phase
            assert "total" in phase
            assert "completed" in phase
            
            # Check step structure
            for step in phase["steps"]:
                assert "step_id" in step
                assert "label" in step
                assert "category" in step
                assert "caption" in step
                assert "photos" in step
                assert "has_photo" in step
        
        print(f"Photos retrieved for procedure {TEST_PROCEDURE_ID}")

    def test_get_photos_invalid_procedure(self, incharge_headers):
        """GET /api/procedures/{invalid_id}/photos - returns 404 for invalid procedure."""
        response = requests.get(
            f"{BASE_URL}/api/procedures/000000000000000000000000/photos",
            headers=incharge_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestPhotoUploadEndpoint:
    """Test POST /api/procedures/{id}/photos/{step_id} endpoint."""

    def test_upload_photo_success(self, student_token):
        """POST /api/procedures/{id}/photos/{step_id} - upload photo as student owner."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Create a small test image (1x1 pixel PNG)
        test_image = io.BytesIO()
        # Minimal valid PNG header
        test_image.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        test_image.seek(0)
        
        files = {
            'file': ('test_photo.png', test_image, 'image/png')
        }
        
        step_id = "p1_extraoral_rest"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data.get("message") == "Photo uploaded"
        assert data.get("step_id") == step_id
        assert "filename" in data
        
        print(f"Photo uploaded successfully: {data['filename']}")
        return data['filename']  # Return for cleanup

    def test_upload_photo_invalid_step(self, student_token):
        """POST /api/procedures/{id}/photos/{invalid_step} - returns 400 for invalid step."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        
        files = {'file': ('test.png', test_image, 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/invalid_step_id",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Invalid step_id" in response.json().get("detail", "")

    def test_upload_photo_invalid_file_type(self, student_token):
        """POST /api/procedures/{id}/photos/{step_id} - returns 400 for invalid file type."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Try to upload a text file
        files = {'file': ('test.txt', io.BytesIO(b'test content'), 'text/plain')}
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/p1_extraoral_rest",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "File type not allowed" in response.json().get("detail", "")

    def test_upload_photo_non_student_denied(self, incharge_token):
        """POST /api/procedures/{id}/photos/{step_id} - non-students cannot upload."""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        files = {'file': ('test.png', test_image, 'image/png')}
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/p1_extraoral_rest",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestPhotoDeleteEndpoint:
    """Test DELETE /api/procedures/{id}/photos/{step_id}/{filename} endpoint."""

    def test_delete_photo_workflow(self, student_token):
        """Full workflow: upload then delete a photo."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # First upload a photo
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        files = {'file': ('delete_test.png', test_image, 'image/png')}
        step_id = "p1_extraoral_smile"
        
        upload_response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}",
            headers=headers,
            files=files
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        filename = upload_response.json()["filename"]
        
        # Now delete the photo
        delete_response = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}/{filename}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        assert delete_response.json().get("message") == "Photo deleted"
        
        print(f"Upload and delete workflow completed successfully")

    def test_delete_photo_non_student_denied(self, incharge_token, student_token):
        """Non-students cannot delete photos."""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        headers_incharge = {"Authorization": f"Bearer {incharge_token}"}
        
        # First upload a photo as student
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        files = {'file': ('permission_test.png', test_image, 'image/png')}
        step_id = "p1_extraoral_profile"
        
        upload_response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}",
            headers=headers_student,
            files=files
        )
        
        if upload_response.status_code == 200:
            filename = upload_response.json()["filename"]
            
            # Try to delete as incharge (should fail)
            delete_response = requests.delete(
                f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}/{filename}",
                headers=headers_incharge
            )
            assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
            
            # Clean up - delete as student
            requests.delete(
                f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}/{filename}",
                headers=headers_student
            )


class TestServePhotoEndpoint:
    """Test GET /api/photos/{filename} endpoint."""

    def test_serve_photo(self, student_token, incharge_headers):
        """GET /api/photos/{filename} - serve uploaded photo."""
        headers_student = {"Authorization": f"Bearer {student_token}"}
        
        # First upload a photo
        test_image = io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')
        files = {'file': ('serve_test.png', test_image, 'image/png')}
        step_id = "p1_intraoral_frontal"
        
        upload_response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}",
            headers=headers_student,
            files=files
        )
        
        if upload_response.status_code == 200:
            filename = upload_response.json()["filename"]
            
            # Serve the photo
            serve_response = requests.get(
                f"{BASE_URL}/api/photos/{filename}",
                headers=incharge_headers
            )
            assert serve_response.status_code == 200, f"Serve failed: {serve_response.text}"
            assert len(serve_response.content) > 0, "Empty file content"
            
            # Clean up
            requests.delete(
                f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/photos/{step_id}/{filename}",
                headers=headers_student
            )
            print(f"Photo served successfully: {filename}")
        else:
            pytest.skip(f"Upload failed, skipping serve test: {upload_response.text}")

    def test_serve_photo_not_found(self, incharge_headers):
        """GET /api/photos/{invalid_filename} - returns 404."""
        response = requests.get(
            f"{BASE_URL}/api/photos/nonexistent_file.png",
            headers=incharge_headers
        )
        assert response.status_code == 404


class TestAlbumGenerationEndpoint:
    """Test POST /api/procedures/{id}/generate-album endpoint."""

    def test_generate_album_pdf(self, incharge_headers):
        """POST /api/procedures/{id}/generate-album - generate PDF album."""
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/generate-album",
            headers=incharge_headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Check response is a PDF
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected PDF, got {content_type}"
        
        # Check Content-Disposition header
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp, "Missing attachment disposition"
        assert 'CaseAlbum' in content_disp, "Missing CaseAlbum in filename"
        
        # Check PDF content starts with PDF header
        assert response.content[:4] == b'%PDF', "Invalid PDF header"
        
        print(f"Album PDF generated successfully: {len(response.content)} bytes")

    def test_generate_album_invalid_procedure(self, incharge_headers):
        """POST /api/procedures/{invalid}/generate-album - returns 404."""
        response = requests.post(
            f"{BASE_URL}/api/procedures/000000000000000000000000/generate-album",
            headers=incharge_headers
        )
        assert response.status_code == 404


class TestPhotoStepCoverage:
    """Verify all 26 photo step definitions are complete."""

    def test_all_steps_have_required_fields(self, incharge_headers):
        """All photo steps should have complete definitions."""
        response = requests.get(f"{BASE_URL}/api/photo-steps", headers=incharge_headers)
        assert response.status_code == 200
        
        data = response.json()
        total_steps = 0
        
        for phase_num, phase_data in data.items():
            for step in phase_data["steps"]:
                total_steps += 1
                # Each step must have all required fields
                assert step.get("id"), f"Step missing 'id' in phase {phase_num}"
                assert step.get("label"), f"Step {step.get('id')} missing 'label'"
                assert step.get("category"), f"Step {step.get('id')} missing 'category'"
                assert step.get("purpose"), f"Step {step.get('id')} missing 'purpose'"
                assert "armamentarium" in step, f"Step {step.get('id')} missing 'armamentarium'"
                assert step.get("prompt"), f"Step {step.get('id')} missing 'prompt'"
        
        # Total should be 44 steps (14 + 12 + 7 + 11)
        assert total_steps == 44, f"Expected 44 total steps, got {total_steps}"
        print(f"All {total_steps} photo steps have complete definitions")

    def test_step_ids_are_unique(self, incharge_headers):
        """All step IDs should be unique across all phases."""
        response = requests.get(f"{BASE_URL}/api/photo-steps", headers=incharge_headers)
        assert response.status_code == 200
        
        data = response.json()
        all_ids = []
        
        for phase_data in data.values():
            for step in phase_data["steps"]:
                all_ids.append(step["id"])
        
        # Check uniqueness
        assert len(all_ids) == len(set(all_ids)), "Duplicate step IDs found"
        print(f"All {len(all_ids)} step IDs are unique")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
