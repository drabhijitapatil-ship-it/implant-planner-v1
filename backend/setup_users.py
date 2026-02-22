"""
Script to create pre-populated faculty and student users
Run this once to set up the initial users
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

async def create_users():
    # Faculty members
    faculty = [
        {
            "name": "Dr. Abhijit Patil",
            "email": "abhijit.patil@dental.edu",
            "password": "dental123",  # Change this password after first login
            "role": "administrator"  # Implant Incharge, Supervisor and Administrator
        },
        {
            "name": "Dr. Ajay Sabane",
            "email": "ajay.sabane@dental.edu",
            "password": "dental123",
            "role": "administrator"  # Implant Incharge, Supervisor and Administrator
        },
        {
            "name": "Dr. Rajeshree Jadhav",
            "email": "rajeshree.jadhav@dental.edu",
            "password": "dental123",
            "role": "administrator"  # Implant Incharge, Supervisor and Administrator
        },
        {
            "name": "Dr. Vasantha N",
            "email": "vasantha.n@dental.edu",
            "password": "dental123",
            "role": "instructor"  # Supervisor
        },
        {
            "name": "Dr. Rupali Patil",
            "email": "rupali.patil@dental.edu",
            "password": "dental123",
            "role": "instructor"  # Supervisor
        },
        {
            "name": "Dr. Pankaj Kadam",
            "email": "pankaj.kadam@dental.edu",
            "password": "dental123",
            "role": "instructor"  # Supervisor
        },
    ]
    
    # Postgraduate students
    students = [
        {"name": "Gaurav Pandey", "email": "gaurav.pandey@student.dental.edu", "password": "student123"},
        {"name": "Anand Kurum", "email": "anand.kurum@student.dental.edu", "password": "student123"},
        {"name": "Manasi Dhiren", "email": "manasi.dhiren@student.dental.edu", "password": "student123"},
        {"name": "Atharv Mahadik", "email": "atharv.mahadik@student.dental.edu", "password": "student123"},
        {"name": "Vaibhav Deshpande", "email": "vaibhav.deshpande@student.dental.edu", "password": "student123"},
        {"name": "Yashika Jain", "email": "yashika.jain@student.dental.edu", "password": "student123"},
    ]
    
    print("Creating faculty members...")
    for fac in faculty:
        existing = await db.users.find_one({"email": fac["email"]})
        if existing:
            print(f"  ✓ {fac['name']} already exists")
        else:
            await db.users.insert_one({
                "name": fac["name"],
                "email": fac["email"],
                "password_hash": hash_password(fac["password"]),
                "role": fac["role"]
            })
            print(f"  ✓ Created {fac['name']} ({fac['role']})")
    
    print("\nCreating students...")
    for student in students:
        existing = await db.users.find_one({"email": student["email"]})
        if existing:
            print(f"  ✓ {student['name']} already exists")
        else:
            await db.users.insert_one({
                "name": student["name"],
                "email": student["email"],
                "password_hash": hash_password(student["password"]),
                "role": "student"
            })
            print(f"  ✓ Created {student['name']}")
    
    print("\n✅ User setup complete!")
    print("\nLogin credentials:")
    print("=" * 60)
    print("\nFACULTY (Administrators):")
    print("  - abhijit.patil@dental.edu / dental123")
    print("  - ajay.sabane@dental.edu / dental123")
    print("  - rajeshree.jadhav@dental.edu / dental123")
    print("\nFACULTY (Supervisors/Instructors):")
    print("  - vasantha.n@dental.edu / dental123")
    print("  - rupali.patil@dental.edu / dental123")
    print("  - pankaj.kadam@dental.edu / dental123")
    print("\nSTUDENTS:")
    print("  - gaurav.pandey@student.dental.edu / student123")
    print("  - anand.kurum@student.dental.edu / student123")
    print("  - manasi.dhiren@student.dental.edu / student123")
    print("  - atharv.mahadik@student.dental.edu / student123")
    print("  - vaibhav.deshpande@student.dental.edu / student123")
    print("  - yashika.jain@student.dental.edu / student123")
    print("=" * 60)
    print("\n⚠️  IMPORTANT: Change these passwords after first login!")

if __name__ == "__main__":
    asyncio.run(create_users())
    client.close()
