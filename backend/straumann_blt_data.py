"""
Straumann BLT (Bone Level Tapered) data — single source of truth.

iter-292 (Feb 2026): Three BLT implant systems with the user-confirmed
diameter × length matrices and the verbatim drilling-protocol workflows
extracted from the official Straumann BLT Basic Information PDF
(702167-en).

Three systems share an identical surgical workflow per (Ø, bone) cell
and only differ by surface + material:
    • "BLT Roxolid SLActive"   — Roxolid alloy, SLActive surface
    • "BLT Roxolid SLA"        — Roxolid alloy, SLA surface
    • "BLT Ti SLA"             — Ti grade-4, SLA surface

Connection: Straumann CrossFit® — Small CrossFit (SC) for Ø2.9 mm,
Narrow CrossFit (NC) for Ø3.3 mm, Regular CrossFit (RC) for Ø4.1 mm
and Ø4.8 mm.

Drill-tip warning is 0.5 mm for BLT (vs 1.0 mm for BLX).
Final insertion torque: ≤35 Ncm.
"""

from __future__ import annotations
from typing import Dict, List

BRAND = "Straumann"

# ── Per-system Ø × L matrices (verbatim from user iter-292 message) ───────
SYSTEM_SIZES: Dict[str, Dict[float, List[float]]] = {
    "BLT Roxolid SLActive": {
        2.9: [10, 12, 14],
        3.3: [6, 8, 10, 12, 14, 16, 18],
        4.1: [6, 8, 10, 12, 14, 16, 18],
        4.8: [6, 8, 10, 12, 14, 16, 18],
    },
    "BLT Roxolid SLA": {
        2.9: [10, 12, 14],
        3.3: [6, 8, 10, 12, 14, 16],
        4.1: [6, 8, 10, 12, 14, 16],
        4.8: [6, 8, 10, 12, 14, 16],
    },
    "BLT Ti SLA": {
        3.3: [6, 8, 10, 12, 14, 16],
        4.1: [6, 8, 10, 12, 14, 16],
        4.8: [6, 8, 10, 12, 14, 16],
    },
}

# CrossFit connection size by implant Ø.
_CROSSFIT = {2.9: "SC", 3.3: "NC", 4.1: "RC", 4.8: "RC"}

SYSTEM_META: Dict[str, Dict[str, str]] = {
    "BLT Roxolid SLActive": {"surface": "SLActive", "material": "Roxolid"},
    "BLT Roxolid SLA":      {"surface": "SLA",      "material": "Roxolid"},
    "BLT Ti SLA":           {"surface": "SLA",      "material": "Ti Grade 4"},
}

INDICATIONS: Dict[str, Dict] = {
    "Straumann|BLT Roxolid SLActive": {
        "indication": "Roxolid® Bone Level Tapered implant with SLActive® hydrophilic surface. Apically tapered, self-cutting design — high primary stability in soft bone and fresh extraction sockets. D1-D4. Immediate, early and conventional placement and loading. CrossFit® connection (SC/NC/RC).",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLT Roxolid SLA": {
        "indication": "Roxolid® Bone Level Tapered implant with conventional SLA® (sandblasted, large-grit, acid-etched) surface. D1-D4. Conventional and immediate placement; conventional loading. CrossFit® connection.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLT Ti SLA": {
        "indication": "Ti Grade 4 Bone Level Tapered implant with SLA® surface. D1-D4. Conventional and immediate placement; conventional loading. CrossFit® connection.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
}

SYSTEM_DETAILS: Dict[str, Dict[str, str]] = {
    "straumann blt roxolid slactive": {"indications": "D1-D4. Immediate, early and conventional placement and loading. Soft bone / fresh extraction sockets where primary stability is key.", "features": "Roxolid® (TiZr) alloy. SLActive® hydrophilic surface. Apically tapered self-cutting body (Bone Control Design™). CrossFit® connection (SC Ø2.9 / NC Ø3.3 / RC Ø4.1 / RC Ø4.8)."},
    "straumann blt roxolid sla":     {"indications": "D1-D4. Conventional and immediate placement.", "features": "Roxolid® bone-level tapered. SLA® (sandblasted, large-grit, acid-etched) surface. CrossFit® connection. SC/NC/RC platforms."},
    "straumann blt ti sla":          {"indications": "D1-D4. Conventional and immediate placement.", "features": "Ti Grade 4 bone-level tapered. SLA® surface. CrossFit® connection. NC/RC platforms."},
}

COMPONENT_FAMILIES_BY_PLATFORM: Dict[str, List[Dict]] = {
    "SC": [
        {"type": "closure_screw"},
        {"type": "healing_abutment", "diameters": [3.6], "gingival_heights_mm": [2, 3.5, 5]},
        {"type": "temporary_abutment"},
        {"type": "variobase_crown", "diameters": [3.6]},
        {"type": "screw_retained_abutment", "diameters": [4.6], "angulations": [0, 17, 30]},
        {"type": "impression_post", "variants": ["open_tray", "closed_tray"]},
        {"type": "implant_analog"},
    ],
    "NC": [
        {"type": "closure_screw"},
        {"type": "healing_abutment", "diameters": [3.6, 4.8], "gingival_heights_mm": [2, 3.5, 5]},
        {"type": "temporary_abutment"},
        {"type": "anatomic_abutment_titanium", "variants": ["straight", "angled_15"]},
        {"type": "variobase_crown", "diameters": [3.6, 4.8]},
        {"type": "screw_retained_abutment", "diameters": [4.6], "angulations": [0, 17, 30]},
        {"type": "novaloc", "diameters": [4.0], "angulations": [0, 15]},
        {"type": "impression_post", "variants": ["open_tray", "closed_tray"]},
        {"type": "implant_analog"},
    ],
    "RC": [
        {"type": "closure_screw"},
        {"type": "healing_abutment", "diameters": [4.8, 6.5], "gingival_heights_mm": [2, 3.5, 5]},
        {"type": "temporary_abutment"},
        {"type": "anatomic_abutment_titanium", "variants": ["straight", "angled_15"]},
        {"type": "variobase_crown", "diameters": [4.8, 6.5]},
        {"type": "variobase_crown_as", "diameters": [4.8, 6.5], "indication": "Angulated Screw Channel up to 25°"},
        {"type": "screw_retained_abutment", "diameters": [4.6], "angulations": [0, 17, 30]},
        {"type": "novaloc", "diameters": [4.0], "angulations": [0, 15]},
        {"type": "impression_post", "variants": ["open_tray", "closed_tray"]},
        {"type": "implant_analog"},
    ],
}


def components_for(system_name: str) -> List[Dict]:
    """Return RC components (the most common platform) so each BLT
    system carries a representative prosthetic catalogue — Ø-specific
    parts (SC / NC) live in `COMPONENT_FAMILIES_BY_PLATFORM` and can be
    surfaced later by Ø-aware queries."""
    import copy
    return copy.deepcopy(COMPONENT_FAMILIES_BY_PLATFORM["RC"])


# ─── BLT drill catalog ─────────────────────────────────────────────────
NEEDLE_DRILL     = ("Needle Drill",        1.6, "026.0056")  # mark site
X_PILOT_VELO     = ("X Pilot VeloDrill™",  2.2, "—")
ALIGN_22         = ("Alignment Pin",       2.2, "—")
X_VELO_28        = ("X VeloDrill™",        2.8, "—")
X_VELO_35        = ("X VeloDrill™",        3.5, "—")
X_VELO_42        = ("X VeloDrill™",        4.2, "—")

PROFILE_29       = ("BLT Profile Drill",   2.9, "—")
PROFILE_33       = ("BLT Profile Drill",   3.3, "—")
PROFILE_41       = ("BLT Profile Drill",   4.1, "—")
PROFILE_48       = ("BLT Profile Drill",   4.8, "—")

TAP_29           = ("BLT Tap",             2.9, "—")
TAP_33           = ("BLT Tap",             3.3, "—")
TAP_41           = ("BLT Tap",             4.1, "—")
TAP_48           = ("BLT Tap",             4.8, "—")

# Workflow rows: (drill_tuple, kind) where kind ∈ "full" | "cortical" | "passive" | "tap"
# Per the BLT Basic Information PDF (section 5.1, 5.2 — Soft / Medium / Hard).
WORKFLOWS: Dict[float, Dict[str, List]] = {
    2.9: {
        "Soft":   [(X_PILOT_VELO, "full"), (X_PILOT_VELO, "full"), (PROFILE_29, "full")],
        "Medium": [(X_PILOT_VELO, "full"), (X_PILOT_VELO, "full"), (PROFILE_29, "full"), (TAP_29, "tap")],
        "Hard":   [(X_PILOT_VELO, "full"), (X_PILOT_VELO, "full"), (PROFILE_29, "cortical"), (TAP_29, "tap")],
    },
    3.3: {
        "Soft":   [(X_PILOT_VELO, "full"), (X_PILOT_VELO, "full"), (PROFILE_33, "full")],
        "Medium": [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (PROFILE_33, "full"), (TAP_33, "tap")],
        "Hard":   [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (PROFILE_33, "cortical"), (TAP_33, "tap")],
    },
    4.1: {
        "Soft":   [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (PROFILE_41, "full")],
        "Medium": [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (PROFILE_41, "full"), (TAP_41, "tap")],
        "Hard":   [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (PROFILE_41, "cortical"), (TAP_41, "tap")],
    },
    4.8: {
        "Soft":   [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (X_VELO_42, "full"), (PROFILE_48, "full")],
        "Medium": [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (X_VELO_42, "full"), (PROFILE_48, "full"), (TAP_48, "tap")],
        "Hard":   [(X_PILOT_VELO, "full"), (X_VELO_28, "full"), (X_VELO_35, "full"), (X_VELO_42, "full"), (PROFILE_48, "cortical"), (TAP_48, "tap")],
    },
}

_BONE_MAP = {"D1": "Hard", "D2": "Medium", "D3": "Soft", "D4": "Soft"}


def generate_blt_protocol(system_name: str, implant_diameter: float,
                          implant_length: float, bone: str) -> List[Dict]:
    """Render the official BLT workflow for a (system, Ø, length, bone) cell.

    Output schema matches every other drill-protocol family.
    """
    bone_branch = _BONE_MAP.get(bone, "Medium")
    workflow = WORKFLOWS.get(implant_diameter)
    if not workflow:
        return []

    osteotomy_marking = float(implant_length)   # drill to L-marking
    surface = SYSTEM_META[system_name]["surface"]
    crossfit = _CROSSFIT.get(implant_diameter, "RC")
    steps: List[Dict] = []
    step_num = 1

    # ── Mark site ─────────────────────────────────────────────────────
    steps.append({
        "step": step_num,
        "drill_type": "Pilot Drill",
        "code": f"{NEEDLE_DRILL[0]} (ref {NEEDLE_DRILL[2]})",
        "diameter": NEEDLE_DRILL[1],
        "depth": "Cortex only — mark implantation site",
        "cortical_only": False,
        "rpm": "800",
        "irrigation": True,
        "note": "Mark the implantation site (Straumann BLT Basic Information §5.1).",
    })
    step_num += 1

    palette_for = "Soft Bone Drill" if bone_branch == "Soft" else "Dense Bone Drill"

    for entry, kind in workflow[bone_branch]:
        label, drill_d, ref = entry
        if kind == "cortical":
            steps.append({
                "step": step_num,
                "drill_type": "Crestal Bone Drill",
                "code": label,
                "diameter": drill_d,
                "depth": "Cortex only",
                "cortical_only": True,
                "cortical_depth_mm": 4.0 if implant_length <= 8.0 else 6.0,
                "rpm": "300",
                "irrigation": True,
                "note": "Cortical-only Profile Drill — widens the cortical aspect of the osteotomy. With a dense cortex, recommended even in soft-bone protocols.",
            })
        elif kind == "tap":
            steps.append({
                "step": step_num,
                "drill_type": "Dense Bone Drill",
                "code": label,
                "diameter": drill_d,
                "depth": osteotomy_marking,
                "cortical_only": False,
                "rpm": "15 (Ratchet — manual)",
                "irrigation": True,
                "note": "BLT Tap — pre-cuts threads. Max tap depth 12 mm in hard bone for Ø2.9 / Ø3.3; 10 mm for Ø4.1; 21 mm for Ø4.8.",
            })
        else:
            # Always insert an Alignment Pin after the first Pilot drill
            # to mirror the BLT axis-check step printed in §5.1.4.
            steps.append({
                "step": step_num,
                "drill_type": palette_for,
                "code": label,
                "diameter": drill_d,
                "depth": osteotomy_marking,
                "cortical_only": False,
                "rpm": "800",
                "irrigation": True,
                "note": "Drill to the marking corresponding to the implant length. Drill tip extends 0.5 mm beyond the marking — actual osteotomy = length + 0.5 mm.",
            })
            if label == X_PILOT_VELO[0]:
                step_num += 1
                steps.append({
                    "step": step_num,
                    "drill_type": "Alignment Pin",
                    "code": f"Alignment Pin {ALIGN_22[1]} mm",
                    "diameter": ALIGN_22[1],
                    "depth": "Verify alignment",
                    "cortical_only": False,
                    "rpm": "—",
                    "irrigation": False,
                    "note": "Re-check implant axis and depth with the Ø2.2 mm Alignment Pin.",
                })
        step_num += 1

    steps.append({
        "step": step_num,
        "drill_type": "Implant Placement",
        "code": f"BLT Ø{implant_diameter:g} {surface} {crossfit}, {implant_length:g} mm",
        "diameter": implant_diameter,
        "depth": osteotomy_marking,
        "cortical_only": False,
        "rpm": "15",
        "irrigation": False,
        "note": (
            "Seat the BLT implant using the Loxim® Transfer Piece at 15 rpm. "
            "Target insertion torque 35 Ncm. If >35 Ncm is reached before "
            "the implant has fully seated, re-check the implant bed preparation "
            "to avoid bone overcompression."
        ),
    })
    return steps
