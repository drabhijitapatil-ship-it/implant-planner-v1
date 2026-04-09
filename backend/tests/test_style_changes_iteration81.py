"""
Test Suite for Iteration 81 - Style Changes Verification
This is a style-only change iteration. Backend functionality should remain unchanged.
Tests verify: Login API, POST /api/procedures, GET /api/procedures/{id}, PDF generation
"""

import pytest
import requests
import os
import time
import random
import string
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com')

# Test credentials from test_credentials.md
INCHARGE_EMAIL = "Abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"

def generate_unique_id():
    """Generate unique ID for test data"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def get_future_date(days_ahead=30):
    """Get a future date to avoid slot conflicts"""
    future = datetime.now() + timedelta(days=days_ahead + random.randint(1, 30))
    # Skip Sundays
    while future.weekday() == 6:
        future += timedelta(days=1)
    return future.strftime("%Y-%m-%d")


class TestAuthAPI:
    """Test authentication endpoints - should work unchanged after style updates"""
    
    def test_login_success(self):
        """Verify login API works correctly"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "refresh_token" in data, "Missing refresh_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == INCHARGE_EMAIL
        assert data["user"]["role"] == "implant_incharge"
        print(f"✓ Login successful for {INCHARGE_EMAIL}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Verify login rejects invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": "invalid@test.com", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")


class TestProceduresAPI:
    """Test procedures CRUD operations - should work unchanged after style updates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.user_id = response.json()["user"]["id"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_create_procedure_with_all_fields(self):
        """POST /api/procedures creates procedure with all fields correctly"""
        # Get users for supervisor/incharge IDs
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert users_response.status_code == 200
        users = users_response.json()
        
        incharge = next((u for u in users if u["role"] == "implant_incharge"), None)
        supervisor = next((u for u in users if u["role"] == "supervisor"), None)
        
        assert incharge is not None, "No implant_incharge found"
        
        unique_id = generate_unique_id()
        future_date = get_future_date()
        
        # Create procedure with comprehensive fields
        procedure_data = {
            "patient_name": f"TEST_StyleCheck_{unique_id}",
            "registration_number": f"TEST-STYLE-81-{unique_id}",
            "student_name": "Dr. Abhijit Patil",
            "supervisor_id": supervisor["id"] if supervisor else incharge["id"],
            "supervisor_name": supervisor["name"] if supervisor else incharge["name"],
            "implant_incharge_id": incharge["id"],
            "implant_incharge_name": incharge["name"],
            "receipt_number": f"REC-STYLE-81-{unique_id}",
            "amount_paid": 50000,
            "procedure_date": future_date,
            "procedure_time": "10:00 AM - 12:00 PM",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Screw-retained Crown",
            # Clinical examination fields
            "occlusocervical_height": "12",
            "mesiodistal_space": "8",
            "ridge_contour": "Normal",
            "soft_tissue_thickness": "Thick (>2mm)",
            "keratinized_mucosa": "Adequate (>2mm)",
            # Occlusal analysis
            "occlusal_scheme": "Mutually Protected",
            "parafunction_habit": "None",
            "vertical_dimension": "Normal",
            "opposing_dentition": "Natural Teeth",
            # Aesthetic risk
            "smile_line": "Low",
            "gingival_biotype": "Thick",
            # Medical assessment
            "medical_assessment": {
                "diabetes": "No",
                "hypertension": "No",
                "smoking": "No"
            },
            "medical_risk_level": "Low Risk",
            # Checklist
            "checklist": {
                "pre_surgical": {
                    "items": [
                        {"id": "consent_form", "label": "Consent Form Signed", "value": True},
                        {"id": "cbct_reviewed", "label": "CBCT Reviewed", "value": True}
                    ],
                    "additional_fields": {}
                }
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=self.headers
        )
        
        assert response.status_code in [200, 201], f"Create procedure failed: {response.text}"
        
        created = response.json()
        procedure_id = created.get("id") or created.get("_id")
        assert procedure_id is not None, "No procedure ID returned"
        
        # Verify all fields were stored
        assert created["patient_name"] == f"TEST_StyleCheck_{unique_id}"
        assert created["registration_number"] == f"TEST-STYLE-81-{unique_id}"
        assert created["implant_procedure_type"] == "Single Conventional Implant"
        assert created["occlusocervical_height"] == "12"
        assert created["mesiodistal_space"] == "8"
        
        print(f"✓ Procedure created successfully with ID: {procedure_id}")
        
        # Cleanup
        self._cleanup_procedure(procedure_id)
    
    def test_get_procedure_returns_full_data(self):
        """GET /api/procedures/{id} returns full procedure data"""
        # Get users for supervisor/incharge IDs
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = users_response.json()
        incharge = next((u for u in users if u["role"] == "implant_incharge"), None)
        supervisor = next((u for u in users if u["role"] == "supervisor"), None)
        
        unique_id = generate_unique_id()
        future_date = get_future_date(days_ahead=60)
        
        # Create a procedure
        procedure_data = {
            "patient_name": f"TEST_GetCheck_{unique_id}",
            "registration_number": f"TEST-GET-81-{unique_id}",
            "student_name": "Dr. Abhijit Patil",
            "supervisor_id": supervisor["id"] if supervisor else incharge["id"],
            "supervisor_name": supervisor["name"] if supervisor else incharge["name"],
            "implant_incharge_id": incharge["id"],
            "implant_incharge_name": incharge["name"],
            "receipt_number": f"REC-GET-81-{unique_id}",
            "amount_paid": 50000,
            "procedure_date": future_date,
            "procedure_time": "2:00 PM - 4:00 PM",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Screw-retained Crown",
            "occlusocervical_height": "12",
            "mesiodistal_space": "8",
            "ridge_contour": "Normal",
            "soft_tissue_thickness": "Thick (>2mm)",
            "keratinized_mucosa": "Adequate (>2mm)",
            "occlusal_scheme": "Mutually Protected",
            "smile_line": "Low",
            "gingival_biotype": "Thick",
            "medical_assessment": {"diabetes": "No", "hypertension": "No"},
            "medical_risk_level": "Low Risk",
            "checklist": {"pre_surgical": {"items": [], "additional_fields": {}}}
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=self.headers
        )
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created = create_response.json()
        procedure_id = created.get("id") or created.get("_id")
        
        # Now fetch it
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Get procedure failed: {response.text}"
        
        data = response.json()
        
        # Verify all fields are returned
        assert data["patient_name"] == f"TEST_GetCheck_{unique_id}"
        assert data["registration_number"] == f"TEST-GET-81-{unique_id}"
        assert data["implant_procedure_type"] == "Single Conventional Implant"
        assert data["occlusocervical_height"] == "12"
        assert data["mesiodistal_space"] == "8"
        assert data["ridge_contour"] == "Normal"
        assert data["soft_tissue_thickness"] == "Thick (>2mm)"
        assert data["keratinized_mucosa"] == "Adequate (>2mm)"
        assert data["occlusal_scheme"] == "Mutually Protected"
        assert data["smile_line"] == "Low"
        assert data["gingival_biotype"] == "Thick"
        assert "medical_assessment" in data
        
        print(f"✓ GET /api/procedures/{procedure_id} returns all fields correctly")
        
        # Cleanup
        self._cleanup_procedure(procedure_id)
    
    def test_pdf_generation(self):
        """POST /api/procedures/{id}/case-report generates PDF successfully"""
        # Get users for supervisor/incharge IDs
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = users_response.json()
        incharge = next((u for u in users if u["role"] == "implant_incharge"), None)
        supervisor = next((u for u in users if u["role"] == "supervisor"), None)
        
        unique_id = generate_unique_id()
        future_date = get_future_date(days_ahead=90)
        
        # Create a procedure
        procedure_data = {
            "patient_name": f"TEST_PDFCheck_{unique_id}",
            "registration_number": f"TEST-PDF-81-{unique_id}",
            "student_name": "Dr. Abhijit Patil",
            "supervisor_id": supervisor["id"] if supervisor else incharge["id"],
            "supervisor_name": supervisor["name"] if supervisor else incharge["name"],
            "implant_incharge_id": incharge["id"],
            "implant_incharge_name": incharge["name"],
            "receipt_number": f"REC-PDF-81-{unique_id}",
            "amount_paid": 50000,
            "procedure_date": future_date,
            "procedure_time": "10:00 AM - 12:00 PM",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Screw-retained Crown",
            "occlusocervical_height": "12",
            "mesiodistal_space": "8",
            "medical_assessment": {"diabetes": "No"},
            "medical_risk_level": "Low Risk",
            "checklist": {"pre_surgical": {"items": [], "additional_fields": {}}}
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=self.headers
        )
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created = create_response.json()
        procedure_id = created.get("id") or created.get("_id")
        
        # Submit for approval first (PDF requires non-draft status)
        update_response = requests.put(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            json={"status": "pending_phase1"},
            headers=self.headers
        )
        assert update_response.status_code == 200, f"Status update failed: {update_response.text}"
        
        # Generate PDF
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/case-report",
            headers=self.headers
        )
        
        assert response.status_code == 200, f"PDF generation failed: {response.text}"
        
        # Check response is PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF, got {content_type}"
        
        # Check PDF has content
        assert len(response.content) > 1000, "PDF content too small, likely empty"
        
        print(f"✓ PDF generated successfully for procedure {procedure_id}")
        
        # Cleanup
        self._cleanup_procedure(procedure_id)
    
    def _cleanup_procedure(self, procedure_id):
        """Delete test procedure"""
        try:
            requests.delete(
                f"{BASE_URL}/api/procedures/{procedure_id}",
                headers=self.headers
            )
            print(f"  Cleaned up procedure {procedure_id}")
        except:
            pass


class TestFullArchProcedure:
    """Test Full Arch procedure type with specific fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"identifier": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD}
        )
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.user_id = response.json()["user"]["id"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_all_on_4_procedure_with_full_arch_fields(self):
        """Test All on 4 procedure with available_interarch_space and opposing_arch"""
        # Get users
        users_response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = users_response.json()
        incharge = next((u for u in users if u["role"] == "implant_incharge"), None)
        supervisor = next((u for u in users if u["role"] == "supervisor"), None)
        
        unique_id = generate_unique_id()
        future_date = get_future_date(days_ahead=120)
        
        procedure_data = {
            "patient_name": f"TEST_FullArch_{unique_id}",
            "registration_number": f"TEST-FULLARCH-81-{unique_id}",
            "student_name": "Dr. Abhijit Patil",
            "supervisor_id": supervisor["id"] if supervisor else incharge["id"],
            "supervisor_name": supervisor["name"] if supervisor else incharge["name"],
            "implant_incharge_id": incharge["id"],
            "implant_incharge_name": incharge["name"],
            "receipt_number": f"REC-FULLARCH-81-{unique_id}",
            "amount_paid": 150000,
            "procedure_date": future_date,
            "procedure_time": "10:00 AM - 12:00 PM",
            "implant_procedure_type": "All on 4",
            "loading_type": ["Immediate Loading"],
            "prosthetic_plan": "Fixed Hybrid Prosthesis",
            # Full arch specific fields
            "arch_condition": "Completely Edentulous",
            "ridge_contour": "Atrophic",
            "soft_tissue_thickness": "Thin (<2mm)",
            "keratinized_mucosa": "Adequate (>2mm)",
            "available_interarch_space": "18",
            "opposing_arch": "Natural Dentition",
            "tmj": "Normal",
            # Medical assessment
            "medical_assessment": {"diabetes": "No", "hypertension": "No"},
            "medical_risk_level": "Low Risk",
            "checklist": {
                "pre_surgical": {
                    "items": [{"id": "consent_form", "label": "Consent Form", "value": True}],
                    "additional_fields": {}
                }
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            json=procedure_data,
            headers=self.headers
        )
        
        assert response.status_code in [200, 201], f"Create failed: {response.text}"
        
        created = response.json()
        procedure_id = created.get("id") or created.get("_id")
        
        # Verify full arch fields
        assert created["implant_procedure_type"] == "All on 4"
        assert created["available_interarch_space"] == "18"
        assert created["opposing_arch"] == "Natural Dentition"
        
        print(f"✓ All on 4 procedure created with full arch fields")
        
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=self.headers)
        except:
            pass


class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_check(self):
        """Verify health endpoint returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
