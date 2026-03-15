"""
Test Case Completion Engine for Iteration 23
Tests:
1. Badge retrieval endpoint - returns null for non-completed procedures
2. Case report PDF generation endpoint
3. Badge endpoint JSON serialization (no ObjectId issues)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"

# Test procedure ID (pending_phase1 status, has 3 implants)
TEST_PROCEDURE_ID = "699fbfa15279dfa7819789b8"


@pytest.fixture(scope="module")
def student_token():
    """Get student authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD
    })
    assert response.status_code == 200, f"Student login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def incharge_token():
    """Get implant incharge authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": INCHARGE_EMAIL,
        "password": INCHARGE_PASSWORD
    })
    assert response.status_code == 200, f"Incharge login failed: {response.text}"
    return response.json()["token"]


class TestBadgeEndpoint:
    """Tests for GET /api/procedures/{id}/badge"""
    
    def test_badge_returns_null_for_non_completed_procedure(self, student_token):
        """Badge should be null for procedures that are not completed"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/badge",
            headers=headers
        )
        assert response.status_code == 200, f"Badge endpoint failed: {response.text}"
        
        data = response.json()
        assert "badge" in data, "Response should have 'badge' key"
        assert data["badge"] is None, f"Badge should be null for non-completed procedure, got: {data['badge']}"
        print("PASS: Badge is null for non-completed procedure")
    
    def test_badge_endpoint_no_objectid_serialization_error(self, student_token):
        """Badge endpoint should not throw ObjectId serialization errors"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/badge",
            headers=headers
        )
        # Should return 200, not 500 (which would indicate serialization error)
        assert response.status_code == 200, f"Badge endpoint returned {response.status_code}: {response.text}"
        
        # Response should be valid JSON
        data = response.json()
        assert isinstance(data, dict), "Response should be a valid JSON object"
        print("PASS: Badge endpoint returns valid JSON without ObjectId errors")
    
    def test_badge_endpoint_requires_auth(self):
        """Badge endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/badge")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Badge endpoint requires authentication")


class TestCaseReportEndpoint:
    """Tests for POST /api/procedures/{id}/case-report"""
    
    def test_case_report_generates_pdf_for_any_procedure(self, student_token):
        """Case report PDF should be generated for any procedure regardless of status"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report",
            headers=headers
        )
        assert response.status_code == 200, f"Case report failed: {response.text}"
        
        # Check content type is PDF
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got: {content_type}"
        print("PASS: Case report endpoint returns PDF")
    
    def test_case_report_pdf_is_valid(self, student_token):
        """Generated PDF should have valid PDF header bytes"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report",
            headers=headers
        )
        assert response.status_code == 200
        
        # PDF files start with %PDF-
        pdf_content = response.content
        assert pdf_content[:5] == b'%PDF-', f"PDF header invalid, got: {pdf_content[:20]}"
        print(f"PASS: Valid PDF generated, size: {len(pdf_content)} bytes")
    
    def test_case_report_has_content_disposition(self, student_token):
        """Case report should have Content-Disposition header for download"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.post(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report",
            headers=headers
        )
        assert response.status_code == 200
        
        content_disposition = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disposition.lower(), f"Missing attachment disposition: {content_disposition}"
        assert "CaseReport" in content_disposition, f"Filename should contain 'CaseReport': {content_disposition}"
        print(f"PASS: Content-Disposition header correct: {content_disposition}")
    
    def test_case_report_requires_auth(self):
        """Case report endpoint should require authentication"""
        response = requests.post(f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/case-report")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Case report endpoint requires authentication")
    
    def test_case_report_returns_404_for_invalid_procedure(self, student_token):
        """Case report should return 404 for non-existent procedure"""
        headers = {"Authorization": f"Bearer {student_token}"}
        fake_id = "000000000000000000000000"
        response = requests.post(
            f"{BASE_URL}/api/procedures/{fake_id}/case-report",
            headers=headers
        )
        assert response.status_code == 404, f"Expected 404 for invalid procedure, got {response.status_code}"
        print("PASS: Case report returns 404 for non-existent procedure")


class TestProcedureHasBadgeCaseIdField:
    """Verify badge_case_id field structure in procedure doc format"""
    
    def test_procedure_document_structure(self, student_token):
        """Verify procedure document has expected fields for badge integration"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify basic procedure fields exist
        assert "status" in data, "Procedure should have 'status' field"
        assert "patient_name" in data, "Procedure should have 'patient_name' field"
        assert "student_name" in data, "Procedure should have 'student_name' field"
        assert "number_of_implants" in data, "Procedure should have 'number_of_implants' field"
        
        # For non-completed procedures, badge_case_id may not exist (it's set on completion)
        # This is expected behavior
        print(f"PASS: Procedure document structure verified. Status: {data.get('status')}")
        print(f"      badge_case_id present: {'badge_case_id' in data}")


class TestImplantPlanningIntegration:
    """Verify implant planning is still working (context from iteration 22)"""
    
    def test_implant_plan_still_has_3_implants(self, student_token):
        """Verify test procedure still has 3 implants planned"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(
            f"{BASE_URL}/api/procedures/{TEST_PROCEDURE_ID}/implant-plan",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        implant_count = data.get("number_of_implants", 0)
        implant_plans = data.get("implant_plans", [])
        
        assert implant_count == 3, f"Expected 3 implants, got {implant_count}"
        assert len(implant_plans) == 3, f"Expected 3 implant plans, got {len(implant_plans)}"
        print(f"PASS: Procedure has {implant_count} implants planned")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
