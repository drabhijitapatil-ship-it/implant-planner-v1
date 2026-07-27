"""iter-386: seed Cowellmedi INNO X + INNO Submerged Short into implant_library
and implant_catalog. Idempotent — safe to re-run."""
import os, asyncio
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient

INNO_X_SIZES = (
    [(3.5, l) for l in (7, 8, 10, 12, 14)]
    + [(4.0, l) for l in (7, 8, 10, 12, 14, 16, 18)]
    + [(4.5, l) for l in (7, 8, 10, 12, 14, 16, 18)]
    + [(5.0, l) for l in (7, 8, 10, 12, 14)]
    + [(5.5, l) for l in (7, 8, 10, 12, 14)]
    + [(6.0, l) for l in (7, 8, 10, 12, 14)]
    + [(7.0, l) for l in (7, 8, 10, 12, 14)]
)
SHORT_SIZES = [(4.0, 4.0), (4.5, 4.0), (5.0, 4.0), (5.5, 4.0), (6.0, 4.0)]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    for system, sizes in (("INNO X", INNO_X_SIZES), ("INNO Submerged Short", SHORT_SIZES)):
        for d, l in sizes:
            await db.implant_library.update_one(
                {"brand": "Cowellmedi", "system": system, "diameter": float(d), "length": float(l)},
                {"$setOnInsert": {"source": "catalog_iter386"}},
                upsert=True,
            )
        n = await db.implant_library.count_documents({"brand": "Cowellmedi", "system": system})
        print(f"implant_library {system}: {n} sizes")

    base = await db.implant_catalog.find_one({"key": "Cowell Medi|INNO Submerged"})
    components = (base or {}).get("components", [])
    print("components copied from INNO Submerged:", len(components))

    catalog_docs = [
        {
            "key": "Cowell Medi|INNO X",
            "brand": "Cowell Medi",
            "name": "INNO X",
            "connection": {"type": "Morse-tapered Internal Hex (11\u00b0 taper / Hex 2.5) with Dual Contact"},
            "platform_switching": True,
            "features": [
                "HydroX7 surface treatment",
                "Indicated for Immediate and Delayed implant placement (D1-D4)",
                "Platform Neck for periosteum integration",
                "Geometry-matched fixture and drill (\u2265 5 mm initial depth engagement)",
                "Prosthetic platform shared with INNO Submerged (Hex 2.5)",
            ],
            "implant": {
                "diameters_mm": [3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0],
                "lengths_mm": [7, 8, 10, 12, 14, 16, 18],
                "bone_types": ["normal_bone", "hard_bone"],
                "healing_modes": ["submerged"],
            },
            "components": components,
        },
        {
            "key": "Cowell Medi|INNO Submerged Short",
            "brand": "Cowell Medi",
            "name": "INNO Submerged Short",
            "connection": {"type": "Internal Hex (Taper 11\u00b0 / Hex 2.5)"},
            "platform_switching": True,
            "features": [
                "Ultra-short 4 mm implant for restricted bone height",
                "SLA-SH surface treatment",
                "Interchangeable with Hexagonal Morse Tapered Fixture",
                "Platform identical to INNO Submerged (Hex 2.5) \u2014 same prosthetic components",
                "INNO Short KIT Ver.2 with 4 mm drill stopper",
                "Pre-Mount Fixture: 1 Fixture + 1 Cover Screw + 1 Mount",
            ],
            "implant": {
                "diameters_mm": [4.0, 4.5, 5.0, 5.5, 6.0],
                "lengths_mm": [4],
                "bone_types": ["normal_bone", "hard_bone"],
                "healing_modes": ["submerged"],
            },
            "components": components,
        },
    ]
    for doc in catalog_docs:
        await db.implant_catalog.update_one({"key": doc["key"]}, {"$set": doc}, upsert=True)
        print("implant_catalog upserted:", doc["key"])

asyncio.run(main())
