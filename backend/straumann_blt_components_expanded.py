"""
Straumann BLT — SC (Ø 2.9 mm) prosthetic-component catalog
(iter-301, Feb 2026)

Expands the 10-row thin per-platform stub at
`straumann_blt_data.COMPONENT_FAMILIES_BY_PLATFORM["SC"]` into the full
brochure-grade per-SKU list extracted from the user-supplied
"Straumann SC Prosthetic Components" PDF (iter-301).

Scope of this batch
───────────────────
ONLY the **SC platform (Ø 2.9 mm)** is covered here. The same SC list
is fanned out into the three BLT implant systems that share an
identical prosthetic stack:

    • BLT Roxolid SLActive
    • BLT Roxolid SLA
    • BLT Ti SLA

NC (Ø 3.3) / RC (Ø 4.1 / 4.8) will be added in follow-up batches when
their respective catalogue PDFs are supplied.

Data-shape
──────────
Each entry mirrors `straumann_blx_components_expanded.py` so the
`implant_catalog.components` consumer (Implant Compare UI, AI Explain,
PDF report) works without modification:

    {
      "type":              <category>,
      "subtype":           <printed product name>,
      "platform":          "SC",
      "diameter_mm":       <number | None>,
      "gingival_heights_mm": [list],
      "material":          [list],
      "retention":         [list],
      "torque_ncm":        <number | None>,
      "catalog_code":      "<REF #>",
      "indication":        "<one-line clinical use>"
    }

Categories present (per PDF, 17 SKUs)
─────────────────────────────────────
  • healing_abutment       (4 — conical/oval, GH 2 / 3.5 / 5 / 6.5)
  • impression_post        (4 — open & closed tray, short & long)
  • implant_analog         (2 — standard + repositionable)
  • scan_body              (1 — CARES Mono)
  • variobase_crown        (3 — oval, GH 1 / 2 / 3)
  • burnout_coping         (2 — for Variobase)
  • prosthetic_screw       (1 — basal screw)

Categories deliberately NOT in this batch (not printed on the supplied
PDF page; will be added when documented separately):
  • closure_screw / cover_screw
  • final cementable / screw-retained abutments
  • multi-base / SRA / Novaloc / Locator / bar / CARES CADCAM blank
  • temporary_abutment
"""

from typing import Dict, List
import copy


# ─── SC (Ø 2.9 mm) component catalog ──────────────────────────────────────
SC_COMPONENTS: List[Dict] = [
    # ── Healing abutments (conical, oval) ──────────────────────────────
    {"type": "healing_abutment", "subtype": "Healing Abutment, conical, oval — GH 2 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [2.0],
     "material": ["Titanium"], "retention": ["screw"], "torque_ncm": 15,
     "catalog_code": "024.00075",
     "indication": "Soft-tissue conditioning around SC (Ø 2.9 mm) implants"},
    {"type": "healing_abutment", "subtype": "Healing Abutment, conical, oval — GH 3.5 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [3.5],
     "material": ["Titanium"], "retention": ["screw"], "torque_ncm": 15,
     "catalog_code": "024.00085",
     "indication": "Soft-tissue conditioning around SC (Ø 2.9 mm) implants"},
    {"type": "healing_abutment", "subtype": "Healing Abutment, conical, oval — GH 5 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [5.0],
     "material": ["Titanium"], "retention": ["screw"], "torque_ncm": 15,
     "catalog_code": "024.00095",
     "indication": "Soft-tissue conditioning around SC (Ø 2.9 mm) implants"},
    {"type": "healing_abutment", "subtype": "Healing Abutment, conical, oval — GH 6.5 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [6.5],
     "material": ["Titanium"], "retention": ["screw"], "torque_ncm": 15,
     "catalog_code": "024.00105",
     "indication": "Soft-tissue conditioning around SC (Ø 2.9 mm) implants"},

    # ── Impression posts — closed tray ────────────────────────────────
    {"type": "impression_post", "subtype": "Impression Post, closed tray — short",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": ["snap"], "torque_ncm": None,
     "catalog_code": "025.0062",
     "indication": "Closed-tray impression on SC (Ø 2.9 mm) implants — short body"},
    {"type": "impression_post", "subtype": "Impression Post, closed tray — long",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": ["snap"], "torque_ncm": None,
     "catalog_code": "025.0020",
     "indication": "Closed-tray impression on SC (Ø 2.9 mm) implants — long body"},

    # ── Impression posts — open tray ──────────────────────────────────
    {"type": "impression_post", "subtype": "Impression Post, open tray — short",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": ["screw"], "torque_ncm": None,
     "catalog_code": "025.0021",
     "indication": "Open-tray impression on SC (Ø 2.9 mm) implants — short body"},
    {"type": "impression_post", "subtype": "Impression Post, open tray — long",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": ["screw"], "torque_ncm": None,
     "catalog_code": "025.0022",
     "indication": "Open-tray impression on SC (Ø 2.9 mm) implants — long body"},

    # ── Lab analogs + scan body ───────────────────────────────────────
    {"type": "implant_analog", "subtype": "Lab Analog",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": [], "torque_ncm": None,
     "catalog_code": "025.0023",
     "indication": "Laboratory analog for SC (Ø 2.9 mm) model work"},
    {"type": "implant_analog", "subtype": "SC Repositionable Implant Analog",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["Stainless steel"], "retention": [], "torque_ncm": None,
     "catalog_code": "025.0024",
     "indication": "Repositionable analog — accurate transfer to laboratory model"},
    {"type": "scan_body", "subtype": "SC CARES® Mono Scanbody",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["PEEK"], "retention": ["screw"], "torque_ncm": None,
     "catalog_code": "025.0025",
     "indication": "Digital impression scanbody for SC (Ø 2.9 mm) — CARES workflow"},

    # ── Variobase for Crown (oval) — Ti-base for screw-/cement-retained
    {"type": "variobase_crown", "subtype": "Variobase for Crown, oval — GH 1 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [1.0],
     "material": ["Titanium"], "retention": ["screw", "cement"], "torque_ncm": 35,
     "catalog_code": "022.0038",
     "indication": "Ti-base for single-tooth screw-/cement-retained crown on SC implant"},
    {"type": "variobase_crown", "subtype": "Variobase for Crown, oval — GH 2 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [2.0],
     "material": ["Titanium"], "retention": ["screw", "cement"], "torque_ncm": 35,
     "catalog_code": "022.0039",
     "indication": "Ti-base for single-tooth screw-/cement-retained crown on SC implant"},
    {"type": "variobase_crown", "subtype": "Variobase for Crown, oval — GH 3 mm",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [3.0],
     "material": ["Titanium"], "retention": ["screw", "cement"], "torque_ncm": 35,
     "catalog_code": "022.0040",
     "indication": "Ti-base for single-tooth screw-/cement-retained crown on SC implant"},

    # ── Burn-out copings for Variobase ────────────────────────────────
    {"type": "burnout_coping", "subtype": "Burn-out Coping for Variobase Crown (Oval)",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [],
     "material": ["Polymer"], "retention": ["friction"], "torque_ncm": None,
     "catalog_code": "023.0011",
     "indication": "Burn-out coping for casting / pressing on Variobase SC oval"},
    {"type": "burnout_coping", "subtype": "Burn-out Coping for Variobase Crown (Oval) — V4 pack",
     "platform": "SC", "diameter_mm": 3.6, "gingival_heights_mm": [],
     "material": ["Polymer"], "retention": ["friction"], "torque_ncm": None,
     "catalog_code": "023.0011V4",
     "indication": "Burn-out coping — 4-piece refill pack"},

    # ── Prosthetic screw ──────────────────────────────────────────────
    {"type": "prosthetic_screw", "subtype": "Basal Screw — SC",
     "platform": "SC", "diameter_mm": None, "gingival_heights_mm": [],
     "material": ["TAN"], "retention": ["screw"], "torque_ncm": 15,
     "catalog_code": "025.0031",
     "indication": "Prosthetic basal screw for Variobase / abutments on SC implants"},
]


# Three BLT systems share the same SC prosthetic stack.
SYSTEMS_USING_SC: List[str] = [
    "BLT Roxolid SLActive",
    "BLT Roxolid SLA",
    "BLT Ti SLA",
]


def expanded_sc_components_for(system_name: str) -> List[Dict]:
    """Return a deep copy of the SC (Ø 2.9 mm) component list for the
    given BLT system. Returns [] for systems outside this batch (e.g.
    pure-NC/RC systems handled by future seeds)."""
    if system_name not in SYSTEMS_USING_SC:
        return []
    return copy.deepcopy(SC_COMPONENTS)
