"""Shared helper for research tests: hard-delete a test study and everything attached to it
(the API only deletes drafts; archived test studies would otherwise pile up and break
`enrolled[0]` style assertions)."""
import asyncio
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


def purge_study(study_id: str):
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _run():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "test_database")]
        for c in ("research_enrolments", "research_patient_values", "research_screening", "research_reminders", "research_queries"):
            await db[c].delete_many({"study_id": study_id})
        await db.notifications.delete_many({"research_study_id": study_id})
        await db.research_studies.delete_one({"_id": __import__("bson").ObjectId(study_id)})

    asyncio.run(_run())
