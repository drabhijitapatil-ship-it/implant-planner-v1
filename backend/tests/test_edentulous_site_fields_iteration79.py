"""
Test suite for Edentulous Site numeric fields (occlusocervical_height, mesiodistal_space)
Iteration 79: Testing the replacement of multi-select dropdown with two numeric text inputs

Features tested:
1. POST /api/procedures accepts occlusocervical_height and mesiodistal_space fields
2. GET /api/procedures/{id} returns stored values
3. POST /api/procedures/{id}/case-report generates PDF with Edentulous Site heading
4. PDF generation doesn't crash when checklist is null (NoneType bug fix)
5. Backward compatibility for existing procedures without new fields
"""

import pytest
import requests
import os
import random
from datetime import datetime, timedelta
import fitz  # pymupdf for PDF verification

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Generate unique base offset to avoid slot conflicts
UNIQUE_OFFSET = random.randint(50, 150)

# Test credentials - using Implant In-Charge to bypass scheduling restrictions
INCHARGE_EMAIL = "Abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"

SUPERVISOR_EMAIL = "Paresh.gandhi@dental.edu"
SUPERVISOR_PASSWORD = "Supervisor@123"


class TestEdentulousFieldsSetup:
    """Setup fixtures for testing"""
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        """Get auth token for Implant In-Charge"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": INCHARGE_EMAIL,
            "password": INCHARGE_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get auth token for Supervisor"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": SUPERVISOR_EMAIL,
            "password": SUPERVISOR_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_info(self, supervisor_token):
        """Get supervisor user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {supervisor_token}"
        })
        assert response.status_code == 200
        return response.json()
    
    @pytest.fixture(scope="class")
    def incharge_info(self, incharge_token):
        """Get incharge user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {incharge_token}"
        })
        assert response.status_code == 200
        return response.json()


class TestEdentulousFieldsCreation(TestEdentulousFieldsSetup):
    """Test procedure creation with new edentulous site fields"""
    
    def test_create_procedure_with_edentulous_fields(self, incharge_token, supervisor_info, incharge_info):
        """Test POST /api/procedures accepts occlusocervical_height and mesiodistal_space"""
        # Calculate a valid future date (not Sunday, at least 24 hours ahead)
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_EdentulousFields_Patient",
            "registration_number": "TEST-EF-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-REC-001",
            "amount_paid": 5000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
            # New edentulous site fields
            "occlusocervical_height": "12.5",
            "mesiodistal_space": "8.0",
            # Other clinical fields
            "arch_condition": "Partially Edentulous",
            "ridge_contour": "Normal"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert response.status_code == 200, f"Create procedure failed: {response.text}"
        data = response.json()
        
        # Verify the new fields are stored
        assert data.get("occlusocervical_height") == "12.5", "occlusocervical_height not stored correctly"
        assert data.get("mesiodistal_space") == "8.0", "mesiodistal_space not stored correctly"
        
        # Store procedure ID for cleanup
        TestEdentulousFieldsCreation.procedure_id = data["id"]
        print(f"Created procedure with ID: {data['id']}")
        print(f"Occlusocervical Height: {data.get('occlusocervical_height')}")
        print(f"Mesiodistal Space: {data.get('mesiodistal_space')}")
    
    def test_get_procedure_returns_edentulous_fields(self, incharge_token):
        """Test GET /api/procedures/{id} returns stored occlusocervical_height and mesiodistal_space"""
        procedure_id = getattr(TestEdentulousFieldsCreation, 'procedure_id', None)
        if not procedure_id:
            pytest.skip("No procedure created in previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        data = response.json()
        
        # Verify the fields are returned
        assert data.get("occlusocervical_height") == "12.5", f"Expected '12.5', got '{data.get('occlusocervical_height')}'"
        assert data.get("mesiodistal_space") == "8.0", f"Expected '8.0', got '{data.get('mesiodistal_space')}'"
        print(f"GET returned occlusocervical_height: {data.get('occlusocervical_height')}")
        print(f"GET returned mesiodistal_space: {data.get('mesiodistal_space')}")


class TestPDFGeneration(TestEdentulousFieldsSetup):
    """Test PDF generation with new edentulous site fields"""
    
    def test_pdf_contains_edentulous_site_heading(self, incharge_token, supervisor_info, incharge_info):
        """Test PDF contains 'Edentulous Site' heading with Occlusocervical Height and Mesiodistal Space"""
        # Create a new procedure for PDF testing
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET + 1)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_PDF_EdentulousFields",
            "registration_number": "TEST-PDF-EF-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-PDF-REC-001",
            "amount_paid": 6000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Screw Retained Crown - Zirconia",
            # New edentulous site fields
            "occlusocervical_height": "15.0",
            "mesiodistal_space": "10.5",
            # Other clinical fields
            "arch_condition": "Partially Edentulous",
            "ridge_contour": "Knife Edge"
        }
        
        # Create procedure
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert create_response.status_code == 200, f"Create procedure failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        TestPDFGeneration.pdf_procedure_id = procedure_id
        
        # Generate PDF
        pdf_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/case-report",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert pdf_response.status_code == 200, f"PDF generation failed: {pdf_response.text}"
        assert pdf_response.headers.get("content-type") == "application/pdf", "Response is not a PDF"
        
        # Save PDF and verify content using pymupdf
        pdf_content = pdf_response.content
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        # Verify PDF contains the expected content
        assert "Edentulous Site" in full_text, "PDF missing 'Edentulous Site' heading"
        assert "Occlusocervical Height" in full_text, "PDF missing 'Occlusocervical Height' field"
        assert "15.0 mm" in full_text or "15.0" in full_text, "PDF missing occlusocervical height value"
        assert "Mesiodistal Space" in full_text, "PDF missing 'Mesiodistal Space' field"
        assert "10.5 mm" in full_text or "10.5" in full_text, "PDF missing mesiodistal space value"
        
        print("PDF Content verification:")
        print(f"  - 'Edentulous Site' heading: FOUND")
        print(f"  - 'Occlusocervical Height': FOUND")
        print(f"  - 'Mesiodistal Space': FOUND")
        print(f"  - Values (15.0 mm, 10.5 mm): FOUND")
    
    def test_pdf_generation_with_null_checklist(self, incharge_token, supervisor_info, incharge_info):
        """Test PDF generation doesn't crash when checklist is null (NoneType bug fix)"""
        # Create a procedure without checklist
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET + 2)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_NullChecklist_Patient",
            "registration_number": "TEST-NC-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-NC-REC-001",
            "amount_paid": 7000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Multiple Conventional Implants",
            "loading_type": ["Early Loading"],
            "prosthetic_plan": "Cement Retained Bridge - Zirconia",
            # Explicitly set checklist to None
            "checklist": None,
            # New edentulous site fields
            "occlusocervical_height": "11.0",
            "mesiodistal_space": "9.0"
        }
        
        # Create procedure
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert create_response.status_code == 200, f"Create procedure failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        TestPDFGeneration.null_checklist_procedure_id = procedure_id
        
        # Generate PDF - this should NOT crash with NoneType error
        pdf_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/case-report",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert pdf_response.status_code == 200, f"PDF generation failed with null checklist: {pdf_response.text}"
        assert pdf_response.headers.get("content-type") == "application/pdf", "Response is not a PDF"
        
        print("PDF generation with null checklist: SUCCESS (no NoneType crash)")


class TestBackwardCompatibility(TestEdentulousFieldsSetup):
    """Test backward compatibility for procedures without new fields"""
    
    def test_pdf_generation_without_edentulous_fields(self, incharge_token, supervisor_info, incharge_info):
        """Test PDF generation works for procedures without occlusocervical_height and mesiodistal_space"""
        # Create a procedure without the new fields
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET + 3)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_NoEdentulousFields_Patient",
            "registration_number": "TEST-NEF-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-NEF-REC-001",
            "amount_paid": 8000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "14:00",
            "implant_procedure_type": "Immediate Implant",
            "loading_type": ["Immediate Loading"],
            "prosthetic_plan": "PMMA Crown with Temporary Abutment",
            # Old style edentulous_sites (multi-select)
            "edentulous_sites": ["Sufficient Occlusocervical", "Sufficient Mesiodistal"],
            # No occlusocervical_height or mesiodistal_space
            "arch_condition": "Partially Edentulous"
        }
        
        # Create procedure
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        assert create_response.status_code == 200, f"Create procedure failed: {create_response.text}"
        procedure_id = create_response.json()["id"]
        TestBackwardCompatibility.backward_compat_procedure_id = procedure_id
        
        # Generate PDF - should work without the new fields
        pdf_response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/case-report",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert pdf_response.status_code == 200, f"PDF generation failed for backward compat: {pdf_response.text}"
        assert pdf_response.headers.get("content-type") == "application/pdf", "Response is not a PDF"
        
        # Verify PDF content - should show old edentulous_sites format
        pdf_content = pdf_response.content
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        
        full_text = ""
        for page in doc:
            full_text += page.get_text()
        
        doc.close()
        
        # Should contain old format edentulous sites
        assert "Edentulous Sites" in full_text or "Sufficient" in full_text, "PDF missing backward compat edentulous sites"
        
        print("Backward compatibility test: SUCCESS")
        print("PDF generated correctly for procedure without new edentulous fields")


class TestFieldValidation(TestEdentulousFieldsSetup):
    """Test field validation for edentulous site fields"""
    
    def test_create_procedure_with_empty_edentulous_fields(self, incharge_token, supervisor_info, incharge_info):
        """Test procedure creation with empty edentulous fields (should work - fields are optional)"""
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET + 4)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_EmptyEdentulous_Patient",
            "registration_number": "TEST-EE-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-EE-REC-001",
            "amount_paid": 9000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
            # Empty edentulous fields
            "occlusocervical_height": "",
            "mesiodistal_space": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert response.status_code == 200, f"Create procedure with empty fields failed: {response.text}"
        data = response.json()
        
        # Empty strings should be stored as empty
        assert data.get("occlusocervical_height") == "", "Empty occlusocervical_height not stored correctly"
        assert data.get("mesiodistal_space") == "", "Empty mesiodistal_space not stored correctly"
        
        TestFieldValidation.empty_fields_procedure_id = data["id"]
        print("Empty edentulous fields test: SUCCESS")
    
    def test_create_procedure_with_decimal_values(self, incharge_token, supervisor_info, incharge_info):
        """Test procedure creation with decimal values for edentulous fields"""
        future_date = datetime.now() + timedelta(days=UNIQUE_OFFSET + 5)
        while future_date.weekday() == 6:  # Skip Sunday
            future_date += timedelta(days=1)
        
        procedure_data = {
            "patient_name": "TEST_DecimalEdentulous_Patient",
            "registration_number": "TEST-DE-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "TEST-DE-REC-001",
            "amount_paid": 10000.0,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
            # Decimal values
            "occlusocervical_height": "12.75",
            "mesiodistal_space": "7.25"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        assert response.status_code == 200, f"Create procedure with decimal values failed: {response.text}"
        data = response.json()
        
        assert data.get("occlusocervical_height") == "12.75", f"Decimal occlusocervical_height not stored correctly"
        assert data.get("mesiodistal_space") == "7.25", f"Decimal mesiodistal_space not stored correctly"
        
        TestFieldValidation.decimal_fields_procedure_id = data["id"]
        print("Decimal edentulous fields test: SUCCESS")


class TestCleanup(TestEdentulousFieldsSetup):
    """Cleanup test data"""
    
    def test_cleanup_test_procedures(self, incharge_token):
        """Delete all TEST_ prefixed procedures created during testing"""
        # Get all procedures
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {incharge_token}"}
        )
        
        if response.status_code == 200:
            procedures = response.json()
            deleted_count = 0
            for proc in procedures:
                if proc.get("patient_name", "").startswith("TEST_"):
                    delete_response = requests.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {incharge_token}"}
                    )
                    if delete_response.status_code == 200:
                        deleted_count += 1
            
            print(f"Cleanup: Deleted {deleted_count} test procedures")
        else:
            print("Cleanup: Could not fetch procedures for cleanup")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
