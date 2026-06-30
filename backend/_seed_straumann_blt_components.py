"""
iter-301 seed: add the Straumann SC (Ø 2.9 mm) brochure-grade
prosthetic catalogue to the 3 BLT implant systems
(`BLT Roxolid SLActive`, `BLT Roxolid SLA`, `BLT Ti SLA`).

Behavior
────────
For each system:
  • Drops the existing thin 10-row stub *only* if it has no per-SKU
    `catalog_code` (i.e. has never been seeded with rich data).
  • Replaces any prior `platform == "SC"` entries with the iter-301
    list (idempotent on re-run).
  • Leaves NC / RC entries untouched so future NC/RC seeds can stack
    on top without overwriting each other.

Run standalone (writes once) or via the `seed_if_thin()` startup gate.
"""

import asyncio
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

from straumann_blt_components_expanded import (
    SC_COMPONENTS,
    SYSTEMS_USING_SC,
    expanded_sc_components_for,
)


def _merge_sc(existing: List[Dict], sc_components: List[Dict]) -> List[Dict]:
    """Drop legacy thin-stub rows + any prior SC entries, then append the
    fresh SC list. Preserves NC/RC entries verbatim."""
    keep: List[Dict] = []
    for c in existing or []:
        # Legacy stubs had no catalog_code AND no platform — drop them.
        if not c.get("catalog_code") and not c.get("platform"):
            continue
        if c.get("platform") == "SC":
            continue
        keep.append(c)
    return keep + sc_components


async def _seed() -> Dict[str, int]:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    result: Dict[str, int] = {}
    skipped: List[str] = []

    for system_name in SYSTEMS_USING_SC:
        key = f"Straumann|{system_name}"
        existing_doc = await db.implant_catalog.find_one({"key": key})
        if not existing_doc:
            skipped.append(system_name)
            continue

        sc_list = expanded_sc_components_for(system_name)
        merged = _merge_sc(existing_doc.get("components", []), sc_list)

        update: Dict[str, Any] = {
            "components": merged,
            "is_stub": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "straumann_blt_components_expanded:iter-301-SC",
        }
        await db.implant_catalog.update_one({"key": key}, {"$set": update})
        result[system_name] = len(merged)
        print(f"  ✔ {system_name:25s} → {len(merged)} total components "
              f"({len(sc_list)} SC)")

    if skipped:
        print(f"\n  ⚠ Skipped (not in catalog): {', '.join(skipped)}")
    print(f"\nSeeded SC components for {len(result)} BLT system(s).")
    client.close()
    return result


async def seed_if_thin() -> None:
    """Startup gate: only re-seed when a BLT system carries fewer
    SC entries than the current expanded list (idempotent)."""
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    target_count = len(SC_COMPONENTS)
    needs_seed = False
    for system_name in SYSTEMS_USING_SC:
        key = f"Straumann|{system_name}"
        doc = await db.implant_catalog.find_one({"key": key})
        if not doc:
            continue
        sc_present = sum(1 for c in doc.get("components", []) if c.get("platform") == "SC")
        if sc_present < target_count:
            needs_seed = True
            break
    client.close()
    if needs_seed:
        await _seed()


if __name__ == "__main__":
    asyncio.run(_seed())
