"""iter-372 — Bredent copaSKY revision (Feb 2026).

Source: user-supplied "Prospekt-copaSKY[21-4]print.pdf" brochure — the revised
copaSKY line-up with narrow (Ø3.0) and wide (Ø6.0) diameters and a universal
prosthetic platform (one set of components fits every diameter).

Delivers:
  • 24 implant SKUs across 6 diameters × variable lengths (replaces the legacy
    3-SKU ultra-short-only grid).
  • ~50 universal prosthetic components covering four restoration pathways:
      - cement-retained  → Ti-Base + custom zirconia
      - single screw-retained  → Ti-Base (screw access through the crown)
      - multi-unit screw-retained  → uni.cone abutment (straight + 17°/30°)
      - removable overdenture  → TiSi.snap abutment + retention.sil inserts
        (3 hardnesses: 200 light-pink, 400 medium-pink, 600 dark-pink).
"""

# ── Implant SKU matrix (implant_library) ─────────────────────────────────
# (diameter, length) pairs. 24 rows.
COPA_SKY_SKUS = []
for d, lengths in [
    (3.0, [8, 10, 12, 14]),
    (3.5, [8, 10, 12, 14]),
    (4.0, [5, 8, 10, 12, 14]),
    (4.5, [5, 8, 10, 12, 14]),
    (5.0, [5, 8, 10, 12]),
    (6.0, [5, 8]),
]:
    for L in lengths:
        COPA_SKY_SKUS.append({
            "brand": "Bredent",
            "system": "Copa Sky",
            "diameter": float(d),
            "length": float(L),
        })

assert len(COPA_SKY_SKUS) == 24, len(COPA_SKY_SKUS)


# ── Prosthetic components (implant_catalog.components) ───────────────────

COPA_SKY_GH_MM = [1.5, 2.5, 3.5, 4.5, 6.5]


def _copa_sky_components():
    comps = []

    # ── 1. Cover screw (submerged healing) ────────────────────────────
    comps.append({
        "type": "cover_screw",
        "subtype": "copaSKY cover screw (universal platform)",
        "platform": "copaSKY",
        "material": ["titanium"], "retention": ["screw"],
        "torque_ncm": 15,
        "catalog_code": "COPA-CS",
        "indication": "Two-stage submerged healing",
    })

    # ── 2. Healing abutments (universal Ø × GH 1.5-6.5) ───────────────
    for gh in COPA_SKY_GH_MM:
        gh_code = str(gh).replace(".", "")
        comps.append({
            "type": "healing_abutment",
            "subtype": f"copaSKY healing abutment (universal), GH {gh} mm",
            "platform": "copaSKY",
            "material": ["titanium"], "retention": ["screw"],
            "gingival_heights_mm": [gh],
            "torque_ncm": 15,
            "catalog_code": f"COPA-HA-{gh_code}",
            "indication": "Trans-mucosal open healing — universal platform",
        })

    # ── 3. Impression copings + digital scan body ─────────────────────
    comps += [
        {"type": "impression_coping", "subtype": "copaSKY open-tray impression coping + screw",
         "platform": "copaSKY", "material": ["titanium"], "retention": ["screw"],
         "torque_ncm_max": 10, "catalog_code": "COPA-IC-OT",
         "indication": "Pick-up (open-tray) impression"},
        {"type": "impression_coping", "subtype": "copaSKY closed-tray impression coping",
         "platform": "copaSKY", "material": ["titanium"], "retention": ["snap"],
         "catalog_code": "COPA-IC-CT",
         "indication": "Closed-tray / transfer impression"},
        {"type": "scan_body", "subtype": "copaSKY digital scan body",
         "platform": "copaSKY", "material": ["anodized_titanium"], "retention": ["screw"],
         "cad_cam": True, "catalog_code": "COPA-SB",
         "indication": "Intra-oral scanner / digital workflow"},
    ]

    # ── 4. Analog ──────────────────────────────────────────────────────
    comps.append({
        "type": "analog",
        "subtype": "copaSKY implant analog (universal)",
        "platform": "copaSKY", "material": ["stainless_steel"],
        "catalog_code": "COPA-ANA",
        "indication": "Lab master cast — universal analog",
    })

    # ── 5. CEMENT-RETAINED + SINGLE SCREW-RETAINED — Ti-Base ──────────
    # H 3 mm (short) and H 5 mm (tall) × 2 GH steps.
    for h, h_code in [(3, "3"), (5, "5")]:
        for gh, gh_code in [(1.5, "15"), (3.5, "35")]:
            comps.append({
                "type": "ti_base",
                "subtype": f"copaSKY Ti-Base H {h} mm, GH {gh} mm",
                "platform": "copaSKY",
                "material": ["titanium"], "retention": ["cement", "screw"],
                "abutment_height_mm": h, "gingival_heights_mm": [gh],
                "torque_ncm": 25, "cad_cam": True,
                "catalog_code": f"COPA-TIB-H{h_code}-GH{gh_code}",
                "indication": "Cement or single screw-retained CAD/CAM crown",
            })

    # ── 6. MULTI-UNIT SCREW-RETAINED — uni.cone abutment ──────────────
    # Straight (0°) × GH 1.5/2.5/3.5/4.5
    for gh, gh_code in [(1.5, "15"), (2.5, "25"), (3.5, "35"), (4.5, "45")]:
        comps.append({
            "type": "multi_unit_abutment",
            "subtype": f"copaSKY uni.cone straight abutment, GH {gh} mm",
            "platform": "copaSKY",
            "material": ["titanium"], "retention": ["screw"],
            "gingival_heights_mm": [gh], "angulation_deg": 0,
            "torque_ncm": 20,
            "catalog_code": f"COPA-UC-0-GH{gh_code}",
            "indication": "Screw-retained bridge / bar / All-on-X — straight",
        })
    # Angled 17° / 30° × GH 2.5/3.5/4.5
    for ang, ang_code in [(17, "17"), (30, "30")]:
        for gh, gh_code in [(2.5, "25"), (3.5, "35"), (4.5, "45")]:
            comps.append({
                "type": "multi_unit_abutment",
                "subtype": f"copaSKY uni.cone angled abutment {ang}°, GH {gh} mm",
                "platform": "copaSKY",
                "material": ["titanium"], "retention": ["screw"],
                "gingival_heights_mm": [gh], "angulation_deg": ang,
                "torque_ncm": 20,
                "catalog_code": f"COPA-UC-{ang_code}-GH{gh_code}",
                "indication": (
                    f"Screw-retained bridge / bar / All-on-X — {ang}° divergence "
                    "correction"
                ),
            })

    # uni.cone auxiliaries
    comps += [
        {"type": "impression_coping", "subtype": "uni.cone open-tray impression coping + screw",
         "platform": "copaSKY-UC", "material": ["titanium"], "retention": ["screw"],
         "catalog_code": "COPA-UC-IC-OT",
         "indication": "uni.cone workflow — pick-up impression"},
        {"type": "impression_coping", "subtype": "uni.cone closed-tray impression coping",
         "platform": "copaSKY-UC", "material": ["titanium"], "retention": ["snap"],
         "catalog_code": "COPA-UC-IC-CT",
         "indication": "uni.cone workflow — transfer impression"},
        {"type": "analog", "subtype": "uni.cone abutment analog",
         "platform": "copaSKY-UC", "material": ["stainless_steel"],
         "catalog_code": "COPA-UC-ANA",
         "indication": "Lab master cast — uni.cone level"},
        {"type": "protective_cap", "subtype": "uni.cone healing / protective cap",
         "platform": "copaSKY-UC", "material": ["titanium"], "retention": ["screw"],
         "catalog_code": "COPA-UC-PC",
         "indication": "Protects uni.cone during healing"},
        {"type": "temporary_cylinder", "subtype": "uni.cone temporary titanium cylinder",
         "platform": "copaSKY-UC", "material": ["titanium"], "retention": ["screw"],
         "catalog_code": "COPA-UC-TEMP",
         "indication": "Immediate temporary bridge on uni.cone"},
        {"type": "burnout_coping", "subtype": "uni.cone castable cylinder",
         "platform": "copaSKY-UC", "material": ["plastic"], "retention": ["screw"],
         "catalog_code": "COPA-UC-BO",
         "indication": "Lost-wax casting for definitive framework"},
        {"type": "ti_base", "subtype": "uni.cone Ti-Base for CAD/CAM bridge",
         "platform": "copaSKY-UC", "material": ["titanium"], "retention": ["screw"],
         "cad_cam": True, "catalog_code": "COPA-UC-TIB",
         "indication": "Screw-retained CAD/CAM bridge on uni.cone"},
    ]

    # ── 7. REMOVABLE OVERDENTURE — TiSi.snap abutment ─────────────────
    # (User instruction: use "TiSi.snap" name, NOT "Locator".)
    for gh, gh_code in [(1.5, "15"), (2.5, "25"), (3.5, "35"), (4.5, "45")]:
        comps.append({
            "type": "locator_abutment",  # keep type for Compare compatibility
            "subtype": f"copaSKY TiSi.snap abutment, GH {gh} mm",
            "platform": "copaSKY-TiSi", "material": ["titanium"],
            "retention": ["snap"],
            "gingival_heights_mm": [gh], "angulation_deg": 0,
            "torque_ncm": 20,
            "catalog_code": f"COPA-TISI-GH{gh_code}",
            "indication": "Removable overdenture — TiSi.snap retention",
        })

    # retention.sil inserts — 3 silicone hardnesses (user-specified)
    RETENTION_INSERTS = [
        ("200 (light pink)", "COPA-RS-200",
         "Immediate restoration — light retention (silicone 200)"),
        ("400 (medium pink)", "COPA-RS-400",
         "4-implant overdenture — medium retention (silicone 400)"),
        ("600 (dark pink)", "COPA-RS-600",
         "2-implant overdenture — heavy retention (silicone 600)"),
    ]
    for label, code, ind in RETENTION_INSERTS:
        comps.append({
            "type": "retention_insert",
            "subtype": f"copaSKY retention.sil {label}",
            "platform": "copaSKY-TiSi",
            "material": ["silicone"], "retention": ["nylon_retention_insert"],
            "catalog_code": code,
            "indication": ind,
        })

    # TiSi.snap auxiliaries
    comps += [
        {"type": "impression_coping", "subtype": "TiSi.snap impression coping",
         "platform": "copaSKY-TiSi", "material": ["plastic"], "retention": ["snap"],
         "catalog_code": "COPA-TISI-IC",
         "indication": "TiSi.snap overdenture — impression"},
        {"type": "analog", "subtype": "TiSi.snap abutment analog",
         "platform": "copaSKY-TiSi", "material": ["stainless_steel"],
         "catalog_code": "COPA-TISI-ANA",
         "indication": "Lab master cast — TiSi.snap level"},
        {"type": "retention_insert", "subtype": "TiSi.snap denture housing (metal)",
         "platform": "copaSKY-TiSi", "material": ["titanium"], "retention": ["snap"],
         "catalog_code": "COPA-TISI-HSG",
         "indication": "Denture cap that holds the retention.sil insert"},
    ]

    # ── 8. Temporary abutment (for direct chairside provisional) ─────
    comps.append({
        "type": "temporary_abutment",
        "subtype": "copaSKY temporary titanium abutment (universal)",
        "platform": "copaSKY",
        "material": ["titanium"], "retention": ["screw"],
        "abutment_height_mm": 11.5, "torque_ncm": 15,
        "catalog_code": "COPA-TEMP",
        "indication": "Provisional crown — direct chairside",
    })

    # ── 9. Prosthetic screws + protective cap ─────────────────────────
    comps += [
        {"type": "prosthetic_screw", "subtype": "copaSKY prosthetic screw (clinical)",
         "platform": "copaSKY", "material": ["titanium"], "retention": ["screw"],
         "torque_ncm": 25, "catalog_code": "COPA-PS",
         "indication": "Definitive abutment fixation"},
        {"type": "prosthetic_screw", "subtype": "copaSKY laboratory screw",
         "platform": "copaSKY", "material": ["titanium"], "retention": ["lab_screw"],
         "catalog_code": "COPA-PS-LAB",
         "indication": "Lab-only — model transfer"},
        {"type": "protective_cap", "subtype": "copaSKY protective / healing cap",
         "platform": "copaSKY", "material": ["PEEK"], "retention": ["snap"],
         "catalog_code": "COPA-PC",
         "indication": "Protects abutment / uni.cone during healing"},
    ]

    return comps


COPA_SKY_COMPONENTS = _copa_sky_components()


if __name__ == "__main__":
    print(f"copaSKY implant SKUs: {len(COPA_SKY_SKUS)}")
    diameters = sorted({s['diameter'] for s in COPA_SKY_SKUS})
    for d in diameters:
        ls = sorted(s['length'] for s in COPA_SKY_SKUS if s['diameter'] == d)
        print(f"  Ø{d}: {len(ls)} lengths → {ls}")
    print(f"\ncopaSKY prosthetic components: {len(COPA_SKY_COMPONENTS)}")
    types = {}
    for c in COPA_SKY_COMPONENTS:
        types[c["type"]] = types.get(c["type"], 0) + 1
    for t, cnt in sorted(types.items(), key=lambda x: -x[1]):
        print(f"  {t}: {cnt}")
    restor = {"cement": 0, "screw": 0, "snap": 0, "other": 0}
    for c in COPA_SKY_COMPONENTS:
        r = c.get("retention", [])
        if "cement" in r:
            restor["cement"] += 1
        elif "snap" in r:
            restor["snap"] += 1
        elif r:
            restor["screw"] += 1
        else:
            restor["other"] += 1
    print("  by restoration:", restor)
