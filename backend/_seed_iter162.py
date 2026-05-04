"""iter-162 — DEPRECATED standalone seeder.

The rich Cowellmedi / MIS LANCE+ / Osstem prosthetic data has been promoted
into `iter162_catalog.py` and is now applied automatically by
`implant_catalog_seed.py` on every backend startup.

This file is kept only as an emergency one-shot DB injector — running it
directly will overwrite the same records the startup seeder produces, with
identical content. There is no need to run it manually anymore.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import sys


async def _main() -> None:
    # Reuse the canonical seed pipeline so we never drift from the live data.
    sys.path.insert(0, os.path.dirname(__file__))
    from implant_catalog_seed import (
        ANKYLOS_CX, OSSTEM_TSIII, MIS_LANCE_PLUS,
        BIOHORIZONS_TAPERED_PRO, BIOHORIZONS_TAPERED_PRO_CONICAL,
        CONELOG_PROGRESSIVE, ALPHABIO_SPI, CATALOG_EXTRA,
    )
    from datetime import datetime, timezone

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    now = datetime.now(timezone.utc).isoformat()

    curated = (
        ANKYLOS_CX, OSSTEM_TSIII, MIS_LANCE_PLUS,
        BIOHORIZONS_TAPERED_PRO, BIOHORIZONS_TAPERED_PRO_CONICAL,
        CONELOG_PROGRESSIVE, ALPHABIO_SPI,
        *CATALOG_EXTRA,
    )
    for rec in curated:
        await db.implant_catalog.update_one(
            {"key": rec["key"]},
            {"$set": {**rec, "is_stub": False, "updated_at": now, "updated_by": "seed"}},
            upsert=True,
        )
        print(f"  {rec['key']}: {len(rec.get('components') or [])} components")
    client.close()


if __name__ == "__main__":
    asyncio.run(_main())
