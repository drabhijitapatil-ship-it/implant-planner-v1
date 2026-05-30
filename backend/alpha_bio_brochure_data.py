"""
Alpha-Bio brochure data — single source of truth for the 6 implant systems
documented in the official Alpha-Bio product brochure.

Used by:
  - DRILLING_PROTOCOLS registration in server.py (drill sequences per
    diameter / bone density)
  - _seed_alpha_bio_brochure.py (implant_library + implant_catalog seeding)

Brand convention: "Alpha Bio" (per user instruction iter-177).

Drill-step depth modifiers come straight from the brochure footnotes:
  * "cortical_only"  → drill only through the cortical plate (final pass in
                       hard bone; depth ≈ 2–3 mm).
  * "short_3mm"      → 3 mm shorter than the implant's length (under-drill
                       the apical region for primary stability in
                       softer/medium bone).
  * "full"           → drill to full implant length.
"""

from __future__ import annotations
from typing import Dict, List, Tuple

# ── Per-system size matrices ───────────────────────────────────────────────
# system_name → {"diameters": [...], "lengths": [...]}.
# These feed implant_library rows (one row per (diameter, length) combo).
SYSTEM_SIZES: Dict[str, Dict[str, List[float]]] = {
    "NeO Conical Standard Connection": {
        # Ø3.75 has an extra 16mm length per brochure CS table
        "diameters": [3.75, 4.2, 5.0],
        "lengths_by_diameter": {
            3.75: [8, 10, 11.5, 13, 16],
            4.2:  [8, 10, 11.5, 13],
            5.0:  [8, 10, 11.5, 13],
        },
    },
    "NeO Conical Hex Connection": {
        "diameters": [3.2, 3.5],
        "lengths_by_diameter": {
            3.2: [8, 10, 11.5, 13, 16],
            3.5: [8, 10, 11.5, 13, 16],
        },
    },
    "NeO Internal Hex Connection": {
        "diameters": [3.75, 4.2, 5.0],
        "lengths_by_diameter": {
            3.75: [8, 10, 11.5, 13, 16],
            4.2:  [8, 10, 11.5, 13, 16],
            5.0:  [8, 10, 11.5, 13, 16],
        },
    },
    "ICE": {
        "diameters": [3.7, 3.75, 4.2, 4.65, 5.3],  # 3.7N stored as 3.7
        "lengths_by_diameter": {
            3.7:  [6, 8, 10, 11.5, 13, 16],
            3.75: [6, 8, 10, 11.5, 13, 16],
            4.2:  [6, 8, 10, 11.5, 13, 16],
            4.65: [6, 8, 10, 11.5, 13, 16],
            5.3:  [6, 8, 10, 11.5, 13, 16],
        },
    },
    "ATID": {
        "diameters": [3.75, 4.2, 5.0],
        "lengths_by_diameter": {
            3.75: [6, 8, 10, 11.5, 13],
            4.2:  [6, 8, 10, 11.5, 13],
            5.0:  [6, 8, 10, 11.5, 13],
        },
    },
    "DFI": {
        "diameters": [3.3, 3.75, 4.2, 5.0],
        "lengths_by_diameter": {
            3.3:  [8, 10, 11.5, 13],
            3.75: [8, 10, 11.5, 13],
            4.2:  [8, 10, 11.5, 13],
            5.0:  [8, 10, 11.5, 13],
        },
    },
    "NICE": {
        "diameters": [3.2, 3.5],
        "lengths_by_diameter": {
            3.2: [8, 10, 11.5, 13, 16],
            3.5: [8, 10, 11.5, 13, 16],
        },
    },
}

# ── Drill sequences per system, per diameter, per bone density ─────────────
# Each step is a tuple: (drill_diameter_mm, depth_mode)
# depth_mode ∈ {"full", "short_3mm", "cortical_only"}.
# Bone density keys map to the brochure's Type I / II-III / IV columns:
#   D1     = "Hard Bone Type I"
#   D2_D3  = "Medium Bone Type II & III"
#   D4     = "Soft Bone Type IV"

DrillStep = Tuple[float, str]
# Per bone -> list of DrillStep
BoneSeq = Dict[str, List[DrillStep]]
# Per diameter -> BoneSeq
DiamSeq = Dict[float, BoneSeq]

# Common helper: build a sequence from a flat list of diameters with the last
# step optionally short_3mm or cortical_only.
def _seq(*pairs: Tuple[float, str]) -> List[DrillStep]:
    return list(pairs)

DRILL_SEQUENCES: Dict[str, DiamSeq] = {

    # ── NeO Conical Standard (CS) — Straight drilling ──────────────────────
    "NeO Conical Standard Connection": {
        3.75: {
            "D4":    _seq((2.0, "full"), (2.8, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (3.65, "cortical_only")),
        },
        4.2: {
            "D4":    _seq((2.0, "full"), (2.8, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (4.1, "cortical_only")),
        },
        5.0: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "short_3mm"),
                          (4.8, "cortical_only")),
        },
    },

    # ── NeO Internal Hex (IH) — same straight-drilling pattern as Spiral ──
    "NeO Internal Hex Connection": {
        3.75: {
            "D4":    _seq((2.0, "full"), (2.8, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "cortical_only")),
        },
        4.2: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "cortical_only")),
        },
        5.0: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full"),
                          (4.8, "cortical_only")),
        },
    },

    # ── NeO Conical Hex (CHC) — same as NICE CHC platform ─────────────────
    "NeO Conical Hex Connection": {
        3.2: {
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.0, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
        },
        3.5: {
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.0, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
        },
    },

    # ── ICE — Straight ────────────────────────────────────────────────────
    "ICE": {
        3.7: {  # 3.7N stored as 3.7
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (3.65, "cortical_only")),
        },
        3.75: {
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (3.65, "cortical_only")),
        },
        4.2: {
            "D4":    _seq((2.0, "full"), (2.8, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (4.1, "cortical_only")),
        },
        4.65: {
            "D4":    _seq((2.0, "full"), (2.8, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm"),
                          (3.65, "cortical_only")),
        },
        5.3: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "short_3mm"),
                          (4.8, "cortical_only")),
        },
    },

    # ── ATID — Straight ───────────────────────────────────────────────────
    "ATID": {
        3.75: {
            "D4":    _seq((2.0, "full"), (2.8, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "cortical_only")),
        },
        4.2: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "cortical_only")),
        },
        5.0: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full"),
                          (4.8, "cortical_only")),
        },
    },

    # ── DFI — Straight ────────────────────────────────────────────────────
    "DFI": {
        3.3: {
            "D4":    _seq((2.0, "full"), (2.8, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "cortical_only")),
        },
        3.75: {
            "D4":    _seq((2.0, "full"), (2.8, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "cortical_only")),
        },
        4.2: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "cortical_only")),
        },
        5.0: {
            "D4":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "full"),
                          (3.65, "full"), (4.1, "full"), (4.5, "full"),
                          (4.8, "cortical_only")),
        },
    },

    # ── NICE — Straight (CHC platform) ────────────────────────────────────
    "NICE": {
        3.2: {
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.0, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
        },
        3.5: {
            "D4":    _seq((2.0, "full"), (2.4, "short_3mm")),
            "D2_D3": _seq((2.0, "full"), (2.8, "full"), (3.0, "short_3mm")),
            "D1":    _seq((2.0, "full"), (2.8, "full"), (3.2, "short_3mm")),
        },
    },
}


# ── Per-system catalog metadata (used by implant_catalog seed) ─────────────
# Each entry follows the same shape used by the existing SPI catalog doc so
# the AI explainer / picker render uniformly across systems.

SYSTEM_CATALOG: Dict[str, Dict] = {

    "NeO Conical Standard Connection": {
        "connection": {"type": "conical_hex", "subtype": "CS",
                       "indexing": ["non_indexed"]},
        "platform_switching": True,
        "surface": "NanoTec™ (sand-blasted + double thermal etched)",
        "features": [
            "Tapered body with apical centering and anchoring features",
            "Two coronal micro-threads (~20% extra surface area)",
            "Conical Standard prosthetic platform — platform-switching enabled",
            "NanoTec™ surface for accelerated osseointegration",
        ],
        "indications": [
            "Optimal primary stability",
            "High bone preservation",
            "Increased early bone-implant contact (BIC)",
        ],
        "compatibility_notes": (
            "Conical Standard (CS) prosthetic platform. Use Alpha-Bio CS "
            "abutments, healing caps, transfers, Ti-bases. Closing torque: "
            "10 Ncm (healing) / 30 Ncm (definitive)."
        ),
    },

    "NeO Conical Hex Connection": {
        "connection": {"type": "conical_hex", "subtype": "CHC",
                       "indexing": ["non_indexed"]},
        "platform_switching": True,
        "surface": "NanoTec™ (sand-blasted + double thermal etched)",
        "features": [
            "Tapered body with apical centering features",
            "Conical Hex narrow connection (CHC) for limited mesio-distal space",
            "Coronal micro-threads",
            "NanoTec™ surface",
        ],
        "indications": [
            "Narrow alveolar ridges and limited interproximal spaces",
            "Esthetic anterior single-tooth restorations",
            "Cases requiring high primary stability with reduced diameter",
        ],
        "compatibility_notes": (
            "Conical Hex (CHC) prosthetic platform — use CHC abutments, "
            "Alphaloc, Ti-bases. Closing torque: 10 Ncm (healing) / "
            "20–30 Ncm (definitive). CHC Alphaloc max torque 20 Ncm."
        ),
    },

    "NeO Internal Hex Connection": {
        "connection": {"type": "internal_hex", "subtype": "IH",
                       "indexing": ["non_indexed"]},
        "platform_switching": True,
        "surface": "NanoTec™ (sand-blasted + double thermal etched)",
        "features": [
            "Tapered body with apical centering features",
            "Internal Hex (IH) prosthetic platform — shared with SPI / ICE / "
            "ATID / DFI families",
            "Coronal micro-threads",
            "NanoTec™ surface",
        ],
        "indications": [
            "Optimal primary stability",
            "Cases needing IH prosthetic interchangeability across the "
            "Alpha-Bio platform",
            "High bone preservation, increased early BIC",
        ],
        "compatibility_notes": (
            "Internal Hex (IH) prosthetic platform. Components shared with "
            "Spiral / ICE / ATID / DFI. Definitive torque: 30 Ncm."
        ),
    },

    "ICE": {
        "connection": {"type": "internal_hex", "subtype": "IH",
                       "indexing": ["non_indexed"]},
        "platform_switching": False,
        "surface": "Sand-blasted, double thermal etched",
        "features": [
            "Moderately tapered body",
            "Back-tapered coronal part for soft-tissue management",
            "Split coronal micro-threads (Ø4.2 / 4.65 / 5.3 in lengths ≥10 mm)",
            "Wide diameter range (Ø3.7 N → 5.3) and lengths from 6 mm",
        ],
        "indications": [
            "Wide range of standard cases",
            "Improved stress distribution",
            "Controlled bone penetration",
        ],
        "compatibility_notes": (
            "Internal Hex (IH) prosthetic platform — components shared with "
            "the Alpha-Bio IH family. Definitive torque: 30 Ncm."
        ),
    },

    "ATID": {
        "connection": {"type": "internal_hex", "subtype": "IH",
                       "indexing": ["non_indexed"]},
        "platform_switching": False,
        "surface": "NanoTec™ (sand-blasted + double thermal etched)",
        "features": [
            "Cylindrical body with parallel walls",
            "Uniform threads — homogeneous insertion forces",
            "High overall surface area",
            "NanoTec™ surface",
        ],
        "indications": [
            "Increased BIC",
            "Cases needing minimal lateral pressure on bone",
            "Predictable, parallel placement",
        ],
        "compatibility_notes": (
            "Internal Hex (IH) prosthetic platform — components shared with "
            "the Alpha-Bio IH family. Definitive torque: 30 Ncm."
        ),
    },

    "DFI": {
        "connection": {"type": "internal_hex", "subtype": "IH",
                       "indexing": ["non_indexed"]},
        "platform_switching": False,
        "surface": "Sand-blasted, double thermal etched",
        "features": [
            "Slightly tapered body",
            "Double-thread design with variable thread geometry",
            "Apex with cutting flutes — self-tapping capabilities",
            "Large overall surface area",
        ],
        "indications": [
            "Easily stabilized and controlled during placement",
            "Long-term stability across a wide range of cases",
            "Cases benefiting from self-tapping insertion",
        ],
        "compatibility_notes": (
            "Internal Hex (IH) prosthetic platform — components shared with "
            "the Alpha-Bio IH family. Definitive torque: 30 Ncm."
        ),
    },

    "NICE": {
        "connection": {"type": "conical_hex", "subtype": "CHC",
                       "indexing": ["non_indexed"]},
        "platform_switching": True,
        "surface": "Sand-blasted, double thermal etched",
        "features": [
            "Moderately tapered body",
            "Back-tapered coronal part — soft-tissue preservation, esthetics",
            "Split coronal micro-threads",
            "Conical Hex (CHC) narrow connection for limited spaces",
        ],
        "indications": [
            "Narrow alveolar ridges and limited spaces",
            "Esthetic zone single-tooth restorations",
            "Anterior cases needing improved abutment-implant fit",
        ],
        "compatibility_notes": (
            "Conical Hex (CHC) prosthetic platform — use CHC abutments and "
            "Alphaloc. Definitive torque: 30 Ncm; Alphaloc CHC max 20 Ncm."
        ),
    },
}


# ── High-level component families per platform ─────────────────────────────
# All systems share the same Alpha-Bio prosthetic component families per the
# brochure; only the platform (CS / CHC / IH) varies.

_COMMON_COMPONENTS_BY_PLATFORM: Dict[str, List[Dict]] = {
    "CS": [
        {"type": "cover_screw", "indication": "Two-stage submerged healing"},
        {"type": "healing_abutment", "diameters": [4.0, 4.9, 6.2],
         "cuff_heights_mm": [1.5, 2.5, 3.5, 4.5, 5.5],
         "torque_ncm": 10,
         "indication": "One-stage / uncovering"},
        {"type": "final_abutment",
         "retention": ["cement", "occlusal_screw"],
         "material": ["titanium"],
         "variants": ["straight", "angled_15", "angled_25"],
         "torque_ncm": 30},
        {"type": "multi_unit_abutment",
         "variants": ["straight", "angled_17", "angled_30"],
         "cuff_heights_mm": [0.5, 1.5, 2.5, 3.5],
         "torque_ncm": 30,
         "indication": "Full-arch / multi-unit screw-retained"},
        {"type": "ti_base", "cad_cam": True,
         "variants": ["engaged", "non_engaged"], "torque_ncm": 30},
        {"type": "scanbody", "indication": "Digital workflow",
         "torque_ncm_max": 10},
        {"type": "pre_milled_blank", "cad_cam": True, "torque_ncm": 30},
        {"type": "impression_coping",
         "variants": ["open_tray", "closed_tray"], "torque_ncm_max": 10},
        {"type": "analog"},
        {"type": "casting_abutment",
         "variants": ["plastic", "cocr_base", "titanium_base"]},
        {"type": "temporary_abutment",
         "indication": "Provisional restoration", "torque_ncm": 30},
        {"type": "overdenture",
         "subtypes": ["alphaloc_straight", "ball_attachment_straight",
                      "ball_attachment_angled"],
         "indication": "Removable overdenture solutions"},
    ],
    "CHC": [
        {"type": "cover_screw", "indication": "Two-stage submerged healing"},
        {"type": "healing_abutment", "diameters": [3.4, 3.8, 4.2],
         "cuff_heights_mm": [2, 3, 5], "torque_ncm": 10,
         "indication": "One-stage / uncovering"},
        {"type": "final_abutment",
         "retention": ["cement", "occlusal_screw"],
         "material": ["titanium"],
         "variants": ["straight", "wide", "angled_15", "angled_25",
                      "anatomic_15", "anatomic_25"],
         "torque_ncm": 30},
        {"type": "multi_unit_abutment",
         "variants": ["straight", "angled_17", "angled_30"],
         "cuff_heights_mm": [0.75, 1.5, 2.5, 3.5, 4.5, 5.5],
         "torque_ncm": 30},
        {"type": "ti_base", "cad_cam": True,
         "variants": ["engaged", "non_engaged", "angled"], "torque_ncm": 30},
        {"type": "scanbody", "indication": "Digital workflow",
         "torque_ncm_max": 10},
        {"type": "pre_milled_blank", "cad_cam": True, "torque_ncm": 30},
        {"type": "impression_coping",
         "variants": ["open_tray", "closed_tray"], "torque_ncm_max": 10},
        {"type": "analog"},
        {"type": "casting_abutment",
         "variants": ["plastic", "cocr_base"]},
        {"type": "temporary_abutment", "torque_ncm": 30},
        {"type": "overdenture",
         "subtypes": ["alphaloc_straight", "ball_attachment_straight",
                      "ball_attachment_angled"],
         "torque_ncm_max": 20,
         "indication": "Removable overdenture solutions"},
    ],
    "IH": [
        {"type": "cover_screw", "indication": "Two-stage submerged healing"},
        {"type": "healing_abutment", "diameters": [3.85, 4.6, 5.0, 5.5, 6.0, 7.0],
         "cuff_heights_mm": [2, 3, 4, 5, 6, 7], "torque_ncm": 10,
         "indication": "One-stage / uncovering"},
        {"type": "final_abutment",
         "retention": ["cement", "occlusal_screw"],
         "material": ["titanium"],
         "variants": ["straight", "slim", "wide", "angled_15", "angled_25",
                      "angled_35", "anatomic_15", "anatomic_25"],
         "torque_ncm": 30},
        {"type": "multi_unit_abutment",
         "variants": ["straight", "angled_17", "angled_30",
                      "two_piece_alpha_uni_base"],
         "cuff_heights_mm": [0.75, 1.5, 2.5, 3.5, 4.5, 5.5],
         "torque_ncm": 30,
         "indication": "Full-arch / multi-unit screw-retained (≤30°)"},
        {"type": "ti_base", "cad_cam": True,
         "variants": ["straight_engaged", "straight_non_engaged",
                      "wide", "angled"],
         "torque_ncm": 30},
        {"type": "scanbody",
         "variants": ["dual_use", "sirona_compatible"],
         "indication": "Digital workflow", "torque_ncm_max": 10},
        {"type": "pre_milled_blank", "cad_cam": True, "torque_ncm": 30},
        {"type": "impression_coping",
         "variants": ["open_tray", "closed_tray"], "torque_ncm_max": 10},
        {"type": "analog"},
        {"type": "casting_abutment",
         "variants": ["plastic", "cocr_base_rotational",
                      "cocr_base_non_rotational"]},
        {"type": "temporary_abutment",
         "variants": ["peek_straight", "peek_angled_15", "peek_angled_25",
                      "titanium"],
         "torque_ncm": 15},
        {"type": "burnout_sleeve"},
        {"type": "overdenture",
         "subtypes": ["alphaloc_straight", "ball_attachment_straight",
                      "ball_attachment_angled"],
         "torque_ncm": 30,
         "indication": "Removable overdenture solutions"},
    ],
}

# Map each system to its prosthetic platform
SYSTEM_PLATFORM: Dict[str, str] = {
    "NeO Conical Standard Connection": "CS",
    "NeO Conical Hex Connection": "CHC",
    "NeO Internal Hex Connection": "IH",
    "ICE": "IH",
    "ATID": "IH",
    "DFI": "IH",
    "NICE": "CHC",
}


def components_for(system_name: str) -> List[Dict]:
    """Return a fresh deep-copyable component list for a given system."""
    import copy
    platform = SYSTEM_PLATFORM[system_name]
    return copy.deepcopy(_COMMON_COMPONENTS_BY_PLATFORM[platform])


# ── Shared surgical instruments / kits (one catalog doc, referenced by all) ─
SURGICAL_KIT_DOC = {
    "key": "Alpha Bio|Surgical & Prosthetic Instrumentation",
    "brand": "Alpha Bio",
    "name": "Surgical & Prosthetic Instrumentation",
    "is_shared_instruments_doc": True,
    "kits": [
        {"name": "Surgical Kit", "ref": "4699",
         "description": "Empty modular kit, Radel® box, stainless-steel bath. "
                        "19 × 14 × 6 cm. Color-coded, autoclavable."},
        {"name": "Mini Surgical Box", "ref": ["4611", "4774", "4775"],
         "description": "Compact 10 × 8.5 × 5 cm box, Radel® tray."},
        {"name": "Guided Surgery Tool Kit (GSTK) — Entry",
         "ref": "65002", "platforms": ["CS", "CHC"]},
        {"name": "Guided Surgery Tool Kit (GSTK) — Entry Extension",
         "ref": "65003", "platforms": ["IH", "CS", "CHC"]},
        {"name": "Guided Surgery Tool Kit (GSTK) — Full",
         "ref": "65000", "platforms": ["IH", "CHC"]},
        {"name": "Stopper Kit", "ref": "4612",
         "description": "20 stoppers, laser markings, Radel® box / PPHT cover."},
    ],
    "drills": {
        "coated_straight": "Ø2.0 → Ø5.8 (color-coded, multi-layer dark-grey "
                           "coating, high-contrast depth marks)",
        "coated_step": "Ø2.0/2.4 → Ø4.8/5.2 step combinations",
        "countersink": {"ref": "4672", "code": "CS",
                        "diameter_range_mm": [2.7, 5.9]},
        "drill_extension": {"ref": "4240", "code": "DX",
                            "extends_mm": 17.5},
        "marking_drill": {"ref": "4712C", "code": "MRDX1.5",
                          "diameter_mm": 1.5},
        "round_burrs": {"diameters_mm": [2.3, 3.0, 4.0]},
        "trephines": {"diameters_mm": [4.0, 5.0]},
    },
    "drivers": {
        "implant_insertion_2_5mm": {
            "platforms": ["CS", "IH"],
            "lengths_mm": [6, 10, 16, 23],
        },
        "implant_insertion_2_1mm": {
            "platforms": ["CHC"],
            "lengths_mm": [10, 12, 15, 20, 23],
        },
        "prosthetic_hex_1_25mm": {
            "type": "Hex driver",
            "lengths_mm": [7, 11.5, 13, 14.5, 20, 21],
        },
        "prosthetic_hex_1_5mm": {
            "type": "Hex driver",
            "lengths_mm": [7, 13, 14.5, 21],
        },
    },
    "accessories": {
        "parallel_depth_guide": {"code": ["PDG", "PDGS"],
                                 "lengths_mm": [10, 16]},
        "parallel_guide": {"code": "PG"},
        "implant_depth_probe": {"code": "IDG"},
        "universal_torque_ratchet": {"code": "URT",
                                     "torque_range_ncm": [10, 45]},
    },
    "torque_reference": {
        "healing_abutment_max_ncm": 10,
        "scanbody_max_ncm": 10,
        "impression_transfer_max_ncm": 10,
        "temporary_abutment_ncm": 15,
        "alphaloc_chc_max_ncm": 20,
        "definitive_abutment_ncm": 30,
        "ti_base_ncm": 30,
        "multi_unit_ncm": 30,
        "implant_insertion_recommended_ncm": [25, 35],
    },
    "notes": (
        "Kits supplied empty — drills, drivers and accessories ordered "
        "separately. All Alpha-Bio drills are compatible with the Stopper "
        "Kit (4612) for depth control. NanoTec™ surface implants supported "
        "across the full instrument line."
    ),
}
