"""
Refirm Advanced Implants — Zygoma (Z-Series) and Pterygoid (P-Series) data
extracted from the official Refirm® product brochure (IntEssence Solutions
Pvt. Ltd., CDSCO Lic. MFG/MD/2020/000134, ISO 13485:2016 Certified,
Grade 23 Titanium).

These implants are NOT interchangeable with conventional root-form implants.
They are indicated only for atrophic maxillary rehabilitation cases (severe
Class III/IV/V/VI Cawood-Howell resorption) and are surfaced only when the
Phase-1 procedure type is "Zygoma and Pterygoid Implants".

Schema per record:
    brand:        "Refirm"
    system:       "Z-Series" | "P-Series"
    implant_type: "zygoma"  | "pterygoid"
    diameter:     4.0 mm    (single diameter across the entire range)
    length:       mm        (see catalog below)
    part_number:  SKU from brochure
    kit_sku:      surgical kit SKU
    material:     "Grade 23 Titanium"

iter-Feb-2026: added on user request (attached brochure "Refirm Pterygoid
and Zygoma.pdf").
"""

from typing import List, Dict

# ── Refirm Z-Series (Zygoma Implant) ──────────────────────────────────────
# 13 lengths × 1 diameter (4.0 mm)
# Physical structure per brochure: polished coronal surface + 14 mm treated
# surface + tapered apical portion.
ZYGOMA_KIT_SKU = "11R-TK-XR011"
ZYGOMA_KIT_DIMENSION = "196 × 112 × 64.5 mm"

REFIRM_Z_SERIES: List[Dict] = [
    {"length": 30.0,  "part_number": "11R-IM-ZR001"},
    {"length": 32.5,  "part_number": "11R-IM-ZR002"},
    {"length": 35.0,  "part_number": "11R-IM-ZR003"},
    {"length": 37.5,  "part_number": "11R-IM-ZR004"},
    {"length": 40.0,  "part_number": "11R-IM-ZR005"},
    {"length": 42.5,  "part_number": "11R-IM-ZR006"},
    {"length": 45.0,  "part_number": "11R-IM-ZR007"},
    {"length": 47.5,  "part_number": "11R-IM-ZR008"},
    {"length": 50.0,  "part_number": "11R-IM-ZR009"},
    {"length": 52.5,  "part_number": "11R-IM-ZR010"},
    {"length": 55.0,  "part_number": "11R-IM-ZR011"},  # brochure typo "11R-IM-XR011" normalized
    {"length": 57.5,  "part_number": "11R-IM-ZR012"},
    {"length": 60.0,  "part_number": "11R-IM-ZR013"},
]

# ── Refirm P-Series (Pterygoid Implant) ────────────────────────────────────
# 4 lengths × 1 diameter (4.0 mm)
PTERYGOID_KIT_SKU = "11R-TK-XR010"
PTERYGOID_KIT_DIMENSION = "196 × 112 × 64.5 mm"

REFIRM_P_SERIES: List[Dict] = [
    {"length": 18.0,  "part_number": "11R-IM-PR001"},  # brochure "18R-IM-PR001" normalized to 11R prefix for consistency
    {"length": 20.0,  "part_number": "11R-IM-PR002"},
    {"length": 22.0,  "part_number": "11R-IM-PR003"},
    {"length": 25.0,  "part_number": "11R-IM-PR004"},
]

# ── Surgical Kit Contents (from brochure) ──────────────────────────────────
ZYGOMA_KIT_CONTENTS = [
    "HP Implant Driver (Ø 2.0/2.5/3.0 mm, L 80 mm)",
    "MU Connector Assure Driver (Ø 2.8/3.20 mm, L 60 mm)",
    "1.25 Hex Driver (Ø 2.5/3.0/3.7 mm)",
    "Implant Driver (multiple sizes)",
    "Depth Marker (Smooth / Medium Rough / Rough)",
    "Round Bur — Lance (Ø 2.0 mm)",
    "Diamond Burs (Ø 2.0/2.5/3.0 mm and Ø 2.8/3.20 mm)",
    "Osteotom (Ø 2.5/3.0/3.7 mm, L 45 mm)",
]

PTERYGOID_KIT_CONTENTS = [
    "HP Implant Driver (Ø 3.20 mm, L 43 mm)",
    "MU Connector Assure Driver (Ø 2.80 mm, L 43 mm)",
    "1.25 Hex Driver",
    "Implant Driver (Ø 2.5/3.0/3.7 mm and Ø 2.0/3.2 mm)",
    "Torque Wrench",
    "Osteotom (Ø 2.0 mm)",
    "Osteotom (Ø 3.0 mm)",
    "Lance Drill (Ø 2.0 mm)",
]

# ── Consolidated seed records ──────────────────────────────────────────────
def get_seed_records() -> List[Dict]:
    """Return implant records ready for insertion into `implant_library` col."""
    records: List[Dict] = []
    for row in REFIRM_Z_SERIES:
        records.append({
            "brand": "Refirm",
            "system": "Z-Series",
            "implant_type": "zygoma",
            "diameter": 4.0,
            "length": row["length"],
            "part_number": row["part_number"],
            "kit_sku": ZYGOMA_KIT_SKU,
            "material": "Grade 23 Titanium",
            "source": "refirm_brochure",
        })
    for row in REFIRM_P_SERIES:
        records.append({
            "brand": "Refirm",
            "system": "P-Series",
            "implant_type": "pterygoid",
            "diameter": 4.0,
            "length": row["length"],
            "part_number": row["part_number"],
            "kit_sku": PTERYGOID_KIT_SKU,
            "material": "Grade 23 Titanium",
            "source": "refirm_brochure",
        })
    return records


# ── System-level metadata (surfaced via /api/implant-library/systems) ─────
ADVANCED_SYSTEM_METADATA = {
    ("Refirm", "Z-Series"): {
        "implant_type": "zygoma",
        "indication": (
            "Zygomatic implant for severe maxillary bone loss (Cawood-Howell "
            "IV–VI). Anchors into the zygomatic bone bypassing atrophic alveolar "
            "and maxillary bone. Typically used in quad-zygoma or hybrid "
            "(2 conventional anterior + 2 zygoma posterior) full-arch protocols."
        ),
        "kit_sku": ZYGOMA_KIT_SKU,
        "kit_dimension": ZYGOMA_KIT_DIMENSION,
        "kit_contents": ZYGOMA_KIT_CONTENTS,
        "manufacturer": "IntEssence Solutions Pvt. Ltd., Bangalore, India",
        "regulatory": "CDSCO MFG/MD/2020/000134 · ISO 13485:2016",
        "material": "Grade 23 Titanium",
        "surface": "Polished coronal + 14 mm treated apical",
        "requires_cosign": True,
        "drilling_protocol_note": "Refer to Refirm Zygoma Surgical Guide (kit 11R-TK-XR011)",
        "typical_torque": "35-45 Ncm (final)",
        "typical_angulation_deg": [30, 45, 55],
        "supported_positions_fdi": ["15", "16", "25", "26"],
    },
    ("Refirm", "P-Series"): {
        "implant_type": "pterygoid",
        "indication": (
            "Pterygoid implant for additional posterior maxillary anchorage in "
            "full-arch rehabilitations. Engages the pyramidal process of the "
            "palatine bone and pterygoid plate for bicortical stability where "
            "sinus lift is contraindicated."
        ),
        "kit_sku": PTERYGOID_KIT_SKU,
        "kit_dimension": PTERYGOID_KIT_DIMENSION,
        "kit_contents": PTERYGOID_KIT_CONTENTS,
        "manufacturer": "IntEssence Solutions Pvt. Ltd., Bangalore, India",
        "regulatory": "CDSCO MFG/MD/2020/000134 · ISO 13485:2016",
        "material": "Grade 23 Titanium",
        "surface": "Fully threaded, treated surface",
        "requires_cosign": True,
        "drilling_protocol_note": "Refer to Refirm Pterygoid Surgical Guide (kit 11R-TK-XR010)",
        "typical_torque": "35-45 Ncm (final)",
        "typical_angulation_deg": [45, 55, 65],
        "supported_positions_fdi": ["17", "27"],
    },
}
