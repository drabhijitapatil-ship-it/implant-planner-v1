"""
iter-294 seed: expand the Adin CloseFit implant_catalog `components` field
from the 13-row generic stub to the full brochure-grade per-SKU list
(30 UNP / 30 NP / 30 RP / 49 WP entries) from `adin_components_expanded`.

Idempotent: only updates the `components` field (and clears `is_stub`);
leaves other catalog fields untouched.
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from adin_components_expanded import expanded_components_for, SYSTEM_PLATFORM


async def _seed() -> None:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    updated = 0
    skipped: List[str] = []
    for system_name in SYSTEM_PLATFORM:
        key = f"Adin|{system_name}"
        existing = await db.implant_catalog.find_one({"key": key})
        if not existing:
            skipped.append(system_name); continue
        comps = expanded_components_for(system_name)
        if not comps:
            skipped.append(system_name); continue
        update: Dict[str, Any] = {
            "components": comps,
            "is_stub": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "adin_components_expanded:iter-294",
        }
        await db.implant_catalog.update_one({"key": key}, {"$set": update})
        updated += 1
        print(f"  ✔ {system_name:20s} → {len(comps)} components")
    if skipped:
        print(f"\n  ⚠ Skipped (not in catalog): {', '.join(skipped)}")
    print(f"\nSeeded {updated} Adin CloseFit system(s).")
    client.close()


async def seed_if_thin() -> None:
    """Idempotent startup gate: re-seed only when live count < target."""
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    needs_seed = False
    for system_name in SYSTEM_PLATFORM:
        key = f"Adin|{system_name}"
        existing = await db.implant_catalog.find_one({"key": key}, {"_id": 0, "components": 1})
        if not existing:
            continue
        live_count = len(existing.get("components") or [])
        target_count = len(expanded_components_for(system_name))
        if live_count < target_count:
            needs_seed = True
            break
    client.close()
    if needs_seed:
        await _seed()


if __name__ == "__main__":
    asyncio.run(_seed())
