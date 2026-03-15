import requests
import json

BASE_URL = "https://prosth-case-album.preview.emergentagent.com/api"

# Login as student first to get access
student_login = requests.post(f"{BASE_URL}/auth/login", json={
    "email": "gaurav.pandey@student.dental.edu",
    "password": "student123"
})

if student_login.status_code == 200:
    token = student_login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get all instructors
    instructors = requests.get(f"{BASE_URL}/users?role=instructor", headers=headers)
    if instructors.status_code == 200:
        print("=== INSTRUCTORS ===")
        for instructor in instructors.json():
            print(f"- {instructor['name']} ({instructor['email']}) - ID: {instructor['id']}")
    
    # Get all administrators
    administrators = requests.get(f"{BASE_URL}/users?role=administrator", headers=headers)
    if administrators.status_code == 200:
        print("\n=== ADMINISTRATORS ===")
        for admin in administrators.json():
            print(f"- {admin['name']} ({admin['email']}) - ID: {admin['id']}")
    
    # Test login for some specific users we created
    test_logins = [
        ("sarah.johnson@dental.edu", "instructor123"),
        ("michael.chen@dental.edu", "instructor123"),
        ("abhijit.patil@dental.edu", "admin123"),
        ("smith.admin@dental.edu", "admin123"),
    ]
    
    print("\n=== TESTING LOGINS ===")
    for email, password in test_logins:
        login_test = requests.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        status = "✅" if login_test.status_code == 200 else "❌"
        print(f"{status} {email} with password '{password}' - Status: {login_test.status_code}")

