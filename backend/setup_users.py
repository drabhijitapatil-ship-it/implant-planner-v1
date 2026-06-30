"""
Script to create/update all users for the Dental Implant Management App.
Run: python3 setup_users.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

ALL_USERS = [
    # Implant Incharge
    {"name": "Dr. Abhijit Patil", "email": "Abhijit.patil@dental.edu", "password": "Admin@123", "role": "implant_incharge"},
]

async def setup_users():
    # Step 1: Remove all other entries
    print("Cleaning up all other users except Dr. Abhijit Patil...")
    result = await db.users.delete_many({"email": {"$not": {"$regex": "^abhijit\\.patil@dental\\.edu$", "$options": "i"}}})
    print(f"  Removed {result.deleted_count} other users.")

    # Step 2: Upsert all canonical users
    print("\nSetting up users...")
    for u in ALL_USERS:
        existing = await db.users.find_one({"email": {"$regex": "^abhijit\\.patil@dental\\.edu$", "$options": "i"}})
        if existing:
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "name": u["name"],
                    "email": u["email"],
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
    ]:
        print(f"\n{label}:")
        for u in roles.get(role_name, []):
            print(f"  {u['name']:30s} | {u['email']:40s} | {u['password']}")
    print("=" * 72)

if __name__ == "__main__":
    asyncio.run(setup_users())
    client.close()
