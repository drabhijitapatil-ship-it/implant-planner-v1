#!/usr/bin/env python3

import requests
import json

BASE_URL = "https://drill-sequence.preview.emergentagent.com/api"

def test_nurse_restrictions():
    print("=== Debugging Nurse Role Restrictions ===")
    
    # Login as nurse
    nurse_login = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "nurse1@dental.edu",
        "password": "nurse123"
    })
    
    if nurse_login.status_code != 200:
        print(f"❌ Nurse login failed: {nurse_login.status_code} - {nurse_login.text}")
        return
        
    nurse_token = nurse_login.json()["token"]
    headers = {"Authorization": f"Bearer {nurse_token}"}
    
    print("✅ Nurse login successful")
    
    # Test 1: Try to create a procedure
    print("\n--- Test 1: Try to create procedure ---")
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
    
    create_response = requests.post(f"{BASE_URL}/procedures", json=procedure_data, headers=headers)
    print(f"Create procedure response: {create_response.status_code}")
    print(f"Response text: {create_response.text}")
    
    # Test 2: Try to approve a procedure  
    print("\n--- Test 2: Try to approve procedure ---")
    approve_response = requests.post(f"{BASE_URL}/procedures/some_id/approve", 
                                   json={"action": "approve"}, headers=headers)
    print(f"Approve procedure response: {approve_response.status_code}")
    print(f"Response text: {approve_response.text}")
    
    # Test 3: Try to edit a procedure
    print("\n--- Test 3: Try to edit procedure ---")
    edit_response = requests.put(f"{BASE_URL}/procedures/some_id", 
                               json={"patient_name": "Updated Name"}, headers=headers)
    print(f"Edit procedure response: {edit_response.status_code}")
    print(f"Response text: {edit_response.text}")
    
    # Test 4: Get procedures list
    print("\n--- Test 4: Get procedures list ---")
    get_response = requests.get(f"{BASE_URL}/procedures", headers=headers)
    print(f"Get procedures response: {get_response.status_code}")
    if get_response.status_code == 200:
        procedures = get_response.json()
        print(f"Number of procedures visible to nurse: {len(procedures)}")
        for proc in procedures:
            print(f"  - {proc['patient_name']} (Status: {proc['status']})")

if __name__ == "__main__":
    test_nurse_restrictions()