"""
Implant System Catalog (Implanr AI knowledge base).

iter-142: Component / SKU catalog per implant system. Used for two purposes:
  1. Admin Component Browser UI (read + edit SKUs, angulations, retention).
  2. Auto-injected into the GPT context for "Ask Implanr AI" so the LLM can
     answer "Do we have angled abutment for Ankylos?" / "Which retention for
     Osstem TS III?" without hallucinating.

Schema is intentionally permissive — fields are optional so new systems can be
added incrementally via the admin UI. The seed below populates Ankylos C/X and
Osstem TS III with the full data the user supplied, and creates empty stub
records for the other ~28 systems already registered in
`IMPLANT_SYSTEM_INDICATIONS`. Stub entries are visible in the admin browser
with a "Pending data — click to add" badge.

Key shape stored in `implant_catalog` MongoDB collection:
    {
      key: "Dentsply Sirona|Ankylos C/X",   # primary lookup
      brand, name,
      connection: { type, subtype, indexing[] },
      platform_switching: bool,
      features: [str],
      implant: { diameters[], lengths[], healing_modes[], bone_types[] },
      components: [
        { type, subtype, gingival_heights[], angulations[], retention[],
          material[], indication, notes }
      ],
      compatibility_notes: str,
      updated_at, updated_by
    }
"""
from typing import Any, Dict, List

# ── Fully populated systems (Ankylos C/X + Osstem TS III) ───────────────────
ANKYLOS_CX: Dict[str, Any] = {
    "key": "Dentsply Sirona|Ankylos C/X",
    "brand": "Dentsply Sirona",
    "name": "Ankylos C/X",
    "connection": {
        "type": "conical",
        "subtype": "morse_taper",
        "indexing": ["indexed", "non_indexed"],
    },
    "platform_switching": True,
    "prosthetic_interface": "universal_conical",
    "features": [
        "Friction-lock Morse taper connection",
        "Dual-mode indexing (C = non-indexed, /X = indexed)",
        "Platform switching by default",
        "TissueCare Connection — bacterial seal at the implant-abutment interface",
    ],
    "implant": {
        "diameters_mm": [3.5, 4.5, 5.5, 7.0],
        "lengths_mm": [6.6, 8, 9.5, 11, 14, 17],
        "healing_modes": ["submerged", "transgingival"],
    },
    "components": [
        {
            "type": "healing_abutment",
            "gingival_heights_mm": [0.75, 1.5, 3.0, 4.5],
            "driver": "1.0 hex",
            "notes": "Height stamped on the side; add 1.5 mm offset to obtain prosthetic platform height.",
        },
        {
            "type": "final_abutment",
            "subtype": "regular_balance_base",
            "gingival_heights_mm": [0.75, 1.5, 3.0, 4.5],
            "angulations_deg": [0, 7.5, 15, 22.5, 30, 37.5],
            "retention": ["cement", "lateral_screw", "occlusal_screw"],
            "material": ["titanium"],
            "indication": "Universal — single + bridge, anterior + posterior",
        },
        {
            "type": "final_abutment",
            "subtype": "balance_posterior",
            "indication": "Posterior region — emergence profile optimised for molars/premolars",
            "retention": ["cement", "occlusal_screw"],
            "material": ["titanium"],
        },
        {
            "type": "final_abutment",
            "subtype": "balance_anterior",
            "indication": "Esthetic zone — anterior emergence profile",
            "material": ["titanium", "zirconia"],
            "retention": ["cement", "lateral_screw"],
        },
        {
            "type": "ti_base",
            "subtype": "atlantis_ti_base",
            "cad_cam": True,
            "notes": "For screw-retained CAD/CAM crowns and bridges (Atlantis or third-party CAD/CAM).",
        },
        {
            "type": "scanbody",
            "material": ["peek"],
            "notes": "Required for digital impressions; one per implant.",
        },
        {
            "type": "overdenture",
            "subtype": "locator",
            "retention": ["resilient_attachment"],
            "indication": "Removable overdenture — 2/4 implant lower or upper",
        },
        {
            "type": "overdenture",
            "subtype": "snap",
            "indication": "Removable overdenture — economical alternative to Locator",
        },
        {
            "type": "overdenture",
            "subtype": "syncone_conometric",
            "indication": "Conometric (cement-free) friction-fit overdenture",
        },
    ],
    "compatibility_notes": (
        "C/ designation indicates non-indexed connection (free rotation — for splinted "
        "restorations). /X is indexed (positional locking — for single units). The same "
        "abutment family fits both modes."
    ),
}

OSSTEM_TSIII: Dict[str, Any] = {
    "key": "Osstem|TS III",
    "brand": "Osstem",
    "name": "TS III",
    "connection": {
        "type": "internal_hex",
        "subtype": "morse_taper_hybrid",
    },
    "platform_switching": True,
    "features": [
        "Helix thread + corkscrew thread design",
        "High initial stability — primary stability in soft bone",
        "Tapered body with self-tapping apex",
        "SA (Sand-blasted Acid-etched) surface",
    ],
    "implant": {
        "diameters_mm": [3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0],
        "lengths_mm": [7, 8.5, 10, 11.5, 13, 15],
        "bone_types": ["D1", "D2", "D3", "D4"],
    },
    "components": [
        {"type": "healing_abutment", "gingival_heights_mm": [2, 3, 4, 5, 6, 7],
         "notes": "Standard / Wide diameter healing caps — match implant platform."},
        {"type": "multi_unit_abutment", "angulations_deg": [0, 17, 30],
         "subtype": "straight_and_angled",
         "indication": "Full-arch / All-on-X — Immediate Loading screw-retained prosthesis"},
        {"type": "final_abutment", "subtype": "transfer_abutment",
         "angulations_deg": [0, 15, 25],
         "retention": ["cement", "occlusal_screw"], "material": ["titanium"],
         "indication": "Single + bridge, anterior + posterior"},
        {"type": "ti_base", "subtype": "smartbase", "cad_cam": True,
         "notes": "For CAD/CAM screw-retained crowns and bridges."},
        {"type": "scanbody", "material": ["peek"]},
        {"type": "overdenture", "subtype": "locator", "indication": "Removable overdenture"},
        {"type": "overdenture", "subtype": "ball_attachment",
         "indication": "Removable overdenture — alternative to Locator"},
    ],
    "compatibility_notes": (
        "Internal hex with morse-taper hybrid seat. Component diameter must match the "
        "implant platform (Mini / Regular / Wide). TS III shares prosthetic compatibility "
        "with TS IV within the same platform diameter."
    ),
}

# ── iter-143 — additional curated systems from uploaded catalogs ────────────
MIS_LANCE_PLUS: Dict[str, Any] = {
    "key": "MIS|LANCE+",
    "brand": "MIS",
    "name": "LANCE+",
    "connection": {"type": "internal_hex", "subtype": None, "indexing": []},
    "platform_switching": True,
    "features": [
        "Conical, root-shaped geometry",
        "Triple thread geometry — high primary stability",
        "Sand-blasted + acid-etched (SLA-style) surface",
        "Three platforms: Narrow (NP) / Standard (SP) / Wide (WP) prosthetic interface",
    ],
    "implant": {
        "diameters_mm": [3.30, 3.75, 4.20, 5.00],
        "lengths_mm": [8, 10, 11.50, 13, 16],
        "bone_types": ["Soft (D3-D4)", "Hard (D1-D2)"],
        "healing_modes": ["submerged", "transgingival"],
    },
    "components": [
        {"type": "cover_screw", "indication": "Submerged healing protocol",
         "notes": "Included with each LANCE+ implant package."},
        {"type": "healing_abutment", "subtype": "standard / concave / anatomic",
         "gingival_heights_mm": [2, 3, 4, 5, 6, 8],
         "indication": "Available across NP / SP / WP platforms (Ø4 / Ø4.8 / Ø5–6.5 mm)"},
        {"type": "impression_coping",
         "subtype": "open_tray, closed_tray, direct_press_fit",
         "indication": "All three platforms (NP / SP / WP)"},
        {"type": "analog", "subtype": "implant_analog + digital_model_analog"},
        {"type": "temporary_cylinder",
         "subtype": "free_rotation + anti_rotation, with concave variants",
         "indication": "All three platforms"},
        {"type": "multi_unit_abutment",
         "subtype": "straight_and_angled",
         "gingival_heights_mm": [1, 2, 3, 4, 5],
         "angulations_deg": [0, 17, 30],
         "indication": "Available NP / SP / WP — straight (GH 1-5 mm), angled 17° and 30° (GH 1-2 mm)"},
        {"type": "final_abutment", "subtype": "cementable + concave_emergence",
         "gingival_heights_mm": [1, 2, 3, 4],
         "angulations_deg": [0, 10, 20, 25],
         "retention": ["cement", "occlusal_screw"], "material": ["titanium"]},
        {"type": "ti_base",
         "subtype": "EZ-Base + anti-rotation + free-rotation + incisor esthetic",
         "cad_cam": True,
         "indication": "All three platforms; CAD/CAM crown and bridge interface"},
        {"type": "ti_base", "subtype": "titanium_blank",
         "notes": "Ø5 mm and Ø12 mm anti-rotation blanks (incl. Amann Girrbach milling analogs)"},
        {"type": "scanbody", "subtype": "MN / MD / MW / MU",
         "indication": "Per-platform + multi-unit scan posts"},
        {"type": "overdenture", "subtype": "OT-Equator",
         "gingival_heights_mm": [1, 2, 3, 4, 5],
         "indication": "Removable overdenture — Rhein 83 OT-Equator system"},
        {"type": "overdenture", "subtype": "ball_attachment",
         "gingival_heights_mm": [1, 2, 3, 4, 5],
         "angulations_deg": [0, 15, 25],
         "indication": "Direct ball + 15°/25° angled ball variants (SP)"},
        {"type": "overdenture", "subtype": "LOCKIT",
         "gingival_heights_mm": [1, 2, 3, 4, 5],
         "indication": "MIS LOCKIT attachment system, color-coded retention caps"},
        {"type": "cpk_abutment", "subtype": "straight + concave (H1-H4)",
         "indication": "CPK kit for all three platforms"},
    ],
    "compatibility_notes": (
        "Internal hex prosthetic system with three platform diameters (NP / SP / WP). "
        "Standard abutment line plus a parallel concave-emergence-profile abutment line. "
        "Multi-Unit (MU) sub-system has its own scan posts, analogs, and impression copings."
    ),
}

BIOHORIZONS_TAPERED_PRO: Dict[str, Any] = {
    "key": "BioHorizons|Tapered Pro",
    "brand": "BioHorizons",
    "name": "Tapered Pro",
    "connection": {"type": "internal_hex", "subtype": "conical", "indexing": ["non_indexed"]},
    "platform_switching": True,
    "features": [
        "Laser-Lok® microchannels at the crest module",
        "Aggressive buttress threads for primary stability",
        "Self-tapping cutting flutes",
        "Tapered body geometry",
        "Dual-affinity surface (Resorbable Blast Texturing — RBT)",
    ],
    "implant": {
        "diameters_mm": [3.8, 4.2, 4.6, 5.2],
        "lengths_mm": [9.0, 10.5, 12.0, 15.0, 18.0],
        "bone_types": ["soft", "dense"],
        "healing_modes": ["two_stage", "single_stage"],
    },
    "components": [
        {"type": "cover_screw", "material": ["titanium_alloy"],
         "indication": "Submerged surgical healing", "notes": "Included with each implant"},
        {"type": "healing_abutment", "material": ["titanium_alloy"],
         "gingival_heights_mm": [1, 2, 3, 5],
         "indication": "Soft tissue healing and sulcus development",
         "notes": "Laser-Lok versions available; color-coded by platform and emergence profile."},
        {"type": "final_abutment", "material": ["titanium_alloy"],
         "indication": "Custom abutments — milled in-house or via partner milling centres."},
        {"type": "multi_unit_abutment",
         "indication": "Multi-unit prosthetic support; profiling burs available for subcrestal placement."},
        {"type": "ti_base", "indication": "CAD/CAM restoration interface", "cad_cam": True},
        {"type": "scanbody", "indication": "Digital impressioning"},
        {"type": "impression_coping", "indication": "Conventional impression workflow"},
        {"type": "analog", "indication": "Lab model fabrication"},
    ],
    "compatibility_notes": (
        "Conical internal hex connection, non-indexed family. Surgical kits, drills, and "
        "instruments are designed specifically for Tapered Pro implant geometry. Use only "
        "BioHorizons-approved components to maintain warranty and seal integrity."
    ),
}

BIOHORIZONS_TAPERED_PRO_CONICAL: Dict[str, Any] = {
    "key": "BioHorizons|Tapered Pro Conical RBT",
    "brand": "BioHorizons",
    "name": "Tapered Pro Conical (RBT)",
    "connection": {"type": "conical", "subtype": "6-cam", "indexing": ["internal"]},
    "platform_switching": True,
    "features": [
        "Tapered body geometry",
        "Aggressive thread form",
        "Self-tapping helical cutting flutes",
        "Laser-Lok® microchannels",
        "Single platform for full-arch cases (cross-diameter compatibility)",
        "Flat implant shoulder",
    ],
    "implant": {
        "diameters_mm": [3.3, 3.8, 4.2, 4.6, 5.2],
        "lengths_mm": [9.0, 10.5, 12.0, 15.0, 18.0],
        "bone_types": ["soft", "dense", "maxillary", "mandibular"],
        "healing_modes": ["two_stage", "single_stage"],
    },
    "components": [
        # === Cover screws ===
        {"type": "cover_screw", "subtype": "Conical Cover Screw",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNCC", "CRCC"],
         "indication": "Two-stage submerged surgical protocol; protects prosthetic platform",
         "notes": "Hand-tighten with .050\" (1.25 mm) Hex Driver"},

        # === Healing abutments ===
        {"type": "healing_abutment", "subtype": "Regular Healing Cap",
         "platforms": ["Narrow", "Regular"],
         "diameters_mm": [3.0, 3.8], "gingival_heights_mm": [2.0, 4.0, 6.0],
         "material": ["titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNHA2", "CNHA4", "CNHA6", "CRHA2", "CRHA4", "CRHA6"],
         "indication": "Single-stage healing; supports peri-implant tissue maturation"},

        {"type": "healing_abutment", "subtype": "Wide Healing Cap",
         "platforms": ["Narrow", "Regular"],
         "diameters_mm": [4.8, 5.3], "gingival_heights_mm": [4.0, 6.0],
         "material": ["titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNHA4W", "CRHA4W", "CRHA6W"],
         "indication": "Wider emergence profile for posterior sites"},

        {"type": "healing_abutment", "subtype": "Extra-Wide Healing Cap",
         "platforms": ["Regular"],
         "diameters_mm": [5.8], "gingival_heights_mm": [4.0, 6.0],
         "material": ["titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CRHA4EW", "CRHA6EW"],
         "indication": "Maximum emergence; Regular platform only"},

        {"type": "healing_abutment", "subtype": "SmartShape Anatomic Healer",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [3.25, 3.5, 5.25, 5.5],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNSSHA1", "CNSSHA2", "CRSSHA1", "CRSSHA2",
                          "CNSSHM1", "CNSSHM2", "CRSSHM1", "CRSSHM2",
                          "CRSSHP1", "CRSSHP2"],
         "indication": "Anatomic anterior/molar/premolar emergence shaping for esthetic tissue contour"},

        # === Impression copings ===
        {"type": "impression_coping", "subtype": "Conical Impression Post — Open Tray",
         "platforms": ["Narrow", "Regular", "Wide"],
         "material": ["titanium_alloy"], "retention": ["impression_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNICO", "CRICO", "CNICWO", "CRICWO"],
         "indication": "Open-tray, implant-level impression"},

        {"type": "impression_coping", "subtype": "Conical Impression Post — Closed Tray",
         "platforms": ["Narrow", "Regular", "Wide"],
         "material": ["titanium_alloy"], "retention": ["impression_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNICC", "CRICC", "CNICWC", "CRICWC"],
         "indication": "Closed-tray, implant-level impression; preassembled with cap"},

        {"type": "impression_coping", "subtype": "Conical Impression Cap (POM, 5-pack)",
         "platforms": ["Narrow", "Regular"],
         "material": ["POM"], "part_numbers": ["CNIC", "CRIC"],
         "indication": "Replacement cap for closed-tray impression copings"},

        {"type": "impression_coping", "subtype": "Bite Registration Cap (POM, 5-pack)",
         "platforms": ["Narrow", "Regular"],
         "material": ["POM"], "part_numbers": ["CNBRC", "CRBRC"],
         "indication": "Bite registration with closed-tray impression copings"},

        # === Lab analogs ===
        {"type": "analog", "subtype": "Conical Implant Lab Analog",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"],
         "part_numbers": ["CNILA", "CRILA", "CNILA25", "CRILA25"],
         "indication": "Printed and cast model fabrication; single or 25-pack"},

        # === Temporary cylinders ===
        {"type": "temporary_cylinder", "subtype": "Conical Temporary Abutment — Engaging",
         "platforms": ["Narrow", "Regular"],
         "heights_mm": [11.0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTEA", "CRTEA"],
         "indication": "Single-unit provisional restoration; preparable; abutment screw included"},

        {"type": "temporary_cylinder", "subtype": "Conical Temporary Abutment — Non-engaging",
         "platforms": ["Narrow", "Regular"],
         "heights_mm": [11.2],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTNA", "CRTNA"],
         "indication": "Multi-unit / bridge provisional; preparable; abutment screw included"},

        # === Final abutments ===
        {"type": "final_abutment", "subtype": "Conical Gold-Plastic Abutment",
         "platforms": ["Narrow", "Regular"],
         "heights_mm": [11.7],
         "material": ["gold_alloy", "POM"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNGA", "CRGA"],
         "indication": "Single-/multi-unit screw-retained or custom cement-retained restorations",
         "notes": "Cast-on gold base with POM sleeve. Not for sale in the USA"},

        {"type": "final_abutment", "subtype": "Conical Straight Esthetic Abutment",
         "platforms": ["Narrow", "Regular", "Wide"],
         "gingival_heights_mm": [1.5, 2.0, 3.0], "angulations_deg": [0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNSA2", "CRSA1", "CRSA3", "CRSA1W", "CRSA3W"],
         "indication": "Anterior + cement-retained restorations; preparable"},

        {"type": "final_abutment", "subtype": "Conical 15° Esthetic Abutment",
         "platforms": ["Regular", "Wide"],
         "gingival_heights_mm": [1.5, 3.0], "angulations_deg": [15],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CR15A1", "CR15A3", "CR15A1W", "CR15A3W"],
         "indication": "15° axis correction for anterior + cement-retained cases; preparable"},

        {"type": "final_abutment", "subtype": "Conical 20° Esthetic Abutment",
         "platforms": ["Regular", "Wide"],
         "gingival_heights_mm": [1.5, 3.0], "angulations_deg": [20],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CR20A1", "CR20A3", "CR20A1W", "CR20A3W"],
         "indication": "20° axis correction for anterior + cement-retained cases; preparable"},

        # === Ti-bases (CAD/CAM) ===
        {"type": "ti_base", "subtype": "Conical Ti Base — Engaging, Short Post",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [4.7], "heights_mm": [0.8, 2.0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTEOS", "CRTEOS", "CNTE2S", "CRTE2S"],
         "indication": "CAD/CAM bonding base; single-unit"},

        {"type": "ti_base", "subtype": "Conical Ti Base — Engaging, Tall Post",
         "platforms": ["Regular"],
         "gingival_heights_mm": [6.5], "heights_mm": [0.8, 2.0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CRTEOT", "CRTE2T"],
         "indication": "CAD/CAM bonding base; tall post for thick gingiva"},

        {"type": "ti_base", "subtype": "Conical Ti Base — Non-Engaging",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [4.6], "heights_mm": [0.8, 2.0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTNO", "CRTNO", "CNTN2", "CRTN2"],
         "indication": "CAD/CAM bonding base for multi-unit / bridge"},

        {"type": "ti_base", "subtype": "Conical Ti Base — CEREC Compatible",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [0.8, 2.0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTEO", "CRTEO", "CNTE2", "CRTE2"],
         "indication": "CEREC chairside CAD/CAM"},

        {"type": "ti_base", "subtype": "Conical CAD/CAM Ti Blank — Type IAC",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNTBI", "CRTBI"],
         "indication": "Custom CAD/CAM abutment fabrication"},

        # === Scanbodies ===
        {"type": "scanbody", "subtype": "Conical Scanbody",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNTSB", "CRTSB"],
         "indication": "3D digital localization of implant or lab analog"},

        {"type": "scanbody", "subtype": "Scan Post for CEREC Scanbody",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["CNCSP", "CRCSP"],
         "indication": "Digital recording for CEREC and inLab systems"},

        # === Overdenture attachments ===
        {"type": "overdenture_attachment", "subtype": "Conical OD Secure Abutment",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [1.0, 2.0, 3.0, 4.0],
         "material": ["titanium_alloy_TiN"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNODS1", "CNODS2", "CNODS3", "CNODS4",
                          "CRODS1", "CRODS2", "CRODS3", "CRODS4"],
         "indication": "Removable overdenture / partial denture retention",
         "notes": "Comes with metal housing, 4 retentive inserts, lab insert, protection disk. Not for sale in the USA"},

        {"type": "overdenture_attachment", "subtype": "Locator Abutment",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
         "material": ["titanium_alloy"], "retention": ["nylon_male_inserts"],
         "torque_ncm": 30,
         "part_numbers": ["02748-CB", "02749-CB", "02750-CB", "02751-CB",
                          "02752-CB", "02753-CB", "02754-CB", "02755-CB",
                          "02756-CB", "02757-CB", "02758-CB", "02759-CB"],
         "indication": "Overdenture / partial denture retention; nylon insert system"},

        # === Multi-unit abutments ===
        {"type": "multi_unit_abutment", "subtype": "Conical Multi-unit Straight Abutment",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [2.0, 3.0, 4.0], "angulations_deg": [0],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CNMUS2N", "CNMUS3N", "CNMUS4N",
                          "CRMUS2N", "CRMUS3N", "CRMUS4N"],
         "indication": "Multi-unit screw-retained restorations, bar overdentures, hybrids"},

        {"type": "multi_unit_abutment", "subtype": "Conical Multi-unit 17° Angled Abutment",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [2.0, 3.0, 4.0], "angulations_deg": [17],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CN17MU2", "CN17MU3", "CN17MU4",
                          "CR17MU2", "CR17MU3", "CR17MU4"],
         "indication": "Angled multi-unit for All-on-X axis correction",
         "notes": "60° offset cam"},

        {"type": "multi_unit_abutment", "subtype": "Conical Multi-unit 30° Angled Abutment",
         "platforms": ["Narrow", "Regular"],
         "gingival_heights_mm": [2.0, 3.0, 4.0], "angulations_deg": [30],
         "material": ["titanium_alloy"], "retention": ["abutment_screw"],
         "torque_ncm": 20,
         "part_numbers": ["CN30MU2", "CN30MU3", "CN30MU4",
                          "CR30MU2", "CR30MU3", "CR30MU4"],
         "indication": "Steeply angled multi-unit for All-on-X distal cant",
         "notes": "60° offset cam"},

        {"type": "multi_unit_abutment", "subtype": "Conical Multi-unit Try-in Abutment",
         "platforms": ["Narrow", "Regular"],
         "angulations_deg": [0, 17, 30],
         "material": ["titanium_alloy"],
         "part_numbers": ["CNTRYS", "CRTRYS", "CNTRY17", "CRTRY17", "CNTRY30", "CRTRY30"],
         "indication": "Verify tissue thickness + prosthetic seating before final placement"},

        # === Multi-unit prosthetic accessories ===
        {"type": "prosthetic_screw", "subtype": "Multi-unit Prosthetic Screw (Regular/Long/Short)",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"], "torque_ncm": 15,
         "part_numbers": ["PXMUPSR", "PXMUPSR25", "PXMUPSL", "PXMUPSS"],
         "indication": "Attaches copings to multi-unit abutments",
         "notes": "Use with .050\" (1.25 mm) Hex Driver or Unigrip"},

        {"type": "prosthetic_screw", "subtype": "Conical Angled Multi-unit Abutment Screw",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "torque_ncm": 20,
         "part_numbers": ["CMUAS", "CMUAS25"],
         "indication": "For angled multi-unit abutments only"},

        {"type": "prosthetic_screw", "subtype": "Multi-unit CAD/CAM Bar Prosthetic Screw",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"], "torque_ncm": 15,
         "part_numbers": ["PXMUPSA", "PXMUPSA25"],
         "indication": "CAD/CAM bar restorations to multi-unit abutments; angulated screw channel via Conical Ballpoint Driver"},

        {"type": "prosthetic_screw", "subtype": "Direct to Multi-unit Screw",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"], "torque_ncm": 15,
         "part_numbers": ["PXMUPSD", "PXMUPSD5", "PXMUPSD25"],
         "indication": "Secures Zirconia / PMMA / 3D-printed restoration directly to multi-unit; supports angulated screw channels"},

        {"type": "coping", "subtype": "Titanium Coping (Regular / Short)",
         "platforms": ["Narrow", "Regular"],
         "material": ["titanium_alloy"], "retention": ["prosthetic_screw"],
         "torque_ncm": 15,
         "part_numbers": ["PXMUTC", "PXMUTCS"],
         "indication": "Acrylic temporary + final prostheses; trimmable for height"},

        {"type": "coping", "subtype": "Gold Custom Castable Coping",
         "platforms": ["Multi-unit"],
         "heights_mm": [7.5],
         "material": ["gold_alloy", "acetal_resin"], "retention": ["prosthetic_screw"],
         "torque_ncm": 15,
         "part_numbers": ["PXMUGC"],
         "indication": "Metal-reinforced acrylic prosthesis or bar overdenture"},

        {"type": "coping", "subtype": "Plastic Custom Castable Coping",
         "platforms": ["Multi-unit"],
         "heights_mm": [7.5],
         "material": ["acetal_resin"], "retention": ["prosthetic_screw"],
         "torque_ncm": 15,
         "part_numbers": ["PXMUPC"],
         "indication": "Metal-reinforced acrylic; Delrin / Pomalux"},

        {"type": "coping", "subtype": "Passive-Fit Coping",
         "platforms": ["Multi-unit"],
         "heights_mm": [7.5],
         "material": ["titanium_alloy", "acetal_resin"], "retention": ["prosthetic_screw"],
         "torque_ncm": 15,
         "part_numbers": ["PXMUPFC"],
         "indication": "Cement-on passive-fit framework for hybrids and bar overdentures"},

        # === Multi-unit impression / lab ===
        {"type": "impression_coping", "subtype": "Direct Pick-up Coping (Multi-unit)",
         "platforms": ["Multi-unit"],
         "heights_mm": [7.0, 9.0],
         "material": ["titanium_alloy"], "retention": ["prosthetic_screw_long"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["PXMUDPC"],
         "indication": "Direct pick-up impression at abutment level (open-tray)"},

        {"type": "impression_coping", "subtype": "Indirect Transfer Coping (Multi-unit)",
         "platforms": ["Multi-unit"],
         "heights_mm": [8.0],
         "material": ["titanium_alloy"], "retention": ["prosthetic_screw"],
         "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["PXMUIC"],
         "indication": "Indirect (closed-tray) impression at abutment level"},

        {"type": "impression_coping", "subtype": "Cover Cap (Multi-unit)",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["PXMUCC"],
         "indication": "Protective cap over multi-unit abutment between visits"},

        {"type": "impression_coping", "subtype": "Multi-unit Contoured Cover Cap (PEEK)",
         "platforms": ["Multi-unit"],
         "material": ["PEEK", "titanium_alloy"], "torque_ncm": "10-15 (hand-tighten)",
         "part_numbers": ["PXMUCCC"],
         "indication": "Flared emergence; suppresses tissue during suturing; pack of 2"},

        {"type": "analog", "subtype": "Protection Analog (Multi-unit, 5-pack)",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"],
         "part_numbers": ["PXMUPA"],
         "indication": "Protects abutment-coping interface during framework polishing"},

        {"type": "analog", "subtype": "Abutment Replica (Multi-unit)",
         "platforms": ["Multi-unit"],
         "material": ["titanium_alloy"],
         "part_numbers": ["PXMUAR"],
         "indication": "Working cast representation of multi-unit / implant assembly"},

        {"type": "scanbody", "subtype": "Multi-unit Titanium Scanbody",
         "platforms": ["Multi-unit"],
         "material": ["titanium"],
         "part_numbers": ["PXMUTSB"],
         "indication": "Digital model of multi-unit analogs at abutment level"},
    ],
    "compatibility_notes": (
        "Member of the CONELOG connection family (established 2011) — conical 6-cam internal "
        "indexing. Single prosthetic platform across all diameters simplifies full-arch case "
        "planning. Compatible only with BioHorizons Pro Freehand / Pro Guided Surgical Kits."
    ),
}

CONELOG_PROGRESSIVE: Dict[str, Any] = {
    "key": "Conelog|Progressive Line",
    "brand": "Camlog (Conelog)",
    "name": "CONELOG® PROGRESSIVE-LINE",
    "connection": {"type": "conical", "subtype": "internal", "indexing": []},
    "platform_switching": True,
    "features": [
        "Conical connection — reduced micromovements",
        "Superior positional stability",
        "Tactile feedback at seating",
        "Integrated platform switching",
        "Promote® surface for long-term success",
        "Diameter-reduced + short implants extend indications",
    ],
    "implant": {
        "diameters_mm": [3.3, 3.8, 4.3, 5.0],
        "lengths_mm": [7, 9, 11, 13, 16],
        "bone_types": ["soft", "standard", "dense"],
        "healing_modes": ["submerged", "transgingival"],
    },
    "components": [
        {"type": "cover_screw", "material": ["titanium_alloy"],
         "indication": "Two-stage protocol", "notes": "Color-coded by platform"},
        {"type": "healing_abutment", "subtype": "cylindrical",
         "gingival_heights_mm": [2.0, 4.0, 6.0],
         "retention": ["screwed"], "material": ["titanium_alloy"],
         "indication": "One-stage protocol — height to leave 1-1.5 mm supragingival"},
        {"type": "healing_abutment", "subtype": "wide_body",
         "gingival_heights_mm": [4.0, 6.0],
         "retention": ["screwed"], "material": ["titanium_alloy"]},
        {"type": "healing_abutment", "subtype": "bottleneck",
         "gingival_heights_mm": [4.0, 6.0],
         "retention": ["screwed"], "material": ["titanium_alloy"],
         "notes": "Coronally tapered crosscut — for esthetically challenging anteriors"},
        {"type": "final_abutment",
         "indication": "Restorative range — refer to CONELOG prosthetic catalog"},
        {"type": "ti_base", "cad_cam": True,
         "indication": "CAD/CAM screw-retained crowns and bridges"},
        {"type": "scanbody"},
        {"type": "impression_coping"},
        {"type": "analog"},
        {"type": "surgical_kit",
         "subtype": "PROGRESSIVE-LINE Flex Surgery set",
         "notes": "Includes pilot drill, Flex drills, profile drills, taps, dense-bone drills, bone profilers, drivers (short/long ISO + manual), torque wrench (max 30 Ncm)."},
    ],
    "compatibility_notes": (
        "Conical internal connection with integrated platform switching. Drills are "
        "color-coded; gingiva punches and round bur (2.3 mm) for bed preparation. Surgical "
        "torque max 30 Ncm. Compatible only with Camlog/Conelog Flex protocol instruments."
    ),
}

ALPHABIO_SPI: Dict[str, Any] = {
    "key": "Alpha-Bio Tec|SPI",
    "brand": "Alpha-Bio Tec",
    "name": "SPI",
    "connection": {"type": "internal_hex", "subtype": "0.050", "indexing": ["non_indexed"]},
    "platform_switching": False,
    "features": [
        "Extremely precise internal hex — single platform across all diameters",
        "Tapered body",
        "Double thread design with 2.4 mm pitch",
        "Micro-rings at the crest module",
        "Sand-blasted macro-surface (20–40 µm) for osseointegration",
    ],
    "implant": {
        "diameters_mm": [3.3, 3.75, 4.2, 5, 6],
        "lengths_mm": [8, 10, 11.5, 13, 16],
        "bone_types": ["soft", "hard"],
        "healing_modes": ["one_stage", "two_stage"],
    },
    "components": [
        {"type": "cover_screw", "indication": "Two-stage submerged healing"},
        {"type": "healing_abutment",
         "indication": "One-stage and uncovering protocols"},
        {"type": "final_abutment",
         "retention": ["cement", "occlusal_screw"], "material": ["titanium"],
         "indication": "Cementable + screw-retained restorations"},
        {"type": "multi_unit_abutment",
         "indication": "Full-arch / multi-unit screw-retained prostheses"},
        {"type": "ti_base", "cad_cam": True},
        {"type": "scanbody", "indication": "Digital workflow"},
        {"type": "overdenture",
         "indication": "Removable overdenture solutions"},
        {"type": "impression_coping"},
        {"type": "analog"},
    ],
    "compatibility_notes": (
        "Single prosthetic platform across all SPI diameters — interchangeable abutments "
        "regardless of implant Ø. SPI is a self-contained prosthetic family; only Alpha-Bio "
        "components and instruments are validated."
    ),
}


# ── iter-144 — Extended catalogs from second PDF batch (Ankylos update +
# Osstem TS IV/SS III/MS/ETIII NH + Nobel NP/RP/WP + Neodent Drive/Helix/Titamax
# + Bredent blueSKY/miniSKY/copaSKY/Narrow/Classic). Defined as compact dicts
# and fed through a shared CATALOG_EXTRA list into the startup seeder. ───────
def _mk(key: str, brand: str, name: str, connection=None, features=None, implant=None,
        components=None, notes="", platform_switching=None) -> Dict[str, Any]:
    return {
        "key": key, "brand": brand, "name": name,
        "connection": connection, "platform_switching": platform_switching,
        "features": features or [], "implant": implant or {},
        "components": components or [], "compatibility_notes": notes,
    }

# --- Osstem additional systems ---
OSSTEM_TSIV = _mk(
    "Osstem|TS IV", "Osstem", "TS IV",
    connection={"type": "internal_hex", "subtype": "morse_taper_conical_seal"},
    platform_switching=True,
    features=["3-tier taper body for soft-bone and sinus surgery", "Small thread + corkscrew thread + helix cutting edges",
              "Aggressive apex design", "SA + CA surface options"],
    implant={"diameters_mm": [4.0, 4.5, 5.0, 6.0, 7.0], "lengths_mm": [7, 8.5, 10, 11.5, 13],
             "bone_types": ["D3", "D4"], "healing_modes": ["submerged"]},
    components=[
        {"type": "healing_abutment", "notes": "Shared GM-style prosthetic family with TS III"},
        {"type": "multi_unit_abutment", "angulations_deg": [0, 17, 30]},
        {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
        {"type": "ti_base", "cad_cam": True},
        {"type": "scanbody"}, {"type": "cover_screw"}, {"type": "analog"},
    ],
    notes="Shares prosthetic platform with TS III within matching diameter."
)

OSSTEM_SSIII = _mk(
    "Osstem|SS III", "Osstem", "SS III",
    connection={"type": "internal_octa", "subtype": "morse_taper_conical_seal"},
    platform_switching=False,
    features=["One-time surgery with wide crown margin", "Taper body + corkscrew thread + helix cutting edges",
              "SA surface", "Internal Octa prosthetic indexing"],
    implant={"diameters_mm": [3.5, 4.0, 4.5, 5.0, 6.0, 7.0], "lengths_mm": [6, 7, 8.5, 10, 11.5, 13],
             "bone_types": ["D1", "D2", "D3", "D4"], "healing_modes": ["non_submerged"]},
    components=[
        {"type": "final_abutment", "subtype": "Solid / ExcellentSolid / ComOcta family",
         "angulations_deg": [0, 15, 25], "retention": ["cement", "occlusal_screw"]},
        {"type": "ti_base", "cad_cam": True, "subtype": "ComOcta Milling"},
        {"type": "healing_abutment"}, {"type": "scanbody"}, {"type": "analog"},
    ],
    notes="Tissue-level one-time surgery system; NOT interchangeable with bone-level TS family."
)

OSSTEM_MS = _mk(
    "Osstem|MS", "Osstem", "MS",
    connection={"type": "ball_head", "subtype": "O-Ring neck connection"},
    platform_switching=False,
    features=["Narrow-ridge + denture stabilisation", "Corkscrew thread",
              "Taper design in cortical area", "Flexible crown margin"],
    implant={"diameters_mm": [2.0, 2.5, 3.0, 3.5], "lengths_mm": [8.5, 10, 11.5, 13],
             "bone_types": ["narrow_ridge"], "healing_modes": ["non_submerged"]},
    components=[
        {"type": "overdenture", "subtype": "ball_attachment",
         "indication": "Denture retention in edentulous arches"},
        {"type": "final_abutment", "notes": "One-piece ball head — no separate abutment."},
    ],
    notes="Mini-implant system — ball-head abutment integral to the implant body."
)

OSSTEM_ETIII_NH = _mk(
    "Osstem|ETIII NH", "Osstem", "ETIII NH",
    connection={"type": "internal_hex", "subtype": "11° morse_taper"},
    platform_switching=True,
    features=["Super-hydrophilic SA surface coated with nano-hydroxyapatite",
              "Bone-level with 11° morse taper internal hex",
              "Taper body with corkscrew thread, narrow threads",
              "Recommended placement torque ≤40 Ncm"],
    implant={"diameters_mm": [3.2, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0],
             "lengths_mm": [6, 7, 8.5, 10, 11.5, 13, 15],
             "bone_types": ["soft_bone", "narrow_ridge", "ultra_wide"],
             "healing_modes": ["submerged"]},
    components=[
        {"type": "cover_screw"}, {"type": "healing_abutment"},
        {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
        {"type": "analog"},
    ],
    notes="Compatible with Mini platform components except cover screw / mount / lab analog."
)

# --- Nobel Biocare platforms (NP / RP / WP) ---
def _nobel(key, name, diams, lens, notes):
    return _mk(
        key, "Nobel Biocare", name,
        connection={"type": "internal_conical"},
        platform_switching=True,
        features=["Strong internal conical connection",
                  "Engineered for Immediate Function",
                  "Platform switching for tissue preservation",
                  "TiUnite surface on implant body"],
        implant={"diameters_mm": diams, "lengths_mm": lens,
                 "bone_types": ["Type I", "Type II", "Type III", "Type IV"],
                 "healing_modes": ["immediate", "submerged"]},
        components=[
            {"type": "cover_screw"}, {"type": "healing_abutment", "subtype": "standard + slim"},
            {"type": "final_abutment", "subtype": "conical abutment family",
             "retention": ["cement", "occlusal_screw"]},
            {"type": "multi_unit_abutment", "angulations_deg": [0, 17, 30]},
            {"type": "ti_base", "cad_cam": True}, {"type": "scanbody"},
            {"type": "impression_coping"}, {"type": "analog"},
        ],
        notes=notes,
    )

NOBEL_ACTIVE_NP = _nobel(
    "Nobel Biocare|NobelActive NP", "NobelActive NP",
    [3.0, 3.5], [7.0, 8.5, 10.0, 11.5, 13.0, 15.0, 16.5, 17.5],
    "NobelActive 3.0 is indicated only for single-unit maxillary lateral and mandibular lateral/central incisors. NobelActive NP is not recommended for posterior use."
)
NOBEL_ACTIVE_RP = _nobel(
    "Nobel Biocare|NobelActive RP", "NobelActive RP",
    [4.3, 5.0], [7.0, 8.5, 10.0, 11.5, 13.0, 15.0, 16.5, 17.5],
    "Primary workhorse platform — universal indication."
)
NOBEL_ACTIVE_WP = _nobel(
    "Nobel Biocare|NobelActive WP", "NobelActive WP",
    [5.5], [7.0, 8.5, 10.0, 11.5, 13.0, 15.0],
    "Wide platform — molar region and wide edentulous ridges."
)
NOBEL_PARALLEL_NP = _nobel(
    "Nobel Biocare|NobelParallel NP", "NobelParallel CC NP",
    [3.75], [6.5, 8.0, 9.5, 11.0, 12.5, 14.5, 17.5],
    "Parallel-walled implant for universal use; cover screw included."
)
NOBEL_PARALLEL_RP = _nobel(
    "Nobel Biocare|NobelParallel RP", "NobelParallel CC RP",
    [4.3, 5.0], [6.5, 8.0, 9.5, 11.0, 12.5, 14.5, 17.5],
    "Universal use across anterior + posterior indications."
)
NOBEL_PARALLEL_WP = _nobel(
    "Nobel Biocare|NobelParallel WP", "NobelParallel CC WP",
    [5.5], [6.5, 8.0, 9.5, 11.0, 12.5, 14.5],
    "Wide-platform variant — larger edentulous ridges."
)

# --- Neodent Grand Morse family ---
def _neodent(key, name, geom, diams, lens, bone, notes):
    return _mk(
        key, "Neodent", name,
        connection={"type": "Grand Morse", "subtype": "conical"},
        platform_switching=True,
        features=geom,
        implant={"diameters_mm": diams, "lengths_mm": lens,
                 "bone_types": bone,
                 "healing_modes": ["submerged", "non_submerged", "immediate"],
                 "surface_options": ["Acqua", "NeoPoros"]},
        components=[
            {"type": "cover_screw", "subtype": "GM Cover Screw"},
            {"type": "healing_abutment", "subtype": "GM Healing + GM Customizable"},
            {"type": "ti_base", "subtype": "GM Exact Titanium Base", "cad_cam": True,
             "notes": "Also available as GM Titanium Base Burn-out Coping."},
            {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
            {"type": "multi_unit_abutment"},
            {"type": "scanbody"}, {"type": "impression_coping"}, {"type": "analog"},
        ],
        notes=notes,
    )

NEODENT_DRIVE_GM_ACQUA = _neodent(
    "Neodent|Drive GM Acqua", "Drive GM (Acqua)",
    ["Tapered implant", "Square-shape threads", "Double threaded", "Reverse cutting chambers", "Rounded apex with sharp edge"],
    [2.0, 2.8, 3.0, 3.5, 4.3, 5.0], [8.0, 10.0, 11.5, 13.0, 16.0, 18.0],
    ["III", "IV"], "Hydrophilic Acqua surface — faster osseointegration; immediate placement post-extraction."
)
NEODENT_DRIVE_GM_NEOPOROUS = _neodent(
    "Neodent|Drive GM Neoporous", "Drive GM (NeoPoros)",
    ["Tapered implant", "Square-shape threads", "Double threaded", "Reverse cutting chambers", "Rounded apex with sharp edge"],
    [2.0, 2.8, 3.0, 3.5, 4.3, 5.0], [8.0, 10.0, 11.5, 13.0, 16.0, 18.0],
    ["III", "IV"], "NeoPoros micro-textured surface. Prosthetic components shared with Drive GM Acqua."
)
NEODENT_HELIX_GM_ACQUA = _neodent(
    "Neodent|Helix GM Acqua", "Helix GM (Acqua)",
    ["Full dual-tapered", "Hybrid contour", "Active apex + helicoidal flutes",
     "Dynamic progressive thread", "Double threaded"],
    [2.35, 3.5, 3.75, 4.0, 4.3, 5.0, 6.0],
    [8.0, 10.0, 11.5, 13.0, 16.0, 18.0, 20.0, 22.5, 25.0],
    ["I", "II", "III", "IV"],
    "All-bone workhorse; Acqua surface. Compatible with the Neo Screwdriver."
)
NEODENT_HELIX_GM_NEOPOROUS = _neodent(
    "Neodent|Helix GM Neoporous", "Helix GM (NeoPoros)",
    ["Full dual-tapered", "Hybrid contour", "Active apex + helicoidal flutes",
     "Dynamic progressive thread", "Double threaded"],
    [2.35, 3.5, 3.75, 4.0, 4.3, 5.0, 6.0],
    [8.0, 10.0, 11.5, 13.0, 16.0, 18.0, 20.0, 22.5, 25.0],
    ["I", "II", "III", "IV"], "NeoPoros surface. Prosthetic components shared with Helix GM Acqua."
)
NEODENT_TITAMAX_GM_ACQUA = _neodent(
    "Neodent|Titamax GM Acqua", "Titamax GM (Acqua)",
    ["Cylindrical (parallel walls)", "V-shape threads", "Double threaded", "Self-tapping apex"],
    [3.5, 3.75, 4.0, 5.0], [7.0, 8.0, 9.0, 11.0, 13.0, 15.0, 17.0],
    ["I", "II", "grafted_areas"], "Acqua surface. Cylindrical geometry for dense bone and grafted sites."
)
NEODENT_TITAMAX_GM_NEOPOROUS = _neodent(
    "Neodent|Titamax GM Neoporous", "Titamax GM (NeoPoros)",
    ["Cylindrical (parallel walls)", "V-shape threads", "Double threaded", "Self-tapping apex"],
    [3.5, 3.75, 4.0, 5.0], [7.0, 8.0, 9.0, 11.0, 13.0, 15.0, 17.0],
    ["I", "II", "grafted_areas"], "NeoPoros surface. Prosthetic components shared with Titamax GM Acqua."
)

# --- Bredent SKY family ---
def _bredent(key, name, connection_type, diams, lens, bone, healing, features, notes,
             components=None):
    default_components = [
        {"type": "cover_screw"}, {"type": "healing_abutment"},
        {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
        {"type": "multi_unit_abutment"},
        {"type": "ti_base", "cad_cam": True}, {"type": "scanbody"},
        {"type": "overdenture"}, {"type": "impression_coping"}, {"type": "analog"},
    ]
    return _mk(
        key, "Bredent", name,
        connection={"type": connection_type, "subtype": None},
        platform_switching="RP" in connection_type or "Regular" in connection_type,
        features=features,
        implant={"diameters_mm": diams, "lengths_mm": lens,
                 "bone_types": bone, "healing_modes": healing},
        components=components if components is not None else default_components,
        notes=notes,
    )

# iter-149: Detailed prosthetic components extracted from official Bredent SKY
# manual (PDF). Surgical drills/ratchets/drivers excluded per user request —
# only restorative components.
_SKY_RP_PROSTHETICS = [
    # Cover screw — auto-supplied with implant.
    {"type": "cover_screw", "material": ["titanium_alloy"],
     "indication": "Two-stage submerged healing; included with implant"},
    # Healing abutments / SKY esthetic gingiva former S/M/L.
    {"type": "healing_abutment", "subtype": "SKY esthetic gingiva former M",
     "platforms": ["regular"], "diameters_mm": [4.45, 4.97, 5.5],
     "gingival_heights_mm": [2.0, 3.0, 4.0, 6.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Regular platform — blueSKY / SKY classic"},
    {"type": "healing_abutment", "subtype": "SKY esthetic gingiva former L",
     "platforms": ["regular"], "diameters_mm": [6.26, 6.95, 7.0],
     "gingival_heights_mm": [2.0, 3.0, 4.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Wide emergence — Regular platform"},
    # Temporary abutments — POM, 18 Ncm, max 6 months in mouth.
    {"type": "temporary_cylinder", "subtype": "SKY temp S abutment",
     "platforms": ["regular"], "diameters_mm": [4.1],
     "gingival_heights_mm": [2.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["POM"], "torque_ncm": 18,
     "indication": "Temporary restoration up to 6 months"},
    {"type": "temporary_cylinder", "subtype": "SKY temp M abutment",
     "platforms": ["regular"], "diameters_mm": [5.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["POM"], "torque_ncm": 18,
     "indication": "Temporary restoration up to 6 months"},
    {"type": "temporary_cylinder", "subtype": "SKY temp L abutment",
     "platforms": ["regular"], "diameters_mm": [7.0],
     "gingival_heights_mm": [3.75], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["POM"], "torque_ncm": 18,
     "indication": "Temporary restoration up to 6 months"},
    # SKY esthetic final abutments — 0° / 15° / 15°R, Ti grade 4, 25 Ncm.
    {"type": "final_abutment", "subtype": "SKY esthetic abutment S 0°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Anterior single-unit"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment M 0°",
     "platforms": ["regular"], "diameters_mm": [5.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Premolar single-unit"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment L 0°",
     "platforms": ["regular"], "diameters_mm": [7.0],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Molar single-unit"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment S 15°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [15],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Anterior with axis correction"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment M 15°",
     "platforms": ["regular"], "diameters_mm": [5.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [15],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Premolar with axis correction"},
    # SKY standard line titanium NP 0°/15°/15°R/25°/25°R.
    {"type": "final_abutment", "subtype": "SKY titanium abutment NP 0°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [1.4], "heights_mm": [10.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Standard prosthetic abutment"},
    {"type": "final_abutment", "subtype": "SKY titanium abutment NP 15°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [0.5], "heights_mm": [10.0], "angulations_deg": [15],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Standard with 15° axis correction"},
    {"type": "final_abutment", "subtype": "SKY titanium abutment NP 25°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [0.5], "heights_mm": [10.0], "angulations_deg": [25],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Standard with 25° axis correction"},
    # SKY uni.cone (multi-unit) — full-arch fixed prostheses.
    {"type": "multi_unit_abutment", "subtype": "SKY uni.cone abutment 0°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [1.0, 2.0, 3.0], "heights_mm": [3.3], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 25,
     "indication": "Straight multi-unit; full-arch"},
    # SKY fast & fixed angled multi-unit.
    {"type": "multi_unit_abutment", "subtype": "SKY fast & fixed abutment 17.5°",
     "platforms": ["regular"], "diameters_mm": [5.65],
     "gingival_heights_mm": [2.15, 3.74], "heights_mm": [3.6], "angulations_deg": [17.5],
     "material": ["titanium_grade4"], "torque_ncm": 25,
     "indication": "Angled multi-unit for All-on-X mesial cant"},
    {"type": "multi_unit_abutment", "subtype": "SKY fast & fixed abutment 35°",
     "platforms": ["regular"], "diameters_mm": [5.65],
     "gingival_heights_mm": [1.06, 1.88], "heights_mm": [3.6], "angulations_deg": [35],
     "material": ["titanium_grade4"], "torque_ncm": 25,
     "indication": "Steeply angled multi-unit for All-on-X distal cant"},
    {"type": "multi_unit_abutment", "subtype": "SKY fast & fixed abutment 0°",
     "platforms": ["regular"], "diameters_mm": [5.65],
     "gingival_heights_mm": [1.0, 2.0, 4.0], "heights_mm": [3.6], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 25,
     "indication": "Straight multi-unit"},
    # SKY elegance BioHPP esthetic abutments.
    {"type": "esthetic_abutment", "subtype": "BioHPP SKY elegance S abutment 0°",
     "platforms": ["regular"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.4], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["BioHPP", "titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Anterior esthetic"},
    {"type": "esthetic_abutment", "subtype": "BioHPP SKY elegance M abutment 0°",
     "platforms": ["regular"], "diameters_mm": [5.5],
     "gingival_heights_mm": [3.3], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["BioHPP", "titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Premolar esthetic"},
    {"type": "esthetic_abutment", "subtype": "BioHPP SKY elegance L abutment 0°",
     "platforms": ["regular"], "diameters_mm": [7.0],
     "gingival_heights_mm": [3.4], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["BioHPP", "titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Molar esthetic"},
    # Ti-bases + scanbodies (SKY uni.fit).
    {"type": "ti_base", "subtype": "SKY uni.fit titanium base S for CEREC",
     "platforms": ["regular"], "diameters_mm": [2.99],
     "gingival_heights_mm": [0.3], "heights_mm": [5.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 25, "cad_cam": True,
     "indication": "CEREC chairside CAD/CAM"},
    {"type": "scanbody", "subtype": "SKY uni.fit scan abutment Intraoral",
     "platforms": ["regular"], "diameters_mm": [4.1], "heights_mm": [7.5],
     "material": ["PEEK"], "torque_ncm": 10,
     "indication": "Intraoral digital impression; exocad / 3shape / Dental Wings libraries"},
    {"type": "scanbody", "subtype": "SKY uni.fit scan abutment Extraoral",
     "platforms": ["regular"], "diameters_mm": [5.8], "heights_mm": [13.5],
     "material": ["PEEK"], "torque_ncm": 10,
     "indication": "Lab scan body"},
    # Locator overdenture.
    {"type": "overdenture_attachment", "subtype": "Locator abutment for SKY",
     "platforms": ["regular"], "diameters_mm": [4.93, 5.65],
     "gingival_heights_mm": [1, 2, 3, 4, 6], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 25,
     "indication": "Overdenture retention; retention elements 0°-10° and 10°-20°"},
    {"type": "overdenture_attachment", "subtype": "Locator abutment 17.5°",
     "platforms": ["regular"], "diameters_mm": [5.65],
     "gingival_heights_mm": [1.7], "angulations_deg": [17.5],
     "material": ["titanium_grade5", "TiNi"], "torque_ncm": 25,
     "indication": "Angled overdenture; All-on-X bar conversion"},
    {"type": "overdenture_attachment", "subtype": "Locator abutment 35°",
     "platforms": ["regular"], "diameters_mm": [5.65],
     "gingival_heights_mm": [0.7], "angulations_deg": [35],
     "material": ["titanium_grade5", "TiNi"], "torque_ncm": 25,
     "indication": "Steeply angled overdenture"},
    {"type": "overdenture_attachment", "subtype": "TiSi.snap 3/1",
     "platforms": ["regular"], "diameters_mm": [4.93],
     "gingival_heights_mm": [1.34], "angulations_deg": [0],
     "material": ["titanium_grade5"], "torque_ncm": 25,
     "indication": "Stud attachment overdenture"},
    {"type": "analog", "subtype": "SKY implant analog",
     "diameters_mm": [4.0], "heights_mm": [14.0],
     "material": ["titanium_grade4"], "indication": "Laboratory model"},
]

_SKY_NP_PROSTHETICS = [
    {"type": "cover_screw", "material": ["titanium_alloy"],
     "indication": "Two-stage submerged healing; included with implant"},
    {"type": "healing_abutment", "subtype": "SKY esthetic gingiva former S",
     "platforms": ["narrow"], "diameters_mm": [4.33, 4.5],
     "gingival_heights_mm": [2.3, 3.0, 4.0, 6.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Narrow platform — narrowSKY"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment S 0°",
     "platforms": ["narrow"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Narrow single-unit"},
    {"type": "final_abutment", "subtype": "SKY esthetic abutment S 15°",
     "platforms": ["narrow"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.0], "heights_mm": [9.0], "angulations_deg": [15],
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"], "torque_ncm": 25,
     "indication": "Narrow with 15° axis correction"},
    {"type": "final_abutment", "subtype": "SKY abutment NP cast-on",
     "platforms": ["narrow"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.5], "heights_mm": [9.5], "angulations_deg": [0],
     "material": ["PMMA", "Au-Pd-Pt-Ir alloy"], "torque_ncm": 25,
     "indication": "Castable for custom abutments; melting range 1400-1490°C"},
    {"type": "ti_base", "subtype": "SKY uni.fit CAD abutment",
     "platforms": ["narrow"], "diameters_mm": [2.9, 3.2], "heights_mm": [3.8],
     "angulations_deg": [0], "material": ["titanium_grade4"], "torque_ncm": 25,
     "cad_cam": True, "indication": "Narrow CAD/CAM CEREC / 3shape / exocad"},
    {"type": "esthetic_abutment", "subtype": "BioHPP SKY elegance S abutment 0°",
     "platforms": ["narrow"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.4], "heights_mm": [9.0], "angulations_deg": [0],
     "material": ["BioHPP", "titanium_grade4"], "retention": ["occlusal_screw"],
     "torque_ncm": 25, "indication": "Narrow esthetic"},
    {"type": "esthetic_abutment", "subtype": "BioHPP SKY elegance S abutment 15°",
     "platforms": ["narrow"], "diameters_mm": [4.5],
     "gingival_heights_mm": [3.4], "heights_mm": [9.0], "angulations_deg": [15],
     "material": ["BioHPP", "titanium_grade4"], "retention": ["occlusal_screw"],
     "torque_ncm": 25, "indication": "Narrow esthetic with 15° axis correction"},
    {"type": "analog", "subtype": "SKY implant analog narrow",
     "diameters_mm": [3.5], "heights_mm": [14.0],
     "material": ["titanium_grade4"], "indication": "Laboratory model"},
]

_SKY_COPA_PROSTHETICS = [
    {"type": "cover_screw", "material": ["titanium_alloy"],
     "indication": "Two-stage submerged healing; included with implant"},
    {"type": "healing_abutment", "subtype": "copaSKY gingiva former M 4 mm",
     "gingival_heights_mm": [4.0], "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Ultra-short implant gingiva former"},
    {"type": "healing_abutment", "subtype": "copaSKY gingiva former M 6 mm F15",
     "gingival_heights_mm": [6.0], "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Longer cuff for thick gingiva"},
    {"type": "esthetic_abutment", "subtype": "BioHPP copaSKY elegance M Abutment 0°",
     "angulations_deg": [0], "material": ["BioHPP", "titanium_grade4"],
     "retention": ["occlusal_screw"],
     "indication": "Esthetic restoration on ultra-short implant"},
    {"type": "final_abutment", "subtype": "copaSKY uni.cone abutment",
     "gingival_heights_mm": [1, 2, 3], "material": ["titanium_grade4"],
     "torque_ncm": 25, "indication": "Multi-unit support on ultra-short copaSKY"},
    {"type": "ti_base", "subtype": "copaSKY titanium base for CEREC",
     "material": ["titanium_grade4"], "cad_cam": True,
     "indication": "CEREC chairside on copaSKY"},
]

_SKY_MINI_PROSTHETICS = [
    {"type": "cover_screw", "material": ["titanium_alloy"],
     "indication": "Two-stage; included with implant"},
    {"type": "healing_abutment", "subtype": "miniSKY gingiva former",
     "material": ["titanium_grade4"], "torque_ncm": 10,
     "indication": "Narrow single-tooth gap restoration"},
    {"type": "final_abutment", "subtype": "miniSKY MD-Abutment Titanium",
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"],
     "indication": "Standard restoration of narrow single-tooth gaps"},
    {"type": "final_abutment", "subtype": "miniSKY MD-Abutment BioXS",
     "material": ["BioXS"], "retention": ["occlusal_screw"],
     "indication": "Esthetic narrow restoration"},
    {"type": "final_abutment", "subtype": "miniSKY uni.fit Abutment",
     "material": ["titanium_grade4"], "retention": ["occlusal_screw"],
     "indication": "Digital workflow on miniSKY"},
    {"type": "ti_base", "subtype": "miniSKY titanium base",
     "material": ["titanium_grade4"], "cad_cam": True,
     "indication": "Digital CAD/CAM on miniSKY"},
    {"type": "analog", "subtype": "miniSKY implant analog",
     "material": ["titanium_grade4"], "indication": "Laboratory model"},
]

BREDENT_BLUE_SKY = _bredent(
    "Bredent|Blue Sky", "blueSKY", "RP (Regular platform, platform-switched)",
    [4.0, 4.5, 5.5], [8, 10, 12, 14, 16],
    ["all"], ["iso_crestal", "supracrestal"],
    ["Platform switch", "Osseo-connect surface (OCS)", "Conical-cylindrical shape",
     "Double thread", "Self-cutting compression thread", "Bone-preserving"],
    "Workhorse of the SKY line. Compatible with SKY esthetic line, SKY elegance, SKY fast & fixed, SKY uni.cone.",
    components=_SKY_RP_PROSTHETICS,
)
BREDENT_MINI_2_SKY = _bredent(
    "Bredent|Mini 2 Sky", "miniSKY", "NP (Narrow platform)",
    [2.8, 3.2], [6, 8, 10, 12, 14],
    ["all"], ["tissue_level"],
    ["Osseo-connect surface (OCS)", "Rotation-locked conical abutment connection",
     "Three-stage functional design", "Cortical relief", "Central stabilisation"],
    "Prosthesis fixation + narrow single-tooth gap restoration.",
    components=_SKY_MINI_PROSTHETICS,
)
BREDENT_COPA_SKY = _bredent(
    "Bredent|Copa Sky", "copaSKY", "Conical-parallel",
    [4.0, 5.0, 6.0], [5.2],
    ["wide_low_height_ridge"], ["bone_level"],
    ["Ultra-short implant", "Single connection geometry", "Torx® as gold standard",
     "Stable reversible implant-abutment connection", "Osseo-connect surface (OCS)"],
    "Ideal for challenging implant-length vs. abutment-height ratios.",
    components=_SKY_COPA_PROSTHETICS,
)
BREDENT_NARROW_SKY = _bredent(
    "Bredent|Narrow Sky", "Narrow Sky", "NP (Narrow platform)",
    [3.5], [8, 10, 12, 14, 16],
    ["all"], ["tissue_level"],
    ["Narrow platform", "Osseo-connect surface (OCS)", "Designed for narrow gaps"],
    "Narrow-diameter variant of blueSKY for narrow gaps and grafted ridges.",
    components=_SKY_NP_PROSTHETICS,
)
BREDENT_SKY_CLASSIC = _bredent(
    "Bredent|Sky Classic", "Sky Classic", "RP (Regular platform)",
    [4.0, 4.5], [8, 10, 12, 14, 16],
    ["all"], ["supracrestal", "iso_crestal"],
    ["Platform switch (4.0-4.5)", "Long machined neck",
     "Semi-transgingival position", "Osseo-connect surface (OCS)"],
    "Ideal for flapless implant placement on narrow and uneven ridges.",
    components=_SKY_RP_PROSTHETICS,
)

# --- iter-145: B&B Dental (Italy) Conexa family + Dura-Vit Slim + Mini ---
def _bb_conexa(key, name, diams, lens, bone, features, notes):
    return _mk(
        key, "B&B Dental", name,
        connection={"type": "Conexa", "subtype": "internal"},
        platform_switching=True,
        features=features,
        implant={"diameters_mm": diams, "lengths_mm": lens, "bone_types": bone,
                 "healing_modes": ["submerged", "non_submerged"]},
        components=[
            {"type": "cover_screw"}, {"type": "healing_abutment"},
            {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
            {"type": "ti_base", "cad_cam": True},
            {"type": "impression_coping"}, {"type": "analog"},
        ],
        notes=notes,
    )

BB_EV_LINE = _bb_conexa(
    "B&B Dental|EV Line", "EV Line",
    [4.0, 4.5, 5.0], [8, 10, 11.5, 13, 15],
    ["D3", "D4"],
    ["Aggressive thread", "Designed for spongy bone (D3-D4)",
     "Maximum primary stability", "Reverse taper collar with annular micro-splining",
     "Self-tapping double-thread spiral"],
    "Conexa connection — prosthetic components interchangeable with 3P, Wide, Pterygo lines."
)
BB_3P = _bb_conexa(
    "B&B Dental|3P", "3P Line",
    [3.5, 4.0, 4.5, 5.0], [8, 10, 11.5, 13, 15],
    ["D1", "D2"],
    ["Gentle thread", "Suitable for compact bone (D1-D2)",
     "Suitable for sites adjacent to maxillary sinus",
     "Triple-thread spiral", "Excellent primary stability"],
    "Conexa connection — cross-compatible with EV, Wide, Pterygo lines."
)
BB_3P_LONG = _bb_conexa(
    "B&B Dental|3P Long", "3P Long",
    [3.5, 4.0], [18, 20, 22, 24],
    ["D1", "D2", "D3", "D4"],
    ["Increased length", "Ideal for canine and pterygoid area",
     "Three-principle thread", "Angled tip"],
    "Conexa family — shares prosthetic components with EV, 3P, Wide, Pterygo lines."
)
BB_WIDE = _bb_conexa(
    "B&B Dental|Wide Line", "Wide Line",
    [5.5, 6.0], [8, 10, 11.5, 13],
    ["post_extraction"],
    ["Larger diameter", "Designed for post-extraction sites",
     "Reverse taper collar with annular micro-splining",
     "Triple-thread spiral", "Bone-friendly tip"],
    "Conexa — cross-compatible with 3P, EV, Pterygo lines."
)
BB_DURAVIT_SLIM = _mk(
    "B&B Dental|Dura-Vit Slim", "B&B Dental", "Dura-Vit Slim",
    connection={"type": "taper_hexagonal", "subtype": None},
    platform_switching=False,
    features=["Taper-hexagonal connection (no morse taper)",
              "Precision positioning of prosthetic components",
              "Increased implant-abutment contact area",
              "Collar micro-threading", "Self-tapping double-thread spiral"],
    implant={"diameters_mm": [3.0, 3.4], "lengths_mm": [10, 11.5, 13, 15],
             "bone_types": ["D1", "D2", "D3", "D4"],
             "healing_modes": ["submerged", "non_submerged"]},
    components=[
        {"type": "cover_screw"}, {"type": "healing_abutment"},
        {"type": "final_abutment", "retention": ["cement", "occlusal_screw"]},
        {"type": "impression_coping"}, {"type": "analog"},
    ],
    notes="Secondary components + analogues are DIFFERENT from EV/3P/Wide/Pterygo Conexa family — not interchangeable."
)

# --- iter-145: Cowell Medi INNO line ---
def _cowell(key, name, connection_label, diams, lens, bone, features, comps_list, notes):
    return _mk(
        key, "Cowell Medi", name,
        connection={"type": connection_label},
        platform_switching="Octa" in connection_label or "Internal" in name.lower(),
        features=features,
        implant={"diameters_mm": diams, "lengths_mm": lens, "bone_types": bone,
                 "healing_modes": ["submerged", "non_submerged"]},
        components=[{"type": c} for c in comps_list],
        notes=notes,
    )

COWELL_INNO_SLA_SH = _cowell(
    "Cowell Medi|INNO SLA-SH", "INNO SLA-SH",
    "11° Tapered Hex 2.5",
    [3.5, 4.0, 4.5, 5.0, 6.0], [7, 8, 10, 12, 14, 16, 18],
    ["normal_bone", "hard_bone"],
    ["11° tapered with 2.5 hex connection", "Wide and deep upper thread",
     "Double tapered thread", "Open thread geometry",
     "4 spiral round cutting edges", "Apex thread with sharp cutting edge"],
    ["cover_screw", "healing_abutment", "final_abutment",
     "impression_coping", "analog", "fixture_mount", "transfer_post", "guide_pin"],
    "Interchangeable with hexagonal morse-tapered fixture (Hex 2.5). Includes submerged (standard / short / narrow) and internal/external prosthetic variants."
)
COWELL_INNO_INTERNAL = _cowell(
    "Cowell Medi|INNO Internal", "INNO Internal",
    "Internal Octa 3.1 (8° taper) / Hex 2.4",
    [3.5, 4.0, 4.5, 5.0, 6.0], [7, 8, 10, 12, 14],
    ["normal_bone", "hard_bone"],
    ["Interchangeable with one-stage internal fixture",
     "Internal Octa connection (8° taper / Octa 3.1)",
     "No-Mount type", "Platform Ø4.8 / Ø5.9"],
    ["cover_screw", "healing_abutment", "abutment_cap", "positioning_cylinder",
     "plastic_coping", "impression_coping", "analog", "solid_abutment"],
    "No-Mount type — octagonal internal connection designed for single-stage internal protocols."
)
COWELL_INNO_EXTERNAL = _cowell(
    "Cowell Medi|INNO External", "INNO External",
    "External Hex 2.7 / 3.4",
    [3.5, 4.0, 4.5, 5.0, 6.0], [7, 8, 10, 12, 14],
    ["normal_bone", "soft_bone"],
    ["Interchangeable with external hexagonal fixture",
     "External hex connection (Hex 2.7 / 3.4)",
     "Platform Ø4.1 / 5.1", "Angled line for precise predictable surgery"],
    ["cover_screw", "healing_abutment", "final_abutment", "impression_coping",
     "transfer_post", "analog", "cemented_abutment", "angulated_abutment"],
    "Classic external hex prosthetic family — compatible across Hex 2.7 and 3.4 platforms."
)

# --- Full list of extra curated catalog records for the seed hook. ---
CATALOG_EXTRA: List[Dict[str, Any]] = [
    OSSTEM_TSIV, OSSTEM_SSIII, OSSTEM_MS, OSSTEM_ETIII_NH,
    NOBEL_ACTIVE_NP, NOBEL_ACTIVE_RP, NOBEL_ACTIVE_WP,
    NOBEL_PARALLEL_NP, NOBEL_PARALLEL_RP, NOBEL_PARALLEL_WP,
    NEODENT_DRIVE_GM_ACQUA, NEODENT_DRIVE_GM_NEOPOROUS,
    NEODENT_HELIX_GM_ACQUA, NEODENT_HELIX_GM_NEOPOROUS,
    NEODENT_TITAMAX_GM_ACQUA, NEODENT_TITAMAX_GM_NEOPOROUS,
    BREDENT_BLUE_SKY, BREDENT_MINI_2_SKY, BREDENT_COPA_SKY,
    BREDENT_NARROW_SKY, BREDENT_SKY_CLASSIC,
    # iter-145
    BB_EV_LINE, BB_3P, BB_3P_LONG, BB_WIDE, BB_DURAVIT_SLIM,
    COWELL_INNO_SLA_SH, COWELL_INNO_INTERNAL, COWELL_INNO_EXTERNAL,
]

# ── Stub records for the other registered systems ──────────────────────────
# These match the keys used in `IMPLANT_SYSTEM_INDICATIONS` so the admin can
# fill them in via the Component Browser UI. Empty components[] surfaces a
# "Pending data" badge in the UI.
STUB_KEYS: List[str] = [
    "Neodent|Drive GM Acqua",
    "Neodent|Drive GM Neoporous",
    "Neodent|Helix GM Acqua",
    "Neodent|Helix GM Neoporous",
    "Neodent|Titamax GM Acqua",
    "Neodent|Titamax GM Neoporous",
    "Nobel Biocare|NobelActive NP",
    "Nobel Biocare|NobelActive RP",
    "Nobel Biocare|NobelActive WP",
    "Nobel Biocare|NobelParallel NP",
    "Nobel Biocare|NobelParallel RP",
    "Nobel Biocare|NobelParallel WP",
    "BioHorizons|Tapered Pro",
    "BioHorizons|Tapered Pro Conical RBT",
    "BioHorizons|Tapered Short Conical RBT",
    "BioHorizons|Tapered IM",
    "BioHorizons|Tapered Short",
    "BioHorizons|Narrow Diameter",
    "Conelog|Progressive Line",
    "Bredent|Mini 2 Sky",
    "Bredent|Copa Sky",
    "Bredent|Narrow Sky",
    "Bredent|Blue Sky",
    "Bredent|Sky Classic",
    "B&B Dental|EV Line",
    "B&B Dental|3P",
    "B&B Dental|3P Long",
    "B&B Dental|Wide Line",
    "B&B Dental|Dura-Vit Slim",
    "Osstem|TS IV",
    "Osstem|SS III",
    "Osstem|MS",
    "Osstem|ETIII NH",
    "NeoBiotech|IS-III active",
    # iter-143 — newly registered brands (full catalogs below).
    "MIS|LANCE+",
    "Alpha-Bio Tec|SPI",
    # iter-145 — Cowell Medi (new brand) registered via seed.
    "Cowell Medi|INNO SLA-SH",
    "Cowell Medi|INNO Internal",
    "Cowell Medi|INNO External",
]


def _stub(key: str) -> Dict[str, Any]:
    brand, name = key.split("|", 1)
    return {
        "key": key,
        "brand": brand,
        "name": name,
        "connection": None,
        "features": [],
        "implant": {},
        "components": [],
        "compatibility_notes": "",
        "is_stub": True,
    }


def get_seed_records() -> List[Dict[str, Any]]:
    """Returns the full list of catalog records (populated + stubs)."""
    return [ANKYLOS_CX, OSSTEM_TSIII] + [_stub(k) for k in STUB_KEYS]


def build_ai_context(record: Dict[str, Any]) -> str:
    """Compact human-readable summary of a catalog record for GPT context.

    Kept short (≤400 tokens) to avoid blowing the prompt budget. Only emits
    sections that have data — stubs return an empty string and the caller
    skips them.
    """
    if not record or record.get("is_stub"):
        return ""
    lines: List[str] = []
    lines.append(f"=== {record['brand']} {record['name']} ===")
    conn = record.get("connection") or {}
    if conn:
        idx = ", ".join(conn.get("indexing", [])) or "—"
        lines.append(f"Connection: {conn.get('type','')} / {conn.get('subtype','')} (indexing: {idx})")
    if record.get("platform_switching"):
        lines.append("Platform switching: YES")
    feats = record.get("features") or []
    if feats:
        lines.append("Features: " + "; ".join(feats[:6]))
    impl = record.get("implant") or {}
    if impl:
        d = impl.get("diameters_mm") or []
        l = impl.get("lengths_mm") or []
        if d: lines.append(f"Implant Ø (mm): {', '.join(map(str, d))}")
        if l: lines.append(f"Implant L (mm): {', '.join(map(str, l))}")
        bt = impl.get("bone_types") or []
        if bt: lines.append(f"Bone types: {', '.join(bt)}")
    comps = record.get("components") or []
    if comps:
        lines.append(f"Components ({len(comps)}):")
        for c in comps:
            sub = f"/{c['subtype']}" if c.get("subtype") else ""
            extras = []
            if c.get("platforms"):
                extras.append("platforms " + "/".join(c["platforms"]))
            if c.get("diameters_mm"):
                extras.append(f"Ø {c['diameters_mm']} mm")
            if c.get("gingival_heights_mm"):
                extras.append(f"GH {c['gingival_heights_mm']} mm")
            if c.get("heights_mm"):
                extras.append(f"H {c['heights_mm']} mm")
            if c.get("angulations_deg"):
                extras.append(f"angulations {c['angulations_deg']}°")
            if c.get("retention"):
                extras.append("retention " + "/".join(c["retention"]))
            if c.get("material"):
                extras.append("material " + "/".join(c["material"]))
            if c.get("torque_ncm"):
                extras.append(f"torque {c['torque_ncm']} Ncm")
            if c.get("indication"):
                extras.append(c["indication"])
            line = f"  - {c['type']}{sub}"
            if extras:
                line += " — " + "; ".join(extras)
            lines.append(line)
    if record.get("compatibility_notes"):
        lines.append("Notes: " + record["compatibility_notes"])
    return "\n".join(lines)
