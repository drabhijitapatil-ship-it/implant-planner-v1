"""
Straumann BLX Roxolid data — single source of truth for the 4 BLX systems
documented by the user (iter-283, Feb 2026):

    - "BLX Roxolid SLActive - RB Platform"
    - "BLX Roxolid SLActive - WB Platform"
    - "BLX Roxolid SLA - RB Platform"
    - "BLX Roxolid SLA - WB Platform"

Brand convention: "Straumann".

User-provided diameter / length matrices (verbatim):
  RB Platform: Ø3.5, 4.0, 4.5 — 6/8/10/12/14/16/18 mm
  WB Platform: Ø5.0, 5.5, 6.0 — 6/8/10/12/14/16 mm

Surface treatments (Roxolid material is shared across both surfaces):
  - SLActive®  — accelerated osseointegration; favoured for immediate
    protocols and compromised bone (D3/D4).
  - SLA®       — Straumann's conventional sandblasted/acid-etched surface;
    used for conventional delayed-loading workflows.

Connection: Straumann TorcFit™ (15° conical-cylindrical, RB/WB shared
abutments for RB & WB, WB-only abutments for WB).
"""

from __future__ import annotations
from typing import Dict, List


BRAND = "Straumann"

# ── User-confirmed diameter × length matrices (iter-283) ──────────────────
# Mapped per (system_name, platform_label) → matrix.
RB_LENGTHS = [6, 8, 10, 12, 14, 16, 18]
WB_LENGTHS = [6, 8, 10, 12, 14, 16]
RB_DIAMETERS = [3.5, 4.0, 4.5]
WB_DIAMETERS = [5.0, 5.5, 6.0]


# ── System catalogue. The four system names match the labels confirmed by
#    the user (1b option). Diameter/length matrix is identical between SLA
#    and SLActive (the surface is the only differentiator). ────────────────
SYSTEM_SIZES: Dict[str, Dict[str, List[float]]] = {
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


# Surface + platform mapping used to enrich catalog docs & hide AI metadata.
SYSTEM_META: Dict[str, Dict[str, str]] = {
    "BLX Roxolid SLActive - RB Platform": {
        "platform": "RB", "surface": "SLActive", "material": "Roxolid",
    },
    "BLX Roxolid SLActive - WB Platform": {
        "platform": "WB", "surface": "SLActive", "material": "Roxolid",
    },
    "BLX Roxolid SLA - RB Platform": {
        "platform": "RB", "surface": "SLA", "material": "Roxolid",
    },
    "BLX Roxolid SLA - WB Platform": {
        "platform": "WB", "surface": "SLA", "material": "Roxolid",
    },
}


# ── Indications (option 3a + 3b confirmed by user) ───────────────────────
# SLActive → D1-D4 + Immediate Implant + Conventional + Partial Extraction
#            Therapy + All-on-4 / All-on-6 / All-on-X.
# SLA      → D1-D4 + Conventional placement (single + multi-unit). No
#            immediate by default.
INDICATIONS: Dict[str, Dict] = {
    "Straumann|BLX Roxolid SLActive - RB Platform": {
        "indication": (
            "Roxolid® bone-level tapered implant with SLActive® hydrophilic "
            "surface. Indicated for D1, D2, D3 and D4 bone types. Suitable "
            "for immediate, early and conventional placement and loading. "
            "Designed for Straumann's dynamic-bone-management protocol and "
            "supports all-on-4 / all-on-6 / all-on-X rehabilitations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Partial Extraction Therapy",
            "All on 4",
            "All on 6",
            "All on X",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLActive - WB Platform": {
        "indication": (
            "Wide-Base Roxolid® bone-level tapered implant with SLActive® "
            "hydrophilic surface for posterior, wide-ridge and fresh "
            "extraction-socket indications. D1–D4 bone types. Suitable for "
            "immediate, early and conventional protocols, including "
            "full-arch all-on-X rehabilitations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Partial Extraction Therapy",
            "All on 4",
            "All on 6",
            "All on X",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - RB Platform": {
        "indication": (
            "Roxolid® bone-level tapered implant with conventional SLA® "
            "(sandblasted, large-grit, acid-etched) surface. Indicated for "
            "D1, D2, D3 and D4 bone types in conventional delayed-loading "
            "protocols — single and multi-unit restorations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Straumann|BLX Roxolid SLA - WB Platform": {
        "indication": (
            "Wide-Base Roxolid® bone-level tapered implant with conventional "
            "SLA® surface for posterior and wide-ridge indications. D1–D4 "
            "bone types, conventional delayed-loading single and multi-unit "
            "restorations."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
}


# Features + indications text used by the AI "Explain Recommendation" prompt
# (server-side mirror of frontend constants/implantIndications.ts).
SYSTEM_DETAILS: Dict[str, Dict[str, str]] = {
    "straumann blx roxolid slactive - rb platform": {
        "indications": (
            "D1, D2, D3, D4 bone types. Immediate, early and conventional "
            "placement and loading. Suitable for single tooth replacement, "
            "multi-unit bridges, full-arch / all-on-X rehabilitations and "
            "partial extraction therapy."
        ),
        "features": (
            "Roxolid® (titanium-zirconium TiZr) alloy — higher tensile "
            "strength than commercially pure titanium. SLActive® hydrophilic "
            "surface for accelerated osseointegration (3–4 wk). Tapered "
            "bone-level body with apically self-cutting threads (dynamic "
            "bone management). Straumann TorcFit™ 15° conical-cylindrical "
            "connection. Regular Base (RB) prosthetic platform (Ø3.5 / 4.0 "
            "/ 4.5)."
        ),
    },
    "straumann blx roxolid slactive - wb platform": {
        "indications": (
            "D1–D4 bone types. Immediate, early and conventional placement "
            "and loading. Wide ridges, posterior molars, fresh extraction "
            "sockets and full-arch all-on-X rehabilitations."
        ),
        "features": (
            "Wide-Base (WB) Roxolid® bone-level tapered implant. SLActive® "
            "hydrophilic surface. Straumann TorcFit™ connection. WB "
            "prosthetic platform (Ø5.0 / 5.5 / 6.0). Greater functional "
            "surface for posterior loads."
        ),
    },
    "straumann blx roxolid sla - rb platform": {
        "indications": (
            "D1–D4 bone types. Conventional delayed-loading single and "
            "multi-unit restorations."
        ),
        "features": (
            "Roxolid® bone-level tapered implant. SLA® (sandblasted, "
            "large-grit, acid-etched) surface. Straumann TorcFit™ 15° "
            "conical-cylindrical connection. RB prosthetic platform "
            "(Ø3.5 / 4.0 / 4.5)."
        ),
    },
    "straumann blx roxolid sla - wb platform": {
        "indications": (
            "D1–D4 bone types. Conventional delayed-loading single and "
            "multi-unit restorations in wide ridges and posterior sites."
        ),
        "features": (
            "Wide-Base (WB) Roxolid® bone-level tapered implant. SLA® "
            "surface. Straumann TorcFit™ connection. WB prosthetic "
            "platform (Ø5.0 / 5.5 / 6.0)."
        ),
    },
}


# ── Representative prosthetic component family list per platform (option 4b
#    — same depth as Alpha-Bio's per-platform component templates). Each
#    entry is keyed by the platform string returned in implant_catalog.docs.
COMPONENT_FAMILIES_BY_PLATFORM: Dict[str, List[Dict]] = {
    "RB": [
        {"type": "closure_screw", "indication": "Submerged healing"},
        {"type": "healing_abutment", "diameters": [3.8, 4.5, 6.0],
         "gingival_heights_mm": [1.5, 2.5, 3.5],
         "abutment_heights_mm": [2, 4],
         "indication": "Transmucosal / open healing"},
        {"type": "temporary_abutment",
         "diameters": [3.8, 4.5],
         "gingival_heights_mm": [1.5, 3.0],
         "indication": "Provisional restoration"},
        {"type": "anatomic_abutment_titanium",
         "variants": ["straight", "angled_17"],
         "retention": ["cement"],
         "torque_ncm": 35},
        {"type": "gold_abutment",
         "variants": ["crown_3.8", "crown_4.5", "bridge_bar_4.5"],
         "retention": ["cement", "screw"]},
        {"type": "variobase_crown",
         "diameters": [3.8, 4.5],
         "gingival_heights_mm": [1.0, 2.5, 4.0],
         "cad_cam": True, "torque_ncm": 35,
         "indication": "CAD/CAM single crown (Ti base)"},
        {"type": "variobase_crown_as",
         "diameters": [4.5],
         "indication": "Angulated Screw Channel up to 25°",
         "torque_ncm": 35},
        {"type": "variobase_for_bridge_bar",
         "diameters": [4.5], "variants": ["cylindrical"],
         "torque_ncm": 35},
        {"type": "variobase_c",
         "diameters": [3.8, 4.5],
         "indication": "Cement-retained CAD/CAM crown"},
        {"type": "screw_retained_abutment",
         "diameters": [4.6],
         "angulations": [0, 17, 30],
         "gingival_heights_mm": [1.0, 2.5, 4.0],
         "torque_ncm": 35,
         "indication": "Full-arch / multi-unit screw-retained"},
        {"type": "novaloc",
         "diameters": [3.8], "angulations": [0, 15],
         "gingival_heights_mm": [1.0, 2.5, 4.0],
         "indication": "Removable overdenture solutions"},
        {"type": "cares_mono_scanbody",
         "indication": "Digital workflow (RB/WB universal)"},
        {"type": "impression_post",
         "variants": ["open_tray", "closed_tray"]},
        {"type": "repositionable_implant_analog"},
        {"type": "implant_analog"},
        {"type": "basal_screw", "length_mm": 6.1,
         "torque_ncm": 35,
         "indication": "Definitive abutment screw"},
        {"type": "basal_screw_as", "length_mm": 6.5,
         "torque_ncm": 35,
         "indication": "Variobase Crown AS (angulated screw channel)"},
        {"type": "occlusal_screw", "length_mm": 3.7,
         "indication": "Screw-retained restorations"},
    ],
    "WB": [
        {"type": "closure_screw", "indication": "Submerged healing"},
        {"type": "healing_abutment", "diameters": [4.5, 6.0],
         "gingival_heights_mm": [0.75, 1.5],
         "abutment_heights_mm": [2, 4],
         "indication": "Transmucosal / open healing — WB"},
        {"type": "temporary_abutment",
         "diameters": [5.5],
         "gingival_heights_mm": [1.5, 3.0],
         "indication": "Provisional restoration"},
        {"type": "anatomic_abutment_titanium",
         "variants": ["straight", "angled_17"],
         "retention": ["cement"],
         "torque_ncm": 35},
        {"type": "gold_abutment",
         "variants": ["crown_5.5"],
         "retention": ["cement", "screw"]},
        {"type": "variobase_crown",
         "diameters": [5.5],
         "gingival_heights_mm": [1.0, 2.5, 4.0],
         "cad_cam": True, "torque_ncm": 35,
         "indication": "CAD/CAM single crown (Ti base) — WB"},
        {"type": "variobase_crown_as",
         "diameters": [5.5],
         "indication": "Angulated Screw Channel up to 25° — WB"},
        {"type": "variobase_c",
         "diameters": [5.5],
         "indication": "Cement-retained CAD/CAM crown — WB"},
        {"type": "screw_retained_abutment",
         "diameters": [4.6],
         "angulations": [0, 17, 30],
         "gingival_heights_mm": [1.0, 2.5, 4.0],
         "torque_ncm": 35,
         "indication": "Full-arch / multi-unit screw-retained (RB/WB shared)"},
        {"type": "novaloc",
         "diameters": [3.8], "angulations": [0, 15],
         "indication": "Removable overdenture (RB/WB shared)"},
        {"type": "cares_mono_scanbody",
         "indication": "Digital workflow (RB/WB universal)"},
        {"type": "impression_post",
         "variants": ["open_tray", "closed_tray"]},
        {"type": "repositionable_implant_analog"},
        {"type": "implant_analog"},
        {"type": "basal_screw", "length_mm": 6.1, "torque_ncm": 35},
        {"type": "basal_screw_as", "length_mm": 6.5, "torque_ncm": 35,
         "indication": "Variobase Crown AS (WB)"},
        {"type": "occlusal_screw", "length_mm": 3.7},
    ],
}


def components_for(system_name: str) -> List[Dict]:
    """Return a deep-copyable component list for a BLX system."""
    import copy
    platform = SYSTEM_META[system_name]["platform"]
    return copy.deepcopy(COMPONENT_FAMILIES_BY_PLATFORM[platform])


# ── Drilling Protocol data (option 2a confirmed by user) ──────────────────
# Based on Straumann's standard BLX surgical sequence (VeloDrill ladder +
# Profile drill + BLX Tap) with the Hard/Medium/Soft omission rules from
# the BLT Basic Information guide carried over to BLX-specific drill Ø.
#
# Rules per Straumann's official guidance:
#   - Hard bone (D1):     Needle → full VeloDrill ladder → Profile → Tap.
#                         Tap is run at 15 rpm with the Ratchet (manual).
#   - Medium bone (D2/D3): Needle → VeloDrill ladder → Profile.  Skip Tap.
#   - Soft bone (D4):     Needle → VeloDrill ladder up to ONE drill smaller
#                         than the implant Ø (dynamic bone management /
#                         under-preparation).  Skip Profile + Tap.
#
# Drill speeds (per BLT/BLX guide):
#   - Needle drill, VeloDrill: 800 rpm max
#   - Profile drill:           300 rpm max
#   - BLX Tap:                 15 rpm with Ratchet
#
# The drill ladder ramps from Ø2.2 (X Pilot VeloDrill) up to one drill
# diameter immediately below the final implant Ø.
STRAUMANN_BLX_DRILL_LADDER_RB = [2.2, 2.8, 3.2, 3.5, 3.7, 4.2]   # for Ø<=4.5
STRAUMANN_BLX_DRILL_LADDER_WB = [2.2, 2.8, 3.2, 3.5, 3.7, 4.2, 4.7, 5.2, 6.2]  # WB extends


def _ladder_for_implant(implant_diameter: float) -> List[float]:
    """Return the VeloDrill ladder that stops one diameter shy of the implant."""
    if implant_diameter <= 4.5:
        ladder = STRAUMANN_BLX_DRILL_LADDER_RB
    else:
        ladder = STRAUMANN_BLX_DRILL_LADDER_WB
    # Drill up to the first ladder Ø less than implant Ø (final shaping is
    # the BLX implant itself thanks to its self-cutting design).
    cutoff = [d for d in ladder if d < implant_diameter]
    if not cutoff:
        return [ladder[0]]
    return cutoff


def generate_blx_protocol(
    system_name: str,
    implant_diameter: float,
    implant_length: float,
    bone: str,
) -> List[Dict]:
    """Generate ordered drilling-protocol steps for a BLX implant."""
    steps: List[Dict] = []
    step_num = 1
    is_d1 = bone == "D1"
    is_soft = bone == "D4"
    is_medium = bone in ("D2", "D3")

    # Drill depth equals the implant length (Straumann markings already
    # account for the apical taper). Profile drill works at bone level.
    osteotomy_depth = float(implant_length)

    # Step 1 — Needle drill (axis + initial marking) — common across all
    # bone types.
    steps.append({
        "step": step_num,
        "drill_name": "Needle Drill",
        "diameter_mm": 1.6,
        "depth_mm": "6 mm (initial axis) — drill to full implant length only in hard bone",
        "rpm": "800",
        "note": "Mark implant axis and initial penetration.",
    })
    step_num += 1

    # Step 2..N — VeloDrill ladder. In soft bone we under-prepare by stopping
    # the ladder one drill earlier than otherwise.
    ladder = _ladder_for_implant(implant_diameter)
    if is_soft and len(ladder) > 1:
        # Under-preparation: drop the last drill in the ladder.
        ladder_to_run = ladder[:-1]
        last_drill_note = (
            "Soft (D4) bone — dynamic bone management. Stop one drill "
            "diameter earlier than the conventional ladder to preserve "
            "primary stability."
        )
    else:
        ladder_to_run = ladder
        last_drill_note = ""

    for idx, drill_d in enumerate(ladder_to_run):
        kind = "X Pilot VeloDrill™" if idx == 0 else "X VeloDrill™"
        note = ""
        if idx == 0:
            note = "Pilot osteotomy — verify orientation with Alignment Pin."
        if is_soft and idx == len(ladder_to_run) - 1 and last_drill_note:
            note = last_drill_note
        steps.append({
            "step": step_num,
            "drill_name": kind,
            "diameter_mm": drill_d,
            "depth_mm": osteotomy_depth,
            "rpm": "800",
            "note": note,
        })
        step_num += 1

    # Step — Profile Drill: only for Hard (D1) and Medium (D2/D3) bone.
    if is_d1 or is_medium:
        steps.append({
            "step": step_num,
            "drill_name": "BLX Profile Drill",
            "diameter_mm": implant_diameter,
            "depth_mm": "Bone-level",
            "rpm": "300",
            "note": (
                "Shape the coronal aspect of the osteotomy at bone level. "
                "Mandatory in dense cortex / D1 bone; recommended in D2-D3."
            ),
        })
        step_num += 1

    # Step — BLX Tap: ONLY in hard (D1) bone, hand-driven with the Ratchet.
    if is_d1:
        steps.append({
            "step": step_num,
            "drill_name": "BLX Tap",
            "diameter_mm": implant_diameter,
            "depth_mm": osteotomy_depth,
            "rpm": "15 (Ratchet — manual)",
            "note": (
                "Pre-cut threads in D1 bone. Always use the Ratchet to "
                "avoid over-tapping. Tap depth max 12 mm in hard bone."
            ),
        })
        step_num += 1

    # Final step — implant placement.
    steps.append({
        "step": step_num,
        "drill_name": f"{system_name} Implant Insertion",
        "diameter_mm": implant_diameter,
        "depth_mm": osteotomy_depth,
        "rpm": "15-25 (Ratchet or Handpiece)",
        "note": (
            "Seat the BLX implant using the Loxim® Transfer Piece. "
            "Final insertion torque 35 Ncm (range 30–80 Ncm)."
        ),
    })

    return steps
