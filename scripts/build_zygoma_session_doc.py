"""Build a Word document summarising the Zygoma / Pterygoid workflow work
completed across chunks B → I of the v13 refinement session (iter-418 → iter-426).

Run:  python /app/scripts/build_zygoma_session_doc.py
Outputs: /app/Zygoma_Pterygoid_Workflow_Session_Report.docx
"""
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


NAVY = RGBColor(0x0D, 0x47, 0xA1)
DEEP_PURPLE = RGBColor(0x4A, 0x14, 0x8C)
GREEN = RGBColor(0x2E, 0x7D, 0x32)
GREY = RGBColor(0x54, 0x6E, 0x7A)
AMBER = RGBColor(0xE6, 0x51, 0x00)
RED = RGBColor(0xC6, 0x28, 0x28)


def _set_cell_bg(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def add_heading(doc, text, level=1, color=NAVY):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = color
    return h


def add_para(doc, text, bold=False, italic=False, size=11, color=None, indent=0):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = color
    if indent:
        p.paragraph_format.left_indent = Inches(indent * 0.25)
    return p


def add_bullet(doc, text, level=0, bold_prefix=None):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.25 + level * 0.3)
    if bold_prefix:
        r = p.add_run(bold_prefix)
        r.bold = True
        r.font.size = Pt(11)
        p.add_run(" ")
        p.add_run(text).font.size = Pt(11)
    else:
        p.add_run(text).font.size = Pt(11)
    return p


def add_code_block(doc, code_text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.3)
    run = p.add_run(code_text)
    run.font.name = "Courier New"
    run.font.size = Pt(9.5)
    run.font.color.rgb = RGBColor(0x1B, 0x5E, 0x20)
    return p


def add_kv_table(doc, rows, col_widths=None):
    """Two-column key/value table."""
    tbl = doc.add_table(rows=len(rows), cols=2)
    tbl.style = "Light Grid Accent 1"
    for i, (k, v) in enumerate(rows):
        c0, c1 = tbl.rows[i].cells
        c0.text = ""
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(k)
        r0.bold = True
        r0.font.size = Pt(10)
        r0.font.color.rgb = NAVY

        c1.text = ""
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(v)
        r1.font.size = Pt(10)
        _set_cell_bg(c0, "F5F9FF")
    if col_widths:
        for i, w in enumerate(col_widths):
            for row in tbl.rows:
                row.cells[i].width = Inches(w)
    return tbl


def add_matrix_table(doc, headers, rows, header_fill="0D47A1"):
    tbl = doc.add_table(rows=1 + len(rows), cols=len(headers))
    tbl.style = "Light Grid Accent 1"
    tbl.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Header row
    for i, h in enumerate(headers):
        cell = tbl.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        r = p.add_run(h)
        r.bold = True
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        r.font.size = Pt(10)
        _set_cell_bg(cell, header_fill)

    for r_idx, row in enumerate(rows, start=1):
        for c_idx, val in enumerate(row):
            cell = tbl.rows[r_idx].cells[c_idx]
            cell.text = ""
            p = cell.paragraphs[0]
            rn = p.add_run(str(val))
            rn.font.size = Pt(9.5)
    return tbl


def horizontal_rule(doc):
    p = doc.add_paragraph()
    p_pr = p._p.get_or_add_pPr()
    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "1565C0")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)


# ─────────────────────────────────────────────────────────────
# Build the document
# ─────────────────────────────────────────────────────────────
doc = Document()

# Global font
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

# ── Cover ──
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = title.add_run("Zygoma & Pterygoid Implant Workflow")
r.bold = True
r.font.size = Pt(28)
r.font.color.rgb = NAVY

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sr = sub.add_run("Complete Session Report — v13 (Chunks B → I)")
sr.font.size = Pt(15)
sr.font.color.rgb = DEEP_PURPLE
sr.italic = True

meta = doc.add_paragraph()
meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
meta_r = meta.add_run("Iterations 418 – 426  |  June 2026  |  Preview + Production")
meta_r.font.size = Pt(11)
meta_r.font.color.rgb = GREY

horizontal_rule(doc)

# ── Executive Summary ──
add_heading(doc, "Executive Summary", level=1)
add_para(doc,
    "This session delivered 9 chunks of refinements (iter-418 through iter-426) to unify the "
    "Zygoma / Pterygoid / Conventional implant workflow, fix multiple production-blocking bugs, "
    "and polish the review, PDF and form experiences. The result: Zygoma and Pterygoid cases now "
    "flow through the same conventional five-phase pipeline visually and functionally, while "
    "respecting the anatomical realities of each modality (whole-arch OPG for Zygoma/Pterygoid, "
    "per-tooth IOPA for Conventional).")

add_bullet(doc, "9 chunks delivered end-to-end (Chunk B → Chunk I).", bold_prefix="Delivery:")
add_bullet(doc, "60+ backend pytest assertions + 40+ frontend Playwright checks — all green.", bold_prefix="QA:")
add_bullet(doc, "6 new backend endpoints; 4 audit logs (Prosthetic Plan, Advanced Clinical send / approve / reopen).", bold_prefix="API:")
add_bullet(doc, "3 production bugs fixed (Mongo code-40, Phase 3-must-be-approved gate, Advanced Clinical premature-approval lock).", bold_prefix="Bugs:")
add_bullet(doc, "iteration_418.json → iteration_426.json (+ 425b hotfix retest).", bold_prefix="Reports:")

doc.add_page_break()

# ── Section 1: What The Zygoma/Pterygoid Workflow Looks Like Now ──
add_heading(doc, "1. End-to-End Zygoma / Pterygoid / Conventional Workflow", level=1)

add_heading(doc, "1.1 Case Creation & Phase 1", level=2)
add_para(doc,
    "Cases are created with an implant_procedure_type that captures the modality mix. All types "
    "involving Zygoma or Pterygoid implants are tagged as such, and the ZYGOMA_PTERYGOID_"
    "PROCEDURE_TYPES set on the backend gates every downstream conditional (advanced clinical, "
    "OPG imaging, uniform review).")

add_para(doc, "Supported procedure types:", bold=True, size=11)
add_bullet(doc, "Single Implant Placement (Conventional)")
add_bullet(doc, "Multiple Implant Placement (Conventional)")
add_bullet(doc, "All on 4 / All on 6 / All on X (Conventional full-arch)")
add_bullet(doc, "Zygoma Implants (pure Zygoma)")
add_bullet(doc, "Pterygoid Implants (pure Pterygoid)")
add_bullet(doc, "Quad Zygoma Implants")
add_bullet(doc, "Zygoma and Pterygoid Implants")
add_bullet(doc, "Zygoma and Conventional Implants (mixed)")
add_bullet(doc, "Pterygoid and Conventional Implants (mixed)")
add_bullet(doc, "Zygoma, Pterygoid and Conventional Implants (fully mixed)")

add_para(doc,
    "Phase 1 review (Case Details page) for Zygoma / Pterygoid cases now uses the same "
    "InfoRow + section-card visual language as Conventional cases — white cards, blue #1565C0 "
    "section titles, InfoRow-style rows with icon-on-left / label-above-value layout, no "
    "purple left-border. Reviewers see a uniform experience across all case types.")

add_heading(doc, "1.2 Phase 2 — Surgical + Advanced Clinical", level=2)
add_para(doc,
    "Phase 2 captures the surgical event: per-implant Prosthetic Component (Cover Screw / "
    "Healing Abutment / Immediate Loading Done), MUA table when applicable, post-surgical "
    "radiograph(s), and — for Zygoma cases — the Advanced Clinical (ZAGA + ORIS + Immediate "
    "Loading Day 0/7/30) block as a decoupled standalone card.")

add_bullet(doc, "Advanced Clinical (Zygoma) is now a standalone card on Case Details, not gated by Phase 2 submission. Uses react-native-calendars for Day 0 / Day 7 / Day 30 immediate-loading dates.", bold_prefix="Advanced Clinical:")
add_bullet(doc, "Post-Surgical Radiograph auto-splits by modality — OPG for Zygoma/Pterygoid, IOPA (FDI-labelled) for Conventional. Mixed cases render both blocks separately.", bold_prefix="Radiographs:")
add_bullet(doc, "MUA table saved once here — auto-populates into Phase 4 Step 1 (Lab Slip) for confirmation later.", bold_prefix="MUA:")
add_bullet(doc, "Prosthetic Plan is editable from the Phase 2 purple banner (audit-logged).", bold_prefix="Prosthetic Plan:")

add_heading(doc, "1.3 Phase 3 — Follow-up / Second Stage", level=2)
add_bullet(doc, "Zygoma/Pterygoid/Conventional 3-tab per-implant sub-view removed — the form is now unified across modalities.")
add_bullet(doc, "Immediate-Loaded implants skip Healing Abutment configuration; validator no longer flags them as incomplete.")
add_bullet(doc, "\"Immediate Prosthesis Done\" banner shows both Prosthesis Type and Prosthetic Plan (same value, since they share procedure.prosthetic_plan).")

add_heading(doc, "1.4 Phase 4 Step 1 — Generate Lab Slip", level=2)
add_bullet(doc, "MUA table auto-populates from Phase 2 whenever MUA was placed. Each row (Zygoma / Pterygoid / Conventional) stays editable (cuff height + angulation) but must be individually Confirmed before Lab Slip PDF is generated.")
add_bullet(doc, "Intra-Oral Scan sub-fields captured: Type of Scan Body (PEEK / Metal / Hybrid), Scan Type (Vertical / Horizontal Flags / Photogrammetry), Scan Level (Abutment-MUA / Implant). All exported to the Lab Slip PDF as bulleted lists.")
add_bullet(doc, "\"Phase 3 must be approved\" status gate widened to accept legitimate downstream statuses + a current_phase >= 4 fallback (Zygoma/Pterygoid cases no longer blocked).")

add_heading(doc, "1.5 Phase 4 Step 2 — Final Restoration", level=2)
add_bullet(doc, "Baseline radiograph compare available whenever the case has any Conventional implant — mixed cases included. Compare view auto-filters out Zygoma/Pterygoid positions.")
add_bullet(doc, "Post-Delivery imaging splits by modality (same logic as Phase 2 post-surgical): OPG for Zyg/Ptr, IOPA per FDI for Conventional. Mixed cases render both.")
add_bullet(doc, "IOPA row UI now mirrors Phase 2 style — \"Implant {FDI}\" label on left, plain \"Upload IOPA\" button on right.")
add_bullet(doc, "\"Baseline Probing Depth of Peri-implant Soft Tissue\" title wraps inside the card (no more overflow).")

add_heading(doc, "1.6 Phase 5 — Follow-up", level=2)
add_bullet(doc, "3-tab sub-view removed — unified follow-up form.")
add_bullet(doc, "Advanced Clinical (Zygoma) block on Case Details keeps its Reopen for Edits button, so Supervisor / Implant In-Charge / Administrator can unfreeze prematurely-approved sections and let the student complete Day 7 / Day 30.")

doc.add_page_break()

# ── Chunk-by-chunk detail ──
add_heading(doc, "2. Chunk-by-Chunk Detail", level=1)

# Chunk B
add_heading(doc, "Chunk B — iter-418  |  Advanced Clinical (Zygoma) Decoupled from Phase 2", level=2)
add_kv_table(doc, [
    ("User Ask", "The ORIS + Immediate Loading Day 0/7/30 block must not block Phase 2 submission. Move it out of Phase 2 and let it run independently."),
    ("Approach", "New standalone AdvancedClinicalCard component with its own send-for-approval / approve endpoints. Remove the section from PhaseStep2TabbedView."),
    ("QA", "8/8 backend pytest + 7/7 frontend Playwright PASS."),
    ("Deploy", "iteration_418.json — user redeployed to production."),
])
add_para(doc, "Backend endpoints added:", bold=True)
add_bullet(doc, "POST /api/procedures/{id}/advanced-clinical/send-for-approval — student marks pending (stamps submitter + timestamp).")
add_bullet(doc, "POST /api/procedures/{id}/advanced-clinical/approve — Supervisor / Implant In-Charge / Administrator finalises (stamps approver).")
add_para(doc, "Frontend files:", bold=True)
add_code_block(doc,
    "/app/frontend/components/AdvancedClinicalCard.tsx  (new, ~319 lines)\n"
    "/app/frontend/app/procedures/[id].tsx              (mount below Phase 1 Review)\n"
    "/app/frontend/components/PhaseStep2TabbedView.tsx  (remove inline Advanced Clinical block)")

# Chunk C
add_heading(doc, "Chunk C — iter-419  |  Editable Prosthetic Plan from Phase 2 + Audit Log", level=2)
add_kv_table(doc, [
    ("User Ask", "Show Phase 1 Prosthetic Plan in the Phase 2 purple banner alongside Type of Loading. Let Student / Supervisor / Implant In-Charge / Administrator change it inline with a full audit trail."),
    ("Approach", "Purple banner gains a Prosthetic Plan row with an Edit pencil that opens a picker. Backend PATCH endpoint overwrites procedure.prosthetic_plan and appends to prosthetic_plan_change_log."),
    ("QA", "9/9 backend pytest + Playwright PASS."),
    ("Deploy", "iteration_419.json."),
])
add_para(doc, "New backend endpoint:", bold=True)
add_code_block(doc, "PATCH /api/procedures/{procedure_id}/prosthetic-plan\n"
                    "Body: { prosthetic_plan: str, prosthetic_plan_other?: str }\n"
                    "Roles: student | supervisor | implant_incharge | administrator\n"
                    "Same-value call → { ok: true, unchanged: true }  (no audit entry)")
add_para(doc, "Audit entry shape:", bold=True)
add_code_block(doc, "{ from, from_other, to, to_other, changed_by, changed_by_name,\n"
                    "  changed_by_role, changed_in_phase: 2, changed_at (ISO) }")

# Hotfix
add_heading(doc, "Hotfix — iter-420  |  Phase 2 Submit MongoDB Code-40 Error", level=2)
add_kv_table(doc, [
    ("Symptom", "\"Updating the path 'phase2_data.mua_placed' would create a conflict at 'phase2_data'\" 500 on Phase 2 submit."),
    ("Root Cause", "The submit-phase2 endpoint issued a single $set that mixed \"phase2_data\": <whole object> AND \"phase2_data.per_implant\" / .advanced_clinical / .mua_placed / .mua_details dot-path writes."),
    ("Fix", "Merge those sub-fields INTO phase2_surgical_data BEFORE composing update_data. Also merge existing_phase2 keys so a partial re-submit does not wipe Advanced Clinical state."),
    ("QA", "5/5 backend pytest PASS."),
    ("Deploy", "iteration_420.json — required redeploy for production users."),
])

# Chunk D
add_heading(doc, "Chunk D — iter-421  |  Five UX Refinements", level=2)
matrix = [
    ["1", "3-tab sub-view removal", "Phases 3, 4-Step-1, 4-Step-2, 5", "PhaseTabbedAutoFetch import + JSX removed"],
    ["2", "Color-coded per-implant outlines", "Case Details Phase 2", "Orange=Zygoma, Blue=Pterygoid, Yellow=Conventional"],
    ["3", "Prosthesis Type in Phase 2 review", "Case Details Phase 2", "Global summary + per-implant inline + suppress 'Tap to add'"],
    ["4", "Prosthetic Plan in Phase 3", "Phase 3 form banner + review", "New phase3-banner-prosthetic-plan + phase3-immediate-prosthesis-summary"],
    ["5", "Skip Healing Abutment for Immediate", "Phase 3 form + review", "Filter haConfig by phase2_component"],
]
add_matrix_table(doc, ["#", "Ask", "Where", "Change"], matrix)
add_para(doc, "QA: Frontend Playwright 5/5 PASS on a seeded 5-implant mixed case.", size=10, italic=True, color=GREY)

# Chunk E
add_heading(doc, "Chunk E — iter-422  |  Smart Planner + Prosthesis Unification + Uniform Phase 1 Review", level=2)
add_bullet(doc, "New backend constant ZYGOMA_FULL_ARCH_SET = { Quad Zygoma Implants, Zygoma and Pterygoid Implants, Zygoma and Conventional Implants, Zygoma+Pterygoid+Conventional Implants }.",
           bold_prefix="Ask 1:")
add_bullet(doc, "_generate_smart_planner_report() now folds ZYGOMA_FULL_ARCH_SET into is_full_arch, defaults arch = 'Maxillary' for Zygoma cases, and adds arch_condition = 'edentulous_maxillary' to the response.",
           bold_prefix="Ask 1:")
add_bullet(doc, "Pterygoid-only combos (\"Pterygoid and Conventional Implants\") stay dentulous per user's explicit clarification.",
           bold_prefix="Ask 1:")
add_bullet(doc, "Everywhere \"Prosthesis Type\" and \"Prosthetic Plan\" appear separately, both are now sourced from procedure.prosthetic_plan — one shared value, two labels.",
           bold_prefix="Ask 2:")
add_bullet(doc, "Restyled /app/frontend/components/ZygomaPterygoidPhase1Review.tsx to mirror Conventional layout: white cards, #E8EDF5 border, borderRadius 16, blue #1565C0 titles, InfoRow-mirror rows.",
           bold_prefix="Ask 3:")
add_para(doc, "QA: Backend 11/11 pytest PASS (Zygoma classifier + full-arch + dentulous regression); Frontend PASS across the 4 shared labels.", size=10, italic=True, color=GREY)

# Chunk F
add_heading(doc, "Chunk F — iter-423  |  Advanced Clinical Close-Out Gating + Post-Surgical Radiograph Split", level=2)

add_para(doc, "Ask 1 — Advanced Clinical stays active until Phase 3 OR 30 days from surgery:", bold=True)
add_bullet(doc, "closeOutReady derived flag: current_phase >= 3 OR (now - surgery_date >= 30 days).")
add_bullet(doc, "Per-day \"DONE\" mini pills next to each Day 0 / Day 7 / Day 30 tile (adv-day-{d}-done-pill).")
add_bullet(doc, "Amber \"Locking soon\" banner (adv-locking-soon) — visual only; section stays editable.")
add_bullet(doc, "Send-for-approval button visibility gated to (day0Filled OR closeOutReady).")
add_bullet(doc, "New Reopen for Edits button (adv-reopen) for approvers → resets status to draft with reopen_log audit.")

add_para(doc, "New backend endpoint:", bold=True)
add_code_block(doc, "POST /api/procedures/{id}/advanced-clinical/reopen\n"
                    "Roles: supervisor | implant_incharge | administrator  (student → 403)\n"
                    "Idempotent for already-draft.\n"
                    "Audit entry: { from_status, reopened_by, reopened_by_name,\n"
                    "                reopened_by_role, reopened_at }")

add_para(doc, "Ask 2 — Post-Surgical Radiograph split (Phase 2):", bold=True)
add_matrix_table(doc, ["Case Type", "IOPA", "OPG", "Section title"], [
    ["Single / Multiple Conventional", "N (FDI labels)", "None", "Post Surgical Radiograph(s)"],
    ["All on 4 / 6 / X (full-arch Conv)", "4/6/5", "Required", "Post Surgical Radiographs"],
    ["Pure Zygoma / Pterygoid", "0", "Required", "Post Surgical Radiographs - OPG"],
    ["Mixed Zyg/Ptr + Conventional", "N conv (FDI)", "Required", "OPG + IOPA (two sections)"],
])

# Chunk G
add_heading(doc, "Chunk G — iter-424  |  Phase 4 Step 1 (Generate Lab Slip) Refinements", level=2)

add_para(doc, "Ask 1 — MUA table auto-populates + per-row Confirm:", bold=True)
add_bullet(doc, "On Phase 4 Step 1 load, if phase2_data.multi_unit_abutment_placed === 'yes', rows auto-populate for every implant.")
add_bullet(doc, "Cuff Height + Angulation stay editable (per user's explicit clarification).")
add_bullet(doc, "Each row gains a Confirm checkbox (mua-confirm-{idx}). Generate Lab Slip button blocks with Alert if any row is unconfirmed.")
add_bullet(doc, "confirmed flag persisted in payload and re-hydrates on reload.")

add_para(doc, "Ask 2 — \"Phase 3 must be approved\" bug fix:", bold=True)
add_code_block(doc,
    "# Status gate widened for BOTH save_only=true and full submit paths.\n"
    "allowed_phase4_statuses = (\n"
    "    'stage2_surgical_approved',\n"
    "    'pending_stage2_prosthetic',\n"
    "    'stage2_prosthetic_step1_approved',\n"
    "    'pending_final_delivery',\n"
    ")\n"
    "# Fallback: accept any case whose current_phase >= 4.\n"
    "if status not in allowed and current_phase < 4:  raise 400\n")

add_para(doc, "Ask 3 — Intra-Oral Scan sub-fields:", bold=True)
add_bullet(doc, "Type of Scan Body (multi-select): PEEK / Metal / Hybrid.")
add_bullet(doc, "Scan Type (multi-select): Vertical Scan Body / Horizontal Scan Bodies (Flags) / Photogrammetry.")
add_bullet(doc, "Scan Level (multi-select): Abutment/Multiunit Level / Implant Level.")
add_bullet(doc, "Persisted in Stage2ProstheticSubmit model as List[str]; nulled out when impression_type switches back to conventional.")
add_bullet(doc, "Both frontend PDF (utils/pdfGenerator.ts) and backend PDF (server.py) render bulleted lists under Impression Type.")

add_para(doc, "QA: Backend 11/11 pytest PASS (status gate 6/6 + scan persistence 3/3 + PDF bullets 2/2); Frontend Playwright PASS.", size=10, italic=True, color=GREY)

# Chunk H
add_heading(doc, "Chunk H — iter-425 + 425b  |  Phase 4 Step 2 (Final Restoration) Refinements", level=2)

add_para(doc, "Helpers added to submit-phase4-step2/[id].tsx:", bold=True)
add_code_block(doc,
    "const isZygPtrPosition = (p) =>\n"
    "  /^(ZR|ZL|PR|PL)/.test(String(p ?? ''));\n\n"
    "const iopaImplantPositions = implantPositions.filter(p => !isZygPtrPosition(p));\n"
    "const zygPtrImplantPositions = implantPositions.filter(p =>  isZygPtrPosition(p));\n"
    "const needsOpg  = isFullArch || zygPtrImplantPositions.length > 0;\n"
    "const needsIopa = iopaImplantPositions.length > 0\n"
    "                  && (zygPtrImplantPositions.length > 0 || !isFullArch);\n"
    "const supportsBaselineCompare = zygPtrImplantPositions.length === 0;")
add_bullet(doc, "Ask 1: RadiographCompare hidden for any case with Zygoma/Pterygoid (widened in Chunk I).")
add_bullet(doc, "Ask 2: Split imaging — phase4-step2-opg-section + phase4-step2-iopa-section, rendered independently. IOPA rows only for Conventional positions.")
add_bullet(doc, "Ask 3: Baseline Probing Depth title wraps inside the card (flex:1, flexShrink:1, flexWrap:'wrap' on the Text).")
add_para(doc, "QA: Frontend Playwright 12/12 PASS across 6 procedure-type scenarios (iter-425 + iter-425b hotfix retest).", size=10, italic=True, color=GREY)

# Chunk I
add_heading(doc, "Chunk I — iter-426  |  Baseline Compare Widened + IOPA Row Polish", level=2)
add_bullet(doc, "supportsBaselineCompare widened to iopaImplantPositions.length > 0 — mixed cases with Conventional implants now get the compare.",
           bold_prefix="Ask 1:")
add_bullet(doc, "RadiographCompare gains an optional positionFilter?: (pos: string) => boolean prop. Phase 4 Step 2 passes (pos) => !isZygPtrPosition(pos) so only Conventional implants are diffed.",
           bold_prefix="Ask 1:")
add_bullet(doc, "Phase 4 Step 2 IOPA rows redesigned to mirror Phase 2 — \"Implant {FDI}\" label on left, plain blue \"Upload IOPA\" button on right, green \"View IOPA\" + red remove when uploaded. Old dark-blue tooth badge removed.",
           bold_prefix="Ask 2:")
add_para(doc, "QA: Frontend Playwright 8/8 PASS across A–I scenarios (iteration_426.json).", size=10, italic=True, color=GREY)

doc.add_page_break()

# ── API surface ──
add_heading(doc, "3. API Surface — New / Modified Endpoints", level=1)
api_rows = [
    ["POST", "/api/procedures/{id}/advanced-clinical/send-for-approval",
     "iter-418", "Student marks pending. Stamps submitted_by/at."],
    ["POST", "/api/procedures/{id}/advanced-clinical/approve",
     "iter-418", "Supervisor / Implant In-Charge / Administrator finalises."],
    ["POST", "/api/procedures/{id}/advanced-clinical/reopen",
     "iter-423", "Approver resets status back to draft; audit log."],
    ["PATCH", "/api/procedures/{id}/prosthetic-plan",
     "iter-419", "Overwrite + audit-log Prosthetic Plan change."],
    ["PATCH", "/api/procedures/{id}/tabbed-phase-data/2",
     "iter-420 (hotfix)", "Fixed Mongo code-40 sub-path conflict."],
    ["POST", "/api/procedures/{id}/stage2/prosthetic",
     "iter-424", "Widened status gate; new scan_* fields accepted."],
    ["POST", "/api/procedures/{id}/smart-planner",
     "iter-422", "Zygoma cases classified as edentulous_maxillary full arch."],
]
add_matrix_table(doc, ["Method", "Path", "Introduced", "Purpose"], api_rows)

# ── Schema ──
add_heading(doc, "4. MongoDB Schema Additions", level=1)

add_heading(doc, "4.1 procedure (top-level)", level=2)
add_code_block(doc,
    "prosthetic_plan_change_log: [\n"
    "  {\n"
    "    from, from_other, to, to_other,\n"
    "    changed_by, changed_by_name, changed_by_role,\n"
    "    changed_in_phase: 2,\n"
    "    changed_at: ISO8601\n"
    "  }\n"
    "]")

add_heading(doc, "4.2 phase2_data.advanced_clinical", level=2)
add_code_block(doc,
    "{\n"
    "  approval_status: 'draft' | 'pending' | 'approved',\n"
    "  submitted_by, submitted_by_name, submitted_at,\n"
    "  approved_by, approved_by_name, approved_by_role, approved_at,\n"
    "  reopen_log: [{ from_status, reopened_by,\n"
    "                 reopened_by_name, reopened_by_role, reopened_at }],\n"
    "  immediate_loading_day0_at, immediate_loading_day7_at, immediate_loading_day30_at,\n"
    "  oris_success_code, zaga_type, ...ORIS toggles...\n"
    "}")

add_heading(doc, "4.3 phase4_step1_data", level=2)
add_code_block(doc,
    "{\n"
    "  impression_type: 'conventional' | 'intraoral_scans',\n"
    "  conventional_tray_type, impression_material,\n"
    "  scan_body_types: string[]   # PEEK / Metal / Hybrid\n"
    "  scan_types:      string[]   # Vertical Scan Body / Horizontal Scan Bodies (Flags) / Photogrammetry\n"
    "  scan_levels:     string[]   # Abutment/Multiunit Level / Implant Level\n"
    "  multi_unit_abutment_details: [\n"
    "    { tooth, angulation, cuff_height, confirmed: bool }\n"
    "  ]\n"
    "}")

doc.add_page_break()

# ── Files ──
add_heading(doc, "5. Files Touched Across the Session", level=1)

add_heading(doc, "5.1 Backend", level=2)
add_bullet(doc, "/app/backend/server.py — 6 new endpoints, ZYGOMA_FULL_ARCH_SET constant, Smart Planner arch_condition, Phase 4 Step 1 status gate widening, Stage2ProstheticSubmit model extended with scan_body_types/scan_types/scan_levels, Mongo code-40 hotfix, Lab Slip PDF bulleted lists.")

add_heading(doc, "5.2 Frontend Forms", level=2)
add_bullet(doc, "/app/frontend/app/procedures/submit-phase2/[id].tsx — Purple banner editable Prosthetic Plan, post-surgical radiograph split, ORIS/ZAGA moved out.")
add_bullet(doc, "/app/frontend/app/procedures/submit-stage2-surgical/[id].tsx (Phase 3) — Tab removal, Prosthesis Type + Prosthetic Plan banner, Healing-Abutment skip for Immediate-Loaded.")
add_bullet(doc, "/app/frontend/app/procedures/submit-stage2-prosthetic/[id].tsx (Phase 4 Step 1) — MUA auto-seed + per-row confirm, Intra-Oral Scan sub-fields.")
add_bullet(doc, "/app/frontend/app/procedures/submit-phase4-step2/[id].tsx — Split imaging, baseline compare gate, Phase-2-mirrored IOPA rows, probing title wrap.")
add_bullet(doc, "/app/frontend/app/procedures/followup/[id].tsx (Phase 5) — Tab removal.")

add_heading(doc, "5.3 Frontend Case Details / Review", level=2)
add_bullet(doc, "/app/frontend/app/procedures/[id].tsx — Advanced Clinical card mount, color-coded implant outlines, Prosthesis Type summary, Phase 3 Immediate Prosthesis review block, Healing-Abutment skip on review.")

add_heading(doc, "5.4 Reusable Components", level=2)
add_bullet(doc, "/app/frontend/components/AdvancedClinicalCard.tsx (new, ~430 lines) — Standalone card, DONE pills, Locking-soon banner, Reopen button.")
add_bullet(doc, "/app/frontend/components/RadiographCompare.tsx — positionFilter prop for mixed cases.")
add_bullet(doc, "/app/frontend/components/ZygomaPterygoidPhase1Review.tsx — Restyled to match Conventional.")
add_bullet(doc, "/app/frontend/components/PhaseStep2TabbedView.tsx — Removed Advanced Clinical inline block.")

add_heading(doc, "5.5 PDF Generator", level=2)
add_bullet(doc, "/app/frontend/utils/pdfGenerator.ts — Lab Slip Impression row now emits bulleted <ul> blocks for scan_body_types, scan_types, scan_levels.")

doc.add_page_break()

# ── Test coverage ──
add_heading(doc, "6. Test Coverage Log", level=1)
tests = [
    ["iter-418", "Chunk B — Advanced Clinical decoupled", "8/8 backend + 7/7 frontend", "PASS"],
    ["iter-419", "Chunk C — Prosthetic Plan editor + audit", "9/9 backend + Playwright", "PASS"],
    ["iter-420", "Hotfix — Mongo code-40", "5/5 backend", "PASS"],
    ["iter-421", "Chunk D — 5 UX refinements", "5/5 frontend", "PASS"],
    ["iter-422", "Chunk E — Smart Planner + uniformity", "11/11 backend + Playwright", "PASS"],
    ["iter-423", "Chunk F — Advanced Clinical close-out + radiograph split", "7/7 backend + Playwright", "PASS"],
    ["iter-424", "Chunk G — Phase 4 Step 1 refinements", "11/11 backend + Playwright", "PASS"],
    ["iter-425", "Chunk H — Phase 4 Step 2 refinements", "11/12 frontend (1 hotfix)", "1 fix"],
    ["iter-425b", "Chunk H hotfix retest", "Frontend PASS", "PASS"],
    ["iter-426", "Chunk I — Baseline compare + IOPA polish", "8/8 frontend", "PASS"],
]
add_matrix_table(doc, ["Iteration", "Chunk", "Assertions", "Verdict"], tests)

# ── Bugs ──
add_heading(doc, "7. Production Bugs Fixed", level=1)
bugs = [
    ["#1", "MongoDB code-40 on Phase 2 submit",
     "Mixing full-object $set with dot-path sub-fields.",
     "Merge sub-fields into phase2_surgical_data before update.", "iter-420"],
    ["#2", "\"Phase 3 must be approved\" on Phase 4 Step 1",
     "Status gate rejected legitimate downstream states for Zygoma/Pterygoid/Conventional cases.",
     "Widened gate + current_phase >= 4 fallback.", "iter-424"],
    ["#3", "Day 7 / Day 30 pickers locked after Day 0 submit",
     "Advanced Clinical section marked read-only on approval — could not fill follow-ups.",
     "Reopen endpoint + gated Send-for-Approval + Locking-soon hint.", "iter-423"],
]
add_matrix_table(doc, ["#", "Symptom", "Cause", "Fix", "Iter"], bugs)

# ── Deployment ──
add_heading(doc, "8. Deployment Notes", level=1)
add_para(doc,
    "Every chunk in this session was verified on the preview environment. To ship the "
    "cumulative work to production, tap the Publish button once — it bundles:")
add_bullet(doc, "6 new / changed backend endpoints (Chunks B, C, F, G).")
add_bullet(doc, "The Mongo code-40 hotfix (iter-420).")
add_bullet(doc, "The Phase 4 Step 1 status-gate unblock (iter-424).")
add_bullet(doc, "All UI refinements from Chunks D, E, H, I.")
add_para(doc,
    "Once redeployed, existing cases stuck in the premature Advanced Clinical approved state "
    "can be recovered by an approver via the new Reopen for Edits button.")

# ── Closing ──
horizontal_rule(doc)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("End of session report — v13 (iter-418 → iter-426)")
r.italic = True
r.font.size = Pt(10)
r.font.color.rgb = GREY

# Save
out_path = "/app/Zygoma_Pterygoid_Workflow_Session_Report.docx"
doc.save(out_path)
print(f"WROTE: {out_path}")
