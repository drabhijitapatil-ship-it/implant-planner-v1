"""iter-371 — Seed Global D prosthetic components into implant_catalog.

Updates the 3 existing Global D catalog docs (In-Kone Universal, 3.0 Implant,
twinkone 4) with the full component list published in the Feb-2026 Global D
prosthetics brochure.

Idempotent: overwrites the `components` array + `updated_at` on each run.
Safe to re-execute. Does NOT modify implant_library (SKU table for the
Suggest / Let Me Choose flows — those were seeded by iter-368).
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path("/app/backend").resolve()))
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from global_d_components import GLOBAL_D_COMPONENTS  # noqa: E402


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    coll = db.implant_catalog

    now = datetime.now(timezone.utc).isoformat()
    for sys_name, comps in GLOBAL_D_COMPONENTS.items():
        r = await coll.update_one(
            {"brand": "Global D", "name": sys_name},
            {"$set": {
                "components": comps,
                "updated_at": now,
                "updated_by": "seed_iter371",
            }},
        )
        print(f"Global D | {sys_name:<20} → matched={r.matched_count} modified={r.modified_count} components={len(comps)}")

    # Post-condition sanity check.
    for sys_name, expected_comps in GLOBAL_D_COMPONENTS.items():
        doc = await coll.find_one({"brand": "Global D", "name": sys_name})
        assert doc, f"Global D | {sys_name} document missing after upsert"
        actual = len(doc.get("components") or [])
        assert actual == len(expected_comps), (
            f"Global D | {sys_name}: expected {len(expected_comps)} components, got {actual}"
        )
    print("\n✓ All 3 Global D systems now expose the full component matrix.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
