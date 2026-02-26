import requests
import json

BASE_URL = "https://implant-mgmt-1.preview.emergentagent.com/api"

def create_user(name, email, password, role):
    data = {
        "name": name,
        "email": email,
        "password": password,
        "role": role
    }
    
    response = requests.post(f"{BASE_URL}/auth/register", json=data)
    if response.status_code == 200:
        print(f"✅ Created {role}: {name} ({email})")
        return True
    elif response.status_code == 400 and "already registered" in response.text:
        print(f"ℹ️  User already exists: {name} ({email})")
        return True
    else:
        print(f"❌ Failed to create {role}: {name} - {response.text}")
        return False

# Create test users
users = [
    ("Gaurav Pandey", "gaurav.pandey@student.dental.edu", "student123", "student"),
    ("Dr. Sarah Johnson", "sarah.johnson@dental.edu", "instructor123", "instructor"), 
    ("Dr. Michael Chen", "michael.chen@dental.edu", "instructor123", "instructor"),
    ("Dr. Abhijit Patil", "abhijit.patil@dental.edu", "admin123", "administrator"),
    ("Dr. Smith Admin", "smith.admin@dental.edu", "admin123", "administrator")
]

print("Creating test users...")
for name, email, password, role in users:
    create_user(name, email, password, role)
