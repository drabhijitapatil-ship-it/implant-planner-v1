"""
Test New Case Form - Procedure Types, Loading Types, and Prosthetic Options
Tests for iteration 21: Overhauled New Case form with new fields
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
STUDENT_EMAIL = "gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"
INCHARGE_EMAIL = "abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"
SUPERVISOR_EMAIL = "vasantha.n@dental.edu"
SUPERVISOR_PASSWORD = "Supervisor@123"

# Constants for validation
VALID_PROCEDURE_TYPES = [
    "Single Conventional Implant",
    "Multiple Conventional Implants",
    "Immediate Implant",
    "Partial Extraction Therapy",
    "Implant Placement with GBR",
    "Guided Surgery",
    "All on 4",
    "All on 6",
    "All on X",
]

VALID_LOADING_TYPES = ["Immediate Loading", "Delayed Loading"]


@pytest.fixture(scope="module")
def student_token():
    """Get student auth token."""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": STUDENT_EMAIL, "password": STUDENT_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Student login failed: {resp.status_code} - {resp.text}")
    return resp.json()["token"]


@pytest.fixture(scope="module")
def incharge_token():
    """Get implant incharge auth token."""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": INCHARGE_EMAIL, "password": INCHARGE_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Incharge login failed: {resp.status_code} - {resp.text}")
    return resp.json()["token"]


@pytest.fixture(scope="module")
def supervisor_info(student_token):
    """Get supervisor info for procedure creation."""
    headers = {"Authorization": f"Bearer {student_token}"}
    resp = requests.get(f"{BASE_URL}/api/users?role=supervisor", headers=headers)
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]
    # Fallback to implant_incharge if no supervisor
    resp = requests.get(f"{BASE_URL}/api/users?role=implant_incharge", headers=headers)
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]
    pytest.skip("No supervisor or incharge found")


@pytest.fixture(scope="module")
def incharge_info(student_token):
    """Get implant incharge info for procedure creation."""
    headers = {"Authorization": f"Bearer {student_token}"}
    resp = requests.get(f"{BASE_URL}/api/users?role=implant_incharge", headers=headers)
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]
    pytest.skip("No implant incharge found")


class TestCaseFormOptions:
    """Test /api/case-form-options endpoint."""
    
    def test_case_form_options_returns_all_data(self, student_token):
        """GET /api/case-form-options returns procedure_types, loading_types, prosthetic_options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(f"{BASE_URL}/api/case-form-options", headers=headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify structure
        assert "procedure_types" in data, "Missing procedure_types"
        assert "loading_types" in data, "Missing loading_types"
        assert "prosthetic_options" in data, "Missing prosthetic_options"
        
        # Verify procedure_types has 9 options
        assert len(data["procedure_types"]) == 9, f"Expected 9 procedure types, got {len(data['procedure_types'])}"
        
        # Verify loading_types has 2 options
        assert len(data["loading_types"]) == 2, f"Expected 2 loading types, got {len(data['loading_types'])}"
        assert "Immediate Loading" in data["loading_types"]
        assert "Delayed Loading" in data["loading_types"]
        
        # Verify prosthetic_options has keys
        assert "single_crown" in data["prosthetic_options"]
        assert "bridge" in data["prosthetic_options"]
        assert "immediate_loading" in data["prosthetic_options"]
        assert "full_arch" in data["prosthetic_options"]

    def test_case_form_options_procedure_types_complete(self, student_token):
        """Verify all 9 procedure types are returned."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(f"{BASE_URL}/api/case-form-options", headers=headers)
        
        assert resp.status_code == 200
        data = resp.json()
        
        for ptype in VALID_PROCEDURE_TYPES:
            assert ptype in data["procedure_types"], f"Missing procedure type: {ptype}"


class TestProstheticOptionsEndpoint:
    """Test /api/prosthetic-options endpoint with various combinations."""
    
    def test_single_conventional_delayed(self, student_token):
        """Single Conventional Implant + Delayed Loading = single_crown options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "Single Conventional Implant", "loading_type": "Delayed Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "options" in data
        
        # Should include single_crown options
        assert "Cement Retained Crown - Zirconia" in data["options"]
        assert "Screw Retained Crown - Metal" in data["options"]
        # Should NOT include immediate_loading options (delayed only)
        assert "PMMA Crown with Temporary Abutment" not in data["options"]
    
    def test_multiple_conventional_immediate(self, student_token):
        """Multiple Conventional Implants + Immediate Loading = bridge + immediate_loading options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "Multiple Conventional Implants", "loading_type": "Immediate Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        
        # Should include bridge options
        assert "Cement Retained Bridge - Zirconia" in data["options"]
        assert "Overdenture with Attachment" in data["options"]
        # Should include immediate_loading options
        assert "PMMA Crown with Temporary Abutment" in data["options"]
        assert "Full Arch Temporary Prosthesis with Multiunit and Temporary Cylinders" in data["options"]
    
    def test_all_on_4_options(self, student_token):
        """All on 4 procedure returns full_arch options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "All on 4", "loading_type": "Delayed Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        
        # Should include full_arch options
        assert "Full Arch Co-Cr Framework Removable Denture" in data["options"]
        assert "Full Arch Porcelain Fused to Metal Prosthesis" in data["options"]
        assert "Full Arch Titanium Framework Zirconia Prosthesis" in data["options"]
    
    def test_all_on_4_with_immediate_loading(self, student_token):
        """All on 4 + Immediate Loading = full_arch + immediate_loading options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "All on 4", "loading_type": "Immediate Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        
        # Should include full_arch options
        assert "Full Arch Peek Framework Zirconia Ti Base" in data["options"]
        # Should include immediate_loading options
        assert "Temporary PMMA CAD Prosthesis with Multiunit and Temporary Cylinders" in data["options"]
    
    def test_guided_surgery_no_prosthetic_by_procedure(self, student_token):
        """Guided Surgery alone doesn't have specific prosthetic options."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "Guided Surgery", "loading_type": "Delayed Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        # Guided Surgery is not in single/bridge/full_arch sets, so options empty without immediate
        assert data["options"] == []
    
    def test_guided_surgery_with_immediate_loading(self, student_token):
        """Guided Surgery + Immediate Loading = immediate_loading options only."""
        headers = {"Authorization": f"Bearer {student_token}"}
        resp = requests.get(
            f"{BASE_URL}/api/prosthetic-options",
            params={"procedure_type": "Guided Surgery", "loading_type": "Immediate Loading"},
            headers=headers
        )
        
        assert resp.status_code == 200
        data = resp.json()
        # Only immediate_loading options
        assert "PMMA Crown with Temporary Abutment" in data["options"]
        assert len(data["options"]) == 5  # Only immediate_loading options


class TestProcedureCreation:
    """Test POST /api/procedures with new required fields."""
    
    def test_create_procedure_with_new_fields(self, student_token, supervisor_info, incharge_info):
        """Create procedure with implant_procedure_type and loading_type."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Calculate future date (>24 hours) - use Wednesday to avoid weekend
        future_date = datetime.now() + timedelta(days=3)
        while future_date.weekday() >= 5:  # Skip weekends
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_NewForm_Patient",
            "registration_number": "TEST-NF-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "REC-TEST-NF-001",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
            "bone_graft_specifications": "Test bone graft specs",
        }
        
        resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        # Verify new fields are stored
        assert data["implant_procedure_type"] == "Single Conventional Implant"
        assert data["loading_type"] == ["Delayed Loading"]
        assert data["prosthetic_plan"] == "Cement Retained Crown - Zirconia"
        assert data["bone_graft_specifications"] == "Test bone graft specs"
        
        return data["id"]
    
    def test_create_procedure_multiple_loading_types(self, student_token, supervisor_info, incharge_info):
        """Create procedure with both loading types selected."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        future_date = datetime.now() + timedelta(days=4)
        while future_date.weekday() >= 5:
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_MultiLoading_Patient",
            "registration_number": "TEST-ML-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "REC-TEST-ML-001",
            "amount_paid": 7000.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "Multiple Conventional Implants",
            "loading_type": ["Immediate Loading", "Delayed Loading"],  # Both selected
            "prosthetic_plan": "",
        }
        
        resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert len(data["loading_type"]) == 2
        assert "Immediate Loading" in data["loading_type"]
        assert "Delayed Loading" in data["loading_type"]
    
    def test_reject_invalid_procedure_type(self, student_token, supervisor_info, incharge_info):
        """Backend rejects invalid implant_procedure_type."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        future_date = datetime.now() + timedelta(days=5)
        while future_date.weekday() >= 5:
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_Invalid_Patient",
            "registration_number": "TEST-INV-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "REC-TEST-INV-001",
            "amount_paid": 1000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Invalid Procedure Type",  # INVALID
            "loading_type": ["Delayed Loading"],
        }
        
        resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        
        assert resp.status_code == 400, f"Expected 400 for invalid procedure type, got {resp.status_code}"
        assert "Invalid implant procedure type" in resp.json()["detail"]
    
    def test_reject_invalid_loading_type(self, student_token, supervisor_info, incharge_info):
        """Backend rejects invalid loading_type."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        future_date = datetime.now() + timedelta(days=5)
        while future_date.weekday() >= 5:
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_InvalidLoading_Patient",
            "registration_number": "TEST-IL-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "REC-TEST-IL-001",
            "amount_paid": 1000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Invalid Loading Type"],  # INVALID
        }
        
        resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        
        assert resp.status_code == 400, f"Expected 400 for invalid loading type, got {resp.status_code}"
        assert "Invalid loading type" in resp.json()["detail"]
    
    def test_all_9_procedure_types_accepted(self, student_token, supervisor_info, incharge_info):
        """Verify all 9 valid procedure types are accepted by backend."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        for i, ptype in enumerate(VALID_PROCEDURE_TYPES):
            future_date = datetime.now() + timedelta(days=5 + i)
            while future_date.weekday() >= 5:
                future_date += timedelta(days=1)
            procedure_date = future_date.strftime("%Y-%m-%d")
            
            payload = {
                "student_name": "Test Student",
                "patient_name": f"TEST_ProcType_{i}_Patient",
                "registration_number": f"TEST-PT-{i:03d}",
                "supervisor_id": supervisor_info["id"],
                "supervisor_name": supervisor_info["name"],
                "implant_incharge_id": incharge_info["id"],
                "implant_incharge_name": incharge_info["name"],
                "receipt_number": f"REC-TEST-PT-{i:03d}",
                "amount_paid": 1000.0,
                "procedure_date": procedure_date,
                "procedure_time": "10:00",
                "implant_procedure_type": ptype,
                "loading_type": ["Delayed Loading"],
            }
            
            resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
            
            assert resp.status_code == 200, f"Procedure type '{ptype}' rejected: {resp.status_code} - {resp.text}"


class TestScheduleRestrictions:
    """Test scheduling restrictions for time slots."""
    
    def test_saturday_only_10am(self, student_token, supervisor_info, incharge_info):
        """Saturday only allows 10:00 AM (9:30 in backend) slot."""
        headers = {"Authorization": f"Bearer {student_token}"}
        
        # Find next Saturday
        future_date = datetime.now() + timedelta(days=2)
        while future_date.weekday() != 5:  # Saturday = 5
            future_date += timedelta(days=1)
        procedure_date = future_date.strftime("%Y-%m-%d")
        
        # Try 2PM on Saturday - should fail
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_SatPM_Patient",
            "registration_number": "TEST-SATPM-001",
            "supervisor_id": supervisor_info["id"],
            "supervisor_name": supervisor_info["name"],
            "implant_incharge_id": incharge_info["id"],
            "implant_incharge_name": incharge_info["name"],
            "receipt_number": "REC-TEST-SATPM-001",
            "amount_paid": 1000.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",  # 2PM not allowed on Saturday
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
        }
        
        resp = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        
        # Backend should reject 14:00 on Saturday
        assert resp.status_code == 400, f"Expected 400 for 2PM on Saturday, got {resp.status_code}"


class TestCleanup:
    """Cleanup test data after tests."""
    
    def test_cleanup_test_procedures(self, incharge_token):
        """Delete all TEST_ prefixed procedures."""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        resp = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        
        if resp.status_code == 200:
            procedures = resp.json()
            for proc in procedures:
                if proc.get("patient_name", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}", 
                        headers=headers
                    )
                    print(f"Deleted test procedure: {proc['id']} - {del_resp.status_code}")
