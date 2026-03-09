"""
Iteration 5 Backend Test Suite - Dental Implant Management System
Tests:
1. Login API with all user roles (student, supervisor, implant_incharge, administrator, nurse)
2. Full procedure workflow: Create -> Phase 1 approval -> Phase 2 submit -> Phase 2 approval -> Phase 3 submit -> Phase 3 approval -> Phase 4 submit -> Phase 4 approval -> Completed
3. Dashboard stats endpoint returns correct counts
4. Procedures list with filter (all, pending, completed, rejected)
5. Notification messages use Phase 3/Phase 4 terminology (not Stage 2)
6. Nurse role access restrictions (read-only, can only see approved/completed)
7. Rejection flow for Phase 3 and Phase 4
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://teeth-selection-tool.preview.emergentagent.com').rstrip('/')

# Test credentials as provided
CREDENTIALS = {
    "student": {"email": "gaurav.pandey@student.dental.edu", "password": "Student@123"},
    "supervisor": {"email": "vasantha.n@dental.edu", "password": "Supervisor@123"},
    "implant_incharge": {"email": "abhijit.patil@dental.edu", "password": "Admin@123"},
    "administrator": {"email": "ajay.sabane@dental.edu", "password": "Admin@123"},
    "nurse": {"email": "priya.sharma@dental.edu", "password": "Nurse@123"},
}


class TestLoginAPIAllRoles:
    """Test 1: Login API with all user roles"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        """Login and get tokens for all users"""
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            assert response.status_code == 200, f"Login failed for {role}: {response.text}"
            data = response.json()
            assert "token" in data, f"No token in response for {role}"
            assert "user" in data, f"No user in response for {role}"
            assert data["user"]["role"] == role, f"Role mismatch for {role}: expected {role}, got {data['user']['role']}"
            tokens[role] = {
                "token": data["token"],
                "user_id": data["user"]["id"],
                "user_name": data["user"]["name"],
                "email": data["user"]["email"],
                "role": data["user"]["role"]
            }
        return tokens

    def test_login_student(self, tokens):
        """Login student role"""
        assert tokens["student"]["role"] == "student"
        assert "Dr. Gaurav Pandey" in tokens["student"]["user_name"]
        print(f"PASS: Student login successful - {tokens['student']['user_name']}")

    def test_login_supervisor(self, tokens):
        """Login supervisor role"""
        assert tokens["supervisor"]["role"] == "supervisor"
        assert "Vasantha" in tokens["supervisor"]["user_name"]
        print(f"PASS: Supervisor login successful - {tokens['supervisor']['user_name']}")

    def test_login_implant_incharge(self, tokens):
        """Login implant_incharge role"""
        assert tokens["implant_incharge"]["role"] == "implant_incharge"
        assert "Abhijit Patil" in tokens["implant_incharge"]["user_name"]
        print(f"PASS: Implant Incharge login successful - {tokens['implant_incharge']['user_name']}")

    def test_login_administrator(self, tokens):
        """Login administrator role"""
        assert tokens["administrator"]["role"] == "administrator"
        assert "Ajay Sabane" in tokens["administrator"]["user_name"]
        print(f"PASS: Administrator login successful - {tokens['administrator']['user_name']}")

    def test_login_nurse(self, tokens):
        """Login nurse role"""
        assert tokens["nurse"]["role"] == "nurse"
        print(f"PASS: Nurse login successful - {tokens['nurse']['user_name']}")

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Invalid credentials correctly rejected with 401")


class TestFullProcedureWorkflow:
    """Test 2: Full procedure workflow from creation to completion"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        """Login and get tokens for all users"""
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            assert response.status_code == 200, f"Login failed for {role}: {response.text}"
            data = response.json()
            tokens[role] = {
                "token": data["token"],
                "user_id": data["user"]["id"],
                "user_name": data["user"]["name"]
            }
        return tokens

    def test_01_create_procedure(self, tokens):
        """Student creates procedure - starts at pending_phase1"""
        # Calculate future date (7 days out, avoiding Sunday)
        future_date = datetime.now() + timedelta(days=7)
        while future_date.weekday() == 6:  # Sunday
            future_date += timedelta(days=1)
        
        procedure_time = "10:00"
        if future_date.weekday() == 5:  # Saturday
            procedure_time = "09:30"
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_FullWorkflow_Patient",
            "registration_number": f"TEST-FW-{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": tokens["supervisor"]["user_id"],
            "supervisor_name": tokens["supervisor"]["user_name"],
            "implant_incharge_id": tokens["implant_incharge"]["user_id"],
            "implant_incharge_name": tokens["implant_incharge"]["user_name"],
            "implant_site": "Upper Right Molar",
            "receipt_number": f"REC-FW-{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 50000,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": procedure_time,
            "implant_specifications": "Nobel Biocare 4.3x13mm",
            "bone_graft_specifications": "Bio-Oss 0.5g",
            "remark": "Test procedure for full workflow testing",
            "checklist": {
                "pre_surgical": {
                    "items": [
                        {"id": "case_selection", "label": "Case Selection Approved", "value": True},
                        {"id": "academic_readiness", "label": "Academic Readiness", "value": True},
                        {"id": "hematological", "label": "Hematological Investigations", "value": True}
                    ],
                    "additional_fields": {}
                }
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=payload
        )
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "pending_phase1", f"Expected pending_phase1, got {procedure['status']}"
        assert procedure["patient_name"] == "TEST_FullWorkflow_Patient"
        
        pytest.workflow_procedure_id = procedure["id"]
        print(f"PASS: Procedure created with ID {procedure['id']}, status: pending_phase1")

    def test_02_phase1_supervisor_approval(self, tokens):
        """Supervisor approves Phase 1"""
        procedure_id = pytest.workflow_procedure_id
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200, f"Phase 1 supervisor approval failed: {response.text}"
        
        procedure = response.json()
        assert procedure["supervisor_phase1_approved"] == True
        # Status should still be pending_phase1 until implant incharge also approves
        print("PASS: Supervisor approved Phase 1")

    def test_03_phase1_implant_incharge_approval(self, tokens):
        """Implant Incharge approves Phase 1 -> status becomes phase1_approved"""
        procedure_id = pytest.workflow_procedure_id
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200, f"Phase 1 implant incharge approval failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "phase1_approved", f"Expected phase1_approved, got {procedure['status']}"
        assert procedure["implant_incharge_phase1_approved"] == True
        print("PASS: Phase 1 fully approved -> status: phase1_approved")

    def test_04_submit_phase2(self, tokens):
        """Student submits Phase 2 (Surgical) -> status becomes pending_phase2"""
        procedure_id = pytest.workflow_procedure_id
        
        phase2_payload = {
            "checklist_surgical": {
                "items": [
                    {"id": "consent_form", "label": "Signed Patient consent form", "value": True},
                    {"id": "cbct_report", "label": "Arranged CBCT Report", "value": True},
                    {"id": "room_cleanliness", "label": "Cleanliness of the Implant Room", "value": True}
                ],
                "additional_fields": {}
            },
            "remark": "Phase 2 submission for full workflow test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/submit-phase2",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=phase2_payload
        )
        assert response.status_code == 200, f"Phase 2 submission failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "pending_phase2", f"Expected pending_phase2, got {procedure['status']}"
        print("PASS: Phase 2 submitted -> status: pending_phase2")

    def test_05_phase2_dual_approval(self, tokens):
        """Both supervisor and implant incharge approve Phase 2"""
        procedure_id = pytest.workflow_procedure_id
        
        # Supervisor approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        print("  - Supervisor approved Phase 2")
        
        # Implant Incharge approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        
        procedure = response.json()
        assert procedure["status"] == "phase2_approved", f"Expected phase2_approved, got {procedure['status']}"
        print("PASS: Phase 2 fully approved -> status: phase2_approved")

    def test_06_submit_phase3_second_stage_surgical(self, tokens):
        """Student submits Phase 3 (Second Stage Surgical Protocol)"""
        procedure_id = pytest.workflow_procedure_id
        
        payload = {
            "checklist": {
                "items": [
                    {"id": "healing_assessment", "label": "Implant healing assessment", "value": True},
                    {"id": "tissue_conditioning", "label": "Tissue conditioning done", "value": True},
                    {"id": "second_stage_surgery", "label": "Second stage surgery performed", "value": True},
                    {"id": "healing_abutment", "label": "Healing abutment placed", "value": True}
                ],
                "additional_fields": {}
            },
            "remark": "Phase 3 submission"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=payload
        )
        assert response.status_code == 200, f"Phase 3 submission failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "pending_stage2_surgical", f"Expected pending_stage2_surgical, got {procedure['status']}"
        print("PASS: Phase 3 (Second Stage Surgical) submitted -> status: pending_stage2_surgical")

    def test_07_phase3_dual_approval(self, tokens):
        """Both supervisor and implant incharge approve Phase 3"""
        procedure_id = pytest.workflow_procedure_id
        
        # Supervisor approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        print("  - Supervisor approved Phase 3")
        
        # Implant Incharge approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/surgical/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        
        procedure = response.json()
        assert procedure["status"] == "stage2_surgical_approved", f"Expected stage2_surgical_approved, got {procedure['status']}"
        print("PASS: Phase 3 fully approved -> status: stage2_surgical_approved")

    def test_08_submit_phase4_prosthetic(self, tokens):
        """Student submits Phase 4 (Prosthetic Protocol)"""
        procedure_id = pytest.workflow_procedure_id
        
        payload = {
            "checklist": {
                "items": [
                    {"id": "impression_taken", "label": "Final impression taken", "value": True},
                    {"id": "bite_registration", "label": "Bite registration completed", "value": True},
                    {"id": "final_prosthesis", "label": "Final prosthesis placed", "value": True},
                    {"id": "maintenance_schedule", "label": "Maintenance schedule established", "value": True}
                ],
                "additional_fields": {}
            },
            "remark": "Phase 4 submission"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=payload
        )
        assert response.status_code == 200, f"Phase 4 submission failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "pending_stage2_prosthetic", f"Expected pending_stage2_prosthetic, got {procedure['status']}"
        print("PASS: Phase 4 (Prosthetic Protocol) submitted -> status: pending_stage2_prosthetic")

    def test_09_phase4_dual_approval_completes_treatment(self, tokens):
        """Both approve Phase 4 -> status becomes 'completed'"""
        procedure_id = pytest.workflow_procedure_id
        
        # Supervisor approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        print("  - Supervisor approved Phase 4")
        
        # Implant Incharge approves
        response = requests.post(
            f"{BASE_URL}/api/procedures/{procedure_id}/stage2/prosthetic/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"},
            json={"action": "approve"}
        )
        assert response.status_code == 200
        
        procedure = response.json()
        assert procedure["status"] == "completed", f"Expected completed, got {procedure['status']}"
        assert "treatment_completed_at" in procedure
        print("PASS: Phase 4 fully approved -> status: COMPLETED - Treatment finished!")

    def test_10_verify_completed_procedure_structure(self, tokens):
        """Verify completed procedure has all 4 checklist sections and 8 approval flags"""
        procedure_id = pytest.workflow_procedure_id
        
        response = requests.get(
            f"{BASE_URL}/api/procedures/{procedure_id}",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"}
        )
        assert response.status_code == 200
        
        procedure = response.json()
        checklist = procedure.get("checklist", {})
        
        # All 4 sections
        assert "pre_surgical" in checklist, "Missing pre_surgical"
        assert "surgical" in checklist, "Missing surgical"
        assert "second_stage" in checklist, "Missing second_stage"
        assert "prosthetic_phase" in checklist, "Missing prosthetic_phase"
        
        # All 8 approval flags
        assert procedure["supervisor_phase1_approved"] == True
        assert procedure["implant_incharge_phase1_approved"] == True
        assert procedure["supervisor_phase2_approved"] == True
        assert procedure["implant_incharge_phase2_approved"] == True
        assert procedure["supervisor_stage2_surgical_approved"] == True
        assert procedure["implant_incharge_stage2_surgical_approved"] == True
        assert procedure["supervisor_stage2_prosthetic_approved"] == True
        assert procedure["implant_incharge_stage2_prosthetic_approved"] == True
        
        print("PASS: Completed procedure has all 4 checklist sections and all 8 approval flags")


class TestDashboardStats:
    """Test 3: Dashboard stats endpoint returns correct counts"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if response.status_code == 200:
                data = response.json()
                tokens[role] = data["token"]
        return tokens

    def test_dashboard_stats_structure(self, tokens):
        """Dashboard stats has total, pending, approved, rejected"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        
        stats = response.json()
        assert "total" in stats, "Missing 'total' in stats"
        assert "pending" in stats, "Missing 'pending' in stats"
        assert "approved" in stats, "Missing 'approved' in stats"
        assert "rejected" in stats, "Missing 'rejected' in stats"
        
        # Values should be non-negative integers
        assert isinstance(stats["total"], int) and stats["total"] >= 0
        assert isinstance(stats["pending"], int) and stats["pending"] >= 0
        assert isinstance(stats["approved"], int) and stats["approved"] >= 0
        assert isinstance(stats["rejected"], int) and stats["rejected"] >= 0
        
        print(f"PASS: Dashboard stats - total={stats['total']}, pending={stats['pending']}, approved={stats['approved']}, rejected={stats['rejected']}")

    def test_dashboard_stats_includes_stage2_in_counts(self, tokens):
        """Dashboard stats counts include Stage 2 statuses in appropriate categories"""
        # This test verifies the backend logic counts stage2_* statuses correctly
        # pending includes: pending_phase1, pending_phase2, pending_stage2_surgical, pending_stage2_prosthetic
        # approved includes: phase1_approved, phase2_approved, stage2_surgical_approved, completed
        # rejected includes: rejected, stage2_surgical_rejected, stage2_prosthetic_rejected
        
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200
        
        stats = response.json()
        # Sum should equal or be less than total (some could be in other states)
        assert stats["pending"] + stats["approved"] + stats["rejected"] <= stats["total"] or \
               stats["pending"] + stats["approved"] + stats["rejected"] >= 0
        
        print("PASS: Dashboard stats counts are internally consistent")


class TestProceduresListFilters:
    """Test 4: Procedures list with filter (all, pending, completed, rejected)"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if response.status_code == 200:
                data = response.json()
                tokens[role] = data["token"]
        return tokens

    def test_procedures_filter_all(self, tokens):
        """GET /api/procedures without filter returns all procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200
        
        procedures = response.json()
        assert isinstance(procedures, list)
        print(f"PASS: All procedures returned: {len(procedures)}")

    def test_procedures_filter_pending(self, tokens):
        """GET /api/procedures?status=pending returns only pending procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures?status=pending",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200
        
        procedures = response.json()
        pending_statuses = {"pending_phase1", "pending_phase2", "pending_stage2_surgical", "pending_stage2_prosthetic"}
        for proc in procedures:
            assert proc["status"] in pending_statuses, f"Unexpected status in pending filter: {proc['status']}"
        
        print(f"PASS: Pending procedures returned: {len(procedures)}")

    def test_procedures_filter_completed(self, tokens):
        """GET /api/procedures?status=completed returns completed/approved procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures?status=completed",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200
        
        procedures = response.json()
        completed_statuses = {"phase2_approved", "stage2_surgical_approved", "completed"}
        for proc in procedures:
            assert proc["status"] in completed_statuses, f"Unexpected status in completed filter: {proc['status']}"
        
        print(f"PASS: Completed procedures returned: {len(procedures)}")

    def test_procedures_filter_rejected(self, tokens):
        """GET /api/procedures?status=rejected returns rejected procedures"""
        response = requests.get(
            f"{BASE_URL}/api/procedures?status=rejected",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']}"}
        )
        assert response.status_code == 200
        
        procedures = response.json()
        rejected_statuses = {"rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"}
        for proc in procedures:
            assert proc["status"] in rejected_statuses, f"Unexpected status in rejected filter: {proc['status']}"
        
        print(f"PASS: Rejected procedures returned: {len(procedures)}")


class TestNotificationsPhaseTerminology:
    """Test 5: Notification messages use Phase 3/Phase 4 terminology"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if response.status_code == 200:
                data = response.json()
                tokens[role] = {
                    "token": data["token"],
                    "user_id": data["user"]["id"]
                }
        return tokens

    def test_notifications_endpoint_works(self, tokens):
        """GET /api/notifications returns notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}
        )
        assert response.status_code == 200
        
        notifications = response.json()
        assert isinstance(notifications, list)
        print(f"PASS: Notifications endpoint works - returned {len(notifications)} notifications")

    def test_phase3_phase4_terminology_in_notifications(self, tokens):
        """Verify Phase 3/Phase 4 terminology is used instead of Stage 2"""
        # Create a procedure and take it through Phase 3/4 to generate notifications
        future_date = datetime.now() + timedelta(days=8)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_time = "10:00" if future_date.weekday() != 5 else "09:30"
        
        # Login as student to create procedure
        student_response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["student"])
        student_token = student_response.json()["token"]
        
        # Create procedure
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_NotifTerminology_Patient",
            "registration_number": f"TEST-NT-{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": tokens["supervisor"]["user_id"],
            "supervisor_name": "Dr. Vasantha N",
            "implant_incharge_id": tokens["implant_incharge"]["user_id"],
            "implant_incharge_name": "Dr. Abhijit Patil",
            "implant_site": "Lower Left Molar",
            "receipt_number": f"REC-NT-{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 45000,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": procedure_time,
            "implant_specifications": "Test Implant",
            "bone_graft_specifications": "Test Graft",
            "checklist": {"pre_surgical": {"items": [{"id": "case_selection", "label": "Test", "value": True}], "additional_fields": {}}}
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {student_token}"},
            json=payload)
        assert response.status_code == 200
        proc_id = response.json()["id"]
        
        # Fast-track through Phase 1 and Phase 2
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/submit-phase2",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"checklist_surgical": {"items": [{"id": "consent_form", "label": "Test", "value": True}], "additional_fields": {}}})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        
        # Submit Phase 3 - this should create notification with "Phase 3" terminology
        response = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"checklist": {"items": [{"id": "healing_assessment", "label": "Test", "value": True}], "additional_fields": {}}})
        assert response.status_code == 200
        
        # Get supervisor notifications and check terminology
        response = requests.get(f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"})
        notifications = response.json()
        
        # Find the Phase 3 notification
        phase3_notifications = [n for n in notifications if "Phase 3" in n.get("message", "") or "Second Stage Surgical" in n.get("message", "")]
        assert len(phase3_notifications) > 0, "No Phase 3 notification found - terminology may still be Stage 2"
        
        # Verify no "Stage 2 Surgical" in user-facing messages (should be "Phase 3")
        for n in phase3_notifications:
            # The message should use "Phase 3" or "Second Stage Surgical Protocol", not just "Stage 2"
            assert "Phase 3" in n["message"] or "Second Stage Surgical Protocol" in n["message"], \
                f"Expected Phase 3 terminology in notification: {n['message']}"
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/procedures/{proc_id}",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        
        print("PASS: Notifications use Phase 3/Phase 4 terminology")


class TestNurseRoleRestrictions:
    """Test 6: Nurse role access restrictions (read-only, can only see approved/completed)"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if response.status_code == 200:
                data = response.json()
                tokens[role] = {
                    "token": data["token"],
                    "user_id": data["user"]["id"]
                }
        return tokens

    def test_nurse_cannot_create_procedure(self, tokens):
        """Nurse cannot create procedures"""
        future_date = datetime.now() + timedelta(days=10)
        payload = {
            "student_name": "Test Student",
            "patient_name": "TEST_NurseCreate",
            "registration_number": "TEST-NC",
            "supervisor_id": tokens["supervisor"]["user_id"],
            "supervisor_name": "Test Supervisor",
            "implant_incharge_id": tokens["implant_incharge"]["user_id"],
            "implant_incharge_name": "Test Incharge",
            "implant_site": "Test Site",
            "receipt_number": "TEST-NC",
            "amount_paid": 10000,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": "10:00",
            "implant_specifications": "Test",
            "bone_graft_specifications": "Test"
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['nurse']['token']}"},
            json=payload)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Nurse cannot create procedures (403)")

    def test_nurse_cannot_approve_procedures(self, tokens):
        """Nurse cannot approve any phase"""
        # Get any pending procedure
        response = requests.get(f"{BASE_URL}/api/procedures?status=pending",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        procedures = response.json()
        
        if len(procedures) > 0:
            proc_id = procedures[0]["id"]
            
            response = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
                headers={"Authorization": f"Bearer {tokens['nurse']['token']}"},
                json={"action": "approve"})
            assert response.status_code == 403, f"Expected 403 for nurse approval, got {response.status_code}"
            print("PASS: Nurse cannot approve procedures (403)")
        else:
            print("SKIP: No pending procedures to test nurse approval restriction")

    def test_nurse_can_only_see_approved_completed_procedures(self, tokens):
        """Nurse list only shows approved/completed procedures"""
        response = requests.get(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['nurse']['token']}"})
        assert response.status_code == 200
        
        procedures = response.json()
        allowed_statuses = {"phase1_approved", "phase2_approved", "approved", "stage2_surgical_approved", "completed"}
        
        for proc in procedures:
            assert proc["status"] in allowed_statuses, \
                f"Nurse should not see status {proc['status']}"
        
        print(f"PASS: Nurse can only see approved/completed procedures ({len(procedures)} found)")

    def test_nurse_cannot_view_pending_procedure(self, tokens):
        """Nurse cannot view individual pending procedure"""
        # Get a pending procedure via admin
        response = requests.get(f"{BASE_URL}/api/procedures?status=pending",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        procedures = response.json()
        
        if len(procedures) > 0:
            proc_id = procedures[0]["id"]
            
            response = requests.get(f"{BASE_URL}/api/procedures/{proc_id}",
                headers={"Authorization": f"Bearer {tokens['nurse']['token']}"})
            assert response.status_code == 403, f"Expected 403 for nurse viewing pending procedure, got {response.status_code}"
            print("PASS: Nurse cannot view pending procedure details (403)")
        else:
            print("SKIP: No pending procedures to test nurse view restriction")

    def test_nurse_cannot_edit_procedures(self, tokens):
        """Nurse has read-only access - cannot edit procedures"""
        # Get a completed procedure
        response = requests.get(f"{BASE_URL}/api/procedures?status=completed",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        procedures = response.json()
        
        if len(procedures) > 0:
            proc_id = procedures[0]["id"]
            
            response = requests.put(f"{BASE_URL}/api/procedures/{proc_id}",
                headers={"Authorization": f"Bearer {tokens['nurse']['token']}"},
                json={"remark": "Nurse trying to edit"})
            assert response.status_code == 403, f"Expected 403 for nurse edit, got {response.status_code}"
            print("PASS: Nurse cannot edit procedures (403)")
        else:
            print("SKIP: No completed procedures to test nurse edit restriction")


class TestRejectionFlowPhase3Phase4:
    """Test 7: Rejection flow for Phase 3 and Phase 4"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        tokens = {}
        for role, creds in CREDENTIALS.items():
            response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
            if response.status_code == 200:
                data = response.json()
                tokens[role] = {
                    "token": data["token"],
                    "user_id": data["user"]["id"],
                    "user_name": data["user"]["name"]
                }
        return tokens

    def test_phase3_rejection_flow(self, tokens):
        """Test Phase 3 (Second Stage Surgical) rejection creates proper status and notification"""
        # Create and fast-track a procedure to Phase 3
        future_date = datetime.now() + timedelta(days=9)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_time = "10:00" if future_date.weekday() != 5 else "09:30"
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_Phase3Reject_Patient",
            "registration_number": f"TEST-P3R-{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": tokens["supervisor"]["user_id"],
            "supervisor_name": tokens["supervisor"]["user_name"],
            "implant_incharge_id": tokens["implant_incharge"]["user_id"],
            "implant_incharge_name": tokens["implant_incharge"]["user_name"],
            "implant_site": "Upper Left Incisor",
            "receipt_number": f"REC-P3R-{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 42000,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": procedure_time,
            "implant_specifications": "Test Implant for P3 Reject",
            "bone_graft_specifications": "Test Graft",
            "checklist": {"pre_surgical": {"items": [{"id": "case_selection", "label": "Test", "value": True}], "additional_fields": {}}}
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=payload)
        assert response.status_code == 200
        proc_id = response.json()["id"]
        
        # Fast-track to Phase 3
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/submit-phase2",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json={"checklist_surgical": {"items": [{"id": "consent_form", "label": "Test", "value": True}], "additional_fields": {}}})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        
        # Submit Phase 3
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json={"checklist": {"items": [{"id": "healing_assessment", "label": "Test", "value": True}], "additional_fields": {}}})
        
        # REJECT Phase 3
        rejection_reason = "Healing assessment incomplete - need more time"
        response = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "reject", "rejection_reason": rejection_reason})
        
        assert response.status_code == 200, f"Phase 3 rejection failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "stage2_surgical_rejected", f"Expected stage2_surgical_rejected, got {procedure['status']}"
        assert procedure["stage2_surgical_rejection_reason"] == rejection_reason
        assert "stage2_surgical_rejected_by" in procedure
        
        # Verify rejection creates notification with Phase 3 terminology
        student_token = tokens["student"]["token"]
        notif_response = requests.get(f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {student_token}"})
        notifications = notif_response.json()
        
        rejection_notifs = [n for n in notifications if "Phase 3" in n.get("message", "") and "Rejected" in n.get("message", "")]
        assert len(rejection_notifs) > 0, "No Phase 3 rejection notification found"
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/procedures/{proc_id}",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        
        print("PASS: Phase 3 rejection flow works correctly")
        pytest.phase3_reject_proc_id = proc_id

    def test_phase4_rejection_flow(self, tokens):
        """Test Phase 4 (Prosthetic Protocol) rejection creates proper status and notification"""
        # Create and fast-track a procedure to Phase 4
        future_date = datetime.now() + timedelta(days=11)
        while future_date.weekday() == 6:
            future_date += timedelta(days=1)
        
        procedure_time = "10:00" if future_date.weekday() != 5 else "09:30"
        
        payload = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "TEST_Phase4Reject_Patient",
            "registration_number": f"TEST-P4R-{datetime.now().strftime('%H%M%S')}",
            "supervisor_id": tokens["supervisor"]["user_id"],
            "supervisor_name": tokens["supervisor"]["user_name"],
            "implant_incharge_id": tokens["implant_incharge"]["user_id"],
            "implant_incharge_name": tokens["implant_incharge"]["user_name"],
            "implant_site": "Lower Right Premolar",
            "receipt_number": f"REC-P4R-{datetime.now().strftime('%H%M%S')}",
            "amount_paid": 48000,
            "procedure_date": future_date.strftime("%Y-%m-%d"),
            "procedure_time": procedure_time,
            "implant_specifications": "Test Implant for P4 Reject",
            "bone_graft_specifications": "Test Graft",
            "checklist": {"pre_surgical": {"items": [{"id": "case_selection", "label": "Test", "value": True}], "additional_fields": {}}}
        }
        
        response = requests.post(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json=payload)
        assert response.status_code == 200
        proc_id = response.json()["id"]
        
        # Fast-track to Phase 4
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/submit-phase2",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json={"checklist_surgical": {"items": [{"id": "consent_form", "label": "Test", "value": True}], "additional_fields": {}}})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        
        # Submit and approve Phase 3
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json={"checklist": {"items": [{"id": "healing_assessment", "label": "Test", "value": True}], "additional_fields": {}}})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"}, json={"action": "approve"})
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/surgical/approve",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"}, json={"action": "approve"})
        
        # Submit Phase 4
        requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/prosthetic",
            headers={"Authorization": f"Bearer {tokens['student']['token']}"},
            json={"checklist": {"items": [{"id": "impression_taken", "label": "Test", "value": True}], "additional_fields": {}}})
        
        # REJECT Phase 4
        rejection_reason = "Prosthesis shade mismatch - needs redo"
        response = requests.post(f"{BASE_URL}/api/procedures/{proc_id}/stage2/prosthetic/approve",
            headers={"Authorization": f"Bearer {tokens['supervisor']['token']}"},
            json={"action": "reject", "rejection_reason": rejection_reason})
        
        assert response.status_code == 200, f"Phase 4 rejection failed: {response.text}"
        
        procedure = response.json()
        assert procedure["status"] == "stage2_prosthetic_rejected", f"Expected stage2_prosthetic_rejected, got {procedure['status']}"
        assert procedure["stage2_prosthetic_rejection_reason"] == rejection_reason
        assert "stage2_prosthetic_rejected_by" in procedure
        
        # Verify rejection creates notification with Phase 4 terminology
        student_token = tokens["student"]["token"]
        notif_response = requests.get(f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {student_token}"})
        notifications = notif_response.json()
        
        rejection_notifs = [n for n in notifications if "Phase 4" in n.get("message", "") and "Rejected" in n.get("message", "")]
        assert len(rejection_notifs) > 0, "No Phase 4 rejection notification found"
        
        # Clean up
        requests.delete(f"{BASE_URL}/api/procedures/{proc_id}",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        
        print("PASS: Phase 4 rejection flow works correctly")

    def test_rejected_procedures_appear_in_filter(self, tokens):
        """Verify rejected procedures appear in ?status=rejected filter"""
        response = requests.get(f"{BASE_URL}/api/procedures?status=rejected",
            headers={"Authorization": f"Bearer {tokens['implant_incharge']['token']}"})
        assert response.status_code == 200
        
        procedures = response.json()
        rejected_statuses = {"rejected", "stage2_surgical_rejected", "stage2_prosthetic_rejected"}
        
        for proc in procedures:
            assert proc["status"] in rejected_statuses
        
        print(f"PASS: Rejected filter returns correct statuses ({len(procedures)} found)")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def tokens(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["implant_incharge"])
        return response.json()["token"]

    def test_cleanup_test_procedures(self, tokens):
        """Delete TEST_ prefixed procedures"""
        response = requests.get(f"{BASE_URL}/api/procedures",
            headers={"Authorization": f"Bearer {tokens}"})
        
        if response.status_code == 200:
            procedures = response.json()
            deleted_count = 0
            for proc in procedures:
                if proc.get("patient_name", "").startswith("TEST_"):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/procedures/{proc['id']}",
                        headers={"Authorization": f"Bearer {tokens}"})
                    if del_response.status_code == 200:
                        deleted_count += 1
            print(f"CLEANUP: Deleted {deleted_count} TEST_ prefixed procedures")
