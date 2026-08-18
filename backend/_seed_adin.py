"""
Idempotent migration script for Adin Implants data (iter-284, Feb 2026).

Run:
    cd /app/backend && python3 _seed_adin.py

Behavior:
  • Inserts implant_library rows for the 8 Adin systems (CloseFit family
    + Standard Internal Hex + One-piece). Skips any (brand, system,
    diameter, length) tuple that already exists — safe to re-run.
  • Upserts implant_catalog rich docs for the 8 systems.
"""
import asyncio
import datetime as dt
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient

from adin_data import (
    BRAND,
    SYSTEM_SIZES,
    SYSTEM_META,
    INDICATIONS,
    components_for,
)


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # iter-Feb-2026 (v5): Destructive legacy cleanups DISABLED on startup.
    # These delete_many calls were one-off migrations; running them on every
    # deploy risks removing live data in a new environment. They are now
    # no-ops. Run manually via a migration script if needed.
    # legacy_unp_8 = await db.implant_library.delete_many({
    #     "brand": BRAND, "system": "UNP CloseFit", "length": 8.0,
    # })
    # if legacy_unp_8.deleted_count:
    #     print(f"[implant_library] removed {legacy_unp_8.deleted_count} legacy UNP CloseFit L=8 row(s)")
    # legacy_touareg_os = await db.implant_library.delete_many({
    #     "brand": BRAND, "system": "Touareg-OS",
    #     "diameter": 3.5, "length": 6.25,
    # })
    # if legacy_touareg_os.deleted_count:
    #     print(f"[implant_library] removed {legacy_touareg_os.deleted_count} legacy Touareg-OS Ø3.5 L=6.25 row(s)")

    # ── 1. implant_library — one row per (Ø,L) per system ─────────────────
    inserted_rows = 0
    skipped_rows = 0
    for system_name, sizes in SYSTEM_SIZES.items():
        for diameter, lengths in sizes.items():
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

    # ── 2. implant_catalog — one rich doc per system ──────────────────────
    catalog_upserts = 0
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for system_name, sizes in SYSTEM_SIZES.items():
        meta = SYSTEM_META[system_name]
        all_lengths = sorted({ln for lns in sizes.values() for ln in lns})
        ind = INDICATIONS.get(f"{BRAND}|{system_name}", {})
        doc = {
            "key": f"{BRAND}|{system_name}",
            "brand": BRAND,
            "name": system_name,
            "connection": meta["connection"],
            "platform_switching": meta["family"] == "CloseFit",
            "surface": meta["surface"],
            "material": "Ti-6Al-4V ELI",
            "implant_category": (
                "One-Piece" if meta["family"] == "One"
                else "Bone Level"
            ),
            "implant_type": (
                "Straight Tapered" if system_name == "Swell"
                else "One-Piece Spiral" if meta["family"] == "One"
                else "Tapered Self-Tapping"
            ),
            "prosthetic_platform": meta["platform"],
            "features": [
                "Ti-6Al-4V ELI (Grade 23) alloy.",
                f"{meta['surface']}® surface treatment.",
                (
                    "Conical Hex / Morse-taper connection for platform "
                    "switching and minimized micro-movement."
                    if meta["connection"] == "Conical Hex"
                    else
                    "Standard Internal Hex connection."
                    if meta["connection"] == "Internal Hex"
                    else
                    "One-piece integrated abutment design for flapless surgery."
                ),
                (
                    "Bone-condensing macrodesign for immediate function "
                    "across all bone types."
                    if meta["family"] in ("Touareg", "CloseFit")
                    else
                    "V-shaped thread for accurate positioning and optimal "
                    "load distribution."
                    if system_name == "Swell"
                    else
                    "Tapered spiral body — minimally invasive narrow-ridge "
                    "indications."
                ),
            ],
            "indications": ind.get("indicated_procedures", []),
            "compatibility_notes": (
                "CloseFit prosthetic components are shared at the platform "
                "level (UNP / NP / RP / WP). Touareg-OS, Touareg-S and "
                "Swell share the RS Internal Hex prosthetic line."
            ),
            "implant": {
                "diameters_mm": [float(d) for d in sizes.keys()],
                "lengths_mm": [float(ln) for ln in all_lengths],
                "lengths_by_diameter_mm": {
                    str(d): [float(ln) for ln in lns]
                    for d, lns in sizes.items()
                },
                "bone_types": ind.get("indicated_bone_types", []),
                "healing_modes": ["one_stage", "two_stage"],
            },
            "components": components_for(system_name),
            "platform": meta["platform"],
            "drilling_protocol_family": "adin",
            "is_stub": False,
            "updated_at": now,
            "updated_by": "adin_seed",
        }
        await db.implant_catalog.update_one(
            {"key": doc["key"]}, {"$set": doc}, upsert=True
        )
        catalog_upserts += 1
    print(f"[implant_catalog] upserted={catalog_upserts} system docs")

    # ── 3. Summary ────────────────────────────────────────────────────────
    total_adin = await db.implant_library.count_documents({"brand": BRAND})
    total_catalog = await db.implant_catalog.count_documents({"brand": BRAND})
    distinct_systems = await db.implant_library.distinct("system", {"brand": BRAND})
    print("\n=== Summary ===")
    print(f"Adin implant_library rows: {total_adin}")
    print(f"Adin implant_catalog docs: {total_catalog}")
    print(f"Adin distinct systems: {len(distinct_systems)}")
    for s in sorted(distinct_systems):
        n = await db.implant_library.count_documents({"brand": BRAND, "system": s})
        print(f"  • {s}: {n} (diameter, length) rows")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
