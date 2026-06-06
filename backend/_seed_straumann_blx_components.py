"""
iter-293 seed: expand the Straumann BLX implant_catalog `components` field
from the 10-row thin per-platform stub to the full brochure-grade per-SKU
list (135 RB, 68 WB entries) extracted from the BLX Prosthetic Components
Catalogue PDF.

Idempotent: only updates the `components` field (and clears `is_stub`);
leaves `features`, `indications`, `compatibility_notes`, `connection`,
`platform`, etc. untouched.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from straumann_blx_components_expanded import expanded_components_for, SYSTEM_PLATFORM


async def _seed() -> None:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    updated = 0
    skipped: List[str] = []

    for system_name in SYSTEM_PLATFORM:
        key = f"Straumann|{system_name}"
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
            "updated_by": "straumann_blx_components_expanded:iter-293",
        }
        await db.implant_catalog.update_one({"key": key}, {"$set": update})
        updated += 1
        print(f"  ✔ {system_name:50s} → {len(comps)} components")

    if skipped:
        print(f"\n  ⚠ Skipped (not in catalog): {', '.join(skipped)}")
    print(f"\nSeeded {updated} Straumann BLX system(s).")
    client.close()


async def seed_if_thin() -> None:
    """Idempotent startup gate: only re-seed when the live `implant_catalog`
    row has fewer components than the brochure-grade expansion. Avoids spurious
    writes on every restart.
    """
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    needs_seed = False
    for system_name in SYSTEM_PLATFORM:
        key = f"Straumann|{system_name}"
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
