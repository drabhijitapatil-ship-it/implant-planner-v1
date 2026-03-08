"""
Seed the implant_library collection from the updated XLSX file.
Rule: All diameters × all lengths (cross-product) per system.
Exceptions:
1. Neodent Titamax GM (Acqua & NeoPorous): 5mm diameter → length max 13mm
   Neodent Helix GM (Acqua & NeoPorous): 6mm diameter → length max 13mm
2. B&B EV: 4mm → lengths 8-16mm; 4.5mm & 5mm → lengths 6.5-14mm
"""
import asyncio
import os
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

XLSX_PATH = os.path.join(os.path.dirname(__file__), "implant_library_updated.xlsx")

# Standard implant lengths used in the industry (for B&B EV exception)
STANDARD_LENGTHS_EV = [6.5, 8, 10, 12, 14, 16]


def parse_xlsx():
    df = pd.read_excel(XLSX_PATH, header=None, skiprows=1)
    df.columns = ["brand", "system", "diameter", "length"]

    # Drop info/note rows (NaN in diameter or length)
    df = df.dropna(subset=["diameter", "length"])

    # Clean numeric columns
    df["diameter"] = pd.to_numeric(df["diameter"], errors="coerce")
    df["length"] = pd.to_numeric(df["length"], errors="coerce")
    df = df.dropna(subset=["diameter", "length"])

    # Round to avoid floating point issues
    df["diameter"] = df["diameter"].round(2)
    df["length"] = df["length"].round(2)

    # Strip strings
    df["brand"] = df["brand"].astype(str).str.strip()
    df["system"] = df["system"].astype(str).str.strip()

    return df


def build_library(df):
    records = []
    grouped = df.groupby(["brand", "system"])

    for (brand, system), group in grouped:
        diameters = sorted(group["diameter"].unique())
        lengths = sorted(group["length"].unique())

        print(f"{brand} - {system}: D={diameters}, L={lengths}")

        # --- Apply exceptions ---

        # Exception 1a: Neodent Titamax GM (Acqua/NeoPorous) 5mm → length max 13
        is_titamax = brand == "Neodent" and "Titamax GM" in system

        # Exception 1b: Neodent Helix GM (Acqua/NeoPorous) 6mm → length max 13
        is_helix = brand == "Neodent" and "Helix GM" in system

        # Exception 2: B&B EV special ranges
        is_bb_ev = brand == "B&B Dental" and system == "EV"

        if is_bb_ev:
            # 4mm: lengths 8-16; 4.5 & 5mm: lengths 6.5-14
            for d in diameters:
                if d == 4.0:
                    valid_lengths = [l for l in STANDARD_LENGTHS_EV if 8 <= l <= 16]
                elif d in (4.5, 5.0):
                    valid_lengths = [l for l in STANDARD_LENGTHS_EV if 6.5 <= l <= 14]
                else:
                    valid_lengths = lengths
                for l in valid_lengths:
                    records.append({"brand": brand, "system": system, "diameter": d, "length": l})
        else:
            # Standard cross-product with optional constraints
            for d in diameters:
                for l in lengths:
                    # Exception 1a: Titamax GM 5mm → max 13mm
                    if is_titamax and d == 5.0 and l > 13:
                        continue
                    # Exception 1b: Helix GM 6mm → max 13mm
                    if is_helix and d == 6.0 and l > 13:
                        continue
                    records.append({"brand": brand, "system": system, "diameter": d, "length": l})

    return records


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    df = parse_xlsx()
    records = build_library(df)

    # Remove duplicates (same brand+system+diameter+length)
    seen = set()
    unique = []
    for r in records:
        key = (r["brand"], r["system"], r["diameter"], r["length"])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    print(f"\nTotal unique implant records: {len(unique)}")

    # Count by system
    from collections import Counter
    system_counts = Counter((r["brand"], r["system"]) for r in unique)
    for (b, s), c in sorted(system_counts.items()):
        print(f"  {b} - {s}: {c} records")

    # Replace collection
    await db.implant_library.drop()
    if unique:
        await db.implant_library.insert_many(unique)
    print(f"\nSeeded {len(unique)} records into implant_library collection.")

    # Verify
    count = await db.implant_library.count_documents({})
    print(f"Verified: {count} documents in collection.")

    # Count unique systems
    pipeline = [
        {"$group": {"_id": {"brand": "$brand", "system": "$system"}}},
        {"$count": "total"},
    ]
    result = await db.implant_library.aggregate(pipeline).to_list(1)
    print(f"Unique systems: {result[0]['total']}")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
