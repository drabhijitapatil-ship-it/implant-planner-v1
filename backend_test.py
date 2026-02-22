#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://implant-workflow.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class DentalImplantTester:
    def __init__(self):
        self.student_token = None
        self.instructor_token = None
        self.administrator_token = None
        self.procedure_id = None
        self.instructor_id = None
        self.administrator_id = None
        
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
            
    def test_1_login_student(self):
        """Test 1: Login as Student (Gaurav Pandey)"""
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
        
    def test_2_get_instructors_and_administrators(self):
        """Test 2: Get List of Instructors and Administrators"""
        print("\n=== Test 2: Get List of Instructors and Administrators ===")
        
        # Get instructors
        instructors = self.make_request("GET", "/users?role=instructor", token=self.student_token)
        if not instructors:
            return self.log_error("Failed to get instructors")
            
        if not isinstance(instructors, list) or len(instructors) == 0:
            return self.log_error("No instructors found")
            
        self.instructor_id = instructors[0]["id"]
        self.log_success(f"Found {len(instructors)} instructors, selected: {instructors[0]['name']} (ID: {self.instructor_id})")
        
        # Get administrators (implant incharges)
        administrators = self.make_request("GET", "/users?role=administrator", token=self.student_token)
        if not administrators:
            return self.log_error("Failed to get administrators")
            
        if not isinstance(administrators, list) or len(administrators) == 0:
            return self.log_error("No administrators found")
            
        self.administrator_id = administrators[0]["id"]
        self.log_success(f"Found {len(administrators)} administrators, selected: {administrators[0]['name']} (ID: {self.administrator_id})")
        
        # Login as instructor for later use
        instructor_email = instructors[0]["email"]
        # Try different password patterns for instructor
        instructor_passwords = ["instructor123", "admin123", "password123", "123456"]
        instructor_login = None
        
        for password in instructor_passwords:
            instructor_login = self.make_request("POST", "/auth/login", {
                "email": instructor_email,
                "password": password
            })
            if instructor_login:
                self.instructor_token = instructor_login["token"]
                self.log_success(f"Pre-authenticated instructor: {instructors[0]['name']} (password: {password})")
                break
        
        if not instructor_login:
            return self.log_error("Failed to pre-authenticate instructor with any password")
            
        # Login as administrator for later use
        admin_email = administrators[0]["email"]
        # Try different password patterns for administrator
        admin_passwords = ["admin123", "instructor123", "password123", "123456"]
        admin_login = None
        
        for password in admin_passwords:
            admin_login = self.make_request("POST", "/auth/login", {
                "email": admin_email,
                "password": password
            })
            if admin_login:
                self.administrator_token = admin_login["token"]
                self.log_success(f"Pre-authenticated administrator: {administrators[0]['name']} (password: {password})")
                break
        
        if not admin_login:
            return self.log_error("Failed to pre-authenticate administrator with any password")
            
        return True
        
    def test_3_student_creates_phase1_procedure(self):
        """Test 3: Student Creates Phase 1 Procedure"""
        print("\n=== Test 3: Student Creates Phase 1 Procedure ===")
        
        procedure_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "student_name": "Gaurav Pandey",
            "patient_name": "Test Patient Phase Based",
            "registration_number": "REG123456",
            "instructor_id": self.instructor_id,
            "instructor_name": "Test Instructor",
            "implant_incharge_id": self.administrator_id,
            "implant_incharge_name": "Test Administrator", 
            "implant_site": "Upper right molar",
            "receipt_number": "RCP789",
            "amount_paid": 5000.0,
            "procedure_date": procedure_date,
            "procedure_time": "14:00",
            "checklist": {
                "pre_surgical": {
                    "items": [
                        {"label": "Medical history reviewed", "value": True},
                        {"label": "Consent obtained", "value": True},
                        {"label": "Pre-operative radiographs", "value": True}
                    ],
                    "additional_fields": {
                        "notes": "Patient cleared for surgery"
                    }
                }
            },
            "implant_specifications": "Nobel Biocare 4.3x10mm",
            "bone_graft_specifications": "Autogenous bone graft",
            "remark": "Routine implant placement"
        }
        
        response = self.make_request("POST", "/procedures", procedure_data, self.student_token, 200)
        if not response:
            return self.log_error("Failed to create procedure")
            
        self.procedure_id = response["id"]
        
        # Verify procedure details
        expected_checks = [
            ("status", "pending_phase1"),
            ("instructor_phase1_approved", False),
            ("implant_incharge_phase1_approved", False),
            ("patient_name", "Test Patient Phase Based")
        ]
        
        for field, expected in expected_checks:
            if response.get(field) != expected:
                return self.log_error(f"Procedure {field} mismatch: expected {expected}, got {response.get(field)}")
                
        self.log_success(f"Phase 1 procedure created successfully")
        self.log_success(f"Procedure ID: {self.procedure_id}")
        self.log_success(f"Status: {response['status']}")
        self.log_success(f"Phase 1 approvals - Instructor: {response['instructor_phase1_approved']}, Implant Incharge: {response['implant_incharge_phase1_approved']}")
        
        return True
        
    def test_4_instructor_approves_phase1(self):
        """Test 4: Instructor Approves Phase 1"""
        print("\n=== Test 4: Instructor Approves Phase 1 ===")
        
        # Check notifications first
        notifications = self.make_request("GET", "/notifications", token=self.instructor_token)
        if notifications:
            phase1_notifications = [n for n in notifications if self.procedure_id in n.get("procedure_id", "") and "Phase 1" in n["message"]]
            if phase1_notifications:
                self.log_success(f"Instructor received Phase 1 notification: {phase1_notifications[0]['message']}")
            else:
                self.log_error("Instructor did not receive Phase 1 notification")
        
        # Approve procedure
        approval_data = {"action": "approve"}
        
        response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", approval_data, self.instructor_token)
        if not response:
            return self.log_error("Failed to approve Phase 1 as instructor")
            
        # Verify approval
        if not response.get("instructor_phase1_approved"):
            return self.log_error("Instructor phase 1 approval not recorded")
            
        if response.get("implant_incharge_phase1_approved"):
            return self.log_error("Implant incharge should not be approved yet")
            
        if response.get("status") != "pending_phase1":
            return self.log_error(f"Status should still be 'pending_phase1', got: {response.get('status')}")
            
        self.log_success("Instructor approved Phase 1 successfully")
        self.log_success(f"Status remains: {response['status']} (waiting for implant incharge)")
        self.log_success(f"Phase 1 approvals - Instructor: {response['instructor_phase1_approved']}, Implant Incharge: {response['implant_incharge_phase1_approved']}")
        
        return True
        
    def test_5_implant_incharge_approves_phase1(self):
        """Test 5: Implant Incharge Approves Phase 1"""
        print("\n=== Test 5: Implant Incharge Approves Phase 1 ===")
        
        # Check notifications
        notifications = self.make_request("GET", "/notifications", token=self.administrator_token)
        if notifications:
            phase1_notifications = [n for n in notifications if self.procedure_id in n.get("procedure_id", "") and "Phase 1" in n["message"]]
            if phase1_notifications:
                self.log_success(f"Implant incharge received Phase 1 notification: {phase1_notifications[0]['message']}")
            else:
                self.log_error("Implant incharge did not receive Phase 1 notification")
        
        # Approve procedure
        approval_data = {"action": "approve"}
        
        response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", approval_data, self.administrator_token)
        if not response:
            return self.log_error("Failed to approve Phase 1 as implant incharge")
            
        # Verify both approvals and status change
        if not response.get("instructor_phase1_approved"):
            return self.log_error("Instructor phase 1 approval lost")
            
        if not response.get("implant_incharge_phase1_approved"):
            return self.log_error("Implant incharge phase 1 approval not recorded")
            
        if response.get("status") != "phase1_approved":
            return self.log_error(f"Status should be 'phase1_approved', got: {response.get('status')}")
            
        self.log_success("Implant incharge approved Phase 1 successfully")
        self.log_success(f"Status changed to: {response['status']}")
        self.log_success(f"Phase 1 approvals - Instructor: {response['instructor_phase1_approved']}, Implant Incharge: {response['implant_incharge_phase1_approved']}")
        
        return True
        
    def test_6_student_submits_phase2(self):
        """Test 6: Student Submits Phase 2"""
        print("\n=== Test 6: Student Submits Phase 2 ===")
        
        # Check student notification about Phase 1 approval
        notifications = self.make_request("GET", "/notifications", token=self.student_token)
        if notifications:
            approval_notifications = [n for n in notifications if self.procedure_id in n.get("procedure_id", "") and "approved" in n["message"].lower()]
            if approval_notifications:
                self.log_success(f"Student received Phase 1 approval notification: {approval_notifications[0]['message']}")
        
        phase2_data = {
            "checklist_surgical": {
                "items": [
                    {"label": "Surgical site prepared", "value": True},
                    {"label": "Implant placed successfully", "value": True},
                    {"label": "Primary stability achieved", "value": True},
                    {"label": "Hemostasis confirmed", "value": True}
                ],
                "additional_fields": {
                    "surgical_notes": "Implant placed with excellent primary stability",
                    "complications": "None"
                }
            },
            "remark": "Surgical procedure completed successfully"
        }
        
        response = self.make_request("POST", f"/procedures/{self.procedure_id}/submit-phase2", phase2_data, self.student_token)
        if not response:
            return self.log_error("Failed to submit Phase 2")
            
        # Verify Phase 2 submission
        expected_checks = [
            ("status", "pending_phase2"),
            ("current_phase", 2),
            ("instructor_phase2_approved", False),
            ("implant_incharge_phase2_approved", False)
        ]
        
        for field, expected in expected_checks:
            if response.get(field) != expected:
                return self.log_error(f"Phase 2 {field} mismatch: expected {expected}, got {response.get(field)}")
                
        self.log_success("Phase 2 submitted successfully")
        self.log_success(f"Status changed to: {response['status']}")
        self.log_success(f"Current phase: {response['current_phase']}")
        self.log_success(f"Phase 2 approvals - Instructor: {response['instructor_phase2_approved']}, Implant Incharge: {response['implant_incharge_phase2_approved']}")
        
        return True
        
    def test_7_instructor_approves_phase2(self):
        """Test 7: Instructor Approves Phase 2"""
        print("\n=== Test 7: Instructor Approves Phase 2 ===")
        
        # Check notifications
        notifications = self.make_request("GET", "/notifications", token=self.instructor_token)
        if notifications:
            phase2_notifications = [n for n in notifications if self.procedure_id in n.get("procedure_id", "") and "Phase 2" in n["message"]]
            if phase2_notifications:
                self.log_success(f"Instructor received Phase 2 notification: {phase2_notifications[0]['message']}")
        
        # Approve Phase 2
        approval_data = {"action": "approve"}
        
        response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", approval_data, self.instructor_token)
        if not response:
            return self.log_error("Failed to approve Phase 2 as instructor")
            
        # Verify approval
        if not response.get("instructor_phase2_approved"):
            return self.log_error("Instructor phase 2 approval not recorded")
            
        if response.get("implant_incharge_phase2_approved"):
            return self.log_error("Implant incharge should not be approved yet for Phase 2")
            
        if response.get("status") != "pending_phase2":
            return self.log_error(f"Status should still be 'pending_phase2', got: {response.get('status')}")
            
        self.log_success("Instructor approved Phase 2 successfully")
        self.log_success(f"Status remains: {response['status']} (waiting for implant incharge)")
        self.log_success(f"Phase 2 approvals - Instructor: {response['instructor_phase2_approved']}, Implant Incharge: {response['implant_incharge_phase2_approved']}")
        
        return True
        
    def test_8_implant_incharge_approves_phase2_complete(self):
        """Test 8: Implant Incharge Approves Phase 2 - Complete!"""
        print("\n=== Test 8: Implant Incharge Approves Phase 2 - COMPLETE! ===")
        
        # Check notifications
        notifications = self.make_request("GET", "/notifications", token=self.administrator_token)
        if notifications:
            phase2_notifications = [n for n in notifications if self.procedure_id in n.get("procedure_id", "") and "Phase 2" in n["message"]]
            if phase2_notifications:
                self.log_success(f"Implant incharge received Phase 2 notification: {phase2_notifications[0]['message']}")
        
        # Final approval
        approval_data = {"action": "approve"}
        
        response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", approval_data, self.administrator_token)
        if not response:
            return self.log_error("Failed to approve Phase 2 as implant incharge")
            
        # Verify final completion
        if not response.get("instructor_phase2_approved"):
            return self.log_error("Instructor phase 2 approval lost")
            
        if not response.get("implant_incharge_phase2_approved"):
            return self.log_error("Implant incharge phase 2 approval not recorded")
            
        if response.get("status") != "phase2_approved":
            return self.log_error(f"Status should be 'phase2_approved', got: {response.get('status')}")
            
        self.log_success("🎉 PROCEDURE COMPLETED! Implant incharge approved Phase 2")
        self.log_success(f"Final Status: {response['status']}")
        self.log_success(f"Phase 2 approvals - Instructor: {response['instructor_phase2_approved']}, Implant Incharge: {response['implant_incharge_phase2_approved']}")
        
        # Verify completion timestamps
        if 'phase2_completed_at' in response and 'fully_completed_at' in response:
            self.log_success("✅ Completion timestamps recorded")
        else:
            self.log_error("Missing completion timestamps")
            
        return True
        
    def test_9_verify_notifications(self):
        """Test 9: Verify Notifications"""
        print("\n=== Test 9: Verify Final Notifications ===")
        
        success = True
        
        # Check student notifications
        student_notifications = self.make_request("GET", "/notifications", token=self.student_token)
        if student_notifications:
            completion_notifications = [n for n in student_notifications if self.procedure_id in n.get("procedure_id", "") and "completed" in n["message"].lower()]
            if completion_notifications:
                self.log_success(f"Student received completion notification: {completion_notifications[0]['message']}")
            else:
                self.log_error("Student did not receive completion notification")
                success = False
        else:
            self.log_error("Failed to get student notifications")
            success = False
            
        # Check instructor notifications
        instructor_notifications = self.make_request("GET", "/notifications", token=self.instructor_token)
        if instructor_notifications:
            completion_notifications = [n for n in instructor_notifications if self.procedure_id in n.get("procedure_id", "") and "completed" in n["message"].lower()]
            if completion_notifications:
                self.log_success(f"Instructor received completion notification: {completion_notifications[0]['message']}")
            else:
                self.log_error("Instructor did not receive completion notification")
                success = False
        else:
            self.log_error("Failed to get instructor notifications")
            success = False
            
        # Check administrator notifications
        admin_notifications = self.make_request("GET", "/notifications", token=self.administrator_token)
        if admin_notifications:
            completion_notifications = [n for n in admin_notifications if self.procedure_id in n.get("procedure_id", "") and "completed" in n["message"].lower()]
            if completion_notifications:
                self.log_success(f"Administrator received completion notification: {completion_notifications[0]['message']}")
            else:
                self.log_error("Administrator did not receive completion notification") 
                success = False
        else:
            self.log_error("Failed to get administrator notifications")
            success = False
            
        return success
        
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Complete Phase-Based Workflow Test for Dental Implant Management System")
        print(f"Backend URL: {BASE_URL}")
        
        tests = [
            self.test_1_login_student,
            self.test_2_get_instructors_and_administrators,
            self.test_3_student_creates_phase1_procedure,
            self.test_4_instructor_approves_phase1,
            self.test_5_implant_incharge_approves_phase1,
            self.test_6_student_submits_phase2,
            self.test_7_instructor_approves_phase2,
            self.test_8_implant_incharge_approves_phase2_complete,
            self.test_9_verify_notifications
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
        print(f"🏁 TESTING COMPLETE")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        
        if failed == 0:
            print("🎉 ALL TESTS PASSED! Phase-based workflow is working perfectly!")
            return True
        else:
            print(f"💔 {failed} test(s) failed. Please review the errors above.")
            return False

if __name__ == "__main__":
    tester = DentalImplantTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)