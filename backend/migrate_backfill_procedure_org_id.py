"""
One-time migration script to backfill `org_id` (and reserve `department_id`)
directly onto existing procedure documents.

Procedures never stored org_id directly — membership was derived at read time
via reverse lookup through the linked student/supervisor/creator user (see
_org_scope_match / _assert_procedure_org_access in server.py). New procedures
now write org_id at creation time; this script fills in every pre-existing
row using the same reverse-lookup logic, so all procedures are consistent
going forward.

department_id is set to None for every row — no department entity exists yet.
Reserving the field now avoids a second migration once departments ship.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def migrate():
    procedures = await db.procedures.find(
        {"org_id": {"$exists": False}},
        {"student_id": 1, "supervisor_id": 1, "created_by_id": 1},
    ).to_list(None)
    print(f"Found {len(procedures)} procedures missing org_id")

    # Batch-resolve org_id for every linked user id in one query instead of
    # one find_one per procedure.
    owner_ids = set()
    for proc in procedures:
        for key in ("student_id", "supervisor_id", "created_by_id"):
            v = proc.get(key)
            if v and ObjectId.is_valid(v):
                owner_ids.add(v)

    user_org_map = {}
    if owner_ids:
        valid_oids = [ObjectId(o) for o in owner_ids]
        async for user in db.users.find(
            {"_id": {"$in": valid_oids}, "org_id": {"$exists": True, "$ne": None}},
            {"org_id": 1},
        ):
            user_org_map[str(user["_id"])] = user["org_id"]

    updated = 0
    unresolved = 0
    for proc in procedures:
        org_id = None
        for key in ("student_id", "supervisor_id", "created_by_id"):
            v = proc.get(key)
            if v in user_org_map:
                org_id = user_org_map[v]
                break
        await db.procedures.update_one(
            {"_id": proc["_id"]},
            {"$set": {"org_id": org_id, "department_id": None}},
        )
        if org_id:
            updated += 1
        else:
            unresolved += 1

    print(f"Backfilled org_id for {updated} procedures")
    print(f"{unresolved} procedures had no resolvable org_id (set to null — no linked user has an org)")
    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate())
    client.close()
