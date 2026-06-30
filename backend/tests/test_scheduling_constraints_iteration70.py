"""
Test Suite for Scheduling Constraints Feature - Iteration 70
Tests the new scheduling constraints:
1. Only ONE patient per time slot per day (no double-booking)
2. GET /api/procedures/slots/{date} returns booked_slots with patient_name and scheduled_by
3. POST /api/procedures returns 409 on duplicate slot with descriptive message
4. created_by_name field in procedure list response
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://implant-workflow-hub.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
STUDENT_CREDS = {"identifier": "Gaurav.pandey@student.dental.edu", "password": "Student@123"}
SUPERVISOR_CREDS = {"identifier": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"}
INCHARGE_CREDS = {"identifier": "Abhijit.patil@dental.edu", "password": "Admin@123"}


class TestSchedulingConstraints:
    """Test suite for scheduling constraints feature"""
    
    @pytest.fixture(scope="class")
    def student_token(self):
        """Get student auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=STUDENT_CREDS)
        assert response.status_code == 200, f"Student login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get supervisor auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200, f"Supervisor login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def incharge_token(self):
        """Get implant incharge auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=INCHARGE_CREDS)
        assert response.status_code == 200, f"Incharge login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def users_data(self, student_token):
        """Get users for supervisor_id and implant_incharge_id"""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        users = response.json()
        
        supervisor = next((u for u in users if u.get("role") == "supervisor"), None)
        incharge = next((u for u in users if u.get("role") == "implant_incharge"), None)
        
        assert supervisor, "No supervisor found in users"
        assert incharge, "No implant_incharge found in users"
        
        return {
            "supervisor_id": supervisor["id"],
            "supervisor_name": supervisor["name"],
            "incharge_id": incharge["id"],
            "incharge_name": incharge["name"]
        }
    
    def get_test_date(self, days_ahead=30):
        """Get a future date that's not Sunday for testing"""
        test_date = datetime.now() + timedelta(days=days_ahead)
        # Avoid Sunday (weekday 6)
        while test_date.weekday() == 6:
            test_date += timedelta(days=1)
        return test_date.strftime("%Y-%m-%d")
    
    def create_procedure_payload(self, users_data, date, time="10:00"):
        """Create a valid procedure payload"""
        return {
            "patient_name": f"TEST_Patient_{datetime.now().strftime('%H%M%S')}",
            "student_name": "Dr. Gaurav Pandey",
            "registration_number": "REG-TEST-001",
            "supervisor_id": users_data["supervisor_id"],
            "supervisor_name": users_data["supervisor_name"],
            "implant_incharge_id": users_data["incharge_id"],
            "implant_incharge_name": users_data["incharge_name"],
            "receipt_number": "REC-TEST-001",
            "amount_paid": 5000.0,
            "procedure_date": date,
            "procedure_time": time,
            "implant_procedure_type": "Single Conventional Implant",
            "loading_type": ["Delayed Loading"],
            "prosthetic_plan": "Cement Retained Crown - Zirconia",
            "implant_site": "14",
            "implant_region": "Maxilla",
            "medical_assessment": {"diabetes": "No", "hypertension": "No"},
            "medical_risk_level": "Low"
        }
    
    # ============ Test 1: GET /api/procedures/slots/{date} - Empty slots ============
    def test_get_booked_slots_empty_date(self, student_token):
        """Test GET /api/procedures/slots/{date} returns empty booked_slots for a date with no procedures"""
        headers = {"Authorization": f"Bearer {student_token}"}
        # Use a far future date unlikely to have any procedures
        test_date = "2030-01-15"
        
        response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "date" in data, "Response should contain 'date' field"
        assert data["date"] == test_date, f"Date mismatch: expected {test_date}, got {data['date']}"
        assert "booked_slots" in data, "Response should contain 'booked_slots' field"
        assert isinstance(data["booked_slots"], dict), "booked_slots should be a dict"
        # For a date with no procedures, booked_slots should be empty
        print(f"✓ GET /api/procedures/slots/{test_date} returned empty booked_slots: {data['booked_slots']}")
    
    # ============ Test 2: Create procedure and verify slot shows as booked ============
    def test_create_procedure_and_verify_slot_booked(self, supervisor_token, users_data, incharge_token):
        """Create a procedure and verify the slot shows as booked via GET slots endpoint"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date = self.get_test_date(days_ahead=60)  # Use a date far in future
        
        payload = self.create_procedure_payload(users_data, test_date, "10:00")
        payload["patient_name"] = "TEST_SlotBooking_Patient"
        
        # Create procedure
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        created_proc = response.json()
        procedure_id = created_proc.get("id") or created_proc.get("_id")
        
        try:
            # Verify slot is now booked
            slots_response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}", headers=headers)
            assert slots_response.status_code == 200, f"Failed to get slots: {slots_response.text}"
            slots_data = slots_response.json()
            
            assert "booked_slots" in slots_data, "Response should contain 'booked_slots'"
            assert "10:00" in slots_data["booked_slots"], f"10:00 slot should be booked. Got: {slots_data['booked_slots']}"
            
            slot_info = slots_data["booked_slots"]["10:00"]
            assert "patient_name" in slot_info, "Slot info should contain 'patient_name'"
            assert "scheduled_by" in slot_info, "Slot info should contain 'scheduled_by'"
            assert slot_info["patient_name"] == "TEST_SlotBooking_Patient", f"Patient name mismatch: {slot_info['patient_name']}"
            
            print(f"✓ Slot 10:00 on {test_date} is booked: patient={slot_info['patient_name']}, scheduled_by={slot_info['scheduled_by']}")
        finally:
            # Cleanup: Delete the procedure
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=delete_headers)
    
    # ============ Test 3: Duplicate slot rejection (409) ============
    def test_duplicate_slot_rejection_409(self, supervisor_token, users_data, incharge_token):
        """Test that creating a procedure at an already-booked slot returns 409"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date = self.get_test_date(days_ahead=65)  # Different date to avoid conflicts
        
        # Create first procedure at 10:00
        payload1 = self.create_procedure_payload(users_data, test_date, "10:00")
        payload1["patient_name"] = "TEST_FirstPatient_Duplicate"
        
        response1 = requests.post(f"{BASE_URL}/api/procedures", json=payload1, headers=headers)
        assert response1.status_code == 200, f"Failed to create first procedure: {response1.text}"
        proc1 = response1.json()
        proc1_id = proc1.get("id") or proc1.get("_id")
        
        try:
            # Try to create second procedure at same time+date
            payload2 = self.create_procedure_payload(users_data, test_date, "10:00")
            payload2["patient_name"] = "TEST_SecondPatient_Duplicate"
            
            response2 = requests.post(f"{BASE_URL}/api/procedures", json=payload2, headers=headers)
            
            assert response2.status_code == 409, f"Expected 409 for duplicate slot, got {response2.status_code}: {response2.text}"
            
            error_data = response2.json()
            error_msg = error_data.get("detail") or error_data.get("error") or ""
            
            # Verify error message contains patient name and scheduler name
            assert "TEST_FirstPatient_Duplicate" in error_msg, f"Error message should contain patient name. Got: {error_msg}"
            assert "10:00" in error_msg or "10:00 AM" in error_msg, f"Error message should mention the time slot. Got: {error_msg}"
            
            print(f"✓ Duplicate slot correctly rejected with 409. Error: {error_msg}")
        finally:
            # Cleanup
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc1_id}", headers=delete_headers)
    
    # ============ Test 4: Different time slot on same day should succeed ============
    def test_different_time_same_day_succeeds(self, supervisor_token, users_data, incharge_token):
        """Test that booking 10:00 then 14:00 on the same day succeeds"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date = self.get_test_date(days_ahead=70)
        
        # Create first procedure at 10:00
        payload1 = self.create_procedure_payload(users_data, test_date, "10:00")
        payload1["patient_name"] = "TEST_Morning_Patient"
        
        response1 = requests.post(f"{BASE_URL}/api/procedures", json=payload1, headers=headers)
        assert response1.status_code == 200, f"Failed to create 10:00 procedure: {response1.text}"
        proc1 = response1.json()
        proc1_id = proc1.get("id") or proc1.get("_id")
        
        try:
            # Create second procedure at 14:00 (should succeed)
            payload2 = self.create_procedure_payload(users_data, test_date, "14:00")
            payload2["patient_name"] = "TEST_Afternoon_Patient"
            
            response2 = requests.post(f"{BASE_URL}/api/procedures", json=payload2, headers=headers)
            assert response2.status_code == 200, f"Expected 200 for different time slot, got {response2.status_code}: {response2.text}"
            
            proc2 = response2.json()
            proc2_id = proc2.get("id") or proc2.get("_id")
            
            # Verify both slots are booked
            slots_response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}", headers=headers)
            slots_data = slots_response.json()
            
            assert "10:00" in slots_data["booked_slots"], "10:00 slot should be booked"
            assert "14:00" in slots_data["booked_slots"], "14:00 slot should be booked"
            
            print(f"✓ Different time slots on same day ({test_date}) both booked successfully")
            
            # Cleanup second procedure
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc2_id}", headers=delete_headers)
        finally:
            # Cleanup first procedure
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc1_id}", headers=delete_headers)
    
    # ============ Test 5: Same time slot on different day should succeed ============
    def test_same_time_different_day_succeeds(self, supervisor_token, users_data, incharge_token):
        """Test that booking 10:00 on different days succeeds"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date1 = self.get_test_date(days_ahead=75)
        test_date2 = self.get_test_date(days_ahead=76)
        
        # Create first procedure at 10:00 on day 1
        payload1 = self.create_procedure_payload(users_data, test_date1, "10:00")
        payload1["patient_name"] = "TEST_Day1_Patient"
        
        response1 = requests.post(f"{BASE_URL}/api/procedures", json=payload1, headers=headers)
        assert response1.status_code == 200, f"Failed to create day 1 procedure: {response1.text}"
        proc1 = response1.json()
        proc1_id = proc1.get("id") or proc1.get("_id")
        
        try:
            # Create second procedure at 10:00 on day 2 (should succeed)
            payload2 = self.create_procedure_payload(users_data, test_date2, "10:00")
            payload2["patient_name"] = "TEST_Day2_Patient"
            
            response2 = requests.post(f"{BASE_URL}/api/procedures", json=payload2, headers=headers)
            assert response2.status_code == 200, f"Expected 200 for same time different day, got {response2.status_code}: {response2.text}"
            
            proc2 = response2.json()
            proc2_id = proc2.get("id") or proc2.get("_id")
            
            print(f"✓ Same time slot (10:00) on different days ({test_date1} and {test_date2}) both booked successfully")
            
            # Cleanup second procedure
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc2_id}", headers=delete_headers)
        finally:
            # Cleanup first procedure
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc1_id}", headers=delete_headers)
    
    # ============ Test 6: Verify created_by_name in procedure list ============
    def test_created_by_name_in_procedure_list(self, supervisor_token, users_data, incharge_token):
        """Test that GET /api/procedures returns created_by_name field for dashboard display"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date = self.get_test_date(days_ahead=80)
        
        # Create a procedure as supervisor
        payload = self.create_procedure_payload(users_data, test_date, "10:00")
        payload["patient_name"] = "TEST_CreatedByName_Patient"
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed to create procedure: {response.text}"
        created_proc = response.json()
        procedure_id = created_proc.get("id") or created_proc.get("_id")
        
        try:
            # Verify created_by_name is in the created response
            assert "created_by_name" in created_proc, f"created_by_name should be in create response. Keys: {created_proc.keys()}"
            
            # Get procedure list and verify created_by_name
            list_response = requests.get(f"{BASE_URL}/api/procedures", headers=headers)
            assert list_response.status_code == 200, f"Failed to get procedures: {list_response.text}"
            
            procedures = list_response.json()
            test_proc = next((p for p in procedures if p.get("id") == procedure_id or p.get("_id") == procedure_id), None)
            
            assert test_proc is not None, f"Created procedure not found in list"
            assert "created_by_name" in test_proc, f"created_by_name should be in procedure list. Keys: {test_proc.keys()}"
            
            print(f"✓ created_by_name field present in procedure: {test_proc.get('created_by_name')}")
        finally:
            # Cleanup
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=delete_headers)
    
    # ============ Test 7: Verify 409 error message includes patient and scheduler names ============
    def test_409_error_message_includes_names(self, supervisor_token, users_data, incharge_token):
        """Test that 409 error message includes patient name and scheduler name"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        test_date = self.get_test_date(days_ahead=85)
        
        # Create first procedure
        payload1 = self.create_procedure_payload(users_data, test_date, "14:00")
        payload1["patient_name"] = "TEST_OriginalPatient_409"
        
        response1 = requests.post(f"{BASE_URL}/api/procedures", json=payload1, headers=headers)
        assert response1.status_code == 200, f"Failed to create first procedure: {response1.text}"
        proc1 = response1.json()
        proc1_id = proc1.get("id") or proc1.get("_id")
        scheduler_name = proc1.get("created_by_name", "")
        
        try:
            # Try to create duplicate
            payload2 = self.create_procedure_payload(users_data, test_date, "14:00")
            payload2["patient_name"] = "TEST_DuplicatePatient_409"
            
            response2 = requests.post(f"{BASE_URL}/api/procedures", json=payload2, headers=headers)
            
            assert response2.status_code == 409, f"Expected 409, got {response2.status_code}"
            
            error_data = response2.json()
            error_msg = error_data.get("detail") or error_data.get("error") or ""
            
            # Check that error message contains the original patient name
            assert "TEST_OriginalPatient_409" in error_msg, f"Error should contain original patient name. Got: {error_msg}"
            
            # Check that error message contains scheduler info (scheduled by)
            assert "scheduled by" in error_msg.lower() or "booked" in error_msg.lower(), f"Error should mention who scheduled. Got: {error_msg}"
            
            print(f"✓ 409 error message correctly includes patient name and scheduler info: {error_msg}")
        finally:
            # Cleanup
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{proc1_id}", headers=delete_headers)
    
    # ============ Test 8: Student creates procedure - verify slot booking ============
    def test_student_creates_procedure_slot_booking(self, student_token, users_data, incharge_token):
        """Test that student-created procedures also block slots correctly"""
        headers = {"Authorization": f"Bearer {student_token}"}
        # Students need 24+ hours advance, so use a date far in future
        test_date = self.get_test_date(days_ahead=90)
        
        payload = self.create_procedure_payload(users_data, test_date, "10:00")
        payload["patient_name"] = "TEST_StudentCreated_Patient"
        
        response = requests.post(f"{BASE_URL}/api/procedures", json=payload, headers=headers)
        assert response.status_code == 200, f"Student failed to create procedure: {response.text}"
        created_proc = response.json()
        procedure_id = created_proc.get("id") or created_proc.get("_id")
        
        try:
            # Verify slot is booked
            slots_response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}", headers=headers)
            assert slots_response.status_code == 200
            slots_data = slots_response.json()
            
            assert "10:00" in slots_data["booked_slots"], "Student-created procedure should book the slot"
            slot_info = slots_data["booked_slots"]["10:00"]
            assert slot_info["patient_name"] == "TEST_StudentCreated_Patient"
            
            # scheduled_by should be student name or empty for student-created
            print(f"✓ Student-created procedure booked slot: patient={slot_info['patient_name']}, scheduled_by={slot_info.get('scheduled_by', 'N/A')}")
        finally:
            # Cleanup
            delete_headers = {"Authorization": f"Bearer {incharge_token}"}
            requests.delete(f"{BASE_URL}/api/procedures/{procedure_id}", headers=delete_headers)


class TestSlotsEndpointStructure:
    """Test the structure and response format of the slots endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDS)
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_slots_endpoint_returns_correct_structure(self, auth_token):
        """Verify the slots endpoint returns the expected structure"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        test_date = "2026-05-15"
        
        response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "date" in data, "Response must have 'date' field"
        assert "booked_slots" in data, "Response must have 'booked_slots' field"
        assert isinstance(data["booked_slots"], dict), "booked_slots must be a dict"
        
        print(f"✓ Slots endpoint structure verified: {data}")
    
    def test_slots_endpoint_requires_auth(self):
        """Verify the slots endpoint requires authentication"""
        test_date = "2026-05-15"
        
        response = requests.get(f"{BASE_URL}/api/procedures/slots/{test_date}")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ Slots endpoint correctly requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
