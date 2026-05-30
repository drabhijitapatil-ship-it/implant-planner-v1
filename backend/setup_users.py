"""
Script to create/update all users for the Dental Implant Management App.
Run: python3 setup_users.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

ALL_USERS = [
    # Implant Incharge
    {"name": "Dr. Abhijit Patil", "email": "abhijit.patil@dental.edu", "password": "Admin@123", "role": "implant_incharge"},
    # Administrator
    {"name": "Dr. Ajay Sabane", "email": "ajay.sabane@dental.edu", "password": "Admin@123", "role": "administrator"},
    # Supervisors
    {"name": "Dr. Rajeshree Jadhav", "email": "rajeshree.jadhav@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
    {"name": "Dr. Vasantha N", "email": "vasantha.n@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
    {"name": "Dr. Rupali Patil", "email": "rupali.patil@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
    {"name": "Dr. Pankaj Kadam", "email": "pankaj.kadam@dental.edu", "password": "Supervisor@123", "role": "supervisor"},
    # Postgraduate Students
    {"name": "Dr. Gaurav Pandey", "email": "gaurav.pandey@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Anand Kurum", "email": "anand.kurum@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Manasi Dhiren", "email": "manasi.dhiren@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Atharva Mahadik", "email": "atharva.mahadik@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Vaibhav Deshpande", "email": "vaibhav.deshpande@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Yashica Jain", "email": "yashica.jain@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Renuka Bodakhe", "email": "renuka.bodakhe@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Shritej Sevakari", "email": "shritej.sevakari@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Aaditya Patil", "email": "aaditya.patil@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Kunal Parikh", "email": "kunal.parikh@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Krishana Mehta", "email": "krishana.mehta@student.dental.edu", "password": "Student@123", "role": "student"},
    {"name": "Dr. Sakshi Lohade", "email": "sakshi.lohade@student.dental.edu", "password": "Student@123", "role": "student"},
    # Nurses
    {"name": "Nurse 1", "email": "nurse1@dental.edu", "password": "Nurse@123", "role": "nurse"},
    {"name": "Nurse 2", "email": "nurse2@dental.edu", "password": "Nurse@123", "role": "nurse"},
]

# Old emails to clean up (duplicates from previous runs)
DUPLICATE_EMAILS = [
    "atharv.mahadik@student.dental.edu",
    "yashika.jain@student.dental.edu",
    "nurse1@dental.edu",
    "nurse2@dental.edu",
]

async def setup_users():
    # Step 1: Remove known duplicates
    print("Cleaning up duplicate/old entries...")
    for email in DUPLICATE_EMAILS:
        result = await db.users.delete_many({"email": email})
        if result.deleted_count > 0:
            print(f"  Removed {result.deleted_count} entry for {email}")

    # Step 2: Upsert all canonical users
    print("\nSetting up users...")
    for u in ALL_USERS:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            await db.users.update_one(
                {"email": u["email"]},
                {"$set": {
                    "name": u["name"],
                    "role": u["role"],
                    "password_hash": hash_password(u["password"]),
                }}
            )
            print(f"  Updated: {u['name']:30s} ({u['role']})")
        else:
            await db.users.insert_one({
                "name": u["name"],
                "email": u["email"],
                "password_hash": hash_password(u["password"]),
                "role": u["role"],
            })
            print(f"  Created: {u['name']:30s} ({u['role']})")

    # Print credential summary
    print("\n" + "=" * 72)
    print("LOGIN CREDENTIALS")
    print("=" * 72)
    roles = {}
    for u in ALL_USERS:
        roles.setdefault(u["role"], []).append(u)
    for role_name, label in [
        ("implant_incharge", "IMPLANT INCHARGE"),
        ("administrator", "ADMINISTRATOR"),
        ("supervisor", "SUPERVISORS"),
        ("student", "POSTGRADUATE STUDENTS"),
        ("nurse", "NURSES"),
    ]:
        print(f"\n{label}:")
        for u in roles.get(role_name, []):
            print(f"  {u['name']:30s} | {u['email']:40s} | {u['password']}")
    print("=" * 72)

if __name__ == "__main__":
    asyncio.run(setup_users())
    client.close()
