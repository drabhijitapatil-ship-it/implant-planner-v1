"""
Smart Prosthetic Planner API Tests - Iteration 82

Tests for the new Smart Planner feature that generates Pre-Prosthetic Insights
after Phase 3 approval. Two paths: Dentulous and Full Arch.

Endpoints tested:
- POST /api/procedures/{id}/smart-planner - Generate report
- GET /api/procedures/{id}/smart-planner - Retrieve stored report
- GET /api/procedures/{id} - Verify smart_planner_report field
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials
INCHARGE_EMAIL = "Abhijit.patil@dental.edu"
INCHARGE_PASSWORD = "Admin@123"
STUDENT_EMAIL = "Gaurav.pandey@student.dental.edu"
STUDENT_PASSWORD = "Student@123"

# Known procedure ID with completed status (from agent context)
COMPLETED_PROCEDURE_ID = "69cfb036a19e1d1819e0f6fd"


@pytest.fixture(scope="module")
def incharge_token():
    """Get authentication token for Implant In-Charge."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "identifier": INCHARGE_EMAIL,
        "password": INCHARGE_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def student_token():
    """Get authentication token for Student."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "identifier": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def api_client(incharge_token):
    """Shared requests session with auth header."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {incharge_token}"
    })
    return session


class TestSmartPlannerDentulousCase:
    """Tests for Smart Planner with dentulous (non-full-arch) cases."""

    def test_generate_smart_planner_for_completed_case(self, api_client):
        """POST /api/procedures/{id}/smart-planner generates report for completed case."""
        response = api_client.post(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert "case_type" in data, "Response missing case_type"
        assert "modules" in data, "Response missing modules"
        assert "alerts" in data, "Response missing alerts"
        assert "generated_at" in data, "Response missing generated_at"
        
        # Verify case_type is either dentulous or full_arch
        assert data["case_type"] in ["dentulous", "full_arch"], f"Invalid case_type: {data['case_type']}"
        
        # Verify modules is a list
        assert isinstance(data["modules"], list), "modules should be a list"
        
        print(f"✓ Smart Planner generated successfully")
        print(f"  Case type: {data['case_type']}")
        print(f"  Modules count: {len(data['modules'])}")
        print(f"  Alerts count: {len(data['alerts'])}")

    def test_get_smart_planner_retrieves_stored_report(self, api_client):
        """GET /api/procedures/{id}/smart-planner retrieves stored report."""
        response = api_client.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert "case_type" in data, "Response missing case_type"
        assert "modules" in data, "Response missing modules"
        assert "alerts" in data, "Response missing alerts"
        assert "generated_at" in data, "Response missing generated_at"
        
        print(f"✓ Smart Planner report retrieved successfully")

    def test_procedure_detail_includes_smart_planner_report(self, api_client):
        """GET /api/procedures/{id} returns smart_planner_report when it exists."""
        response = api_client.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify smart_planner_report field exists
        assert "smart_planner_report" in data, "Procedure detail missing smart_planner_report field"
        
        report = data["smart_planner_report"]
        assert report is not None, "smart_planner_report should not be None"
        assert "case_type" in report, "smart_planner_report missing case_type"
        assert "modules" in report, "smart_planner_report missing modules"
        
        print(f"✓ Procedure detail includes smart_planner_report")


class TestSmartPlannerStatusValidation:
    """Tests for Smart Planner status validation."""

    def test_smart_planner_returns_400_for_draft_procedure(self, api_client, incharge_token):
        """POST /api/procedures/{id}/smart-planner returns 400 for procedure not in approved Phase 3 status."""
        # First, get a list of procedures to find one with draft status
        response = api_client.get(f"{BASE_URL}/api/procedures")
        assert response.status_code == 200
        
        procedures = response.json()
        draft_procedure = None
        
        for proc in procedures:
            if proc.get("status") in ["draft", "pending_phase1", "pending_phase2"]:
                draft_procedure = proc
                break
        
        if draft_procedure:
            proc_id = draft_procedure.get("id") or draft_procedure.get("_id")
            response = api_client.post(f"{BASE_URL}/api/procedures/{proc_id}/smart-planner")
            
            assert response.status_code == 400, f"Expected 400 for draft procedure, got {response.status_code}"
            
            data = response.json()
            assert "detail" in data or "error" in data, "Response should contain error message"
            
            print(f"✓ Smart Planner correctly returns 400 for draft procedure")
        else:
            # Create a new draft procedure to test
            print("  No draft procedure found, creating one for testing...")
            
            # Get supervisor and incharge IDs
            users_response = api_client.get(f"{BASE_URL}/api/users")
            users = users_response.json()
            
            supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
            incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
            
            if supervisor and incharge:
                # Create a draft procedure
                future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
                create_response = api_client.post(f"{BASE_URL}/api/procedures", json={
                    "patient_name": "TEST_SmartPlannerDraft",
                    "registration_number": "TEST-SP-001",
                    "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
                    "supervisor_name": supervisor.get("name"),
                    "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
                    "implant_incharge_name": incharge.get("name"),
                    "receipt_number": "TEST-SP-001",
                    "amount_paid": 1000,
                    "procedure_date": future_date,
                    "procedure_time": "10:00",
                    "implant_procedure_type": "Single Conventional Implant",
                    "loading_type": ["Delayed Loading"]
                })
                
                if create_response.status_code in [200, 201]:
                    new_proc = create_response.json()
                    new_proc_id = new_proc.get("id") or new_proc.get("_id")
                    
                    # Test smart planner on draft
                    sp_response = api_client.post(f"{BASE_URL}/api/procedures/{new_proc_id}/smart-planner")
                    assert sp_response.status_code == 400, f"Expected 400 for draft procedure, got {sp_response.status_code}"
                    
                    # Cleanup
                    api_client.delete(f"{BASE_URL}/api/procedures/{new_proc_id}")
                    
                    print(f"✓ Smart Planner correctly returns 400 for draft procedure")
                else:
                    pytest.skip(f"Could not create test procedure: {create_response.text}")
            else:
                pytest.skip("Could not find supervisor/incharge users for test")


class TestSmartPlannerDentulousModules:
    """Tests for dentulous case modules (space analysis, retention, occlusion)."""

    def test_dentulous_case_with_space_data(self, api_client, incharge_token):
        """POST /api/procedures/{id}/smart-planner with space data returns space_analysis module with CRITICAL flags."""
        # Get users for creating procedure
        users_response = api_client.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Could not find supervisor/incharge users")
        
        # Create a procedure with critical space values
        future_date = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        create_response = api_client.post(f"{BASE_URL}/api/procedures", json={
            "patient_name": "TEST_SmartPlannerSpace",
            "registration_number": "TEST-SP-002",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name"),
            "receipt_number": "TEST-SP-002",
            "amount_paid": 1000,
            "procedure_date": future_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "occlusocervical_height": "5",  # CRITICAL: < 6mm
            "mesiodistal_space": "5"  # CRITICAL: < 5.5mm
        })
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test procedure: {create_response.text}")
        
        new_proc = create_response.json()
        new_proc_id = new_proc.get("id") or new_proc.get("_id")
        
        try:
            # Update status to completed to allow smart planner generation
            from pymongo import MongoClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'test_database')
            client = MongoClient(mongo_url)
            db = client[db_name]
            from bson import ObjectId
            
            db.procedures.update_one(
                {"_id": ObjectId(new_proc_id)},
                {"$set": {"status": "completed"}}
            )
            
            # Generate smart planner report
            sp_response = api_client.post(f"{BASE_URL}/api/procedures/{new_proc_id}/smart-planner")
            
            assert sp_response.status_code == 200, f"Expected 200, got {sp_response.status_code}: {sp_response.text}"
            
            data = sp_response.json()
            
            # Verify case_type is dentulous
            assert data["case_type"] == "dentulous", f"Expected dentulous, got {data['case_type']}"
            
            # Find space_analysis module
            space_module = next((m for m in data["modules"] if m.get("id") == "space_analysis"), None)
            assert space_module is not None, "space_analysis module not found"
            
            # Verify CRITICAL flags
            flags = space_module.get("data", {}).get("flags", [])
            critical_flags = [f for f in flags if f.get("status") == "CRITICAL"]
            
            assert len(critical_flags) >= 1, f"Expected at least 1 CRITICAL flag, got {len(critical_flags)}"
            
            print(f"✓ Dentulous case with critical space data returns space_analysis module")
            print(f"  CRITICAL flags: {len(critical_flags)}")
            for flag in critical_flags:
                print(f"    - {flag.get('param')}: {flag.get('value')} - {flag.get('status')}")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/procedures/{new_proc_id}")

    def test_dentulous_case_includes_retention_and_occlusion_modules(self, api_client):
        """Dentulous case report includes retention_guidance and occlusion modules."""
        # First generate report for the completed procedure
        response = api_client.post(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        
        if response.status_code != 200:
            pytest.skip(f"Could not generate smart planner: {response.text}")
        
        data = response.json()
        
        if data["case_type"] != "dentulous":
            pytest.skip("Completed procedure is not dentulous type")
        
        # Check for retention_guidance module
        retention_module = next((m for m in data["modules"] if m.get("id") == "retention_guidance"), None)
        assert retention_module is not None, "retention_guidance module not found in dentulous case"
        
        # Verify retention_guidance data structure
        retention_data = retention_module.get("data", {})
        assert "preferred" in retention_data, "retention_guidance missing 'preferred' field"
        assert "alternative" in retention_data, "retention_guidance missing 'alternative' field"
        
        # Check for occlusion module
        occlusion_module = next((m for m in data["modules"] if m.get("id") == "occlusion"), None)
        assert occlusion_module is not None, "occlusion module not found in dentulous case"
        
        # Verify occlusion data structure
        occlusion_data = occlusion_module.get("data", {})
        assert "notes" in occlusion_data, "occlusion missing 'notes' field"
        
        print(f"✓ Dentulous case includes retention_guidance and occlusion modules")
        print(f"  Retention preferred: {retention_data.get('preferred', '')[:50]}...")
        print(f"  Occlusion notes count: {len(occlusion_data.get('notes', []))}")


class TestSmartPlannerFullArchCase:
    """Tests for Full Arch case modules (interarch space, material compatibility, hygiene)."""

    def test_full_arch_case_with_moderate_interarch_space(self, api_client, incharge_token):
        """Full arch case (All on 4 with available_interarch_space=11) returns interarch_space module with MODERATE severity."""
        # Get users for creating procedure
        users_response = api_client.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Could not find supervisor/incharge users")
        
        # Create a full arch procedure with moderate interarch space
        # Use a date far in the future to avoid conflicts, and ensure it's not Sunday
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        # Check if it's Sunday (weekday 6) and adjust
        test_date = datetime.now() + timedelta(days=30)
        if test_date.weekday() == 6:  # Sunday
            test_date = test_date + timedelta(days=1)
        future_date = test_date.strftime("%Y-%m-%d")
        
        create_response = api_client.post(f"{BASE_URL}/api/procedures", json={
            "patient_name": "TEST_SmartPlannerFullArch",
            "registration_number": "TEST-SP-003",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name"),
            "receipt_number": "TEST-SP-003",
            "amount_paid": 5000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "All on 4",  # Full arch type
            "loading_type": ["Immediate Loading"],
            "available_interarch_space": "11",  # MODERATE: 10-12mm
            "opposing_arch": "Natural Dentition"
        })
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test procedure: {create_response.text}")
        
        new_proc = create_response.json()
        new_proc_id = new_proc.get("id") or new_proc.get("_id")
        
        try:
            # Update status to completed to allow smart planner generation
            from pymongo import MongoClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'test_database')
            client = MongoClient(mongo_url)
            db = client[db_name]
            from bson import ObjectId
            
            db.procedures.update_one(
                {"_id": ObjectId(new_proc_id)},
                {"$set": {"status": "completed"}}
            )
            
            # Generate smart planner report
            sp_response = api_client.post(f"{BASE_URL}/api/procedures/{new_proc_id}/smart-planner")
            
            assert sp_response.status_code == 200, f"Expected 200, got {sp_response.status_code}: {sp_response.text}"
            
            data = sp_response.json()
            
            # Verify case_type is full_arch
            assert data["case_type"] == "full_arch", f"Expected full_arch, got {data['case_type']}"
            
            # Find interarch_space module
            interarch_module = next((m for m in data["modules"] if m.get("id") == "interarch_space"), None)
            assert interarch_module is not None, "interarch_space module not found"
            
            # Verify MODERATE severity
            assert interarch_module.get("severity") == "MODERATE", f"Expected MODERATE severity, got {interarch_module.get('severity')}"
            
            # Verify data structure
            interarch_data = interarch_module.get("data", {})
            assert "space_mm" in interarch_data, "interarch_space missing space_mm"
            assert interarch_data["space_mm"] == 11, f"Expected space_mm=11, got {interarch_data['space_mm']}"
            
            print(f"✓ Full arch case with interarch_space=11 returns MODERATE severity")
            print(f"  Interpretation: {interarch_data.get('interpretation', '')}")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/procedures/{new_proc_id}")

    def test_full_arch_case_includes_material_and_hygiene_modules(self, api_client, incharge_token):
        """Full arch case returns material_compatibility and hygiene modules."""
        # Get users for creating procedure
        users_response = api_client.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Could not find supervisor/incharge users")
        
        # Create a full arch procedure
        future_date = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
        create_response = api_client.post(f"{BASE_URL}/api/procedures", json={
            "patient_name": "TEST_SmartPlannerFullArchModules",
            "registration_number": "TEST-SP-004",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name"),
            "receipt_number": "TEST-SP-004",
            "amount_paid": 5000,
            "procedure_date": future_date,
            "procedure_time": "14:00",
            "implant_procedure_type": "All on 6",  # Full arch type
            "loading_type": ["Delayed Loading"],
            "available_interarch_space": "15",  # ADEQUATE: > 12mm
            "opposing_arch": "Removable Prosthesis"
        })
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test procedure: {create_response.text}")
        
        new_proc = create_response.json()
        new_proc_id = new_proc.get("id") or new_proc.get("_id")
        
        try:
            # Update status to completed
            from pymongo import MongoClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'test_database')
            client = MongoClient(mongo_url)
            db = client[db_name]
            from bson import ObjectId
            
            db.procedures.update_one(
                {"_id": ObjectId(new_proc_id)},
                {"$set": {"status": "completed"}}
            )
            
            # Generate smart planner report
            sp_response = api_client.post(f"{BASE_URL}/api/procedures/{new_proc_id}/smart-planner")
            
            assert sp_response.status_code == 200, f"Expected 200, got {sp_response.status_code}: {sp_response.text}"
            
            data = sp_response.json()
            
            # Verify case_type is full_arch
            assert data["case_type"] == "full_arch", f"Expected full_arch, got {data['case_type']}"
            
            # Find material_compatibility module
            material_module = next((m for m in data["modules"] if m.get("id") == "material_compatibility"), None)
            assert material_module is not None, "material_compatibility module not found"
            
            # Verify material_compatibility data structure
            material_data = material_module.get("data", {})
            assert "suitable" in material_data, "material_compatibility missing 'suitable' field"
            assert "limited" in material_data, "material_compatibility missing 'limited' field"
            
            # Find hygiene module
            hygiene_module = next((m for m in data["modules"] if m.get("id") == "hygiene"), None)
            assert hygiene_module is not None, "hygiene module not found"
            
            # Verify hygiene data structure
            hygiene_data = hygiene_module.get("data", {})
            assert "recommendations" in hygiene_data, "hygiene missing 'recommendations' field"
            
            print(f"✓ Full arch case includes material_compatibility and hygiene modules")
            print(f"  Suitable materials: {material_data.get('suitable', [])}")
            print(f"  Hygiene recommendations count: {len(hygiene_data.get('recommendations', []))}")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/procedures/{new_proc_id}")


class TestSmartPlannerReportPersistence:
    """Tests for report persistence in database."""

    def test_report_persisted_in_smart_planner_report_field(self, api_client):
        """Report is persisted in smart_planner_report field on procedure document."""
        # Generate report
        gen_response = api_client.post(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        assert gen_response.status_code == 200, f"Failed to generate report: {gen_response.text}"
        
        generated_report = gen_response.json()
        
        # Retrieve procedure and verify report is stored
        proc_response = api_client.get(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}")
        assert proc_response.status_code == 200
        
        procedure = proc_response.json()
        stored_report = procedure.get("smart_planner_report")
        
        assert stored_report is not None, "smart_planner_report not found in procedure"
        assert stored_report.get("case_type") == generated_report.get("case_type"), "case_type mismatch"
        assert stored_report.get("generated_at") == generated_report.get("generated_at"), "generated_at mismatch"
        
        print(f"✓ Report correctly persisted in smart_planner_report field")

    def test_get_smart_planner_returns_404_when_not_generated(self, api_client, incharge_token):
        """GET /api/procedures/{id}/smart-planner returns 404 when report not yet generated."""
        # Get users for creating procedure
        users_response = api_client.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Could not find supervisor/incharge users")
        
        # Create a new procedure - use a date far in the future to avoid conflicts
        test_date = datetime.now() + timedelta(days=45)
        # Ensure it's not Sunday
        if test_date.weekday() == 6:  # Sunday
            test_date = test_date + timedelta(days=1)
        future_date = test_date.strftime("%Y-%m-%d")
        
        create_response = api_client.post(f"{BASE_URL}/api/procedures", json={
            "patient_name": "TEST_SmartPlannerNoReport",
            "registration_number": "TEST-SP-005",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name"),
            "receipt_number": "TEST-SP-005",
            "amount_paid": 1000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"]
        })
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create test procedure: {create_response.text}")
        
        new_proc = create_response.json()
        new_proc_id = new_proc.get("id") or new_proc.get("_id")
        
        try:
            # Update status to completed but don't generate report
            from pymongo import MongoClient
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'test_database')
            client = MongoClient(mongo_url)
            db = client[db_name]
            from bson import ObjectId
            
            db.procedures.update_one(
                {"_id": ObjectId(new_proc_id)},
                {"$set": {"status": "completed"}}
            )
            
            # Try to GET smart planner without generating first
            get_response = api_client.get(f"{BASE_URL}/api/procedures/{new_proc_id}/smart-planner")
            
            assert get_response.status_code == 404, f"Expected 404, got {get_response.status_code}"
            
            print(f"✓ GET smart-planner returns 404 when report not yet generated")
            
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/procedures/{new_proc_id}")


class TestSmartPlannerEdgeCases:
    """Edge case tests for Smart Planner."""

    def test_smart_planner_with_invalid_procedure_id(self, api_client):
        """POST /api/procedures/{id}/smart-planner returns 404 for invalid procedure ID."""
        invalid_id = "000000000000000000000000"
        
        response = api_client.post(f"{BASE_URL}/api/procedures/{invalid_id}/smart-planner")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print(f"✓ Smart Planner returns 404 for invalid procedure ID")

    def test_smart_planner_regeneration_updates_report(self, api_client):
        """Regenerating smart planner updates the stored report."""
        # Generate first report
        first_response = api_client.post(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        assert first_response.status_code == 200
        
        first_report = first_response.json()
        first_generated_at = first_report.get("generated_at")
        
        # Wait a moment and regenerate
        import time
        time.sleep(1)
        
        second_response = api_client.post(f"{BASE_URL}/api/procedures/{COMPLETED_PROCEDURE_ID}/smart-planner")
        assert second_response.status_code == 200
        
        second_report = second_response.json()
        second_generated_at = second_report.get("generated_at")
        
        # Verify timestamps are different (report was regenerated)
        assert second_generated_at != first_generated_at, "Report should have new generated_at timestamp"
        
        print(f"✓ Smart Planner regeneration updates the report")
        print(f"  First generated_at: {first_generated_at}")
        print(f"  Second generated_at: {second_generated_at}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
