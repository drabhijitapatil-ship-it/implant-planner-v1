"""
Idempotent migration script for Alpha-Bio brochure data (iter-177).

Run:
    cd /app/backend && python3 _seed_alpha_bio_brochure.py

Behavior:
  • Inserts implant_library rows for the 6 brochure systems (NeO×3 / ICE /
    ATID / DFI / NICE). Skips any (brand, system, diameter, length) tuple
    that already exists — safe to re-run.
  • Upserts implant_catalog docs for those 6 systems plus a shared
    "Surgical & Prosthetic Instrumentation" doc.
  • Normalizes existing Alpha-Bio SPI catalog brand to "Alpha Bio" (used to
    be "Alpha-Bio Tec") so queries by brand are consistent.
"""
import asyncio
import datetime as dt
import os
import sys
from pathlib import Path

# Allow running both as a script and inside the FastAPI process
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

from alpha_bio_brochure_data import (
    SYSTEM_SIZES,
    SYSTEM_CATALOG,
    SYSTEM_PLATFORM,
    SURGICAL_KIT_DOC,
    components_for,
)

BRAND = "Alpha Bio"


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # ── 1. implant_library — insert per (brand, system, diameter, length) ──
    inserted_rows = 0
    skipped_rows = 0
    for system_name, sizes in SYSTEM_SIZES.items():
        for diameter, lengths in sizes["lengths_by_diameter"].items():
            for length in lengths:
                key = {
                    "brand": BRAND,
                    "system": system_name,
                    "diameter": float(diameter),
                    "length": float(length),
                }
                if await db.implant_library.find_one(key):
                    skipped_rows += 1
                    continue
                await db.implant_library.insert_one(key)
                inserted_rows += 1
    print(f"[implant_library] inserted={inserted_rows}  skipped(existing)={skipped_rows}")

    # ── 2. implant_catalog — upsert one rich doc per system ────────────────
    catalog_upserts = 0
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for system_name, meta in SYSTEM_CATALOG.items():
        sizes = SYSTEM_SIZES[system_name]
        # union of all lengths for this system
        all_lengths = sorted({
            ln for diam_lengths in sizes["lengths_by_diameter"].values()
            for ln in diam_lengths
        })
        doc = {
            "key": f"{BRAND}|{system_name}",
            "brand": BRAND,
            "name": system_name,
            "connection": meta["connection"],
            "platform_switching": meta.get("platform_switching", False),
            "surface": meta.get("surface"),
            "features": meta.get("features", []),
            "indications": meta.get("indications", []),
            "compatibility_notes": meta.get("compatibility_notes", ""),
            "implant": {
                "diameters_mm": [float(d) for d in sizes["diameters"]],
                "lengths_mm": [float(ln) for ln in all_lengths],
                "lengths_by_diameter_mm": {
                    str(d): [float(ln) for ln in lns]
                    for d, lns in sizes["lengths_by_diameter"].items()
                },
                "bone_types": ["soft", "medium", "hard"],
                "healing_modes": ["one_stage", "two_stage"],
            },
            "components": components_for(system_name),
            "platform": SYSTEM_PLATFORM[system_name],
            "drilling_protocol_family": "alpha_bio_brochure",
            "is_stub": False,
            "updated_at": now,
            "updated_by": "alpha_bio_brochure_seed",
        }
        await db.implant_catalog.update_one(
            {"key": doc["key"]}, {"$set": doc}, upsert=True
        )
        catalog_upserts += 1
    print(f"[implant_catalog] upserted={catalog_upserts} system docs")

    # ── 3. Shared instruments / kits doc ───────────────────────────────────
    inst_doc = dict(SURGICAL_KIT_DOC)  # shallow copy
    inst_doc["updated_at"] = now
    inst_doc["updated_by"] = "alpha_bio_brochure_seed"
    await db.implant_catalog.update_one(
        {"key": inst_doc["key"]}, {"$set": inst_doc}, upsert=True
    )
    print("[implant_catalog] upserted shared instruments doc")

    # ── 4. Normalize existing SPI catalog brand to 'Alpha Bio' ─────────────
    spi_existing = await db.implant_catalog.find_one(
        {"$or": [{"key": "Alpha-Bio Tec|SPI"}, {"key": "Alpha Bio|SPI"}]}
    )
    if spi_existing:
        update = {"brand": BRAND, "key": f"{BRAND}|SPI"}
        await db.implant_catalog.update_one(
            {"_id": spi_existing["_id"]}, {"$set": update}
        )
        # If BOTH old and new keys exist (re-run case), drop the old
        if spi_existing.get("key") == "Alpha-Bio Tec|SPI":
            dup = await db.implant_catalog.count_documents({"key": f"{BRAND}|SPI"})
            if dup > 1:
                # Keep the most-recently updated, drop the rest
                cursor = db.implant_catalog.find({"key": f"{BRAND}|SPI"}).sort("updated_at", -1)
                docs = await cursor.to_list(10)
                for d in docs[1:]:
                    await db.implant_catalog.delete_one({"_id": d["_id"]})
        print("[implant_catalog] normalized SPI brand to 'Alpha Bio'")
    else:
        print("[implant_catalog] (no existing SPI doc to normalize — skipped)")

    # ── 5. Final summary ───────────────────────────────────────────────────
    total_alpha = await db.implant_library.count_documents({"brand": BRAND})
    total_catalog = await db.implant_catalog.count_documents({"brand": BRAND})
    distinct_systems = await db.implant_library.distinct("system", {"brand": BRAND})
    print("\n=== Summary ===")
    print(f"Alpha Bio implant_library rows: {total_alpha}")
    print(f"Alpha Bio implant_catalog docs: {total_catalog}")
    print(f"Alpha Bio distinct systems: {len(distinct_systems)}")
    for s in sorted(distinct_systems):
        n = await db.implant_library.count_documents({"brand": BRAND, "system": s})
        print(f"  • {s}: {n} (diameter, length) rows")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
