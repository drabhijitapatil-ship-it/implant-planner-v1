"""
One-off script to provision a super_admin account (platform-wide access,
bypasses all per-organization data isolation). There is no API endpoint or
in-app UI that can create or grant this role — it exists only so this script
can create it directly in the database.

Run: python3 create_super_admin.py
"""
import asyncio
import getpass
import os
import re
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def main():
    print("=" * 60)
    print("Create a super_admin account (platform-wide access)")
    print("=" * 60)

    name = input("Full name: ").strip()
    while not name:
        name = input("Full name (required): ").strip()

    email = input("Email: ").strip().lower()
    while not EMAIL_RE.match(email):
        email = input("Valid email required: ").strip().lower()

    password = getpass.getpass("Password (min 8 chars, hidden): ")
    while len(password) < 8:
        password = getpass.getpass("Password too short — min 8 chars: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match. Aborting.")
        return

    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("role") != "super_admin":
            proceed = input(
                f"A user with this email already exists with role '{existing.get('role')}'. "
                f"Overwrite and promote to super_admin? [y/N]: "
            ).strip().lower()
            if proceed != "y":
                print("Aborted.")
                return
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "name": name,
                "password_hash": hash_password(password),
                "role": "super_admin",
            }, "$unset": {"org_id": ""}},
        )
        print(f"\nUpdated existing user {email} to super_admin.")
    else:
        await db.users.insert_one({
            "name": name,
            "email": email,
            "password_hash": hash_password(password),
            "role": "super_admin",
        })
        print(f"\nCreated super_admin account: {email}")

    print("This account has platform-wide access across every organization.")


if __name__ == "__main__":
    asyncio.run(main())
    client.close()
