"""
Adin RS / One expanded prosthetic components catalog (iter-295, Feb 2026)

Brochure-grade per-SKU prosthetic-components matrix for the remaining four
Adin implant systems, extracted from the official Adin Catalogue PDF:

  • Touareg-OS  — RS (Standard Internal Hex) prosthetic platform
  • Touareg-S   — RS (Standard Internal Hex) — shares the RS line
  • Swell       — RS (Standard Internal Hex) — shares the RS line
  • One         — One-Piece integrated abutment — only torque-driver accessory

Shared RS platform palette (3 emergence widths: Slim Ø3.5 / Standard Ø4.5 /
Wide Ø6.0) covers ~95 unique SKUs across:
  Healing & Cover Screws, Cement-Retained (Slim/Std/Wide/Esthetic/Engaging/
  Non-Engaging Cylindrical/One-piece Screw-in/Angled 15°/25°/35°), TMA
  Multi-Unit (Straight Ø4.6 GH 1-5 / Angled 17°/30°/45°), Flat Connection
  abutments, Ball Attachments (1-6 mm GH + nylon/Ti/SS caps), Analogs,
  Open-Tray / Closed-Tray transfers (slim + standard, short + long), RS
  Retrieval Screw, RS prosthetic screws (cover/short/standard/angled/TMA),
  Prosthetic hand & torque drivers, handpiece adapters.

Schema matches `implant_catalog.components`:
    { type, subtype, platform, diameter_mm, gingival_heights_mm,
      angulation_deg, material, retention, torque_ncm, catalog_code,
      abutment_height_mm, indication }
"""
from typing import Dict, List


def _rs_palette() -> List[Dict]:
    """Full RS (Standard Internal Hex) palette shared across Touareg-OS,
    Touareg-S, and Swell. ~95 SKUs."""
    items: List[Dict] = []

    # ── Cover Screw (RS3435) ─────────────────────────────────────────────
    items.append({
        "type": "cover_screw", "subtype": "RS Implant Cover Screw",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": "RS3435",
        "indication": "Submerged two-stage healing — fits all RS platforms",
    })

    # ── Healing Abutments — 3.5 mm Slim (5 GH) ───────────────────────────
    for code, gh in [("RS3027", 2), ("RS3028", 3), ("RS3029", 4), ("RS3030", 5), ("RS3031", 6)]:
        items.append({
            "type": "healing_abutment", "subtype": f"RS Slim Healing Abutment Ø3.5, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 3.5, "gingival_heights_mm": [gh], "torque_ncm": 15,
            "catalog_code": code, "indication": "Trans-mucosal healing, slim profile (3.5 mmD)",
        })

    # ── Healing Abutments — 4.5 mm Standard (5 GH) ───────────────────────
    for code, gh in [("RS3022", 2), ("RS3023", 3), ("RS3024", 4), ("RS3025", 5), ("RS3026", 6)]:
        items.append({
            "type": "healing_abutment", "subtype": f"RS Healing Abutment Ø4.5, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 4.5, "gingival_heights_mm": [gh], "torque_ncm": 15,
            "catalog_code": code, "indication": "Trans-mucosal healing, standard profile (4.5 mmD)",
        })

    # ── Healing Abutments — 6.0 mm Wide (4 GH) ───────────────────────────
    for code, gh in [("RS3012", 2), ("RS3013", 3), ("RS3014", 4), ("RS3015", 5)]:
        items.append({
            "type": "healing_abutment", "subtype": f"RS Wide Healing Abutment Ø6.0, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 6.0, "gingival_heights_mm": [gh], "torque_ncm": 15,
            "catalog_code": code, "indication": "Trans-mucosal healing, wide molar profile (6 mmD)",
        })

    # ── Cement-Retained Slim Titanium Abutments (Ø3.5) ───────────────────
    for code, ah in [("RS3903", 3), ("RS3906", 6), ("RS3908", 8)]:
        items.append({
            "type": "final_abutment", "subtype": f"RS Slim Titanium Abutment Ø3.5, AH {ah} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
            "diameter_mm": 3.5, "angulation_deg": 0, "abutment_height_mm": ah,
            "torque_ncm": 30, "catalog_code": code,
            "indication": "Cement-retained single crown, slim emergence",
        })

    # ── Cement-Retained Straight Titanium Abutments (Ø4.5) ───────────────
    for code, gh, label in [
        ("RS3800", 0, "No End Line"), ("RS3801", 1, "GH 1"), ("RS3802", 2, "GH 2"),
        ("RS3803", 3, "GH 3"), ("RS3804", 4, "GH 4"), ("RS3805", 5, "GH 5"),
        ("RS3811", 12.5, "Long 12.5"),
    ]:
        items.append({
            "type": "final_abutment", "subtype": f"RS Straight Titanium Abutment Ø4.5 ({label})",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
            "diameter_mm": 4.5, "angulation_deg": 0, "gingival_heights_mm": [gh],
            "torque_ncm": 30, "catalog_code": code,
            "indication": "Cement-retained crown / bridge, parallel implants",
        })

    # ── Esthetic Straight Abutments ──────────────────────────────────────
    for code, gh in [("RS0010", 1), ("RS0011", 2), ("RS0012", 3)]:
        items.append({
            "type": "final_abutment", "subtype": f"RS Esthetic Straight Abutment, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
            "diameter_mm": 4.5, "angulation_deg": 0, "gingival_heights_mm": [gh],
            "torque_ncm": 30, "catalog_code": code,
            "indication": "Esthetic cement-retained anterior crown",
        })

    # ── Wide Cement Abutments ───────────────────────────────────────────
    items.append({
        "type": "final_abutment", "subtype": "RS Titanium Abutment Ø5.0 Wide",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
        "diameter_mm": 5.0, "angulation_deg": 0, "torque_ncm": 30,
        "catalog_code": "RS3950", "indication": "Wide cement abutment, molar",
    })
    items.append({
        "type": "final_abutment", "subtype": "RS Wide Profile Titanium Abutment",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
        "diameter_mm": 6.0, "angulation_deg": 0, "torque_ncm": 30,
        "catalog_code": "RS3890", "indication": "Wide-profile esthetic cement abutment",
    })

    # ── Engaging / Non-Engaging Cylindrical Abutments ───────────────────
    items.append({
        "type": "final_abutment", "subtype": "RS Engaging Straight Cylindrical Titanium Abutment",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
        "diameter_mm": 4.5, "gingival_heights_mm": [2], "angulation_deg": 0,
        "torque_ncm": 30, "catalog_code": "RS3411",
        "indication": "Engaging cylindrical, anti-rotation",
    })
    items.append({
        "type": "final_abutment", "subtype": "RS Non-Engaging Straight Cylindrical Titanium Abutment",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
        "diameter_mm": 4.5, "gingival_heights_mm": [2], "angulation_deg": 0,
        "torque_ncm": 30, "catalog_code": "RS3422",
        "indication": "Non-engaging cylindrical, multi-unit",
    })
    items.append({
        "type": "final_abutment", "subtype": "RS One-Piece Screw-in Abutment",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "diameter_mm": 4.5, "torque_ncm": 30, "catalog_code": "RS3812",
        "indication": "Permanent screw-in cement abutment",
    })

    # ── Angled Cement Abutments (15° / 25° / 35°) ────────────────────────
    for code, ang, suffix in [
        ("RS4015", 15, ""), ("RS4016", 15, "Long"),
        ("RS4017", 15, "Slim 1mm No End Line"), ("RS4018", 15, "Slim 2mm No End Line"),
        ("RS4019", 15, "Slim 3mm No End Line"),
        ("RS4025", 25, ""), ("RS4035", 35, ""),
    ]:
        items.append({
            "type": "final_abutment", "subtype": f"RS Angled Titanium Abutment {ang}° {suffix}".strip(),
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["cement"],
            "diameter_mm": 4.5, "angulation_deg": ang, "torque_ncm": 30,
            "catalog_code": code,
            "indication": f"Cement-retained crown, divergent implants up to {ang}°",
        })

    # ── TMA (Trans-Mucosal Multi-Unit) Straight ──────────────────────────
    for code, gh in [("RS3725", 1), ("RS3726", 2), ("RS3727", 3), ("RS3728", 4), ("RS3729", 5)]:
        items.append({
            "type": "screw_retained_abutment", "subtype": f"RS TMA Straight (Multi-Unit), GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 4.6, "angulation_deg": 0, "gingival_heights_mm": [gh],
            "torque_ncm": 30, "catalog_code": code,
            "indication": "Multi-Unit Trans-Mucosal Abutment, parallel implants (Pro-Arch / All-on-X)",
        })

    # ── TMA Angled (17° / 30° / 45°) ─────────────────────────────────────
    for code, ang, gh in [
        ("RS3731", 17, 2), ("RS3732", 17, 3), ("RS3733", 17, 4),
        ("RS3734", 17, 3), ("RS3735", 30, 3), ("RS3738", 30, 4),
        ("RS3736", 45, 4),
    ]:
        items.append({
            "type": "screw_retained_abutment", "subtype": f"RS Angled TMA, {ang}°, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 4.6, "angulation_deg": ang, "gingival_heights_mm": [gh],
            "torque_ncm": 30, "catalog_code": code,
            "indication": f"Angled multi-unit ({ang}°) — tilted posterior / Pro-Arch",
        })

    # ── TMA Auxiliaries ──────────────────────────────────────────────────
    items.append({"type": "healing_abutment", "subtype": "TMA Healing Cap",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5005", "indication": "Healing on TMA multi-unit"})
    items.append({"type": "temporary_abutment", "subtype": "TMA Titanium Temporary Cylinder",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS4900", "indication": "Provisional multi-unit cylinder"})
    items.append({"type": "burnout_coping", "subtype": "TMA Plastic Casting Sleeve",
        "platform": "RS", "material": ["POM"], "retention": ["screw"],
        "catalog_code": "RS5001", "indication": "Burn-out casting for TMA (with prosthetic screw)"})
    items.append({"type": "implant_analog", "subtype": "TMA Abutment Replica",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"],
        "catalog_code": "RS5004", "indication": "Stone-model analog for TMA"})
    items.append({"type": "impression_post", "subtype": "TMA Open Tray Transfer",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5006", "indication": "Open-tray on TMA multi-unit"})
    items.append({"type": "impression_post", "subtype": "RS TMA Closed Tray Transfer",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5011", "indication": "Closed-tray on TMA multi-unit"})

    # ── Flat Connection (multi-unit flat platform) ──────────────────────
    for code, ah, name in [
        ("FC4502", 2, "Flat Connection Abutment, H 2 mm"),
        ("FC4504", 4, "Flat Connection Abutment, H 4 mm"),
    ]:
        items.append({
            "type": "screw_retained_abutment", "subtype": name,
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": 4.6, "abutment_height_mm": ah, "torque_ncm": 30,
            "catalog_code": code, "indication": "Multi-unit flat-connection / bar / overdenture",
        })
    items.append({"type": "impression_post", "subtype": "Flat Connection Transfer",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "FC5512", "indication": "Impression coping for flat-connection"})
    items.append({"type": "temporary_abutment", "subtype": "Flat Connection Temporary Cylinder Sleeve",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "FC5515", "indication": "Provisional flat-connection"})
    items.append({"type": "implant_analog", "subtype": "Flat Connection Implant Replica",
        "platform": "RS", "material": ["stainless_steel"],
        "catalog_code": "FC5737", "indication": "Stone-model analog for flat-connection"})
    items.append({"type": "burnout_coping", "subtype": "Flat Connection Castable Abutment (centering ring)",
        "platform": "RS", "material": ["POM"], "retention": ["screw"],
        "catalog_code": "FC6011", "indication": "Cast-on framework for flat-connection"})
    items.append({"type": "replacement_screw", "subtype": "Flat Connection Titanium Retaining Screw",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 30, "catalog_code": "FC6015",
        "indication": "Final retaining screw for flat-connection"})

    # ── Ball Attachments (Overdenture) ───────────────────────────────────
    for code, gh in [("RS2861", 1), ("RS2862", 2), ("RS2863", 3), ("RS2864", 4), ("RS2865", 5), ("RS2866", 6)]:
        items.append({
            "type": "ball_attachment", "subtype": f"RS Ball Attachment w/ Hex, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["snap"],
            "diameter_mm": 4.5, "gingival_heights_mm": [gh], "torque_ncm": 30,
            "catalog_code": code,
            "indication": "Overdenture retention, ball-and-socket",
        })
    items.append({"type": "ball_attachment", "subtype": "Plastic Ball Cap — White",
        "platform": "RS", "material": ["nylon"], "retention": ["snap"],
        "catalog_code": "RS2660", "indication": "Ball cap, standard retention"})
    items.append({"type": "ball_attachment", "subtype": "Plastic Ball Cap — Pink (soft)",
        "platform": "RS", "material": ["nylon"], "retention": ["snap"],
        "catalog_code": "RS2662", "indication": "Ball cap, soft (low retention)"})
    items.append({"type": "ball_attachment", "subtype": "Titanium Ball Cap",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["snap"],
        "catalog_code": "RS2670", "indication": "Ball cap, high retention"})
    items.append({"type": "ball_attachment", "subtype": "Stainless Steel Ball Cap",
        "platform": "RS", "material": ["stainless_steel"], "retention": ["snap"],
        "catalog_code": "RS2675SS", "indication": "Ball cap, lab try-in"})

    # ── Analogs ─────────────────────────────────────────────────────────
    items.append({"type": "implant_analog", "subtype": "RS Internal Hex Implant Analog",
        "platform": "RS", "material": ["stainless_steel"],
        "catalog_code": "RS5737", "indication": "Stone-model analog, internal hex"})
    items.append({"type": "implant_analog", "subtype": "Ball Attachment Abutment Replica",
        "platform": "RS", "material": ["stainless_steel"],
        "catalog_code": "RS5740", "indication": "Stone-model analog for ball attachments"})

    # ── Impression Transfers (open + closed tray, slim + standard) ──────
    for code, plat_d, length, tray, slim in [
        ("RS3510", 3.6, 10, "Open Tray", True), ("RS3514", 3.6, 14, "Open Tray", True),
        ("RS4510", 4.5, 10, "Open Tray", False), ("RS4514", 4.5, 14, "Open Tray", False),
        ("RS5109", 3.5, 9,  "Closed Tray", True), ("RS5209", 4.5, 9,  "Closed Tray", False),
        ("RS5113", 3.5, 13, "Closed Tray", True), ("RS5213", 4.5, 13, "Closed Tray", False),
    ]:
        slim_label = "Slim " if slim else ""
        items.append({
            "type": "impression_post",
            "subtype": f"RS {slim_label}{tray} Transfer Ø{plat_d}, L{length} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "diameter_mm": plat_d, "abutment_height_mm": length,
            "catalog_code": code,
            "indication": f"{tray.lower()} impression at implant level",
        })

    # ── Retrieval Screw + RS Screws family ──────────────────────────────
    items.append({"type": "replacement_screw", "subtype": "RS Retrieval Screw For Abutments",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": "RS3401",
        "indication": "Prosthesis retrieval — stripped/seized screws"})
    items.append({"type": "replacement_screw", "subtype": "RS Prosthetic Screw",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 30, "catalog_code": "RS3400",
        "indication": "Standard prosthetic screw for RS abutments"})
    items.append({"type": "replacement_screw", "subtype": "RS Short Prosthetic Screw",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 30, "catalog_code": "RS3402",
        "indication": "Short prosthetic screw"})
    items.append({"type": "replacement_screw", "subtype": "RS Screw for Angled Titanium Abutment",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 30, "catalog_code": "RS3480",
        "indication": "Fixation screw for 15°/25°/35° angled abutments"})
    items.append({"type": "replacement_screw", "subtype": "RS Retaining Screw For Angled TMA",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": "RS3403",
        "indication": "Retaining screw for angled TMA multi-unit"})
    items.append({"type": "replacement_screw", "subtype": "TMA Prosthetic Screw",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": "RS3404",
        "indication": "Definitive prosthetic screw for TMA multi-unit"})
    for code, gh in [("RS3406", 1), ("RS3407", 2), ("RS3408", 3), ("RS3409", 4), ("RS3412", 5)]:
        items.append({"type": "replacement_screw",
            "subtype": f"RS Retaining Screw for TMA, GH {gh} mm",
            "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
            "torque_ncm": 15, "catalog_code": code,
            "indication": f"Retaining screw for TMA GH {gh} mm"})
    items.append({"type": "replacement_screw", "subtype": "TMA Screw For Open Tray Transfer",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5008", "indication": "Open-tray fixation on TMA"})
    items.append({"type": "replacement_screw", "subtype": "RS Closed Tray Transfer Screw — Short",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5126", "indication": "Closed-tray fixation, short"})
    items.append({"type": "replacement_screw", "subtype": "RS Closed Tray Transfer Screw — Long",
        "platform": "RS", "material": ["Ti-6Al-4V ELI"], "retention": ["screw"],
        "catalog_code": "RS5127", "indication": "Closed-tray fixation, long"})

    return items


# Per-system component palettes.
_RS_PALETTE = _rs_palette()

# One uses one-piece integrated abutments. Only the matching torque driver is
# a prosthetic accessory.
_ONE_PALETTE: List[Dict] = [
    {"type": "auxiliary", "subtype": "RS One Piece Torque Driver — Short",
     "platform": "One-Piece", "material": ["stainless_steel"],
     "catalog_code": "RS6025",
     "indication": "Insertion torque driver for One-piece implants (short)"},
    {"type": "auxiliary", "subtype": "RS One Piece Torque Driver — Long",
     "platform": "One-Piece", "material": ["stainless_steel"],
     "catalog_code": "RS6026",
     "indication": "Insertion torque driver for One-piece implants (long)"},
    # Note: Adin One implants ship with the abutment already integrated;
    # all crown-and-bridge work uses standard CAD/CAM workflows on the
    # exposed coronal portion. No separate prosthetic SKU palette exists.
]


SYSTEM_COMPONENTS: Dict[str, List[Dict]] = {
    "Touareg-OS": _RS_PALETTE,
    "Touareg-S":  _RS_PALETTE,
    "Swell":      _RS_PALETTE,
    "One":        _ONE_PALETTE,
}


def expanded_components_for(system_name: str) -> List[Dict]:
    """Return a fresh deep-copyable component list for one of the four Adin
    non-CloseFit systems (Touareg-OS / Touareg-S / Swell / One)."""
    import copy
    if system_name not in SYSTEM_COMPONENTS:
        return []
    return copy.deepcopy(SYSTEM_COMPONENTS[system_name])
