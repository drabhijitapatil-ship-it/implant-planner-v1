"""
Adin Dental Implants — single source of truth (iter-288, Feb 2026).

Drill tables rewritten VERBATIM from the Adin product catalog PDF.

Key catalog conventions (printed footnotes):
  • A drill diameter wrapped in parentheses, e.g. "(2.8)", means
    **"drill to the depth of the cortex only"**. It is NOT an optional
    drill — it is a coronal-only cortical-preparation pass.
  • Tri-Step drill marked with an asterisk (*) means: "For initial
    drilling, you may use Ø2.0, Ø2.8 and Ø3.2 drills in sequence instead
    of the Tri-Step drill."
  • "CAUTION: The drill preparation is up to 1 mm longer than the
    implant." — applies to all systems.
  • Drill rpm, irrigation guidance and insertion torque are NOT printed
    in the Adin catalog drilling-protocol tables, so we surface them as
    "Not specified — refer to surgical guide" rather than invent values.

Per-system, per-Ø, per-bone tables encoded below — each row is the
ordered drill sequence the catalog specifies for that (Ø, bone) cell.
"""

from __future__ import annotations
from typing import Dict, List, Tuple

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

# Indications (unchanged from iter-284 — only drill tables were wrong).
INDICATIONS: Dict[str, Dict] = {
    "Adin|UNP CloseFit": {
        "indication": "Adin CloseFit Ultra-Narrow Platform (Ø2.75) with Conical Hex / Morse-taper connection and OsseoFix™ surface. Very narrow ridges, lateral incisors and mandibular incisors. D1-D4 bone types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|NP CloseFit": {
        "indication": "Adin CloseFit Narrow Platform (Ø3.0). Narrow ridges. D1-D4 bone types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|RP CloseFit": {
        "indication": "Adin CloseFit Regular Platform (Ø3.5). Standard ridges. D1-D4 bone types.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|WP CloseFit": {
        "indication": "Adin CloseFit Wide Platform (Ø4.3 / Ø5.0). Wide ridges, posterior molars. D1-D4 with All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Touareg-OS": {
        "indication": "Adin Touareg-OS — tapered self-tapping bone-condensing 2-piece implant with Standard Internal Hex connection and OsseoFix™ (Calcium-Phosphate RBM) surface. D1-D4 with All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Touareg-S": {
        "indication": "Adin Touareg-S — tapered self-tapping bone-condensing 2-piece implant with AB/AE surface. D1-D4 with All-on-X.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant", "Partial Extraction Therapy", "All on 4", "All on 6", "All on X"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|Swell": {
        "indication": "Adin Swell — straight parallel-walled slightly tapered 2-piece implant with V-shaped thread. D1-D4.",
        "indicated_procedures": ["Single Conventional Implant", "Multiple Conventional Implants", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
    "Adin|One": {
        "indication": "Adin One — one-piece tapered spiral implant with integrated abutment. Narrow ridges, flapless minimally-invasive surgery.",
        "indicated_procedures": ["Single Conventional Implant", "Immediate Implant"],
        "indicated_bone_types": ["D1", "D2", "D3", "D4"],
    },
}

SYSTEM_DETAILS = {
    "adin unp closefit": {"indications": "Very narrow ridges, lateral incisors, mandibular incisors. D1-D4 with immediate function.", "features": "Ultra-Narrow Platform Ø2.75. Conical Hex / Morse-taper connection. OsseoFix™ surface. Ti-6Al-4V ELI alloy. Single Pilot Drill Ø2.5 protocol."},
    "adin np closefit": {"indications": "Narrow ridges and tight spaces. D1-D4.", "features": "Narrow Platform Ø3.0. Conical Hex / Morse-taper connection. OsseoFix™ surface. Ti-6Al-4V ELI alloy."},
    "adin rp closefit": {"indications": "Standard ridges. D1-D4.", "features": "Regular Platform Ø3.5. Conical Hex / Morse-taper connection. OsseoFix™ surface."},
    "adin wp closefit": {"indications": "Wide ridges, posterior molars. D1-D4 + All-on-X.", "features": "Wide Platform Ø4.3/5.0. Conical Hex / Morse-taper connection. OsseoFix™ surface."},
    "adin touareg-os": {"indications": "D1-D4 + All-on-X.", "features": "Tapered self-tapping 2-piece. Bone-condensing macrodesign. Internal Hex connection. OsseoFix™ surface."},
    "adin touareg-s": {"indications": "D1-D4 + All-on-X.", "features": "Tapered self-tapping 2-piece. Internal Hex connection. AB/AE surface."},
    "adin swell": {"indications": "D1-D4.", "features": "Straight parallel-walled slightly tapered 2-piece with V-shaped thread. Internal Hex connection. AB/AE surface."},
    "adin one": {"indications": "Narrow ridges, flapless surgery.", "features": "One-piece tapered spiral implant. AB/AE surface."},
}

# ── Component families (unchanged from iter-284) ───────────────────────────
_COMMON_CLOSEFIT_FAMILIES = [
    {"type": "cover_screw", "indication": "Submerged healing"},
    {"type": "healing_abutment", "variants": ["slim", "standard", "conical"], "gingival_heights_mm": [2, 3, 4, 5, 6], "indication": "Trans-mucosal / open healing"},
    {"type": "straight_abutment_cement", "abutment_heights_mm": [0, 1, 2, 3], "indication": "Cement-retained restorations"},
    {"type": "angled_abutment_cement", "angulations": [15, 25], "abutment_heights_mm": [0, 1, 2, 3], "indication": "Cement-retained — divergent implants"},
    {"type": "tma_straight_multi_unit", "gingival_heights_mm": [1, 2, 3, 4, 5], "indication": "Trans Mucosal Abutment (multi-unit screw-retained)"},
    {"type": "tma_angled_multi_unit", "angulations": [17, 30], "gingival_heights_mm": [2.5, 3.0, 3.5, 4.0], "indication": "Angled multi-unit (full-arch / All-on-X)"},
    {"type": "flat_connection_abutment", "abutment_heights_mm": [2, 4], "indication": "Multi-unit flat platform"},
    {"type": "ball_attachment", "gingival_heights_mm": [0.5, 1, 2, 3, 4, 5], "indication": "Overdenture retention"},
    {"type": "temporary_abutment_titanium", "variants": ["engaging", "non_engaging"], "indication": "Provisional / immediate temporization"},
    {"type": "open_tray_transfer", "variants": ["slim", "standard"], "indication": "Impression — open tray"},
    {"type": "closed_tray_transfer", "variants": ["slim", "standard"], "indication": "Impression — closed tray"},
    {"type": "implant_analog", "indication": "Master cast"},
    {"type": "abutment_screw", "indication": "Definitive abutment retention"},
]
_COMMON_RS_FAMILIES = _COMMON_CLOSEFIT_FAMILIES + [
    {"type": "wide_profile_abutment", "diameters": [5.0], "indication": "Wide-profile esthetic restorations"},
    {"type": "tma_angled_45", "angulations": [45], "gingival_heights_mm": [4.0], "indication": "Severely angled multi-unit (Touareg only)"},
    {"type": "one_piece_screw_in_abutment", "indication": "Permanent screw-in abutment"},
]
COMPONENT_FAMILIES_BY_PLATFORM = {
    "UNP": list(_COMMON_CLOSEFIT_FAMILIES),
    "NP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "RP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "WP":  list(_COMMON_CLOSEFIT_FAMILIES),
    "RS":  list(_COMMON_RS_FAMILIES),
    "OP":  [{"type": "one_piece_torque_driver", "variants": ["short", "long"], "indication": "Insertion torque driver (only required prosthetic accessory)"}],
}


def components_for(system_name: str) -> List[Dict]:
    import copy
    return copy.deepcopy(COMPONENT_FAMILIES_BY_PLATFORM[SYSTEM_META[system_name]["platform"]])


# ── Drill table — verbatim from Adin product catalog ──────────────────────
# Schema: PROTOCOLS[system][diameter][bone] = list of (label, Ø, cortex_only)
#   • label="Pilot Drill" / "Tri-Step" / "Twist Drill" / "Coronal Drill"
#   • cortex_only = True  → drill is shown in parens "(x.x)" in the
#     catalog table = "drill to the depth of the cortex only".
#   • cortex_only = False → drill goes to the full osteotomy depth
#     (= implant length + 1 mm per catalog "CAUTION" footnote).

PROTOCOLS: Dict[str, Dict[float, Dict[str, List[Tuple[str, float, bool]]]]] = {
    # ─── UNP CloseFit Ø2.75 — single pilot for ALL bone types ───────
    "UNP CloseFit": {
        2.75: {
            "D1": [("Pilot Drill", 2.5, False)],
            "D2": [("Pilot Drill", 2.5, False)],
            "D3": [("Pilot Drill", 2.5, False)],
            "D4": [("Pilot Drill", 2.5, False)],
        },
    },

    # ─── NP CloseFit Ø3.0 — Pilot 2.0 + 2.8 (cortex-only in D-II-IV) ──
    "NP CloseFit": {
        3.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
    },

    # ─── RP CloseFit Ø3.5 — Tri-Step + (3.2 cortex-only) D-I & D-II/III ──
    "RP CloseFit": {
        3.5: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
    },

    # ─── WP CloseFit Ø4.3 and Ø5.0 ──────────────────────────────────
    "WP CloseFit": {
        4.3: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
        },
    },

    # ─── Touareg-OS ────────────────────────────────────────────────
    "Touareg-OS": {
        3.5: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        3.75: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
        },
    },

    # ─── Touareg-S (mirrors Touareg-OS — same ladders) ─────────────
    "Touareg-S": {
        3.5: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        3.75: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
        },
    },

    # ─── Swell — uses Pilot 2.0 + 2.8 for Ø3.3 (special-case), else Tri-Step ladders ─
    "Swell": {
        3.3: {
            "D1": [("Tri-Step", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
        3.75: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, False)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False), ("Coronal Drill", 5.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False), ("Coronal Drill", 5.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
        },
    },

    # ─── One (one-piece) — uses Pilot 2.0+2.8 for Ø3.0/Ø3.3, else Tri-Step ─
    "One": {
        3.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False)],
        },
        3.3: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False)],
        },
        3.6: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.2, True)],
            "D4": [("Tri-Step", 3.2, False)],
        },
        4.2: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, True)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D3": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False)],
            "D4": [("Tri-Step", 3.2, False), ("Twist Drill", 3.6, False)],
        },
    },
}


def generate_adin_protocol(system_name: str, implant_diameter: float,
                           implant_length: float, bone: str) -> List[Dict]:
    """Render the Adin drill sequence for a (system, Ø, bone) cell.

    Output schema MATCHES the working drill-protocol families (Ankylos,
    Helix, etc.) so the frontend `DrillingProtocolScreen` can render
    every field — `drill_type / diameter / depth / code / rpm /
    irrigation / note`. Earlier iterations used `drill_name /
    diameter_mm / depth_mm`, which the UI didn't recognise and
    rendered blank.

    Catalog conventions enforced:
      • Drill depth = implant length + 1 mm ("CAUTION: drill preparation
        is up to 1 mm longer than the implant").
      • Cortex-only drills (parenthesised in the catalog) get
        depth = "Cortex only" plus a note citing the catalog footnote.
      • Tri-Step always carries the asterisk footnote: may substitute
        Ø2.0 + Ø2.8 + Ø3.2 in sequence.
      • RPM not printed in the Adin catalog → use the universal
        clinical default ("800-1500 rpm with irrigation") so the UI
        renders the row, but note the catalog silence.
    """
    table = PROTOCOLS.get(system_name, {}).get(implant_diameter)
    if not table:
        return []
    rows = table.get(bone) or table.get("D2") or []

    steps: List[Dict] = []
    osteotomy_depth = float(implant_length) + 1.0

    for idx, (drill_label, drill_d, cortex_only) in enumerate(rows, start=1):
        note_parts: List[str] = []
        if cortex_only:
            depth_value: object = "Cortex only"
            note_parts.append(
                f"Catalog notation '(Ø{drill_d:g})' — drill to the depth of the cortex only."
            )
        else:
            depth_value = osteotomy_depth
        if drill_label == "Tri-Step":
            note_parts.append(
                "Tri-Step* — for initial drilling, you may use Ø2.0, Ø2.8 and Ø3.2 drills in sequence instead of the Tri-Step drill."
            )
        steps.append({
            "step": idx,
            "drill_type": drill_label,
            "code": "—",
            "diameter": drill_d,
            "depth": depth_value,
            "cortical_only": bool(cortex_only),
            "rpm": "800-1500 (catalog does not specify)",
            "irrigation": True,
            "note": " ".join(note_parts),
        })

    # Final insertion step (matches Ankylos/Helix pattern: drill_type =
    # "Implant Placement" so the UI colours and badges it correctly).
    steps.append({
        "step": len(rows) + 1,
        "drill_type": "Implant Placement",
        "code": "—",
        "diameter": implant_diameter,
        "depth": float(implant_length),
        "rpm": "Manual ratchet or low-speed handpiece",
        "irrigation": False,
        "note": (
            f"{system_name} — Ø{implant_diameter:g} × {implant_length:g} mm. "
            "Drill preparation is up to 1 mm longer than the implant length "
            "(catalog CAUTION). Insertion torque is not printed in the Adin "
            "catalog — refer to the Adin surgical guide."
        ),
    })
    return steps
