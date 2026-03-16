#!/usr/bin/env python3
"""
Comprehensive Backend Test for Dental Implant Management System
Focus: Phase 2 Workflow Testing After Fix

This test verifies the complete workflow as requested:
1. Login as student: gaurav.pandey@student.dental.edu / Student@123
2. Get users to find Dr. Abhijit Patil's ID
3. Create a procedure with Dr. Abhijit Patil as both Supervisor and Implant Incharge
4. Login as Dr. Abhijit Patil: abhijit.patil@dental.edu / Admin@123
5. Approve Phase 1
6. Login as student again
7. Submit Phase 2 with surgical checklist
8. Login as Dr. Abhijit Patil again
9. Approve Phase 2
10. Verify final status is "phase2_approved"
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# API Configuration - Using external API as specified in system requirements
API_BASE_URL = "https://torque-visibility.preview.emergentagent.com/api"

# Test Credentials from review request
STUDENT_CREDENTIALS = {
    "email": "gaurav.pandey@student.dental.edu",
    "password": "Student@123"
}

DR_ABHIJIT_CREDENTIALS = {
    "email": "abhijit.patil@dental.edu", 
    "password": "Admin@123"
}

class Phase2WorkflowTester:
    def __init__(self):
        self.session = requests.Session()
        self.student_token = None
        self.dr_abhijit_token = None
        self.dr_abhijit_id = None
        self.procedure_id = None
        self.test_results = []
        self.failed_tests = []

    def log_test(self, test_name: str, success: bool, message: str, details: Any = None):
        """Log test results for comprehensive reporting"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        if not success:
            self.failed_tests.append(result)
            
        status = "✅" if success else "❌"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {json.dumps(details, indent=2) if isinstance(details, dict) else details}")

    def make_request(self, method: str, endpoint: str, token: Optional[str] = None, **kwargs) -> requests.Response:
        """Make HTTP request with proper headers"""
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        url = f"{API_BASE_URL}{endpoint}"
        response = self.session.request(method, url, headers=headers, **kwargs)
        return response

    def test_student_login(self) -> bool:
        """Test Step 1: Login as student"""
        try:
            response = self.make_request("POST", "/auth/login", json=STUDENT_CREDENTIALS)
            
            if response.status_code == 200:
                data = response.json()
                self.student_token = data["token"]
                user_info = data["user"]
                
                if user_info["role"] == "student" and user_info["email"] == STUDENT_CREDENTIALS["email"]:
                    self.log_test("Student Login", True, f"Successfully logged in as {user_info['name']} (Student)")
                    return True
                else:
                    self.log_test("Student Login", False, "Login succeeded but user role/email incorrect", user_info)
                    return False
            else:
                self.log_test("Student Login", False, f"Login failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Student Login", False, f"Login exception: {str(e)}")
            return False

    def test_get_users_and_find_dr_abhijit(self) -> bool:
        """Test Step 2: Get users list and find Dr. Abhijit Patil's ID"""
        try:
            response = self.make_request("GET", "/users", token=self.student_token)
            
            if response.status_code == 200:
                users = response.json()
                
                # Find Dr. Abhijit Patil
                dr_abhijit = None
                for user in users:
                    if user["email"] == DR_ABHIJIT_CREDENTIALS["email"]:
                        dr_abhijit = user
                        break
                
                if dr_abhijit:
                    self.dr_abhijit_id = dr_abhijit["id"]
                    self.log_test("Get Users & Find Dr. Abhijit", True, 
                                f"Found Dr. Abhijit Patil: ID={self.dr_abhijit_id}, Name={dr_abhijit['name']}, Role={dr_abhijit['role']}")
                    return True
                else:
                    available_emails = [u["email"] for u in users]
                    self.log_test("Get Users & Find Dr. Abhijit", False, 
                                f"Dr. Abhijit Patil ({DR_ABHIJIT_CREDENTIALS['email']}) not found in users list", 
                                {"available_emails": available_emails})
                    return False
            else:
                self.log_test("Get Users & Find Dr. Abhijit", False, f"Failed to get users: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Get Users & Find Dr. Abhijit", False, f"Exception: {str(e)}")
            return False

    def test_create_procedure(self) -> bool:
        """Test Step 3: Create procedure with Dr. Abhijit as both Supervisor and Implant Incharge"""
        try:
            # Create procedure date 2 days from now to avoid 24-hour restriction
            procedure_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
            procedure_time = "10:00"
            
            procedure_data = {
                "student_name": "Gaurav Pandey",
                "patient_name": "Test Patient Phase2 Workflow Fix",
                "registration_number": f"REG-P2-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                "supervisor_id": self.dr_abhijit_id,
                "supervisor_name": "Dr. Abhijit Patil",
                "implant_incharge_id": self.dr_abhijit_id,  # Same person for auto-approve scenario
                "implant_incharge_name": "Dr. Abhijit Patil",
                "implant_site": "#16 (Upper Right First Molar)",
                "receipt_number": f"REC-P2-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
                "amount_paid": 50000.0,
                "procedure_date": procedure_date,
                "procedure_time": procedure_time,
                "implant_specifications": "Straumann Implant 4.1mm x 10mm - Phase 2 Test",
                "bone_graft_specifications": "Xenograft with Collagen Membrane - Phase 2 Test",
                "checklist": {
                    "pre_surgical": {
                        "items": [
                            {"id": "case_selection", "label": "Case Selection Approved", "value": True},
                            {"id": "academic_readiness", "label": "Academic Readiness", "value": True},
                            {"id": "hematological", "label": "Hematological Investigations", "value": True},
                            {"id": "radiographic", "label": "Radiographic Investigations", "value": True},
                            {"id": "instruments", "label": "Availability of Instruments", "value": True},
                            {"id": "treatment_plan", "label": "Approved Treatment & Prosthetic Plan", "value": True},
                            {"id": "payment", "label": "Full payment done", "value": True},
                            {"id": "medical_assessment", "label": "Medical assessment done", "value": True},
                            {"id": "realguide", "label": "RealGUIDE Planning and Report", "value": True},
                            {"id": "oral_prophylaxis", "label": "Oral Prophylaxis done", "value": True}
                        ],
                        "additional_fields": {}
                    }
                },
                "remark": "Phase 2 workflow test after fix - auto-approve scenario"
            }
            
            response = self.make_request("POST", "/procedures", token=self.student_token, json=procedure_data)
            
            if response.status_code == 200:
                procedure = response.json()
                self.procedure_id = procedure["id"]
                
                # Verify initial status
                if procedure["status"] == "pending_phase1":
                    self.log_test("Create Procedure", True, 
                                f"Procedure created successfully: ID={self.procedure_id}, Status={procedure['status']}, Dr. Abhijit as BOTH roles")
                    return True
                else:
                    self.log_test("Create Procedure", False, 
                                f"Procedure created but unexpected status: {procedure['status']}", 
                                {"expected": "pending_phase1", "actual": procedure["status"]})
                    return False
            else:
                self.log_test("Create Procedure", False, f"Failed to create procedure: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Create Procedure", False, f"Exception: {str(e)}")
            return False

    def test_dr_abhijit_login(self) -> bool:
        """Test Step 4: Login as Dr. Abhijit Patil"""
        try:
            response = self.make_request("POST", "/auth/login", json=DR_ABHIJIT_CREDENTIALS)
            
            if response.status_code == 200:
                data = response.json()
                self.dr_abhijit_token = data["token"]
                user_info = data["user"]
                
                if user_info["email"] == DR_ABHIJIT_CREDENTIALS["email"]:
                    self.log_test("Dr. Abhijit Login", True, f"Successfully logged in as {user_info['name']} ({user_info['role']})")
                    return True
                else:
                    self.log_test("Dr. Abhijit Login", False, "Login succeeded but user email incorrect", user_info)
                    return False
            else:
                self.log_test("Dr. Abhijit Login", False, f"Login failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Dr. Abhijit Login", False, f"Login exception: {str(e)}")
            return False

    def test_phase1_approval(self) -> bool:
        """Test Step 5: Approve Phase 1"""
        try:
            approval_data = {
                "action": "approve"
            }
            
            response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", 
                                       token=self.dr_abhijit_token, json=approval_data)
            
            if response.status_code == 200:
                procedure = response.json()
                
                # Check if both supervisor and implant incharge approvals are set (auto-approve scenario)
                supervisor_approved = procedure.get("supervisor_phase1_approved", False)
                implant_incharge_approved = procedure.get("implant_incharge_phase1_approved", False)
                status = procedure.get("status")
                
                if supervisor_approved and implant_incharge_approved and status == "phase1_approved":
                    self.log_test("Phase 1 Approval", True, 
                                f"Phase 1 auto-approved successfully: Status={status}, Both approvals=True")
                    return True
                else:
                    self.log_test("Phase 1 Approval", False, 
                                f"Phase 1 approval incomplete", 
                                {
                                    "status": status,
                                    "expected_status": "phase1_approved",
                                    "supervisor_approved": supervisor_approved,
                                    "implant_incharge_approved": implant_incharge_approved
                                })
                    return False
            else:
                self.log_test("Phase 1 Approval", False, f"Approval failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Phase 1 Approval", False, f"Exception: {str(e)}")
            return False

    def test_phase2_submission(self) -> bool:
        """Test Step 7: Submit Phase 2 with surgical checklist"""
        try:
            phase2_data = {
                "checklist_surgical": {
                    "items": [
                        {"id": "pre_op_vitals", "label": "Pre-operative vitals recorded", "value": True},
                        {"id": "anesthesia", "label": "Local anesthesia administered", "value": True},
                        {"id": "surgical_site", "label": "Surgical site prepared and draped", "value": True},
                        {"id": "incision", "label": "Proper incision made", "value": True},
                        {"id": "osteotomy", "label": "Osteotomy completed as per protocol", "value": True},
                        {"id": "implant_placement", "label": "Implant placed with proper torque", "value": True},
                        {"id": "bone_graft", "label": "Bone graft material applied if needed", "value": True},
                        {"id": "membrane", "label": "Membrane placed and secured", "value": True},
                        {"id": "suturing", "label": "Proper suturing completed", "value": True},
                        {"id": "post_op_instructions", "label": "Post-operative instructions given", "value": True}
                    ],
                    "additional_fields": {
                        "implant_stability": "Primary stability achieved",
                        "complications": "None observed",
                        "post_op_care": "Standard protocol followed"
                    }
                },
                "remark": "Phase 2 surgical checklist completed successfully after fix. All protocols followed."
            }
            
            response = self.make_request("POST", f"/procedures/{self.procedure_id}/submit-phase2", 
                                       token=self.student_token, json=phase2_data)
            
            if response.status_code == 200:
                procedure = response.json()
                
                if procedure["status"] == "pending_phase2" and procedure.get("current_phase") == 2:
                    self.log_test("Phase 2 Submission", True, 
                                f"Phase 2 submitted successfully: Status={procedure['status']}, Phase={procedure.get('current_phase')}")
                    return True
                else:
                    self.log_test("Phase 2 Submission", False, 
                                f"Phase 2 submission status issue", 
                                {
                                    "expected_status": "pending_phase2",
                                    "actual_status": procedure["status"],
                                    "expected_phase": 2,
                                    "actual_phase": procedure.get("current_phase")
                                })
                    return False
            else:
                self.log_test("Phase 2 Submission", False, f"Phase 2 submission failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Phase 2 Submission", False, f"Exception: {str(e)}")
            return False

    def test_phase2_approval(self) -> bool:
        """Test Step 9: Approve Phase 2"""
        try:
            approval_data = {
                "action": "approve"
            }
            
            response = self.make_request("POST", f"/procedures/{self.procedure_id}/approve", 
                                       token=self.dr_abhijit_token, json=approval_data)
            
            if response.status_code == 200:
                procedure = response.json()
                
                # Check if both Phase 2 approvals are set and final status is correct
                supervisor_approved = procedure.get("supervisor_phase2_approved", False)
                implant_incharge_approved = procedure.get("implant_incharge_phase2_approved", False)
                status = procedure.get("status")
                
                if supervisor_approved and implant_incharge_approved and status == "phase2_approved":
                    self.log_test("Phase 2 Approval", True, 
                                f"Phase 2 auto-approved successfully: Status={status}, Both approvals=True")
                    return True
                else:
                    self.log_test("Phase 2 Approval", False, 
                                f"Phase 2 approval incomplete", 
                                {
                                    "status": status,
                                    "expected_status": "phase2_approved",
                                    "supervisor_phase2_approved": supervisor_approved,
                                    "implant_incharge_phase2_approved": implant_incharge_approved
                                })
                    return False
            else:
                self.log_test("Phase 2 Approval", False, f"Phase 2 approval failed: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Phase 2 Approval", False, f"Exception: {str(e)}")
            return False

    def test_final_verification(self) -> bool:
        """Test Step 10: Verify final status is phase2_approved"""
        try:
            response = self.make_request("GET", f"/procedures/{self.procedure_id}", token=self.student_token)
            
            if response.status_code == 200:
                procedure = response.json()
                
                status = procedure.get("status")
                phase1_supervisor = procedure.get("supervisor_phase1_approved", False)
                phase1_implant = procedure.get("implant_incharge_phase1_approved", False)
                phase2_supervisor = procedure.get("supervisor_phase2_approved", False)
                phase2_implant = procedure.get("implant_incharge_phase2_approved", False)
                
                if (status == "phase2_approved" and phase1_supervisor and phase1_implant 
                    and phase2_supervisor and phase2_implant):
                    self.log_test("Final Verification", True, 
                                f"🎉 COMPLETE WORKFLOW SUCCESS! Final Status: {status} - All phases approved")
                    return True
                else:
                    self.log_test("Final Verification", False, 
                                f"Final verification failed", 
                                {
                                    "status": status,
                                    "expected_status": "phase2_approved",
                                    "phase1_supervisor_approved": phase1_supervisor,
                                    "phase1_implant_approved": phase1_implant,
                                    "phase2_supervisor_approved": phase2_supervisor,
                                    "phase2_implant_approved": phase2_implant
                                })
                    return False
            else:
                self.log_test("Final Verification", False, f"Failed to get procedure: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Final Verification", False, f"Exception: {str(e)}")
            return False

    def run_complete_phase2_workflow_test(self):
        """Execute the complete Phase 1 to Phase 2 workflow test"""
        print("🚀 STARTING COMPLETE PHASE 1 TO PHASE 2 WORKFLOW TEST AFTER FIX")
        print("=" * 80)
        print(f"🌐 API Base URL: {API_BASE_URL}")
        print(f"👤 Student: {STUDENT_CREDENTIALS['email']}")
        print(f"👨‍⚕️ Dr. Abhijit: {DR_ABHIJIT_CREDENTIALS['email']}")
        print("")
        
        test_steps = [
            ("Step 1: Student Login", self.test_student_login),
            ("Step 2: Get Users & Find Dr. Abhijit", self.test_get_users_and_find_dr_abhijit),
            ("Step 3: Create Procedure", self.test_create_procedure),
            ("Step 4: Dr. Abhijit Login", self.test_dr_abhijit_login),
            ("Step 5: Approve Phase 1", self.test_phase1_approval),
            ("Step 6: Re-login as Student", self.test_student_login),
            ("Step 7: Submit Phase 2", self.test_phase2_submission),
            ("Step 8: Re-login as Dr. Abhijit", self.test_dr_abhijit_login),
            ("Step 9: Approve Phase 2", self.test_phase2_approval),
            ("Step 10: Final Verification", self.test_final_verification)
        ]
        
        success_count = 0
        for step_name, test_method in test_steps:
            print(f"\n--- {step_name} ---")
            if test_method():
                success_count += 1
            else:
                print(f"❌ CRITICAL FAILURE at {step_name}")
                # Continue with remaining tests to gather full diagnostic info
                
        print("\n" + "=" * 80)
        print("🎯 PHASE 2 WORKFLOW TEST SUMMARY")
        print("=" * 80)
        
        if success_count == len(test_steps):
            print("🎉 ALL TESTS PASSED! Phase 2 workflow is working perfectly!")
            print(f"✅ Test Procedure ID: {self.procedure_id}")
            print("✅ Complete workflow: Phase 1 creation → Phase 1 approval → Phase 2 submission → Phase 2 approval → Final status: phase2_approved")
            workflow_success = True
        else:
            print(f"❌ WORKFLOW INCOMPLETE: {success_count}/{len(test_steps)} steps passed")
            
            if self.failed_tests:
                print(f"\n🔍 FAILED TESTS ANALYSIS:")
                for failed in self.failed_tests:
                    print(f"❌ {failed['test']}: {failed['message']}")
                    
            workflow_success = False
            
        print(f"\n📊 Detailed Test Results:")
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
            
        return workflow_success

def main():
    """Main test execution function"""
    print("🧪 DENTAL IMPLANT MANAGEMENT SYSTEM - BACKEND API TESTING")
    print("📋 Focus: Phase 2 Workflow Testing After Fix")
    print("🔧 Testing complete Phase 1 to Phase 2 workflow including submission and approval")
    print("")
    
    tester = Phase2WorkflowTester()
    
    # Execute the complete workflow test
    workflow_success = tester.run_complete_phase2_workflow_test()
    
    if workflow_success:
        print("\n🎊 PHASE 2 WORKFLOW TESTING COMPLETED SUCCESSFULLY!")
        print("🚀 Backend API Phase 2 submission and approval are working without errors!")
        return 0
    else:
        print("\n💥 PHASE 2 WORKFLOW TESTING FAILED!")
        print("🔧 Backend issues detected that require attention.")
        return 1

if __name__ == "__main__":
    exit(main())