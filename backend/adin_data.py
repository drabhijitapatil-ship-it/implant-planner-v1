"""
Adin Dental Implants — single source of truth (iter-284, Feb 2026).

8 systems extracted verbatim from the user-supplied Adin product catalog:

  CloseFit family (4 platforms, Conical Hex / Morse-taper connection):
    • UNP CloseFit  — Ultra-Narrow Platform, Ø2.75
    • NP  CloseFit  — Narrow Platform,       Ø3.0
    • RP  CloseFit  — Regular Platform,      Ø3.5
    • WP  CloseFit  — Wide Platform,         Ø4.3, Ø5.0

  Standard Internal Hex family (2-piece):
    • Touareg-OS   — Ø3.5, Ø3.75, Ø4.2, Ø5.0, Ø6.0  (OsseoFix surface)
    • Touareg-S    — Ø3.5, Ø3.75, Ø4.2, Ø5.0, Ø6.0  (AB/AE surface)
    • Swell        — Ø3.3, Ø3.75, Ø4.2, Ø5.0, Ø6.0  (AB/AE surface)

  One-piece family:
    • One          — Ø3.0, Ø3.3, Ø3.6, Ø4.2, Ø5.0   (AB/AE, flapless mini)

Material: Ti-6Al-4V ELI (Grade 23) across the entire portfolio.

Drilling: Adin's universal Tri-Step™ pilot drill (combined 2.0/2.8/3.2) +
sequential 3.6 / 4.2 / 4.6 / 5.2 / 5.6 mm twist drills. Per-Ø per-bone-
type tables from the catalog are encoded explicitly below.
"""

from __future__ import annotations
from typing import Dict, List

BRAND = "Adin"

# ── Diameter × Length matrix per system (verbatim from Adin catalog) ──────
SYSTEM_SIZES: Dict[str, Dict[float, List[float]]] = {
    "UNP CloseFit": {
        2.75: [8, 10, 11.5, 13, 15, 16, 18],
    },
    "NP CloseFit": {
        3.0: [8, 10, 11.5, 13, 16, 18],
    },
    "RP CloseFit": {
        3.5: [8, 10, 11.5, 13, 15, 18],
    },
    "WP CloseFit": {
        4.3: [8, 10, 11.5, 13, 15, 18],
        5.0: [8, 10, 11.5, 13, 15, 16],
    },
    "Touareg-OS": {
        3.5:  [6.25, 8, 10, 11.5, 13, 16, 18],
        3.75: [8, 10, 11.5, 13, 16, 18],
        4.2:  [6.25, 8, 10, 11.5, 13, 16, 18],
        5.0:  [6.25, 8, 10, 11.5, 13, 16],
        6.0:  [6.25, 8, 10, 11.5, 13],
    },
    "Touareg-S": {
        3.5:  [8, 10, 11.5, 13, 16, 18],
        3.75: [8, 10, 11.5, 13, 16, 18],
        4.2:  [8, 10, 11.5, 13, 16, 18],
        5.0:  [8, 10, 11.5, 13],
        6.0:  [6.25, 8, 10, 11.5, 13],
    },
    "Swell": {
        3.3:  [10, 11.5, 13, 16, 18],
        3.75: [8, 10, 11.5, 13, 16, 18],
        4.2:  [6.25, 8, 10, 11.5, 13, 16, 18],
        5.0:  [6.25, 8, 10, 11.5, 13, 16],
        6.0:  [6.25, 8, 10, 11.5, 13],
    },
    "One": {
        3.0: [10, 11.5, 13, 15],
        3.3: [10, 11.5, 13, 15],
        3.6: [10, 11.5, 13, 15],
        4.2: [10, 11.5, 13, 15],
        5.0: [10, 11.5, 13, 15],
    },
}

# Surface / connection / platform metadata per system
SYSTEM_META: Dict[str, Dict[str, str]] = {
    "UNP CloseFit": {"platform": "UNP", "connection": "Conical Hex",  "surface": "OsseoFix", "family": "CloseFit"},
    "NP CloseFit":  {"platform": "NP",  "connection": "Conical Hex",  "surface": "OsseoFix", "family": "CloseFit"},
    "RP CloseFit":  {"platform": "RP",  "connection": "Conical Hex",  "surface": "OsseoFix", "family": "CloseFit"},
    "WP CloseFit":  {"platform": "WP",  "connection": "Conical Hex",  "surface": "OsseoFix", "family": "CloseFit"},
    "Touareg-OS":   {"platform": "RS",  "connection": "Internal Hex", "surface": "OsseoFix", "family": "Touareg"},
    "Touareg-S":    {"platform": "RS",  "connection": "Internal Hex", "surface": "AB/AE",    "family": "Touareg"},
    "Swell":        {"platform": "RS",  "connection": "Internal Hex", "surface": "AB/AE",    "family": "Touareg"},
    "One":          {"platform": "OP",  "connection": "One-Piece",    "surface": "AB/AE",    "family": "One"},
}

# ── Per-system indications + bone-type coverage ───────────────────────────
INDICATIONS: Dict[str, Dict] = {
    "Adin|UNP CloseFit": {
        "indication": (
            "Adin CloseFit Ultra-Narrow Platform (Ø2.75) with Conical Hex / "
            "Morse-taper connection and OsseoFix™ surface. Indicated for very "
            "narrow ridges and tight inter-radicular spaces. Suitable for "
            "lateral incisors in the maxilla and mandibular incisors. D1-D4 "
            "bone types with immediate function / loading capability."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|NP CloseFit": {
        "indication": (
            "Adin CloseFit Narrow Platform (Ø3.0) with Conical Hex / Morse-"
            "taper connection and OsseoFix™ surface. Indicated for narrow "
            "ridges and tight spaces. D1-D4 bone types with immediate "
            "function / loading capability."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|RP CloseFit": {
        "indication": (
            "Adin CloseFit Regular Platform (Ø3.5) with Conical Hex / Morse-"
            "taper connection and OsseoFix™ surface. Indicated for standard "
            "ridges. D1-D4 bone types with immediate function / loading "
            "capability."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
            "Partial Extraction Therapy",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|WP CloseFit": {
        "indication": (
            "Adin CloseFit Wide Platform (Ø4.3 / Ø5.0) with Conical Hex / "
            "Morse-taper connection and OsseoFix™ surface. Indicated for "
            "wide ridges and posterior molars. D1-D4 bone types with "
            "immediate function / loading capability."
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
    "Adin|Touareg-OS": {
        "indication": (
            "Adin Touareg-OS — tapered, self-tapping, bone-condensing 2-piece "
            "implant with Standard Internal Hex connection and OsseoFix™ "
            "(Calcium-Phosphate RBM) surface. Macrodesign condenses bone and "
            "enhances primary stability. D1-D4 bone types with immediate "
            "function / loading. Supports single, multi-unit and full-arch "
            "All-on-X rehabilitations."
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
    "Adin|Touareg-S": {
        "indication": (
            "Adin Touareg-S — tapered, self-tapping, bone-condensing 2-piece "
            "implant with Standard Internal Hex connection and AB/AE "
            "(Alumina-Oxide Blasted + Acid-Etched) surface. D1-D4 bone types "
            "with immediate function / loading capability. Supports single, "
            "multi-unit and full-arch All-on-X rehabilitations."
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
    "Adin|Swell": {
        "indication": (
            "Adin Swell — straight, parallel-walled, slightly tapered 2-piece "
            "implant with V-shaped thread, Standard Internal Hex connection "
            "and AB/AE surface. Accurate positioning, optimal load "
            "distribution and esthetic outcomes. D1-D4 bone types — "
            "conventional and immediate placement."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Multiple Conventional Implants",
            "Immediate Implant",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|One": {
        "indication": (
            "Adin One — one-piece tapered spiral implant with AB/AE surface "
            "and integrated abutment. Designed for narrow ridges and "
            "flapless minimally-invasive surgery. Suitable for lateral "
            "incisors in the maxilla and incisors in the mandible. "
            "Immediate function / loading."
        ),
        "indicated_procedures": [
            "Single Conventional Implant",
            "Immediate Implant",
        ],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
}

# Frontend-side AI-context indications (lowercased key matches the existing
# implant_indications.py + frontend constants/implantIndications.ts pattern)
SYSTEM_DETAILS: Dict[str, Dict[str, str]] = {
    "adin unp closefit": {
        "indications": "Very narrow ridges and tight inter-radicular spaces. Lateral incisors and mandibular incisors. D1-D4 bone types with immediate function / loading.",
        "features": "Ultra-Narrow Platform (Ø2.75). Conical Hex / Morse-taper connection. OsseoFix™ (titanium + Calcium-Phosphate RBM) surface. Ti-6Al-4V ELI alloy. Single-drill (Pilot Ø2.5) surgical protocol.",
    },
    "adin np closefit": {
        "indications": "Narrow ridges and tight spaces. D1-D4 bone types with immediate function / loading.",
        "features": "Narrow Platform (Ø3.0). Conical Hex / Morse-taper connection. OsseoFix™ surface. Ti-6Al-4V ELI alloy. Tri-Step™ pilot drill.",
    },
    "adin rp closefit": {
        "indications": "Standard ridges. D1-D4 bone types with immediate function / loading.",
        "features": "Regular Platform (Ø3.5). Conical Hex / Morse-taper connection. OsseoFix™ surface. Ti-6Al-4V ELI alloy.",
    },
    "adin wp closefit": {
        "indications": "Wide ridges and posterior molars. D1-D4 bone types with immediate function / loading. Supports All-on-4/6/X.",
        "features": "Wide Platform (Ø4.3 / Ø5.0). Conical Hex / Morse-taper connection. OsseoFix™ surface. Ti-6Al-4V ELI alloy.",
    },
    "adin touareg-os": {
        "indications": "D1-D4 bone types with immediate function / loading. Single, multi-unit and full-arch All-on-X.",
        "features": "Tapered self-tapping 2-piece implant. Bone-condensing macrodesign. Standard Internal Hex connection. OsseoFix™ (Calcium-Phosphate RBM) surface. Ti-6Al-4V ELI alloy. Ø3.5 / 3.75 / 4.2 / 5.0 / 6.0.",
    },
    "adin touareg-s": {
        "indications": "D1-D4 bone types with immediate function / loading. Single, multi-unit and full-arch All-on-X.",
        "features": "Tapered self-tapping 2-piece implant. Bone-condensing macrodesign. Standard Internal Hex connection. AB/AE (Alumina-Oxide Blasted + Acid-Etched) surface. Ti-6Al-4V ELI alloy. Ø3.5 / 3.75 / 4.2 / 5.0 / 6.0.",
    },
    "adin swell": {
        "indications": "D1-D4 bone types. Conventional and immediate placement.",
        "features": "Straight parallel-walled slightly tapered 2-piece implant with V-shaped thread. Standard Internal Hex connection. AB/AE surface. Ti-6Al-4V ELI alloy. Ø3.3 / 3.75 / 4.2 / 5.0 / 6.0.",
    },
    "adin one": {
        "indications": "Narrow ridges. Flapless minimally-invasive surgery. Lateral incisors and mandibular incisors. Immediate function / loading.",
        "features": "One-piece tapered spiral implant with integrated abutment. AB/AE surface. Ti-6Al-4V ELI alloy. Ø3.0 / 3.3 / 3.6 / 4.2 / 5.0.",
    },
}

# ── Component families per platform (representative subset — option 4a) ───
# Adin CloseFit prosthetics are shared across UNP/NP/RP/WP at the family
# level; the diameter of healing abutments and transfers tracks the
# platform. RS = the Standard Internal Hex prosthetic line shared by
# Touareg-OS, Touareg-S and Swell. OP = One-piece (no separate components).
_COMMON_CLOSEFIT_FAMILIES = [
    {"type": "cover_screw", "indication": "Submerged healing"},
    {"type": "healing_abutment",
     "variants": ["slim", "standard", "conical"],
     "gingival_heights_mm": [2, 3, 4, 5, 6],
     "indication": "Trans-mucosal / open healing"},
    {"type": "straight_abutment_cement",
     "abutment_heights_mm": [0, 1, 2, 3],
     "indication": "Cement-retained restorations"},
    {"type": "angled_abutment_cement",
     "angulations": [15, 25],
     "abutment_heights_mm": [0, 1, 2, 3],
     "indication": "Cement-retained — divergent implants"},
    {"type": "tma_straight_multi_unit",
     "gingival_heights_mm": [1, 2, 3, 4, 5],
     "indication": "Trans Mucosal Abutment (multi-unit screw-retained)"},
    {"type": "tma_angled_multi_unit",
     "angulations": [17, 30],
     "gingival_heights_mm": [2.5, 3.0, 3.5, 4.0],
     "indication": "Angled multi-unit (full-arch / All-on-X)"},
    {"type": "flat_connection_abutment",
     "abutment_heights_mm": [2, 4],
     "indication": "Multi-unit flat platform"},
    {"type": "ball_attachment",
     "gingival_heights_mm": [0.5, 1, 2, 3, 4, 5],
     "indication": "Overdenture retention"},
    {"type": "temporary_abutment_titanium",
     "variants": ["engaging", "non_engaging"],
     "indication": "Provisional / immediate temporization"},
    {"type": "open_tray_transfer",
     "variants": ["slim", "standard"],
     "indication": "Impression — open tray technique"},
    {"type": "closed_tray_transfer",
     "variants": ["slim", "standard"],
     "indication": "Impression — closed tray technique"},
    {"type": "implant_analog",
     "indication": "Master cast"},
    {"type": "abutment_screw",
     "indication": "Definitive abutment retention"},
]

# RS family (Touareg-OS / Touareg-S / Swell) — adds wide-profile + angled
# titanium abutments and TMA-45° (Touareg-only).
_COMMON_RS_FAMILIES = _COMMON_CLOSEFIT_FAMILIES + [
    {"type": "wide_profile_abutment",
     "diameters": [5.0],
     "indication": "Wide-profile esthetic restorations"},
    {"type": "tma_angled_45",
     "angulations": [45],
     "gingival_heights_mm": [4.0],
     "indication": "Severely angled multi-unit (Touareg only)"},
    {"type": "one_piece_screw_in_abutment",
     "indication": "Permanent screw-in abutment"},
]

COMPONENT_FAMILIES_BY_PLATFORM: Dict[str, List[Dict]] = {
    "UNP": list(_COMMON_CLOSEFIT_FAMILIES),
    "NP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "RP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "WP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "RS":  list(_COMMON_RS_FAMILIES),
    "OP":  [
        {"type": "one_piece_torque_driver",
         "variants": ["short", "long"],
         "indication": "Insertion torque driver (only required prosthetic accessory)"},
    ],
}


def components_for(system_name: str) -> List[Dict]:
    import copy
    platform = SYSTEM_META[system_name]["platform"]
    return copy.deepcopy(COMPONENT_FAMILIES_BY_PLATFORM[platform])


# ── Drilling protocol — per (system, diameter, bone_type) verbatim ────────
# Notation:
#   • "Tri-Step" = Adin's combined Ø2.0 / 2.8 / 3.2 pilot drill.
#   • A drill marked optional=True is a coronal-shaping / finishing drill
#     and gets a note saying "optional — relieve cortical pressure / under-
#     prepare for primary stability".
#   • All drills use the Adin sequential ladder: 3.6 → 4.2 → 4.6 → 5.2 → 5.6.
#
# Source: Adin Implants Product Catalog drilling-protocol tables, per Ø
# per bone type. The "(x.x)" notation in the PDF (drill diameter wrapped
# in parens) is captured below as `optional=True`.

# Each entry: (drill_label, diameter_mm, optional)
_PROTOCOLS: Dict[str, Dict[float, Dict[str, List[tuple]]]] = {
    # ── CloseFit family ────────────────────────────────────────────────
    "UNP CloseFit": {
        2.75: {
            "D1":      [("Pilot Drill", 2.5, False)],
            "D2": [("Pilot Drill", 2.5, False)],
            "D3": [("Pilot Drill", 2.5, False)],
            "D4":      [("Pilot Drill", 2.5, False)],
        },
    },
    "NP CloseFit": {
        3.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
    },
    "RP CloseFit": {
        3.5: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
    },
    "WP CloseFit": {
        4.3: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
        },
    },
    # ── Standard Internal Hex family ─────────────────────────────────────
    "Touareg-OS": {
        3.5: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        3.75: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
        },
        6.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True)],
        },
    },
    # Touareg-S mirrors Touareg-OS protocols except for Ø5.0 D-IV
    "Touareg-S": {
        3.5: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        3.75: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 4.2, True)],
        },
        6.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.2, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Twist Drill", 4.6, True)],
        },
    },
    "Swell": {
        3.3: {
            "D1":      [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4":      [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
        3.75: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
        },
        5.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
        },
        6.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 4.6, False), ("Coronal Drill", 5.2, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Twist Drill", 4.6, True)],
        },
    },
    # ── One-piece family ─────────────────────────────────────────────────
    "One": {
        3.0: {
            "D1":      [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4":      [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
        3.3: {
            "D1":      [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4":      [("Pilot Drill", 2.0, False)],
        },
        3.6: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4":      [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4":      [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True)],
        },
    },
}


def generate_adin_protocol(system_name: str, implant_diameter: float,
                           implant_length: float, bone: str) -> List[Dict]:
    """Generate ordered drilling-protocol steps for an Adin implant.

    Always:
      • Drill depth = implant length + 1 mm (per PDF: "Drill preparation is
        up to 1 mm longer than the implant").
      • Pilot drills run at 800 rpm; twist drills at 800 rpm; coronal/
        finishing drills at 300 rpm with copious irrigation.
      • Drills annotated as `optional=True` in the source table get a note
        flagging them as cortical-shaping / under-prep options.
    """
    table = _PROTOCOLS.get(system_name, {}).get(implant_diameter)
    if not table:
        return []
    rows = table.get(bone, table.get("D2"))  # fall back to D2-D3 medium

    steps: List[Dict] = []
    osteotomy_depth = float(implant_length) + 1.0
    step_num = 1
    for drill_label, drill_d, optional in rows:
        rpm = "800" if drill_label != "Coronal Drill" else "300"
        note_parts = []
        if optional:
            if bone == "D1":
                note_parts.append("Coronal countersink / cortical relief — recommended in dense bone.")
            elif bone == "D4":
                note_parts.append("Under-preparation drill — omit if primary stability is already adequate.")
            else:
                note_parts.append("Optional — use based on cortical density.")
        if drill_label == "Tri-Step":
            note_parts.append("Tri-Step™ combines Ø2.0 / 2.8 / 3.2 mm pilot drills in one instrument.")
        steps.append({
            "step": step_num,
            "drill_name": drill_label,
            "diameter_mm": drill_d,
            "depth_mm": osteotomy_depth,
            "rpm": rpm,
            "note": " ".join(note_parts) if note_parts else "",
        })
        step_num += 1

    # Final step — implant placement.
    steps.append({
        "step": step_num,
        "drill_name": f"{system_name} Implant Insertion",
        "diameter_mm": implant_diameter,
        "depth_mm": float(implant_length),
        "rpm": "15-30 (Ratchet or low-speed handpiece)",
        "note": (
            "Final insertion torque 30-50 Ncm typical; immediate-function "
            "loading requires ≥35 Ncm. Drill preparation is 1 mm longer "
            "than implant length."
        ),
    })
    return steps
