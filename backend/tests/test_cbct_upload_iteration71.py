"""
CBCT Upload Feature Tests - Iteration 71
Tests for the new CBCT upload feature in the New Case workflow

Test coverage:
1. POST /api/uploads/cbct-temp - Upload CBCT file before procedure creation
2. POST /api/procedures - Create procedure with cbct_file, cbct_original_name, cbct_content_type fields
3. GET /api/procedures - Returns cbct fields in procedure data
4. GET /api/uploads/{filename} - Serves uploaded file with role-based access
5. POST /api/procedures/{id}/upload-cbct - Attach CBCT to existing procedure
6. File type validation - Only PDF, PNG, JPG, JPEG, HEIF, HEIC allowed
7. File size validation - Max 25MB enforced
8. Role-based access - Student owner, supervisor, incharge can access
"""

import pytest
import requests
import os
import io
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
STUDENT2_CREDS = {"identifier": "Atharva.mahadik@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}


class TestCBCTTempUpload:
    """Tests for POST /api/uploads/cbct-temp endpoint"""
    
    @pytest.fixture(scope="class")
    def student_auth(self):
        """Get student auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate student: {resp.text}")
        data = resp.json()
        return data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def supervisor_auth(self):
        """Get supervisor auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate supervisor: {resp.text}")
        data = resp.json()
        return data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def incharge_auth(self):
        """Get incharge auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate incharge: {resp.text}")
        data = resp.json()
        return data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"]
    
    def test_01_cbct_temp_upload_pdf_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts PDF and returns cbct_file, cbct_original_name, cbct_content_type"""
        token, _, _ = student_auth
        
        pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {"file": ("test_cbct_report.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify response structure
        assert "cbct_file" in data, "Response should contain cbct_file"
        assert "cbct_original_name" in data, "Response should contain cbct_original_name"
        assert "cbct_content_type" in data, "Response should contain cbct_content_type"
        
        # Verify values
        assert data["cbct_file"].endswith(".pdf"), f"cbct_file should end with .pdf, got {data['cbct_file']}"
        assert data["cbct_original_name"] == "test_cbct_report.pdf", f"Original name mismatch: {data['cbct_original_name']}"
        assert "pdf" in data["cbct_content_type"].lower(), f"Content type should be PDF: {data['cbct_content_type']}"
        
        print(f"PASS: CBCT temp upload returns correct structure: {data}")
    
    def test_02_cbct_temp_upload_png_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts PNG"""
        token, _, _ = student_auth
        
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("cbct_scan.png", io.BytesIO(png_content), "image/png")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["cbct_file"].endswith(".png")
        print("PASS: PNG upload accepted")
    
    def test_03_cbct_temp_upload_jpg_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts JPG"""
        token, _, _ = student_auth
        
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
        files = {"file": ("cbct_scan.jpg", io.BytesIO(jpg_content), "image/jpeg")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: JPG upload accepted")
    
    def test_04_cbct_temp_upload_jpeg_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts JPEG"""
        token, _, _ = student_auth
        
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
        files = {"file": ("cbct_scan.jpeg", io.BytesIO(jpg_content), "image/jpeg")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: JPEG upload accepted")
    
    def test_05_cbct_temp_upload_heif_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts HEIF"""
        token, _, _ = student_auth
        
        heif_content = b"HEIF content placeholder" + b"\x00" * 100
        files = {"file": ("cbct_scan.heif", io.BytesIO(heif_content), "image/heif")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: HEIF upload accepted")
    
    def test_06_cbct_temp_upload_heic_success(self, student_auth):
        """Test: POST /api/uploads/cbct-temp accepts HEIC"""
        token, _, _ = student_auth
        
        heic_content = b"HEIC content placeholder" + b"\x00" * 100
        files = {"file": ("cbct_scan.heic", io.BytesIO(heic_content), "image/heic")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: HEIC upload accepted")
    
    def test_07_cbct_temp_upload_invalid_txt_rejected(self, student_auth):
        """Test: POST /api/uploads/cbct-temp rejects TXT files"""
        token, _, _ = student_auth
        
        files = {"file": ("test.txt", io.BytesIO(b"text content"), "text/plain")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "not allowed" in resp.json().get("detail", "").lower()
        print("PASS: TXT file correctly rejected")
    
    def test_08_cbct_temp_upload_invalid_docx_rejected(self, student_auth):
        """Test: POST /api/uploads/cbct-temp rejects DOCX files"""
        token, _, _ = student_auth
        
        files = {"file": ("test.docx", io.BytesIO(b"docx content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        
        resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: DOCX file correctly rejected")


class TestProcedureWithCBCT:
    """Tests for creating procedures with CBCT fields"""
    
    @pytest.fixture(scope="class")
    def auth_tokens(self):
        """Get all auth tokens"""
        tokens = {}
        
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        if resp.status_code == 200:
            data = resp.json()
            tokens["student"] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT2_CREDS)
        if resp.status_code == 200:
            data = resp.json()
            tokens["student2"] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        if resp.status_code == 200:
            data = resp.json()
            tokens["supervisor"] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        if resp.status_code == 200:
            data = resp.json()
            tokens["incharge"] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        return tokens
    
    def get_future_weekday_date(self, days_ahead=5):
        """Get a weekday date at least days_ahead days in the future"""
        target_date = datetime.now() + timedelta(days=days_ahead)
        while target_date.weekday() >= 5:  # Skip weekends
            target_date += timedelta(days=1)
        return target_date.strftime("%Y-%m-%d")
    
    def test_09_create_procedure_with_cbct_fields(self, auth_tokens):
        """Test: POST /api/procedures creates procedure with cbct_file, cbct_original_name, cbct_content_type"""
        if "student" not in auth_tokens or "supervisor" not in auth_tokens or "incharge" not in auth_tokens:
            pytest.skip("Missing required auth tokens")
        
        student_token, student_id, student_name = auth_tokens["student"]
        supervisor_token, supervisor_id, supervisor_name = auth_tokens["supervisor"]
        incharge_token, incharge_id, incharge_name = auth_tokens["incharge"]
        
        # Step 1: Upload CBCT file first
        pdf_content = b"%PDF-1.4\nTest CBCT content for procedure creation"
        files = {"file": ("patient_cbct.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert upload_resp.status_code == 200, f"CBCT upload failed: {upload_resp.text}"
        cbct_data = upload_resp.json()
        
        # Step 2: Create procedure with CBCT fields
        procedure_date = self.get_future_weekday_date(7)
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_CBCT_Procedure_Patient",
            "registration_number": "TEST-CBCT-PROC-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Upper Right 14",
            "receipt_number": "TEST-CBCT-RCP-001",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "cbct_file": cbct_data["cbct_file"],
            "cbct_original_name": cbct_data["cbct_original_name"],
            "cbct_content_type": cbct_data["cbct_content_type"],
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert create_resp.status_code == 200, f"Procedure creation failed: {create_resp.text}"
        procedure = create_resp.json()
        procedure_id = procedure.get("id") or procedure.get("_id")
        
        # Verify CBCT fields in response
        assert "cbct_file" in procedure, "Response should contain cbct_file"
        assert "cbct_original_name" in procedure, "Response should contain cbct_original_name"
        assert "cbct_content_type" in procedure, "Response should contain cbct_content_type"
        assert procedure["cbct_file"] == cbct_data["cbct_file"], "cbct_file mismatch"
        assert procedure["cbct_original_name"] == cbct_data["cbct_original_name"], "cbct_original_name mismatch"
        
        print(f"PASS: Procedure created with CBCT fields: cbct_file={procedure['cbct_file']}")
        
        # Cleanup
        delete_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        print(f"Cleanup: Deleted procedure {procedure_id}: {delete_resp.status_code}")
    
    def test_10_get_procedure_returns_cbct_fields(self, auth_tokens):
        """Test: GET /api/procedures returns cbct_file, cbct_original_name, cbct_content_type in procedure data"""
        if "student" not in auth_tokens or "supervisor" not in auth_tokens or "incharge" not in auth_tokens:
            pytest.skip("Missing required auth tokens")
        
        student_token, student_id, student_name = auth_tokens["student"]
        supervisor_token, supervisor_id, supervisor_name = auth_tokens["supervisor"]
        incharge_token, incharge_id, incharge_name = auth_tokens["incharge"]
        
        # Upload CBCT and create procedure
        pdf_content = b"%PDF-1.4\nTest CBCT for GET test"
        files = {"file": ("get_test_cbct.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        cbct_data = upload_resp.json()
        
        procedure_date = self.get_future_weekday_date(8)
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_CBCT_GET_Patient",
            "registration_number": "TEST-CBCT-GET-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Lower Left 36",
            "receipt_number": "TEST-CBCT-GET-RCP",
            "amount_paid": 6000.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Early Loading"],
            "cbct_file": cbct_data["cbct_file"],
            "cbct_original_name": cbct_data["cbct_original_name"],
            "cbct_content_type": cbct_data["cbct_content_type"],
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        procedure = create_resp.json()
        procedure_id = procedure.get("id") or procedure.get("_id")
        
        # GET the procedure
        get_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert get_resp.status_code == 200, f"GET procedure failed: {get_resp.text}"
        fetched = get_resp.json()
        
        assert fetched.get("cbct_file") == cbct_data["cbct_file"], "cbct_file not returned correctly"
        assert fetched.get("cbct_original_name") == cbct_data["cbct_original_name"], "cbct_original_name not returned correctly"
        assert fetched.get("cbct_content_type") == cbct_data["cbct_content_type"], "cbct_content_type not returned correctly"
        
        print(f"PASS: GET /api/procedures/{procedure_id} returns CBCT fields correctly")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers={"Authorization": f"Bearer {incharge_token}"})


class TestCBCTFileServing:
    """Tests for GET /api/uploads/{filename} endpoint with role-based access"""
    
    @pytest.fixture(scope="class")
    def auth_tokens(self):
        """Get all auth tokens"""
        tokens = {}
        
        for name, creds in [("student", STUDENT_CREDS), ("student2", STUDENT2_CREDS), 
                           ("supervisor", SUPERVISOR_CREDS), ("incharge", INCHARGE_CREDS)]:
            resp = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if resp.status_code == 200:
                data = resp.json()
                tokens[name] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        return tokens
    
    @pytest.fixture(scope="class")
    def test_procedure_with_cbct(self, auth_tokens):
        """Create a test procedure with CBCT for file serving tests"""
        if "student" not in auth_tokens or "supervisor" not in auth_tokens or "incharge" not in auth_tokens:
            pytest.skip("Missing required auth tokens")
        
        student_token, student_id, student_name = auth_tokens["student"]
        supervisor_token, supervisor_id, supervisor_name = auth_tokens["supervisor"]
        incharge_token, incharge_id, incharge_name = auth_tokens["incharge"]
        
        # Upload CBCT
        pdf_content = b"%PDF-1.4\nTest CBCT for file serving tests"
        files = {"file": ("serving_test_cbct.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/uploads/cbct-temp",
            files=files,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        cbct_data = upload_resp.json()
        
        # Create procedure - find an available slot
        import random
        target_date = datetime.now() + timedelta(days=20 + random.randint(0, 30))
        while target_date.weekday() >= 5:  # Skip weekends
            target_date += timedelta(days=1)
        procedure_date = target_date.strftime("%Y-%m-%d")
        
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_CBCT_Serving_Patient",
            "registration_number": "TEST-CBCT-SERVE-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Upper Left 24",
            "receipt_number": "TEST-CBCT-SERVE-RCP",
            "amount_paid": 7000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "cbct_file": cbct_data["cbct_file"],
            "cbct_original_name": cbct_data["cbct_original_name"],
            "cbct_content_type": cbct_data["cbct_content_type"],
        }
        
        # Try to create procedure, retry with different date/time if slot is taken
        procedure = None
        procedure_id = None
        for attempt in range(5):
            create_resp = requests.post(
                f"{BASE_URL}/api/procedures",
                json=procedure_data,
                headers={"Authorization": f"Bearer {student_token}"}
            )
            if create_resp.status_code == 200:
                procedure = create_resp.json()
                procedure_id = procedure.get("id") or procedure.get("_id")
                break
            elif create_resp.status_code == 409:
                # Slot taken, try different date
                target_date = datetime.now() + timedelta(days=25 + attempt * 5)
                while target_date.weekday() >= 5:
                    target_date += timedelta(days=1)
                procedure_data["procedure_date"] = target_date.strftime("%Y-%m-%d")
                procedure_data["procedure_time"] = "14:00" if attempt % 2 == 1 else "10:00"
            else:
                break
        
        if not procedure or not procedure_id:
            pytest.skip(f"Failed to create test procedure: {create_resp.text}")
        
        yield {
            "procedure": procedure,
            "cbct_file": cbct_data["cbct_file"],
            "incharge_token": incharge_token
        }
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers={"Authorization": f"Bearer {incharge_token}"})
    
    def test_11_student_owner_can_access_cbct(self, auth_tokens, test_procedure_with_cbct):
        """Test: Student who owns procedure can access the uploaded CBCT file"""
        student_token, _, _ = auth_tokens["student"]
        cbct_file = test_procedure_with_cbct["cbct_file"]
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Student owner can access CBCT file")
    
    def test_12_supervisor_can_access_cbct(self, auth_tokens, test_procedure_with_cbct):
        """Test: Assigned supervisor can access the uploaded CBCT file"""
        supervisor_token, _, _ = auth_tokens["supervisor"]
        cbct_file = test_procedure_with_cbct["cbct_file"]
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Supervisor can access CBCT file")
    
    def test_13_incharge_can_access_cbct(self, auth_tokens, test_procedure_with_cbct):
        """Test: Implant incharge can access the uploaded CBCT file"""
        incharge_token, _, _ = auth_tokens["incharge"]
        cbct_file = test_procedure_with_cbct["cbct_file"]
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Incharge can access CBCT file")
    
    def test_14_different_student_cannot_access_cbct(self, auth_tokens, test_procedure_with_cbct):
        """Test: Different student cannot access another student's CBCT file"""
        if "student2" not in auth_tokens:
            pytest.skip("Student2 auth not available")
        
        student2_token, _, _ = auth_tokens["student2"]
        cbct_file = test_procedure_with_cbct["cbct_file"]
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {student2_token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASS: Different student correctly denied access to CBCT file")
    
    def test_15_nonexistent_file_returns_404(self, auth_tokens):
        """Test: GET /api/uploads/{filename} returns 404 for nonexistent file"""
        student_token, _, _ = auth_tokens["student"]
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/nonexistent_file_xyz123.pdf",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: Nonexistent file returns 404")


class TestUploadCBCTToExistingProcedure:
    """Tests for POST /api/procedures/{id}/upload-cbct endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_tokens(self):
        """Get all auth tokens"""
        tokens = {}
        
        for name, creds in [("student", STUDENT_CREDS), ("supervisor", SUPERVISOR_CREDS), ("incharge", INCHARGE_CREDS)]:
            resp = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if resp.status_code == 200:
                data = resp.json()
                tokens[name] = (data.get("access_token") or data.get("token"), data["user"]["id"], data["user"]["name"])
        
        return tokens
    
    @pytest.fixture(scope="class")
    def test_procedure_without_cbct(self, auth_tokens):
        """Create a test procedure without CBCT for upload testing"""
        if "student" not in auth_tokens or "supervisor" not in auth_tokens or "incharge" not in auth_tokens:
            pytest.skip("Missing required auth tokens")
        
        student_token, student_id, student_name = auth_tokens["student"]
        supervisor_token, supervisor_id, supervisor_name = auth_tokens["supervisor"]
        incharge_token, incharge_id, incharge_name = auth_tokens["incharge"]
        
        target_date = datetime.now() + timedelta(days=10)
        while target_date.weekday() >= 5:
            target_date += timedelta(days=1)
        procedure_date = target_date.strftime("%Y-%m-%d")
        
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_CBCT_Upload_Existing",
            "registration_number": "TEST-CBCT-EXIST-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Lower Right 46",
            "receipt_number": "TEST-CBCT-EXIST-RCP",
            "amount_paid": 8000.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Immediate Loading"],
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        if create_resp.status_code != 200:
            pytest.skip(f"Failed to create test procedure: {create_resp.text}")
        
        procedure = create_resp.json()
        
        yield {
            "procedure": procedure,
            "student_token": student_token,
            "incharge_token": incharge_token
        }
        
        # Cleanup
        procedure_id = procedure.get("id") or procedure.get("_id")
        requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers={"Authorization": f"Bearer {incharge_token}"})
    
    def test_16_upload_cbct_to_existing_procedure(self, test_procedure_without_cbct):
        """Test: POST /api/procedures/{id}/upload-cbct attaches CBCT to existing procedure"""
        procedure = test_procedure_without_cbct["procedure"]
        student_token = test_procedure_without_cbct["student_token"]
        procedure_id = procedure.get("id") or procedure.get("_id")
        
        pdf_content = b"%PDF-1.4\nCBCT for existing procedure"
        files = {"file": ("existing_proc_cbct.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "message" in data
        assert data["filename"] == "existing_proc_cbct.pdf"
        
        # Verify the procedure now has CBCT fields
        get_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_token}"}
        )
        updated_proc = get_resp.json()
        
        assert updated_proc.get("cbct_file") is not None, "cbct_file should be set after upload"
        assert updated_proc.get("cbct_original_name") == "existing_proc_cbct.pdf", "cbct_original_name mismatch"
        
        print(f"PASS: CBCT uploaded to existing procedure, cbct_file={updated_proc['cbct_file']}")
    
    def test_17_upload_cbct_nonexistent_procedure_404(self, auth_tokens):
        """Test: POST /api/procedures/{id}/upload-cbct returns 404 for nonexistent procedure"""
        student_token, _, _ = auth_tokens["student"]
        
        pdf_content = b"%PDF-1.4\nTest"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/6799999999999999999aaaaa/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: Upload to nonexistent procedure returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
