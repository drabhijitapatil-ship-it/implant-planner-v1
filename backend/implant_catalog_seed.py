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
        {
            "type": "healing_abutment",
            "gingival_heights_mm": [2, 3, 4, 5, 6, 7],
            "notes": "Standard / Wide diameter healing caps — match implant platform.",
        },
        {
            "type": "multi_unit_abutment",
            "angulations_deg": [0, 17, 30],
            "subtype": "straight_and_angled",
            "indication": "Full-arch / All-on-X — Immediate Loading screw-retained prosthesis",
        },
        {
            "type": "final_abutment",
            "subtype": "transfer_abutment",
            "angulations_deg": [0, 15, 25],
            "retention": ["cement", "occlusal_screw"],
            "material": ["titanium"],
            "indication": "Single + bridge, anterior + posterior",
        },
        {
            "type": "ti_base",
            "subtype": "smartbase",
            "cad_cam": True,
            "notes": "For CAD/CAM screw-retained crowns and bridges.",
        },
        {
            "type": "scanbody",
            "material": ["peek"],
        },
        {
            "type": "overdenture",
            "subtype": "locator",
            "indication": "Removable overdenture",
        },
        {
            "type": "overdenture",
            "subtype": "ball_attachment",
            "indication": "Removable overdenture — alternative to Locator",
        },
    ],
    "compatibility_notes": (
        "Internal hex with morse-taper hybrid seat. Component diameter must match the "
        "implant platform (Mini / Regular / Wide). TS III shares prosthetic compatibility "
        "with TS IV within the same platform diameter."
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
