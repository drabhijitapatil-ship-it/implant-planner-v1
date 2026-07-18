"""
iter-368 — Idempotent migration script for Global D implant systems.

Run once:
    cd /app/backend && python3 _seed_global_d.py

Adds three Global D systems (28 SKUs total) to the app.
  • In-Kone Universal — 22 SKUs (Ø3.5/4.0/4.5/5.0, lengths 6-15 mm)
  • 3.0 Implant     — 4 SKUs (Ø3.0, lengths 8.5-13 mm)
  • twinkone 4      — 2 SKUs (Ø4.0 & Ø4.5, both 4 mm ultra-short)

Populates:
  • db.implant_library   — one row per (brand, system, Ø, L) SKU
  • db.implant_catalog   — one rich brochure doc per system

Idempotent — safe to re-run; already-existing SKUs and catalog docs are
upserted (updated in place) rather than duplicated.
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


BRAND = "Global D"
COMPANY = {
    "company_id": "GD",
    "company_name": "Global D",
    "country": "France",
    "website": "https://www.globald.com",
}

SYSTEMS = [
    {
        "system": "In-Kone Universal",
        "system_id": "GD-IKU",
        "connection": "Internal Conical Connection",
        "connection_angle": "8° Morse Taper",
        "platform": "Universal",
        "implant_type": "Bone Level",
        "body_design": "Cylindro-Conical",
        "thread_design": "Double Self-Tapping Thread",
        "surface": "SA²",
        "material": "Titanium",
        "prosthetic_platform": "Universal",
        "surgical_kit": "Ultimate Surgical Kit / In-Kone Universal Surgical Kit",
        "clinical_indications": [
            "Single Tooth", "Multiple Unit", "Full Arch",
            "Immediate Placement", "Delayed Placement",
            "Healed Ridge", "Guided Surgery", "Freehand Surgery",
        ],
        "sizes": {
            3.5: [8.5, 10, 11.5, 13, 15],
            4.0: [6, 8.5, 10, 11.5, 13, 15],
            4.5: [6, 8.5, 10, 11.5, 13, 15],
            5.0: [6, 8.5, 10, 11.5, 13],
        },
    },
    {
        "system": "3.0 Implant",
        "system_id": "GD-3I",
        "connection": "Internal Conical Connection",
        "connection_angle": "5° Morse Taper",
        "platform": "3.0 Dedicated",
        "implant_type": "Bone Level",
        "body_design": "Cylindrical",
        "thread_design": "Self-Tapping",
        "surface": "SA²",
        "material": "Titanium",
        "prosthetic_platform": "Dedicated 3.0",
        "surgical_kit": "3.0 Implant Surgical Kit",
        "clinical_indications": [
            "Maxillary Lateral Incisor", "Mandibular Incisor",
            "Narrow Ridge", "Limited Mesio-distal Space",
        ],
        "sizes": {
            3.0: [8.5, 10, 11.5, 13],
        },
    },
    {
        "system": "twinkone 4",
        "system_id": "GD-TWK4",
        "connection": "External Conical Connection",
        "connection_angle": "",
        "platform": "Dedicated",
        "implant_type": "Ultra Short Implant",
        "body_design": "Ultra Short Cylindrical",
        "thread_design": "Self-Tapping",
        "surface": "SA²",
        "material": "Titanium",
        "prosthetic_platform": "Dedicated",
        "surgical_kit": "twinkone 4 Surgical Kit",
        "clinical_indications": [
            "Posterior Maxilla", "Posterior Mandible",
            "Severely Resorbed Ridge",
            "Avoid Sinus Lift", "Avoid Inferior Alveolar Nerve",
        ],
        "sizes": {
            4.0: [4],
            4.5: [4],
        },
    },
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # ── 1. implant_library — one row per (Ø, L) per system ────────────────
    inserted_rows = 0
    skipped_rows = 0
    for sys_def in SYSTEMS:
        for diameter, lengths in sys_def["sizes"].items():
            for length in lengths:
                key = {
                    "brand": BRAND,
                    "system": sys_def["system"],
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
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    catalog_upserts = 0
    for sys_def in SYSTEMS:
        sizes = sys_def["sizes"]
        all_lengths = sorted({ln for lns in sizes.values() for ln in lns})
        doc = {
            "key": f"{BRAND}|{sys_def['system']}",
            "brand": BRAND,
            "company": COMPANY,
            "name": sys_def["system"],
            "system_id": sys_def["system_id"],
            "connection": sys_def["connection"],
            "connection_angle": sys_def["connection_angle"],
            "platform": sys_def["platform"],
            "implant_type": sys_def["implant_type"],
            "body_design": sys_def["body_design"],
            "thread_design": sys_def["thread_design"],
            "surface": sys_def["surface"],
            "material": sys_def["material"],
            "prosthetic_platform": sys_def["prosthetic_platform"],
            "surgical_kit": sys_def["surgical_kit"],
            "clinical_indications": sys_def["clinical_indications"],
            "diameters": sorted(sizes.keys()),
            "lengths": all_lengths,
            "size_grid": [
                {"diameter": d, "lengths": sorted(sizes[d])}
                for d in sorted(sizes.keys())
            ],
            "updated_at": now,
        }
        await db.implant_catalog.update_one(
            {"key": doc["key"]}, {"$set": doc}, upsert=True,
        )
        catalog_upserts += 1
    print(f"[implant_catalog] upserted={catalog_upserts} system docs")

    # ── 3. Verify totals ──────────────────────────────────────────────────
    total_lib = await db.implant_library.count_documents({"brand": BRAND})
    total_cat = await db.implant_catalog.count_documents({"brand": BRAND})
    print(f"Global D implant_library rows: {total_lib}  |  implant_catalog docs: {total_cat}")


if __name__ == "__main__":
    asyncio.run(main())
