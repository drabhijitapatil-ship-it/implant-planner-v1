#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://teeth-selection-tool.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class NurseRoleTester:
    def __init__(self):
        self.nurse_token = None
        self.student_token = None
        self.procedure_id = None
        
    def log_success(self, message):
        print(f"✅ {message}")
        
    def log_error(self, message):
        print(f"❌ {message}")
        return False
        
    def log_info(self, message):
        print(f"ℹ️  {message}")
        
    def make_request(self, method, endpoint, data=None, token=None, expected_status=200):
        """Make HTTP request with proper error handling"""
        url = f"{BASE_URL}{endpoint}"
        headers = HEADERS.copy()
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        try:
            if method == "GET":
                response = requests.get(url, headers=headers)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers)
            elif method == "PUT":
                response = requests.put(url, json=data, headers=headers)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code != expected_status:
                print(f"❌ Request failed: {method} {endpoint}")
                print(f"   Expected status: {expected_status}, Got: {response.status_code}")
                print(f"   Response: {response.text[:500]}")
                return None
                
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return None
        except json.JSONDecodeError:
            print(f"❌ Invalid JSON response")
            return None
            
    def setup_test_users(self):
        """Create test users if they don't exist"""
        print("\n=== Setting up test users ===")
        
        test_users = [
            ("Gaurav Pandey", "gaurav.pandey@student.dental.edu", "student123", "student"),
            ("Dr. Abhijit Patil", "abhijit.patil@dental.edu", "admin123", "implant_incharge"),
            ("Dr. Rajeshree Jadhav", "rajeshree.jadhav@dental.edu", "instructor123", "instructor"),
            ("Nurse 1", "nurse1@dental.edu", "nurse123", "nurse"),
            ("Nurse 2", "nurse2@dental.edu", "nurse123", "nurse"),
        ]
        
        for name, email, password, role in test_users:
            user_data = {
                "name": name,
                "email": email,
                "password": password,
                "role": role
            }
            
            response = self.make_request("POST", "/auth/register", user_data, expected_status=200)
            if response:
                self.log_success(f"Created/verified {role}: {name} ({email})")
            else:
                # Check if user already exists (400 status expected)
                check_response = requests.post(f"{BASE_URL}/auth/register", json=user_data)
                if check_response.status_code == 400 and "already registered" in check_response.text:
                    self.log_info(f"User already exists: {name} ({email})")
                else:
                    self.log_error(f"Failed to create {role}: {name}")
                    
    def test_1_nurse_login(self):
        """Test 1: Nurse Login Test"""
        print("\n=== Test 1: Nurse Login Test ===")
        
        login_data = {
            "email": "nurse1@dental.edu",
            "password": "nurse123"
        }
        
        response = self.make_request("POST", "/auth/login", login_data)
        if not response:
            return self.log_error("Failed to login as nurse1")
            
        if "token" not in response or "user" not in response:
            return self.log_error("Invalid login response structure")
            
        self.nurse_token = response["token"]
        user = response["user"]
        
        if user["email"] != login_data["email"] or user["role"] != "nurse":
            return self.log_error(f"Login returned wrong user: {user}")
            
        self.log_success(f"Nurse login successful - {user['name']} ({user['email']})")
        self.log_success(f"User role correctly set to: {user['role']}")
        return True
        
    def test_2_verify_pre_populated_users(self):
        """Test 2: Verify Pre-populated Users"""
        print("\n=== Test 2: Verify Pre-populated Users ===")
        
        # Get all users to verify roles
        users = self.make_request("GET", "/users", token=self.nurse_token)
        if not users:
            return self.log_error("Failed to get users list")
            
        # Check for specific users
        expected_users = {
            "abhijit.patil@dental.edu": "implant_incharge",
            "rajeshree.jadhav@dental.edu": "instructor", 
            "nurse1@dental.edu": "nurse",
            "nurse2@dental.edu": "nurse"
        }
        
        found_users = {}
        for user in users:
            email = user["email"]
            role = user["role"]
            if email in expected_users:
                found_users[email] = role
                
        success = True
        for email, expected_role in expected_users.items():
            if email in found_users:
                if found_users[email] == expected_role:
                    self.log_success(f"Found {email} with correct role: {expected_role}")
                else:
                    self.log_error(f"User {email} has wrong role: expected {expected_role}, got {found_users[email]}")
                    success = False
            else:
                self.log_error(f"User {email} not found")
                success = False
                
        return success
        
    def test_3_create_test_procedure(self):
        """Test 3: Create test procedure using student account"""
        print("\n=== Test 3: Create test procedure for nurse access testing ===")
        
        # First login as student
        student_login = self.make_request("POST", "/auth/login", {
            "email": "gaurav.pandey@student.dental.edu",
            "password": "student123"
        })
        
        if not student_login:
            return self.log_error("Failed to login as student")
            
        self.student_token = student_login["token"]
        self.log_success("Student login successful")
        
        # Get instructor and implant_incharge IDs
        users = self.make_request("GET", "/users", token=self.student_token)
        if not users:
            return self.log_error("Failed to get users list")
            
        instructor_id = None
        implant_incharge_id = None
        
        for user in users:
            if user["email"] == "sarah.johnson@dental.edu":
                instructor_id = user["id"]
            elif user["email"] == "smith.admin@dental.edu":
                implant_incharge_id = user["id"]
                
        if not instructor_id or not implant_incharge_id:
            return self.log_error("Could not find required instructor or implant_incharge users")
            
        # Create procedure
        procedure_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Patient For Nurse Access",
            "registration_number": "REG_NURSE_TEST",
            "instructor_id": instructor_id,
            "instructor_name": "Dr. Sarah Johnson",
            "implant_incharge_id": implant_incharge_id,
            "implant_incharge_name": "Dr. Smith Admin", 
            "implant_site": "Lower left molar",
            "receipt_number": "RCP_NURSE_001",
            "amount_paid": 3000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "checklist": {
                "pre_surgical": {
                    "items": [
                        {"label": "Medical history reviewed", "value": True},
                        {"label": "Consent obtained", "value": True},
                        {"label": "Pre-operative radiographs", "value": True}
                    ]
                }
            },
            "implant_specifications": "Test Implant 4.0x8mm",
            "remark": "Test procedure for nurse access testing"
        }
        
        response = self.make_request("POST", "/procedures", procedure_data, self.student_token)
        if not response:
            return self.log_error("Failed to create test procedure")
            
        self.procedure_id = response["id"]
        self.log_success(f"Test procedure created successfully - ID: {self.procedure_id}")
        self.log_success(f"Procedure status: {response['status']}")
        
        return True
        
    def test_4_nurse_procedures_access(self):
        """Test 4: Nurse can only see approved/completed procedures"""
        print("\n=== Test 4: Nurse Procedures Access Test ===")
        
        # Test getting procedures as nurse - should only see approved ones
        procedures = self.make_request("GET", "/procedures", token=self.nurse_token)
        if procedures is None:
            return self.log_error("Failed to get procedures as nurse")
            
        # Initially, there should be no approved procedures visible to nurse
        if len(procedures) == 0:
            self.log_success("Nurse correctly sees no procedures (none are approved yet)")
        else:
            # Check if all visible procedures are approved
            approved_statuses = ["phase1_approved", "phase2_approved", "approved"]
            for proc in procedures:
                if proc["status"] not in approved_statuses:
                    return self.log_error(f"Nurse can see non-approved procedure: {proc['id']} with status {proc['status']}")
                    
            self.log_success(f"Nurse can see {len(procedures)} approved procedures only")
            
        # Test nurse cannot see specific pending procedure
        try:
            proc_response = requests.get(f"{BASE_URL}/procedures/{self.procedure_id}",
                                       headers={"Authorization": f"Bearer {self.nurse_token}"})
            if proc_response.status_code == 403:
                self.log_success("Nurse correctly denied access to pending procedure")
            else:
                self.log_error(f"Expected 403 for pending procedure access, got {proc_response.status_code}")
                return False
        except Exception as e:
            self.log_error(f"Error testing pending procedure access: {e}")
            return False
            
        return True
        
    def test_5_nurse_read_only_restrictions(self):
        """Test 5: Nurse Read-Only Restrictions"""
        print("\n=== Test 5: Nurse Read-Only Restrictions Test ===")
        
        success = True
        
        # Test 1: Nurse cannot create procedures
        procedure_data = {
            "student_name": "Test Student",
            "patient_name": "Test Patient",
            "registration_number": "TEST123",
            "instructor_id": "some_id",
            "instructor_name": "Test Instructor",
            "implant_incharge_id": "some_id",
            "implant_incharge_name": "Test Admin",
            "implant_site": "Test site",
            "receipt_number": "TEST_RCP",
            "amount_paid": 1000.0,
            "procedure_date": "2024-01-01",
            "procedure_time": "10:00"
        }
        
        try:
            create_response = requests.post(f"{BASE_URL}/procedures", json=procedure_data, 
                                          headers={"Authorization": f"Bearer {self.nurse_token}"})
            if create_response.status_code == 403:
                self.log_success("Nurse correctly denied permission to create procedures")
            else:
                self.log_error(f"Expected 403 for create, got {create_response.status_code}")
                success = False
        except Exception as e:
            self.log_error(f"Error testing create restriction: {e}")
            success = False
            
        # Test 2: Nurse cannot edit procedures
        update_data = {
            "patient_name": "Updated Name"
        }
        
        try:
            edit_response = requests.put(f"{BASE_URL}/procedures/{self.procedure_id}", 
                                       json=update_data, 
                                       headers={"Authorization": f"Bearer {self.nurse_token}"})
            if edit_response.status_code == 403:
                self.log_success("Nurse correctly denied permission to edit procedures")
            else:
                self.log_error(f"Expected 403 for edit, got {edit_response.status_code}")
                success = False
        except Exception as e:
            self.log_error(f"Error testing edit restriction: {e}")
            success = False
            
        # Test 3: Nurse cannot approve procedures
        approval_data = {"action": "approve"}
        
        try:
            approve_response = requests.post(f"{BASE_URL}/procedures/{self.procedure_id}/approve", 
                                          json=approval_data, 
                                          headers={"Authorization": f"Bearer {self.nurse_token}"})
            if approve_response.status_code == 403:
                self.log_success("Nurse correctly denied permission to approve procedures")
            else:
                self.log_error(f"Expected 403 for approve, got {approve_response.status_code}")
                success = False
        except Exception as e:
            self.log_error(f"Error testing approve restriction: {e}")
            success = False
            
        return success
        
    def test_6_nurse_access_approved_procedure(self):
        """Test 6: Create and approve a procedure, then verify nurse can access it"""
        print("\n=== Test 6: Nurse Access to Approved Procedure ===")
        
        # Login as instructor to approve the procedure  
        instructor_login = self.make_request("POST", "/auth/login", {
            "email": "sarah.johnson@dental.edu", 
            "password": "instructor123"
        })
        
        if not instructor_login:
            return self.log_error("Failed to login as instructor")
            
        instructor_token = instructor_login["token"]
        
        # Login as implant_incharge (use administrator role)
        admin_login = self.make_request("POST", "/auth/login", {
            "email": "smith.admin@dental.edu",
            "password": "admin123"
        })
        
        if not admin_login:
            return self.log_error("Failed to login as implant_incharge")
            
        admin_token = admin_login["token"]
        
        # Approve procedure by instructor (Phase 1)
        approval_data = {"action": "approve"}
        instructor_approval = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", 
                                              approval_data, instructor_token)
        if not instructor_approval:
            return self.log_error("Failed to approve procedure as instructor")
            
        # Approve procedure by implant_incharge (Phase 1 complete)
        admin_approval = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", 
                                         approval_data, admin_token)
        if not admin_approval:
            return self.log_error("Failed to approve procedure as implant_incharge")
            
        self.log_success("Procedure approved by both instructor and implant_incharge")
        self.log_success(f"Procedure status: {admin_approval['status']}")
        
        # Now nurse should be able to see this approved procedure
        procedures = self.make_request("GET", "/procedures", token=self.nurse_token)
        if not procedures:
            return self.log_error("Failed to get procedures as nurse after approval")
            
        # Check if our procedure is visible
        found_procedure = None
        for proc in procedures:
            if proc["id"] == self.procedure_id:
                found_procedure = proc
                break
                
        if found_procedure:
            self.log_success(f"Nurse can now see approved procedure: {found_procedure['patient_name']}")
            self.log_success(f"Procedure status visible to nurse: {found_procedure['status']}")
            
            # Test nurse can access procedure details
            proc_detail = self.make_request("GET", f"/procedures/{self.procedure_id}", 
                                          token=self.nurse_token)
            if proc_detail:
                self.log_success("Nurse can access approved procedure details")
                return True
            else:
                return self.log_error("Nurse cannot access approved procedure details")
        else:
            return self.log_error("Nurse cannot see approved procedure in list")
            
    def run_all_tests(self):
        """Run all nurse role tests"""
        print("🚀 Starting Nurse Role Implementation Tests for Dental Implant Management System")
        print(f"Backend URL: {BASE_URL}")
        
        # Setup users first
        self.setup_test_users()
        
        tests = [
            self.test_1_nurse_login,
            self.test_2_verify_pre_populated_users, 
            self.test_3_create_test_procedure,
            self.test_4_nurse_procedures_access,
            self.test_5_nurse_read_only_restrictions,
            self.test_6_nurse_access_approved_procedure
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            try:
                if test():
                    passed += 1
                else:
                    failed += 1
                    print(f"❌ {test.__name__} FAILED")
            except Exception as e:
                failed += 1
                print(f"❌ {test.__name__} FAILED with exception: {e}")
                import traceback
                traceback.print_exc()
                
        print(f"\n{'='*60}")
        print(f"🏁 NURSE ROLE TESTING COMPLETE")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        
        if failed == 0:
            print("🎉 ALL NURSE ROLE TESTS PASSED! Nurse implementation is working correctly!")
            return True
        else:
            print(f"💔 {failed} test(s) failed. Please review the errors above.")
            return False

if __name__ == "__main__":
    tester = NurseRoleTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)