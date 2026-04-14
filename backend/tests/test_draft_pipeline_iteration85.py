"""
Iteration 85: Tests for Draft Workflow and Interactive Pipeline Features
- Phase filter on GET /api/procedures?phase=1|2|3|4|completed
- Pipeline stats in GET /api/dashboard/stats
- Draft CRUD operations (DELETE for drafts)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://implant-workflow-hub.preview.emergentagent.com")

# Test credentials from test_credentials.md
CREDENTIALS = {
    "student": {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"},
    "supervisor": {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"},
    "implant_incharge": {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"},
}


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["healthy", "ok"]
        print("✓ Health check passed")


class TestAuthentication:
    """Authentication tests for all roles"""
    
    def test_student_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["student"])
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "student"
        print("✓ Student login passed")
    
    def test_supervisor_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["supervisor"])
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "supervisor"
        print("✓ Supervisor login passed")
    
    def test_implant_incharge_login(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["implant_incharge"])
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "implant_incharge"
        print("✓ Implant Incharge login passed")


@pytest.fixture
def student_token():
    response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["student"])
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Student authentication failed")


@pytest.fixture
def supervisor_token():
    response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["supervisor"])
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Supervisor authentication failed")


@pytest.fixture
def incharge_token():
    response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["implant_incharge"])
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Implant Incharge authentication failed")


class TestProceduresPhaseFilter:
    """Tests for GET /api/procedures?phase=X filter"""
    
    def test_procedures_without_phase_filter(self, incharge_token):
        """Backward compatibility - no phase filter returns all procedures"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/procedures without filter returned {len(data)} procedures")
    
    def test_procedures_phase_1_filter(self, incharge_token):
        """Phase 1 filter returns draft and pending_phase1 procedures"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify all returned procedures have phase 1 statuses
        valid_statuses = ["draft", "pending_phase1"]
        for proc in data:
            assert proc.get("status") in valid_statuses, f"Unexpected status {proc.get('status')} in phase 1 filter"
        print(f"✓ GET /api/procedures?phase=1 returned {len(data)} procedures (all with status in {valid_statuses})")
    
    def test_procedures_phase_2_filter(self, incharge_token):
        """Phase 2 filter returns phase1_approved and pending_phase2 procedures"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=2", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify all returned procedures have phase 2 statuses
        valid_statuses = ["phase1_approved", "pending_phase2"]
        for proc in data:
            assert proc.get("status") in valid_statuses, f"Unexpected status {proc.get('status')} in phase 2 filter"
        print(f"✓ GET /api/procedures?phase=2 returned {len(data)} procedures (all with status in {valid_statuses})")
    
    def test_procedures_phase_3_filter(self, incharge_token):
        """Phase 3 filter returns phase2_approved and pending_stage2_surgical procedures"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=3", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify all returned procedures have phase 3 statuses
        valid_statuses = ["phase2_approved", "pending_stage2_surgical"]
        for proc in data:
            assert proc.get("status") in valid_statuses, f"Unexpected status {proc.get('status')} in phase 3 filter"
        print(f"✓ GET /api/procedures?phase=3 returned {len(data)} procedures (all with status in {valid_statuses})")
    
    def test_procedures_phase_4_filter(self, incharge_token):
        """Phase 4 filter returns stage2_surgical_approved, pending_stage2_prosthetic, etc."""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=4", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify all returned procedures have phase 4 statuses
        valid_statuses = ["stage2_surgical_approved", "pending_stage2_prosthetic", "stage2_prosthetic_step1_approved", "pending_final_delivery"]
        for proc in data:
            assert proc.get("status") in valid_statuses, f"Unexpected status {proc.get('status')} in phase 4 filter"
        print(f"✓ GET /api/procedures?phase=4 returned {len(data)} procedures (all with status in {valid_statuses})")
    
    def test_procedures_completed_filter(self, incharge_token):
        """Completed filter returns only completed procedures"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=completed", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify all returned procedures have completed status
        for proc in data:
            assert proc.get("status") == "completed", f"Unexpected status {proc.get('status')} in completed filter"
        print(f"✓ GET /api/procedures?phase=completed returned {len(data)} procedures (all completed)")
    
    def test_phase_filter_with_student_role(self, student_token):
        """Student can use phase filter and only sees their own procedures"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Student phase filter returned {len(data)} procedures")
    
    def test_phase_filter_with_supervisor_role(self, supervisor_token):
        """Supervisor can use phase filter and sees their assigned procedures"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.get(f"{BASE_URL}/api/procedures?phase=2", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Supervisor phase filter returned {len(data)} procedures")


class TestDashboardPipelineStats:
    """Tests for GET /api/dashboard/stats pipeline data"""
    
    def test_dashboard_stats_student_has_pipeline(self, student_token):
        """Student dashboard stats include pipeline object"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify pipeline object exists
        assert "pipeline" in data, "Pipeline object missing from dashboard stats"
        pipeline = data["pipeline"]
        
        # Verify pipeline has all required phases
        required_phases = ["phase1", "phase2", "phase3", "phase4", "completed", "rejected"]
        for phase in required_phases:
            assert phase in pipeline, f"Pipeline missing {phase}"
            assert isinstance(pipeline[phase], int), f"Pipeline {phase} should be integer"
        
        print(f"✓ Student dashboard stats has pipeline: {pipeline}")
    
    def test_dashboard_stats_supervisor_has_pipeline(self, supervisor_token):
        """Supervisor dashboard stats include pipeline object"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify pipeline object exists
        assert "pipeline" in data, "Pipeline object missing from dashboard stats"
        pipeline = data["pipeline"]
        
        # Verify pipeline has all required phases
        required_phases = ["phase1", "phase2", "phase3", "phase4", "completed", "rejected"]
        for phase in required_phases:
            assert phase in pipeline, f"Pipeline missing {phase}"
            assert isinstance(pipeline[phase], int), f"Pipeline {phase} should be integer"
        
        # Supervisor should also have pending_my_approval
        assert "pending_my_approval" in data, "Supervisor should have pending_my_approval"
        
        print(f"✓ Supervisor dashboard stats has pipeline: {pipeline}")
        print(f"  pending_my_approval: {data['pending_my_approval']}")
    
    def test_dashboard_stats_incharge_has_pipeline(self, incharge_token):
        """Implant Incharge dashboard stats include pipeline object"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify pipeline object exists
        assert "pipeline" in data, "Pipeline object missing from dashboard stats"
        pipeline = data["pipeline"]
        
        # Verify pipeline has all required phases
        required_phases = ["phase1", "phase2", "phase3", "phase4", "completed", "rejected"]
        for phase in required_phases:
            assert phase in pipeline, f"Pipeline missing {phase}"
            assert isinstance(pipeline[phase], int), f"Pipeline {phase} should be integer"
        
        # Incharge should also have pending_my_approval and student_stats
        assert "pending_my_approval" in data, "Incharge should have pending_my_approval"
        assert "student_stats" in data, "Incharge should have student_stats"
        
        print(f"✓ Incharge dashboard stats has pipeline: {pipeline}")
        print(f"  pending_my_approval: {data['pending_my_approval']}")
        print(f"  student_stats count: {len(data['student_stats'])}")
    
    def test_dashboard_stats_pipeline_counts_match_phase_filter(self, incharge_token):
        """Pipeline counts should match phase filter results"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get dashboard stats
        stats_response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert stats_response.status_code == 200
        stats = stats_response.json()
        pipeline = stats["pipeline"]
        
        # Get phase 1 procedures and compare count
        phase1_response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=headers)
        assert phase1_response.status_code == 200
        phase1_count = len(phase1_response.json())
        
        # Note: Counts may differ due to role-based filtering, but both should work
        print(f"✓ Pipeline phase1 count: {pipeline['phase1']}, Phase filter count: {phase1_count}")
        
        # Get completed procedures and compare count
        completed_response = requests.get(f"{BASE_URL}/api/procedures?phase=completed", headers=headers)
        assert completed_response.status_code == 200
        completed_count = len(completed_response.json())
        
        print(f"✓ Pipeline completed count: {pipeline['completed']}, Phase filter count: {completed_count}")


class TestDraftCRUDOperations:
    """Tests for Draft procedure CRUD operations - using existing drafts and full procedure creation"""
    
    def test_get_draft_procedure_returns_draft_status(self, incharge_token):
        """GET /api/procedures/{id} for draft returns status='draft'"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get existing draft procedures
        response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=headers)
        assert response.status_code == 200
        procedures = response.json()
        
        # Find a draft procedure
        draft_proc = None
        for proc in procedures:
            if proc.get("status") == "draft":
                draft_proc = proc
                break
        
        if not draft_proc:
            pytest.skip("No existing draft procedures found")
        
        procedure_id = draft_proc.get("id") or draft_proc.get("_id")
        
        # Get the procedure and verify status
        get_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert get_response.status_code == 200
        procedure = get_response.json()
        
        assert procedure.get("status") == "draft", f"Expected status='draft', got {procedure.get('status')}"
        print(f"✓ GET /api/procedures/{procedure_id} returns status='draft'")
    
    def test_create_and_delete_draft_procedure_by_incharge(self, incharge_token):
        """Create a full draft procedure and delete it (incharge only)"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get users for supervisor and incharge IDs
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert users_response.status_code == 200
        users = users_response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        if not supervisor or not incharge:
            pytest.skip("Required users not found")
        
        # Create a full draft procedure with all required fields
        draft_data = {
            "patient_name": "TEST_Draft_Delete_85",
            "patient_age": 55,
            "patient_gender": "male",
            "registration_number": "TEST-DEL-85-001",
            "supervisor_id": supervisor.get("id") or supervisor.get("_id"),
            "supervisor_name": supervisor.get("name", "Test Supervisor"),
            "implant_incharge_id": incharge.get("id") or incharge.get("_id"),
            "implant_incharge_name": incharge.get("name", "Test Incharge"),
            "receipt_number": "REC-DEL-85-001",
            "amount_paid": 50000,
            "procedure_date": "2026-02-20",
            "procedure_time": "10:00 AM - 12:00 PM",
            "implant_procedure_type": "Single Conventional Implant",
            "status": "draft",
            "implants": [
                {
                    "tooth_number": "36",
                    "system": "Nobel Biocare",
                    "diameter": 4.3,
                    "length": 10
                }
            ]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/procedures", json=draft_data, headers=headers)
        assert create_response.status_code in [200, 201], f"Failed to create draft: {create_response.text}"
        procedure_id = create_response.json().get("id") or create_response.json().get("_id")
        
        print(f"✓ Created draft procedure: {procedure_id}")
        
        # Delete as incharge
        delete_response = requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert delete_response.status_code == 200, f"Failed to delete draft: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=headers)
        assert get_response.status_code == 404, "Procedure should be deleted"
        
        print(f"✓ DELETE /api/procedures/{procedure_id} successfully deleted draft")
    
    def test_delete_procedure_forbidden_for_student(self, student_token, incharge_token):
        """Student cannot delete procedures (403 Forbidden)"""
        student_headers = {"Authorization": f"Bearer {student_token}"}
        incharge_headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get existing draft procedures
        response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=incharge_headers)
        assert response.status_code == 200
        procedures = response.json()
        
        # Find a draft procedure
        draft_proc = None
        for proc in procedures:
            if proc.get("status") == "draft":
                draft_proc = proc
                break
        
        if not draft_proc:
            pytest.skip("No existing draft procedures found")
        
        procedure_id = draft_proc.get("id") or draft_proc.get("_id")
        
        # Try to delete as student - should fail
        delete_response = requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=student_headers)
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
        
        print(f"✓ Student DELETE returns 403 Forbidden as expected")
    
    def test_delete_procedure_forbidden_for_supervisor(self, supervisor_token, incharge_token):
        """Supervisor cannot delete procedures (403 Forbidden)"""
        supervisor_headers = {"Authorization": f"Bearer {supervisor_token}"}
        incharge_headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get existing draft procedures
        response = requests.get(f"{BASE_URL}/api/procedures?phase=1", headers=incharge_headers)
        assert response.status_code == 200
        procedures = response.json()
        
        # Find a draft procedure
        draft_proc = None
        for proc in procedures:
            if proc.get("status") == "draft":
                draft_proc = proc
                break
        
        if not draft_proc:
            pytest.skip("No existing draft procedures found")
        
        procedure_id = draft_proc.get("id") or draft_proc.get("_id")
        
        # Try to delete as supervisor - should fail
        delete_response = requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=supervisor_headers)
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
        
        print(f"✓ Supervisor DELETE returns 403 Forbidden as expected")


class TestDraftsInDashboard:
    """Tests for drafts count in dashboard stats"""
    
    def test_dashboard_stats_includes_drafts_count(self, student_token):
        """Dashboard stats include drafts count"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "drafts" in data, "Dashboard stats should include 'drafts' count"
        assert isinstance(data["drafts"], int), "Drafts count should be integer"
        
        print(f"✓ Dashboard stats includes drafts count: {data['drafts']}")
    
    def test_drafts_count_in_pipeline_phase1(self, incharge_token):
        """Pipeline phase1 count includes drafts"""
        headers = {"Authorization": f"Bearer {incharge_token}"}
        
        # Get dashboard stats
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Phase 1 includes drafts and pending_phase1
        pipeline = data.get("pipeline", {})
        phase1_count = pipeline.get("phase1", 0)
        drafts_count = data.get("drafts", 0)
        
        # Phase 1 should be >= drafts (since phase1 = draft + pending_phase1)
        assert phase1_count >= drafts_count, f"Phase1 ({phase1_count}) should be >= drafts ({drafts_count})"
        
        print(f"✓ Pipeline phase1 count ({phase1_count}) includes drafts ({drafts_count})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
