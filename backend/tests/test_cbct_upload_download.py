"""
CBCT File Upload/Download Backend Tests
Tests for iteration 8 - CBCT file upload and download endpoints

Test coverage:
1. CBCT Upload: POST /api/procedures/{id}/upload-cbct with valid PDF returns success
2. CBCT Upload: POST /api/procedures/{id}/upload-cbct rejects invalid extensions
3. CBCT Upload: Only owning student can upload to their procedure
4. CBCT Upload: Non-student role (supervisor) gets 403 on upload
5. CBCT Download: GET /api/uploads/{filename} returns file for authorized users
6. CBCT Download: GET /api/uploads/{filename} returns 403 for unauthorized users
7. CBCT Download: GET /api/uploads/nonexistent returns 404
8. Procedure detail includes cbct_file and cbct_original_name after upload
"""

import pytest
import requests
import os
import io
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prosth-case-album.preview.emergentagent.com').rstrip('/')

# Test credentials
STUDENT1_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT1_PASSWORD = "Student@123"

STUDENT2_EMAIL = "atharva.mahadik@student.dental.edu"
STUDENT2_PASSWORD = "Student@123"

SUPERVISOR_EMAIL = "vasantha.n@dental.edu"
SUPERVISOR_PASSWORD = "Supervisor@123"

IMPLANT_INCHARGE_EMAIL = "abhijit.patil@dental.edu"
IMPLANT_INCHARGE_PASSWORD = "Admin@123"

NURSE_EMAIL = "priya.sharma@dental.edu"
NURSE_PASSWORD = "Nurse@123"


class TestCBCTUploadDownload:
    """Tests for CBCT file upload and download functionality"""
    
    @pytest.fixture(scope="class")
    def student1_token(self):
        """Get auth token for student 1"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT1_EMAIL,
            "password": STUDENT1_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate student1: {resp.text}")
        data = resp.json()
        return data["token"], data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def student2_token(self):
        """Get auth token for student 2"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT2_EMAIL,
            "password": STUDENT2_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate student2: {resp.text}")
        data = resp.json()
        return data["token"], data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get auth token for supervisor"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate supervisor: {resp.text}")
        data = resp.json()
        return data["token"], data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def implant_incharge_token(self):
        """Get auth token for implant incharge"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": IMPLANT_INCHARGE_EMAIL,
            "password": IMPLANT_INCHARGE_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate implant incharge: {resp.text}")
        data = resp.json()
        return data["token"], data["user"]["id"], data["user"]["name"]
    
    @pytest.fixture(scope="class")
    def nurse_token(self):
        """Get auth token for nurse"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": NURSE_EMAIL,
            "password": NURSE_PASSWORD
        })
        if resp.status_code != 200:
            pytest.skip(f"Failed to authenticate nurse: {resp.text}")
        data = resp.json()
        return data["token"], data["user"]["id"]
    
    def get_future_weekday_date(self, days_ahead=5):
        """Get a weekday date at least days_ahead days in the future"""
        target_date = datetime.now() + timedelta(days=days_ahead)
        # Make sure it's a weekday (Monday=0 to Friday=4)
        while target_date.weekday() >= 5:  # Saturday or Sunday
            target_date += timedelta(days=1)
        return target_date.strftime("%Y-%m-%d")
    
    @pytest.fixture(scope="class")
    def test_procedure(self, student1_token, supervisor_token, implant_incharge_token):
        """Create a test procedure for CBCT upload testing"""
        token, student_id, student_name = student1_token
        supervisor_tok, supervisor_id, supervisor_name = supervisor_token
        incharge_tok, incharge_id, incharge_name = implant_incharge_token
        
        procedure_date = self.get_future_weekday_date(5)
        
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_CBCT_Patient",
            "registration_number": "TEST-CBCT-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Upper Right 14",
            "receipt_number": "TEST-CBCT-RCP-001",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_specifications": "Test implant specs for CBCT testing",
            "bone_graft_specifications": "Test bone graft specs for CBCT testing",
            "remark": "Test procedure for CBCT upload testing"
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if resp.status_code != 200:
            pytest.fail(f"Failed to create test procedure: {resp.status_code} - {resp.text}")
        
        procedure = resp.json()
        yield procedure
        
        # Cleanup - delete the procedure after tests
        delete_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{procedure['id']}",
            headers={"Authorization": f"Bearer {incharge_tok}"}
        )
        print(f"Cleanup: Deleted test procedure {procedure['id']}: {delete_resp.status_code}")
    
    def create_test_file(self, extension, content=b"Test file content for CBCT testing"):
        """Create a test file with given extension"""
        return io.BytesIO(content)
    
    # ========== UPLOAD TESTS ==========
    
    def test_01_upload_cbct_pdf_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid PDF returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Create a test PDF file
        pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF"
        files = {"file": ("test_cbct.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "message" in data
        assert data["message"] == "File uploaded successfully"
        assert data["filename"] == "test_cbct.pdf"
        print(f"PASS: PDF upload successful - {data['message']}")
    
    def test_02_upload_cbct_png_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid PNG returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Create a minimal PNG file header
        png_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("test_cbct.png", io.BytesIO(png_content), "image/png")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: PNG upload successful")
    
    def test_03_upload_cbct_jpg_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid JPG returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Create a minimal JPEG file header
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
        files = {"file": ("test_cbct.jpg", io.BytesIO(jpg_content), "image/jpeg")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: JPG upload successful")
    
    def test_04_upload_cbct_jpeg_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid JPEG returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 100
        files = {"file": ("test_cbct.jpeg", io.BytesIO(jpg_content), "image/jpeg")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: JPEG upload successful")
    
    def test_05_upload_cbct_heif_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid HEIF returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # HEIF files have different content but extension is what matters for validation
        heif_content = b"HEIF image content placeholder" + b"\x00" * 100
        files = {"file": ("test_cbct.heif", io.BytesIO(heif_content), "image/heif")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: HEIF upload successful")
    
    def test_06_upload_cbct_heic_success(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct with valid HEIC returns success"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        heic_content = b"HEIC image content placeholder" + b"\x00" * 100
        files = {"file": ("test_cbct.heic", io.BytesIO(heic_content), "image/heic")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: HEIC upload successful")
    
    def test_07_upload_cbct_invalid_extension_txt(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct rejects .txt files"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        files = {"file": ("test.txt", io.BytesIO(b"text file content"), "text/plain")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        assert "not allowed" in resp.json().get("detail", "").lower()
        print("PASS: TXT file correctly rejected")
    
    def test_08_upload_cbct_invalid_extension_docx(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct rejects .docx files"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        files = {"file": ("test.docx", io.BytesIO(b"docx content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: DOCX file correctly rejected")
    
    def test_09_upload_cbct_invalid_extension_exe(self, student1_token, test_procedure):
        """Test: POST /api/procedures/{id}/upload-cbct rejects .exe files"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        files = {"file": ("malware.exe", io.BytesIO(b"exe content"), "application/x-msdownload")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: EXE file correctly rejected")
    
    def test_10_upload_cbct_supervisor_forbidden(self, supervisor_token, test_procedure):
        """Test: Non-student role (supervisor) gets 403 on upload"""
        token, _, _ = supervisor_token
        procedure_id = test_procedure["id"]
        
        pdf_content = b"%PDF-1.4\ntest content"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        assert "Only students can upload" in resp.json().get("detail", "")
        print("PASS: Supervisor correctly denied upload access")
    
    def test_11_upload_cbct_implant_incharge_forbidden(self, implant_incharge_token, test_procedure):
        """Test: Implant incharge gets 403 on upload"""
        token, _, _ = implant_incharge_token
        procedure_id = test_procedure["id"]
        
        pdf_content = b"%PDF-1.4\ntest content"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASS: Implant incharge correctly denied upload access")
    
    def test_12_upload_cbct_different_student_forbidden(self, student2_token, test_procedure):
        """Test: Only owning student can upload to their procedure"""
        token, _, _ = student2_token
        procedure_id = test_procedure["id"]
        
        pdf_content = b"%PDF-1.4\ntest content"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        assert "Access denied" in resp.json().get("detail", "")
        print("PASS: Different student correctly denied upload access")
    
    def test_13_upload_cbct_nonexistent_procedure(self, student1_token):
        """Test: Upload to nonexistent procedure returns 404"""
        token, _, _ = student1_token
        
        pdf_content = b"%PDF-1.4\ntest content"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/6799999999999999999aaaaa/upload-cbct",
            files=files,
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: Upload to nonexistent procedure returns 404")
    
    # ========== PROCEDURE DETAIL TESTS ==========
    
    def test_14_procedure_detail_has_cbct_fields(self, student1_token, test_procedure):
        """Test: Procedure detail includes cbct_file and cbct_original_name after upload"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # After the uploads in previous tests, these fields should exist
        assert "cbct_file" in data, "cbct_file field should exist in procedure"
        assert "cbct_original_name" in data, "cbct_original_name field should exist in procedure"
        assert data["cbct_file"] is not None, "cbct_file should not be None"
        assert data["cbct_original_name"] is not None, "cbct_original_name should not be None"
        print(f"PASS: Procedure has cbct_file={data['cbct_file']}, cbct_original_name={data['cbct_original_name']}")
    
    # ========== DOWNLOAD TESTS ==========
    
    def test_15_download_cbct_student_owner_allowed(self, student1_token, test_procedure):
        """Test: Owning student can download their procedure's CBCT file"""
        token, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # First get the procedure to find the cbct_file name
        proc_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        cbct_file = proc_resp.json().get("cbct_file")
        
        if not cbct_file:
            pytest.skip("No CBCT file uploaded yet")
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"PASS: Student owner can download CBCT file")
    
    def test_16_download_cbct_supervisor_assigned_allowed(self, supervisor_token, student1_token, test_procedure):
        """Test: Assigned supervisor can download CBCT file"""
        token, _, _ = supervisor_token
        student_tok, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Get cbct_file name
        proc_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_tok}"}
        )
        cbct_file = proc_resp.json().get("cbct_file")
        
        if not cbct_file:
            pytest.skip("No CBCT file uploaded yet")
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Assigned supervisor can download CBCT file")
    
    def test_17_download_cbct_implant_incharge_allowed(self, implant_incharge_token, student1_token, test_procedure):
        """Test: Implant incharge can download CBCT file"""
        token, _, _ = implant_incharge_token
        student_tok, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Get cbct_file name
        proc_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_tok}"}
        )
        cbct_file = proc_resp.json().get("cbct_file")
        
        if not cbct_file:
            pytest.skip("No CBCT file uploaded yet")
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: Implant incharge can download CBCT file")
    
    def test_18_download_cbct_different_student_forbidden(self, student2_token, student1_token, test_procedure):
        """Test: Different student gets 403 when trying to download"""
        token, _, _ = student2_token
        student_tok, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Get cbct_file name
        proc_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_tok}"}
        )
        cbct_file = proc_resp.json().get("cbct_file")
        
        if not cbct_file:
            pytest.skip("No CBCT file uploaded yet")
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASS: Different student correctly denied download access")
    
    def test_19_download_cbct_nurse_forbidden(self, nurse_token, student1_token, test_procedure):
        """Test: Nurse gets 403 when trying to download CBCT file"""
        token, _ = nurse_token
        student_tok, _, _ = student1_token
        procedure_id = test_procedure["id"]
        
        # Get cbct_file name
        proc_resp = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {student_tok}"}
        )
        cbct_file = proc_resp.json().get("cbct_file")
        
        if not cbct_file:
            pytest.skip("No CBCT file uploaded yet")
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/{cbct_file}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        print("PASS: Nurse correctly denied download access")
    
    def test_20_download_cbct_nonexistent_file_404(self, student1_token):
        """Test: GET /api/uploads/nonexistent returns 404"""
        token, _, _ = student1_token
        
        resp = requests.get(
            f"{BASE_URL}/api/uploads/nonexistent_file_12345.pdf",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print("PASS: Nonexistent file returns 404")


class TestFullWorkflow:
    """Test full workflow: create procedure -> approve phase 1 -> submit phase 2 -> approve phase 2"""
    
    @pytest.fixture(scope="class")
    def auth_tokens(self):
        """Get all auth tokens needed for workflow"""
        tokens = {}
        
        # Student login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT1_EMAIL,
            "password": STUDENT1_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            tokens["student"] = (data["token"], data["user"]["id"], data["user"]["name"])
        
        # Supervisor login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            tokens["supervisor"] = (data["token"], data["user"]["id"], data["user"]["name"])
        
        # Implant Incharge login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": IMPLANT_INCHARGE_EMAIL,
            "password": IMPLANT_INCHARGE_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            tokens["implant_incharge"] = (data["token"], data["user"]["id"], data["user"]["name"])
        
        return tokens
    
    def get_future_weekday_date(self, days_ahead=5):
        """Get a weekday date at least days_ahead days in the future"""
        target_date = datetime.now() + timedelta(days=days_ahead)
        while target_date.weekday() >= 5:
            target_date += timedelta(days=1)
        return target_date.strftime("%Y-%m-%d")
    
    def test_full_workflow_create_approve_phase1_submit_phase2_approve(self, auth_tokens):
        """Test: Full workflow - create procedure, approve phase 1, submit phase 2, approve phase 2"""
        if "student" not in auth_tokens or "supervisor" not in auth_tokens or "implant_incharge" not in auth_tokens:
            pytest.skip("Missing required auth tokens")
        
        student_token, student_id, student_name = auth_tokens["student"]
        supervisor_token, supervisor_id, supervisor_name = auth_tokens["supervisor"]
        incharge_token, incharge_id, incharge_name = auth_tokens["implant_incharge"]
        
        procedure_date = self.get_future_weekday_date(5)
        
        # Step 1: Create procedure
        procedure_data = {
            "student_name": student_name,
            "patient_name": "TEST_Workflow_Patient",
            "registration_number": "TEST-WF-001",
            "supervisor_id": supervisor_id,
            "supervisor_name": supervisor_name,
            "implant_incharge_id": incharge_id,
            "implant_incharge_name": incharge_name,
            "implant_site": "Lower Left 36",
            "receipt_number": "TEST-WF-RCP-001",
            "amount_paid": 7500.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",
            "implant_specifications": "Workflow test implant specs",
            "bone_graft_specifications": "Workflow test bone graft specs",
            "remark": "Test procedure for workflow testing"
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {student_token}"}
        )
        assert create_resp.status_code == 200, f"Failed to create procedure: {create_resp.text}"
        procedure = create_resp.json()
        procedure_id = procedure["id"]
        assert procedure["status"] == "pending_phase1"
        print(f"Step 1 PASS: Procedure created with status 'pending_phase1'")
        
        try:
            # Step 2: Supervisor approves phase 1
            approve_resp = requests.post(
                f"{BASE_URL}/api/procedures/{procedure_id}/approve",
                json={"action": "approve"},
                headers={"Authorization": f"Bearer {supervisor_token}"}
            )
            assert approve_resp.status_code == 200, f"Supervisor approval failed: {approve_resp.text}"
            procedure = approve_resp.json()
            print(f"Step 2 PASS: Supervisor approved phase 1, status={procedure['status']}")
            
            # Step 3: Implant incharge approves phase 1
            approve_resp = requests.post(
                f"{BASE_URL}/api/procedures/{procedure_id}/approve",
                json={"action": "approve"},
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
            assert approve_resp.status_code == 200, f"Incharge approval failed: {approve_resp.text}"
            procedure = approve_resp.json()
            assert procedure["status"] == "phase1_approved"
            print(f"Step 3 PASS: Implant incharge approved phase 1, status='phase1_approved'")
            
            # Step 4: Student submits phase 2
            phase2_data = {
                "checklist_surgical": {
                    "items": [
                        {"id": "surgical_1", "label": "Patient preparation completed", "value": True},
                        {"id": "surgical_2", "label": "Anesthesia administered", "value": True},
                        {"id": "surgical_3", "label": "Implant placed", "value": True}
                    ],
                    "additional_fields": {}
                },
                "remark": "Phase 2 submission for workflow test"
            }
            
            submit_resp = requests.post(
                f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2",
                json=phase2_data,
                headers={"Authorization": f"Bearer {student_token}"}
            )
            assert submit_resp.status_code == 200, f"Phase 2 submission failed: {submit_resp.text}"
            procedure = submit_resp.json()
            assert procedure["status"] == "pending_phase2"
            print(f"Step 4 PASS: Phase 2 submitted, status='pending_phase2'")
            
            # Step 5: Supervisor approves phase 2
            approve_resp = requests.post(
                f"{BASE_URL}/api/procedures/{procedure_id}/approve",
                json={"action": "approve"},
                headers={"Authorization": f"Bearer {supervisor_token}"}
            )
            assert approve_resp.status_code == 200, f"Supervisor phase 2 approval failed: {approve_resp.text}"
            procedure = approve_resp.json()
            print(f"Step 5 PASS: Supervisor approved phase 2, status={procedure['status']}")
            
            # Step 6: Implant incharge approves phase 2
            approve_resp = requests.post(
                f"{BASE_URL}/api/procedures/{procedure_id}/approve",
                json={"action": "approve"},
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
            assert approve_resp.status_code == 200, f"Incharge phase 2 approval failed: {approve_resp.text}"
            procedure = approve_resp.json()
            assert procedure["status"] == "phase2_approved"
            print(f"Step 6 PASS: Implant incharge approved phase 2, status='phase2_approved'")
            
            print("FULL WORKFLOW TEST PASSED: create -> phase1 approve -> phase2 submit -> phase2 approve")
            
        finally:
            # Cleanup
            delete_resp = requests.delete(
                f"{BASE_URL}/api/procedures/{procedure_id}",
                headers={"Authorization": f"Bearer {incharge_token}"}
            )
            print(f"Cleanup: Deleted workflow test procedure {procedure_id}: {delete_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
