"""
Seed implant_library from updated XLSX (v2).
Format: Column 0 = "Brand System" combined, Column 1 = Diameter, Column 2 = Length
"""
import asyncio
import os
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

XLSX_PATH = os.path.join(os.path.dirname(__file__), "implant_library_updated_v2.xlsx")

# Known brand prefixes (order matters: longer matches first)
BRAND_PREFIXES = [
    "Noble Biocare",
    "Nobel Biocare",
    "Dentsply Sirona",
    "Zimmer Biomet",
    "Blue Sky Bio",
    "B&B Dental",
    "Alpha Bio",
    "Cowellmedi",
    "BioHorizons",
    "NeoBiotech",
    "Straumann",
    "Neodent",
    "Bredent",
    "Megagen",
    "Dentium",
    "Camlog",
    "Osstem",
    "MIS",
]


def split_brand_system(combined: str):
    combined = combined.strip()
    # Fix known typos
    if combined.startswith("OsstemSS"):
        combined = "Osstem SS" + combined[8:]
    if combined.startswith("Noble Biocare NobelParallel RP "):
        # Fix extra space in row 46
        combined = "Noble Biocare NobelParallel RP"

    for brand in BRAND_PREFIXES:
        if combined.startswith(brand + " "):
            system = combined[len(brand):].strip()
            return brand, system
        if combined == brand:
            return brand, ""

    # Fallback: first word is brand
    parts = combined.split(" ", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def parse_xlsx():
    df = pd.read_excel(XLSX_PATH, header=None, skiprows=1)
    df.columns = ["combined", "diameter", "length"]

    # Drop rows with missing numeric data
    df = df.dropna(subset=["diameter", "length"])
    df["diameter"] = pd.to_numeric(df["diameter"], errors="coerce")
    df["length"] = pd.to_numeric(df["length"], errors="coerce")
    df = df.dropna(subset=["diameter", "length"])
    df["diameter"] = df["diameter"].round(2)
    df["length"] = df["length"].round(2)

    records = []
    for _, row in df.iterrows():
        brand, system = split_brand_system(str(row["combined"]))
        if not system:
            continue
        records.append({
            "brand": brand,
            "system": system,
            "diameter": float(row["diameter"]),
            "length": float(row["length"]),
        })

    return records


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    records = parse_xlsx()

    # Deduplicate
    seen = set()
    unique = []
    for r in records:
        key = (r["brand"], r["system"], r["diameter"], r["length"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    # Print summary
    from collections import Counter
    system_counts = Counter((r["brand"], r["system"]) for r in unique)
    print(f"Total unique records: {len(unique)}")
    print(f"Total systems: {len(system_counts)}")
    for (b, s), c in sorted(system_counts.items()):
        print(f"  {b} | {s}: {c} records")

    # Replace collection
    await db.implant_library.drop()
    if unique:
        await db.implant_library.insert_many(unique)
    print(f"\nSeeded {len(unique)} records into implant_library.")

    # Verify
    count = await db.implant_library.count_documents({})
    pipeline = [
        {"$group": {"_id": {"brand": "$brand", "system": "$system"}}},
        {"$count": "total"},
    ]
    sys_count = (await db.implant_library.aggregate(pipeline).to_list(1))[0]["total"]
    print(f"Verified: {count} documents, {sys_count} systems.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
