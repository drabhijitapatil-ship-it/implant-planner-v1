"""
One-time migration script to:
1. Rename all 'instructor' role users to 'supervisor'
2. Rename all instructor_* fields to supervisor_* in procedures collection
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
    # 1. Update user roles: instructor -> supervisor
    result = await db.users.update_many(
        {"role": "instructor"},
        {"$set": {"role": "supervisor"}}
    )
    print(f"Updated {result.modified_count} users from 'instructor' to 'supervisor'")

    # 2. Rename fields in procedures collection
    procedures = await db.procedures.find({}).to_list(None)
    updated = 0
    for proc in procedures:
        update_fields = {}
        unset_fields = {}

        # Rename instructor_id -> supervisor_id
        if "instructor_id" in proc and "supervisor_id" not in proc:
            update_fields["supervisor_id"] = proc["instructor_id"]
            unset_fields["instructor_id"] = ""
        
        # Rename instructor_name -> supervisor_name
        if "instructor_name" in proc and "supervisor_name" not in proc:
            update_fields["supervisor_name"] = proc["instructor_name"]
            unset_fields["instructor_name"] = ""

        # Rename phase1 approval fields
        if "instructor_phase1_approved" in proc:
            update_fields["supervisor_phase1_approved"] = proc["instructor_phase1_approved"]
            unset_fields["instructor_phase1_approved"] = ""
        
        if "instructor_phase1_approved_at" in proc:
            update_fields["supervisor_phase1_approved_at"] = proc["instructor_phase1_approved_at"]
            unset_fields["instructor_phase1_approved_at"] = ""

        # Rename phase2 approval fields
        if "instructor_phase2_approved" in proc:
            update_fields["supervisor_phase2_approved"] = proc["instructor_phase2_approved"]
            unset_fields["instructor_phase2_approved"] = ""
        
        if "instructor_phase2_approved_at" in proc:
            update_fields["supervisor_phase2_approved_at"] = proc["instructor_phase2_approved_at"]
            unset_fields["instructor_phase2_approved_at"] = ""

        if update_fields or unset_fields:
            ops = {}
            if update_fields:
                ops["$set"] = update_fields
            if unset_fields:
                ops["$unset"] = unset_fields
            await db.procedures.update_one({"_id": proc["_id"]}, ops)
            updated += 1
    
    print(f"Migrated {updated} procedure documents (instructor -> supervisor fields)")
    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
    client.close()
