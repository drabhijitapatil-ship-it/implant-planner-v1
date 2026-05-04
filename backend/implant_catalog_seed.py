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
        {"type": "cover_screw", "subtype": "narrow + regular conical",
         "indication": "Submerged healing"},
        {"type": "healing_abutment",
         "subtype": "regular / wide / extra-wide",
         "indication": "Narrow + Regular platforms (Extra-Wide on Regular only)"},
        {"type": "final_abutment", "indication": "Restorative components — refer to platform-specific catalog"},
        {"type": "multi_unit_abutment",
         "indication": "Multi-unit prosthetic support; single platform simplifies full-arch cases"},
        {"type": "ti_base", "cad_cam": True},
        {"type": "scanbody"},
        {"type": "overdenture", "indication": "Compatible with overdenture restorations (page 18 of catalog)"},
        {"type": "impression_coping"},
        {"type": "analog"},
        {"type": "surgical_drill",
         "subtype": "pilot / soft-bone / dense-bone / crestal-bone",
         "notes": "Pro Freehand and Pro Guided Surgical Kits"},
        {"type": "implant_driver",
         "subtype": "color-coded conical driver",
         "notes": "Black = Narrow, Yellow = Regular prosthetic connection"},
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
            if c.get("angulations_deg"):
                extras.append(f"angulations {c['angulations_deg']}°")
            if c.get("gingival_heights_mm"):
                extras.append(f"GH {c['gingival_heights_mm']} mm")
            if c.get("retention"):
                extras.append("retention " + "/".join(c["retention"]))
            if c.get("material"):
                extras.append("mat " + "/".join(c["material"]))
            if c.get("indication"):
                extras.append(c["indication"])
            line = f"  - {c['type']}{sub}"
            if extras:
                line += " — " + "; ".join(extras)
            lines.append(line)
    if record.get("compatibility_notes"):
        lines.append("Notes: " + record["compatibility_notes"])
    return "\n".join(lines)
