#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://implant-workflow-hub.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class CrashFixTester:
    def __init__(self):
        self.student_token = None
        self.instructor_id = None
        self.instructor_name = None
        self.implant_incharge_id = None
        self.implant_incharge_name = None
        
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
            
    def test_1_login_student(self):
        """Test 1: Login as Student (gaurav.pandey@student.dental.edu)"""
        print("\n=== Test 1: Login as Student (Gaurav Pandey) ===")
        
        login_data = {
            "email": "gaurav.pandey@student.dental.edu",
            "password": "student123"
        }
        
        response = self.make_request("POST", "/auth/login", login_data)
        if not response:
            return self.log_error("Failed to login as student")
            
        if "token" not in response or "user" not in response:
            return self.log_error("Invalid login response structure")
            
        self.student_token = response["token"]
        user = response["user"]
        
        if user["email"] != login_data["email"] or user["role"] != "student":
            return self.log_error(f"Login returned wrong user: {user}")
            
        self.log_success(f"Student login successful - {user['name']} ({user['email']})")
        return True
        
    def test_2_get_users_for_ids(self):
        """Test 2: Get List of Users to Find Instructor and Implant Incharge IDs"""
        print("\n=== Test 2: Get List of Users to Find IDs ===")
        
        # Get all users
        users = self.make_request("GET", "/users", token=self.student_token)
        if not users:
            return self.log_error("Failed to get users")
            
        if not isinstance(users, list) or len(users) == 0:
            return self.log_error("No users found")
        
        # Find instructor and implant_incharge
        instructors = [u for u in users if u["role"] in ["instructor", "administrator"]]
        implant_incharges = [u for u in users if u["role"] in ["implant_incharge", "administrator"]]
        
        if not instructors:
            return self.log_error("No instructors found")
        if not implant_incharges:
            return self.log_error("No implant incharges found")
            
        # Select first available instructor and implant incharge
        instructor = instructors[0]
        implant_incharge = implant_incharges[0]
        
        self.instructor_id = instructor["id"]
        self.instructor_name = instructor["name"]
        self.implant_incharge_id = implant_incharge["id"]
        self.implant_incharge_name = implant_incharge["name"]
        
        self.log_success(f"Found instructor: {self.instructor_name} (ID: {self.instructor_id})")
        self.log_success(f"Found implant incharge: {self.implant_incharge_name} (ID: {self.implant_incharge_id})")
        
        return True
        
    def test_3_create_procedure_crash_fix(self):
        """Test 3: Create Procedure with Specific Checklist Format (Crash Fix)"""
        print("\n=== Test 3: Create Procedure with Crash Fix Payload ===")
        
        # Use the exact payload format specified in the user request
        procedure_data = {
            "student_name": "Dr. Gaurav Pandey",
            "patient_name": "Test Patient",
            "registration_number": "REG123",
            "instructor_id": self.instructor_id,
            "instructor_name": self.instructor_name,
            "implant_incharge_id": self.implant_incharge_id,
            "implant_incharge_name": self.implant_incharge_name,
            "implant_site": "#16",
            "receipt_number": "REC001",
            "amount_paid": 50000,
            "procedure_date": "2026-02-28",
            "procedure_time": "10:00",
            "checklist": {
                "pre_surgical": {
                    "items": [
                        {"id": "case_selection", "label": "Case Selection Approved", "value": True},
                        {"id": "academic_readiness", "label": "Academic Readiness (with presentation)", "value": True}
                    ],
                    "additional_fields": {
                        "implant_specs": "Test specs"
                    }
                }
            }
        }
        
        self.log_info("Sending procedure creation request with specific checklist format...")
        print(f"Payload preview: {json.dumps(procedure_data, indent=2)}")
        
        response = self.make_request("POST", "/procedures", procedure_data, self.student_token, 200)
        if not response:
            return self.log_error("Failed to create procedure - this indicates the crash fix may not be working")
            
        # Verify the procedure was created successfully
        if "id" not in response:
            return self.log_error("Procedure created but no ID returned")
            
        procedure_id = response["id"]
        
        # Verify the checklist was stored correctly
        if "checklist" not in response:
            return self.log_error("Procedure created but checklist missing from response")
            
        checklist = response.get("checklist", {})
        pre_surgical = checklist.get("pre_surgical", {})
        
        if "items" not in pre_surgical or "additional_fields" not in pre_surgical:
            return self.log_error("Checklist structure not preserved correctly")
            
        items = pre_surgical["items"]
        if len(items) != 2:
            return self.log_error(f"Expected 2 checklist items, got {len(items)}")
            
        # Verify specific items
        case_selection_found = any(item.get("id") == "case_selection" for item in items)
        academic_readiness_found = any(item.get("id") == "academic_readiness" for item in items)
        
        if not case_selection_found:
            return self.log_error("Case Selection item not found in checklist")
        if not academic_readiness_found:
            return self.log_error("Academic Readiness item not found in checklist")
            
        # Verify additional fields
        additional_fields = pre_surgical["additional_fields"]
        if "implant_specs" not in additional_fields:
            return self.log_error("Implant specs not found in additional fields")
            
        # Verify procedure status
        if response.get("status") != "pending_phase1":
            return self.log_error(f"Unexpected procedure status: {response.get('status')}")
            
        self.log_success("✅ CRASH FIX VERIFIED! Procedure created successfully")
        self.log_success(f"Procedure ID: {procedure_id}")
        self.log_success(f"Status: {response.get('status')}")
        self.log_success(f"Checklist items: {len(items)}")
        self.log_success(f"Additional fields: {list(additional_fields.keys())}")
        self.log_success("No 422 validation errors - crash fix is working!")
        
        return True
        
    def run_crash_fix_test(self):
        """Run the specific crash fix test"""
        print("🔧 Starting Crash Fix Test for Procedure Creation")
        print(f"Backend URL: {BASE_URL}")
        print("Testing the specific payload format that was causing crashes...")
        
        tests = [
            self.test_1_login_student,
            self.test_2_get_users_for_ids,
            self.test_3_create_procedure_crash_fix
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
                
        print(f"\n{'='*60}")
        print(f"🏁 CRASH FIX TEST COMPLETE")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        
        if failed == 0:
            print("🎉 CRASH FIX CONFIRMED! Procedure creation works with the specified payload format!")
            return True
        else:
            print(f"💔 {failed} test(s) failed. The crash fix may need further investigation.")
            return False

if __name__ == "__main__":
    tester = CrashFixTester()
    success = tester.run_crash_fix_test()
    sys.exit(0 if success else 1)