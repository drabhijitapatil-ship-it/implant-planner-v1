"""
iter-303 seed: add the Straumann NC (Ø 3.3 mm) brochure-grade prosthetic
catalogue to the 3 BLT implant systems (`BLT Roxolid SLActive`, `BLT
Roxolid SLA`, `BLT Ti SLA`), preserving the iter-301 SC entries.

Idempotent — drops only `platform == "NC"` rows before inserting the
fresh NC list.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from straumann_nc_components_expanded import (
    NC_COMPONENTS,
    SYSTEMS_USING_NC,
    expanded_nc_components_for,
)


def _merge_nc(existing: List[Dict], nc_components: List[Dict]) -> List[Dict]:
    """Strip any prior NC entries, then append the fresh NC list.
    SC and future RC entries are untouched."""
    keep = [c for c in (existing or []) if c.get("platform") != "NC"]
    return keep + nc_components


async def _seed() -> Dict[str, int]:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result: Dict[str, int] = {}
    for system_name in SYSTEMS_USING_NC:
        key = f"Straumann|{system_name}"
        existing_doc = await db.implant_catalog.find_one({"key": key})
        if not existing_doc:
            continue
        nc_list = expanded_nc_components_for(system_name)
        merged = _merge_nc(existing_doc.get("components", []), nc_list)
        await db.implant_catalog.update_one({"key": key}, {"$set": {
            "components": merged,
            "is_stub": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "straumann_nc_components_expanded:iter-303-NC",
        }})
        result[system_name] = len(merged)
        print(f"  ✔ {system_name:25s} → {len(merged)} total components "
              f"({len(nc_list)} NC)")
    print(f"\nSeeded NC components for {len(result)} BLT system(s).")
    client.close()
    return result


async def seed_if_thin() -> None:
    """Startup gate: only re-seed when NC count is below the current list."""
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    target = len(NC_COMPONENTS)
    needs = False
    for system_name in SYSTEMS_USING_NC:
        doc = await db.implant_catalog.find_one({"key": f"Straumann|{system_name}"})
        if not doc:
            continue
        present = sum(1 for c in doc.get("components", []) if c.get("platform") == "NC")
        if present < target:
            needs = True
            break
    client.close()
    if needs:
        await _seed()


if __name__ == "__main__":
    asyncio.run(_seed())
