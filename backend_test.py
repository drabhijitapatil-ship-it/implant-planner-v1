#!/usr/bin/env python3

"""
Backend Testing Script for Dental Implant Management System
Testing new backend features as specified in the review request.
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import time

# Configuration
BASE_URL = "https://implant-workflow-1.preview.emergentagent.com/api"  # From frontend .env
HEADERS = {"Content-Type": "application/json"}

# Test credentials from the review request
STUDENT_CREDENTIALS = {
    "email": "gaurav.pandey@student.dental.edu",
    "password": "student123"
}

INSTRUCTOR_CREDENTIALS = {
    "email": "abhijit.patil@dental.edu", 
    "password": "dental123"
}

class TestRunner:
    def __init__(self):
        self.student_token = None
        self.instructor_token = None
        self.users = []
        self.dr_abhijit_id = None
        self.test_results = []
        self.failed_tests = []
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def login_user(self, credentials, role_name):
        """Login and return token"""
        self.log(f"Logging in {role_name}...")
        response = requests.post(f"{BASE_URL}/auth/login", json=credentials, headers=HEADERS)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to login {role_name}: {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        token = data.get("token")
        user_info = data.get("user", {})
        
        self.log(f"✅ Successfully logged in {role_name}: {user_info.get('name', 'Unknown')}")
        return token
        
    def get_users(self, token):
        """Get all users to find Dr. Abhijit Patil's ID"""
        self.log("Getting user list...")
        headers = {**HEADERS, "Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/users", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get users: {response.status_code} - {response.text}")
            return []
            
        users = response.json()
        self.log(f"✅ Retrieved {len(users)} users")
        
        # Find Dr. Abhijit Patil
        for user in users:
            if "abhijit.patil" in user.get("email", "").lower():
                self.dr_abhijit_id = user.get("id") or user.get("_id")
                self.log(f"✅ Found Dr. Abhijit Patil ID: {self.dr_abhijit_id}")
                break
                
        return users
        
    def test_24_hour_restriction(self):
        """Test 1: 24-Hour Scheduling Restriction for Students"""
        self.log("\n🧪 TEST 1: 24-Hour Scheduling Restriction for Students")
        
        if not self.student_token or not self.dr_abhijit_id:
            self.log("❌ Cannot run test - missing student token or Dr. Abhijit ID")
            self.failed_tests.append("Test 1: Missing prerequisites")
            return
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        
        # Test 1a: Try to create procedure with today's date (should fail)
        self.log("Testing procedure creation with today's date (should fail)...")
        today = datetime.now().strftime("%Y-%m-%d")
        today_time = "10:00"
        
        procedure_today = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Patient Today",
            "registration_number": "REG001",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,
            "implant_incharge_name": "Dr. Abhijit Patil", 
            "implant_site": "#16",
            "receipt_number": "REC001",
            "amount_paid": 50000.0,
            "procedure_date": today,
            "procedure_time": today_time,
            "implant_specifications": "Standard implant specs",
            "bone_graft_specifications": "Standard bone graft specs"
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_today, headers=headers)
        
        if response.status_code == 400 and "24 hours" in response.text:
            self.log("✅ 24-hour restriction working - today's date rejected as expected")
            self.test_results.append("✅ 24-hour restriction for same-day scheduling")
        else:
            self.log(f"❌ 24-hour restriction failed - Expected 400 error, got {response.status_code}: {response.text}")
            self.failed_tests.append("Test 1a: 24-hour restriction not working for same-day")
            
        # Test 1b: Try to create procedure with date 2 days from now (should succeed)
        self.log("Testing procedure creation with date 2 days from now (should succeed)...")
        future_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        procedure_future = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Patient Future",
            "registration_number": "REG002",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "implant_site": "#17",
            "receipt_number": "REC002", 
            "amount_paid": 55000.0,
            "procedure_date": future_date,
            "procedure_time": "14:00",
            "implant_specifications": "Advanced implant specifications",
            "bone_graft_specifications": "Advanced bone graft specifications"
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_future, headers=headers)
        
        if response.status_code == 200:
            self.log("✅ Future date procedure creation successful")
            self.test_results.append("✅ Future date scheduling (2+ days) works correctly")
            procedure_data = response.json()
            self.test_procedure_id = procedure_data.get("id") or procedure_data.get("_id")
            self.log(f"Created procedure ID: {self.test_procedure_id}")
        else:
            self.log(f"❌ Future date procedure creation failed: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 1b: Future date scheduling not working")
            
    def test_auto_approve_same_person(self):
        """Test 2: Auto-Approve When Same Person is Instructor AND Implant Incharge"""
        self.log("\n🧪 TEST 2: Auto-Approve When Same Person is Instructor AND Implant Incharge")
        
        if not self.instructor_token or not self.dr_abhijit_id:
            self.log("❌ Cannot run test - missing instructor token or Dr. Abhijit ID")
            self.failed_tests.append("Test 2: Missing prerequisites")
            return
            
        # Create a procedure where Dr. Abhijit is BOTH instructor AND implant_incharge
        self.log("Creating procedure with Dr. Abhijit as BOTH instructor AND implant incharge...")
        
        headers_student = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        future_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        procedure_same_person = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Same Person Approval",
            "registration_number": "REG003",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,  # Same person as instructor
            "implant_incharge_name": "Dr. Abhijit Patil",  # Same person as instructor
            "implant_site": "#18",
            "receipt_number": "REC003",
            "amount_paid": 60000.0,
            "procedure_date": future_date,
            "procedure_time": "15:00",
            "implant_specifications": "Test same person implant specs",
            "bone_graft_specifications": "Test same person bone graft specs"
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_same_person, headers=headers_student)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to create test procedure: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 2: Could not create test procedure")
            return
            
        procedure_data = response.json()
        test_procedure_id = procedure_data.get("id") or procedure_data.get("_id")
        self.log(f"✅ Created test procedure ID: {test_procedure_id}")
        
        # Now approve as Dr. Abhijit Patil (who is both instructor and implant incharge)
        self.log("Approving Phase 1 as Dr. Abhijit Patil...")
        headers_instructor = {**HEADERS, "Authorization": f"Bearer {self.instructor_token}"}
        
        approval_data = {
            "action": "approve"
        }
        
        response = requests.post(f"{BASE_URL}/procedures/{test_procedure_id}/approve", 
                               json=approval_data, headers=headers_instructor)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to approve procedure: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 2: Could not approve procedure")
            return
            
        # Check the updated procedure to verify BOTH flags are set to TRUE
        updated_procedure = response.json()
        instructor_approved = updated_procedure.get("instructor_phase1_approved", False)
        implant_incharge_approved = updated_procedure.get("implant_incharge_phase1_approved", False)
        status = updated_procedure.get("status")
        
        self.log(f"Checking approval results:")
        self.log(f"  - instructor_phase1_approved: {instructor_approved}")
        self.log(f"  - implant_incharge_phase1_approved: {implant_incharge_approved}")
        self.log(f"  - status: {status}")
        
        if instructor_approved and implant_incharge_approved and status == "phase1_approved":
            self.log("✅ Auto-approve feature working correctly - both flags set to TRUE, status is 'phase1_approved'")
            self.test_results.append("✅ Auto-approve when same person is instructor AND implant incharge")
        else:
            self.log("❌ Auto-approve feature not working correctly")
            self.failed_tests.append("Test 2: Auto-approve not setting both flags or wrong status")
            
    def test_mandatory_fields_validation(self):
        """Test 3: Mandatory Fields Validation"""
        self.log("\n🧪 TEST 3: Mandatory Fields Validation")
        
        if not self.student_token or not self.dr_abhijit_id:
            self.log("❌ Cannot run test - missing student token or Dr. Abhijit ID")
            self.failed_tests.append("Test 3: Missing prerequisites")
            return
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        future_date = (datetime.now() + timedelta(days=4)).strftime("%Y-%m-%d")
        
        # Test 3a: Try to create procedure without implant_specifications (should fail)
        self.log("Testing procedure creation without implant_specifications (should fail)...")
        
        procedure_no_implant_specs = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test No Implant Specs",
            "registration_number": "REG004",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "implant_site": "#19",
            "receipt_number": "REC004",
            "amount_paid": 45000.0,
            "procedure_date": future_date,
            "procedure_time": "11:00",
            "implant_specifications": "",  # Empty/missing
            "bone_graft_specifications": "Valid bone graft specs"
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_no_implant_specs, headers=headers)
        
        if response.status_code == 400 and "Implant Specifications" in response.text:
            self.log("✅ Implant specifications validation working - empty value rejected")
            self.test_results.append("✅ Mandatory field validation for implant_specifications")
        else:
            self.log(f"❌ Implant specifications validation failed - Expected 400 error, got {response.status_code}: {response.text}")
            self.failed_tests.append("Test 3a: Implant specifications validation not working")
            
        # Test 3b: Try to create procedure without bone_graft_specifications (should fail)
        self.log("Testing procedure creation without bone_graft_specifications (should fail)...")
        
        procedure_no_bone_specs = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test No Bone Specs",
            "registration_number": "REG005",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "implant_site": "#20",
            "receipt_number": "REC005",
            "amount_paid": 48000.0,
            "procedure_date": future_date,
            "procedure_time": "16:00",
            "implant_specifications": "Valid implant specifications",
            "bone_graft_specifications": ""  # Empty/missing
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_no_bone_specs, headers=headers)
        
        if response.status_code == 400 and "Bone Graft" in response.text:
            self.log("✅ Bone graft specifications validation working - empty value rejected")
            self.test_results.append("✅ Mandatory field validation for bone_graft_specifications")
        else:
            self.log(f"❌ Bone graft specifications validation failed - Expected 400 error, got {response.status_code}: {response.text}")
            self.failed_tests.append("Test 3b: Bone graft specifications validation not working")
            
    def test_notification_on_instructor_assignment(self):
        """Test 4: Notification on Instructor Assignment"""
        self.log("\n🧪 TEST 4: Notification on Instructor Assignment")
        
        if not self.student_token or not self.instructor_token or not self.dr_abhijit_id:
            self.log("❌ Cannot run test - missing tokens or Dr. Abhijit ID")
            self.failed_tests.append("Test 4: Missing prerequisites")
            return
            
        # First, get current notification count for instructor
        headers_instructor = {**HEADERS, "Authorization": f"Bearer {self.instructor_token}"}
        
        self.log("Getting initial notification count for instructor...")
        response = requests.get(f"{BASE_URL}/notifications", headers=headers_instructor)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get notifications: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 4: Could not check initial notifications")
            return
            
        initial_notifications = response.json()
        initial_count = len(initial_notifications)
        self.log(f"Initial notification count: {initial_count}")
        
        # Create a new procedure to trigger notification
        self.log("Creating procedure to test instructor assignment notification...")
        headers_student = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        procedure_notification_test = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Notification Assignment",
            "registration_number": "REG006",
            "instructor_id": self.dr_abhijit_id,
            "instructor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,
            "implant_incharge_name": "Dr. Abhijit Patil",
            "implant_site": "#21",
            "receipt_number": "REC006",
            "amount_paid": 52000.0,
            "procedure_date": future_date,
            "procedure_time": "13:00",
            "implant_specifications": "Notification test implant specs",
            "bone_graft_specifications": "Notification test bone graft specs"
        }
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_notification_test, headers=headers_student)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to create notification test procedure: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 4: Could not create test procedure")
            return
            
        procedure_data = response.json()
        test_procedure_id = procedure_data.get("id") or procedure_data.get("_id")
        self.log(f"✅ Created notification test procedure ID: {test_procedure_id}")
        
        # Wait a moment for notification to be created
        time.sleep(1)
        
        # Check notifications for instructor
        self.log("Checking for new notifications...")
        response = requests.get(f"{BASE_URL}/notifications", headers=headers_instructor)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get notifications after procedure creation: {response.status_code} - {response.text}")
            self.failed_tests.append("Test 4: Could not check notifications after procedure creation")
            return
            
        updated_notifications = response.json()
        updated_count = len(updated_notifications)
        
        self.log(f"Updated notification count: {updated_count}")
        
        # Look for assignment notification
        assignment_notification_found = False
        for notification in updated_notifications:
            message = notification.get("message", "")
            if "assigned as Instructor" in message and "Test Notification Assignment" in message:
                assignment_notification_found = True
                self.log(f"✅ Found instructor assignment notification: {message}")
                break
                
        if assignment_notification_found:
            self.test_results.append("✅ Notification created on instructor assignment")
        else:
            self.log("❌ No instructor assignment notification found")
            self.failed_tests.append("Test 4: No instructor assignment notification created")
            
    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("🚀 Starting Backend Testing for New Features...")
        self.log(f"Base URL: {BASE_URL}")
        
        # Login users
        self.student_token = self.login_user(STUDENT_CREDENTIALS, "Student")
        self.instructor_token = self.login_user(INSTRUCTOR_CREDENTIALS, "Instructor")
        
        if not self.student_token:
            self.log("❌ Cannot proceed without student login")
            return
            
        if not self.instructor_token:
            self.log("❌ Cannot proceed without instructor login")
            return
            
        # Get users to find Dr. Abhijit Patil's ID
        self.users = self.get_users(self.student_token)
        
        if not self.dr_abhijit_id:
            self.log("❌ Cannot proceed without Dr. Abhijit Patil's ID")
            return
            
        # Run all tests
        self.test_24_hour_restriction()
        self.test_auto_approve_same_person()
        self.test_mandatory_fields_validation()
        self.test_notification_on_instructor_assignment()
        
        # Print results
        self.print_final_results()
        
    def print_final_results(self):
        """Print final test results"""
        self.log("\n" + "="*60)
        self.log("🏁 FINAL TEST RESULTS")
        self.log("="*60)
        
        if self.test_results:
            self.log("\n✅ PASSED TESTS:")
            for result in self.test_results:
                self.log(f"  {result}")
                
        if self.failed_tests:
            self.log("\n❌ FAILED TESTS:")
            for failure in self.failed_tests:
                self.log(f"  {failure}")
        else:
            self.log("\n🎉 ALL TESTS PASSED!")
            
        total_tests = len(self.test_results) + len(self.failed_tests)
        passed_tests = len(self.test_results)
        
        self.log(f"\nSUMMARY: {passed_tests}/{total_tests} tests passed")

if __name__ == "__main__":
    runner = TestRunner()
    runner.run_all_tests()