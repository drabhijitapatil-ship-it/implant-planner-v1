"""
Iteration 24: Test Checklist File Upload Feature
Tests for:
- POST /api/procedures/{id}/checklist-files/{item_id} - upload file (PDF, PPTX)
- GET /api/procedures/{id}/checklist-files - list files grouped by item_id
- DELETE /api/procedures/{id}/checklist-files/{item_id}/{filename} - delete file
- GET /api/checklist-files/{filename} - serve uploaded file
- Backend: Rejects invalid file extensions (e.g. .exe, .txt)
- Backend: Validates student ownership - other students cannot upload to someone else's procedure
"""

import pytest
import requests
import os
import io

# Base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"
STUDENT2_EMAIL = "shruti.mehta@student.dental.edu"
STUDENT2_PASSWORD = "Student@123"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"

# Test procedure ID (Gaurav's procedure with existing files)
TEST_PROCEDURE_ID = "699fbfa15279dfa7819789b8"

# Valid checklist items with hasUpload = true
UPLOAD_ITEM_IDS = ["academic_readiness", "hematological", "radiographic", "cbct", "realguide"]


class TestChecklistFileUpload:
    """Test checklist file upload, list, delete, and serve endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as student"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as student (Gaurav)
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        assert resp.status_code == 200, f"Student login failed: {resp.text}"
        self.student_token = resp.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.student_token}"})
        yield
    
    def test_list_existing_files(self):
        """Test GET /api/procedures/{id}/checklist-files returns existing files"""
        resp = self.session.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files")
        assert resp.status_code == 200, f"List files failed: {resp.text}"
        data = resp.json()
        assert "files" in data, "Response should contain 'files' key"
        
        # Based on context: 3 test files already uploaded (hematological, academic_readiness, radiographic)
        files = data["files"]
        print(f"Existing files grouped by item_id: {list(files.keys())}")
        
        # Verify structure of files
        for item_id, file_list in files.items():
            assert isinstance(file_list, list), f"Files for {item_id} should be a list"
            for f in file_list:
                assert "filename" in f, "File record should have 'filename'"
                assert "original_name" in f, "File record should have 'original_name'"
                assert "size" in f, "File record should have 'size'"
                assert "uploaded_at" in f, "File record should have 'uploaded_at'"
                print(f"  {item_id}: {f['original_name']} ({f['size']} bytes)")
    
    def test_upload_pdf_file(self):
        """Test POST /api/procedures/{id}/checklist-files/{item_id} with PDF"""
        # Create a test PDF content (minimal valid PDF-like content)
        pdf_content = b'%PDF-1.4 test content for iteration 24'
        files = {
            'file': ('test_upload_iter24.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct",
            files=files,
            headers=headers
        )
        assert resp.status_code == 200, f"Upload PDF failed: {resp.text}"
        data = resp.json()
        assert "filename" in data, "Response should contain 'filename'"
        assert "original_name" in data, "Response should contain 'original_name'"
        assert data["original_name"] == "test_upload_iter24.pdf"
        print(f"Uploaded file: {data['filename']}")
        
        # Store filename for cleanup
        self.uploaded_filename = data["filename"]
        
        # Verify file appears in list
        list_resp = self.session.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files")
        assert list_resp.status_code == 200
        files = list_resp.json()["files"]
        assert "cbct" in files, "cbct item should have files"
        cbct_files = files["cbct"]
        assert any(f["filename"] == self.uploaded_filename for f in cbct_files), "Uploaded file should be in list"
        
        # Cleanup - delete the test file
        del_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct/{self.uploaded_filename}",
            headers=headers
        )
        assert del_resp.status_code == 200, f"Cleanup delete failed: {del_resp.text}"
    
    def test_upload_pptx_file(self):
        """Test POST /api/procedures/{id}/checklist-files/{item_id} with PPTX"""
        pptx_content = b'PK\x03\x04 test pptx content'  # PPTX is a zip format starting with PK
        files = {
            'file': ('test_presentation.pptx', io.BytesIO(pptx_content), 
                     'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        }
        
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/academic_readiness",
            files=files,
            headers=headers
        )
        assert resp.status_code == 200, f"Upload PPTX failed: {resp.text}"
        data = resp.json()
        assert data["original_name"] == "test_presentation.pptx"
        uploaded_filename = data["filename"]
        
        # Cleanup
        del_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/academic_readiness/{uploaded_filename}",
            headers=headers
        )
        assert del_resp.status_code == 200
    
    def test_upload_jpg_file(self):
        """Test POST /api/procedures/{id}/checklist-files/{item_id} with JPG image"""
        # Minimal JPEG header
        jpg_content = b'\xff\xd8\xff\xe0 test jpg'
        files = {
            'file': ('test_image.jpg', io.BytesIO(jpg_content), 'image/jpeg')
        }
        
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct",
            files=files,
            headers=headers
        )
        assert resp.status_code == 200, f"Upload JPG failed: {resp.text}"
        uploaded_filename = resp.json()["filename"]
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct/{uploaded_filename}",
            headers=headers
        )
    
    def test_reject_invalid_extension_exe(self):
        """Test that .exe files are rejected"""
        exe_content = b'MZ fake exe content'
        files = {
            'file': ('malware.exe', io.BytesIO(exe_content), 'application/octet-stream')
        }
        
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/hematological",
            files=files,
            headers=headers
        )
        assert resp.status_code == 400, f"Should reject .exe file, got {resp.status_code}"
        assert "not allowed" in resp.text.lower(), "Error should mention file type not allowed"
    
    def test_reject_invalid_extension_txt(self):
        """Test that .txt files are rejected"""
        txt_content = b'plain text file'
        files = {
            'file': ('notes.txt', io.BytesIO(txt_content), 'text/plain')
        }
        
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/radiographic",
            files=files,
            headers=headers
        )
        assert resp.status_code == 400, f"Should reject .txt file, got {resp.status_code}"
        assert "not allowed" in resp.text.lower()
    
    def test_reject_invalid_extension_zip(self):
        """Test that .zip files are rejected"""
        zip_content = b'PK\x03\x04 fake zip'
        files = {
            'file': ('archive.zip', io.BytesIO(zip_content), 'application/zip')
        }
        
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/realguide",
            files=files,
            headers=headers
        )
        assert resp.status_code == 400, f"Should reject .zip file, got {resp.status_code}"
    
    def test_serve_uploaded_file(self):
        """Test GET /api/checklist-files/{filename} serves file correctly"""
        # First list files to get a valid filename
        resp = self.session.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files")
        assert resp.status_code == 200
        files = resp.json()["files"]
        
        # Find any existing file
        filename = None
        for item_id, file_list in files.items():
            if file_list:
                filename = file_list[0]["filename"]
                break
        
        if not filename:
            pytest.skip("No existing files to test serve endpoint")
        
        # Test serve endpoint (no auth required based on code)
        serve_resp = requests.get(f"{BASE_URL}/api/checklist-files/{filename}")
        assert serve_resp.status_code == 200, f"Serve file failed: {serve_resp.text}"
        assert len(serve_resp.content) > 0, "File content should not be empty"
        print(f"Served file {filename}: {len(serve_resp.content)} bytes")
    
    def test_serve_nonexistent_file_returns_404(self):
        """Test GET /api/checklist-files/{filename} returns 404 for nonexistent file"""
        resp = requests.get(f"{BASE_URL}/api/checklist-files/nonexistent_file_xyz123.pdf")
        assert resp.status_code == 404, f"Should return 404, got {resp.status_code}"
    
    def test_delete_file(self):
        """Test DELETE /api/procedures/{id}/checklist-files/{item_id}/{filename}"""
        headers = {"Authorization": f"Bearer {self.student_token}"}
        
        # First upload a file to delete
        pdf_content = b'%PDF-1.4 delete test'
        files = {
            'file': ('to_delete.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        upload_resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/realguide",
            files=files,
            headers=headers
        )
        assert upload_resp.status_code == 200
        filename = upload_resp.json()["filename"]
        
        # Now delete it
        del_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/realguide/{filename}",
            headers=headers
        )
        assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"
        assert "deleted" in del_resp.text.lower()
        
        # Verify file is removed from list
        list_resp = self.session.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files")
        files = list_resp.json()["files"]
        realguide_files = files.get("realguide", [])
        assert not any(f["filename"] == filename for f in realguide_files), "Deleted file should not appear in list"


class TestChecklistFileOwnershipValidation:
    """Test that students cannot upload/modify other students' procedures"""
    
    def test_other_student_cannot_upload_to_gauravs_procedure(self):
        """Test that student2 (Shruti) cannot upload files to student1 (Gaurav)'s procedure"""
        # Login as student2 (Shruti)
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT2_EMAIL,
            "password": STUDENT2_PASSWORD
        })
        assert login_resp.status_code == 200, f"Student2 login failed: {login_resp.text}"
        student2_token = login_resp.json()["token"]
        
        # Try to upload to Gaurav's procedure
        pdf_content = b'%PDF-1.4 unauthorized upload'
        files = {
            'file': ('unauthorized.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/hematological",
            files=files,
            headers={"Authorization": f"Bearer {student2_token}"}
        )
        
        # Should be forbidden
        assert resp.status_code == 403, f"Should be 403 Forbidden, got {resp.status_code}: {resp.text}"
        print(f"Correctly rejected unauthorized upload: {resp.json()}")
    
    def test_other_student_cannot_delete_gauravs_files(self):
        """Test that student2 cannot delete files from student1's procedure"""
        # Login as student2
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT2_EMAIL,
            "password": STUDENT2_PASSWORD
        })
        assert login_resp.status_code == 200
        student2_token = login_resp.json()["token"]
        
        # First, get list of Gaurav's files (list is allowed for authenticated users)
        # Login as Gaurav to get filenames
        gaurav_login = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        gaurav_token = gaurav_login.json()["token"]
        
        list_resp = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files",
            headers={"Authorization": f"Bearer {gaurav_token}"}
        )
        files = list_resp.json()["files"]
        
        # Find any file to try to delete
        filename = None
        item_id = None
        for iid, file_list in files.items():
            if file_list:
                filename = file_list[0]["filename"]
                item_id = iid
                break
        
        if not filename:
            pytest.skip("No files to test delete permission")
        
        # Try to delete as student2
        del_resp = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/{item_id}/{filename}",
            headers={"Authorization": f"Bearer {student2_token}"}
        )
        
        assert del_resp.status_code == 403, f"Should be 403 Forbidden, got {del_resp.status_code}"
        print(f"Correctly rejected unauthorized delete: {del_resp.json()}")


class TestChecklistFileProcedureNotFound:
    """Test error handling for invalid procedure IDs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        self.token = resp.json()["token"]
    
    def test_upload_to_nonexistent_procedure(self):
        """Test upload to invalid procedure ID returns 404"""
        pdf_content = b'%PDF-1.4 test'
        files = {
            'file': ('test.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/000000000000000000000000/checklist-files/cbct",
            files=files,
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        assert resp.status_code == 404, f"Should return 404, got {resp.status_code}"
    
    def test_list_files_for_nonexistent_procedure(self):
        """Test list files for invalid procedure ID returns 404"""
        resp = requests.get(
            f"{BASE_URL}/api/procedures/000000000000000000000000/checklist-files",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        assert resp.status_code == 404


class TestChecklistFileAuth:
    """Test authentication requirements"""
    
    def test_upload_requires_auth(self):
        """Test that upload endpoint requires authentication"""
        pdf_content = b'%PDF-1.4 test'
        files = {
            'file': ('test.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct",
            files=files
            # No auth header
        )
        
        assert resp.status_code in [401, 403], f"Should require auth, got {resp.status_code}"
    
    def test_list_requires_auth(self):
        """Test that list endpoint requires authentication"""
        resp = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files"
            # No auth header
        )
        
        assert resp.status_code in [401, 403], f"Should require auth, got {resp.status_code}"
    
    def test_delete_requires_auth(self):
        """Test that delete endpoint requires authentication"""
        resp = requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct/somefile.pdf"
            # No auth header
        )
        
        assert resp.status_code in [401, 403], f"Should require auth, got {resp.status_code}"


class TestAllowedFileExtensions:
    """Test all allowed file extensions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": STUDENT_EMAIL,
            "password": STUDENT_PASSWORD
        })
        self.token = resp.json()["token"]
    
    @pytest.mark.parametrize("ext,mime_type", [
        (".pdf", "application/pdf"),
        (".ppt", "application/vnd.ms-powerpoint"),
        (".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        (".doc", "application/msword"),
        (".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".png", "image/png"),
        (".heic", "image/heic"),
    ])
    def test_allowed_extension(self, ext, mime_type):
        """Test each allowed file extension is accepted"""
        content = b'test file content'
        files = {
            'file': (f'testfile{ext}', io.BytesIO(content), mime_type)
        }
        
        resp = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct",
            files=files,
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        assert resp.status_code == 200, f"Should accept {ext} files, got {resp.status_code}: {resp.text}"
        
        # Cleanup
        filename = resp.json()["filename"]
        requests.delete(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/checklist-files/cbct/{filename}",
            headers={"Authorization": f"Bearer {self.token}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
