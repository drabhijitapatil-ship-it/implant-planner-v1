"""
Seed implant_library from updated XLSX (v3).
Format: Implant Company | Implant System | Diameter_mm | Length_mm
"""
import asyncio
import os
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

XLSX_PATH = os.path.join(os.path.dirname(__file__), "implant_library_v3.xlsx")


def parse_xlsx():
    df = pd.read_excel(XLSX_PATH, skiprows=0)
    # Normalize column names
    df.columns = [c.strip() for c in df.columns]
    col_map = {}
    for c in df.columns:
        cl = c.lower()
        if "company" in cl:
            col_map["brand"] = c
        elif "system" in cl:
            col_map["system"] = c
        elif "diameter" in cl:
            col_map["diameter"] = c
        elif "length" in cl:
            col_map["length"] = c

    df = df.rename(columns={col_map["brand"]: "brand", col_map["system"]: "system",
                            col_map["diameter"]: "diameter", col_map["length"]: "length"})

    df = df.dropna(subset=["diameter", "length"])
    df["diameter"] = pd.to_numeric(df["diameter"], errors="coerce")
    df["length"] = pd.to_numeric(df["length"], errors="coerce")
    df = df.dropna(subset=["diameter", "length"])
    df["diameter"] = df["diameter"].round(2)
    df["length"] = df["length"].round(2)
    df["brand"] = df["brand"].astype(str).str.strip()
    df["system"] = df["system"].astype(str).str.strip()

    records = [{"brand": r["brand"], "system": r["system"],
                "diameter": float(r["diameter"]), "length": float(r["length"])}
               for _, r in df.iterrows()]
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

    from collections import Counter
    system_counts = Counter((r["brand"], r["system"]) for r in unique)
    print(f"Total unique records: {len(unique)}")
    print(f"Total systems: {len(system_counts)}")
    for (b, s), c in sorted(system_counts.items()):
        print(f"  {b} | {s}: {c} records")

    await db.implant_library.drop()
    if unique:
        await db.implant_library.insert_many(unique)
    print(f"\nSeeded {len(unique)} records.")

    count = await db.implant_library.count_documents({})
    pipeline = [{"$group": {"_id": {"brand": "$brand", "system": "$system"}}}, {"$count": "total"}]
    sys_count = (await db.implant_library.aggregate(pipeline).to_list(1))[0]["total"]
    print(f"Verified: {count} documents, {sys_count} systems.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
