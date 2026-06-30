"""
iter-295 seed: expand Adin Touareg-OS, Touareg-S, Swell, One implant_catalog
`components` from the generic 16-row RS stub to the full brochure-grade
per-SKU list (99 each for RS systems, 2 for One).

Idempotent: only updates `components` field; leaves other catalog fields alone.
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from adin_rs_components_expanded import expanded_components_for, SYSTEM_COMPONENTS


async def _seed() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    updated = 0
    skipped: List[str] = []
    for system_name in SYSTEM_COMPONENTS:
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
            "updated_by": "adin_rs_components_expanded:iter-295",
        }
        await db.implant_catalog.update_one({"key": key}, {"$set": update})
        updated += 1
        print(f"  ✔ {system_name:15s} → {len(comps)} components")
    if skipped:
        print(f"\n  ⚠ Skipped: {', '.join(skipped)}")
    print(f"\nSeeded {updated} Adin Touareg/Swell/One system(s).")
    client.close()


async def seed_if_thin() -> None:
    """Idempotent startup gate: re-seed only when live count < target."""
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    needs_seed = False
    for system_name in SYSTEM_COMPONENTS:
        key = f"Adin|{system_name}"
        existing = await db.implant_catalog.find_one({"key": key}, {"_id": 0, "components": 1})
        if not existing:
            continue
        live_count = len(existing.get("components") or [])
        target_count = len(expanded_components_for(system_name))
        if live_count < target_count:
            needs_seed = True; break
    client.close()
    if needs_seed:
        await _seed()


if __name__ == "__main__":
    asyncio.run(_seed())
