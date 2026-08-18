"""Idempotent migration script for Straumann BLT (iter-292, Feb 2026).

Three systems × per-Ø lengths = 67 implant_library rows total.
Old "BLT" stub rows from a prior import are deleted first to avoid
collisions with the new system names.
"""
import asyncio, datetime as dt, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from straumann_blt_data import BRAND, SYSTEM_SIZES, SYSTEM_META, INDICATIONS, components_for


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # iter-Feb-2026 (v5): Destructive legacy cleanup DISABLED on startup.
    # These delete_many calls were a one-off migration for iter-283; running
    # them on every deploy risks removing live data in a new environment.
    # They are now no-ops. Run manually via a migration script if needed.
    # deleted = await db.implant_library.delete_many({"brand": BRAND, "system": "BLT"})
    # if deleted.deleted_count:
    #     print(f"[implant_library] removed {deleted.deleted_count} legacy 'BLT' stub rows")
    # await db.implant_catalog.delete_one({"key": f"{BRAND}|BLT"})

    inserted = 0; skipped = 0
    for sys_name, sizes in SYSTEM_SIZES.items():
        for d, lengths in sizes.items():
            for L in lengths:
                key = {"brand": BRAND, "system": sys_name, "diameter": float(d), "length": float(L)}
                if await db.implant_library.find_one(key):
                    skipped += 1; continue
                await db.implant_library.insert_one(key)
                inserted += 1
    print(f"[implant_library] inserted={inserted}  skipped(existing)={skipped}")

    upserts = 0
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for sys_name, sizes in SYSTEM_SIZES.items():
        meta = SYSTEM_META[sys_name]
        all_lengths = sorted({ln for lns in sizes.values() for ln in lns})
        ind = INDICATIONS.get(f"{BRAND}|{sys_name}", {})
        doc = {
            "key": f"{BRAND}|{sys_name}",
            "brand": BRAND,
            "name": sys_name,
            "connection": "CrossFit",
            "platform_switching": True,
            "surface": meta["surface"],
            "material": meta["material"],
            "implant_category": "Bone Level",
            "implant_type": "Tapered",
            "prosthetic_platform": "SC/NC/RC",
            "features": [
                f"{meta['material']} alloy.",
                f"{meta['surface']}® surface treatment.",
                "Apically tapered self-cutting body (Bone Control Design™).",
                "Straumann CrossFit® connection — Small (SC) Ø2.9, Narrow (NC) Ø3.3, Regular (RC) Ø4.1/Ø4.8.",
            ],
            "indications": ind.get("indicated_procedures", []),
            "compatibility_notes": "BLT components are platform-specific (SC for Ø2.9, NC for Ø3.3, RC for Ø4.1/Ø4.8) and not interchangeable with the BLX TorcFit™ portfolio.",
            "implant": {
                "diameters_mm": [float(x) for x in sizes.keys()],
                "lengths_mm": [float(x) for x in all_lengths],
                "lengths_by_diameter_mm": {str(d): [float(x) for x in lns] for d, lns in sizes.items()},
                "bone_types": ind.get("indicated_bone_types", []),
                "healing_modes": ["one_stage", "two_stage"],
            },
            "components": components_for(sys_name),
            "platform": "RC",  # representative
            "drilling_protocol_family": "straumann_blt",
            "is_stub": False,
            "updated_at": now,
            "updated_by": "straumann_blt_seed",
        }
        await db.implant_catalog.update_one({"key": doc["key"]}, {"$set": doc}, upsert=True)
        upserts += 1
    print(f"[implant_catalog] upserted={upserts} system docs")

    distinct = await db.implant_library.distinct("system", {"brand": BRAND})
    print("\n=== Summary ===")
    for s in sorted(distinct):
        n = await db.implant_library.count_documents({"brand": BRAND, "system": s})
        print(f"  • {s}: {n} (diameter, length) rows")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
