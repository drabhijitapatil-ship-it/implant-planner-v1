"""iter-371 — Global D prosthetic components (Feb 2026).

Sourced verbatim from the "Inkone & Twinkone4 Prosthesis Components" brochure
provided by the user. Every SKU listed in the brochure is captured individually
so the Compare tool can answer cross-brand queries like "which brands offer a
Ø 5 mm healing abutment at GH 4?".

Restoration-type convention (follows existing catalog entries):
  • retention=["cement"]                        → cement-retained
  • retention=["screw"] on ti_base              → single screw-retained
  • retention=["screw"] on multi_unit_abutment  → multiple screw-retained
                                                  (bridges, All-on-X, bar-OD)
  • retention=["locator", "snap"] etc.          → removable overdenture

Note on nomenclature: the brochure uses "Periodontal height (g)" which is the
Gingival Cuff Height (GH). Stored on each component as `gingival_heights_mm`.
"""

# ── In-Kone Universal ─────────────────────────────────────────────────────
# 8° Internal Morse taper. Ø 4.0 / 5.0 / 6.5 prosthetic platforms.

INKONE_UNIVERSAL_PLATFORMS_MM = [4.0, 5.0, 6.5]
INKONE_UNIVERSAL_GH_MM = [1.5, 2.2, 3, 4, 5, 7]


def _inkone_universal_components():
    comps = []

    # ── 1a. Healing abutments — flat-head (low profile, "healing screw" in doc)
    # Ø × GH × head-type product grid → 3 × 6 × 2 = 36 SKUs.
    for d in INKONE_UNIVERSAL_PLATFORMS_MM:
        for gh in INKONE_UNIVERSAL_GH_MM:
            d_code = str(d).replace(".0", "")
            gh_code = str(gh).replace(".0", "")
            # Flat-head (H = 1.4 mm)
            comps.append({
                "type": "healing_abutment",
                "subtype": f"Healing Abutment flat-head, Ø{d}, GH {gh} mm",
                "platform": f"IK-{d}",
                "material": ["titanium"],
                "retention": ["screw"],
                "diameter_mm": d,
                "gingival_heights_mm": [gh],
                "abutment_height_mm": 1.4,
                "torque_ncm": 15,
                "catalog_code": f"DVCICI{d_code}H{gh_code}",
                "indication": "Trans-mucosal healing — flat / low profile",
            })
            # High-head (H = 3.4 mm)
            comps.append({
                "type": "healing_abutment",
                "subtype": f"Healing Abutment high-head, Ø{d}, GH {gh} mm",
                "platform": f"IK-{d}",
                "material": ["titanium"],
                "retention": ["screw"],
                "diameter_mm": d,
                "gingival_heights_mm": [gh],
                "abutment_height_mm": 3.4,
                "torque_ncm": 15,
                "catalog_code": f"DVCIHCI{d_code}H{gh_code}",
                "indication": "Trans-mucosal healing — tall for deeper gingiva",
            })

    # ── 1b. Impression copings (direct-to-implant workflow) ────────────
    comps += [
        {"type": "impression_coping", "subtype": "Short Pick-up + screw",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["screw"],
         "abutment_height_mm": 17.2, "catalog_code": "DTCPICVCI",
         "indication": "Direct implant open-tray impression — short"},
        {"type": "impression_coping", "subtype": "Long Pick-up + screw",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["screw"],
         "abutment_height_mm": 19.7, "catalog_code": "DTLPICVCI",
         "indication": "Direct implant open-tray impression — long"},
        {"type": "impression_coping", "subtype": "Pick-up without screw",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["snap"],
         "abutment_height_mm": 9, "catalog_code": "DTDCPI",
         "indication": "Direct implant closed-tray impression — short"},
        {"type": "impression_coping", "subtype": "Long Pick-up without screw",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["snap"],
         "abutment_height_mm": 13.7, "catalog_code": "DTDLPICCI",
         "indication": "Direct implant closed-tray impression — long"},
        {"type": "scan_body", "subtype": "Titanium digital impression coping (screw-retained)",
         "platform": "IK-Universal", "material": ["anodized_titanium"], "retention": ["screw"],
         "catalog_code": "DTNVINK", "cad_cam": True,
         "indication": "Intra-oral scanner workflow — screw-retained"},
        {"type": "scan_body", "subtype": "Titanium digital impression coping (monobloc)",
         "platform": "IK-Universal", "material": ["anodized_titanium"], "retention": ["press_on"],
         "catalog_code": "DTNDINK", "cad_cam": True,
         "indication": "Intra-oral scanner workflow — monobloc"},
    ]

    # ── 1c. Implant analog ─────────────────────────────────────────────
    comps.append({
        "type": "analog", "subtype": "In-Kone implant analog",
        "platform": "IK-Universal", "material": ["stainless_steel"],
        "catalog_code": "DACi",
        "indication": "Lab master cast — direct implant analog",
    })

    # ── 1d. Temporary abutments (single or non-splinted temp crowns) ──
    for gh, gh_code in [(1.5, "1.5"), (3, "3")]:
        comps.append({
            "type": "temporary_abutment",
            "subtype": f"Temporary Restoration Abutment, Ø5, GH {gh} mm",
            "platform": "IK-Universal", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 5.0, "gingival_heights_mm": [gh],
            "torque_ncm": 15,
            "catalog_code": f"DFMPVCIH{gh_code}",
            "indication": "Provisional crown — single or non-splinted",
        })

    # ── 1e. CEMENT-RETAINED — Standard & Scalloped abutments ──────────
    # Standard abutments: realistic grid per brochure — not every combo is
    # published. Angulations are matched to their clinically-relevant GH ranges.
    STANDARD_GRID = [
        # (angulation, gh_options)
        (0,  [1.5, 2.2, 3, 4, 5, 7]),
        (7,  [1.5, 2.2, 3, 4]),
        (15, [1.5, 2.2, 3, 4]),
        (23, [3, 4, 5]),
    ]
    for d in INKONE_UNIVERSAL_PLATFORMS_MM:
        for ang, gh_list in STANDARD_GRID:
            for gh in gh_list:
                d_code = str(d).replace(".0", "")
                gh_code = str(gh).replace(".0", "")
                comps.append({
                    "type": "final_abutment",
                    "subtype": f"Standard Cement Abutment, Ø{d}, GH {gh} mm, {ang}°",
                    "platform": f"IK-{d}", "material": ["titanium"], "retention": ["cement"],
                    "diameter_mm": d, "gingival_heights_mm": [gh], "angulation_deg": ang,
                    "torque_ncm": 15,
                    "catalog_code": f"DFMLTAVCI{d_code}-{ang}H{gh_code}",
                    "indication": "Cement-retained single crown / bridge",
                })

    # Scalloped abutments (aesthetic zone) — narrower grid
    SCALLOPED_GRID = [
        (0,  [1.5, 2.2, 3]),
        (7,  [1.5, 2.2, 3, 4]),
        (15, [1.5, 2.2, 3, 4]),
    ]
    for d in INKONE_UNIVERSAL_PLATFORMS_MM:
        for ang, gh_list in SCALLOPED_GRID:
            for gh in gh_list:
                d_code = str(d).replace(".0", "")
                gh_code = str(gh).replace(".0", "")
                comps.append({
                    "type": "final_abutment",
                    "subtype": f"Scalloped Aesthetic Abutment, Ø{d}, GH {gh} mm, {ang}°",
                    "platform": f"IK-{d}", "material": ["titanium"], "retention": ["cement"],
                    "diameter_mm": d, "gingival_heights_mm": [gh], "angulation_deg": ang,
                    "torque_ncm": 15,
                    "catalog_code": f"DFMPAVINK{d_code}-{ang}H{gh_code}",
                    "indication": "Aesthetic zone — cement-retained, scalloped emergence",
                })

    # Pre-milled blank
    comps.append({
        "type": "premilled_blank",
        "subtype": "Pre-milled blank (S3DEL / WorkNC Dental)",
        "platform": "IK-Universal", "material": ["titanium"], "retention": ["screw"],
        "torque_ncm": 15, "catalog_code": "DLABPMVINK", "cad_cam": True,
        "indication": "CAD/CAM custom abutment — cement or screw-retained",
    })

    # ── 1f. SINGLE SCREW-RETAINED — Ti-bases for zirconia crowns ──────
    for d, d_code, ghs in [
        (3.8, "3.8", [2, 4]),
        (5.5, "5.5", [1.5, 2.2, 3, 4]),
    ]:
        for gh in ghs:
            gh_code = str(gh).replace(".0", "")
            comps.append({
                "type": "ti_base",
                "subtype": f"Titanium Base Ø{d_code}, GH {gh} mm",
                "platform": f"IK-Universal", "material": ["titanium"], "retention": ["screw"],
                "diameter_mm": d, "gingival_heights_mm": [gh],
                "torque_ncm": 15, "cad_cam": True,
                "catalog_code": f"DEVCI{d_code}H{gh_code}",
                "indication": "Single screw-retained — custom zirconia CAD/CAM crown",
            })

    # ── 1g. MULTIPLE SCREW-RETAINED — Straight conical abutment Ø 4.3 ──
    for gh in [1.5, 2.2, 3, 4, 5]:
        gh_code = str(gh).replace(".0", "")
        comps.append({
            "type": "multi_unit_abutment",
            "subtype": f"Straight Conical Abutment, Ø4.3, GH {gh} mm, 0°",
            "platform": "IK-C4.3", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 4.3, "gingival_heights_mm": [gh], "angulation_deg": 0,
            "torque_ncm": 20,
            "catalog_code": f"DPCINK4.3H{gh_code}",
            "indication": "Screw-retained bridge / bar-retained overdenture — straight",
        })

    # Angled conical abutments 17° / 30° × indexed / non-indexed × GH 2.5-4.3
    for ang in [17, 30]:
        for gh in [2.5, 3, 4.3]:
            gh_code = str(gh).replace(".", "")
            for idx_flag, idx_lbl, idx_code in [
                ("indexed", "Indexed", "F"),
                ("non_indexed", "Non-indexed", "FR"),
            ]:
                comps.append({
                    "type": "multi_unit_abutment",
                    "subtype": f"Angled Conical Abutment ({idx_lbl}), Ø4.7, GH {gh} mm, {ang}°",
                    "platform": "IK-C4.7", "material": ["titanium"], "retention": ["screw"],
                    "diameter_mm": 4.7, "gingival_heights_mm": [gh], "angulation_deg": ang,
                    "torque_ncm": 20,
                    "catalog_code": f"DPAO{idx_code}VINK-{ang}H{gh_code}",
                    "indication": (
                        f"Screw-retained bridge / bar / All-on-X — {ang}° divergence "
                        f"correction ({idx_lbl.lower()})"
                    ),
                })

    # ── Straight conical abutment auxiliaries (impression, analog, cyls) ──
    conical_aux_straight = [
        ("impression_coping", "Pick-up impression coping (straight conical) + screw",
         "DTIPICVINK4.3", 14.5, ["screw"]),
        ("impression_coping", "Pop-up impression coping (straight conical) + screw",
         "DTIPOPINK4.3", 10, ["snap"]),
        ("analog", "Straight conical abutment analog", "DAIINK4.3N", None, None),
        ("protective_cap", "Straight conical — very high cover cap 8 mm",
         "DCCVINK4.3H8", 8, ["screw"]),
        ("protective_cap", "Straight conical — high cover cap 6 mm",
         "DCCVINK4.3H6", 6, ["screw"]),
        ("protective_cap", "Straight conical — low cover cap 3 mm",
         "DCCVINK4.3H3", 3, ["screw"]),
        ("temporary_cylinder", "Straight conical temporary titanium cylinder",
         "DGTIVINK4.3", None, ["screw"]),
        ("burnout_coping", "Straight conical castable cylinder",
         "DGCIVINK4.3", None, ["screw"]),
        ("gold_coping", "Straight conical hybrid (gold/plastic) cylinder",
         "DGMSGTINK4.3", None, ["screw"]),
        ("ti_base", "Ti-base for straight conical + screw",
         "DEVPC4.3", None, ["screw"]),
    ]
    for ctype, sub, code, height, ret in conical_aux_straight:
        comp = {
            "type": ctype, "subtype": sub,
            "platform": "IK-C4.3", "material": ["titanium"],
            "catalog_code": code,
            "indication": "Straight conical abutment workflow — screw-retained",
        }
        if ret:
            comp["retention"] = ret
        if height is not None:
            comp["abutment_height_mm"] = height
        if ctype == "ti_base":
            comp["cad_cam"] = True
            comp["indication"] = "Screw-retained CAD/CAM crown on straight conical"
        comps.append(comp)

    # ── Angled conical auxiliaries (shared for 17° & 30°) ────────────
    conical_aux_angled = [
        ("impression_coping", "Short pick-up impression coping (angled conical)",
         "DTCPICAOFV", 14.1, ["screw"]),
        ("impression_coping", "Long pick-up impression coping (angled conical)",
         "DTLPICAOFV", 16.6, ["screw"]),
        ("impression_coping", "Pop-up impression coping (angled conical)",
         "DTPOPAOF", 17.2, ["snap"]),
        ("prosthetic_screw", "Short impression coping screw (angled conical)",
         "DVTPICAOF-C", None, ["screw"]),
        ("prosthetic_screw", "Long impression coping screw (angled conical)",
         "DVTPICAOF-L", None, ["screw"]),
        ("analog", "Angled conical abutment analog", "DAAOFN", None, None),
        ("protective_cap", "Angled conical cover cap", "DCCAOFV", None, ["screw"]),
        ("temporary_cylinder", "Angled conical temporary titanium cylinder",
         "DGTPAOFV", None, ["screw"]),
        ("temporary_cylinder", "Angled conical smooth titanium cylinder",
         "DGTLAOFV", None, ["screw"]),
        ("burnout_coping", "Angled conical castable cylinder", "DGCAOFV", None, ["screw"]),
        ("gold_coping", "Angled conical hybrid (gold/plastic) cylinder", "DGMAOFV", None, ["screw"]),
        ("ti_base", "Ti-base for angled conical + screw", "DEVPAOF", None, ["screw"]),
    ]
    for ctype, sub, code, height, ret in conical_aux_angled:
        comp = {
            "type": ctype, "subtype": sub,
            "platform": "IK-C4.7", "material": ["titanium"],
            "catalog_code": code,
            "indication": "Angled conical abutment workflow — screw-retained",
        }
        if ret:
            comp["retention"] = ret
        if height is not None:
            comp["abutment_height_mm"] = height
        if ctype == "ti_base":
            comp["cad_cam"] = True
            comp["indication"] = "Screw-retained CAD/CAM crown on angled conical"
        comps.append(comp)

    # ── 1h. REMOVABLE — Locator® abutments (Ø 4 × GH 1.5-5) ──────────
    for gh, gh_code in [(1.5, "1.5"), (2.2, "2.2"), (3, "3"), (4, "4"), (5, "5")]:
        comps.append({
            "type": "locator_abutment",
            "subtype": f"Locator® Abutment, Ø4, GH {gh} mm",
            "platform": "IK-Locator4", "material": ["titanium"], "retention": ["locator", "snap"],
            "diameter_mm": 4.0, "gingival_heights_mm": [gh], "angulation_deg": 0,
            "torque_ncm": 20,
            "catalog_code": f"DLOCPCIH{gh_code}",
            "indication": "Removable overdenture — locator retention",
        })

    # Locator auxiliaries
    comps += [
        {"type": "impression_coping", "subtype": "Locator® impression coping",
         "platform": "IK-Locator4", "material": ["plastic"], "retention": ["snap"],
         "catalog_code": "DLOCTRANSFERT",
         "indication": "Locator overdenture workflow"},
        {"type": "analog", "subtype": "Locator® 4 mm analog",
         "platform": "IK-Locator4", "material": ["stainless_steel"],
         "catalog_code": "DLOC4MMANALOG",
         "indication": "Locator overdenture workflow"},
        {"type": "retention_insert", "subtype": "Locator® female fitting pack (housing + spacers + retentions)",
         "platform": "IK-Locator4", "material": ["titanium", "nylon"], "retention": ["snap"],
         "catalog_code": "DLOCATORPACK",
         "indication": "Denture housing kit — full assembly"},
    ]

    # Locator inserts — each colour as a separate SKU (user requested)
    LOCATOR_INSERTS = [
        ("blue",   "DLOCJ1", "Blue — light retention (~600 g), max 20° divergence"),
        ("pink",   "DLOCJ2", "Pink — medium retention (~1500 g), max 20° divergence"),
        ("white",  "DLOCJ3", "White — extra-light retention (~450 g), max 20° divergence"),
        ("red",    "DLOCJ4", "Red — for angled placements, max 20° divergence"),
        ("green",  "DLOCJ5", "Green — heavy retention, max 40° divergence"),
        ("orange", "DLOCJ6", "Orange — medium retention, max 40° divergence"),
    ]
    for color, code, ind in LOCATOR_INSERTS:
        comps.append({
            "type": "retention_insert",
            "subtype": f"Locator® insert — {color} (4-pack)",
            "platform": "IK-Locator4", "material": ["nylon"], "retention": ["nylon_retention_insert"],
            "catalog_code": code,
            "indication": ind,
        })

    # ── 1i. Universal prosthetic screws ─────────────────────────────
    comps += [
        {"type": "prosthetic_screw", "subtype": "In-Kone prosthetic screw (clinical, universal)",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["screw"],
         "torque_ncm": 25, "catalog_code": "DVPCI",
         "indication": "Definitive fixation — cement or screw-retained abutments"},
        {"type": "prosthetic_screw", "subtype": "Laboratory guide screw H 12 mm",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["lab_screw"],
         "catalog_code": "DVPIINKLABH12",
         "indication": "Lab-only — model transfer"},
        {"type": "prosthetic_screw", "subtype": "Laboratory guide screw H 2 mm (8-pack)",
         "platform": "IK-Universal", "material": ["titanium"], "retention": ["lab_screw"],
         "catalog_code": "DVPIINKLABH2-8",
         "indication": "Lab-only — model transfer"},
    ]

    return comps


# ── twinkone 4 ────────────────────────────────────────────────────────────
# 5° External Morse taper via conical abutment platforms.

def _twinkone4_components():
    comps = []

    # Cover cap + healing screws
    comps.append({
        "type": "cover_screw", "subtype": "twinKon cover cap (supplied with implant)",
        "platform": "TWK4", "material": ["titanium"], "retention": ["screw"],
        "abutment_height_mm": 2.9, "catalog_code": "DCCTWK",
        "indication": "Two-stage submerged healing",
    })
    for gh, gh_code in [(2.6, "2.6"), (4, "4")]:
        comps.append({
            "type": "healing_abutment",
            "subtype": f"twinKon healing abutment, Ø5, GH {gh} mm",
            "platform": "TWK4", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 5.0, "gingival_heights_mm": [gh], "torque_ncm": 15,
            "catalog_code": f"DVCITWK5H{gh_code}",
            "indication": "Trans-mucosal healing",
        })

    # Conical abutment Ø 5.4 (2 heights) — for retro-mandibular indications
    for h, h_code in [(2.4, "1"), (3.4, "2")]:
        comps.append({
            "type": "multi_unit_abutment",
            "subtype": f"twinKon Conical Abutment Ø5.4, H {h} mm (5° external Morse)",
            "platform": "TWK-C5.4", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 5.4, "abutment_height_mm": h, "angulation_deg": 0,
            "torque_ncm": 20, "catalog_code": f"DPCCE{h_code}",
            "indication": "Screw-retained bridge / bar — retro-mandibular full-arch",
        })

    # Conical abutment Ø 5.4 auxiliaries
    for ctype, sub, code, ind, ret in [
        ("impression_coping", "Short pick-up impression coping (Ø5.4 conical)", "DTCIPICVCE", "Manual tightening", ["screw"]),
        ("impression_coping", "Long pick-up impression coping (Ø5.4 conical)", "DTIPICVCE", "Manual tightening", ["screw"]),
        ("impression_coping", "Extra-long pick-up impression coping (Ø5.4 conical)", "DTLIPICVCE", "Manual tightening", ["screw"]),
        ("protective_cap", "Ø5.4 conical abutment cover cap", "DCCVCE", "Torque 15 N·cm", ["screw"]),
        ("analog", "Ø5.4 conical abutment analog", "DAICE", "Lab master cast", None),
        ("burnout_coping", "Ø5.4 conical castable cylinder", "DGCIVCE", "Torque 20 N·cm", ["screw"]),
        ("temporary_cylinder", "Ø5.4 conical titanium cylinder", "DGTIVCE", "Torque 20 N·cm", ["screw"]),
        ("gold_coping", "Ø5.4 conical hybrid abutment (gold/plastic)", "DGMIVCE", "Torque 20 N·cm", ["screw"]),
        ("prosthetic_screw", "Ø5.4 conical abutment screw", "DVPICE", "Torque 20 N·cm", ["screw"]),
    ]:
        comp = {
            "type": ctype, "subtype": sub,
            "platform": "TWK-C5.4", "material": ["titanium"],
            "catalog_code": code, "indication": ind,
        }
        if ret:
            comp["retention"] = ret
        comps.append(comp)

    # Conical abutment Ø 4.3 (alternative smaller platform) + auxiliaries
    comps.append({
        "type": "cover_screw",
        "subtype": "twinKon cover cap Ø4.3, H 2.9 mm",
        "platform": "TWK-C4.3", "material": ["titanium"], "retention": ["screw"],
        "diameter_mm": 4.3, "abutment_height_mm": 2.9,
        "catalog_code": "DPCTWK4.3",
        "indication": "Two-stage submerged healing (Ø4.3 conical)",
    })
    comps.append({
        "type": "protective_cap",
        "subtype": "twinKon Ø4.3 conical abutment cover cap, H 3 mm",
        "platform": "TWK-C4.3", "material": ["titanium"], "retention": ["screw"],
        "diameter_mm": 4.3, "abutment_height_mm": 3.0,
        "catalog_code": "DCCVTWK4.3",
        "indication": "Manual tightening",
    })
    for ctype, sub, code, ind, ret in [
        ("impression_coping", "Pick-up impression coping Ø4.3 conical + screw", "DTIPICVTWK4.3", "Manual tightening", ["screw"]),
        ("impression_coping", "Pop-up impression coping Ø4.3 conical", "DTIPOPTWK4.3", "Manual tightening", ["snap"]),
        ("scan_body", "Digital impression coping Ø4.3 conical", "DTNPCTWK4.3", "Intra-oral scanner workflow", ["screw"]),
        ("analog", "Ø4.3 conical digital analog", "DAITWK4.3N", "Lab master cast (digital)", None),
        ("temporary_cylinder", "Ø4.3 conical titanium cylinder", "DGTIVTWK4.3", "Manual tightening", ["screw"]),
        ("burnout_coping", "Ø4.3 conical castable cylinder", "DGCIVTWK4.3", "Manual tightening", ["screw"]),
        ("gold_coping", "Ø4.3 conical hybrid abutment", "DGMIVTWK4.3", "Manual tightening", ["screw"]),
        ("ti_base", "Ø4.3 conical titanium base", "DEVPCTWK4.3", "Screw-retained CAD/CAM crown on conical", ["screw"]),
    ]:
        comp = {
            "type": ctype, "subtype": sub,
            "platform": "TWK-C4.3", "material": ["titanium"],
            "catalog_code": code, "indication": ind,
        }
        if ret:
            comp["retention"] = ret
        if ctype == "ti_base":
            comp["cad_cam"] = True
        if ctype == "scan_body":
            comp["cad_cam"] = True
            comp["material"] = ["anodized_titanium"]
        comps.append(comp)

    return comps


# ── 3.0 Implant ───────────────────────────────────────────────────────────
# 5° Internal Morse taper, dedicated 3.0 platform. Restricted to lateral +
# mandibular incisors.

def _three_zero_components():
    comps = []

    # Healing abutments (Ø 3.4 × GH 2/4/6)
    for gh, gh_code in [(2, "2"), (4, "4"), (6, "6")]:
        comps.append({
            "type": "healing_abutment",
            "subtype": f"3.0 healing abutment, Ø3.4, GH {gh} mm",
            "platform": "GD-3.0", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 3.4, "gingival_heights_mm": [gh],
            "torque_ncm": 10,
            "catalog_code": f"DVCITZ3.4H{gh_code}",
            "indication": "Trans-mucosal healing — narrow ridge",
        })

    # Impression coping + analog
    comps += [
        {"type": "impression_coping", "subtype": "Pick-up impression coping (no screw)",
         "platform": "GD-3.0", "material": ["titanium"], "retention": ["snap"],
         "catalog_code": "DTDCPICTZ",
         "indication": "Direct implant impression — 3.0 Morse lock"},
        {"type": "analog", "subtype": "3.0 implant analog",
         "platform": "GD-3.0", "material": ["stainless_steel"],
         "catalog_code": "DATZ",
         "indication": "Lab master cast — 3.0 direct"},
    ]

    # Temporary abutments (Ø 3.4 × GH 2/4)
    for gh, gh_code in [(2, "2"), (4, "4")]:
        comps.append({
            "type": "temporary_abutment",
            "subtype": f"3.0 Temporary Restoration Abutment, Ø3.4, GH {gh} mm",
            "platform": "GD-3.0", "material": ["titanium"], "retention": ["screw"],
            "diameter_mm": 3.4, "gingival_heights_mm": [gh],
            "abutment_height_mm": 6, "torque_ncm": 15,
            "catalog_code": f"DFMPTZ3.4H{gh_code}",
            "indication": "Provisional crown — single or non-splinted",
        })

    # CEMENT-RETAINED straight abutments (0° × GH 1/2/4/6)
    for gh, gh_code in [(1, "1"), (2, "2"), (4, "4"), (6, "6")]:
        comps.append({
            "type": "final_abutment",
            "subtype": f"3.0 Straight Cement Abutment, GH {gh} mm, 0°",
            "platform": "GD-3.0", "material": ["titanium"], "retention": ["cement"],
            "diameter_mm": 3.4, "gingival_heights_mm": [gh], "angulation_deg": 0,
            "abutment_height_mm": 6, "torque_ncm": 15,
            "catalog_code": f"DFMTZ3.4H{gh_code}-00",
            "indication": "Cement-retained crown — mandibular incisor area",
        })

    # Angled cement abutments (7° / 15° × GH 2/4/6)
    for ang, ang_code in [(7, "07"), (15, "15")]:
        for gh, gh_code in [(2, "2"), (4, "4"), (6, "6")]:
            comps.append({
                "type": "final_abutment",
                "subtype": f"3.0 Angled Cement Abutment, GH {gh} mm, {ang}°",
                "platform": "GD-3.0", "material": ["titanium"], "retention": ["cement"],
                "diameter_mm": 3.4, "gingival_heights_mm": [gh], "angulation_deg": ang,
                "abutment_height_mm": 6, "torque_ncm": 15,
                "catalog_code": f"DFMTZ3.4H{gh_code}-{ang_code}",
                "indication": "Cement-retained crown — maxillary lateral incisor area",
            })

    return comps


GLOBAL_D_COMPONENTS = {
    "In-Kone Universal": _inkone_universal_components(),
    "twinkone 4": _twinkone4_components(),
    "3.0 Implant": _three_zero_components(),
}


if __name__ == "__main__":
    for sys_name, comps in GLOBAL_D_COMPONENTS.items():
        print(f"\n{sys_name}: {len(comps)} components")
        # Component type breakdown
        types = {}
        for c in comps:
            t = c["type"]
            types[t] = types.get(t, 0) + 1
        for t, cnt in sorted(types.items(), key=lambda x: -x[1]):
            print(f"  {t}: {cnt}")
        # Restoration-mode breakdown
        restor = {"cement": 0, "screw": 0, "locator": 0, "other": 0}
        for c in comps:
            r = c.get("retention", [])
            if not r:
                restor["other"] += 1
            elif "cement" in r:
                restor["cement"] += 1
            elif "locator" in r or "nylon_retention_insert" in r:
                restor["locator"] += 1
            elif "screw" in r or "snap" in r or "lab_screw" in r:
                restor["screw"] += 1
            else:
                restor["other"] += 1
        print("  by restoration:", restor)
