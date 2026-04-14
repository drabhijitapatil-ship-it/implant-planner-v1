"""
Iteration 84: Backend Tests for Arch Field and Tooth-Specific Bone Info Logic

Tests:
1. Backend: POST /api/procedures with 'arch' field for Full Arch procedure types
2. Backend: POST /api/procedures without 'arch' for Single Implant/Multiple Implant
3. Backend: GET /api/procedures/{id} returns the arch field
4. Backend: Smart Planner with Maxillary arch returns 'Maxillary Restorative Space Analysis' title
5. Backend: Smart Planner with Mandibular arch returns 'Mandibular Restorative Space Analysis' title
6. Backend: Smart Planner material compatibility returns 5 prosthesis types
7. Frontend code verification: BoneInputs accepts 'tooth' prop (file inspection)
8. Frontend code verification: CaseImplantPlanning has boneWidthInfo/boneHeightInfo useMemo hooks
"""

import pytest
import requests
import os
import re
from datetime import datetime, timedelta
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


def get_next_weekday(days_ahead=1):
    """Get a future weekday (Mon-Fri) date string"""
    date = datetime.now() + timedelta(days=days_ahead)
    # Skip weekends
    while date.weekday() >= 5:  # 5=Saturday, 6=Sunday
        date += timedelta(days=1)
    return date.strftime("%Y-%m-%d")


class TestHealthCheck:
    """Basic health check to ensure backend is running"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("✓ Health check passed")


class TestAuthentication:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for Implant In-Charge"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✓ Authenticated as Implant In-Charge")
        return data["access_token"]
    
    def test_login_success(self, auth_token):
        """Verify login works"""
        assert auth_token is not None
        print("✓ Login successful")


class TestArchFieldProcedures:
    """Test arch field in procedures API"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def supervisor_id(self, headers):
        """Get a supervisor ID"""
        response = requests.get(f"{BASE_URL}/api/users?role=supervisor", headers=headers)
        assert response.status_code == 200
        users = response.json()
        assert len(users) > 0
        return users[0]["id"]
    
    @pytest.fixture(scope="class")
    def incharge_id(self, headers):
        """Get implant incharge ID"""
        response = requests.get(f"{BASE_URL}/api/users?role=implant_incharge", headers=headers)
        assert response.status_code == 200
        users = response.json()
        assert len(users) > 0
        return users[0]["id"]
    
    def test_create_full_arch_with_maxillary_arch(self, headers, supervisor_id, incharge_id):
        """Test POST /api/procedures with arch='Maxillary' for All on 4"""
        procedure_id = None
        try:
            for day_offset in [30, 31, 32, 33, 34, 35, 36, 37]:
                future_date = get_next_weekday(day_offset)
                
                procedure_data = {
                    "patient_name": "TEST_Arch_Maxillary_Patient",
                    "registration_number": f"TEST-ARCH-MAX-{day_offset}",
                    "supervisor_id": supervisor_id,
                    "supervisor_name": "Test Supervisor",
                    "implant_incharge_id": incharge_id,
                    "implant_incharge_name": "Test Incharge",
                    "receipt_number": f"TEST-REC-{day_offset}",
                    "amount_paid": 50000,
                    "procedure_date": future_date,
                    "procedure_time": "10:00",
                    "implant_procedure_type": "All on 4",
                    "loading_type": ["Immediate Loading"],
                    "prosthetic_plan": "Full Arch Zirconia",
                    "arch": "Maxillary",
                    "available_interarch_space": "14"
                }
                
                response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    assert data.get("arch") == "Maxillary", f"Expected arch='Maxillary', got {data.get('arch')}"
                    assert data.get("implant_procedure_type") == "All on 4"
                    procedure_id = data.get("id") or data.get("_id")
                    print(f"✓ Created Full Arch procedure with Maxillary arch (ID: {procedure_id})")
                    break
                elif response.status_code == 409:
                    continue  # Try next date
                else:
                    pytest.fail(f"Unexpected error: {response.status_code} - {response.text}")
            
            assert procedure_id is not None, "Could not create procedure - all slots taken"
        finally:
            if procedure_id:
                requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
    
    def test_create_full_arch_with_mandibular_arch(self, headers, supervisor_id, incharge_id):
        """Test POST /api/procedures with arch='Mandibular' for All on 6"""
        procedure_id = None
        try:
            for day_offset in [40, 41, 42, 43, 44, 45, 46, 47]:
                future_date = get_next_weekday(day_offset)
                
                procedure_data = {
                    "patient_name": "TEST_Arch_Mandibular_Patient",
                    "registration_number": f"TEST-ARCH-MAND-{day_offset}",
                    "supervisor_id": supervisor_id,
                    "supervisor_name": "Test Supervisor",
                    "implant_incharge_id": incharge_id,
                    "implant_incharge_name": "Test Incharge",
                    "receipt_number": f"TEST-REC-MAND-{day_offset}",
                    "amount_paid": 60000,
                    "procedure_date": future_date,
                    "procedure_time": "14:00",
                    "implant_procedure_type": "All on 6",
                    "loading_type": ["Delayed Loading"],
                    "prosthetic_plan": "Full Arch Hybrid",
                    "arch": "Mandibular",
                    "available_interarch_space": "12"
                }
                
                response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    assert data.get("arch") == "Mandibular", f"Expected arch='Mandibular', got {data.get('arch')}"
                    assert data.get("implant_procedure_type") == "All on 6"
                    procedure_id = data.get("id") or data.get("_id")
                    print(f"✓ Created Full Arch procedure with Mandibular arch (ID: {procedure_id})")
                    break
                elif response.status_code == 409:
                    continue
                else:
                    pytest.fail(f"Unexpected error: {response.status_code} - {response.text}")
            
            assert procedure_id is not None, "Could not create procedure - all slots taken"
        finally:
            if procedure_id:
                requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
    
    def test_create_single_implant_without_arch(self, headers, supervisor_id, incharge_id):
        """Test POST /api/procedures without arch for Single Implant"""
        procedure_id = None
        try:
            for day_offset in [50, 51, 52, 53, 54, 55, 56, 57]:
                future_date = get_next_weekday(day_offset)
                
                procedure_data = {
                    "patient_name": "TEST_Single_Implant_Patient",
                    "registration_number": f"TEST-SINGLE-{day_offset}",
                    "supervisor_id": supervisor_id,
                    "supervisor_name": "Test Supervisor",
                    "implant_incharge_id": incharge_id,
                    "implant_incharge_name": "Test Incharge",
                    "receipt_number": f"TEST-REC-SINGLE-{day_offset}",
                    "amount_paid": 25000,
                    "procedure_date": future_date,
                    "procedure_time": "10:00",
                    "implant_procedure_type": "Single Conventional Implant",
                    "loading_type": ["Delayed Loading"],
                    "prosthetic_plan": "Cement Retained Crown - Zirconia",
                    "implant_site": "14"
                }
                
                response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    arch_value = data.get("arch", "")
                    assert arch_value == "" or arch_value is None, f"Expected empty arch for Single Implant, got {arch_value}"
                    assert data.get("implant_procedure_type") == "Single Conventional Implant"
                    procedure_id = data.get("id") or data.get("_id")
                    print(f"✓ Created Single Implant procedure without arch (ID: {procedure_id})")
                    break
                elif response.status_code == 409:
                    continue
                else:
                    pytest.fail(f"Unexpected error: {response.status_code} - {response.text}")
            
            assert procedure_id is not None, "Could not create procedure - all slots taken"
        finally:
            if procedure_id:
                requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
    
    def test_get_procedure_returns_arch_field(self, headers, supervisor_id, incharge_id):
        """Test GET /api/procedures/{id} returns the arch field"""
        procedure_id = None
        try:
            for day_offset in [60, 61, 62, 63, 64, 65, 66, 67]:
                future_date = get_next_weekday(day_offset)
                
                procedure_data = {
                    "patient_name": "TEST_Get_Arch_Patient",
                    "registration_number": f"TEST-GET-ARCH-{day_offset}",
                    "supervisor_id": supervisor_id,
                    "supervisor_name": "Test Supervisor",
                    "implant_incharge_id": incharge_id,
                    "implant_incharge_name": "Test Incharge",
                    "receipt_number": f"TEST-REC-GET-{day_offset}",
                    "amount_paid": 55000,
                    "procedure_date": future_date,
                    "procedure_time": "14:00",
                    "implant_procedure_type": "All on X",
                    "loading_type": ["Early Loading"],
                    "prosthetic_plan": "Full Arch Titanium Framework",
                    "arch": "Maxillary",
                    "available_interarch_space": "15"
                }
                
                create_response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=headers)
                
                if create_response.status_code in [200, 201]:
                    created_data = create_response.json()
                    procedure_id = created_data.get("id") or created_data.get("_id")
                    
                    # GET the procedure
                    get_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
                    assert get_response.status_code == 200, f"Failed to get procedure: {get_response.text}"
                    
                    get_data = get_response.json()
                    assert get_data.get("arch") == "Maxillary", f"GET did not return arch field correctly: {get_data.get('arch')}"
                    assert get_data.get("available_interarch_space") == "15"
                    
                    print(f"✓ GET /api/procedures/{procedure_id} returns arch='Maxillary' correctly")
                    break
                elif create_response.status_code == 409:
                    continue
                else:
                    pytest.fail(f"Unexpected error: {create_response.status_code} - {create_response.text}")
            
            assert procedure_id is not None, "Could not create procedure - all slots taken"
        finally:
            if procedure_id:
                requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)


class TestSmartPlannerLogic:
    """Test Smart Planner internal logic with arch-based dynamic labels"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token, connect to MongoDB"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Connect to MongoDB for direct status updates
        self.mongo_client = MongoClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "Abhijit.patil@dental.edu",
            "password": "Admin@123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token") or login_data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get users
        users_response = self.session.get(f"{BASE_URL}/api/users")
        users = users_response.json() if users_response.status_code == 200 else []
        
        self.supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        self.incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        # Store created procedure IDs for cleanup
        self.created_procedure_ids = []
        
        yield
        
        # Cleanup: Delete created procedures
        for proc_id in self.created_procedure_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/procedures/{proc_id}")
            except:
                pass
        
        # Close MongoDB connection
        self.mongo_client.close()
    
    def _get_valid_weekday_slot(self, days_offset=30):
        """Get a valid weekday slot (Mon-Fri)"""
        base_date = datetime.now() + timedelta(days=days_offset)
        while base_date.weekday() >= 5:
            base_date += timedelta(days=1)
        return base_date.strftime("%Y-%m-%d"), "14:00"
    
    def _advance_to_smart_planner_status(self, proc_id):
        """Advance procedure to a status that allows Smart Planner generation via direct MongoDB update"""
        result = self.db.procedures.update_one(
            {"_id": ObjectId(proc_id)},
            {"$set": {"status": "completed"}}
        )
        return result.modified_count > 0
    
    def _create_procedure(self, procedure_type, arch, interarch_space, days_offset):
        """Create a procedure with given parameters"""
        date, time = self._get_valid_weekday_slot(days_offset)
        
        payload = {
            "patient_name": f"TEST_SP_{arch}_{days_offset}",
            "registration_number": f"TEST-SP-{arch}-{days_offset}",
            "supervisor_id": self.supervisor["id"],
            "supervisor_name": self.supervisor["name"],
            "implant_incharge_id": self.incharge["id"],
            "implant_incharge_name": self.incharge["name"],
            "receipt_number": f"TEST-REC-SP-{days_offset}",
            "amount_paid": 70000,
            "procedure_date": date,
            "procedure_time": time,
            "implant_procedure_type": procedure_type,
            "loading_type": ["Immediate Loading"],
            "prosthetic_plan": "Full Arch Zirconia",
            "arch": arch,
            "available_interarch_space": interarch_space
        }
        
        for attempt in range(8):
            response = self.session.post(f"{BASE_URL}/api/procedures", json=payload)
            if response.status_code in [200, 201]:
                data = response.json()
                proc_id = data.get("id") or data.get("_id")
                self.created_procedure_ids.append(proc_id)
                return proc_id
            elif response.status_code == 409:
                # Slot taken, try next day
                days_offset += 1
                date, time = self._get_valid_weekday_slot(days_offset)
                payload["procedure_date"] = date
                payload["registration_number"] = f"TEST-SP-{arch}-{days_offset}"
                payload["patient_name"] = f"TEST_SP_{arch}_{days_offset}"
            else:
                pytest.fail(f"Failed to create procedure: {response.status_code} - {response.text}")
        
        pytest.fail("Could not create procedure - all slots taken")
    
    def test_smart_planner_maxillary_arch_label(self):
        """Test Smart Planner generates 'Maxillary Restorative Space Analysis' for Maxillary arch"""
        if not self.supervisor or not self.incharge:
            pytest.skip("Required users not found")
        
        proc_id = self._create_procedure("All on 4", "Maxillary", "14", 70)
        
        # Advance to Smart Planner eligible status
        status_updated = self._advance_to_smart_planner_status(proc_id)
        assert status_updated, "Failed to update procedure status for Smart Planner"
        
        # Get Smart Planner report
        sp_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/smart-planner")
        assert sp_response.status_code == 200, f"Failed to get Smart Planner: {sp_response.text}"
        
        sp_data = sp_response.json()
        modules = sp_data.get("modules", [])
        
        # Find interarch_space module
        interarch_module = next((m for m in modules if m.get("id") == "interarch_space"), None)
        assert interarch_module is not None, f"interarch_space module not found. Modules: {[m.get('id') for m in modules]}"
        
        # Verify title contains 'Maxillary Restorative Space'
        title = interarch_module.get("title", "")
        assert "Maxillary Restorative Space" in title, f"Expected 'Maxillary Restorative Space' in title, got: {title}"
        
        # Verify arch is in data
        data = interarch_module.get("data", {})
        assert data.get("arch") == "Maxillary", f"arch in module data should be 'Maxillary', got: {data.get('arch')}"
        
        print(f"✓ Smart Planner returns '{title}' for Maxillary arch")
    
    def test_smart_planner_mandibular_arch_label(self):
        """Test Smart Planner generates 'Mandibular Restorative Space Analysis' for Mandibular arch"""
        if not self.supervisor or not self.incharge:
            pytest.skip("Required users not found")
        
        proc_id = self._create_procedure("All on 6", "Mandibular", "12", 80)
        
        # Advance to Smart Planner eligible status
        status_updated = self._advance_to_smart_planner_status(proc_id)
        assert status_updated, "Failed to update procedure status for Smart Planner"
        
        # Get Smart Planner report
        sp_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/smart-planner")
        assert sp_response.status_code == 200, f"Failed to get Smart Planner: {sp_response.text}"
        
        sp_data = sp_response.json()
        modules = sp_data.get("modules", [])
        
        interarch_module = next((m for m in modules if m.get("id") == "interarch_space"), None)
        assert interarch_module is not None, "interarch_space module not found"
        
        title = interarch_module.get("title", "")
        assert "Mandibular Restorative Space" in title, f"Expected 'Mandibular Restorative Space' in title, got: {title}"
        
        data = interarch_module.get("data", {})
        assert data.get("arch") == "Mandibular", f"arch in module data should be 'Mandibular', got: {data.get('arch')}"
        
        print(f"✓ Smart Planner returns '{title}' for Mandibular arch")
    
    def test_smart_planner_material_compatibility_5_types(self):
        """Test Smart Planner material compatibility returns 5 prosthesis types"""
        if not self.supervisor or not self.incharge:
            pytest.skip("Required users not found")
        
        proc_id = self._create_procedure("All on X", "Maxillary", "16", 90)
        
        # Advance to Smart Planner eligible status
        status_updated = self._advance_to_smart_planner_status(proc_id)
        assert status_updated, "Failed to update procedure status for Smart Planner"
        
        # Get Smart Planner report
        sp_response = self.session.post(f"{BASE_URL}/api/procedures/{proc_id}/smart-planner")
        assert sp_response.status_code == 200, f"Failed to get Smart Planner: {sp_response.text}"
        
        sp_data = sp_response.json()
        modules = sp_data.get("modules", [])
        
        # Find material_compatibility module
        mat_module = next((m for m in modules if m.get("id") == "material_compatibility"), None)
        assert mat_module is not None, "material_compatibility module not found"
        
        mat_data = mat_module.get("data", {})
        suitable = mat_data.get("suitable", [])
        limited = mat_data.get("limited", [])
        not_feasible = mat_data.get("not_feasible", [])
        
        total_types = len(suitable) + len(limited) + len(not_feasible)
        assert total_types == 5, f"Expected 5 prosthesis types, got {total_types}"
        
        # Verify the 5 expected prosthesis types are present
        all_types_text = " ".join(suitable + limited + not_feasible)
        expected_types = [
            "Fixed Prosthesis",
            "Overdentures with Individual Attachments",
            "Overdenture with Bar Attachments",
            "Hybrid Prosthesis with Metal Framework and Acrylic",
            "Zirconia Hybrid Prosthesis"
        ]
        
        for expected in expected_types:
            assert expected in all_types_text, f"Missing prosthesis type: {expected}"
        
        print(f"✓ Smart Planner material compatibility returns 5 prosthesis types: {total_types} total")
        print(f"  - Suitable: {len(suitable)}, Limited: {len(limited)}, Not Feasible: {len(not_feasible)}")


class TestFrontendCodeVerification:
    """Verify frontend code implements tooth-specific bone info logic correctly"""
    
    def test_bone_inputs_accepts_tooth_prop(self):
        """Verify BoneInputs component in implant-selection.tsx accepts 'tooth' prop"""
        file_path = "/app/frontend/app/(tabs)/implant-selection.tsx"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check BoneInputs function signature includes tooth prop
        assert "function BoneInputs" in content, "BoneInputs function not found"
        assert "tooth: string | null" in content, "BoneInputs does not accept 'tooth' prop"
        
        # Check BoneInputs is called with tooth prop in Let Me Choose mode
        assert "tooth={cTooth}" in content, "BoneInputs not called with tooth={cTooth} in Let Me Choose"
        
        # Check BoneInputs is called with tooth prop in Suggest Me mode
        assert "tooth={sTooth}" in content, "BoneInputs not called with tooth={sTooth} in Suggest Me"
        
        print("✓ BoneInputs component accepts 'tooth' prop and is called correctly in both modes")
    
    def test_bone_inputs_width_info_logic(self):
        """Verify widthInfo useMemo has correct tooth-specific logic"""
        file_path = "/app/frontend/app/(tabs)/implant-selection.tsx"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check widthInfo useMemo exists
        assert "const widthInfo = React.useMemo" in content, "widthInfo useMemo not found"
        
        # Check tooth-specific rules for Bone Width
        # Anterior maxillary (11-13, 21-23): labial and palatal
        assert "[11,12,13,21,22,23]" in content, "Missing anterior maxillary teeth for widthInfo"
        assert "labial and palatal" in content, "Missing 'labial and palatal' text for anterior maxillary"
        
        # Posterior maxillary (14-17, 24-27): buccal and palatal
        assert "[14,15,16,17,24,25,26,27]" in content, "Missing posterior maxillary teeth for widthInfo"
        assert "buccal and palatal" in content, "Missing 'buccal and palatal' text for posterior maxillary"
        
        # Anterior mandibular (31-33, 41-43): labial and lingual
        assert "[31,32,33,41,42,43]" in content, "Missing anterior mandibular teeth for widthInfo"
        assert "labial and lingual" in content, "Missing 'labial and lingual' text for anterior mandibular"
        
        # Posterior mandibular (34-37, 44-47): buccal and lingual
        assert "[34,35,36,37,44,45,46,47]" in content, "Missing posterior mandibular teeth for widthInfo"
        assert "buccal and lingual" in content, "Missing 'buccal and lingual' text for posterior mandibular"
        
        print("✓ widthInfo useMemo has correct tooth-specific logic for all 4 regions")
    
    def test_bone_inputs_height_info_logic(self):
        """Verify heightInfo useMemo has correct tooth-specific logic"""
        file_path = "/app/frontend/app/(tabs)/implant-selection.tsx"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check heightInfo useMemo exists
        assert "const heightInfo = React.useMemo" in content, "heightInfo useMemo not found"
        
        # Posterior maxillary (14-17, 24-27): crest to maxillary sinus floor
        assert "maxillary sinus" in content.lower() or "floor of maxillary sinus" in content, "Missing maxillary sinus reference for heightInfo"
        
        # Posterior mandibular (34-37, 44-47): crest to inferior alveolar nerve
        assert "inferior alveolar nerve" in content, "Missing inferior alveolar nerve reference for heightInfo"
        
        print("✓ heightInfo useMemo has correct tooth-specific logic for posterior teeth")
    
    def test_case_implant_planning_bone_info_hooks(self):
        """Verify CaseImplantPlanning.tsx has boneWidthInfo/boneHeightInfo useMemo hooks"""
        file_path = "/app/frontend/components/CaseImplantPlanning.tsx"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check boneWidthInfo useMemo exists
        assert "const boneWidthInfo = React.useMemo" in content, "boneWidthInfo useMemo not found in CaseImplantPlanning"
        
        # Check boneHeightInfo useMemo exists
        assert "const boneHeightInfo = React.useMemo" in content, "boneHeightInfo useMemo not found in CaseImplantPlanning"
        
        # Check tooth-specific rules are present
        assert "[11,12,13,21,22,23]" in content, "Missing anterior maxillary teeth in CaseImplantPlanning"
        assert "[14,15,16,17,24,25,26,27]" in content, "Missing posterior maxillary teeth in CaseImplantPlanning"
        assert "[31,32,33,41,42,43]" in content, "Missing anterior mandibular teeth in CaseImplantPlanning"
        assert "[34,35,36,37,44,45,46,47]" in content, "Missing posterior mandibular teeth in CaseImplantPlanning"
        
        # Check info icons are rendered
        assert 'name="information-circle"' in content, "Info icon not found in CaseImplantPlanning"
        
        # Check focus state handling
        assert "bwFocused" in content, "bwFocused state not found"
        assert "bhFocused" in content, "bhFocused state not found"
        
        print("✓ CaseImplantPlanning.tsx has boneWidthInfo/boneHeightInfo useMemo hooks with correct logic")
    
    def test_info_text_disappears_on_focus(self):
        """Verify info text disappears when input is focused"""
        file_path = "/app/frontend/app/(tabs)/implant-selection.tsx"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check focus state variables exist
        assert "widthFocused" in content, "widthFocused state not found"
        assert "heightFocused" in content, "heightFocused state not found"
        
        # Check conditional rendering based on focus
        assert "!widthFocused" in content, "widthFocused conditional not found"
        assert "!heightFocused" in content, "heightFocused conditional not found"
        
        # Check onFocus/onBlur handlers
        assert "onFocus={() => setWidthFocused(true)}" in content, "onFocus handler for width not found"
        assert "onBlur={() => setWidthFocused(false)}" in content, "onBlur handler for width not found"
        
        print("✓ Info text correctly disappears when input is focused")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
