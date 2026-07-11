"""
One-time migration script to backfill `is_admin` on existing users.

is_admin didn't exist before the department-workspace feature — every existing
org's founding user (the one created by /auth/signup) has no is_admin field,
which means _require_org_admin would lock them out of creating/editing
departments and assigning department incharges. This script sets is_admin=True
on the earliest-created user of each organization (their founder), and
is_admin=False + department_id=None explicitly on everyone else for clarity
(both already behave correctly as falsy/null when absent, but explicit fields
make the data self-describing for anyone querying the collection directly).
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def migrate():
    org_ids = await db.users.distinct("org_id", {"org_id": {"$exists": True, "$ne": None}})
    print(f"Found {len(org_ids)} organizations")

    admins_set = 0
    for org_id in org_ids:
        founder = await db.users.find_one(
            {"org_id": org_id, "is_admin": {"$exists": False}},
            sort=[("created_at", 1)],
        )
        if not founder:
            continue
        await db.users.update_one(
            {"_id": founder["_id"]},
            {"$set": {"is_admin": True, "department_id": None}},
        )
        admins_set += 1

    result = await db.users.update_many(
        {"is_admin": {"$exists": False}},
        {"$set": {"is_admin": False, "department_id": None}},
    )
    print(f"Set is_admin=True on {admins_set} org founders")
    print(f"Backfilled is_admin=False/department_id=None on {result.modified_count} remaining users")
    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
    client.close()
