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
        2.75: [10, 11.5, 13, 15, 16, 18],
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
        3.5:  [8, 10, 11.5, 13, 16, 18],
        3.75: [8, 10, 11.5, 13, 16, 18],
        4.2:  [6.25, 8, 10, 11.5, 13, 16, 18],
        5.0:  [6.25, 8, 10, 11.5, 13, 16],
        6.0:  [6.25, 8, 10, 11.5, 13],
    },
    "Touareg-S": {
        3.5:  [8, 10, 11.5, 13, 16, 18],
        3.75: [8, 10, 11.5, 13, 16, 18],
        4.2:  [6.25, 8, 10, 11.5, 13, 16, 18],
        5.0:  [6.25, 8, 10, 11.5, 13, 16],
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
    # ─── UNP CloseFit Ø2.75 — single sequential drill for ALL bone types ─
    "UNP CloseFit": {
        2.75: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.5, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.5, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.5, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.5, False)],
        },
    },

    # ─── NP CloseFit Ø3.0 — sequential ladder (2.0 → 2.8) ────────────
    "NP CloseFit": {
        3.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False)],
        },
    },

    # ─── RP CloseFit Ø3.5 — SEQUENTIAL ladder (2.0 → 2.8 → 3.2) ──────
    # User instruction (iter-294): use sequential drilling, NOT Tri-Step.
    # The Tri-Step alternative is exposed via TRISTEP_CLOSEFIT_PROTOCOLS.
    "RP CloseFit": {
        3.5: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, True)],
            "D4": [("Pilot Drill", 2.0, False)],
        },
    },

    # ─── WP CloseFit Ø4.3 and Ø5.0 — SEQUENTIAL (no Tri-Step) ────────
    "WP CloseFit": {
        4.3: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, True)],
            "D4": [("Pilot Drill", 2.0, False)],
        },
        5.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
        },
    },

    # ─── Touareg-OS — SEQUENTIAL primary (Tri-Step alt in TRISTEP_PROTOCOLS) ─
    # iter-295 (Feb 2026): user requested same protocol semantics as CloseFit.
    # Catalog "Tri-Step Ø3.2" expands sequentially into Ø2.0 → Ø2.8 → Ø3.2
    # (asterisk footnote). All higher diameters follow the same ladder.
    "Touareg-OS": {
        3.5: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        3.75: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        4.2: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        5.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },

    # ─── Touareg-S — SEQUENTIAL primary (mirrors Touareg-OS) ─────────────
    "Touareg-S": {
        3.5: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        3.75: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        4.2: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        5.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },

    # ─── Swell — SEQUENTIAL primary ──────────────────────────────────────
    # Special-case for Ø3.3: catalog uses only Ø2.0 + Ø2.8 (no Tri-Step).
    "Swell": {
        3.3: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
        },
        3.75: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        4.2: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        5.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },

    # ─── One (one-piece) — SEQUENTIAL primary ────────────────────────────
    # Ø3.0 / Ø3.3 only use Ø2.0 + Ø2.8 (no Tri-Step in catalog).
    "One": {
        3.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
        3.3: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, True)],
        },
        3.6: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False)],
        },
        4.2: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False)],
        },
        5.0: {
            "D1": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Pilot Drill", 2.0, False), ("Twist Drill", 2.8, False), ("Twist Drill", 3.2, False), ("Twist Drill", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
    },
}


# ── Tri-Step ALTERNATE protocols (iter-294 / iter-295) ────────────────────
# User requested: surface sequential drilling as primary (PROTOCOLS above),
# and Tri-Step as an OPTION. The Tri-Step drill is a single multi-step burr
# that replaces the Ø2.0 + Ø2.8 + Ø3.2 sequence with one drill.
#
# Coverage:
#   • RP / WP CloseFit  (iter-294)
#   • Touareg-OS / Touareg-S / Swell  (iter-295) — all Ø
#   • One  (iter-295) — only Ø3.6 / 4.2 / 5.0 (Ø3.0 and Ø3.3 catalog has no Tri-Step)
# UNP / NP CloseFit and Swell Ø3.3 have no Tri-Step variant in the catalog.
TRISTEP_CLOSEFIT_PROTOCOLS: Dict[str, Dict[float, Dict[str, List[Tuple[str, float, bool]]]]] = {
    "RP CloseFit": {
        3.5: {
            "D1": [("Tri-Step", 3.2, False)],
            "D2": [("Tri-Step", 3.2, False)],
            "D3": [("Tri-Step", 3.2, False)],
            "D4": [("Tri-Step", 3.2, False)],
        },
    },
    "WP CloseFit": {
        4.3: {
            "D1": [("Tri-Step", 3.6, False)],
            "D2": [("Tri-Step", 3.6, False)],
            "D3": [("Tri-Step", 3.6, False)],
            "D4": [("Tri-Step", 3.6, False)],
        },
        5.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, False)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False)],
        },
    },
    # ── Touareg-OS Tri-Step alternates (iter-295) ─────────────────────
    "Touareg-OS": {
        3.5:  {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        3.75: {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        4.2:  {b: [("Tri-Step", 3.6, False)] for b in ("D1","D2","D3","D4")},
        5.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },
    # ── Touareg-S Tri-Step (mirrors Touareg-OS) ───────────────────────
    "Touareg-S": {
        3.5:  {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        3.75: {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        4.2:  {b: [("Tri-Step", 3.6, False)] for b in ("D1","D2","D3","D4")},
        5.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },
    # ── Swell Tri-Step (Ø3.3 has no Tri-Step variant) ─────────────────
    "Swell": {
        3.75: {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        4.2:  {b: [("Tri-Step", 3.6, False)] for b in ("D1","D2","D3","D4")},
        5.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
        6.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, False), ("Coronal Drill", 5.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Twist Drill", 5.2, True), ("Coronal Drill", 5.6, True)],
        },
    },
    # ── One Tri-Step (Ø3.0/3.3 have no Tri-Step variant) ──────────────
    "One": {
        3.6: {b: [("Tri-Step", 3.2, False)] for b in ("D1","D2","D3","D4")},
        4.2: {b: [("Tri-Step", 3.6, False)] for b in ("D1","D2","D3","D4")},
        5.0: {
            "D1": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D2": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D3": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, False), ("Coronal Drill", 4.6, True)],
            "D4": [("Tri-Step", 3.6, False), ("Twist Drill", 4.2, True), ("Coronal Drill", 4.6, True)],
        },
    },
}


def _render_drill_steps(rows, implant_diameter, implant_length, system_name):
    """Render a list of (label, Ø, cortex_only) rows into the unified
    drill-step schema with a final Implant Placement step."""
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
                "Tri-Step* — for initial drilling, you may use Ø2.0, Ø2.8 and Ø3.2 drills in sequence instead of the Tri-Step drill (Adin catalog asterisk footnote)."
            )
        steps.append({
            "step": idx,
            "drill_type": drill_label,
            "code": "—",
            "diameter": drill_d,
            "depth": depth_value,
            "cortical_only": bool(cortex_only),
            "rpm": "800-1500",
            "irrigation": True,
            "note": " ".join(note_parts),
        })
    steps.append({
        "step": len(rows) + 1,
        "drill_type": "Implant Placement",
        "code": "—",
        "diameter": implant_diameter,
        "depth": float(implant_length),
        "cortical_only": False,
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


def generate_adin_protocol(system_name: str, implant_diameter: float,
                           implant_length: float, bone: str) -> List[Dict]:
    """Render the PRIMARY (sequential) Adin drill sequence for a (system, Ø,
    bone) cell — schema matches working drill-protocol families (Ankylos,
    Helix, BLX, BLT) so the frontend renders every field.
    """
    table = PROTOCOLS.get(system_name, {}).get(implant_diameter)
    if not table:
        return []
    rows = table.get(bone) or table.get("D2") or []
    return _render_drill_steps(rows, implant_diameter, implant_length, system_name)


def generate_adin_tristep_alt_protocol(system_name: str, implant_diameter: float,
                                       implant_length: float, bone: str) -> List[Dict]:
    """Render the ALTERNATIVE Tri-Step Adin drill sequence for CloseFit
    (RP/WP only). Returns [] for systems that have no Tri-Step pathway.
    The Tri-Step drill is a single multi-step burr that combines the
    Ø2.0 + Ø2.8 + Ø3.2 sequential drills into one drill.
    """
    table = TRISTEP_CLOSEFIT_PROTOCOLS.get(system_name, {}).get(implant_diameter)
    if not table:
        return []
    rows = table.get(bone) or table.get("D2") or []
    return _render_drill_steps(rows, implant_diameter, implant_length, system_name)
