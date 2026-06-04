"""
Idempotent migration script for Straumann BLX Roxolid data (iter-283, Feb 2026).

Run:
    cd /app/backend && python3 _seed_straumann_blx.py

Behavior:
  • Inserts implant_library rows for the 4 BLX systems (RB×2 + WB×2 surfaces).
    Skips any (brand, system, diameter, length) tuple that already exists —
    safe to re-run.
  • Upserts implant_catalog docs for the 4 systems.

User-confirmed source of truth (iter-283 message):
  RB Platform Ø3.5 / 4.0 / 4.5 — 6/8/10/12/14/16/18
  WB Platform Ø5.0 / 5.5 / 6.0 — 6/8/10/12/14/16
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

from straumann_blx_data import (
    BRAND,
    SYSTEM_SIZES,
    SYSTEM_META,
    INDICATIONS,
    components_for,
)


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
    for system_name, sizes in SYSTEM_SIZES.items():
        meta = SYSTEM_META[system_name]
        all_lengths = sorted({
            ln for diam_lengths in sizes["lengths_by_diameter"].values()
            for ln in diam_lengths
        })
        ind = INDICATIONS.get(f"{BRAND}|{system_name}", {})
        doc = {
            "key": f"{BRAND}|{system_name}",
            "brand": BRAND,
            "name": system_name,
            "connection": "TorcFit",
            "platform_switching": True,
            "surface": meta["surface"],
            "material": meta["material"],
            "implant_category": "Bone Level",
            "implant_type": "Tapered",
            "prosthetic_platform": meta["platform"],
            "features": [
                "Roxolid® (TiZr) alloy — higher tensile strength than cpTi.",
                f"{meta['surface']}® surface treatment.",
                "Apically self-cutting threads (dynamic bone management).",
                "Straumann TorcFit™ 15° conical-cylindrical connection.",
            ],
            "indications": ind.get("indicated_procedures", []),
            "compatibility_notes": (
                "RB/WB abutments fit both RB and WB implants. WB-only "
                "abutments fit WB implants only."
            ),
            "implant": {
                "diameters_mm": [float(d) for d in sizes["diameters"]],
                "lengths_mm": [float(ln) for ln in all_lengths],
                "lengths_by_diameter_mm": {
                    str(d): [float(ln) for ln in lns]
                    for d, lns in sizes["lengths_by_diameter"].items()
                },
                "bone_types": ind.get("indicated_bone_types", []),
                "healing_modes": ["one_stage", "two_stage"],
            },
            "components": components_for(system_name),
            "platform": meta["platform"],
            "drilling_protocol_family": "straumann_blx",
            "is_stub": False,
            "updated_at": now,
            "updated_by": "straumann_blx_seed",
        }
        await db.implant_catalog.update_one(
            {"key": doc["key"]}, {"$set": doc}, upsert=True
        )
        catalog_upserts += 1
    print(f"[implant_catalog] upserted={catalog_upserts} system docs")

    # ── 3. Final summary ───────────────────────────────────────────────────
    total_blx = await db.implant_library.count_documents({"brand": BRAND})
    total_catalog = await db.implant_catalog.count_documents({"brand": BRAND})
    distinct_systems = await db.implant_library.distinct("system", {"brand": BRAND})
    print("\n=== Summary ===")
    print(f"Straumann implant_library rows: {total_blx}")
    print(f"Straumann implant_catalog docs: {total_catalog}")
    print(f"Straumann distinct systems: {len(distinct_systems)}")
    for s in sorted(distinct_systems):
        n = await db.implant_library.count_documents({"brand": BRAND, "system": s})
        print(f"  • {s}: {n} (diameter, length) rows")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
