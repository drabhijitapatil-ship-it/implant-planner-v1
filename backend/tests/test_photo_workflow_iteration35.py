"""
Test file for iteration 35: Phase A New Case Workflow - Photo Upload & Phase Workflow Features
Tests for:
1. POST /api/procedures - creates case in draft status
2. POST /api/procedures/{id}/implant-plan - saves implant plans
3. GET /api/photo-steps/{phase} - returns photo steps for phases
4. GET /api/photo-steps - returns all photo steps
5. POST /api/procedures/{id}/photos/{step_id} - uploads a photo (multipart/form-data)
6. GET /api/procedures/{id}/photos - returns uploaded photos grouped by phase
7. POST /api/procedures/{id}/request-phase1-approval - transitions draft to pending_phase1
"""

import pytest
import requests
import os
import io
from datetime import datetime, timedelta

# API Base URL from environment
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://clinical-album.preview.emergentagent.com").rstrip('/')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"

def get_valid_weekday_date(days_ahead=3):
    """Get a valid weekday date (Monday-Friday) for scheduling procedures."""
    future_date = datetime.now() + timedelta(days=days_ahead)
    # Skip Saturday (5) and Sunday (6)
    while future_date.weekday() in (5, 6):
        future_date += timedelta(days=1)
    return future_date.strftime("%Y-%m-%d")

class TestPhotoWorkflowPhaseA:
    """Tests for Phase A New Case workflow - Photo upload and phase transitions"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        """Shared requests session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture(scope="class")
    def auth_token(self, api_client):
        """Get authentication token for student"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("token")
            return token
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def authenticated_client(self, api_client, auth_token):
        """Session with auth header"""
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        return api_client
    
    @pytest.fixture(scope="class")
    def supervisor_info(self, authenticated_client):
        """Get a supervisor user for creating procedures"""
        response = authenticated_client.get(f"{BASE_URL}/api/users?role=supervisor")
        if response.status_code == 200 and response.json():
            supervisor = response.json()[0]
            return {"id": supervisor["id"], "name": supervisor.get("name", "Supervisor")}
        pytest.skip("No supervisor found")
    
    @pytest.fixture(scope="class")
    def incharge_info(self, authenticated_client):
        """Get an implant incharge user for creating procedures"""
        response = authenticated_client.get(f"{BASE_URL}/api/users?role=implant_incharge")
        if response.status_code == 200 and response.json():
            incharge = response.json()[0]
            return {"id": incharge["id"], "name": incharge.get("name", "Incharge")}
        pytest.skip("No implant incharge found")
    
    @pytest.fixture(scope="class")
    def test_procedure_id(self, authenticated_client, supervisor_info, incharge_info):
        """Create a test procedure for photo tests"""
        # Create a procedure scheduled for a valid weekday (>24 hours ahead)
        future_date = get_valid_weekday_date(3)
        
        procedure_data = {
            "student_name": "TEST_Photo_Student",
            "patient_name": "TEST_Photo_Patient",
            "registration_number": "TEST_REG_PHOTO_001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST_REC_PHOTO_001",
            "amount_paid": 15000.0,
            "procedure_date": future_date,
            "procedure_time": "10:00",  # Safe time slot
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/procedures", json=procedure_data)
        if response.status_code == 200:
            procedure_id = response.json()["id"]
            yield procedure_id
            # Cleanup after tests
            try:
                # Get admin token for cleanup
                admin_response = authenticated_client.post(f"{BASE_URL}/api/auth/login", json={
                    "email": "abhijit.patil@dental.edu",
                    "password": "Admin@123"
                })
                if admin_response.status_code == 200:
                    admin_token = admin_response.json().get("token")
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/procedures/{procedure_id}",
                        headers={"Authorization": f"Bearer {admin_token}"}
                    )
            except:
                pass
        else:
            pytest.skip(f"Failed to create test procedure: {response.status_code} - {response.text}")
    
    # ─── Test 1: Create procedure with draft status ───────────────────
    def test_create_procedure_draft_status(self, authenticated_client, supervisor_info, incharge_info):
        """POST /api/procedures creates case in draft status"""
        future_date = get_valid_weekday_date(4)
        
        procedure_data = {
            "student_name": "TEST_Draft_Student",
            "patient_name": "TEST_Draft_Patient",
            "registration_number": "TEST_REG_DRAFT_001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST_REC_DRAFT_001",
            "amount_paid": 12000.0,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/procedures", json=procedure_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert data["status"] == "draft", f"Expected status 'draft', got '{data.get('status')}'"
        
        # Store for cleanup
        procedure_id = data["id"]
        print(f"✓ Created procedure {procedure_id} with draft status")
        
        # Verify via GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/procedures/{procedure_id}")
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "draft"
        print("✓ Verified procedure is in draft status via GET")
    
    # ─── Test 2: Save implant plan ─────────────────────────────────────
    def test_save_implant_plan(self, authenticated_client, test_procedure_id):
        """POST /api/procedures/{id}/implant-plan saves implant plans"""
        implant_plan_data = {
            "implants": [
                {
                    "position": "14",
                    "brand": "Straumann",
                    "system": "BLX",
                    "diameter": 4.0,
                    "length": 10.0,
                    "bone_width": 8.0,
                    "bone_height": 12.0,
                    "bone_type": "D2",
                    "risk_level": "Low",
                    "risk_score": 3
                }
            ]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{test_procedure_id}/implant-plan",
            json=implant_plan_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        assert data.get("count") == 1, f"Expected count 1, got {data.get('count')}"
        print(f"✓ Saved implant plan with {data.get('count')} implant(s)")
        
        # Verify via GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/procedures/{test_procedure_id}/implant-plan")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert len(get_data.get("implant_plans", [])) == 1
        assert get_data["implant_plans"][0]["position"] == "14"
        print("✓ Verified implant plan saved correctly via GET")
    
    # ─── Test 3: Get photo steps for specific phase ────────────────────
    def test_get_photo_steps_phase1(self, authenticated_client):
        """GET /api/photo-steps/{phase} returns photo steps for phases"""
        response = authenticated_client.get(f"{BASE_URL}/api/photo-steps/1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "name" in data, "Response should contain 'name'"
        assert "steps" in data, "Response should contain 'steps'"
        assert data["name"] == "Pre-Surgical Documentation"
        assert len(data["steps"]) > 0, "Should have at least one step"
        
        # Verify step structure
        first_step = data["steps"][0]
        assert "id" in first_step
        assert "label" in first_step
        assert "category" in first_step
        print(f"✓ Retrieved Phase 1 photo steps: {len(data['steps'])} steps")
        print(f"  First step: {first_step['id']} - {first_step['label']}")
    
    def test_get_photo_steps_phase2(self, authenticated_client):
        """GET /api/photo-steps/{phase} returns photo steps for phase 2"""
        response = authenticated_client.get(f"{BASE_URL}/api/photo-steps/2")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == "Surgical Documentation"
        assert len(data["steps"]) > 0
        print(f"✓ Retrieved Phase 2 photo steps: {len(data['steps'])} steps")
    
    # ─── Test 4: Get all photo steps ───────────────────────────────────
    def test_get_all_photo_steps(self, authenticated_client):
        """GET /api/photo-steps returns all photo steps for all phases"""
        response = authenticated_client.get(f"{BASE_URL}/api/photo-steps")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should have phases 1-4
        assert "1" in data or 1 in data, "Should have Phase 1"
        assert "2" in data or 2 in data, "Should have Phase 2"
        
        # Count total steps across all phases
        total_steps = 0
        for phase_key, phase_data in data.items():
            if isinstance(phase_data, dict) and "steps" in phase_data:
                total_steps += len(phase_data["steps"])
        
        print(f"✓ Retrieved all photo steps: {len(data)} phases, {total_steps} total steps")
    
    # ─── Test 5: Upload photo (multipart/form-data) ────────────────────
    def test_upload_photo(self, authenticated_client, auth_token, test_procedure_id):
        """POST /api/procedures/{id}/photos/{step_id} uploads a photo"""
        # Create a minimal PNG image (1x1 pixel)
        # PNG header + minimal IDAT chunk for 1x1 red pixel
        png_data = (
            b'\x89PNG\r\n\x1a\n'  # PNG signature
            b'\x00\x00\x00\rIHDR'  # IHDR chunk length + type
            b'\x00\x00\x00\x01'    # Width: 1
            b'\x00\x00\x00\x01'    # Height: 1
            b'\x08\x02'            # Bit depth: 8, Color type: 2 (RGB)
            b'\x00\x00\x00'        # Compression, filter, interlace
            b'\x90wS\xde'          # CRC
            b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N'  # IDAT
            b'\x00\x00\x00\x00IEND\xaeB`\x82'  # IEND
        )
        
        # Use a valid step_id from Phase 1
        step_id = "p1_extraoral_rest"
        
        # Need to use multipart/form-data, so remove JSON content-type
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        files = {
            'file': ('test_photo.png', io.BytesIO(png_data), 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{test_procedure_id}/photos/{step_id}",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message'"
        assert data.get("step_id") == step_id
        assert "filename" in data
        print(f"✓ Uploaded photo: {data.get('filename')} for step {step_id}")
    
    def test_upload_photo_jpeg(self, authenticated_client, auth_token, test_procedure_id):
        """POST /api/procedures/{id}/photos/{step_id} uploads a JPEG photo"""
        # Minimal valid JPEG (1x1 pixel)
        jpeg_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xBA, 0xA3, 0xA0,
            0xAD, 0x00, 0xFF, 0xD9
        ])
        
        step_id = "p1_extraoral_smile"
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        files = {
            'file': ('test_photo.jpg', io.BytesIO(jpeg_data), 'image/jpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{test_procedure_id}/photos/{step_id}",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("step_id") == step_id
        print(f"✓ Uploaded JPEG photo: {data.get('filename')} for step {step_id}")
    
    # ─── Test 6: Get procedure photos grouped by phase ─────────────────
    def test_get_procedure_photos(self, authenticated_client, test_procedure_id):
        """GET /api/procedures/{id}/photos returns uploaded photos grouped by phase"""
        response = authenticated_client.get(f"{BASE_URL}/api/procedures/{test_procedure_id}/photos")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Should have phases
        assert "1" in data or 1 in data, "Should have Phase 1 in response"
        
        # Get phase 1 data (key might be string or int depending on serialization)
        phase1_key = "1" if "1" in data else 1
        phase1_data = data[phase1_key]
        
        assert "name" in phase1_data, "Phase should have 'name'"
        assert "steps" in phase1_data, "Phase should have 'steps'"
        assert "total" in phase1_data, "Phase should have 'total'"
        assert "completed" in phase1_data, "Phase should have 'completed'"
        
        # Check that we have uploaded photos
        assert phase1_data["completed"] >= 2, f"Expected at least 2 completed steps, got {phase1_data['completed']}"
        
        print(f"✓ Retrieved procedure photos:")
        print(f"  Phase 1: {phase1_data['completed']}/{phase1_data['total']} steps completed")
        
        # Verify step structure
        for step in phase1_data["steps"]:
            if step["has_photo"]:
                assert len(step["photos"]) > 0
                print(f"  - {step['step_id']}: {len(step['photos'])} photo(s)")
    
    # ─── Test 7: Request Phase 1 approval ──────────────────────────────
    def test_request_phase1_approval(self, authenticated_client, supervisor_info, incharge_info):
        """POST /api/procedures/{id}/request-phase1-approval transitions draft to pending_phase1"""
        # Create a fresh procedure for this test
        future_date = get_valid_weekday_date(5)
        
        procedure_data = {
            "student_name": "TEST_Approval_Student",
            "patient_name": "TEST_Approval_Patient",
            "registration_number": "TEST_REG_APPROVAL_001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST_REC_APPROVAL_001",
            "amount_paid": 18000.0,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        # Create procedure (status will be 'draft')
        create_response = authenticated_client.post(f"{BASE_URL}/api/procedures", json=procedure_data)
        assert create_response.status_code == 200, f"Failed to create procedure: {create_response.text}"
        
        procedure_id = create_response.json()["id"]
        assert create_response.json()["status"] == "draft"
        print(f"✓ Created draft procedure: {procedure_id}")
        
        # Request Phase 1 approval
        approval_response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval"
        )
        assert approval_response.status_code == 200, f"Expected 200, got {approval_response.status_code}: {approval_response.text}"
        
        data = approval_response.json()
        assert data["status"] == "pending_phase1", f"Expected 'pending_phase1', got '{data.get('status')}'"
        print(f"✓ Procedure status changed from 'draft' to 'pending_phase1'")
        
        # Verify via GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/procedures/{procedure_id}")
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "pending_phase1"
        print("✓ Verified status change via GET")
    
    def test_request_phase1_approval_already_pending(self, authenticated_client, supervisor_info, incharge_info):
        """Requesting approval on a non-draft case should fail"""
        # Find a weekday date (avoid Saturday and Sunday)
        future_date_str = get_valid_weekday_date(6)
        
        procedure_data = {
            "student_name": "TEST_AlreadyPending_Student",
            "patient_name": "TEST_AlreadyPending_Patient",
            "registration_number": "TEST_REG_ALREADY_001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST_REC_ALREADY_001",
            "amount_paid": 15000.0,
            "procedure_date": future_date_str,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/procedures", json=procedure_data)
        assert create_response.status_code == 200
        procedure_id = create_response.json()["id"]
        
        # First approval request (should succeed)
        first_approval = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval"
        )
        assert first_approval.status_code == 200
        
        # Second approval request (should fail - not in draft status)
        second_approval = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval"
        )
        assert second_approval.status_code == 400, f"Expected 400 for non-draft case, got {second_approval.status_code}"
        print("✓ Correctly rejected approval request for non-draft case")


class TestPhotoUploadValidation:
    """Tests for photo upload validation"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture(scope="class")
    def auth_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_photo_upload_invalid_step_id(self, auth_token):
        """Upload to invalid step_id should fail"""
        # Create minimal PNG
        png_data = (
            b'\x89PNG\r\n\x1a\n'
            b'\x00\x00\x00\rIHDR'
            b'\x00\x00\x00\x01'
            b'\x00\x00\x00\x01'
            b'\x08\x02'
            b'\x00\x00\x00'
            b'\x90wS\xde'
            b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N'
            b'\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        
        # First get an existing procedure
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No procedures available for test")
        
        procedure_id = response.json()[0]["id"]
        
        # Try uploading to invalid step_id
        files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
        upload_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/photos/invalid_step_xyz",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 400, f"Expected 400 for invalid step_id, got {upload_response.status_code}"
        print("✓ Correctly rejected upload to invalid step_id")
    
    def test_photo_upload_invalid_file_type(self, auth_token):
        """Upload non-image file should fail"""
        # Create a text file
        text_data = b"This is not an image file"
        
        # Get an existing procedure
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No procedures available for test")
        
        procedure_id = response.json()[0]["id"]
        
        # Try uploading text file
        files = {'file': ('test.txt', io.BytesIO(text_data), 'text/plain')}
        upload_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/photos/p1_extraoral_rest",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 400, f"Expected 400 for invalid file type, got {upload_response.status_code}"
        print("✓ Correctly rejected non-image file upload")


class TestImplantPlanValidation:
    """Tests for implant plan validation"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture(scope="class")
    def auth_token(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def authenticated_client(self, api_client, auth_token):
        api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
        return api_client
    
    def test_implant_plan_multiple_implants(self, authenticated_client):
        """Test saving multiple implants in a plan"""
        # Get an existing draft procedure
        response = authenticated_client.get(f"{BASE_URL}/api/procedures?status=draft")
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No draft procedures available for test")
        
        procedure_id = response.json()[0]["id"]
        
        # Save multiple implants
        implant_plan_data = {
            "implants": [
                {
                    "position": "14",
                    "brand": "Straumann",
                    "system": "BLX",
                    "diameter": 4.0,
                    "length": 10.0
                },
                {
                    "position": "15",
                    "brand": "Nobel Biocare",
                    "system": "NobelActive",
                    "diameter": 4.3,
                    "length": 11.5
                }
            ]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan",
            json=implant_plan_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("count") == 2
        print(f"✓ Saved multiple implants plan for procedure {procedure_id}")
    
    def test_implant_plan_duplicate_positions_rejected(self, authenticated_client):
        """Test that duplicate positions are rejected"""
        # Get an existing draft procedure
        response = authenticated_client.get(f"{BASE_URL}/api/procedures?status=draft")
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No draft procedures available for test")
        
        procedure_id = response.json()[0]["id"]
        
        # Try saving with duplicate positions
        implant_plan_data = {
            "implants": [
                {
                    "position": "14",
                    "brand": "Straumann",
                    "system": "BLX",
                    "diameter": 4.0,
                    "length": 10.0
                },
                {
                    "position": "14",  # Duplicate position
                    "brand": "Nobel Biocare",
                    "system": "NobelActive",
                    "diameter": 4.3,
                    "length": 11.5
                }
            ]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan",
            json=implant_plan_data
        )
        
        assert response.status_code == 400, f"Expected 400 for duplicate positions, got {response.status_code}"
        print("✓ Correctly rejected duplicate implant positions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
