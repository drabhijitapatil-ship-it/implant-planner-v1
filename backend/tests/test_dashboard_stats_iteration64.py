"""
Iteration 64: Dashboard Stats Enhancement Tests
Tests the enhanced /api/dashboard/stats endpoint for all 3 roles:
- Student: total, pending, approved, completed, pipeline
- Supervisor: pending_my_approval, pipeline
- InCharge/Admin: pending_my_approval, student_stats, pipeline

Also includes regression tests for:
- GET /api/procedures for all 3 roles
- Phase 1 approval flow
- Phase 2 approval with comment
- Bone graft data in Phase 2
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print("PASS: Health endpoint working")


class TestDashboardStatsStudent:
    """Test dashboard stats for student role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Login as student
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"Student logged in: {data['user']['name']}")
    
    def test_dashboard_stats_student_structure(self):
        """Verify student dashboard stats returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify basic fields
        assert "total" in data, "Missing 'total' field"
        assert "pending" in data, "Missing 'pending' field"
        assert "approved" in data, "Missing 'approved' field"
        assert "rejected" in data, "Missing 'rejected' field"
        assert "drafts" in data, "Missing 'drafts' field"
        assert "completed" in data, "Missing 'completed' field"
        
        # Verify pipeline structure
        assert "pipeline" in data, "Missing 'pipeline' field"
        pipeline = data["pipeline"]
        assert "phase1" in pipeline, "Missing 'phase1' in pipeline"
        assert "phase2" in pipeline, "Missing 'phase2' in pipeline"
        assert "phase3" in pipeline, "Missing 'phase3' in pipeline"
        assert "phase4" in pipeline, "Missing 'phase4' in pipeline"
        assert "completed" in pipeline, "Missing 'completed' in pipeline"
        assert "rejected" in pipeline, "Missing 'rejected' in pipeline"
        
        # Student should NOT have pending_my_approval or student_stats
        assert "pending_my_approval" not in data, "Student should not have pending_my_approval"
        assert "student_stats" not in data, "Student should not have student_stats"
        
        print(f"PASS: Student dashboard stats structure correct")
        print(f"  - total: {data['total']}, pending: {data['pending']}, approved: {data['approved']}")
        print(f"  - pipeline: {pipeline}")


class TestDashboardStatsSupervisor:
    """Test dashboard stats for supervisor role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Login as supervisor
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200, f"Supervisor login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"Supervisor logged in: {data['user']['name']}")
    
    def test_dashboard_stats_supervisor_structure(self):
        """Verify supervisor dashboard stats returns correct structure with pending_my_approval"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify basic fields
        assert "total" in data, "Missing 'total' field"
        assert "pending" in data, "Missing 'pending' field"
        assert "approved" in data, "Missing 'approved' field"
        assert "completed" in data, "Missing 'completed' field"
        
        # Verify pipeline structure
        assert "pipeline" in data, "Missing 'pipeline' field"
        pipeline = data["pipeline"]
        assert "phase1" in pipeline, "Missing 'phase1' in pipeline"
        assert "phase2" in pipeline, "Missing 'phase2' in pipeline"
        assert "phase3" in pipeline, "Missing 'phase3' in pipeline"
        assert "phase4" in pipeline, "Missing 'phase4' in pipeline"
        
        # Supervisor SHOULD have pending_my_approval
        assert "pending_my_approval" in data, "Supervisor should have pending_my_approval"
        assert isinstance(data["pending_my_approval"], int), "pending_my_approval should be int"
        
        # Supervisor should NOT have student_stats
        assert "student_stats" not in data, "Supervisor should not have student_stats"
        
        print(f"PASS: Supervisor dashboard stats structure correct")
        print(f"  - total: {data['total']}, pending_my_approval: {data['pending_my_approval']}")
        print(f"  - pipeline: {pipeline}")


class TestDashboardStatsInCharge:
    """Test dashboard stats for incharge/admin role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Login as incharge
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200, f"InCharge login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user_role = data['user']['role']
        print(f"InCharge logged in: {data['user']['name']} (role: {self.user_role})")
    
    def test_dashboard_stats_incharge_structure(self):
        """Verify incharge dashboard stats returns correct structure with pending_my_approval and student_stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify basic fields
        assert "total" in data, "Missing 'total' field"
        assert "pending" in data, "Missing 'pending' field"
        assert "approved" in data, "Missing 'approved' field"
        assert "completed" in data, "Missing 'completed' field"
        
        # Verify pipeline structure
        assert "pipeline" in data, "Missing 'pipeline' field"
        pipeline = data["pipeline"]
        assert "phase1" in pipeline, "Missing 'phase1' in pipeline"
        assert "phase2" in pipeline, "Missing 'phase2' in pipeline"
        assert "phase3" in pipeline, "Missing 'phase3' in pipeline"
        assert "phase4" in pipeline, "Missing 'phase4' in pipeline"
        
        # InCharge SHOULD have pending_my_approval
        assert "pending_my_approval" in data, "InCharge should have pending_my_approval"
        assert isinstance(data["pending_my_approval"], int), "pending_my_approval should be int"
        
        # InCharge SHOULD have student_stats
        assert "student_stats" in data, "InCharge should have student_stats"
        assert isinstance(data["student_stats"], list), "student_stats should be a list"
        
        # Verify student_stats structure if not empty
        if len(data["student_stats"]) > 0:
            student = data["student_stats"][0]
            assert "student_name" in student, "student_stats item missing student_name"
            assert "total" in student, "student_stats item missing total"
            assert "completed" in student, "student_stats item missing completed"
            assert "rejected" in student, "student_stats item missing rejected"
            assert "active" in student, "student_stats item missing active"
        
        print(f"PASS: InCharge dashboard stats structure correct")
        print(f"  - total: {data['total']}, pending_my_approval: {data['pending_my_approval']}")
        print(f"  - student_stats count: {len(data['student_stats'])}")
        print(f"  - pipeline: {pipeline}")


class TestProceduresRegression:
    """Regression test: GET /api/procedures works for all 3 roles"""
    
    def test_procedures_student(self):
        """Student can get their procedures"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        token = response.json().get("access_token") or response.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        assert response.status_code == 200, f"GET procedures failed for student: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Procedures should be a list"
        print(f"PASS: Student GET /api/procedures - {len(data)} procedures")
    
    def test_procedures_supervisor(self):
        """Supervisor can get their procedures"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        token = response.json().get("access_token") or response.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        assert response.status_code == 200, f"GET procedures failed for supervisor: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Procedures should be a list"
        print(f"PASS: Supervisor GET /api/procedures - {len(data)} procedures")
    
    def test_procedures_incharge(self):
        """InCharge can get all procedures"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        token = response.json().get("access_token") or response.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
        assert response.status_code == 200, f"GET procedures failed for incharge: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Procedures should be a list"
        print(f"PASS: InCharge GET /api/procedures - {len(data)} procedures")


class TestApprovalFlowRegression:
    """Regression test: Phase 1 and Phase 2 approval flows still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Get all tokens
        # Student
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200
        data = response.json()
        self.student_token = data.get("access_token") or data.get("token")
        self.student_id = data["user"]["id"]
        self.student_name = data["user"]["name"]
        self.student_headers = {"Authorization": f"Bearer {self.student_token}"}
        
        # Supervisor
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        data = response.json()
        self.supervisor_token = data.get("access_token") or data.get("token")
        self.supervisor_id = data["user"]["id"]
        self.supervisor_name = data["user"]["name"]
        self.supervisor_headers = {"Authorization": f"Bearer {self.supervisor_token}"}
        
        # InCharge
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200
        data = response.json()
        self.incharge_token = data.get("access_token") or data.get("token")
        self.incharge_id = data["user"]["id"]
        self.incharge_name = data["user"]["name"]
        self.incharge_headers = {"Authorization": f"Bearer {self.incharge_token}"}
    
    def test_phase1_approval_flow(self):
        """Test Phase 1 approval flow end-to-end"""
        # Create procedure as student
        future_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        procedure_data = {
            "patient_name": "TEST_Phase1_Regression",
            "registration_number": "REG-P1-001",
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor_name,
            "implant_incharge_id": self.incharge_id,
            "implant_incharge_name": self.incharge_name,
            "receipt_number": "RCP-P1-001",
            "amount_paid": 5000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=self.student_headers)
        assert response.status_code == 200, f"Create procedure failed: {response.text}"
        procedure_id = response.json()["id"]
        print(f"Created procedure: {procedure_id}")
        
        # Save implant plan
        implant_plan = {
            "implants": [{
                "position": "14",
                "brand": "Straumann",
                "system": "BLT",
                "diameter": 4.1,
                "length": 10.0
            }]
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=self.student_headers)
        assert response.status_code == 200, f"Save implant plan failed: {response.text}"
        
        # Request Phase 1 approval
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=self.student_headers)
        assert response.status_code == 200, f"Request Phase 1 approval failed: {response.text}"
        
        # Supervisor approves Phase 1
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=self.supervisor_headers)
        assert response.status_code == 200, f"Supervisor Phase 1 approval failed: {response.text}"
        
        # InCharge approves Phase 1
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=self.incharge_headers)
        assert response.status_code == 200, f"InCharge Phase 1 approval failed: {response.text}"
        
        # Verify status is phase1_approved
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=self.incharge_headers)
        assert response.status_code == 200
        proc = response.json()
        assert proc["status"] == "phase1_approved", f"Expected phase1_approved, got {proc['status']}"
        
        print(f"PASS: Phase 1 approval flow works - status: {proc['status']}")
        
        # Cleanup - delete the test procedure
        requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=self.incharge_headers)
    
    def test_phase2_approval_with_comment(self):
        """Test Phase 2 approval with comment and bone graft data"""
        # Create and approve Phase 1 first
        future_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        procedure_data = {
            "patient_name": "TEST_Phase2_Regression",
            "registration_number": "REG-P2-001",
            "supervisor_id": self.supervisor_id,
            "supervisor_name": self.supervisor_name,
            "implant_incharge_id": self.incharge_id,
            "implant_incharge_name": self.incharge_name,
            "receipt_number": "RCP-P2-001",
            "amount_paid": 5000,
            "procedure_date": future_date,
            "procedure_time": "10:00",
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=procedure_data, headers=self.student_headers)
        assert response.status_code == 200
        procedure_id = response.json()["id"]
        
        # Save implant plan
        implant_plan = {"implants": [{"position": "14", "brand": "Straumann", "system": "BLT", "diameter": 4.1, "length": 10.0}]}
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/implant-plan", json=implant_plan, headers=self.student_headers)
        
        # Request and approve Phase 1
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/request-phase1-approval", headers=self.student_headers)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=self.supervisor_headers)
        requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/approve", json={"action": "approve"}, headers=self.incharge_headers)
        
        # Submit Phase 2 with bone graft data
        phase2_data = {
            "bone_graft_used": True,
            "bone_graft_details": "TEST_BoneGraft_Regression - Bio-Oss 0.5g",
            "anesthesia_adequate": "Yes",
            "flap_design": "Full thickness",
            "drilling_type": "Sequential",
            "implant_seated_correctly": True,
            "torque_values": [35.0],
            "sutures_placed": True,
            "hemostasis_achieved": True
        }
        response = requests.post(f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2", json=phase2_data, headers=self.student_headers)
        assert response.status_code == 200, f"Submit Phase 2 failed: {response.text}"
        
        # Supervisor approves Phase 2 with comment
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve", "comment": "TEST_Supervisor_Comment_Regression"},
            headers=self.supervisor_headers
        )
        assert response.status_code == 200, f"Supervisor Phase 2 approval failed: {response.text}"
        
        # InCharge approves Phase 2 with comment
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            json={"action": "approve", "comment": "TEST_InCharge_Comment_Regression"},
            headers=self.incharge_headers
        )
        assert response.status_code == 200, f"InCharge Phase 2 approval failed: {response.text}"
        
        # Verify data saved correctly
        response = requests.get(f"{BASE_URL}/api/procedures/{procedure_id}", headers=self.incharge_headers)
        assert response.status_code == 200
        proc = response.json()
        
        # Verify status
        assert proc["status"] == "phase2_approved", f"Expected phase2_approved, got {proc['status']}"
        
        # Verify bone graft data
        phase2_data_saved = proc.get("phase2_data", {})
        assert phase2_data_saved.get("bone_graft_used") == True, "bone_graft_used not saved"
        assert "TEST_BoneGraft_Regression" in phase2_data_saved.get("bone_graft_details", ""), "bone_graft_details not saved"
        
        # Verify approval comments
        assert "TEST_Supervisor_Comment_Regression" in proc.get("phase2_supervisor_notes", ""), "Supervisor comment not saved"
        assert "TEST_InCharge_Comment_Regression" in proc.get("phase2_incharge_notes", ""), "InCharge comment not saved"
        
        print(f"PASS: Phase 2 approval with comment and bone graft works")
        print(f"  - bone_graft_used: {phase2_data_saved.get('bone_graft_used')}")
        print(f"  - bone_graft_details: {phase2_data_saved.get('bone_graft_details')}")
        print(f"  - phase2_supervisor_notes: {proc.get('phase2_supervisor_notes')}")
        print(f"  - phase2_incharge_notes: {proc.get('phase2_incharge_notes')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=self.incharge_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
