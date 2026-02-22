#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Dental Implant Management System
Tests all major workflows including user registration, authentication,
procedure creation, approval workflow, and notifications.
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://implant-workflow.preview.emergentagent.com/api"

# Global variables to store tokens and user info
tokens = {}
users = {}
procedures = {}

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{'='*60}")
    print(f"🧪 {test_name}")
    print('='*60)

def print_test_result(success, message):
    """Print formatted test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if not success:
        return False
    return True

def make_request(method, endpoint, data=None, headers=None, expected_status=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=headers, timeout=10)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=10)
        elif method.upper() == 'PUT':
            response = requests.put(url, json=data, headers=headers, timeout=10)
        elif method.upper() == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        print(f"📡 {method.upper()} {url}")
        print(f"   Status: {response.status_code}")
        
        if expected_status and response.status_code != expected_status:
            print(f"   Expected: {expected_status}, Got: {response.status_code}")
            try:
                print(f"   Response: {response.json()}")
            except:
                print(f"   Response: {response.text}")
            return None
            
        try:
            return response.json()
        except:
            return {"status_code": response.status_code, "text": response.text}
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        return None

def test_user_registration_and_authentication():
    """Test 1: User Registration and Authentication"""
    print_test_header("Test 1: User Registration and Authentication")
    
    success = True
    
    # Test data for different user roles
    test_users = [
        {
            "name": "Dr. Smith",
            "email": "implant.incharge@test.com",
            "password": "test123",
            "role": "implant_incharge"
        },
        {
            "name": "Dr. Johnson", 
            "email": "instructor@test.com",
            "password": "test123",
            "role": "instructor"
        },
        {
            "name": "John Doe",
            "email": "student@test.com", 
            "password": "test123",
            "role": "student"
        }
    ]
    
    # Register users
    for user_data in test_users:
        print(f"\n🔄 Registering {user_data['role']}: {user_data['name']}")
        
        response = make_request('POST', '/auth/register', user_data, expected_status=200)
        
        if response and 'id' in response:
            users[user_data['role']] = {
                'id': response['id'],
                'name': response['name'],
                'email': response['email'],
                'role': response['role'],
                'password': user_data['password']
            }
            success = print_test_result(True, f"Registered {user_data['role']} successfully")
        else:
            success = print_test_result(False, f"Failed to register {user_data['role']}")
            if response:
                print(f"   Error: {response}")
    
    # Test login with student credentials
    print(f"\n🔄 Testing login with student credentials")
    login_data = {
        "email": "student@test.com",
        "password": "test123"
    }
    
    response = make_request('POST', '/auth/login', login_data, expected_status=200)
    
    if response and 'token' in response:
        tokens['student'] = response['token']
        success = print_test_result(True, "Student login successful")
        print(f"   Token received: {response['token'][:50]}...")
        
        # Test /api/auth/me endpoint
        print(f"\n🔄 Testing /api/auth/me endpoint")
        headers = {"Authorization": f"Bearer {tokens['student']}"}
        
        me_response = make_request('GET', '/auth/me', headers=headers, expected_status=200)
        
        if me_response and me_response.get('role') == 'student':
            success = print_test_result(True, "Auth/me endpoint working correctly")
            print(f"   User info: {me_response['name']} ({me_response['role']})")
        else:
            success = print_test_result(False, "Auth/me endpoint failed")
    else:
        success = print_test_result(False, "Student login failed")
        if response:
            print(f"   Error: {response}")
    
    # Test /api/users endpoint
    print(f"\n🔄 Testing /api/users endpoint")
    if 'student' in tokens:
        headers = {"Authorization": f"Bearer {tokens['student']}"}
        users_response = make_request('GET', '/users', headers=headers, expected_status=200)
        
        if users_response and isinstance(users_response, list):
            success = print_test_result(True, f"Users endpoint returned {len(users_response)} users")
            for user in users_response:
                print(f"   - {user.get('name')} ({user.get('role')})")
        else:
            success = print_test_result(False, "Users endpoint failed")
    
    # Login other users to get their tokens
    for role in ['instructor', 'implant_incharge']:
        if role in users:
            print(f"\n🔄 Getting token for {role}")
            login_data = {
                "email": users[role]['email'],
                "password": users[role]['password']
            }
            
            response = make_request('POST', '/auth/login', login_data, expected_status=200)
            
            if response and 'token' in response:
                tokens[role] = response['token']
                success = print_test_result(True, f"{role} token obtained")
            else:
                success = print_test_result(False, f"Failed to get {role} token")
    
    return success

def test_procedure_creation():
    """Test 2: Procedure Creation (as Student)"""
    print_test_header("Test 2: Procedure Creation (as Student)")
    
    if 'student' not in tokens:
        return print_test_result(False, "Student token not available")
    
    success = True
    headers = {"Authorization": f"Bearer {tokens['student']}"}
    
    # Create procedure data
    procedure_data = {
        "student_name": users['student']['name'],
        "patient_name": "Test Patient",
        "registration_number": "REG123",
        "instructor_id": users['instructor']['id'],
        "instructor_name": users['instructor']['name'],
        "implant_incharge_id": users['implant_incharge']['id'],
        "implant_incharge_name": users['implant_incharge']['name'],
        "implant_site": "#16",
        "receipt_number": "REC001",
        "amount_paid": 50000,
        "procedure_date": "2025-03-15",
        "procedure_time": "10:00",
        "checklist": {
            "pre_surgical": {
                "items": [
                    {"label": "Medical history reviewed", "value": True},
                    {"label": "X-rays taken", "value": True},
                    {"label": "Consent signed", "value": False}
                ],
                "additional_fields": {
                    "notes": "Patient ready for procedure"
                }
            }
        },
        "implant_specifications": "Nobel Biocare Replace Select",
        "bone_graft_specifications": "Bio-Oss 0.5g",
        "remark": "Standard implant procedure"
    }
    
    print(f"\n🔄 Creating procedure for patient: {procedure_data['patient_name']}")
    
    response = make_request('POST', '/procedures', procedure_data, headers=headers, expected_status=200)
    
    if response and 'id' in response:
        procedures['test_procedure'] = response
        success = print_test_result(True, "Procedure created successfully")
        print(f"   Procedure ID: {response['id']}")
        print(f"   Status: {response['status']}")
        print(f"   Patient: {response['patient_name']}")
        
        # Verify status is pending_instructor
        if response['status'] == 'pending_instructor':
            success = print_test_result(True, "Procedure status is correctly set to 'pending_instructor'")
        else:
            success = print_test_result(False, f"Expected status 'pending_instructor', got '{response['status']}'")
    else:
        success = print_test_result(False, "Failed to create procedure")
        if response:
            print(f"   Error: {response}")
    
    return success

def test_get_procedures():
    """Test 3: Get Procedures"""
    print_test_header("Test 3: Get Procedures")
    
    if 'student' not in tokens:
        return print_test_result(False, "Student token not available")
    
    success = True
    headers = {"Authorization": f"Bearer {tokens['student']}"}
    
    # Get all procedures as student
    print(f"\n🔄 Getting all procedures as student")
    response = make_request('GET', '/procedures', headers=headers, expected_status=200)
    
    if response and isinstance(response, list):
        success = print_test_result(True, f"Retrieved {len(response)} procedures")
        for proc in response:
            print(f"   - {proc['patient_name']} ({proc['status']})")
    else:
        success = print_test_result(False, "Failed to get procedures")
    
    # Get procedures with status filter
    print(f"\n🔄 Getting procedures with status filter 'pending_instructor'")
    response = make_request('GET', '/procedures?status=pending_instructor', headers=headers, expected_status=200)
    
    if response and isinstance(response, list):
        success = print_test_result(True, f"Retrieved {len(response)} pending procedures")
    else:
        success = print_test_result(False, "Failed to get filtered procedures")
    
    # Get specific procedure by ID
    if 'test_procedure' in procedures:
        print(f"\n🔄 Getting specific procedure by ID")
        proc_id = procedures['test_procedure']['id']
        response = make_request('GET', f'/procedures/{proc_id}', headers=headers, expected_status=200)
        
        if response and response.get('id') == proc_id:
            success = print_test_result(True, "Retrieved specific procedure by ID")
            print(f"   Patient: {response['patient_name']}")
            print(f"   Status: {response['status']}")
        else:
            success = print_test_result(False, "Failed to get specific procedure")
    
    # Test dashboard stats endpoint
    print(f"\n🔄 Testing dashboard stats endpoint")
    response = make_request('GET', '/dashboard/stats', headers=headers, expected_status=200)
    
    if response and 'total' in response:
        success = print_test_result(True, "Dashboard stats retrieved successfully")
        print(f"   Total: {response['total']}, Pending: {response['pending']}")
        print(f"   Approved: {response['approved']}, Rejected: {response['rejected']}")
    else:
        success = print_test_result(False, "Failed to get dashboard stats")
    
    return success

def test_instructor_approval():
    """Test 4: Instructor Approval"""
    print_test_header("Test 4: Instructor Approval")
    
    if 'instructor' not in tokens:
        return print_test_result(False, "Instructor token not available")
    
    if 'test_procedure' not in procedures:
        return print_test_result(False, "No test procedure available for approval")
    
    success = True
    headers = {"Authorization": f"Bearer {tokens['instructor']}"}
    proc_id = procedures['test_procedure']['id']
    
    # Get notifications for instructor
    print(f"\n🔄 Getting notifications for instructor")
    response = make_request('GET', '/notifications', headers=headers, expected_status=200)
    
    if response and isinstance(response, list):
        success = print_test_result(True, f"Retrieved {len(response)} notifications")
        for notif in response:
            print(f"   - {notif['message'][:80]}...")
    else:
        success = print_test_result(False, "Failed to get instructor notifications")
    
    # Approve the procedure
    print(f"\n🔄 Approving procedure as instructor")
    approval_data = {
        "action": "approve"
    }
    
    response = make_request('POST', f'/procedures/{proc_id}/approve', approval_data, headers=headers, expected_status=200)
    
    if response and response.get('status') == 'pending_implant_incharge':
        success = print_test_result(True, "Instructor approval successful")
        print(f"   New status: {response['status']}")
        procedures['test_procedure'] = response  # Update procedure data
    else:
        success = print_test_result(False, "Instructor approval failed")
        if response:
            print(f"   Response: {response}")
    
    # Verify student receives notification
    print(f"\n🔄 Checking student notifications after instructor approval")
    student_headers = {"Authorization": f"Bearer {tokens['student']}"}
    response = make_request('GET', '/notifications', headers=student_headers, expected_status=200)
    
    if response and isinstance(response, list):
        instructor_approval_found = False
        for notif in response:
            if 'approved by instructor' in notif['message']:
                instructor_approval_found = True
                break
        
        if instructor_approval_found:
            success = print_test_result(True, "Student received instructor approval notification")
        else:
            success = print_test_result(False, "Student did not receive instructor approval notification")
    else:
        success = print_test_result(False, "Failed to get student notifications")
    
    return success

def test_implant_incharge_approval():
    """Test 5: Implant Incharge Approval"""
    print_test_header("Test 5: Implant Incharge Approval")
    
    if 'implant_incharge' not in tokens:
        return print_test_result(False, "Implant incharge token not available")
    
    if 'test_procedure' not in procedures:
        return print_test_result(False, "No test procedure available for approval")
    
    success = True
    headers = {"Authorization": f"Bearer {tokens['implant_incharge']}"}
    proc_id = procedures['test_procedure']['id']
    
    # Get notifications for implant incharge
    print(f"\n🔄 Getting notifications for implant incharge")
    response = make_request('GET', '/notifications', headers=headers, expected_status=200)
    
    if response and isinstance(response, list):
        success = print_test_result(True, f"Retrieved {len(response)} notifications")
        for notif in response:
            print(f"   - {notif['message'][:80]}...")
    else:
        success = print_test_result(False, "Failed to get implant incharge notifications")
    
    # Approve the procedure
    print(f"\n🔄 Giving final approval as implant incharge")
    approval_data = {
        "action": "approve"
    }
    
    response = make_request('POST', f'/procedures/{proc_id}/approve', approval_data, headers=headers, expected_status=200)
    
    if response and response.get('status') == 'approved':
        success = print_test_result(True, "Implant incharge approval successful")
        print(f"   Final status: {response['status']}")
        procedures['test_procedure'] = response  # Update procedure data
    else:
        success = print_test_result(False, "Implant incharge approval failed")
        if response:
            print(f"   Response: {response}")
    
    return success

def test_rejection_flow():
    """Test 6: Rejection Flow"""
    print_test_header("Test 6: Rejection Flow")
    
    if 'student' not in tokens or 'instructor' not in tokens:
        return print_test_result(False, "Required tokens not available")
    
    success = True
    
    # Create another procedure as student for rejection test
    print(f"\n🔄 Creating second procedure for rejection test")
    student_headers = {"Authorization": f"Bearer {tokens['student']}"}
    
    procedure_data = {
        "student_name": users['student']['name'],
        "patient_name": "Test Patient 2",
        "registration_number": "REG456",
        "instructor_id": users['instructor']['id'],
        "instructor_name": users['instructor']['name'],
        "implant_incharge_id": users['implant_incharge']['id'],
        "implant_incharge_name": users['implant_incharge']['name'],
        "implant_site": "#17",
        "receipt_number": "REC002",
        "amount_paid": 45000,
        "procedure_date": "2025-03-20",
        "procedure_time": "14:00",
        "checklist": {
            "pre_surgical": {
                "items": [
                    {"label": "Medical history reviewed", "value": False},
                    {"label": "X-rays taken", "value": True}
                ]
            }
        }
    }
    
    response = make_request('POST', '/procedures', procedure_data, headers=student_headers, expected_status=200)
    
    if response and 'id' in response:
        procedures['rejection_test'] = response
        success = print_test_result(True, "Second procedure created for rejection test")
        
        # Reject the procedure as instructor
        print(f"\n🔄 Rejecting procedure as instructor")
        instructor_headers = {"Authorization": f"Bearer {tokens['instructor']}"}
        rejection_data = {
            "action": "reject",
            "rejection_reason": "Incomplete medical history documentation"
        }
        
        proc_id = response['id']
        response = make_request('POST', f'/procedures/{proc_id}/approve', rejection_data, headers=instructor_headers, expected_status=200)
        
        if response and response.get('status') == 'rejected':
            success = print_test_result(True, "Procedure rejection successful")
            print(f"   Status: {response['status']}")
            print(f"   Reason: {response.get('rejection_reason')}")
        else:
            success = print_test_result(False, "Procedure rejection failed")
    else:
        success = print_test_result(False, "Failed to create second procedure")
    
    return success

def test_notifications():
    """Test 7: Notifications"""
    print_test_header("Test 7: Notifications")
    
    if 'student' not in tokens:
        return print_test_result(False, "Student token not available")
    
    success = True
    headers = {"Authorization": f"Bearer {tokens['student']}"}
    
    # Get notifications for student
    print(f"\n🔄 Getting all notifications for student")
    response = make_request('GET', '/notifications', headers=headers, expected_status=200)
    
    if response and isinstance(response, list):
        success = print_test_result(True, f"Retrieved {len(response)} notifications")
        
        notification_to_mark = None
        for notif in response:
            print(f"   - {notif['message'][:60]}... (Read: {notif['read']})")
            if not notif['read'] and not notification_to_mark:
                notification_to_mark = notif['id']
        
        # Mark a notification as read
        if notification_to_mark:
            print(f"\n🔄 Marking notification as read")
            response = make_request('PUT', f'/notifications/{notification_to_mark}/read', headers=headers, expected_status=200)
            
            if response and response.get('message'):
                success = print_test_result(True, "Notification marked as read")
            else:
                success = print_test_result(False, "Failed to mark notification as read")
        
        # Get unread count
        print(f"\n🔄 Getting unread notification count")
        response = make_request('GET', '/notifications/unread-count', headers=headers, expected_status=200)
        
        if response and 'count' in response:
            success = print_test_result(True, f"Unread count: {response['count']}")
        else:
            success = print_test_result(False, "Failed to get unread count")
            
    else:
        success = print_test_result(False, "Failed to get notifications")
    
    return success

def test_error_cases():
    """Test 8: Error Cases"""
    print_test_header("Test 8: Error Cases")
    
    success = True
    
    # Try to create procedure without authentication
    print(f"\n🔄 Testing procedure creation without authentication")
    procedure_data = {
        "patient_name": "Unauthorized Test",
        "registration_number": "UNAUTH001"
    }
    
    response = make_request('POST', '/procedures', procedure_data, expected_status=403)
    
    if response is None:  # Expected failure
        success = print_test_result(True, "Correctly blocked unauthenticated procedure creation")
    else:
        success = print_test_result(False, "Should have blocked unauthenticated access")
    
    # Try to approve procedure without proper role (student trying to approve)
    if 'student' in tokens and 'test_procedure' in procedures:
        print(f"\n🔄 Testing approval with wrong role (student)")
        headers = {"Authorization": f"Bearer {tokens['student']}"}
        approval_data = {"action": "approve"}
        proc_id = procedures['test_procedure']['id']
        
        response = make_request('POST', f'/procedures/{proc_id}/approve', approval_data, headers=headers, expected_status=403)
        
        if response is None:  # Expected failure
            success = print_test_result(True, "Correctly blocked unauthorized approval")
        else:
            success = print_test_result(False, "Should have blocked student from approving")
    
    # Try invalid login credentials
    print(f"\n🔄 Testing invalid login credentials")
    invalid_login = {
        "email": "invalid@test.com",
        "password": "wrongpassword"
    }
    
    response = make_request('POST', '/auth/login', invalid_login, expected_status=401)
    
    if response is None:  # Expected failure
        success = print_test_result(True, "Correctly rejected invalid credentials")
    else:
        success = print_test_result(False, "Should have rejected invalid credentials")
    
    # Try to access endpoint with invalid token
    print(f"\n🔄 Testing access with invalid token")
    invalid_headers = {"Authorization": "Bearer invalid_token_123"}
    
    response = make_request('GET', '/auth/me', headers=invalid_headers, expected_status=401)
    
    if response is None:  # Expected failure
        success = print_test_result(True, "Correctly rejected invalid token")
    else:
        success = print_test_result(False, "Should have rejected invalid token")
    
    return success

def run_all_tests():
    """Run all test suites"""
    print(f"\n🚀 Starting Comprehensive Backend API Tests")
    print(f"📍 Backend URL: {BASE_URL}")
    print(f"⏰ Started at: {datetime.now().isoformat()}")
    
    test_results = []
    
    try:
        # Run all test suites
        test_results.append(("User Registration & Auth", test_user_registration_and_authentication()))
        test_results.append(("Procedure Creation", test_procedure_creation()))
        test_results.append(("Get Procedures", test_get_procedures()))
        test_results.append(("Instructor Approval", test_instructor_approval()))
        test_results.append(("Implant Incharge Approval", test_implant_incharge_approval()))
        test_results.append(("Rejection Flow", test_rejection_flow()))
        test_results.append(("Notifications", test_notifications()))
        test_results.append(("Error Cases", test_error_cases()))
        
    except Exception as e:
        print(f"\n❌ Unexpected error during testing: {str(e)}")
        test_results.append(("Unexpected Error", False))
    
    # Print final summary
    print(f"\n{'='*60}")
    print("📊 FINAL TEST SUMMARY")
    print('='*60)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
    
    print(f"\n📈 Results: {passed}/{total} tests passed ({(passed/total*100):.1f}%)")
    
    if passed == total:
        print("🎉 All tests passed! Backend API is working correctly.")
        return True
    else:
        print(f"⚠️  {total - passed} test(s) failed. Please review the results above.")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)