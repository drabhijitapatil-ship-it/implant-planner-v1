"""iter-Jun-2026: Intraoral scanner master list (seeded from the user's
'Intraoral Scanners.md'). Company → models, in the order supplied."""

INTRAORAL_SCANNERS = [
    ("iTero", ["iTero Lumina", "iTero Lumina Pro", "iTero Element 5D Plus", "iTero Element Plus Series", "iTero Element 5D"]),
    ("3Shape", ["TRIOS 6", "TRIOS 5", "TRIOS 5 Move+", "TRIOS 4", "TRIOS 3", "TRIOS Core"]),
    ("Dentsply Sirona", ["Primescan 2", "Primescan (AC)", "Primescan Connect", "CEREC Omnicam (legacy)"]),
    ("Medit", ["i900", "i900 Classic", "i900 Mobility", "i700 Wireless", "i700", "i600", "i500"]),
    ("Planmeca", ["Emerald S", "Emerald"]),
    ("DEXIS (Envista)", ["IS 3800W", "IS 3800", "IS 3700", "IS 3600", "Imprevo"]),
    ("SHINING 3D", ["Aoralscan Elite Wireless", "Aoralscan Elite", "Aoralscan ELF", "Aoralscan 3", "Aoralscan 3 Wireless", "Aoralscan 3 Neo", "Aoralscan Lync"]),
    ("Straumann Group", ["Virtuo Vivo", "DWIO"]),
    ("Vatech", ["EzScan", "EzScan i"]),
    ("Glidewell", ["fastscan.io", "fastscan.io i900"]),
    ("Panda Scanner (Freqty)", ["Panda P4", "Panda P3", "Panda Smart", "Panda 3+"]),
    ("Eighteeth Medical", ["Helios 500", "Helios 600", "Helios 680"]),
    ("Runyes", ["3DS 3.0", "3DS V3 Pro"]),
    ("Aidite", ["Infinity 5", "Rapid 5"]),
    ("Alliedstar", ["AS 260", "AS 200E", "AS 100", "Sensa"]),
    ("UP3D", ["UP360", "UP610", "UP510"]),
    ("MyRay (Cefla)", ["MyScan WL", "MyScan"]),
    ("Zirkonzahn", ["Detection Eye"]),
    ("Huvitz", ["OCTiX"]),
    ("Densys", ["Densys IOS"]),
    ("Brütsch Technology", ["btScan"]),
    ("Video Dental Concepts", ["QuickScan IOS"]),
    ("Launca Medical", ["DL-300P", "DL-300", "DL-206P", "DL-202"]),
    ("Fussen Technology", ["S7000", "S6500", "S6000"]),
    ("Yucera", ["YRC-S05", "YRC-S03", "YRC-S02"]),
    ("Cameo Dental Tech", ["Cameo Elite 3"]),
    ("Hefei Meyer", ["Myscan"]),
    ("Aident", ["AI-30"]),
    ("Waldent", ["BLZ IntraVue 900 Ai"]),
    ("Unicorn DenMart", ["Nova 900", "Elite IOS"]),
    ("Orikam Healthcare", ["Helios 500-3D", "Helios 680"]),
    ("Illusion Dental Lab", ["iScan Pro"]),
    ("Dentcare", ["dfine"]),
    ("COXO", ["COXO IOS"]),
    ("TruAbutment", ["ioConnect"]),
]

# ── Phase 4 Step 1 impression option lists (single source of truth) ──────────
IMPRESSION_TECHNIQUES = {
    "open_tray": "Open Tray / Direct Impression",
    "closed_tray": "Closed Tray / Indirect Impression",
}

IMPRESSION_MATERIAL_GROUPS = [
    ("PVS / Addition Silicone", [
        "PVS/Addition Silicone - Putty - Light Body",
        "PVS/Addition Silicone - Heavy Body - Light Body",
        "PVS/Addition Silicone - Monophase",
    ]),
    ("Polyether", [
        "Polyether - Heavy Body - Light Body",
        "Polyether Monophase",
        "Polyether - Medium Body",
        "Polyether - Light Body",
    ]),
    ("Condensation Silicone", [
        "Condensation Silicone - Putty - Light Body",
    ]),
]
IMPRESSION_MATERIALS = [m for _, ms in IMPRESSION_MATERIAL_GROUPS for m in ms]

# Legacy ids stored by iter-192 — still displayed for old cases.
LEGACY_MATERIAL_LABELS = {
    "polyether": "Polyether",
    "heavy_light_body": "Heavy and Light body",
    "putty_light_body": "Putty and Light body",
}

SCAN_BODY_MATERIALS = ["PEEK", "Metal", "Hybrid"]
SCAN_BODY_TYPES = ["Conventional/Vertical Scan Body", "Horizontal Scan Body (Scan Flags)", "Photogrammetry Scan Body"]
SCAN_LEVELS = ["Abutment level", "Implant level", "Multiunit level"]


def material_label(p4: dict) -> str:
    m = p4.get("impression_material") or ""
    if not m:
        return ""
    if m == "Other":
        return (p4.get("impression_material_other") or "Other").strip()
    return LEGACY_MATERIAL_LABELS.get(m, m)


def scanner_label(p4: dict) -> str:
    comp = p4.get("ios_scanner_company") or ""
    model = p4.get("ios_scanner_model") or ""
    if comp == "Other":
        comp = (p4.get("ios_scanner_company_other") or "Other").strip()
    if model == "Other":
        model = (p4.get("ios_scanner_model_other") or "Other").strip()
    return " — ".join([x for x in (comp, model) if x])


def impression_rows(p4: dict):
    """Ordered (label, value) rows describing the impression choice; shared by
    the case PDF, Lab Slip and text summaries. Handles legacy field names."""
    if not p4 or not p4.get("impression_type"):
        return []
    rows = []
    if p4["impression_type"] == "conventional":
        rows.append(("Impression Type", "Conventional Impression"))
        tray = p4.get("conventional_tray_type")
        if tray:
            rows.append(("Impression Technique", IMPRESSION_TECHNIQUES.get(tray, tray.replace("_", " ").title())))
        mat = material_label(p4)
        if mat:
            rows.append(("Impression Material Used", mat))
        return rows
    rows.append(("Impression Type", "Intraoral Scan"))
    sc = scanner_label(p4)
    if sc:
        rows.append(("Intraoral Scanner Used", sc))
    sbm = p4.get("ios_scan_body_material") or ", ".join(p4.get("scan_body_types") or [])
    if sbm:
        rows.append(("Scan Body Material", sbm))
    sbt = p4.get("ios_scan_body_types") or p4.get("scan_types") or []
    if sbt:
        rows.append(("Type of Scan Body", ", ".join(sbt)))
    lvl = p4.get("ios_scan_level") or ", ".join(p4.get("scan_levels") or [])
    if lvl:
        rows.append(("Scan Level", lvl))
    return rows
