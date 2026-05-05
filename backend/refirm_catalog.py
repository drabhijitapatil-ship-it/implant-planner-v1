"""iter-169 — Refirm Implant System — full prosthetic catalog extracted
from the manufacturer brochure (Refirm Catalog V1.0.pdf). Exported as a
curated record so the startup seeder keeps it restart-safe.

Source: customer-assets / Refirm Catalog V1.0 (2024).
GH values recorded are CUFF / gingival-collar heights only — never the
total component height.
"""
from typing import Any, Dict, List


REFIRM_FEATURES: List[str] = [
    "Short machined collar",
    "Custom square threads + custom trapezoidal progressively-engaging threads",
    "Micro-threads at the crestal region",
    "Hybrid taper body design",
    "Osteogenic abrasive-blasted & acid-etched (SLA) surface",
    "High-strength medical Grade-23 titanium (Ti-6Al-4V ELI)",
    "Single connection platform across all diameters",
    "Conical connection with platform switch",
    "11.5° taper angle (non cold-welding)",
    "Higher abutment wall thickness to reduce load transfer to screws",
    "Larger screw tightening surface with optimum seating height",
    "Deeper and longer hex engagement",
]


def _c(type_: str, subtype: str, **kw: Any) -> Dict[str, Any]:
    r: Dict[str, Any] = {"type": type_, "subtype": subtype,
                         "material": ["titanium_alloy"]}
    r.update(kw)
    return r


REFIRM_COMPONENTS: List[Dict[str, Any]] = [
    _c("cover_screw", "Healing / Cover Screw"),
    _c("healing_abutment", "Healing Abutment / Gingival Former",
       gingival_heights_mm=[2.2, 3.0, 4.0, 5.0, 6.0],
       platforms_mm=[3.8, 4.2, 4.5, 5.2, 5.5]),
    _c("healing_abutment", "Healing Abutment / Gingival Former — Sub-Crestal",
       gingival_heights_mm=[3.0, 4.0],
       platforms_mm=[4.2, 4.5, 5.2]),
    _c("final_abutment", "Straight Abutment",
       gingival_heights_mm=[1.2, 2.2, 3.0, 4.0],
       platforms_mm=[3.8, 4.2, 4.5, 5.2, 5.7],
       retention=["cement", "screw"]),
    _c("final_abutment", "Straight Abutment — Sub-Crestal",
       gingival_heights_mm=[3.0, 4.0],
       platforms_mm=[3.8, 4.2, 4.5],
       retention=["cement", "screw"]),
    _c("final_abutment", "Angular Abutment 15°/25°",
       gingival_heights_mm=[3.0], angulation_deg=[15, 25],
       platforms_mm=[4.5], retention=["cement", "screw"]),
    _c("ti_base", "Ti-Base with Hex & Sleeve",
       gingival_heights_mm=[2.2], platforms_mm=[4.5],
       retention=["screw"], cad_cam=True),
    _c("ti_base", "Ti-Base without Hex (Sleeved)",
       gingival_heights_mm=[2.2], platforms_mm=[4.5],
       retention=["screw"], cad_cam=True),
    _c("ti_base", "Ti-Base with Hex",
       gingival_heights_mm=[1.2, 2.2, 3.0, 4.0],
       platforms_mm=[3.8, 4.2, 4.5],
       retention=["screw"], cad_cam=True),
    _c("ti_base", "Ti-Base without Hex",
       gingival_heights_mm=[1.2, 2.2, 3.0, 4.0],
       platforms_mm=[3.8, 4.2, 4.5],
       retention=["screw"], cad_cam=True),
    _c("scanbody", "Scan Body", platforms_mm=[3.8, 4.5], cad_cam=True),
    _c("scanbody", "Multi-Unit Digital Scan Body",
       platforms_mm=[4.0, 5.2], cad_cam=True),
    _c("impression_coping", "Impression Coping — Open Tray, Short"),
    _c("impression_coping", "Impression Coping — Open Tray, Long"),
    _c("impression_coping", "Impression Coping — Closed Tray, Short"),
    _c("impression_coping", "Impression Coping — Closed Tray, Long"),
    _c("impression_coping", "Multi-Unit Impression Coping — Open Tray",
       platforms_mm=[4.5, 5.2, 5.5]),
    _c("impression_coping", "Multi-Unit Impression Coping — Closed Tray",
       platforms_mm=[4.5, 5.2, 5.5]),
    _c("analog", "Implant Analog"),
    _c("analog", "Multi-Unit Digital Analog",
       platforms_mm=[4.5, 5.2, 5.5]),
    _c("prosthetic_screw", "Abutment Locking Screw", retention=["screw"]),
    _c("prosthetic_screw", "Multi-Unit Prosthetic Screw", retention=["screw"]),
    _c("prosthetic_screw", "Multi-Unit Abutment Screw", retention=["screw"]),
    _c("prosthetic_screw", "MU Impression Coping Screw — Open Tray",
       retention=["screw"]),
    _c("prosthetic_screw", "MU Impression Coping Screw — Closed Tray",
       retention=["screw"]),
    _c("overdenture_attachment", "OD-Pro Abutment (GH 2.2 mm / Ø 4.5)",
       gingival_heights_mm=[2.2], platforms_mm=[4.5],
       retention=["screw"], indication="Overdenture"),
    _c("overdenture_attachment", "OD-Pro Abutment (GH 3.0 mm / Ø 4.5)",
       gingival_heights_mm=[3.0], platforms_mm=[4.5],
       retention=["screw"], indication="Overdenture"),
    _c("overdenture_attachment", "OD-Pro Abutment (GH 4.0 mm / Ø 4.5)",
       gingival_heights_mm=[4.0], platforms_mm=[4.5],
       retention=["screw"], indication="Overdenture"),
    _c("multi_unit_abutment", "Straight Multi-Unit Abutment",
       gingival_heights_mm=[2.2, 3.0, 4.0],
       platforms_mm=[4.5], retention=["screw"]),
    _c("multi_unit_abutment", "17° Angular Multi-Unit Abutment",
       gingival_heights_mm=[2.5, 3.5, 4.5, 5.5],
       angulation_deg=[17], platforms_mm=[5.2], retention=["screw"]),
    _c("multi_unit_abutment", "30° Angular Multi-Unit Abutment",
       gingival_heights_mm=[3.5, 4.5, 5.5],
       angulation_deg=[30], platforms_mm=[5.2], retention=["screw"]),
    _c("multi_unit_abutment", "45° Angular Multi-Unit Abutment",
       gingival_heights_mm=[5.5, 6.5],
       angulation_deg=[45], platforms_mm=[5.2], retention=["screw"]),
    _c("multi_unit_abutment", "52° Angular Multi-Unit Abutment",
       gingival_heights_mm=[4.5, 5.5, 6.5],
       angulation_deg=[52], platforms_mm=[5.2], retention=["screw"]),
    _c("multi_unit_abutment", "60° Angular Multi-Unit Abutment",
       gingival_heights_mm=[6.5],
       angulation_deg=[60], platforms_mm=[5.5], retention=["screw"]),
    _c("ti_base", "Multi-Unit Ti Cylinder",
       platforms_mm=[4.5, 5.2, 5.5], retention=["screw"], cad_cam=True),
    _c("ti_base", "Multi-Unit Fully Castable Cylinder",
       platforms_mm=[4.5, 5.2, 5.5], retention=["screw"]),
    _c("healing_abutment", "Multi-Unit Healing Cap",
       platforms_mm=[4.5, 5.2, 5.5]),
]


REFIRM_RECORD: Dict[str, Any] = {
    "key": "Refirm|Refirm Implant System",
    "brand": "Refirm",
    "name": "Refirm Implant System",
    "connection": {"type": "conical", "subtype": "platform_switched",
                   "indexing": ["indexed"]},
    "platform_switching": True,
    "features": list(REFIRM_FEATURES),
    "implant": {
        "diameters_mm": [3.5, 4.0, 4.5, 5.0, 5.5],
        "lengths_mm": [8.5, 10.0, 11.5, 13.0, 15.0],
        "bone_types": ["all"],
        "healing_modes": ["submerged", "non_submerged"],
    },
    "components": list(REFIRM_COMPONENTS),
    "compatibility_notes": (
        "Single-platform conical connection with platform switch across all "
        "diameters. 11.5° taper angle — non cold-welding. Platform switching "
        "supports crestal bone preservation and reduces micro-pumping."
    ),
}
