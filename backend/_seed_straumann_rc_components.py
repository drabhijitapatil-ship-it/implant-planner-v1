"""
iter-304 seed: add the Straumann RC (Ø 4.1 / Ø 4.8 mm) brochure-grade
prosthetic catalog to the 3 BLT implant systems, preserving the iter-301
SC and iter-303 NC entries.

Idempotent — drops only `platform == "RC"` rows before inserting fresh.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from straumann_rc_components_expanded import (
    RC_COMPONENTS,
    SYSTEMS_USING_RC,
    expanded_rc_components_for,
)


def _merge_rc(existing: List[Dict], rc_components: List[Dict]) -> List[Dict]:
    """Strip any prior RC entries, then append the fresh RC list.
    SC and NC entries are preserved."""
    keep = [c for c in (existing or []) if c.get("platform") != "RC"]
    return keep + rc_components


async def _seed() -> Dict[str, int]:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result: Dict[str, int] = {}
    for system_name in SYSTEMS_USING_RC:
        key = f"Straumann|{system_name}"
        existing_doc = await db.implant_catalog.find_one({"key": key})
        if not existing_doc:
            continue
        rc_list = expanded_rc_components_for(system_name)
        merged = _merge_rc(existing_doc.get("components", []), rc_list)
        await db.implant_catalog.update_one({"key": key}, {"$set": {
            "components": merged,
            "is_stub": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "straumann_rc_components_expanded:iter-304-RC",
        }})
        result[system_name] = len(merged)
        print(f"  ✔ {system_name:25s} → {len(merged)} total components "
              f"({len(rc_list)} RC)")
    print(f"\nSeeded RC components for {len(result)} BLT system(s).")
    client.close()
    return result


async def seed_if_thin() -> None:
    """Startup gate: only re-seed when RC count is below the current list."""
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    target = len(RC_COMPONENTS)
    needs = False
    for system_name in SYSTEMS_USING_RC:
        doc = await db.implant_catalog.find_one({"key": f"Straumann|{system_name}"})
        if not doc:
            continue
        present = sum(1 for c in doc.get("components", []) if c.get("platform") == "RC")
        if present < target:
            needs = True
            break
    client.close()
    if needs:
        await _seed()


if __name__ == "__main__":
    asyncio.run(_seed())
