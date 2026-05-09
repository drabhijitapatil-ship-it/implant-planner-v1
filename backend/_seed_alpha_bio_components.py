"""
iter-205 seed: expand Alpha-Bio system component lists from the thin per-platform
template (12-13 entries) to the brochure-grade subtype list (~30-40 entries
per system), so each system shows the same depth as Neodent / Nobel / MIS.

Idempotent: only updates the `components` field (and clears `is_stub`); leaves
`features`, `indications`, `compatibility_notes`, `connection`, `platform`,
etc. untouched.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from alpha_bio_components_expanded import expanded_components_for, SYSTEM_PLATFORM


async def _seed() -> None:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    updated = 0
    skipped: List[str] = []

    for system_name in SYSTEM_PLATFORM:
        key = f"Alpha Bio|{system_name}"
        existing = await db.implant_catalog.find_one({"key": key})
        if not existing:
            skipped.append(system_name)
            continue
        comps = expanded_components_for(system_name)
        if not comps:
            skipped.append(system_name)
            continue
        update: Dict[str, Any] = {
            "components": comps,
            "is_stub": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "alpha_bio_components_expanded:iter-205",
        }
        await db.implant_catalog.update_one({"key": key}, {"$set": update})
        updated += 1
        print(f"  ✔ {system_name:40s} → {len(comps)} components")

    if skipped:
        print(f"\n  ⚠ Skipped (not in catalog): {', '.join(skipped)}")
    print(f"\nSeeded {updated} Alpha-Bio system(s).")
    client.close()


async def seed_if_thin() -> None:
    """
    Idempotent gate used at backend startup: only re-seed when the live
    `implant_catalog` row has fewer components than the brochure-grade
    expansion. Avoids spurious writes on every restart.
    """
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    needs_seed = False
    for system_name in SYSTEM_PLATFORM:
        key = f"Alpha Bio|{system_name}"
        existing = await db.implant_catalog.find_one(
            {"key": key}, {"_id": 0, "components": 1}
        )
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
