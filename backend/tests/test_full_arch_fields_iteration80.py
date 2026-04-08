"""
Test Full Arch Fields: available_interarch_space and opposing_arch
Iteration 80 - Testing new fields for Full Arch types (All on 4/6/X)

Tests:
1. POST /api/procedures accepts available_interarch_space and opposing_arch fields
2. GET /api/procedures/{id} returns stored values
3. PDF generation includes 'Available Interarch Space: X mm' and 'Opposing Arch: Y'
4. Test all 4 opposing_arch options: Natural Dentition, Fixed Implant Prosthesis, Removable Prosthesis, Edentulous
5. Backward compatibility - existing procedures without new fields still work
6. PDF generation with both edentulous site fields and full arch fields together
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials - Implant In-Charge
TEST_EMAIL = "Abhijit.patil@dental.edu"
TEST_PASSWORD = "Admin@123"

# Opposing arch options to test
OPPOSING_ARCH_OPTIONS = [
    "Natural Dentition",
    "Fixed Implant Prosthesis",
    "Removable Prosthesis",
    "Edentulous"
]


class TestFullArchFields:
    """Test available_interarch_space and opposing_arch fields for Full Arch procedures"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token") or login_data.get("token")
        self.user = login_data.get("user", {})
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store created procedure IDs for cleanup
        self.created_procedure_ids = []
        
        yield
        
        # Cleanup: Delete created procedures
        for proc_id in self.created_procedure_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/procedures/{proc_id}")
            except:
                pass
    
    def _get_unique_time_slot(self, base_hour=14):
        """Get a unique time slot for testing"""
        # Use future date to avoid conflicts
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        return future_date, f"{base_hour}:00"
    
    def _create_full_arch_procedure(self, available_interarch_space=None, opposing_arch=None, 
                                     procedure_type="All on 4", time_offset=0,
                                     occlusocervical_height=None, mesiodistal_space=None):
        """Helper to create a Full Arch procedure with optional new fields"""
        proc_date, proc_time = self._get_unique_time_slot(14 + time_offset)
        
        # Get users for supervisor and incharge
        users_response = self.session.get(f"{BASE_URL}/api/users")
        users = users_response.json() if users_response.status_code == 200 else []
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Required users (supervisor/incharge) not found")
        
        payload = {
            "patient_name": f"TEST_FullArch_{datetime.now().strftime('%H%M%S')}",
            "registration_number": f"TEST-FA-{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name"),
            "receipt_number": f"REC-TEST-{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 50000.0,
            "procedure_date": proc_date,
            "procedure_time": proc_time,
            "implant_procedure_type": procedure_type,
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Full Arch Zirconia Prosthesis"
        }
        
        # Add new full arch fields if provided
        if available_interarch_space is not None:
            payload["available_interarch_space"] = available_interarch_space
        if opposing_arch is not None:
            payload["opposing_arch"] = opposing_arch
        
        # Add edentulous site fields if provided
        if occlusocervical_height is not None:
            payload["occlusocervical_height"] = occlusocervical_height
        if mesiodistal_space is not None:
            payload["mesiodistal_space"] = mesiodistal_space
        
        return payload
    
    # ─── Test 1: POST accepts available_interarch_space and opposing_arch ───
    def test_create_procedure_with_full_arch_fields(self):
        """Test that POST /api/procedures accepts available_interarch_space and opposing_arch"""
        payload = self._create_full_arch_procedure(
            available_interarch_space="18",
            opposing_arch="Natural Dentition",
            time_offset=0
        )
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        # Verify fields are in response
        assert data.get("available_interarch_space") == "18", f"available_interarch_space not stored correctly: {data.get('available_interarch_space')}"
        assert data.get("opposing_arch") == "Natural Dentition", f"opposing_arch not stored correctly: {data.get('opposing_arch')}"
        
        print(f"✓ Created procedure with available_interarch_space='18' and opposing_arch='Natural Dentition'")
    
    # ─── Test 2: GET returns stored values ───
    def test_get_procedure_returns_full_arch_fields(self):
        """Test that GET /api/procedures/{id} returns stored available_interarch_space and opposing_arch"""
        # Create procedure first
        payload = self._create_full_arch_procedure(
            available_interarch_space="22",
            opposing_arch="Fixed Implant Prosthesis",
            time_offset=1
        )
        
        create_response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created_data = create_response.json()
        proc_id = created_data.get("id") or created_data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        # GET the procedure
        get_response = self.session.get(f"{BASE_URL}/api/procedures/{proc_id}")
        assert get_response.status_code == 200, f"GET failed: {get_response.status_code}"
        
        data = get_response.json()
        assert data.get("available_interarch_space") == "22", f"GET: available_interarch_space mismatch: {data.get('available_interarch_space')}"
        assert data.get("opposing_arch") == "Fixed Implant Prosthesis", f"GET: opposing_arch mismatch: {data.get('opposing_arch')}"
        
        print(f"✓ GET returns correct values: available_interarch_space='22', opposing_arch='Fixed Implant Prosthesis'")
    
    # ─── Test 3: PDF contains Available Interarch Space and Opposing Arch ───
    def test_pdf_contains_full_arch_fields(self):
        """Test that PDF generation includes 'Available Interarch Space: 18 mm' and 'Opposing Arch: Natural Dentition'"""
        # Create procedure with full arch fields
        payload = self._create_full_arch_procedure(
            available_interarch_space="18",
            opposing_arch="Natural Dentition",
            time_offset=2
        )
        
        create_response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        assert create_response.status_code in [200, 201], f"Create failed: {create_response.text}"
        
        created_data = create_response.json()
        proc_id = created_data.get("id") or created_data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        # Generate PDF
        pdf_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/case-report")
        
        assert pdf_response.status_code == 200, f"PDF generation failed: {pdf_response.status_code} - {pdf_response.text}"
        assert pdf_response.headers.get("content-type") == "application/pdf", "Response is not a PDF"
        
        # Check PDF content (basic check - PDF should be non-empty)
        pdf_content = pdf_response.content
        assert len(pdf_content) > 1000, "PDF content seems too small"
        
        # Extract text from PDF using PyPDF2
        import io
        from PyPDF2 import PdfReader
        
        pdf_file = io.BytesIO(pdf_content)
        reader = PdfReader(pdf_file)
        
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() or ""
        
        # Check for field presence in extracted text
        assert "Available Interarch Space" in full_text, f"PDF missing 'Available Interarch Space' field. PDF text: {full_text[:500]}"
        assert "Opposing Arch" in full_text, f"PDF missing 'Opposing Arch' field"
        assert "Natural Dentition" in full_text, f"PDF missing 'Natural Dentition' value"
        assert "18 mm" in full_text or "18mm" in full_text, f"PDF missing '18 mm' value"
        
        print(f"✓ PDF generated successfully with full arch fields")
    
    # ─── Test 4: All 4 opposing_arch options work ───
    @pytest.mark.parametrize("opposing_arch_option", OPPOSING_ARCH_OPTIONS)
    def test_all_opposing_arch_options(self, opposing_arch_option):
        """Test each of the 4 opposing_arch options: Natural Dentition, Fixed Implant Prosthesis, Removable Prosthesis, Edentulous"""
        # Use different time offsets for each option to avoid slot conflicts
        time_offset = OPPOSING_ARCH_OPTIONS.index(opposing_arch_option) + 3
        
        payload = self._create_full_arch_procedure(
            available_interarch_space="15",
            opposing_arch=opposing_arch_option,
            time_offset=time_offset
        )
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed for '{opposing_arch_option}': {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        assert data.get("opposing_arch") == opposing_arch_option, f"opposing_arch mismatch: expected '{opposing_arch_option}', got '{data.get('opposing_arch')}'"
        
        print(f"✓ opposing_arch option '{opposing_arch_option}' works correctly")
    
    # ─── Test 5: Backward compatibility - procedures without new fields ───
    def test_backward_compatibility_no_new_fields(self):
        """Test that procedures without available_interarch_space and opposing_arch still work"""
        payload = self._create_full_arch_procedure(time_offset=7)
        # Don't include the new fields
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        # Fields should be empty/None
        assert data.get("available_interarch_space") in [None, "", ""], "available_interarch_space should be empty"
        assert data.get("opposing_arch") in [None, "", ""], "opposing_arch should be empty"
        
        # PDF should still generate without errors
        pdf_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/case-report")
        assert pdf_response.status_code == 200, f"PDF generation failed for procedure without new fields: {pdf_response.status_code}"
        
        print(f"✓ Backward compatibility verified - procedures without new fields work correctly")
    
    # ─── Test 6: PDF with both edentulous site fields AND full arch fields ───
    def test_pdf_with_edentulous_and_full_arch_fields(self):
        """Test PDF generation with both edentulous site fields (occlusocervical_height, mesiodistal_space) and full arch fields together"""
        payload = self._create_full_arch_procedure(
            available_interarch_space="20",
            opposing_arch="Removable Prosthesis",
            occlusocervical_height="15.5",
            mesiodistal_space="12.0",
            time_offset=8
        )
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        # Verify all fields stored
        assert data.get("available_interarch_space") == "20"
        assert data.get("opposing_arch") == "Removable Prosthesis"
        assert data.get("occlusocervical_height") == "15.5"
        assert data.get("mesiodistal_space") == "12.0"
        
        # Generate PDF
        pdf_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/case-report")
        
        assert pdf_response.status_code == 200, f"PDF generation failed: {pdf_response.status_code}"
        
        # Extract text from PDF using PyPDF2
        import io
        from PyPDF2 import PdfReader
        
        pdf_content = pdf_response.content
        pdf_file = io.BytesIO(pdf_content)
        reader = PdfReader(pdf_file)
        
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() or ""
        
        # Check for both sets of fields
        assert "Available Interarch Space" in full_text, f"PDF missing interarch space field. Text: {full_text[:500]}"
        assert "Opposing Arch" in full_text, "PDF missing opposing arch field"
        assert "Removable Prosthesis" in full_text, "PDF missing 'Removable Prosthesis' value"
        
        print(f"✓ PDF generated with both edentulous site fields and full arch fields")
    
    # ─── Test 7: All on 6 procedure type ───
    def test_all_on_6_procedure_type(self):
        """Test full arch fields with 'All on 6' procedure type"""
        payload = self._create_full_arch_procedure(
            available_interarch_space="25",
            opposing_arch="Edentulous",
            procedure_type="All on 6",
            time_offset=9
        )
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        assert data.get("implant_procedure_type") == "All on 6"
        assert data.get("available_interarch_space") == "25"
        assert data.get("opposing_arch") == "Edentulous"
        
        print(f"✓ 'All on 6' procedure type with full arch fields works correctly")
    
    # ─── Test 8: All on X procedure type ───
    def test_all_on_x_procedure_type(self):
        """Test full arch fields with 'All on X' procedure type"""
        payload = self._create_full_arch_procedure(
            available_interarch_space="19",
            opposing_arch="Fixed Implant Prosthesis",
            procedure_type="All on X",
            time_offset=10
        )
        
        response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
        
        assert response.status_code in [200, 201], f"Create failed: {response.status_code} - {response.text}"
        
        data = response.json()
        proc_id = data.get("id") or data.get("_id")
        self.created_procedure_ids.append(proc_id)
        
        assert data.get("implant_procedure_type") == "All on X"
        assert data.get("available_interarch_space") == "19"
        assert data.get("opposing_arch") == "Fixed Implant Prosthesis"
        
        print(f"✓ 'All on X' procedure type with full arch fields works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
