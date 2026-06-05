"""
Straumann BLX Roxolid data — single source of truth.

iter-290 (Feb 2026): Drilling-protocol workflows COMPLETELY REWRITTEN
to mirror the official Straumann BLX Implants System surgical guide
(702115-D-03-en, section 5.2 "Workflow for BLX Ø X.X mm").

Each implant Ø has its own published workflow chart with Soft / Medium /
Hard bone branches. Drill numbering (Drill 2..9) and reference numbers
(066.05xx) are preserved verbatim.

Cortical-only depths (from the universal legend footnote):
  • 4 mm  for implants with a length of 6 mm and 8 mm
  • 6 mm  for implants with a length of 10 mm to 18 mm

Drill-tip warning (universal):
  • The drill tip is up to 1.0 mm longer than the insertion depth.
    Drilling to the 10 mm marking creates an 11 mm osteotomy.

RPM:
  • All drills           → 800 rpm with copious irrigation
  • Implant placement    → 15 rpm

Connection: Straumann TorcFit™ 15° conical-cylindrical.
"""

from __future__ import annotations
from typing import Dict, List

BRAND = "Straumann"

RB_LENGTHS = [6, 8, 10, 12, 14, 16, 18]
WB_LENGTHS = [6, 8, 10, 12, 14, 16]
RB_DIAMETERS = [3.5, 4.0, 4.5]
WB_DIAMETERS = [5.0, 5.5, 6.0]

SYSTEM_SIZES: Dict[str, Dict[str, List]] = {
    "BLX Roxolid SLActive - RB Platform": {
        "diameters": list(RB_DIAMETERS),
        "lengths_by_diameter": {d: list(RB_LENGTHS) for d in RB_DIAMETERS},
    },
    "BLX Roxolid SLActive - WB Platform": {
        "diameters": list(WB_DIAMETERS),
        "lengths_by_diameter": {d: list(WB_LENGTHS) for d in WB_DIAMETERS},
    },
    "BLX Roxolid SLA - RB Platform": {
        "diameters": list(RB_DIAMETERS),
        "lengths_by_diameter": {d: list(RB_LENGTHS) for d in RB_DIAMETERS},
    },
    "BLX Roxolid SLA - WB Platform": {
        "diameters": list(WB_DIAMETERS),
        "lengths_by_diameter": {d: list(WB_LENGTHS) for d in WB_DIAMETERS},
    },
}

SYSTEM_META: Dict[str, Dict[str, str]] = {
    "BLX Roxolid SLActive - RB Platform": {"platform": "RB", "surface": "SLActive", "material": "Roxolid"},
    "BLX Roxolid SLActive - WB Platform": {"platform": "WB", "surface": "SLActive", "material": "Roxolid"},
    "BLX Roxolid SLA - RB Platform":      {"platform": "RB", "surface": "SLA",      "material": "Roxolid"},
    "BLX Roxolid SLA - WB Platform":      {"platform": "WB", "surface": "SLA",      "material": "Roxolid"},
}

# Indications (kept from iter-283 — only the drill engine was wrong).
INDICATIONS: Dict[str, Dict] = {
    "Straumann|BLX Roxolid SLActive - RB Platform": {
        "indication": "Roxolid® bone-level tapered implant with SLActive® hydrophilic surface. D1-D4 bone types. Immediate, early and conventional placement and loading; supports All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLActive - WB Platform": {
        "indication": "Wide-Base Roxolid® bone-level tapered implant with SLActive® surface — posterior, wide-ridge and fresh extraction sockets. D1-D4 bone types. Supports All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - RB Platform": {
        "indication": "Roxolid® bone-level tapered implant with conventional SLA® surface. D1-D4 bone types. Conventional delayed-loading single and multi-unit restorations.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - WB Platform": {
        "indication": "Wide-Base Roxolid® bone-level tapered implant with SLA® surface. D1-D4 bone types, conventional delayed-loading.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
}

SYSTEM_DETAILS: Dict[str, Dict[str, str]] = {
    "straumann blx roxolid slactive - rb platform": {"indications": "D1-D4 bone types. Immediate, early and conventional placement and loading. Single tooth, multi-unit bridges, full-arch / all-on-X.", "features": "Roxolid® (TiZr) alloy. SLActive® hydrophilic surface. Tapered bone-level body with apically self-cutting threads. Straumann TorcFit™ connection. RB platform Ø3.5/4.0/4.5."},
    "straumann blx roxolid slactive - wb platform": {"indications": "D1-D4. Immediate / early / conventional. Wide ridges, posterior molars, fresh extraction sockets, All-on-X.", "features": "Wide-Base Roxolid®. SLActive® surface. TorcFit™ connection. WB platform Ø5.0/5.5/6.0."},
    "straumann blx roxolid sla - rb platform": {"indications": "D1-D4. Conventional delayed-loading single and multi-unit restorations.", "features": "Roxolid® bone-level tapered. SLA® (sandblasted, large-grit, acid-etched) surface. TorcFit™. RB platform Ø3.5/4.0/4.5."},
    "straumann blx roxolid sla - wb platform": {"indications": "D1-D4. Conventional delayed-loading single and multi-unit restorations in wide ridges and posterior sites.", "features": "Wide-Base Roxolid® bone-level tapered. SLA® surface. TorcFit™. WB platform Ø5.0/5.5/6.0."},
}

# ── Component families per platform (representative subset) ───────────────
COMPONENT_FAMILIES_BY_PLATFORM: Dict[str, List[Dict]] = {
    "RB": [
        {"type": "closure_screw", "indication": "Submerged healing"},
        {"type": "healing_abutment", "diameters": [3.8, 4.5, 6.0], "gingival_heights_mm": [1.5, 2.5, 3.5], "indication": "Transmucosal / open healing"},
        {"type": "temporary_abutment", "diameters": [3.8, 4.5], "indication": "Provisional restoration"},
        {"type": "anatomic_abutment_titanium", "variants": ["straight", "angled_17"], "torque_ncm": 35},
        {"type": "variobase_crown", "diameters": [3.8, 4.5], "cad_cam": True, "torque_ncm": 35},
        {"type": "variobase_crown_as", "diameters": [4.5], "indication": "Angulated Screw Channel up to 25°"},
        {"type": "screw_retained_abutment", "diameters": [4.6], "angulations": [0, 17, 30], "torque_ncm": 35},
        {"type": "novaloc", "diameters": [3.8], "angulations": [0, 15], "indication": "Removable overdenture"},
        {"type": "impression_post", "variants": ["open_tray", "closed_tray"]},
        {"type": "implant_analog"},
    ],
    "WB": [
        {"type": "closure_screw", "indication": "Submerged healing"},
        {"type": "healing_abutment", "diameters": [4.5, 6.0], "gingival_heights_mm": [0.75, 1.5], "indication": "Transmucosal / open healing — WB"},
        {"type": "temporary_abutment", "diameters": [5.5], "indication": "Provisional restoration"},
        {"type": "anatomic_abutment_titanium", "variants": ["straight", "angled_17"], "torque_ncm": 35},
        {"type": "variobase_crown", "diameters": [5.5], "cad_cam": True, "torque_ncm": 35},
        {"type": "variobase_crown_as", "diameters": [5.5], "indication": "Angulated Screw Channel up to 25° — WB"},
        {"type": "screw_retained_abutment", "diameters": [4.6], "angulations": [0, 17, 30], "torque_ncm": 35},
        {"type": "impression_post", "variants": ["open_tray", "closed_tray"]},
        {"type": "implant_analog"},
    ],
}


def components_for(system_name: str) -> List[Dict]:
    import copy
    return copy.deepcopy(COMPONENT_FAMILIES_BY_PLATFORM[SYSTEM_META[system_name]["platform"]])


# ─────────────────────────────────────────────────────────────────────────
# Drill catalogue from the BLX Implants System Surgical Guide
# 702115-D-03-en, section 5.2 (Workflow for BLX Ø …)
#
# Each drill entry:  (label, diameter_mm, ref_number)
# ─────────────────────────────────────────────────────────────────────────
NEEDLE_DRILL    = ("Needle Drill",     1.6, "026.0056")
PILOT_DRILL_1   = ("Pilot Drill 1",    2.2, "066.0511")
ALIGNMENT_22    = ("Alignment Pin",    2.2, "—")
DRILL_2         = ("Drill 2",          2.8, "066.0512")
ALIGNMENT_28    = ("Alignment Pin",    2.8, "066.1001")
DRILL_3         = ("Drill 3",          3.2, "066.0513")
DRILL_4         = ("Drill 4",          3.5, "066.0514")
DRILL_5         = ("Drill 5",          3.7, "066.0515")
DRILL_6         = ("Drill 6",          4.2, "066.0516")
DRILL_7         = ("Drill 7",          4.7, "066.0517")
DRILL_8         = ("Drill 8",          5.2, "066.0518")
DRILL_9         = ("Drill 9",          6.2, "066.0519")

# Workflow rows: (drill_tuple, "full" | "cortical")
# Soft = D3/D4 bone, Medium = D2 bone, Hard = D1 bone.
# Implant Ø lookup — if user has Ø4.0 we map to the catalog Ø4.0 workflow.
# Ø6.0 (user added) maps to the catalog Ø6.5 workflow, the only published
# wide-base sequence above Ø5.5.
WORKFLOWS: Dict[float, Dict[str, List]] = {
    3.5: {
        "Soft":   [(DRILL_2, "full")],
        "Medium": [(DRILL_2, "full"), (ALIGNMENT_28, "passive"), (DRILL_3, "full")],
        "Hard":   [(DRILL_2, "full"), (DRILL_4, "full")],
    },
    3.75: {
        "Soft":   [(DRILL_2, "full")],
        "Medium": [(DRILL_2, "full"), (ALIGNMENT_28, "passive"), (DRILL_3, "full"), (DRILL_5, "cortical")],
        "Hard":   [(DRILL_2, "full"), (DRILL_4, "full"), (DRILL_5, "cortical")],
    },
    4.0: {
        "Soft":   [(DRILL_2, "full")],
        "Medium": [(DRILL_2, "full"), (ALIGNMENT_28, "passive"), (DRILL_3, "full")],
        "Hard":   [(DRILL_2, "full"), (DRILL_3, "full"), (DRILL_4, "full")],
    },
    4.5: {
        "Soft":   [(DRILL_2, "full")],
        "Medium": [(DRILL_2, "full"), (ALIGNMENT_28, "passive"), (DRILL_3, "full"), (DRILL_5, "cortical")],
        "Hard":   [(DRILL_2, "full"), (DRILL_5, "full"), (DRILL_6, "cortical")],
    },
    5.0: {
        "Soft":   [(DRILL_3, "full")],
        "Medium": [(DRILL_3, "full"), (DRILL_6, "full"), (DRILL_7, "cortical")],
        "Hard":   [(DRILL_3, "full"), (DRILL_6, "full"), (DRILL_7, "full"), (DRILL_8, "cortical")],
    },
    5.5: {
        "Soft":   [(DRILL_3, "full")],
        "Medium": [(DRILL_3, "full"), (DRILL_6, "full"), (DRILL_7, "cortical")],
        "Hard":   [(DRILL_3, "full"), (DRILL_6, "full"), (DRILL_7, "full"), (DRILL_8, "cortical")],
    },
    6.0: {  # mapped to catalog Ø6.5 workflow (closest published Ø > 5.5)
        "Soft":   [(DRILL_3, "full")],
        "Medium": [(DRILL_3, "full"), (DRILL_4, "full"), (DRILL_6, "full"), (DRILL_8, "cortical")],
        "Hard":   [(DRILL_3, "full"), (DRILL_4, "full"), (DRILL_6, "full"), (DRILL_8, "full"), (DRILL_9, "cortical")],
    },
    6.5: {
        "Soft":   [(DRILL_3, "full")],
        "Medium": [(DRILL_3, "full"), (DRILL_4, "full"), (DRILL_6, "full"), (DRILL_8, "cortical")],
        "Hard":   [(DRILL_3, "full"), (DRILL_4, "full"), (DRILL_6, "full"), (DRILL_8, "full"), (DRILL_9, "cortical")],
    },
}

_BONE_MAP = {"D1": "Hard", "D2": "Medium", "D3": "Soft", "D4": "Soft"}


def _cortical_depth_for(implant_length: float) -> float:
    """Universal Straumann BLX legend:
       4 mm for implants of 6/8 mm length, 6 mm for implants of 10-18 mm.
    """
    return 4.0 if implant_length <= 8.0 else 6.0


def generate_blx_protocol(
    system_name: str,
    implant_diameter: float,
    implant_length: float,
    bone: str,
) -> List[Dict]:
    """Render the published BLX workflow for a (Ø, length, bone) cell.

    Output schema MATCHES the rest of the drill-protocol families
    (Ankylos / Helix / etc.) so the frontend `DrillingProtocolScreen`
    can render every row: `drill_type / code / diameter / depth /
    rpm / irrigation / note`.
    """
    bone_branch = _BONE_MAP.get(bone, "Medium")
    workflow = WORKFLOWS.get(implant_diameter)
    if not workflow:
        return []

    osteotomy_marking = float(implant_length)   # drill to L-marking
    cortical_depth = _cortical_depth_for(implant_length)
    steps: List[Dict] = []
    step_num = 1

    # ── Mark the implantation site ─────────────────────────────────
    steps.append({
        "step": step_num,
        "drill_type": "Pilot Drill",
        "code": f"{NEEDLE_DRILL[0]} (ref {NEEDLE_DRILL[2]})",
        "diameter": NEEDLE_DRILL[1],
        "depth": "Cortex only — mark implantation site",
        "rpm": "800",
        "irrigation": True,
        "note": "Mark the implantation site (Straumann BLX Surgical Guide §5.2).",
    })
    step_num += 1

    # ── Pilot drilling / Check implant axis (always Pilot Drill 1 +
    #    Alignment Pin 2.2 mm) ──
    steps.append({
        "step": step_num,
        "drill_type": "Short Pilot Drill",
        "code": f"{PILOT_DRILL_1[0]} (ref {PILOT_DRILL_1[2]})",
        "diameter": PILOT_DRILL_1[1],
        "depth": osteotomy_marking,
        "rpm": "800",
        "irrigation": True,
        "note": "Drill to the marking corresponding to the implant length. "
                "Drill tip extends ~1 mm beyond the marking — actual "
                "osteotomy = length + 1 mm.",
    })
    step_num += 1
    steps.append({
        "step": step_num,
        "drill_type": "Alignment Pin",
        "code": f"{ALIGNMENT_22[0]} {ALIGNMENT_22[1]} mm",
        "diameter": ALIGNMENT_22[1],
        "depth": "Verify alignment",
        "rpm": "—",
        "irrigation": False,
        "note": "Check implant axis with the Ø2.2 mm Alignment Pin before proceeding.",
    })
    step_num += 1

    # ── Decide on bone density → finalise implant bed ──
    # Map drill labels to the UI's drill_type palette so the colour
    # badges render correctly (Soft = Soft Bone Drill, Medium/Hard =
    # Dense Bone Drill, cortical = Crestal Bone Drill).
    palette_for = (
        "Soft Bone Drill" if bone_branch == "Soft"
        else "Dense Bone Drill"
    )
    for entry, kind in workflow[bone_branch]:
        label, drill_d, ref = entry
        if kind == "cortical":
            steps.append({
                "step": step_num,
                "drill_type": "Crestal Bone Drill",
                "code": f"{label} (ref {ref})" if ref != "—" else label,
                "diameter": drill_d,
                "depth": f"{cortical_depth:g} mm — cortical only",
                "rpm": "800",
                "irrigation": True,
                "note": (
                    f"Cortical-only drill. Depth: {cortical_depth:g} mm "
                    "(legend: 4 mm for 6-8 mm implants; 6 mm for 10-18 mm implants)."
                ),
            })
        elif kind == "passive":  # Alignment Pin 2.8 mm
            steps.append({
                "step": step_num,
                "drill_type": "Alignment Pin",
                "code": f"{label} {drill_d} mm",
                "diameter": drill_d,
                "depth": "Verify alignment",
                "rpm": "—",
                "irrigation": False,
                "note": "Re-check implant axis with the Ø2.8 mm Alignment Pin.",
            })
        else:  # full-depth twist drill
            steps.append({
                "step": step_num,
                "drill_type": palette_for,
                "code": f"{label} (ref {ref})",
                "diameter": drill_d,
                "depth": osteotomy_marking,
                "rpm": "800",
                "irrigation": True,
                "note": (
                    "Drill to the marking corresponding to the implant length. "
                    "Drill tip extends ~1 mm beyond the marking — actual "
                    "osteotomy = length + 1 mm."
                ),
            })
        step_num += 1

    # ── Implant placement (15 rpm — ratchet or handpiece) ──
    surface = SYSTEM_META[system_name]["surface"]
    steps.append({
        "step": step_num,
        "drill_type": "Implant Placement",
        "code": f"BLX Ø{implant_diameter:g} {surface}, {implant_length:g} mm RXD",
        "diameter": implant_diameter,
        "depth": osteotomy_marking,
        "rpm": "15",
        "irrigation": False,
        "note": (
            "Seat the BLX implant using the Loxim® Transfer Piece at "
            "15 rpm. Final insertion torque 35 Ncm (range 30-80 Ncm)."
        ),
    })
    return steps
