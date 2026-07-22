"""iter-372 — Seed Bredent copaSKY revision (Feb 2026).

Idempotent seed that:
  1. Replaces the 3 legacy Bredent | Copa Sky rows in `implant_library`
     with the full 24-SKU matrix from the revised brochure.
  2. Upserts the Bredent | Copa Sky `implant_catalog` doc with the universal
     45-component prosthetic matrix (Ti-Base, uni.cone, TiSi.snap +
     retention.sil inserts, etc.).

Backend restart still handled by supervisor — run this script, then
`sudo supervisorctl restart backend`.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from copa_sky_revision import COPA_SKY_SKUS, COPA_SKY_COMPONENTS  # noqa: E402


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # ── 1. implant_library ─────────────────────────────────────────
    lib = db.implant_library
    r_del = await lib.delete_many({"brand": "Bredent", "system": "Copa Sky"})
    r_ins = await lib.insert_many(COPA_SKY_SKUS)
    print(f"[implant_library] deleted={r_del.deleted_count}  inserted={len(r_ins.inserted_ids)}")

    # Sanity
    cnt = await lib.count_documents({"brand": "Bredent", "system": "Copa Sky"})
    assert cnt == 24, f"expected 24 rows, got {cnt}"

    # ── 2. implant_catalog components ──────────────────────────────
    cat = db.implant_catalog
    now = datetime.now(timezone.utc).isoformat()
    # Delete any duplicate we may have created in a previous mis-seed run.
    dedupe = await cat.delete_many({
        "brand": "Bredent", "name": "Copa Sky",
        "key": {"$in": [None]},
    })
    if dedupe.deleted_count:
        print(f"[implant_catalog] deleted {dedupe.deleted_count} orphan Copa Sky doc(s)")
    # The canonical Bredent copaSKY doc uses `key='Bredent|Copa Sky'` and
    # `name='copaSKY'` (mixed-case brand style). Match on the stable key.
    r = await cat.update_one(
        {"key": "Bredent|Copa Sky"},
        {"$set": {
            "components": COPA_SKY_COMPONENTS,
            "diameters": sorted({s["diameter"] for s in COPA_SKY_SKUS}),
            "lengths": sorted({s["length"] for s in COPA_SKY_SKUS}),
            "connection": "Torx / Conical (universal platform)",
            "material": "Titanium",
            "surface": "Machined neck + etched transition + blasted-etched body",
            "updated_at": now,
            "updated_by": "seed_iter372",
        }},
    )
    print(f"[implant_catalog] matched={r.matched_count}  modified={r.modified_count}")
    print(f"[implant_catalog] components seeded: {len(COPA_SKY_COMPONENTS)}")

    client.close()
    print("\n✓ Bredent copaSKY revision seeded.")


if __name__ == "__main__":
    asyncio.run(main())
