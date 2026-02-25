#!/usr/bin/env python3

"""
Phase 1 to Phase 2 Workflow Testing Script for Dental Implant Management System
Testing the complete workflow as requested in the review.
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import time

# Configuration
BASE_URL = "https://implant-workflow-1.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Test credentials from the review request
STUDENT_CREDENTIALS = {
    "email": "gaurav.pandey@student.dental.edu",
    "password": "Student@123"
}

ADMIN_CREDENTIALS = {
    "email": "abhijit.patil@dental.edu", 
    "password": "Admin@123"
}

class PhaseWorkflowTester:
    def __init__(self):
        self.student_token = None
        self.admin_token = None
        self.users = []
        self.dr_abhijit_id = None
        self.procedure_id = None
        self.test_results = []
        self.failed_tests = []
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def login_user(self, credentials, role_name):
        """Login and return token"""
        self.log(f"🔐 Logging in {role_name}...")
        response = requests.post(f"{BASE_URL}/auth/login", json=credentials, headers=HEADERS)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to login {role_name}: {response.status_code} - {response.text}")
            return None
            
        data = response.json()
        token = data.get("token")
        user_info = data.get("user", {})
        
        self.log(f"✅ Successfully logged in {role_name}: {user_info.get('name', 'Unknown')} ({user_info.get('email', 'Unknown')})")
        return token
        
    def get_users(self, token):
        """Get all users to find Dr. Abhijit Patil's ID"""
        self.log("👥 Getting user list...")
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
                # Print user details for verification
                self.log(f"   Name: {user.get('name')}, Email: {user.get('email')}, Role: {user.get('role')}")
                break
                
        if not self.dr_abhijit_id:
            self.log("❌ Dr. Abhijit Patil not found in user list")
            
        return users
        
    def create_procedure(self):
        """Step 1: Create a new procedure as a student"""
        self.log("\n📋 STEP 1: Create a new procedure as a student")
        
        if not self.student_token or not self.dr_abhijit_id:
            self.log("❌ Cannot create procedure - missing student token or Dr. Abhijit ID")
            self.failed_tests.append("Step 1: Missing prerequisites")
            return False
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        
        # Create procedure date at least 2 days from now
        procedure_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        procedure_data = {
            "student_name": "Gaurav Pandey",
            "patient_name": "John Doe - Phase Workflow Test",
            "registration_number": "REG-PHASE-001",
            "supervisor_id": self.dr_abhijit_id,
            "supervisor_name": "Dr. Abhijit Patil",
            "implant_incharge_id": self.dr_abhijit_id,  # Same person as supervisor
            "implant_incharge_name": "Dr. Abhijit Patil",  # Same person as supervisor
            "implant_site": "#46 (Lower Right Second Premolar)",
            "receipt_number": "REC-PHASE-001",
            "amount_paid": 75000.0,
            "procedure_date": procedure_date,
            "procedure_time": "10:00",
            "implant_specifications": "Straumann BLT Implant 4.1mm x 10mm with SLA surface",
            "bone_graft_specifications": "Bio-Oss Xenograft 0.5g with Bio-Gide Membrane 25x25mm"
        }
        
        self.log(f"Creating procedure for patient: {procedure_data['patient_name']}")
        self.log(f"Procedure date: {procedure_date} at {procedure_data['procedure_time']}")
        self.log(f"Dr. Abhijit Patil assigned as BOTH Supervisor AND Implant Incharge")
        
        response = requests.post(f"{BASE_URL}/procedures", json=procedure_data, headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to create procedure: {response.status_code} - {response.text}")
            self.failed_tests.append("Step 1: Procedure creation failed")
            return False
            
        created_procedure = response.json()
        self.procedure_id = created_procedure.get("id") or created_procedure.get("_id")
        status = created_procedure.get("status")
        
        self.log(f"✅ Procedure created successfully!")
        self.log(f"   Procedure ID: {self.procedure_id}")
        self.log(f"   Status: {status}")
        
        if status == "pending_phase1":
            self.log("✅ Procedure status correctly set to 'pending_phase1'")
            self.test_results.append("✅ Procedure created with status 'pending_phase1'")
            return True
        else:
            self.log(f"❌ Expected status 'pending_phase1', got '{status}'")
            self.failed_tests.append("Step 1: Wrong initial status")
            return False
        
    def approve_phase1(self):
        """Step 2: Approve Phase 1 as Dr. Abhijit Patil"""
        self.log("\n✅ STEP 2: Approve Phase 1 as Dr. Abhijit Patil")
        
        if not self.admin_token or not self.procedure_id:
            self.log("❌ Cannot approve Phase 1 - missing admin token or procedure ID")
            self.failed_tests.append("Step 2: Missing prerequisites")
            return False
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.admin_token}"}
        
        approval_data = {
            "action": "approve",
            "comments": "Phase 1 approved - all pre-surgical requirements met"
        }
        
        self.log("Approving Phase 1...")
        response = requests.post(f"{BASE_URL}/procedures/{self.procedure_id}/approve", 
                               json=approval_data, headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to approve Phase 1: {response.status_code} - {response.text}")
            self.failed_tests.append("Step 2: Phase 1 approval failed")
            return False
            
        updated_procedure = response.json()
        status = updated_procedure.get("status")
        supervisor_approved = updated_procedure.get("supervisor_phase1_approved", False)
        implant_incharge_approved = updated_procedure.get("implant_incharge_phase1_approved", False)
        
        self.log(f"✅ Phase 1 approval completed!")
        self.log(f"   New status: {status}")
        self.log(f"   supervisor_phase1_approved: {supervisor_approved}")
        self.log(f"   implant_incharge_phase1_approved: {implant_incharge_approved}")
        
        # Verify auto-approve functionality (same person is both roles)
        if supervisor_approved and implant_incharge_approved and status == "phase1_approved":
            self.log("✅ Auto-approve working correctly - both approval flags set to TRUE")
            self.log("✅ Status correctly changed to 'phase1_approved'")
            self.test_results.append("✅ Phase 1 auto-approved (same person is both supervisor and implant incharge)")
            self.test_results.append("✅ Status changed to 'phase1_approved'")
            return True
        else:
            self.log("❌ Auto-approve not working correctly")
            self.failed_tests.append("Step 2: Auto-approve functionality failed")
            return False
        
    def verify_phase2_activated(self):
        """Step 3: Verify Phase 2 is activated"""
        self.log("\n🔍 STEP 3: Verify Phase 2 is activated")
        
        if not self.student_token or not self.procedure_id:
            self.log("❌ Cannot verify Phase 2 - missing student token or procedure ID")
            self.failed_tests.append("Step 3: Missing prerequisites")
            return False
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        
        self.log("Getting procedure details to verify Phase 2 activation...")
        response = requests.get(f"{BASE_URL}/procedures/{self.procedure_id}", headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to get procedure details: {response.status_code} - {response.text}")
            self.failed_tests.append("Step 3: Could not retrieve procedure details")
            return False
            
        procedure = response.json()
        status = procedure.get("status")
        supervisor_approved = procedure.get("supervisor_phase1_approved", False)
        implant_incharge_approved = procedure.get("implant_incharge_phase1_approved", False)
        
        self.log(f"Verification results:")
        self.log(f"   Status: {status}")
        self.log(f"   supervisor_phase1_approved: {supervisor_approved}")
        self.log(f"   implant_incharge_phase1_approved: {implant_incharge_approved}")
        
        if status == "phase1_approved" and supervisor_approved and implant_incharge_approved:
            self.log("✅ Phase 2 is now activated (Phase 1 fully approved)")
            self.test_results.append("✅ Phase 2 activated after Phase 1 approval")
            return True
        else:
            self.log("❌ Phase 2 not properly activated")
            self.failed_tests.append("Step 3: Phase 2 not activated")
            return False
        
    def submit_phase2(self):
        """Step 4: Submit Phase 2 as student"""
        self.log("\n📤 STEP 4: Submit Phase 2 as student")
        
        if not self.student_token or not self.procedure_id:
            self.log("❌ Cannot submit Phase 2 - missing student token or procedure ID")
            self.failed_tests.append("Step 4: Missing prerequisites")
            return False
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.student_token}"}
        
        # Phase 2 checklist data (surgical checklist)
        phase2_data = {
            "checklist": {
                "surgical": [
                    {"id": "s1", "label": "Pre-operative antiseptic rinse completed", "value": "yes"},
                    {"id": "s2", "label": "Local anesthesia administered", "value": "yes"},
                    {"id": "s3", "label": "Surgical site prepared and draped", "value": "yes"},
                    {"id": "s4", "label": "Incision and flap reflection completed", "value": "yes"},
                    {"id": "s5", "label": "Implant site preparation (drilling) completed", "value": "yes"},
                    {"id": "s6", "label": "Implant placement completed", "value": "yes"},
                    {"id": "s7", "label": "Bone graft/membrane placement (if applicable)", "value": "yes"},
                    {"id": "s8", "label": "Closure and suturing completed", "value": "yes"},
                    {"id": "s9", "label": "Post-operative instructions given", "value": "yes"},
                    {"id": "s10", "label": "Patient vitals stable", "value": "yes"}
                ]
            },
            "surgical_notes": "Implant placement completed successfully. No complications during surgery. Patient tolerated procedure well. Bone quality was adequate for primary stability.",
            "complications": "None",
            "next_appointment": (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
        }
        
        self.log("Submitting Phase 2 with surgical checklist...")
        self.log(f"Surgical checklist items: {len(phase2_data['checklist']['surgical'])}")
        
        response = requests.post(f"{BASE_URL}/procedures/{self.procedure_id}/submit-phase2", 
                               json=phase2_data, headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to submit Phase 2: {response.status_code} - {response.text}")
            self.failed_tests.append("Step 4: Phase 2 submission failed")
            return False
            
        updated_procedure = response.json()
        status = updated_procedure.get("status")
        
        self.log(f"✅ Phase 2 submitted successfully!")
        self.log(f"   New status: {status}")
        
        if status == "pending_phase2":
            self.log("✅ Status correctly changed to 'pending_phase2'")
            self.test_results.append("✅ Phase 2 submitted with surgical checklist")
            self.test_results.append("✅ Status changed to 'pending_phase2'")
            return True
        else:
            self.log(f"❌ Expected status 'pending_phase2', got '{status}'")
            self.failed_tests.append("Step 4: Wrong status after Phase 2 submission")
            return False
        
    def approve_phase2(self):
        """Step 5: Approve Phase 2 as Dr. Abhijit Patil"""
        self.log("\n✅ STEP 5: Approve Phase 2 as Dr. Abhijit Patil")
        
        if not self.admin_token or not self.procedure_id:
            self.log("❌ Cannot approve Phase 2 - missing admin token or procedure ID")
            self.failed_tests.append("Step 5: Missing prerequisites")
            return False
            
        headers = {**HEADERS, "Authorization": f"Bearer {self.admin_token}"}
        
        approval_data = {
            "action": "approve",
            "comments": "Phase 2 approved - surgical procedure completed successfully, implant placement satisfactory"
        }
        
        self.log("Approving Phase 2...")
        response = requests.post(f"{BASE_URL}/procedures/{self.procedure_id}/approve-phase2", 
                               json=approval_data, headers=headers)
        
        if response.status_code != 200:
            self.log(f"❌ Failed to approve Phase 2: {response.status_code} - {response.text}")
            self.failed_tests.append("Step 5: Phase 2 approval failed")
            return False
            
        updated_procedure = response.json()
        status = updated_procedure.get("status")
        instructor_approved = updated_procedure.get("instructor_phase2_approved", False)
        implant_incharge_approved = updated_procedure.get("implant_incharge_phase2_approved", False)
        
        self.log(f"✅ Phase 2 approval completed!")
        self.log(f"   Final status: {status}")
        self.log(f"   instructor_phase2_approved: {instructor_approved}")
        self.log(f"   implant_incharge_phase2_approved: {implant_incharge_approved}")
        
        if status == "phase2_approved":
            self.log("✅ Procedure completed successfully - Stage 1 Implant Placement Done!")
            self.test_results.append("✅ Phase 2 approved successfully")
            self.test_results.append("✅ Final status: 'phase2_approved' (Stage 1 Implant Placement Done)")
            return True
        else:
            self.log(f"❌ Expected final status 'phase2_approved', got '{status}'")
            self.failed_tests.append("Step 5: Wrong final status")
            return False
        
    def run_complete_workflow(self):
        """Run the complete Phase 1 to Phase 2 workflow"""
        self.log("🚀 Starting Complete Phase 1 to Phase 2 Workflow Test...")
        self.log(f"Base URL: {BASE_URL}")
        self.log(f"Testing complete workflow as requested in review")
        
        # Login users
        self.student_token = self.login_user(STUDENT_CREDENTIALS, "Student")
        if not self.student_token:
            self.log("❌ Cannot proceed without student login")
            return
            
        self.admin_token = self.login_user(ADMIN_CREDENTIALS, "Administrator (Dr. Abhijit Patil)")
        if not self.admin_token:
            self.log("❌ Cannot proceed without administrator login")
            return
            
        # Get users to find Dr. Abhijit Patil's ID
        self.users = self.get_users(self.student_token)
        if not self.dr_abhijit_id:
            self.log("❌ Cannot proceed without Dr. Abhijit Patil's ID")
            return
            
        # Run the complete workflow
        success = True
        success &= self.create_procedure()
        success &= self.approve_phase1()
        success &= self.verify_phase2_activated()
        success &= self.submit_phase2()
        success &= self.approve_phase2()
        
        # Print final results
        self.print_final_results(success)
        
    def print_final_results(self, workflow_success):
        """Print final test results"""
        self.log("\n" + "="*80)
        self.log("🏁 PHASE 1 TO PHASE 2 WORKFLOW TEST RESULTS")
        self.log("="*80)
        
        if workflow_success and not self.failed_tests:
            self.log("\n🎉 COMPLETE WORKFLOW SUCCESS!")
            self.log("✅ All 5 steps of Phase 1 to Phase 2 workflow completed successfully")
            
        if self.test_results:
            self.log("\n✅ SUCCESSFUL STEPS:")
            for i, result in enumerate(self.test_results, 1):
                self.log(f"  {i}. {result}")
                
        if self.failed_tests:
            self.log("\n❌ FAILED STEPS:")
            for i, failure in enumerate(self.failed_tests, 1):
                self.log(f"  {i}. {failure}")
                
        total_steps = 5  # Fixed number of workflow steps
        if self.procedure_id:
            self.log(f"\n📋 TEST PROCEDURE ID: {self.procedure_id}")
            self.log(f"   You can verify this procedure in the system")
            
        passed_steps = total_steps - len(self.failed_tests)
        self.log(f"\nWORKFLOW SUMMARY: {passed_steps}/{total_steps} steps completed successfully")
        
        if workflow_success:
            self.log("\n🎯 PHASE 2 WORKFLOW IS WORKING CORRECTLY!")
            self.log("   ✓ Student can create procedures with Dr. Abhijit as both roles")
            self.log("   ✓ Auto-approve works when same person is supervisor AND implant incharge")
            self.log("   ✓ Phase 2 becomes available after Phase 1 approval")
            self.log("   ✓ Phase 2 submission with surgical checklist works")
            self.log("   ✓ Phase 2 approval completes the workflow (phase2_approved)")
        else:
            self.log("\n⚠️  PHASE 2 WORKFLOW HAS ISSUES - SEE FAILED STEPS ABOVE")

if __name__ == "__main__":
    tester = PhaseWorkflowTester()
    tester.run_complete_workflow()