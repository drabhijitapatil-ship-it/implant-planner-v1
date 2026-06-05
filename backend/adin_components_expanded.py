"""
Adin CloseFit expanded prosthetic components catalog (iter-294, Feb 2026)

Brochure-grade per-SKU prosthetic-components matrix for the four Adin CloseFit
implant platforms, following the same depth model used for Straumann BLX
(iter-293) and Alpha-Bio (iter-205). Generated from the official Adin
"Close Fit System" prosthetic-components catalog.

Adin CloseFit platforms ─────────────────────────────────────────
    • UNP CloseFit — Ultra-Narrow Platform, fits Ø2.75 implants
    • NP  CloseFit — Narrow Platform,        fits Ø3.0 implants
    • RP  CloseFit — Regular Platform,       fits Ø3.5 implants
    • WP  CloseFit — Wide Platform,          fits Ø4.3 / Ø5.0 implants

All four platforms use the **Conical Hex / Morse-taper** internal connection,
so most prosthetic part families are shared across UNP→WP with platform-
specific emergence diameters. WP additionally exposes Multi-Unit (TMA)
abutments and Flat-Connection abutments for full-arch (All-on-X) cases.

Schema matches `implant_catalog.components`:
    { type, subtype, platform, diameter_mm, gingival_heights_mm,
      angulation_deg, material, retention, torque_ncm, catalog_code,
      abutment_height_mm, indication }

Torque targets per Adin Surgical Guide (final abutments = 30 Ncm,
healing abutments / cover screws = hand-tighten ~15 Ncm).
"""
from typing import Dict, List


# Per-platform emergence diameters (mm) at the gingival level.
_EMERGENCE = {
    "UNP": 3.5,
    "NP":  3.8,
    "RP":  4.5,
    "WP":  5.5,
}

# Gingival-height ladders provided by the Adin catalog for each platform.
_GH_HEALING = [1, 2, 3, 4, 5]                  # Healing abutment heights
_GH_STD_ABUT = [1, 2, 3, 4, 5]                 # Straight cement abutments
_GH_ANGLED_ABUT = [1, 2, 3]                    # Angled cement abutments
_ANGLES_CEMENT = [15, 25]                       # Cement abutment angulations
_GH_TMA_STR = [1, 2, 3, 4, 5]                  # Multi-unit straight (WP only)
_GH_TMA_ANG = [2.5, 3.0, 3.5, 4.0]             # Multi-unit angled (WP only)
_ANGLES_TMA = [17, 30]
_GH_BALL = [1, 2, 3, 4, 5]                     # Ball attachment heights


def _build_platform(platform: str) -> List[Dict]:
    """Return the full prosthetic component list for one Adin CloseFit
    platform. UNP/NP/RP share most families; WP adds TMA + Flat-Connection +
    Retrieval Screw."""
    emerg = _EMERGENCE[platform]
    items: List[Dict] = []

    # ── Cover screw ───────────────────────────────────────────────────────
    items.append({
        "type": "cover_screw",
        "subtype": f"{platform} Cover Screw (closure screw)",
        "platform": platform, "material": ["titanium"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": f"AD-CF-{platform}-CS",
        "indication": "Submerged two-stage healing",
    })

    # ── Healing abutments (Ø emergence × GH heights) ─────────────────────
    for gh in _GH_HEALING:
        items.append({
            "type": "healing_abutment",
            "subtype": f"{platform} Healing Abutment, Ø{emerg}, GH {gh} mm",
            "platform": platform, "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": emerg, "gingival_heights_mm": [gh], "torque_ncm": 15,
            "catalog_code": f"AD-CF-{platform}-HA-{int(gh*10)}",
            "indication": "Trans-mucosal / open healing",
        })

    # ── Cement-Retained Straight Abutments ───────────────────────────────
    for gh in _GH_STD_ABUT:
        items.append({
            "type": "final_abutment",
            "subtype": f"{platform} Straight Cement Abutment, GH {gh} mm",
            "platform": platform, "material": ["titanium"], "retention": ["cement"],
            "diameter_mm": emerg, "gingival_heights_mm": [gh], "angulation_deg": 0,
            "torque_ncm": 30, "catalog_code": f"AD-CF-{platform}-SCA-{int(gh*10)}",
            "indication": "Cement-retained single crown / bridge, parallel implants",
        })

    # ── Cement-Retained Angled Abutments (15° / 25°) ─────────────────────
    for ang in _ANGLES_CEMENT:
        for gh in _GH_ANGLED_ABUT:
            items.append({
                "type": "final_abutment",
                "subtype": f"{platform} Angled Cement Abutment, {ang}°, GH {gh} mm",
                "platform": platform, "material": ["titanium"], "retention": ["cement"],
                "diameter_mm": emerg, "gingival_heights_mm": [gh],
                "angulation_deg": ang, "torque_ncm": 30,
                "catalog_code": f"AD-CF-{platform}-ACA-{ang}-{int(gh*10)}",
                "indication": "Cement-retained crown — divergent implants",
            })

    # ── Temporary Abutments (engaging + non-engaging) ────────────────────
    for variant in ("engaging", "non-engaging"):
        items.append({
            "type": "temporary_abutment",
            "subtype": f"{platform} Temporary Titanium Abutment ({variant})",
            "platform": platform, "material": ["TAN", "titanium"],
            "retention": ["screw"], "diameter_mm": emerg,
            "abutment_height_mm": 12, "torque_ncm": 15,
            "catalog_code": f"AD-CF-{platform}-TA-{variant[:3]}",
            "indication": "Provisional crown / immediate temporization",
        })

    # ── Ball Attachment (Overdenture retention) ──────────────────────────
    for gh in _GH_BALL:
        items.append({
            "type": "ball_attachment",
            "subtype": f"{platform} Ball Attachment, GH {gh} mm",
            "platform": platform, "material": ["titanium"], "retention": ["snap"],
            "diameter_mm": emerg, "gingival_heights_mm": [gh], "torque_ncm": 30,
            "catalog_code": f"AD-CF-{platform}-BA-{int(gh*10)}",
            "indication": "Overdenture retention (single-implant or multi-implant ball)",
        })

    # ── Open-Tray Transfer (Impression coping) ───────────────────────────
    items.append({
        "type": "impression_post",
        "subtype": f"{platform} Open-Tray Transfer (slim)",
        "platform": platform, "material": ["TAN", "titanium"], "retention": ["screw"],
        "diameter_mm": emerg, "abutment_height_mm": 16.5,
        "catalog_code": f"AD-CF-{platform}-OT-S",
        "indication": "Open-tray impression at implant level (narrow tray)",
    })
    items.append({
        "type": "impression_post",
        "subtype": f"{platform} Open-Tray Transfer (standard)",
        "platform": platform, "material": ["TAN", "titanium"], "retention": ["screw"],
        "diameter_mm": emerg, "abutment_height_mm": 16.5,
        "catalog_code": f"AD-CF-{platform}-OT-STD",
        "indication": "Open-tray impression at implant level",
    })

    # ── Closed-Tray Transfer ─────────────────────────────────────────────
    items.append({
        "type": "impression_post",
        "subtype": f"{platform} Closed-Tray Transfer",
        "platform": platform, "material": ["TAN", "titanium"], "retention": ["screw"],
        "diameter_mm": emerg, "abutment_height_mm": 13,
        "catalog_code": f"AD-CF-{platform}-CT",
        "indication": "Closed-tray impression at implant level",
    })

    # ── Implant Analog (master cast) ─────────────────────────────────────
    items.append({
        "type": "implant_analog",
        "subtype": f"{platform} Implant Analog",
        "platform": platform, "material": ["stainless_steel"], "retention": [],
        "diameter_mm": emerg, "abutment_height_mm": 12,
        "catalog_code": f"AD-CF-{platform}-AN",
        "indication": "Stone-model analog",
    })

    # ── Abutment Screws ──────────────────────────────────────────────────
    items.append({
        "type": "replacement_screw",
        "subtype": f"{platform} Abutment Screw (definitive)",
        "platform": platform, "material": ["TAN"], "retention": ["screw"],
        "torque_ncm": 30, "catalog_code": f"AD-CF-{platform}-AS",
        "indication": "Final abutment fixation (cement / temp / ball)",
    })
    items.append({
        "type": "replacement_screw",
        "subtype": f"{platform} Healing Screw (laboratory)",
        "platform": platform, "material": ["TAN"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": f"AD-CF-{platform}-HS",
        "indication": "Healing / lab work screw — hand-tightened",
    })

    # ─── WP-only: Multi-Unit (TMA) + Flat Connection + Retrieval Screw ──
    if platform == "WP":
        # Multi-unit STRAIGHT (TMA) for All-on-X
        for gh in _GH_TMA_STR:
            items.append({
                "type": "screw_retained_abutment",
                "subtype": f"WP TMA Straight (Multi-Unit), GH {gh} mm",
                "platform": "WP", "material": ["titanium"], "retention": ["screw"],
                "diameter_mm": emerg, "gingival_heights_mm": [gh],
                "angulation_deg": 0, "torque_ncm": 30,
                "catalog_code": f"AD-CF-WP-TMA-S-{int(gh*10)}",
                "indication": "Multi-Unit Trans-Mucosal Abutment, parallel implants (Pro-Arch / All-on-X)",
            })
        # Multi-unit ANGLED (17° / 30°) TMA
        for ang in _ANGLES_TMA:
            for gh in _GH_TMA_ANG:
                items.append({
                    "type": "screw_retained_abutment",
                    "subtype": f"WP TMA Angled, {ang}°, GH {gh} mm",
                    "platform": "WP", "material": ["titanium"], "retention": ["screw"],
                    "diameter_mm": emerg, "gingival_heights_mm": [gh],
                    "angulation_deg": ang, "torque_ncm": 30,
                    "catalog_code": f"AD-CF-WP-TMA-A{ang}-{int(gh*10)}",
                    "indication": f"Angled multi-unit ({ang}°) — tilted posterior / Pro-Arch",
                })
        # Flat-Connection abutments (multi-unit flat platform)
        for ht in [2, 4]:
            items.append({
                "type": "screw_retained_abutment",
                "subtype": f"WP Flat-Connection Abutment, H {ht} mm",
                "platform": "WP", "material": ["titanium"], "retention": ["screw"],
                "diameter_mm": emerg, "abutment_height_mm": ht, "torque_ncm": 30,
                "catalog_code": f"AD-CF-WP-FLAT-{ht}",
                "indication": "Multi-unit flat-connection — bar / overdenture / hybrid",
            })
        # Retrieval Screw (WP only — multi-unit retrieval)
        items.append({
            "type": "replacement_screw",
            "subtype": "WP Retrieval Screw (multi-unit)",
            "platform": "WP", "material": ["TAN"], "retention": ["screw"],
            "torque_ncm": 15, "catalog_code": "AD-CF-WP-RS",
            "indication": "Multi-Unit prosthesis retrieval screw",
        })
        # Multi-Unit Open-Tray / Closed-Tray impression posts
        items.append({
            "type": "impression_post",
            "subtype": "WP Multi-Unit Open-Tray Transfer (non-engaging)",
            "platform": "WP", "material": ["TAN", "titanium"], "retention": ["screw"],
            "diameter_mm": emerg, "abutment_height_mm": 16.5,
            "catalog_code": "AD-CF-WP-MU-OT",
            "indication": "Open-tray impression on TMA / Multi-Unit",
        })
        items.append({
            "type": "impression_post",
            "subtype": "WP Multi-Unit Closed-Tray Transfer (non-engaging)",
            "platform": "WP", "material": ["TAN", "titanium"], "retention": ["screw"],
            "diameter_mm": emerg, "abutment_height_mm": 13,
            "catalog_code": "AD-CF-WP-MU-CT",
            "indication": "Closed-tray impression on TMA / Multi-Unit",
        })
        items.append({
            "type": "implant_analog",
            "subtype": "WP Multi-Unit Analog",
            "platform": "WP", "material": ["stainless_steel"], "retention": [],
            "diameter_mm": emerg, "abutment_height_mm": 12,
            "catalog_code": "AD-CF-WP-MU-AN",
            "indication": "Stone-model analog for TMA / Multi-Unit",
        })

    return items


# Pre-computed per-platform palettes.
COMPONENTS_BY_PLATFORM: Dict[str, List[Dict]] = {
    "UNP": _build_platform("UNP"),
    "NP":  _build_platform("NP"),
    "RP":  _build_platform("RP"),
    "WP":  _build_platform("WP"),
}

# Adin CloseFit system → platform mapping.
SYSTEM_PLATFORM: Dict[str, str] = {
    "UNP CloseFit": "UNP",
    "NP CloseFit":  "NP",
    "RP CloseFit":  "RP",
    "WP CloseFit":  "WP",
}


def expanded_components_for(system_name: str) -> List[Dict]:
    """Return a fresh deep-copyable component list for an Adin CloseFit system."""
    import copy
    platform = SYSTEM_PLATFORM.get(system_name)
    if platform is None:
        return []
    return copy.deepcopy(COMPONENTS_BY_PLATFORM[platform])
