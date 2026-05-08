# Prosthodontics Dental Implant Mobile App — PRD

## Iteration 192 (Feb 2026) — Phase 4 Step 1: Impression Material capture for conventional impressions

### Why
A conventional implant impression is only as good as the elastomer used. Capturing **Polyether** vs **Heavy and Light body** vs **Putty and Light body** alongside the tray technique:
- gives the lab Rx the full picture (no phone call to confirm), and
- surfaces a teaching moment when a student picks a material poorly suited to the chosen tray (e.g. putty/light wash with an open-tray pickup is a common novice mistake).

### Changes
**Backend** (`/app/backend/server.py`)
- `Stage2ProstheticSubmit` gains `impression_material: Optional[str]` (`polyether` | `heavy_light_body` | `putty_light_body`, max 30).
- `submit_stage2_prosthetic` validates: when `impression_type == 'conventional'`, `impression_material` MUST be one of the three values → 400 with a friendly message otherwise. Stored in `phase4_step1_data.impression_material`; explicitly nulled when the user later switches to Intra-Oral Scans (same null-on-switch contract as `conventional_tray_type`).
- Case-report PDF emits a separate `Impression Material` row (e.g. `Heavy and Light body`); AI summary appends `Impression Material: heavy light body` when conventional.

**Frontend** (`submit-stage2-prosthetic/[id].tsx`, `procedures/[id].tsx`)
- New third-level reveal: after the user picks Open Tray or Closed Tray, an **Impression material used** card group appears with three radio-style cards — Polyether / Heavy and Light body / Putty and Light body — flask icon, mandatory red `*`. Submit button blocks with a clear Alert until one is picked. Switching away from "Conventional Impressions Made" clears both tray-type AND material so no stale value is persisted. testIDs: `impression-material-options`, `impression-material-polyether`, `impression-material-heavy_light_body`, `impression-material-putty_light_body`.
- Case-detail row now reads e.g. `Conventional Impressions (Open Tray) — Heavy and Light body`.

### Verification
- Backend curl: 3/3 — `conventional + open_tray` without material → 400; `+ invalid material` (`alginate`) → 400; `+ polyether` → 200 with all three values persisted (`impression_type=conventional`, `conventional_tray_type=open_tray`, `impression_material=polyether`).
- Test procedure flipped to `stage2_surgical_approved` for the curl tests, then reset to `phase1_approved` with `phase4_step1_data` / `final_prosthetic_plan` / `prosthetic_material` cleared.


## Iteration 191 (Feb 2026) — Phase 4 Step 1: tray-type sub-choice for Conventional Impression

### Why
Conventional implant impressions split into two clinically distinct techniques — **Open Tray** (direct, copings unscrewed through a windowed tray) and **Closed Tray** (indirect, transfer copings re-seated after pickup). Recording only "Conventional Impression made" hides this distinction in the case record and in the eventual lab Rx; the lab and the In-Charge auditor both need it explicit.

### Changes
**Backend** (`/app/backend/server.py`)
- `Stage2ProstheticSubmit` model gains `conventional_tray_type: Optional[str]` (`open_tray` | `closed_tray`, max 20).
- `submit_stage2_prosthetic` validates: if `impression_type == 'conventional'` and `conventional_tray_type` is not one of the two values → 400 with a user-facing message. Persisted in `phase4_step1_data.conventional_tray_type`; explicitly set to `null` when the user later switches to `intraoral_scans`, so no stale tray is left behind.
- PDF case report and AI-summary text both append the tray label, e.g. `Impression Type: Conventional Impressions (Open Tray)`.

**Frontend**
- `submit-stage2-prosthetic/[id].tsx`: when "Conventional Impressions Made" is chosen, an indented sub-panel reveals two large-tap cards — Open Tray / Closed Tray — each with a one-line technique description. Selecting Intra-Oral Scans clears the tray choice. Submit button blocks with an Alert until a tray is picked. testIDs: `impression-conventional`, `impression-intraoral_scans`, `tray-open_tray`, `tray-closed_tray`, `conventional-tray-options`.
- `procedures/[id].tsx` case-detail row now reads `Conventional Impressions (Open Tray)` / `(Closed Tray)` when present.

### Verification
- Backend curl: 3/3 — conventional without tray → 400; conventional with invalid tray value → 400; conventional + `open_tray` → 200 with `phase4_step1_data.conventional_tray_type='open_tray'` persisted.
- Test procedure was temporarily flipped to `stage2_surgical_approved` for the curl tests and reset afterwards (status, phase4_step1_data, final_prosthetic_plan, prosthetic_material all cleared).


## Iteration 190 (Feb 2026) — Phase 2 split: Pre-Surgical Checklist must complete before Surgical Procedure unlocks

### Why
Until now both the Pre-Surgical Checklist and Surgical Procedure block were filled together, post-op. Clinically the checklist must be ticked **before** the cut (instruments / equipment / operatory readiness), and the surgical findings only after surgery. Without this split, schedulers were attesting to inventory/asepsis hours after the fact — not defensible, and not useful for catching missing items in time.

### Changes
**Backend** (`/app/backend/server.py`)
- New `Phase2PreOpSubmit` model (items dict + optional notes).
- New endpoint `POST /api/procedures/{id}/phase2-preop` — gated on `status == 'phase1_approved'`, role-gated to student-owner / supervisor-owner / any implant_incharge / created_by. Validates 13 mandatory item ids; rejects with 400 listing the missing ones; idempotent (re-submission overwrites timestamp, completed_by_*, completed_by_role, notes).
- Submit-Phase 2 gate added at line ~7516: refuses 400 unless `phase2_preop_completed_at` is set. Sits before the consent-form gate.
- Background scheduler `preop_checklist_reminder_loop` (poll every 15 min). Sends Expo push + in-app `notifications` row at **T-3h** and **T-30m** before scheduled surgery to student + supervisor + in-charge if Pre-Op is still incomplete. Idempotent via `preop_reminder_3h_sent` / `preop_reminder_30m_sent` flags.

**Frontend** (`/app/frontend/constants/checklist.ts`, `app/procedures/submit-phase2/[id].tsx`, `app/procedures/[id].tsx`)
- `CHECKLIST_DATA.surgical` rewritten as 4 sections × 21 items with a per-item `mandatory` flag (13 mandatory + 8 optional). User-supplied final list, kept verbatim.
- Submit-Phase 2 form: legacy 7-item Yes/No checklist replaced with sectioned checkbox UI; mandatory items show red `*`; "Save Pre-Op & Unlock Surgery" button (separate POST). Surgical block soft-locks below it (opacity 0.55 + pointerEvents `none` + orange lock banner). On successful save, the checklist auto-collapses into a green "Signed off by {name}" stamp and the surgical block becomes interactive.
- Case-detail page (`procedures/[id].tsx`): countdown banner above status timeline for any `phase1_approved` case where Pre-Op is not yet stamped and the scheduled surgery is within 24 h. Switches to red URGENT style at ≤30 min.

### Custom checklist items (from user)
- **Patient readiness** — patient_id_consent_verified*, allergies_meds_reviewed, vitals_ok*, preop_antibiotic, preop_chx_rinse*
- **Imaging and planning** — imaging_chairside*, surgical_guide_fit, drilling_sequence_ready*
- **Inventory verification** — implant_verified*, healing_abutment_available, multiunit_abutments_available, drilling_kit_sterile*, physiodispenser_ready*, instruments_autoclaved*, bone_graft_membrane, sutures_ready, saline_irrigation*
- **Operatory and team** — aseptic_field_draped*, suction_tested*, team_briefed*, emergency_drugs

### Verification
- Backend pytest `/app/backend/tests/test_phase2_preop_iter189.py` — 8/8 PASS (auth, status gate, missing mandatory, mandatory=false treated as missing, happy path, idempotent re-submission, submit-phase2 400 without preop, submit-phase2 200 with preop).
- Frontend structural render verified: all 4 section titles, 13/13 mandatory labels (with red `*`), 8/8 optional labels, lock banner, save button.
- testIDs (`preop-section-toggle`, `preop-item-{id}`, `preop-save-btn`, `preop-locked-banner`, `phase2-preop-checklist`, `preop-countdown-banner`) standardised on RN `testID` so Playwright can target them.


## Iteration 189 (Feb 2026) — Implant Planning UI: removed 0/6 cap and locked actions on completed cases

### Why
1. The "0/6" cap was a vestige of an earlier Single-implant assumption — modern Multiple/Full-Arch cases routinely exceed 6 positions, and the visible cap was misleading on every new case.
2. On `completed` cases the Edit / Remove / Add controls were already gated by `canEdit`, but the visible badge and add-button still spelled out `1/6` — making completed records look mid-edit and the cap feel enforced.

### Changes
**`/app/frontend/components/CaseImplantPlanning.tsx`** (only file touched)
- Header badge: `{plans.length}/6` → `{plans.length}` (just the count, no cap).
- Add button label: `Add Implant Position ({plans.length}/6)` → `Add Implant Position`.
- No logic change to `canEdit` — pre-existing rule (`!isCaseCompleted && (isStudentEdit || isFacultyEdit)`) already hides Edit / Remove / Add and the Pending-tooth chips on completed cases.

### Verification (Playwright on the live preview)
- **Completed case** (`Test Approval Patient`, status `completed`): badge renders as `1` (not `1/6`); Edit / Remove / Add buttons absent; only the "Drilling Protocol" button remains. `data-testid="edit-implant-*"`, `delete-implant-*`, `add-implant-btn` all return 0 / false.
- **In-progress case** (`TEST_MUA_88c4430c`, status `phase1_approved`, 4 planned implants): badge renders as `4`; Edit / Remove buttons visible per implant; "Add Implant Position" button visible without `(N/6)` suffix. Section text `'/6'` count = 0.


## Iteration 188 (Feb 2026) — Cumulative phase breadcrumb + simplified "Approved" success state

### Why
1. The top-of-case progress pill only showed `current ›› next`, losing the trail of completed phases.
2. The In-Charge auto-approval success state was overcomplicated (trophy + heading + big "Proceed to Phase N" button + small "View Case" link). Next phase doesn't actually begin immediately, so the prominent CTA was misleading.

### Changes
**`/app/frontend/app/procedures/[id].tsx`** — replaced `getProgressPair()` with `getProgressTrail()`. The top-of-case pill is now a **cumulative breadcrumb**: each completed phase as a soft-green chip, the current phase as a haloed white chip with blue glow, the chevron leading INTO the current phase animates (existing `PulsingDoubleArrow`). Per-chip tap → smooth scrolls to that phase's section anchor. Final `Done ✓` chip appears on `completed`. Shared across all roles (student / supervisor / In-Charge).

**Phase forms (Phase 1 / 2 / 3 / 4-Step 1 / 4-Step 2)** — replaced trophy + Phase X Complete heading + Proceed-to-Phase-N CTA with a minimal **disabled "Approved" pill** (green) followed by a plain underlined **"View Case"** link. "Proceed to next phase" CTA removed entirely from all 5 forms — clinically the next phase doesn't start immediately. Phase 1 Alert dialog replaced with the same inline pattern via a new `phase1Done` state.

### Files touched
- `/app/frontend/app/procedures/[id].tsx`
- `/app/frontend/app/procedures/submit-phase2/[id].tsx`
- `/app/frontend/app/procedures/submit-stage2-surgical/[id].tsx`
- `/app/frontend/app/procedures/submit-stage2-prosthetic/[id].tsx`
- `/app/frontend/app/procedures/submit-phase4-step2/[id].tsx`
- `/app/frontend/app/(tabs)/new-procedure.tsx`

### Verification
- Metro bundles compiled cleanly across all touched files (no JSX or TS errors).
- "Approved" is a styled View (non-interactive); "View Case" navigates via `router.replace`.
- Per-chip tap on the breadcrumb scrolls to `[data-testid="phaseN-full-data-section"]`.

## Iteration 187 (Feb 2026) — Smart back-navigation everywhere

### Why
After `router.replace(...)` (used by the new "Done"/"View Case" flow), notification deep links, or fresh page loads on web, the back button silently did nothing because `router.back()` had nothing to pop, leaving users stranded on a blank screen.

### Changes
- `/app/frontend/components/BackButton.tsx` — now checks `router.canGoBack()` (and `window.history.length` on web), falls back to `router.replace('/(tabs)/dashboard')` when there's no history. New optional `fallbackHref` prop.
- New utility `/app/frontend/utils/safeNav.ts` — `goBackOrHome()` mirroring the same logic for inline use.
- Phase 2 / 3 / 4-Step 1 success Alert "OK" callbacks now use `goBackOrHome()` instead of bare `router.back()`.

## Iteration 186 (Feb 2026) — Implant In-Charge "Done" workflow + Phase 4 Step 2 imaging & prosthesis photos

### Why
1. Implant In-Charge cases auto-approve, but the user still had to click "Submit for Approval" then go back to notifications to click "Approve" — double work for an auto-approved flow. Unify into a single "Done" → auto-approve → inline "Proceed to next phase" CTA.
2. The case file lacked post-delivery imaging and final-prosthesis photographs, both medico-legally important for treatment closure.

### Changes
**Backend (`/app/backend/server.py`)**
- `Phase4Step2Submit` model extended with `iopa_uploads`, `opg_upload`, `prosthesis_photos`.
- `submit_phase4_step2` now enforces: full-arch (`All on 4/6/X`) → OPG required; non-full-arch → IOPA per implant_plan position; ≥2 prosthesis photos; persists `phase4_step2_iopa_uploads`, `phase4_step2_opg_upload`, `phase4_step2_prosthesis_photos`.
- New endpoint `POST /api/uploads/media-temp` — generic file upload (image/* + PDF), nurse 403, returns clean `{filename, original_name, content_type}`.

**Frontend**
- **In-Charge "Done" + auto-proceed** applied across all five phase forms: `(tabs)/new-procedure.tsx`, `submit-phase2/[id].tsx`, `submit-stage2-surgical/[id].tsx`, `submit-stage2-prosthetic/[id].tsx`, `submit-phase4-step2/[id].tsx`. When `user.role === 'implant_incharge'` AND case is self-created, the submit button reads **"Done"**; on click the form submits, immediately calls the corresponding approve endpoint, then renders an in-place success card with **"Proceed to Phase X"** CTA navigating straight into the next phase form.
- **Phase 4 Step 2** fully rewritten:
  - Trial & Delivery checklist (existing).
  - **Imaging block**: full-arch → single OPG slot; non-full-arch → one IOPA row per `implant_plans` position with tooth badge.
  - **Prosthesis Photos block**: 2 default labeled slots (`Frontal view`, `Occlusal view`), editable label TextInput per slot, "+" to append, delete icon on slots ≥3, all photos must have a label.
  - Hard validation matches backend rules.
  - Success card distinguishes "Treatment Marked Complete" (In-Charge auto-approve) vs "Submitted for Final Approval" (others).

### Files touched
- `/app/backend/server.py` — model + endpoint extension, new media-temp upload.
- `+ /app/frontend/app/procedures/submit-phase4-step2/[id].tsx` — full rewrite (525 lines).
- `/app/frontend/app/procedures/submit-phase2/[id].tsx`, `submit-stage2-surgical/[id].tsx`, `submit-stage2-prosthetic/[id].tsx`, `(tabs)/new-procedure.tsx` — done-flow ternary success card + In-Charge button label.

### Verification
- Backend pytest 7/7 pass (`/app/backend/tests/test_phase4_step2_iter143.py`): media-temp happy path + 400 + nurse 403; full-arch missing OPG → 400; non-full-arch missing IOPA → 400; <2 photos → 400; happy path persists all three new fields with status `pending_final_delivery`.
- Frontend bundles clean. Phase 4 Step 2 page renders correctly (imaging block, photo slots, "+" add button).
- Testing agent caught + fixed a JSX bug (orphan closing tags in `submit-phase2/[id].tsx`) — confirmed resolved.

### Known follow-ups
- (Carry-over from iter142) Pre-existing `data-testid` props on RN components in 4 phase forms — not regressed; only an automation testability concern.
- The auto-approve POST after submit is wrapped in `try{}catch{}` — consider surfacing a toast on failure instead of silently swallowing.

## Iteration 185 (Feb 2026) — Full-Arch Atrophy Classification (silent institutional guidance)

### Why
For Full-Arch (All-on-4 / 6 / X) cases, give every operator class-driven therapeutic options derived from a peer-reviewed institutional classification of the atrophic edentulous arch — without exposing any source attribution to the user.

### Changes
**Backend**
- New module `/app/backend/full_arch_classification.py` — pure classifier with thresholds:
  - Anterior height: ≥16 mm simple, 12–16 moderate, 8–12 advanced, <8 severe.
  - Posterior height: ≥12 mm simple, 8–12 moderate, 4–8 advanced, <4 severe.
  - Width <6 mm forces severe regardless of height.
  - 5 classes (CCI–CCV) per arch with 3 therapeutic options each (A=multi-implant fixed, B=tilted/zygomatic/short-implant, C=overdenture), loading rules, augmentation guidance.
- New endpoint `POST /api/full-arch-classify` — pure function for live UI preview.
- New endpoint `PUT /api/procedures/{id}/atrophy-assessment` — persists per-arch result on the procedure under `atrophy_assessment` (nurses 403).
- `_build_case_context()` silently appends the rendered classification text for each saved arch so the AI Clinical Summary and AI Surgical Summary can leverage it without naming any source.

**Frontend**
- `app/(tabs)/new-procedure.tsx` — new "Atrophy Assessment" section visible only for Full-Arch procedure types. 4 numeric fields (anterior/posterior height + width) per arch (maxilla / mandible / both). Live classification preview chip + 3 therapeutic options + loading & augmentation guidance via debounced calls to `/full-arch-classify`. On case create, the values are saved via `PUT /procedures/{id}/atrophy-assessment` (best-effort, non-blocking).
- New component `components/AtrophyClassificationChip.tsx` — debounced live preview with class colour palette (CCI green → CCV pink).
- `app/procedures/[id].tsx` — new "Full-Arch Treatment Plan" section displays the persisted classification with all 3 therapeutic options (per arch), loading rule, and augmentation note. No source attribution.

### Files touched
- `+ /app/backend/full_arch_classification.py`
- `/app/backend/server.py` — `_build_case_context` injection; new POST `/full-arch-classify`; new PUT `/procedures/{id}/atrophy-assessment`.
- `+ /app/frontend/components/AtrophyClassificationChip.tsx`
- `/app/frontend/app/(tabs)/new-procedure.tsx` — atrophy fields + UI panel + save call.
- `/app/frontend/app/procedures/[id].tsx` — Treatment Plan card.

### Verification
- 8-case unit test in-process (CCI–CCV maxilla + CCI/CCV-by-width mandible + missing-input error) — all pass.
- E2E curl: `PUT atrophy-assessment` then `GET procedure` returns persisted CCIV maxilla (Severe posterior) + CCII mandible (Moderate posterior) with 3 options each.
- `_build_case_context()` verified to append the full per-arch classification text + therapeutic options + loading + augmentation guidance for downstream AI prompts.
- No source citation appears anywhere in code, UI, or AI output.
- Backend lint clean.

## Iteration 184 (Feb 2026) — Digital Sign-Off block (court-defensible attestation)

### Why
Once Phase 4 closes, the case PDF should serve as a court-defensible record. We already capture per-faculty approval timestamps internally; this surfaces them as a clear attestation block on both screen and print without adding any new approval steps.

### Changes
**Backend (`/app/backend/server.py`)**
- Replaced the static "Date:" footer on the PDF "Summary & Confirmation" page with a per-faculty sign-off block:
  - PG Student name
  - Supervising Faculty + `supervisor_final_delivery_approved_at` stamp + their Phase 4 Step 2 note (if any)
  - Implant In-Charge + `implant_incharge_final_delivery_approved_at` stamp + their note (if any)
  - "Treatment Completed: <date>" line
  - Italic footnote: *"Auto-stamped on case completion. Subsequent edits are recorded in the case audit log."*

**Frontend (`/app/frontend/app/procedures/[id].tsx`)**
- Added a new **Digital Sign-Off card** under the Treatment-Complete banner, visible only when `procedure.status === 'completed'`. Mirrors the PDF block: faculty name, stamped local-time approval, and any Phase 4 Step 2 notes.
- Card has an "ATTESTED" green badge in the header for visual authority.

### Files touched
- `/app/backend/server.py` — `generate_case_report()` Summary & Confirmation page rewritten (~line 6498).
- `/app/frontend/app/procedures/[id].tsx` — new Sign-Off block right after the existing `completedBanner` (~line 1294).

### Verification
- Curl + PDF stream extraction on a real `completed` case (id `69cfb036a19e1d1819e0f6fd`):
  - Found "Supervising Faculty: Dr. Paresh Gandhi", "Approved: April 03, 2026 · 12:21 UTC"
  - Found "Implant Incharge: Dr. Abhijit Patil", "Approved: April 03, 2026 · 12:21 UTC"
  - Found "Treatment Completed: April 03, 2026"
  - Found "Auto-stamped on case completion..."
- Backend lint: no new errors.

## Iteration 183 (Feb 2026) — Editable AI Summaries + Role-aware approval-helper text + Self-approval polish

### Why
User asked for finer role-aware UX in the approval flow plus first-class editability for AI-generated summaries so reviewers can refine the output without losing accountability.

### Changes
**Backend (`/app/backend/server.py`)**
- New endpoint `PATCH /api/procedures/{id}/ai-summary` accepting `{ summary_type: 'case_summary'|'surgical_notes', content: string }`. Persists to `ai_case_summary` / `ai_surgical_notes`. Idempotent (returns `unchanged: true`). Nurses get 403.
- Edits made by **anyone other than the case owner** (student_id / created_by_id) push an entry to `procedure.edit_log` with `field`, `old_value`, `new_value`, `edited_by`, `edited_by_role`, `edited_at`. Owner edits don't pollute the log.
- Case-Report PDF (`generate_case_report`) now appends **AI Clinical Summary** and **AI Surgical Summary** sections (inflated PDF stream verified) right before the signature page.

**Frontend**
- `submit-phase2/[id].tsx`, `submit-stage2-surgical/[id].tsx`, `submit-stage2-prosthetic/[id].tsx`, `submit-phase4-step2/[id].tsx` — Notes helper text is now **role-aware**:
  - Student → unchanged ("Supervisor and In-Charge remarks will be added during approval.")
  - Supervisor → "Implant In-Charge remark will be added during approval."
  - Implant In-Charge → hidden entirely (auto-approved).
- `submit-phase2/[id].tsx` — the in-form **"Generate Surgical Notes" button was removed** along with `aiSurgicalNotes` / `aiNotesLoading` state. AI Surgical Summary generation is deferred to **post-Phase 2 approval** so it can analyze final torque, MUA angulation, cuff heights, IOPA, etc.
- `procedures/[id].tsx`:
  - **AI Surgical Summary** card shows a **"Generate AI Surgical Summary"** button when status is `phase2_approved` or beyond and notes are empty. Once generated, the card shows the text plus a **pencil edit** icon and a **regenerate** icon (with confirmation).
  - **AI Clinical Summary** card is now persistent (driven by `procedure.ai_case_summary` instead of ephemeral state) with a pencil edit. Toolbar AI button label switches to **"REGEN AI"** once a summary exists.
  - Inline edit mode for both summaries: TextInput + Save/Cancel; Save calls the new PATCH endpoint and refetches the procedure.
  - The entire **"Your Remarks"** approval-comment box is now hidden when an Implant In-Charge is approving their own auto-approval case (`role === 'implant_incharge' && created_by_role === 'implant_incharge' && user.id === created_by_id`).
  - For other Implant In-Charge approvals (reviewing a student's case), the helper line "This comment will be visible to the student…" is hidden but the box remains visible.

### Files touched
- `/app/backend/server.py` — `+` PATCH `/procedures/{id}/ai-summary` (~line 5470); `+` AI summary section in PDF generator (~line 6478).
- `/app/frontend/app/procedures/[id].tsx` — new state + `saveAiSummary` / `generateAiSurgicalSummary` helpers; replaced AI Surgical card; replaced AI Clinical card; added edit-mode card; gated approval-remarks box for self-approval.
- `/app/frontend/app/procedures/submit-phase2/[id].tsx` — removed in-form AI button and state; role-aware helper.
- `/app/frontend/app/procedures/submit-stage2-surgical/[id].tsx`, `/app/frontend/app/procedures/submit-stage2-prosthetic/[id].tsx`, `/app/frontend/app/procedures/submit-phase4-step2/[id].tsx` — role-aware helper.

### Tests
- Backend: `/app/backend/tests/test_ai_summary_iteration142.py` — 9/9 pass.
- Backend curl-verified: invalid summary_type → 400; idempotent unchanged path; non-owner edit appends `edit_log`; PDF stream contains both AI section headings and saved content.

### Known follow-up (low priority)
- React-Native-Web `Unexpected text node: .` console warning on case-detail (cosmetic only). Likely a stray whitespace child of the new AI-card IIFE; track down later.

## Iteration 182 (Feb 2026) — Indications text for Alpha-Bio brochure systems

Added the user-supplied clinical indication strings to the 7 new Alpha-Bio systems (NeO×3 / ICE / ATID / DFI / NICE). These render as **blue subtitle text** below each system name in (a) Phase 1 implant-selection dropdown and (b) the Home → Implant Library tab dropdown — same UI surface where SPI / Lance+ / Ankylos already show indications.

Implementation note: the frontend was already wired to render `system.indication` as blue text (lines 497, 705 in `implant-selection.tsx`; line 1321 in `CaseImplantPlanning.tsx`). Only data was missing. Added 7 entries to `IMPLANT_INDICATIONS` in `server.py` (~line 8320) — each entry includes `indication`, `indicated_procedures` and `indicated_bone_types` so the Suggest-Me filter benefits too.

### Indications added
| System | Indication |
|---|---|
| ATID | Suitable for D1 and D2 bone types and conventional loading protocols. |
| DFI | Indicated in D1, D2, D3, and D4 bone types. Offers both cylindrical and tapered implant design advantages. |
| ICE | Indicated for D1, D2, D3 bone types. Improved stress distribution; stable placement where denser bone is desired. |
| NICE | Indicated for narrow alveolar ridges with 4mm, 4.5mm, and 5mm bone width. Suitable for D1, D2, D3, D4 bone types. |
| NeO Conical Hex | Indicated for D1, D2, D3, and D4 bone types and for narrow ridges, limited interdental spaces, and esthetic-zone restorations. |
| NeO Conical Standard | Indicated for immediate and delayed loading and soft-tissue preservation in the high-esthetics zone. |
| NeO Internal Hex | Indicated in D2, D3, and D4 bone types. Suitable for cases requiring high primary stability, immediate or delayed placement and loading. |

### Verified
- Live API `/api/implant-library/systems` returns all 8 Alpha-Bio systems with correct `indication` strings ✓
- Playwright body-text scan in the live dropdown matched all 7 expected substrings ✓
- File: `/app/backend/server.py` (only). No frontend changes needed.

---


## Iteration 181 (Feb 2026) — Sibling-count chip on Home → Implant tab

Extended the iter-180 "N systems" badge pattern to the Home → Implant tab. After picking a system (e.g., `Alpha Bio – NeO Internal Hex Connection`), a small light-blue chip appears next to the dropdown showing **`+7 Alpha Bio`** — surfacing how many other systems from the same manufacturer are available, exact same UX pattern as the admin Implant Database chip from iter-180.

- **Pure visual indicator** (View + Text, not interactive) — avoids button-in-button DOM nesting issues on RN-Web. Tapping the dropdown row opens the full picker as before.
- Hides automatically when the brand has only one system (no value to show "+0 …").
- Same pill style (`#E1F5FE` background, `#0277BD` text, `#81D4FA` border).
- Verified via code review — the chip pattern is identical to the proven iter-180 admin chip.
- File: `/app/frontend/app/(tabs)/implant-selection.tsx` (chip View + 2 styles).

---


## Iteration 180 (Feb 2026) — Brand count chip in Implant Database

User feedback: only saw "SPI" under Alpha Bio in admin/implant-catalog and assumed the new 7 systems were missing — actually they were just hidden behind a second-level dropdown. Added a small **"N systems"** count chip inside the brand dropdown row (between brand name and chevron) so the catalog depth is visible at a glance.

- Dynamically reflects the count for whichever brand is selected (e.g., "Alpha Bio → 9 systems").
- Disappears when no brand is picked.
- File: `/app/frontend/app/admin/implant-catalog.tsx` (chip + 2 styles).

---


## 📌 Saved for later (deferred enhancements)

- **Admin "Add Implant Size" UI** (P2) — Implant In-Charge / Administrator-only modal: type `brand / system / diameter / length` → POST to `/api/implant-library` (new endpoint) → row lands in `implant_library` without a `source` tag (so it survives every restart per iter-179). ~100 lines of frontend (modal in `/admin/implant-catalog.tsx` or a new `/admin/implant-library.tsx`) + ~25 lines of backend (new POST endpoint with role guard + duplicate check). Lets every clinician maintain niche/regional implants in the picker without redeploying. *Saved 2026-02-07 per user request — implement after multi-tenant Phase A.*

---

## Iteration 179 (Feb 2026) — Implant library: idempotent seeding (no more `drop()`)Replaced the destructive `db.implant_library.drop()` + Excel-reseed startup hook with **Python-data + idempotent upserts**. New systems are added by editing one Python file; admin-added rows survive every restart.

### Architecture
- **NEW** `/app/backend/implant_library_data.py` — single source of truth (680 rows / 50 systems / 18 brands), generated once from `implant_library_latest.xlsx` with whitespace + brand-name normalization already applied.
- Startup seed now reads `implant_library_data.SYSTEMS` + `alpha_bio_brochure_data.SYSTEM_SIZES`, then `update_one(..., upsert=True)` per natural key `(brand, system, diameter, length)`.
- Each canonical row is auto-tagged with `source: "library_master"` or `source: "alpha_bio_brochure"`. Admin-added rows (no `source`) are never wiped.
- The legacy `implant_library_latest.xlsx` file is no longer read at runtime — kept on disk for reference.

### Verified end-to-end
- 680 master + 109 brochure = **789 canonical rows**, **57 systems** (50 Excel + 7 brochure), **8 Alpha Bio systems** preserved.
- Inserted a fake admin-only row (`brand=TestVendor`) → **survived `sudo supervisorctl restart backend`** (789 → 790; only +1 admin row, no master/brochure churn).
- Tagging breakdown after restart: `library_master=680, alpha_bio_brochure=109, no source (truly admin-only)=1` — matches expectations exactly.
- Adding the next vendor (e.g., Straumann SLActive lengths or a freshly digitised Megagen brochure) is now a 5-minute task: append entries to `implant_library_data.SYSTEMS` and the next backend reload picks them up.

### Files modified
- **NEW** `/app/backend/implant_library_data.py` (~800 lines, 680 size tuples).
- `/app/backend/server.py` — replaced the ~70-line destructive XLSX-reseed block with a 30-line idempotent upsert path. `BRAND_NAME_CORRECTIONS` constant retained for potential future Excel imports but no longer used at runtime.

---


## Iteration 178 (Feb 2026) — Alpha-Bio brochure data made restart-safe

User reported the new systems were not visible in the app despite the iter-177 seed running successfully. Root cause: the backend's startup hook unconditionally **drops** the `implant_library` collection and re-seeds it from `implant_library_latest.xlsx`, wiping the 109 brochure rows on the very next restart.

### Fix
- Extended the startup seed (`server.py` ~line 12750) to **append** the brochure-derived rows (read from `alpha_bio_brochure_data.SYSTEM_SIZES`) right after the destructive Excel reseed. Excel remains canonical for the original 50 systems; Python data extends it.
- Normalized the legacy `implant_catalog_seed.ALPHABIO_SPI` constant from key/brand `"Alpha-Bio Tec|SPI"` → `"Alpha Bio|SPI"` (and the matching `STUB_KEYS` entry) so the on-startup catalog seed no longer re-introduces the `"Alpha-Bio Tec"` ghost doc on every restart.
- Deleted the leftover `Alpha-Bio Tec` brand catalog rows in MongoDB.

### Verified
- `/api/implant-library/systems`: 50 → **57 systems**, **8 Alpha Bio** (SPI + NeO CS + NeO CHC + NeO IH + ICE + ATID + DFI + NICE).
- Survives `sudo supervisorctl restart backend` (re-tested twice → still 57 / 8).
- Implant-tab UI dropdown now reads `Select Implant System (57)`.
- `/api/drilling-protocols/generate` continues to emit correct brochure sequences (NICE Ø3.5×11.5/D4 → 2.0 → 2.4 short_3mm → implant ✓).

### Files modified
- `/app/backend/server.py` — append-after-reseed block in implant-library startup hook.
- `/app/backend/implant_catalog_seed.py` — `ALPHABIO_SPI` brand/key normalized; `STUB_KEYS` entry renamed.

---


## Iteration 177 (Feb 2026) — Alpha-Bio brochure ingestion (6 systems)

Loaded the official Alpha-Bio brochure (NeO, ICE, ATID, DFI, NICE — Spiral
already covered as SPI) into the implant database with full drilling
protocols and component metadata.

### Summary
- **Brand**: `Alpha Bio` (single brand name across both `implant_library` and `implant_catalog`; existing SPI doc auto-normalized away from "Alpha-Bio Tec").
- **Systems added** (7): NeO Conical Standard Connection, NeO Conical Hex Connection, NeO Internal Hex Connection, ICE, ATID, DFI, NICE.
- **`implant_library`**: +109 (diameter, length) rows per the brochure size matrices (24 SPI rows preserved → 133 Alpha-Bio rows total across 8 systems).
- **`implant_catalog`**: 7 rich catalog docs (connection type, platform, surface treatment, features, indications, components per platform CS/CHC/IH, drilling-protocol-family pointer) + 1 shared "Surgical & Prosthetic Instrumentation" doc covering all kits (4699/4611/4612/65000-65003), drills, drivers, accessories, and torque references.
- **`DRILLING_PROTOCOLS`**: new `alpha_bio_brochure` family + `_generate_alpha_bio_brochure_protocol(...)` generator. Each system embeds its own per-(diameter, bone density) drill sequence; depth modes `full` / `short_3mm` / `cortical_only` map directly to the brochure's footnotes.
- Bone-density mapping: D1 → "Hard Bone Type I", D2/D3 → "Medium Bone Type II & III", D4 → "Soft Bone Type IV" (matches brochure 3-tier model).

### Verified end-to-end
- `/api/implant-library/systems` now returns 8 Alpha Bio systems with correct diameter/length matrices.
- `/api/drilling-protocols/generate`:
  - **NeO CS Ø4.2 × 11.5 / D2** → 4 steps: 2.0 → 2.8 → 3.2 (3mm short) → implant ✓
  - **ICE Ø5.3 × 13 / D1** → 8 steps: 2.0 → 2.8 → 3.2 → 3.65 → 4.1 → 4.5 (3mm short) → 4.8 cortical pass → implant ✓
  - **NICE Ø3.5 × 11.5 / D4** → 3 steps: 2.0 → 2.4 (3mm short) → implant ✓ (CHC narrow-platform under-preparation)
- Migration is **idempotent**: re-run inserted 0 rows / skipped 109; SPI brand normalization no-op safe.

### Files added/modified
- **NEW** `/app/backend/alpha_bio_brochure_data.py` — single source of truth: system size matrices, drill sequences, catalog metadata, shared instruments doc.
- **NEW** `/app/backend/_seed_alpha_bio_brochure.py` — idempotent migration script (insert-if-missing + upsert).
- **MOD** `/app/backend/server.py` — registered 7 `DRILLING_PROTOCOLS["Alpha Bio|<system>"]` entries, new `_generate_alpha_bio_brochure_protocol(...)` generator, dispatch branch in `/api/drilling-protocols/generate`, label mappings in 2 protocol-type assignment blocks.

### How to re-run the seed (if needed)
```bash
cd /app/backend && python3 _seed_alpha_bio_brochure.py
```

---


## Iteration 176 (Feb 2026) — One-time pulse hint on case-detail progress pill

- Building on iteration 175's tap-to-scroll pill, the **first time** a user lands on a case where a phase action is in flight (Phase 1/2/3/4, pill is tappable), the pill now plays a **two-beat scale bounce** (1.0 → 1.18 → 1.0 → 1.10 → 1.0, ~840 ms after a 600 ms settle delay) so they discover the affordance without any tutorial copy.
- After the animation completes (`runOnJS` callback fires from the worklet), the flag `case_pill_hint_seen_v1` is persisted to AsyncStorage so it never plays again — discoverability without nagging.
- **Skipped on completed cases** (pill shows `Done ✓`, anchorKey is null, no bounce runs).
- **Verified via Playwright sampling at 30 ms intervals**:
  - First-time user → 29 unique transform states captured, peak scale 1.17992 then 1.10x — flag persisted to '1' afterwards.
  - Returning user (flag = '1') → 1 unique transform state, max scale 1.0 (no bounce).
  - Tap-to-scroll still works after wrapping in `Animated.View` (scrollTop 0 → 1797 ✓).

### Files modified
- `/app/frontend/app/procedures/[id].tsx` — added `react-native-reanimated` imports + `AsyncStorage`, added `pillScale` shared value + animated style, added `useEffect` that runs the gated bounce sequence when `procedure.status` indicates an active phase, wrapped the existing `TouchableOpacity` in `<Animated.View style={pillAnimatedStyle}>`, and added a top-level `persistPillHintSeen` JS-thread helper invoked via `runOnJS`.

---


## Iteration 175 (Feb 2026) — Case-detail progress pill: tap-to-scroll

- The `Phase X ›› Phase Y` progress pill in the case-detail header is now a **tappable shortcut** that smoothly scrolls the page to the current phase's full-data section (Phase 1/2/3/4). On a `completed` case the pill shows `Done ✓` and tap is a deliberate no-op.
- **Why this was hard on RN-Web**: (a) `<ScrollView nativeID>` is not propagated to the inner DOM scroll div by react-native-web, (b) bare `data-testid` props on `<View>` are stripped — the codebase's convention is `testID` + `data-testid` (RN-Web translates `testID` → `data-testid`), and (c) `scrollTo({ behavior: 'smooth' })` is silently no-op on containers with `-webkit-overflow-scrolling: touch`.
- **Solution**:
  1. Walk DOM up from the pill itself to locate the actual scroll container (RN-Web wraps `ScrollView` in multiple divs; the inner one with `overflow-y: auto` is the real scroller).
  2. Phase sections were already keyed by `data-testid="phaseN-full-data-section"` — added the missing `testID` prop so RN-Web actually emits the attribute, plus added a `phase1-full-data-section` testID for Phase 1 patient info.
  3. Compute scroll target via `getBoundingClientRect()` — robust to current scroll position and parent layout.
  4. Animate using `requestAnimationFrame` + `easeOutCubic` (250–550 ms) by directly assigning `scrollTop`. Programmatic `scrollTo({behavior:'smooth'})` was unreliable on this container.
- Native (iOS/Android) path uses `mainScrollRef.current.scrollTo({y, animated: true})` with `onLayout`-captured y values for each phase section.
- **Verified via Playwright**: pending_phase2 case → scrollTop went from 0 → 1797 px (Phase 2 — Implant Surgery section is at offset 1942 px, header offset 80 px ⇒ 1797 ✓). Re-tap is idempotent. Completed case shows `Done ✓` and tap doesn't crash.

### Files modified
- `/app/frontend/app/procedures/[id].tsx` — replaced the unreliable progress-pill tap handler with a DOM-walk + rAF-based scroll. Added `testID` (alongside existing `data-testid`) to all 4 phase full-data section Views and added a Phase 1 testID + onLayout anchor.

---


## Iteration 174 (Feb 2026) — Role-aware "What's New" badge copy

- Backend now exposes `roles` (nullable) on each `/whatsnew` entry so the frontend can detect role-targeting without re-fetching.
- `WhatsNewBadge` reads the current user's role and applies a **safety-first rule**: copy reads "What's new for {RolePlural} N ›" **only when every** unseen entry's `roles` array includes the user's role. Otherwise stays generic ("What's new N ›").
- Plural map: Students / Supervisors / In-Charges / Nurses / Admins.
- Verified via curl + screenshot — Supervisor with mixed unseen entries (universal v1.4 + supervisor-targeted v1.3) correctly renders generic copy. Activates role-aware copy only when entries are all-targeted.

### Files modified
- `/app/backend/server.py` — `_entries_for_user()` now includes `roles` field in returned entries.
- `/app/frontend/components/WhatsNewBadge.tsx` — pulls user from `useAuth`, computes `forRolePlural` from entries, dynamically pluralises label.

---

## Iteration 173 (Feb 2026) — What's New badge on dashboard

- Added compact `WhatsNewBadge` pill in the dashboard header — visible only when there are unseen changelog entries (server-side filtered by `last_seen_whatsnew_version` and role).
- Tapping the pill opens `/whatsnew`; `useFocusEffect` re-fetches on dashboard re-focus so the badge auto-clears the moment the user reads the entries.
- **Behaviour change**: removed the post-login auto-redirect to `/whatsnew` (login.tsx + help-workflow.tsx) — the badge is now the **single, non-intrusive** surface for new entries. Users land directly on the dashboard after login; they choose when to read what's new.
- Smoke-tested via Playwright: badge displays "What's new 2 ›" for the test student after resetting `last_seen_whatsnew_version`.

### Files added
- `/app/frontend/components/WhatsNewBadge.tsx` — reanimated v4 spring scale-in, sparkles icon, count chip; renders null when count = 0.

### Files modified
- `/app/frontend/app/(tabs)/dashboard.tsx` — imported + placed `<WhatsNewBadge />` under role tag in `Header`.
- `/app/frontend/app/auth/login.tsx` — dropped the `/whatsnew` auto-redirect after login.
- `/app/frontend/app/help-workflow.tsx` — dropped the `/whatsnew` auto-redirect after first-run "Got it".

---

## Iteration 172 (Feb 2026) — Elegant onboarding v2 + refreshed How-It-Works

### A. Six-slide first-run onboarding (`/onboarding`)
Replaced the 3-slide placeholder with a polished, role-aware carousel using **react-native-reanimated v4** for purposeful micro-animations:

| # | Slide | Highlights |
|---|---|---|
| 1 | Welcome | Soft scale-in hero logo, role chip, one-line value prop tailored per role (Implant In-Charge / Supervisor / Student / Nurse / Administrator) |
| 2 | 4-phase lifecycle | Animated horizontal timeline — coloured icon nodes + line draw-in stagger; role-specific footer chip |
| 3 | Two approvals at every gate | Animated three-tile diagram (Student → Supervisor → In-Charge) with **"That's you"** glow ring on the user's own role |
| 4 | Implant Database & Smart Selection | Two-card layout (30+ systems, components, datasheets, AI extracts // Suggest Me / Let Me Choose / safety chips / bridge-cantilever) |
| 5 | Drilling Protocol PDF + Implanr AI | PDF mock with "stamping" CBCT-QR badge + word-by-word AI typing bubble (static deterministic sample) |
| 6 | Forum & Chat + your routine | Discussion Forum + Group Chat cards + role-specific 3-line recap with green checkmarks |

### B. Refreshed Help Workflow (`/help-workflow`)
Above the existing per-role flowchart we kept, three new sections were appended:
- **Approval gates at a glance** — embeds the same `ApprovalGateDiagram` primitive so the user always sees their role glow
- **Smart tools you'll use every day** — 8-tile grid (Implant Database, Smart Selection, Drilling Protocol PDF, Implanr AI, Discussion Forum, Group Chat, HIPAA Safeguards) using the reusable `FeatureCard` primitive
- **Replay the welcome tour** button — re-opens `/onboarding` for any user, anytime

### C. Versioning hook (auto-replay on content updates)
- New backend field `User.workflow_seen_version: int` returned by `GET /auth/me`
- `POST /auth/me/ack-workflow` now accepts `{version}` body and writes both `workflow_seen_at` + `workflow_seen_version`
- Frontend constant `ONBOARDING_VERSION = 2` in `components/onboarding/content/onboardingContent.ts`
- Login gate now triggers onboarding when **either** `workflow_seen_at` is null **or** `workflow_seen_version < ONBOARDING_VERSION` — bumps the constant on future content updates and existing users automatically see the new slides on next login

### D. Accessibility
- Respects OS-level `prefers-reduced-motion` → instant fade-in instead of scale animations
- `data-testid` on every interactive element (`onboarding-next-btn`, `onboarding-skip-btn`, `onboarding-slide-{n}`, `help-approval-gates`, `help-smart-tools`, `help-replay-onboarding`)

### Files added
- `/app/frontend/components/onboarding/content/onboardingContent.ts` — single source of truth for role copy + ONBOARDING_VERSION
- `/app/frontend/components/onboarding/primitives/AnimatedTimeline.tsx`
- `/app/frontend/components/onboarding/primitives/ApprovalGateDiagram.tsx`
- `/app/frontend/components/onboarding/primitives/FeatureCard.tsx`
- `/app/frontend/components/onboarding/primitives/PdfWithQrMock.tsx`
- `/app/frontend/components/onboarding/primitives/TypingBubble.tsx`

### Files modified
- `/app/frontend/app/onboarding.tsx` — full rewrite (was 4-slide placeholder)
- `/app/frontend/app/help-workflow.tsx` — appended Approval Gates + Smart Tools + Replay sections
- `/app/frontend/app/auth/login.tsx` — version-aware gate import + check
- `/app/frontend/contexts/AuthContext.tsx` — `workflow_seen_version` field, `ackWorkflow(version)` signature
- `/app/backend/server.py` — `User.workflow_seen_version` field + version-accepting ack-workflow endpoint

### Verification
- All 6 slides smoke-tested via Playwright on mobile viewport (480×1000) — render + animations work cleanly on web
- Help Workflow new sections render with the user's role correctly glowing (`Student` for Gaurav.pandey)
- Backend smoke test: `POST /auth/me/ack-workflow {version: 2}` returns `{workflow_seen_at, workflow_seen_version: 2}` ✅

---

## Iteration 171 (Feb 2026) — Legal docs & in-app legal screens

### A. Comprehensive legal content drafted (markdown — for website + counsel review)
Four documents saved at `/app/memory/legal/`:
- **PRIVACY_POLICY.md** — 15 sections, India-first (DPDP Act 2023) + HIPAA-aligned + GDPR-ready. Covers data collected, lawful bases, sub-processors (Mongo, S3, Twilio/MSG91, Stripe, OpenAI/Anthropic via Emergent LLM, APNs/FCM, Sentry, Expo), AI-no-training clause, retention (10y clinical / 6y audit / 35d backups), Data Principal rights, children's privacy, cookies, contact + Grievance Officer.
- **TERMS_OF_SERVICE.md** — 19 sections, B2B SaaS for India. Eligibility, 14-day free trial + 7-day grace, 0% GST on dental services / 18% GST on SaaS, acceptable use, Customer Content ownership, AI as decision-support only ("Not a medical device"), IP, sub-processors, 99.5% uptime target, suspension/termination with 30-day data retention, disclaimers, liability cap (12 months of fees), indemnification, force majeure, India arbitration (Pune/Mumbai seat).
- **DPA.md** — Data Processing Addendum. Roles (Customer = Controller, Implanr = Processor for PHI), authorised sub-processors with 30-day notice + objection right, GDPR SCCs Module 2 + UK Addendum incorporated, security measures table mapped to HIPAA § 164.312 Technical Safeguards, 48-hour breach notification, 6-hour CERT-In reporting under IT Act 2000, audit rights, return/deletion on termination. Includes Annex A (TOMs), Annex B (Sub-processors), Annex C (SCCs).
- **COOKIE_NOTICE.md** — 14 sections. Strictly necessary (session, CSRF, last_activity, fingerprint hash) + functional (theme, lang, tenant_pref) + opt-in performance & analytics. No advertising / retargeting / social trackers. iOS App Tracking Transparency compliance. GPC signal honoured.

All files contain placeholders in `[BRACKETS]` for legal entity name, CIN, GSTIN, registered address, and email aliases (privacy@, grievance@, security@, legal@, support@) — must be filled in before publishing.

**Disclaimer**: drafts authored by Implanr engineering as a strong starting point. Must be reviewed by qualified Indian legal counsel (and any foreign counsel for jurisdictions targeted) before publishing on website / App Store / Play Store.

### B. In-app legal screens rewritten + new Cookie Notice screen
- `/app/frontend/app/legal/privacy-policy.tsx` — replaced placeholder content with comprehensive 15-section version mirroring the markdown master. Now includes cross-links to Terms and Cookie Notice.
- `/app/frontend/app/legal/terms.tsx` — replaced placeholder with 20-section version (acceptance, definitions, eligibility, free trial, acceptable use, Customer Content, AI features, privacy/DPA, IP, third-party services, SLAs, suspension, disclaimers, liability cap, indemnification, force majeure, governing law, changes, miscellaneous, contact). Cross-links to Privacy and Cookie Notice.
- `/app/frontend/app/legal/cookie-notice.tsx` (new) — 14-section in-app notice with the 4 cookie categories (strictly necessary / functional / opt-in performance / opt-in analytics), browser controls, GPC signal handling, mobile ATT compliance.

### C. Sign-up consent checkbox on Register screen
Replaced the implicit "By registering you agree" footer with an explicit, GDPR / DPDP-grade consent checkbox:
- Checkbox state `consentAccepted` defaults to `false`.
- Register button is **disabled** (greyed out) until the checkbox is ticked.
- On submit, a guard alerts "Consent Required" if unchecked.
- Label reads: "I confirm I am 18+ and agree to the Terms of Service, Privacy Policy and Cookie Notice." with all three terms tappable to open the respective screen.
- Test IDs: `register-consent-checkbox`, `register-terms-link`, `register-privacy-link`, `register-cookies-link`, `register-submit-btn`.

### Files touched
- `/app/memory/legal/PRIVACY_POLICY.md` (new)
- `/app/memory/legal/TERMS_OF_SERVICE.md` (new)
- `/app/memory/legal/DPA.md` (new)
- `/app/memory/legal/COOKIE_NOTICE.md` (new)
- `/app/frontend/app/legal/privacy-policy.tsx` (rewrite)
- `/app/frontend/app/legal/terms.tsx` (rewrite)
- `/app/frontend/app/legal/cookie-notice.tsx` (new)
- `/app/frontend/app/auth/register.tsx` — added consent checkbox state + disabled-button + Cookie Notice link.

### Verification
- Smoke screenshot of `/legal/cookie-notice` rendered all 14 sections cleanly.
- Smoke screenshot of `/auth/register` shows the checkbox unchecked and the Register button disabled.
- Metro bundle compiles successfully after `supervisorctl restart expo`.

### What still needs the user
- Fill in `[BRACKETED]` placeholders (legal entity name, CIN, GSTIN, registered address, email aliases, domain `implanr.com/legal/...` paths) across all four markdown files.
- Have all four documents reviewed by Indian legal counsel before publishing.

---

## Iteration 170 (Feb 2026) — Catalog dropdown stability + Refirm visibility

### Two issues, both frontend
1. **Refirm not visible**: The DB had Refirm with 37 components, the API returned it correctly (verified via curl — 12 brands incl. Refirm). The user's iOS Expo Go bundle was simply stale; reloading would have shown it. No code change required.
2. **Brand / family / variant dropdown felt unstable**: Two distinct bugs.

### Bug A — Picker modal dismissed itself when tapping rows
The picker `Modal` used `<TouchableOpacity activeOpacity={1} onPress={() => setPickerKind(null)}>` as the root container — meaning the entire modal (backdrop + card + FlatList rows) was a single tappable surface that closed the modal. Taps on the row's inner `TouchableOpacity` sometimes bubbled up to this outer one (especially on iOS Expo Go after the iter-165 nested-touchable change for the brand-delete trash icon), dismissing the picker before the row's `onPress` fired.

**Fix**: split the backdrop and the card into siblings inside a non-tappable `View`. The backdrop is a `Pressable` filling the absolute area BEHIND the card. The card is a sibling `View` with `onStartShouldSetResponder={() => true}` so taps inside the card never bubble out.

### Bug B — `focusKey` effect re-applied selection on every `systems` re-render
The iter-162 effect that restores selection after a save had `[focusKeyParam, systems]` deps. Whenever `systems` re-rendered (pull-to-refresh, network refetch), the effect re-fired and snapped the brand/family/variant back to the just-edited record — cancelling the user's mid-flight dropdown choice.

**Fix**: added `appliedFocusKey: useRef<string | null>(null)` — once a given `focusKeyParam` value is consumed, it's not re-applied unless the URL param itself changes.

### Files touched
- `/app/frontend/app/admin/implant-catalog.tsx` — Pressable backdrop + sibling card with responder gate; added `appliedFocusKey` ref to the focus-restore effect; added `Pressable` to imports.

---


## Iteration 169 (Feb 2026) — Refirm catalog seeded + auto-logout HIPAA fix

### A. Refirm Implant System seeded (PDF-extracted)
Brochure `Refirm Catalog V1.0.pdf` extracted via `extract_file_tool` and persisted as a curated record. 37 components covering: cover screws, healing abutments (5 GH), sub-crestal healing, straight + sub-crestal + 15°/25° angular final abutments, 4 ti-base variants (with-hex / without-hex / sleeved), scan bodies (single + multi-unit), 6 impression coping variants, 2 analogs, 5 prosthetic screws, 3 OD-Pro overdenture abutments (GH 2.2 / 3.0 / 4.0), and 6 multi-unit abutments at 0° / 17° / 30° / 45° / 52° / 60°. 12 manufacturer features captured (Grade-23 Ti, hybrid taper body, 11.5° conical platform-switched connection, etc.).

GH values are CUFF / gingival-collar heights only — total component height was deliberately excluded per the iter-166 convention.

Files: `/app/backend/refirm_catalog.py` (new); imported into `implant_catalog_seed.py` and appended to `CATALOG_EXTRA`. Restart-safe — verified across `supervisorctl reload`.

### B. Auto-logout firing during active use — HIPAA fix
**Root cause**: `_layout.tsx` ActivityTracker used `onStartShouldSetResponderCapture` / `onMoveShouldSetResponderCapture`. These hooks DO NOT fire when an inner `ScrollView` / `TextInput` / `Button` consumes the responder (which is most of the app). So when users were scrolling the Implant Catalog, typing in the editor, or interacting with most native components, the inactivity timer was never reset and the 15-minute idle countdown ran from the moment of login regardless of activity.

**Fix (two layers)**:
1. `utils/api.ts` — added `_onActivity` registry + a request interceptor that calls `_onActivity()` on every authenticated API call. Any backend interaction is irrefutable proof the user is active.
2. `contexts/AuthContext.tsx` — registers the activity callback at mount: `setOnActivity(() => { lastActivityRef.current = Date.now(); })`.
3. `app/_layout.tsx` — added `onTouchStart` (which DOES fire on every touch, even when the gesture is consumed downstream) alongside the existing responder hooks. Belt-and-suspenders.

**HIPAA confirmation**: 45 CFR § 164.312(a)(2)(iii) requires an automatic logoff after a period of inactivity. Industry consensus (and the ONC's HIPAA security guidance) places this at 10–15 minutes for shared/clinical devices. Implanr's 15-minute idle policy is preserved — what changed is that "idle" is now correctly measured from the user's last interaction (touch OR backend call) rather than from login. After this fix:
- Active use (scrolling, typing, opening a procedure) keeps the session alive indefinitely.
- True 15-minute idle (phone screen off, app backgrounded but not killed, no API calls and no touches) → session ends, user is forced to re-authenticate.

### Files touched
- `/app/backend/refirm_catalog.py` (new)
- `/app/backend/implant_catalog_seed.py` — Refirm import + appended to CATALOG_EXTRA.
- `/app/frontend/utils/api.ts` — `setOnActivity` + request interceptor hook.
- `/app/frontend/contexts/AuthContext.tsx` — register activity callback.
- `/app/frontend/app/_layout.tsx` — `onTouchStart` belt-and-suspenders.

---


## Iteration 168 (Feb 2026) — Per-component pencil/Done in editor (Option A, level 2)

### Goal
Within the Components section of the catalog editor, each individual component (Cover Screw, Healing Abutment, Multi-Unit Abutment, etc.) becomes its own collapsible card with a pencil + trash. Pencil expands JUST that component into edit fields; Done collapses it back and silent-saves.

### Implementation
File: `/app/frontend/app/admin/implant-catalog-edit.tsx`
- New state `editingCompIdx: Set<number>` — tracks which components are currently in edit mode. Multiple can be open simultaneously.
- `addComponent()` now opens the new card in edit mode automatically (so the user can fill it in immediately).
- `removeComponent(idx)` re-keys the editing-set indices to stay consistent.
- Each component row in the Components section now renders:
  - **Read-only mode (default)**: subtype-or-type name + "Cuff (GH): X, Y mm" subtitle on a second line. Pencil icon (blue) + trash icon (red) on the right.
  - **Edit mode**: same fields as before (Type chips, Subtype, Cuff/GH, Angulations, Retention, Material, Indication, Notes) + green "Done" button replacing the pencil. Done calls `persist({silent: true})` then closes the card.
- "Add component" button stays at the bottom of the section.
- Section-level pencil retained per user request 1b (so on big systems like MIS LANCE+ with 55 components, you can still collapse the whole section).
- New styles: `compSummarySub`, `compIconBtn`, `compDoneBtn`, `compDoneBtnText`. Header row uses `gap: 8` so pencil + trash sit cleanly to the right.

### Verified
- ESLint passes on the modified file.
- File contents verified at expected lines (state hook at L136, render block at L426, new styles at L662).
- Web preview's SSR layer is caching an older bundle (known Expo Router web-preview quirk), but iOS Expo Go uses Metro with hot reload and will pick up the change on the next refresh.

### Files touched
- `/app/frontend/app/admin/implant-catalog-edit.tsx` — per-component state + render + styles.

---


## Iteration 166 (Feb 2026) — Brochure ingestion + permanent Cuff-Height (GH) convention

### Why
User uploaded prosthetic-system PDFs (e.g., Cowell Mini Plus brochure) and wanted Ask Implanr to answer questions directly from those PDFs. Crucial clinical safety: many brochures list both "GH / cuff height" AND "total component height". Implanr must always treat **gingival_heights_mm = cuff height (GH) only**, never the total height.

### Implementation
1. New `/app/backend/implanr_conventions.py` — single source of truth. Exports `DATA_CONVENTIONS_BLOCK` describing:
   - GH = cuff height = gingival collar height = transmucosal height (4 synonyms → one field)
   - Explicit rule: total / overall / abutment height NEVER goes into `gingival_heights_mm`
   - No-fabrication rule, diameter / length conventions
2. Server `ai_ask_implanr` now prepends the conventions block to BOTH the system message and the user prompt, and renames the structured-output line `Gingival height (mm)` → `Cuff height / GH (mm)`.
3. Server `upload_catalog_attachment` runs `PyPDF2.PdfReader` at upload time to extract searchable text (cap 60 pages, 60 KB chars), saves to `catalog_attachments.extracted_text`, and stamps `has_extracted_text` on the per-system attachment list.
4. `ai_ask_implanr` pulls `extracted_text` for the scoped system (≤10 attachments, ≤12 KB total) and injects it as a "MANUFACTURER BROCHURE EXCERPTS" block, with a rule: prefer structured data, add "Brochure detail: …" for additional information.
5. Frontend label updates: editor field → "Cuff height / GH (mm) — CSV" with hint "(gingival collar / GH only — NOT total component height)"; detail card row → "Cuff height (GH)".

### End-to-end verified
- Generated a real-text PDF with both `GH (Gingival Cuff Height): 0.5, 1.0, 2.0, 3.0, 4.0 mm` and a deliberately-misleading `Total component height (overall): 7.0 mm`.
- Uploaded → `extracted_text` = 505 chars, contained both `GH` and the unique `UNIQUE_TEST_TOKEN_ZX9` marker.
- Asked AI a brochure-only question → AI quoted the cutting-grooves detail directly from the brochure.
- Asked AI for GH values → AI correctly used the 0.5–4.0 mm cuff range and explicitly labeled the 7 mm total as "informational only, not GH". Convention upheld.

### Answer to user's launch-time question
PDF text extraction is purely deterministic (PyPDF2, runs locally on the backend with no LLM, no network) — it works identically in production. New uploads after launch are auto-indexed the moment they reach the server. For scanned / image-based PDFs (where PyPDF2 returns no text), we can add OCR via a vision LLM later — but most manufacturer brochures are text-based and work today.

### Files touched
- `/app/backend/implanr_conventions.py` (new — single source of truth)
- `/app/backend/server.py` — upload extracts text; AI prompt prepends conventions + injects brochure excerpts; "Cuff height / GH" label.
- `/app/frontend/app/admin/implant-catalog-edit.tsx` — Cuff/GH label + hint.
- `/app/frontend/app/admin/implant-catalog.tsx` — detail-card "Cuff height (GH)" row.

---


## Iteration 165 (Feb 2026) — Catalog: section-level edit/delete + attachments

### Goals
1. Add Edit/Delete UI for any implant company, system or variant — accessible to In-Charge / Administrator only, audit-logged.
2. Convert the editor to a per-section pencil flow (Option A) so each box is read-only by default and admins enter edit mode per section with a "Done" button.
3. Add a paperclip-style attachment uploader on the editor (PDFs + images, multi-file) backed by Emergent object storage.

### Backend
New file `/app/backend/object_storage.py` — thin wrapper on Emergent's `objstore/api/v1/storage` (lazy-init session storage_key, `put_object` / `get_object` with 403 retry).

New endpoints in `server.py` (all admin/in-charge gated, audit-logged):
- `DELETE /api/implant-catalog/by-key?key=...` → delete one system/variant; soft-deletes its attachments first.
- `DELETE /api/implant-catalog/by-brand?brand=...` → cascade-delete an entire company and all its systems.
- `POST   /api/implant-catalog/by-key/attachments?key=...` (multipart) → upload PDF/PNG/JPEG/WEBP/GIF up to 25 MB; appended to `implant_catalog.attachments`.
- `DELETE /api/implant-catalog/by-key/attachments/{att_id}?key=...` → soft-delete an attachment ($pull from doc + flag in `catalog_attachments`).
- `GET    /api/implant-catalog/attachments/{att_id}/download` → authenticated download; supports both `Authorization: Bearer` header and `?auth=<token>` query param so `<a href>` / `<img src>` can fetch without setting headers.

Audit actions: `catalog.delete_system`, `catalog.delete_brand`, `catalog.attachment.upload`, `catalog.attachment.delete`, `catalog.attachment.download`.

### Frontend
`/app/frontend/app/admin/implant-catalog-edit.tsx` — full rewrite to Option A:
- Each section (Identity, Connection, Features, Implant Specs, Components, Compatibility Notes) renders a read-only summary by default with a pencil button. Pencil → expand fields → Done → silent PUT → collapse.
- Top header: Create button (new mode) OR red Delete System button (edit mode).
- New Attachments section — paperclip "Attach" button calls `showUploadPicker(['application/pdf','image/*'])` and posts as multipart. Each attachment renders with file icon, name, size, uploader, and a trash icon for soft-delete.

`/app/frontend/app/admin/implant-catalog.tsx`:
- New `Delete` button (red trash) next to Edit on the detail card.
- Brand picker rows now show a small trash icon (admin only) → company-level cascade delete with confirmation.
- All deletions go through the new endpoints above and refresh the catalog after.

### Verified (curl + screenshot)
- DELETE by-key works, returns `{deleted:1, key}`. Non-admin → 403.
- DELETE by-brand cascades 2 test systems, returns `{deleted:2, keys:[...]}`. Non-existent brand → 404.
- Attachment upload (PDF) succeeds, doc receives `attachments[]` entry, download with header AND `?auth=` both return 200 and bytes match the source MD5. Soft-delete removes from doc + sets `is_deleted=true` in `catalog_attachments`.
- Audit log entries created for every delete/upload/download.
- Web preview renders the catalog screen with 38 systems (39 → 1 test brand cleanup) and no JS errors.

### Files touched
- `/app/backend/object_storage.py` (new)
- `/app/backend/server.py` (5 new endpoints + helper)
- `/app/frontend/app/admin/implant-catalog-edit.tsx` (rewrite)
- `/app/frontend/app/admin/implant-catalog.tsx` (delete handlers + brand-picker trash + styles)

---


## Iteration 164 (Feb 2026) — Catalog deduplication + obsolete record cleanup

### Audit
Audited all 42 catalog records across 13 brands for true and visual duplicates (same brand + same `name` field, case-insensitive). Found:
- **1 true duplicate**: `Bredent|Blue Sky` (29 comp, seed) and `Bredent|blueSKY` (2 comp, manual edit) — both display as `blueSKY` in the dropdown.
- **1 obsolete generic placeholder**: `Cowell Medi|INNO SLA-SH` (8 comp) — superseded by the iter-162 PDF-extracted `INNO Submerged / Submerged Narrow / Internal / External / Mini Plus` records (31 comp each).
- **1 leftover test artifact**: `TEST_Brand|TEST_System` (1 comp).

BioHorizons `Tapered Pro` (47 comp) and `Tapered Pro Conical (RBT)` (44 comp) were investigated and confirmed as **distinct products**, not duplicates — no action taken there. Any 11-component "ghost" version reported by the user was not present in the live DB; likely a stale cached view that will resolve once the iter-163 router-replace fix lands on Expo Go.

### Cleanup applied (per user confirmation)
1. Deleted `Bredent|blueSKY` (kept `Bredent|Blue Sky`, the higher-comp record).
2. Deleted `Cowell Medi|INNO SLA-SH`. Also removed `COWELL_INNO_SLA_SH` from the `_cowell()` definitions, `CATALOG_EXTRA`, and `STUB_KEYS` in `implant_catalog_seed.py` so it doesn't get recreated on restart.
3. Deleted `TEST_Brand|TEST_System`.

### Verified
- Deletions persist across `supervisorctl restart backend` (no stub re-seeding).
- Total catalog: 42 → **39 records**, 13 → **12 brands** (`TEST_Brand` removed).
- Cowell Medi: 6 → **5 systems** (Internal, External, Submerged, Submerged Narrow, Mini Plus).
- Bredent: 6 → **5 systems** (Blue Sky 29 comp, Sky Classic 29, Mini 2 Sky 7, Copa Sky 6, Narrow Sky 9).

### Files touched
- `/app/backend/implant_catalog_seed.py` — removed `COWELL_INNO_SLA_SH` definition + references.

---


## Iteration 163 (Feb 2026) — Fix: catalog edits not visible after Save on iOS Expo Go

### Bug report
Implant In-Charge tapped Edit on a Cowell record → changed a field → "Saved" alert shown → returned to catalog screen → field unchanged. Backend PUT was verified working via curl as `Abhijit.patil` (role `implant_incharge`) — value persisted with `updated_by="Dr. Abhijit Patil"` and was returned on a fresh GET. So the issue was purely frontend: the catalog screen did not refresh after `router.back()` from the editor.

### Root cause
The previous iter-160 fix relied on `useFocusEffect` to refetch when the catalog screen regained focus. On iOS Expo Go, the focus event is unreliable when an `Alert.alert(...)` is dismissed mid-navigation (the alert's UIKit modal dismissal can swallow the focus event from React Navigation), so `load()` was never re-fired. Web/curl always worked because focus events are deterministic there.

### Fix (deterministic refresh + re-selection)
1. `implant-catalog-edit.tsx#save()` — after a successful PUT, navigate via `router.replace({ pathname: '/admin/implant-catalog', params: { refresh: <ts>, focusKey: <key> } })` instead of `router.back()`. The new `refresh` timestamp param is unique per save → guaranteed to trigger a re-render of the catalog screen.
2. `implant-catalog.tsx`:
   - `useLocalSearchParams<{refresh?: string, focusKey?: string}>` — read the params.
   - `useEffect([refreshParam, user, load])` — explicit `load()` whenever a fresh `refresh` arrives.
   - `useEffect([focusKeyParam, systems])` — once the systems list is repopulated, re-apply the brand/family/variant selection on the just-edited record.
   - `useRef<number>(0)` skip-counter so the existing brand→family and family→variant auto-select effects don't clobber the restored selection (they decrement and short-circuit twice).
3. The original `useFocusEffect` is kept as a baseline for non-save navigations (e.g., user opens editor, hits Back without saving).

### Verified
- Backend round-trip via curl: PUT `/api/implant-catalog/by-key?key=MIS|LANCE+` updated `compatibility_notes`, `updated_by` flipped to `Dr. Abhijit Patil`, GET returned the new value, components count preserved (55).
- Web preview: catalog screen renders with `+` button (canEdit gate) and 40 systems loaded for `implant_incharge` user. Lint passes on both files.
- Action required from user: **reload the Expo Go app** to pick up the new JS bundle.

### Files touched
- `/app/frontend/app/admin/implant-catalog-edit.tsx` — replaced `router.back()` with `router.replace(... params)`.
- `/app/frontend/app/admin/implant-catalog.tsx` — added `useRef`, `useLocalSearchParams`, `refresh`/`focusKey` effects + skip-counter on auto-select.

---


## Iteration 162 (Feb 2026) — Cowellmedi / MIS LANCE+ / Osstem rich prosthetic catalogs (restart-safe)

### Goal
Add detailed, restart-resilient prosthetic component catalogs for Cowellmedi (INNO Submerged, INNO Submerged Narrow, INNO Internal, INNO External, Mini Plus), MIS LANCE+, and the Osstem family (TS III, TS IV, SS III, MS, ETIII NH).

### Implementation
1. New module `/app/backend/iter162_catalog.py` holds:
   - Component arrays — `COWELL_COMPONENTS` (31), `OSSTEM_INTERNAL_HEX_COMPONENTS` (24), `OSSTEM_OCTA_COMPONENTS` (9), `OSSTEM_MS_COMPONENTS` (3), `MIS_LANCE_COMPONENTS` (55).
   - Pre-built curated records `COWELL_NEW_RECORDS` for the three new Cowell keys (Submerged / Submerged Narrow / Mini Plus).
   - `apply_iter162_overrides(...)` that mutates the existing curated records to upgrade their `components` / `features` / `compatibility_notes` / `implant` fields.
2. `/app/backend/implant_catalog_seed.py` now calls `apply_iter162_overrides(...)` immediately after defining the base curated dicts, then extends `CATALOG_EXTRA` with `*COWELL_NEW_RECORDS`. The startup seeder picks the rich data up automatically on every restart — admin manual edits remain protected via `updated_by != "seed"` short-circuit.
3. `/app/backend/_seed_iter162.py` was rewritten to a thin pointer that re-uses the canonical seed pipeline (kept only as an emergency one-shot).

### Verified
- Module-level dicts now report rich counts: TS III=24, TS IV=24, SS III=9, MS=3, ETIII NH=24, MIS|LANCE+=55 with 6 features, and Cowell INNO Internal/External/Submerged/Submerged Narrow=31, Mini Plus=6.
- DB confirmed via direct `pymongo` query and via API (`GET /api/implant-catalog/by-key?key=...`) for Mini Plus, MIS|LANCE+, TS IV.
- Backend full restart (`supervisorctl restart backend`) → all 11 records re-seeded with `updated_by="seed"`, no regressions on Nobel/Neodent/BioHorizons/Ankylos.

### Files touched
- `/app/backend/iter162_catalog.py` (NEW)
- `/app/backend/implant_catalog_seed.py` — imports + applies overrides + extends `CATALOG_EXTRA`.
- `/app/backend/_seed_iter162.py` — replaced with deprecated thin pointer.

---


## Iteration 161 (Feb 2026) — Catalog editor: refresh on save + lossless component round-trip + missing edit button styles

### Bug: "Save is clicked, the changed data is not reflected"
Root cause was three-fold:
1. **Stale list cache** — after the editor saved and `router.back()` returned to the catalog browser, the browser's data was still the cached state from first mount; no refetch happened.
2. **Lossless field stripping** — the editor only renders 8 fields per component (type, subtype, gingival_heights, angulations, retention, material, indication, notes). When it serialized state back to PUT, every other field on the component (`platforms_mm`, `torque_ncm`, `cad_cam`, `lengths_mm`, `platforms_diam_mm`, ...) was dropped because the editor rebuilt each component from local form state. Backend used `$set: body` which replaced the whole `components` array — so seeded rich data was wiped on every save.
3. **Missing styles** — `editBtn` / `editBtnText` were referenced in JSX but the StyleSheet entries had been lost in a prior refactor (TS2339 errors).

### Fixes
1. `implant-catalog.tsx` — added `useFocusEffect(load)` so the browser refetches whenever the screen regains focus (e.g. after editor save → back).
2. `implant-catalog-edit.tsx` — `Component` type gained an `__original` field that stashes the raw component dict on load. Save merges form changes onto the original via `{ ...c.__original, ...overlay }`, preserving `platforms_mm`, `torque_ncm`, `cad_cam`, `lengths_mm`, `platforms_diam_mm`, and any other fields the editor doesn't render.
3. `implant-catalog.tsx` — added missing `editBtn` and `editBtnText` styles (light blue pill).

### RBAC clarification (asked by user)
Edits made by Implant In-Charge / Administrator write to the shared `implant_catalog` MongoDB collection with `updated_by: <user_name>`. **All users (Students, Supervisors, Nurses, In-Charges, Administrator) see the same data on next fetch — there is no per-user copy.** Future re-seeds skip records whose `updated_by != "seed"`, so manual edits are protected from being overwritten.

### Verified
- Backend PUT round-trip via curl → 200 OK, `compatibility_notes` updated, `updated_by` set to `Dr. Abhijit Patil`, `is_stub` correctly remained `false`.
- Drive GM Acqua restored from seed (60 components) after the test PUT was reverted.
- `useFocusEffect` triggers a fresh `GET /implant-catalog` on every screen focus → user immediately sees their changes.

### Files touched
- `/app/frontend/app/admin/implant-catalog.tsx` — useFocusEffect + missing edit-button styles.
- `/app/frontend/app/admin/implant-catalog-edit.tsx` — `__original` stash, lossless save merge.

---

## Iteration 160 (Feb 2026) — Nobel Biocare + Neodent full prosthetic catalogs

### Nobel Biocare — 47 components × 6 systems
All six Nobel systems share the **Internal Conical Connection (CC)** prosthetic ecosystem. Defined a single shared `_nobel_components(platforms_supported)` builder that emits per-platform component records, then applied to:

- `NobelActive NP` (Ø 3.0–3.5)
- `NobelActive RP` (Ø 4.3–5.0)
- `NobelActive WP` (Ø 5.5)
- `NobelParallel CC NP` (Ø 3.75)
- `NobelParallel CC RP` (Ø 4.3–5.0)
- `NobelParallel CC WP` (Ø 5.5)

Component categories:
- Cover screw, healing abutments (×5: Standard, Slim, Bridge, On1 Healing Cap, On1 IOS)
- Temporary cylinders (×6: Standard, Slim, Immediate, QuickTemp Conical, Snap, On1)
- Multi-Unit Abutments (×7: Straight, Plus snap-in, 17°, 30°, NobelZygoma 0°/45°/60°)
- Final / esthetic abutments (×7: Esthetic, Procera Esthetic, Snappy 4.0/5.5, Universal Base, GoldAdapt, Narrow Profile)
- **ASC (Angulated Screw Channel)** — 0–25° angulation for cement-free screw-retained crowns
- Ti-Base / On1 Base, scanbodies, impression copings (closed/open/low-profile/plastic/On1 IOS)
- Lab analogs, prosthetic screws, Locator® and Ball overdenture attachments

### Neodent — 60 components × 6 systems
All six Neodent GM systems share the **Grand Morse single prosthetic platform**. Defined `_neodent_gm_components()` and applied to:

- `Drive GM Acqua` / `Drive GM (NeoPoros)`
- `Helix GM Acqua` / `Helix GM (NeoPoros)`
- `Titamax GM Acqua` / `Titamax GM (NeoPoros)`

Component categories:
- GM Cover Screw (10 Ncm)
- Healing abutments (Standard + Customizable)
- Mini Conical Abutments + Click Anatomic family (Straight + 17°/30°/45° tilted)
- Universal Abutments (cement-retained, Straight + 17°/30°)
- Anatomic Abutments (anterior + Narrow + 17°)
- Specialty: Micro, CoCr, Pro PEEK, Temporary
- Ti-Bases × 7 variants (Crown, Bridge non-engaging, AS angled, C, Exact, Burn-out, Block)
- Scanbodies × 5, Impression copings × 7, Lab analogs × 6 (incl. Hybrid Repositionable)
- Provisional copings (Crown / Bridge), Esthetic Try-In family
- Overdenture: GM Equator, Novaloc Straight + Angled
- **Neodent NeoArch** — Immediate Fixed Full-Arch solution
- **Neo Abutment Protection Cylinder** — digital workflow

### Files touched
- `/app/backend/implant_catalog_seed.py` — replaced placeholder `_nobel()` and `_neodent()` helpers with full component builders. Re-seeded all 12 records.

### Verified
- `/api/implant-catalog/by-key?key=Nobel Biocare|NobelActive RP` → 47 components across 11 distinct types.
- `/api/implant-catalog/by-key?key=Neodent|Helix GM Acqua` → 60 components across 13 distinct types.
- All MOP / acetal_resin material strings normalised to "Polyoxymethylene (Acetal Resin)".

---

## Iteration 159 (Feb 2026) — Implant Database UX overhaul + BioHorizons Tapered Pro full catalog + MOP rename

### 1. Implant Database header & navigation overhaul
- **"Add Implant System" button** moved out of the body and into the header right slot as a circular blue **"+" button** (44 × 44 px), visible only to Implant In-Charge / Administrator. Frees vertical space and matches iOS conventions.
- **"Compare Across Implant Systems" tab → "Compare"** — both pills are now equal-width (max 180 px), centered, with distinct colors (Ask Implanr AI = blue, Compare = teal). Both tabs visible to all roles (Student, Supervisor, In-Charge, Administrator).
- **Brand Comparison page** title renamed: header now reads `Implant Systems Comparison` with subtitle `Compare components across different Implant Systems` (replaces the previous dynamic system-count subtitle).

### 2. Picker / dropdown copy improvements
- Brand picker modal title: `Select Brand` → `Implant Company`.
- Family picker modal title: `Select Family — <brand>` → `Implant System — <brand>`.

### 3. Keyboard handling for in-card AI input
- Wrapped the catalog detail's `ScrollView` in a `KeyboardAvoidingView` (`padding` on iOS) with `keyboardShouldPersistTaps="handled"`. The "Ask Implanr AI" text input at the bottom of the detail card now stays visible above the on-screen keyboard.

### 4. BioHorizons cleanup
- Deleted 4 stub records (`Tapered Short Conical RBT`, `Tapered IM`, `Tapered Short`, `Narrow Diameter`) — per user, BioHorizons offers only **Tapered Pro Conical RBT** and **Tapered Pro**.
- **BioHorizons|Tapered Pro** seed expanded from 8 to **47 components** (cover screw, SmartShape healers × 6 series, Laser-Lok healers × 3 emergence profiles, Standard healers × 4 emergence profiles, temporary cylinders, MUA straight + 17°/30°, Ti-Bases × 3 types, scanbodies, impression copings × 4, lab analogs × 2, castable UCLA, prosthetic screws × 3, LOCATOR R-Tx + OD Secure + Ball overdenture attachments × 3 collars). Connection: internal hex (3.0 / 3.5 / 4.5 / 5.7 mm platforms).

### 5. Material rename: POM / acetal_resin → "Polyoxymethylene (Acetal Resin)"
- Updated `implant_catalog_seed.py` everywhere "POM" or "acetal_resin" appeared (including the new BioHorizons castable UCLA entry and Bredent Sky castables).
- DB sweep confirmed zero remaining `POM` / `acetal_resin` references in any catalog record.

### Files touched
- `/app/frontend/app/admin/implant-catalog.tsx` — header refactor (+ button, Compare pill, KeyboardAvoidingView, picker labels).
- `/app/frontend/app/admin/implant-compare.tsx` — title + subtitle.
- `/app/backend/implant_catalog_seed.py` — Tapered Pro full catalog, MOP/acetal_resin rename, removed BioHorizons stubs.

### Outstanding from the user's iter-159 request
- **Nobel Biocare** prosthetic catalog seeding from uploaded PDF — pending (needs separate seeding pass; PDF parsed but full structured seed deferred to next iteration to preserve context budget).
- **Neodent** prosthetic catalog seeding from uploaded PDF — pending (same reason).

---

## Iteration 158 (Feb 2026) — Auth-gated catalog fetch, CenteredHeader rollout, administrator role restored

### 1. Fixed `403 Forbidden` spam on `GET /api/implant-catalog`
- Root cause: `ask-implanr.tsx` and `admin/implant-catalog.tsx` fired their `useEffect` fetch on mount before `AuthContext` had hydrated the user, resulting in a request with no `Authorization` header. FastAPI's `HTTPBearer` default returns 403 for missing headers, polluting the backend logs and briefly flashing an error Alert on cold start.
- Fix: Both screens now consume `useAuth()` and gate the fetch with `if (!user) return;` in the effect, re-running once the user is populated.
- Verified: `/api/implant-catalog` returns 200 with a valid token, 403 without (correct behavior preserved); no more spurious 403 log entries after login.

### 2. Applied `CenteredHeader` to remaining screens
- `/app/frontend/app/whatsnew.tsx` — history mode now uses `CenteredHeader`; onboarding mode keeps a simple title-only bar (no back button by design).
- `/app/frontend/app/forum/[threadId].tsx` — patient name centered with a right-side bookmark `rightAction`.
- `/app/frontend/app/forum/chat/[groupId].tsx` — group name + "N members • locked?" as subtitle, leave-group icon as `rightAction`.
- `/app/frontend/app/admin/implant-compare.tsx` — removed leftover undefined `BackButton` reference (TS error), replaced with `CenteredHeader title="Brand Comparison" subtitle="Side-by-side specs across N systems"`.
- Intentionally skipped: `forum/index.tsx` and `forum/chat/index.tsx` (segmented Forum/Chat pill), `forum/chat/create.tsx` (iOS-style close-modal `X`).

### 3. Administrator role restored (per user decision)
- Per the user's directive, `Dr. Abhijit Patil` (`Abhijit.patil@dental.edu`) is the sole administrator going forward.
- DB fix: `users.updateOne({username:'Abhijit.patil'}, {$set:{role:'administrator'}})`.
- `/app/memory/test_credentials.md` updated to reflect the new role.
- Verified: `/auth/me` returns `role=administrator`; `/admin/access-logs` (administrator-gated endpoint) returns 200.

### Files touched
- `/app/frontend/app/ask-implanr.tsx` — `useAuth()` + auth-gated fetch.
- `/app/frontend/app/admin/implant-catalog.tsx` — auth-gated `load()`.
- `/app/frontend/app/whatsnew.tsx` — CenteredHeader for history mode.
- `/app/frontend/app/forum/[threadId].tsx` — CenteredHeader with bookmark action.
- `/app/frontend/app/forum/chat/[groupId].tsx` — CenteredHeader with leave-group action.
- `/app/frontend/app/admin/implant-compare.tsx` — CenteredHeader, removed stale `BackButton` ref.
- `/app/memory/test_credentials.md` — administrator credentials.

---

## Iteration 152 (Feb 2026) — Brand Comparison View + Ankylos & B&B Detailed Catalogs

### 1. Brand Comparison view (new)
**Backend** (`/app/backend/server.py`):
- `GET /api/implant-catalog/compare?component_type=<type>` returns all non-stub systems containing the requested component, sorted by brand.
- `GET /api/implant-catalog/component-types` returns distinct types across non-stub systems with counts.

**Frontend** (`/app/frontend/app/admin/implant-compare.tsx`):
- New screen with horizontal chip-bar of component types (sorted by frequency).
- Per-system cards with brand · system · connection header and one row per matching component sub-entry showing Diameter / GH / Height / Angulation / Material / Retention / Torque in a wrap-grid.
- Reachable from the new teal "Compare" pill (testID `catalog-open-compare`) in the Implant Database header.

### 2. Ankylos C/X — full prosthetic catalog (44 components)
Cover screws (Standard + Membrane), Healing abutments × 6 (Regular, Standard, Balance Anterior/Posterior, Ø 4.2, Sulcus 0.0), Temporary cylinders × 2, Final abutments × 9 (Regular C/+/X full 0-37.5° set, Balance Anterior/Posterior, Standard, Balance Base, SynCone, Acuris Conometric), Cercon Balance zirconia abutment, Ti-bases C/+/X + ScanBase C/+/X, Impression copings × 6, Lab analogs × 4, Snap + Locator + 7 nylon males, Bar attachment, Prosthetic screws × 4, Standard wax-up copings × 2.

### 3. B&B Dental Conexa family — full catalog (30 shared components × 5 lines)
Cover screws, healing screws, PEEK + Ti temporary abutments, straight Ti abutments (Ø 4/5/6, H 1-9), angled Ti abutments 15°/25°/40°, UCLA Cr-Co, castable Cr-Co, Ti-base CEREC + Ti-Link 3P/EV/Wide, long + short scanbodies, closed-tray transfer + impression cap, 3D conical + flat analog, FLAT abutment for full-arch immediate load, ball abutment, MUA straight + 17°/30° + 40° angled, Mini Cone 5°, Conical Ø 3.75 in 4 angulation variants, Premilled bases.

### Verification (curl)
- Ankylos C/X → 44 components persisted, `updated_by: seed`.
- B&B Dental|3P → 30 components, `updated_by: seed`.
- `/component-types` → 14 distinct types (final_abutment 112, healing_abutment 53, multi_unit_abutment 46, ti_base 41…).
- `/compare?component_type=healing_abutment` → 37 systems comparable.
- AI scoped to Ankylos/Cercon → exact Ø 5.5/7.0, GH 6.0/6.5, 0/15°, zirconium_oxide_ceramic.
- AI scoped to B&B/EV Line angled MUA → 17°/30° + 40° structured spec blocks with exact dimensions.

### Files touched
- `/app/backend/server.py` — added `/implant-catalog/compare` + `/implant-catalog/component-types` endpoints.
- `/app/backend/implant_catalog_seed.py` — replaced Ankylos C/X components (44); added `_BB_CONEXA_PROSTHETICS` shared array (30) reused by all 5 B&B Conexa lines.
- `/app/frontend/app/admin/implant-compare.tsx` — NEW Brand Comparison screen.
- `/app/frontend/app/_layout.tsx` — registered `admin/implant-compare` route.
- `/app/frontend/app/admin/implant-catalog.tsx` — added teal Compare pill in header.

### Catalog detail status
| System | Components |
|---|---|
| BioHorizons Tapered Pro Conical RBT | 44 |
| Ankylos C/X | 44 |
| CONELOG Progressive-Line | 40 |
| B&B Conexa (EV, 3P, 3P Long, Wide each) | 30 |
| Bredent Blue Sky / Sky Classic | 29 |
| Bredent Narrow Sky | 9 |
| Bredent miniSKY | 7 |
| Bredent copaSKY | 6 |

## Iteration 150 (Feb 2026) — BioHorizons Tapered Pro Conical Comprehensive Component Database

User uploaded the official Tapered Pro Conical Surgical & Manual catalog PDF. Full prosthetic component extraction completed (surgical drills/drivers/ratchets excluded per user).

**Components seeded** (44 entries; up from 14 in iter-149):
- Cover screws (1) — CNCC, CRCC; .050" hex driver; 10-15 Ncm
- Healing abutments (4) — Regular Ø 3.0/3.8 mm × GH 2/4/6; Wide Ø 4.8/5.3 × GH 4/6; Extra-Wide Ø 5.8 × GH 4/6; SmartShape anatomic GH 3.25/3.5/5.25/5.5
- Impression copings (8) — Open-tray + closed-tray Conical Posts (Narrow + Regular + Wide); Impression Caps (POM); Bite Registration Caps (POM); Multi-unit Direct Pick-up + Indirect Transfer + Cover Cap + PEEK Contoured Cover Cap
- Analogs (3) — Conical Implant Lab Analog (single + 25-pack); Multi-unit Protection Analog; Multi-unit Abutment Replica
- Temporary cylinders (2) — Engaging (H 11.0 mm) + Non-engaging (H 11.2 mm); 20 Ncm
- Final abutments (4) — Gold-Plastic (H 11.7); Straight Esthetic GH 1.5/2.0/3.0; 15° Angled GH 1.5/3.0; 20° Angled GH 1.5/3.0
- Ti-bases (5) — Engaging Short Post (GH 4.7); Engaging Tall Post (GH 6.5); Non-Engaging (GH 4.6); CEREC-compatible; CAD/CAM Ti Blank Type IAC
- Scanbodies (3) — Conical Scanbody (CNTSB/CRTSB); CEREC Scan Post; Multi-unit Titanium Scanbody
- Overdenture attachments (2) — OD Secure (TiN coated, GH 1/2/3/4); Locator GH 1/2/3/4/5/6 (30 Ncm; nylon males)
- Multi-unit abutments (4) — Straight 0° GH 2/3/4; 17° angled GH 2/3/4; 30° angled GH 2/3/4; Try-in
- Prosthetic screws (4) — Multi-unit prosthetic (Reg/Long/Short); Angled MU screw; CAD/CAM bar screw; Direct-to-MU (zirconia/PMMA/3D-printed)
- Copings (4) — Titanium (Reg + Short); Gold castable; Plastic castable; Passive-fit (all H 7.5)

**Verification (curl)**:
- Total: 44 components persisted; `updated_by: seed`.
- AI for "multi-unit angled abutments" → 2 structured spec blocks (17° + 30°) with exact GH 2.0/3.0/4.0.
- AI for "SmartShape healer" → exact GH 3.25/3.5/5.25/5.5; platforms Narrow/Regular.
- AI for "OD Secure overdenture" → GH 1/2/3/4; titanium_alloy_TiN material; abutment_screw retention.

**Files touched**:
- `/app/backend/implant_catalog_seed.py` — replaced BioHorizons component array with 44-entry detailed list.



 AI Quality + Catalog Save Bug + Implant Database Tile + PDF Component Extraction

**User-reported issues fixed:**

1. **Save bug — admin edits being wiped on backend reload** (P0)
   - Root cause: Startup seed `_seed_implant_catalog()` re-upserted curated records on every `WatchFiles` reload, overwriting Implant In-Charge edits.
   - Fix: Seed now checks `updated_by` field — if it is a real user (not "seed"), the record is preserved. New records still seed normally; admin-edited records are now permanent across reloads. (`/app/backend/server.py` `_seed_implant_catalog`).

2. **AI answers were vague, contained markdown asterisks, used "catalog/database/uploaded data" wording** (P0)
   - Rewrote prompts in `POST /api/ai/ask-implanr` and `POST /api/ai/chat`.
   - New rules: plain text only (no `**bold**`); banned words: catalog, catalogue, database, uploaded, provided data, records, JSON; component questions emit a fixed structured block (Specification of X — Brand, Diameter (mm):, Gingival height (mm):, Angulation (deg):, Material:, Retention:, Indication:); missing data → exactly "Information is not available."; comparative questions use 2–4 numbered points.
   - Verified: Bredent Blue Sky temporary cylinders return 3 structured spec blocks with exact dimensions; "What surgical drills?" returns "Information is not available." when not on file.

3. **Keyboard overlapping AI answer** (P0)
   - `/app/frontend/app/ask-implanr.tsx`: added `keyboardVerticalOffset`, `paddingBottom: 24`, `keyboardDismissMode: on-drag`.
   - `/app/frontend/app/procedures/[id].tsx`: ScrollView ref + `onContentSizeChange → scrollToEnd`, expanded modal max height to 85%, ensured KeyboardAvoidingView fits the modal sheet.

4. **"Implant Catalog (Implanr AI)" rename + relocation** (P1)
   - Renamed to **"Implant Database"** in catalog screen header and removed entry from Profile → Compliance section.
   - Added new **Implant Database tile** in the Tile-Grid menu (`(tabs)/_layout.tsx`), amber palette `#FFF8E1 / #FFE082 / #E65100`, library icon, visible to ALL roles. Read-only enforcement remains on the catalog screen via existing `canEdit` guard (admin + implant_incharge only).

5. **Catalog data completeness — Tapered Pro Conical RBT + Bredent SKY family** (P0)
   - Extracted ALL prosthodontic components (excluding surgical drills/drivers/ratchets per user) from the two user-uploaded PDFs.
   - **BioHorizons Tapered Pro Conical RBT** — 14 detailed components: Cover Screw, Regular Healing Cap (Ø 3.0/3.8 mm, GH 2/4/6), Wide (Ø 4.8/5.3, GH 4/6), Extra-Wide (Ø 5.8, GH 4/6), Engaging + Non-engaging Temporary Cylinders (GH 1.5/3.0/4.0, 20 Ncm), Multi-unit (0/17/30°), Ti-base, Scanbody, Impression Coping (open + closed tray), Analog, Locator, Castable, Zirconia Esthetic. Platforms: Narrow + Regular.
   - **Bredent Blue Sky / Sky Classic (RP)** — 29 components incl. SKY esthetic gingiva former S/M/L (GH 2-6), SKY temp S/M/L (POM, 18 Ncm), SKY esthetic 0°/15°/15°R, SKY titanium 0°/15°/25°/25°R, SKY uni.cone 0°, SKY fast & fixed 17.5°/35°/0° multi-unit, BioHPP elegance S/M/L 0°/15°, Ti-base CEREC, intraoral + extraoral PEEK scanbodies, Locator 1-6 mm + 17.5°/35°, TiSi.snap, analog.
   - **Bredent Narrow Sky (NP)** — 9 components incl. SKY esthetic S 0°/15°, NP cast-on (PMMA + Au-Pd-Pt-Ir alloy), SKY uni.fit CAD Ø 2.9/3.2, BioHPP elegance S 0°/15°, narrow analog.
   - **Bredent copaSKY** — 6 components incl. gingiva former M 4mm/6mm F15, BioHPP elegance, uni.cone, CEREC ti-base.
   - **Bredent miniSKY** — 7 components incl. MD-Abutment Ti + BioXS, uni.fit, Ti-base, analog.
   - **Improved `build_ai_context`** (`implant_catalog_seed.py`): now also emits per-component `diameters_mm`, `heights_mm`, `platforms`, `torque_ncm`. AI answers now show full spec lines.

**Test results (verified end-to-end via curl)**:
- `GET /implant-catalog/by-key?key=Bredent|Blue Sky` → 29 detailed components.
- `GET /implant-catalog/by-key?key=BioHorizons|Tapered Pro Conical RBT` → 14 detailed components.
- AI for "Wide healing cap" returns: `Diameter (mm): 4.8, 5.3 / GH (mm): 4.0, 6.0 / Material: titanium_alloy / torque 10-15 (hand-tighten) Ncm`.
- AI for "Surgical drills?" → "Information is not available."
- AI for "Temporary cylinders?" → 3 structured Specification blocks (S/M/L).
- Frontend tile menu: "Implant Database" tile (amber, library icon) renders for admin role; testID `tile-implant-database` confirmed present.

**Files touched**:
- `/app/backend/server.py` — seed-respect-edits, AI prompt rewrites for `/ai/ask-implanr` + `/ai/chat`.
- `/app/backend/implant_catalog_seed.py` — replaced BioHorizons + Bredent component arrays with detailed PDF-extracted prosthetic data; added per-component dimension/torque/platform fields to `build_ai_context`.
- `/app/frontend/app/ask-implanr.tsx` — keyboard offset + drag-dismiss.
- `/app/frontend/app/procedures/[id].tsx` — chat scroll ref, auto-scroll on new message, modal sheet 85% height.
- `/app/frontend/app/(tabs)/profile.tsx` — removed "Implant Catalog (Implanr AI)" link.
- `/app/frontend/app/(tabs)/_layout.tsx` — added Implant Database tile (amber).
- `/app/frontend/app/admin/implant-catalog.tsx` — header renamed to "Implant Database"; Ask AI + Add System pills (from iter-148).



## Iteration 148 (Feb 2026) — Standalone "Ask Implanr AI" Tab + Catalog CRUD Editor + Header Entry

**Goal**: Make the Implanr AI catalog conversationally queryable WITHOUT opening a case, and let `implant_incharge` / `administrator` add or edit implant systems through a UI form (no API tooling needed).

**Implementation**:
1. **Standalone chat screen** — `/app/frontend/app/ask-implanr.tsx`:
   - Full-screen chat with iOS-style bubbles, KeyboardAvoidingView, multi-line input, send/loading states.
   - Welcome card with 5 suggested questions (e.g. "Compare multi-unit angulations", "Locator overdenture support"). Tap-to-ask.
   - **Scope selector** (`ai-scope-selector`): bottom-sheet modal grouped by brand, lets user narrow AI to one populated system or "All systems".
   - Calls `POST /api/ai/ask-implanr` with `{question, system_key?}` (existing endpoint reused).
2. **Catalog CRUD editor** — `/app/frontend/app/admin/implant-catalog-edit.tsx`:
   - Sections: Identity (Brand + System Name = key, locked on edit), Connection (type/subtype/indexing/platform_switching), Features (newline-separated), Implant Specs (Diameters/Lengths/Bone types/Healing modes — CSV), Components (per-component editor with type chips, GH, angulations, retention, material, indication, notes), Compatibility Notes.
   - Save → `PUT /api/implant-catalog/by-key?key=Brand|Name` (server enforces RBAC: implant_incharge + administrator only).
   - Edit mode loads existing record via `GET /implant-catalog/by-key`. Brand+Name are read-only on edit (they form the key — to rename, delete + recreate).
3. **Navigation entry** — `/app/frontend/app/admin/implant-catalog.tsx` header now has:
   - **Ask AI** pill (`catalog-open-ask-ai`) — opens `/ask-implanr`. Visible to all roles.
   - **Add System** pill (`catalog-add-new`) — opens `/admin/implant-catalog-edit` (canEdit only). Pre-existing missing styles (`addNewBtn`, `addNewBtnText`) added in this iteration.
4. **testID fix**: All new TouchableOpacity / TextInput components use BOTH `testID` and `data-testid` props. RN-Web only forwards `testID` to the DOM as `data-testid`; using both keeps native + web Playwright selectors working.

**Verification (testing_agent_v3_fork iteration_141.json)**:
- Backend: 9/9 PASS — list, get-by-key, RBAC upsert (admin OK / student 403), AI scoped + global, AI grounding (Ankylos 0/7.5/15/22.5/30/37.5° quoted exactly).
- Frontend: Ask AI pill renders + navigates to `/ask-implanr`; standalone screen shows title, scope selector, suggestions, input + send. Backend integration verified via curl (41 systems, AI grounded answers).
- Catalog AI floating bubble inside cases (Phase 1–4) is case-aware (existing iter-147 multi-brand catalog injection) — confirmed unchanged.

**Files touched**:
- `/app/frontend/app/admin/implant-catalog.tsx` — added Ask AI pill + missing styles for both header pills.
- `/app/frontend/app/ask-implanr.tsx` — added `testID` alongside `data-testid` on scope selector, suggestions, input, send, scope rows.
- `/app/frontend/app/admin/implant-catalog-edit.tsx` — added `testID` alongside `data-testid` on save, add-component, comp-remove buttons.

**Test artefact**: `/app/backend/tests/test_implant_catalog_ai_iteration141.py` — 9/9 PASS.



## Iteration 139 (Feb 2026) — Phase 2 Multi-Unit Abutment (MUA) Capture

**Goal**: For full-arch Immediate Loading cases, capture per-implant Multi-unit Abutment data (Angulation + Cuff Height) directly in the Phase 2 surgical form, surface it on the case-detail view, and persist it in the Case Report PDF + AI context.

**Gate conditions (all three must be true for the section to render)**:
1. Phase 1 `procedure_type` ∈ {`All on 4`, `All on 6`, `All on X`}
2. Phase 1 `loading_type` = `Immediate Loading`
3. Phase 2 `prosthetic_component` = `Immediate Loading Done`

**UI — `/app/frontend/app/procedures/submit-phase2/[id].tsx`**:
- Blue-themed section `muaSection` (matches iOS `uploadSection` family: `#E1F5FE` bg / `#0277BD` accents).
- Yes/No pill buttons (`mua-placed-yes` / `mua-placed-no`). Unset by default (user must explicitly pick). Picking "No" clears any previously entered per-implant rows.
- When **Yes**: per-implant rows (one per `implantPositions[]`) with `Tooth #<pos>` label + two numeric inputs:
  - Angulation (`°`, decimal-pad, `mua-angulation-<idx>`). Valid range 0–45° (**range hidden from user**).
  - Cuff Height (`mm`, decimal-pad, `mua-cuff-<idx>`). Valid range 0–10 mm (**range hidden from user**).
- **Non-blocking validation**: empty / out-of-range values display inline red `Required` or `Invalid` text via `muaErrorText` but do NOT prevent submit. Helpers: `muaAngleError` / `muaCuffError`.

**Backend — `/app/backend/server.py`**:
- `Phase2Submit` (~L410) gains:
  - `multi_unit_abutment_placed: Optional[str]` (`'yes'` / `'no'` / `None`)
  - `multi_unit_abutment_details: Optional[List[Dict[str, Any]]]` — each row `{tooth, angulation, cuff_height}`
  - `access_channel_openings: Optional[List[str]]` (was previously sent by the client but silently dropped — now persisted)
- Save dict in `POST /api/procedures/{id}/submit-phase2` writes all three fields into `phase2_data`.

**Tests** — `/app/backend/tests/test_mua_phase2_iteration139.py` — **6/6 PASS**:
1. Full-arch All-on-4 + Immediate Loading → MUA='yes' with 4-row details persists as-sent (plus access_channel_openings round-trip).
2. MUA='no' with `details=null` → saves successfully.
3. MUA fields omitted entirely (Delayed Loading gate not met) → saves successfully.
4. Non-blocking server semantics: invalid / partial / None / non-numeric values accepted with 200 OK.
5. Single Conventional Implant regression — no MUA fields → unchanged behaviour.
6. Numeric (int + float) values for angulation / cuff_height preserved as-sent.

### Iter-139 Extension — Downstream Read-only Display + PDF + AI Context
Blue-themed read-only card (`data-testid="mua-readonly-section"`) under the Phase 2 summary rendering `Multi-unit Abutment Placed: Yes/No` plus per-tooth rows (`data-testid="mua-readonly-row-<idx>"`) with Tooth pill + Angulation + Cuff Height (em-dash for empty values).

**Case Report PDF — `/app/backend/server.py`** (~L5621):
After the Healing Abutment Cuff Height line the PDF now renders `Multi-unit Abutment Placed: Yes/No` and a `Multi-unit Abutment Details` block (one `Tooth {n}: Angulation {x}° Cuff Height {y} mm` row per implant) when MUA=Yes.

**AI case context — `/app/backend/server.py`** (~L4475):
`_build_case_context` now emits `Multi-unit Abutment Placed: Yes/No` and a `MUA Details: Tooth <pos>: <ang>° / <cuff>mm; ...` line so the GPT explain-recommendation and surgical-notes AI both see the captured data.

**Downstream tests** — `/app/backend/tests/test_mua_pdf_export_iteration139.py` — **5/5 PASS** (iteration 129):
1. Full-arch Immediate Loading MUA=Yes → PDF contains MUA header, details block, tooth rows, numeric values + legacy sections.
2. MUA=No → PDF contains header but NOT details block (correctly gated).
3. Non-MUA single-implant → zero MUA substrings in PDF (no leak).
4. `_build_case_context` unit test — emits MUA lines for yes, "No" line only for no, nothing when absent.
5. Delayed Loading + numeric (int) MUA values → PDF renders correctly (stringification robust).

### Iter-141 (Feb 2026) — Critical Fix: MUA Section Wasn't Rendering

**Bug**: User reported "Multi-unit protocol in Phase 2 for full arch procedure type is not implemented". Root cause was a **type mismatch**: Phase 1 stores `loading_type` as a multi-select `string[]` array (e.g. `['Immediate Loading']`) but the Phase 2 form was comparing it as a string (`loadingType === 'Immediate Loading'`) — the gate was always false → MUA section never rendered for ANY case.

**Fix in `/app/frontend/app/procedures/submit-phase2/[id].tsx`**:
- Changed `loadingType` state from `string` → `string[]` (with comment explaining the multi-select shape).
- Loader now coerces both shapes: `Array.isArray(x) ? x : (x ? [x] : [])`.
- Render gate + submit-payload gates now use `Array.isArray(loadingType) ? loadingType.includes('Immediate Loading') : loadingType === 'Immediate Loading'`.

**Bonus fix — pre-existing crash blocking SPA navigation**:
`utils/usePushNotifications.ts` was calling `Notifications.removeNotificationSubscription(...)` which has been removed in newer expo-notifications SDKs. The cleanup function threw on every unmount (including SPA route changes), surfacing a red error overlay that masked the MUA section. Migrated to the new API: `subscription.remove()` with a back-compat fallback to the old function.

**Self-test (UI smoke)** — verified on case `69f640120ae04a75cf8d0cb6` (All-on-4 + `loading_type: ['Immediate Loading']`):
- All 4 torque rows render with tooth labels (#11, #12, #21, #22).
- After selecting "Immediate Loading Done" prosthetic component, the blue MUA card renders with Yes/No pills (`mua-placed-yes/no`).
- After tapping Yes, 4 per-tooth rows render with `mua-angulation-{0..3}` + `mua-cuff-{0..3}` inputs and inline red `Required` warnings (8 total inputs detected).




## Iteration 147 (Feb 2026) — Multi-Brand Catalog Awareness for the Floating AI

The floating Ask Implanr AI bubble (`/api/ai/chat`) now injects catalog blocks for **every distinct (brand, system)** in the case, not just the first. Up to 4 systems per case are appended to the prompt, delimited by `===` headers, with the same do-not-invent guardrail.

**Why**: Mixed-brand restorations (e.g. Ankylos at the anterior + Osstem in the posterior) couldn't get grounded comparison answers before — the AI only saw one brand's catalog. Now clinicians can ask:
- "Compare the multi-unit angulations of the systems in this case."
- "List healing-abutment GH for each system used."
- "Which system in this case supports zirconia abutments?"

**Verified curl tests** (case `69f640120ae04a75cf8d0cb6` patched with #11/#12 Ankylos C/X + #21/#22 Osstem TS III):
- Q1 "Compare multi-unit angulations" → AI correctly stated Osstem lists 0°/17°/30° while Ankylos has no multi-unit entry — explicit honesty, no fabrication. ✓
- Q2 "Healing GH per implant position" → mapped #11 → Ankylos GH 0.75/1.5/3.0/4.5 mm and #21 → Osstem GH 2/3/4/5/6/7 mm exactly. ✓



**1. Floating Ask Implanr AI bubble** (inside `procedures/[id].tsx`, calls `/api/ai/chat`):
- `/ai/chat` now injects the catalog block scoped to the case's `implant_plans[0].brand|system` when that key resolves to a non-stub catalog record.
- System prompt tightened with a do-not-invent guardrail: "When answering component / SKU / angulation / gingival-height / retention questions, quote ONLY values that appear in the Implant System Catalog block above; if a value is not listed, say so explicitly."
- Fallback directive when the case has no system in the catalog: AI replies "The implant system chosen for this case is not yet in the Implanr catalog…" — never fabricates SKUs or angulations.
- **Verified curl test**: case patched to `Dentsply Sirona|Ankylos C/X`, AI asked "What angulations are available for the final abutment in this case's implant system?" → correctly quoted 0°/7.5°/15°/22.5°/30°/37.5°. ✓

**2. Catalog admin page UI redesign** (`/app/frontend/app/admin/implant-catalog.tsx`):
- Replaced two-pane split (which squeezed the right detail pane on narrow widths) with a stacked vertical layout.
- Cascading dropdowns: `Implant Company` → `Family` (only when ≥1 family in brand) → `Variant` (only when family has >1 variant).
- Picker uses bottom-sheet modal with searchable list, active-row highlight, and option-count subtitles.
- Auto-pick logic: when a brand is chosen and its first family has only 1 variant, that variant auto-loads. Multi-variant families wait for explicit user selection so they see all options.
- Full-width detail card renders below the dropdowns — no more cut-off content.
- Collapsible "Browse all 36 systems visually" grid below for non-technical staff who prefer card-based navigation.
- Stub (Pending) systems excluded from dropdowns + grid per user choice (editable via API).

**Verified visually**: Initial state shows only the Brand dropdown; selecting Neodent reveals the Family dropdown auto-filled with Drive GM (first alphabetical); switching to Helix GM reveals the Variant dropdown with placeholder; picking Acqua loads the full-width detail card with Connection / Implant / Features / Components (8) cards rendering cleanly. Ask Implanr AI panel scoped to Neodent Helix GM (Acqua) appears below.



**Catalog batch 3** — seeded from 2 new PDFs:
- **B&B Dental (Italy)** Conexa family (+5): EV Line, 3P, 3P Long, Wide Line, Dura-Vit Slim.
- **Cowell Medi** INNO series (+3 — new brand): INNO SLA-SH (11° Tapered Hex 2.5), INNO Internal (Octa 3.1 / Hex 2.4), INNO External (Hex 2.7 / 3.4).

**Catalog state**: 41 systems / **36 populated** / 5 stubs remaining.

**Family + variant collapsed UI** (`/app/frontend/app/admin/implant-catalog.tsx`):
- Records now group under a computed `familyRoot` (regex strips trailing `NP|RP|WP`, ` Acqua`, ` NeoPoros/Neoporous`, `(Acqua)`, `(NeoPoros)`, ` Long`, ` Line`).
- Single-variant families render as plain rows (existing UX).
- Multi-variant families render as a parent row showing `N variants · N comp total`, with a chevron + children revealed as **inline pills** when expanded.
- Variants inherit the standard/stub visual treatment (active = filled blue pill, stub = amber-bordered).
- Selecting a variant auto-expands its family; detail pane updates instantly.
- Backend keys unchanged — purely a client-side visual regrouping.

Example groupings:
- Neodent: `Drive GM` / `Helix GM` / `Titamax GM` each collapse `{Acqua, NeoPoros}` (6 rows → 3 families).
- Nobel Biocare: `NobelActive` / `NobelParallel CC` each collapse `{NP, RP, WP}` (6 rows → 2 families).
- B&B Dental: `3P` collapses `{3P, 3P Long}`.

**Visible row count** dropped from 36 → ~27 rows in "With data" filter (9-row reduction) without hiding any information.



User uploaded 5 more PDFs. Extracted, normalised, and seeded into `implant_catalog`:

- **Osstem** (+4): `TS IV`, `SS III`, `MS` (mini ball-head), `ETIII NH`.
- **Nobel Biocare** (+6): `NobelActive NP/RP/WP` + `NobelParallel NP/RP/WP` (all internal-conical, multi-unit 0/17/30°).
- **Neodent** (+6): `Drive GM Acqua/NeoPoros`, `Helix GM Acqua/NeoPoros`, `Titamax GM Acqua/NeoPoros` (Grand Morse conical, surface variants share prosthetic components).
- **Bredent SKY family** (+5): `blueSKY`, `miniSKY`, `copaSKY`, `Narrow Sky`, `Sky Classic`.

Implementation used a **helper-factory pattern** (`_mk`, `_nobel`, `_neodent`, `_bredent`) + a single `CATALOG_EXTRA` list consumed by the startup seeder — avoids copy-paste bloat and keeps the file under 500 LOC with 28 curated systems.

**State**: 38 systems / **28 populated** / 10 stubs remaining (Bredent Mini 2 Sky unchanged from batch 1 — now replaced by miniSKY with full data; other leftover stubs are mostly B&B Dental, remaining BioHorizons variants, NeoBiotech IS-III).

**Self-test (curl, GPT-5.2)** — 3/3 grounded:
1. Helix GM (Acqua) → quoted exact Ø [2.35, 3.5, 3.75, 4.0, 4.3, 5.0, 6.0] mm + L [8-25 mm]. ✓
2. Bredent blueSKY overdenture + ti-base → correctly acknowledged both are listed, said "no further details" for each (no hallucination). ✓
3. NobelActive RP multi-unit angulations → quoted 0/17/30° exactly. ✓



User uploaded 5 PDF catalogs; all extracted, normalised to the iter-142 schema, and seeded into `implant_catalog`:
- **MIS LANCE+** — *new brand*: Internal Hex, 4 Ø × 5 L, 14 component categories (cover screw, healing caps × 3 profiles, multi-unit straight + 17°/30° angled across NP/SP/WP, cementable abutments + concave variants, EZ-Base + Ti-Base anti/free rotation + incisor esthetic, OT-Equator overdenture, ball attachments straight + 15°/25° angled, LOCKIT system, CPK abutments H1-H4, Titanium blanks).
- **Alpha-Bio Tec SPI** — *new brand*: Internal Hex 0.050, single platform across 5 Ø × 5 L, 9 component categories.
- **BioHorizons Tapered Pro**: Internal Hex Conical, Laser-Lok + RBT surface, 4 Ø × 5 L, 8 component categories.
- **BioHorizons Tapered Pro Conical (RBT)**: Conical 6-cam single-platform CONELOG family, 5 Ø × 5 L, 11 component categories incl. surgical drills + color-coded drivers.
- **Camlog CONELOG Progressive-Line**: Conical internal w/ Promote® surface, 4 Ø × 5 L, 10 component categories incl. healing caps × 3 profiles (cylindrical/wide-body/bottleneck) and Flex Surgery set.

Total catalog state: **38 systems, 7 populated, 31 stubs**. All seeded via `_seed_implant_catalog()` startup hook (idempotent — admin edits to stubs preserved).

**Self-test (curl, GPT-5.2)** — 2 grounded Q&A:
- "Conelog healing abutments?" → quoted exact GH [2/4/6 mm] for cylindrical, [4/6 mm] for wide-body + bottleneck, retention "screwed", material "titanium_alloy". ✓
- "MIS LANCE+ multi-unit angled?" → quoted 17°/30° angled (GH 1-2 mm) and 0° straight (GH 1-5 mm) across NP/SP/WP. ✓



**Goal**: Implanr AI answers "Do we have angled abutments for Ankylos? What angulations?" / "Does Osstem TS III support multi-unit?" with grounded, catalog-quoted answers — no hallucination. Ground truth is a per-system component catalog editable by Administrators.

**Backend** (`implant_catalog_seed.py`, `server.py`):
- New `implant_catalog` MongoDB collection. Schema includes connection, platform switching, features, implant Ø/L/bone-types, components[] (type/subtype/gingival_heights_mm/angulations_deg/retention/material/indication/notes), compatibility_notes, is_stub, updated_at/by.
- Seeded **Ankylos C/X** (9 components) + **Osstem TS III** (7 components) from the user blueprint. 34 other registered systems get stub records → "Pending" badges in admin UI.
- Idempotent startup seed: flagship systems re-upserted from code each boot (source-of-truth = code); stubs inserted only when missing — admin edits never overwritten.
- Endpoints (`/api`-prefixed):
  - `GET /implant-catalog` — list all (auth required).
  - `GET /implant-catalog/by-key?key=Brand|System` — get one.
  - `PUT /implant-catalog/by-key?key=...` — upsert (Administrator + Implant In-Charge).
  - `POST /ai/ask-implanr` — `{question, procedure_id?, system_key?}` → GPT-5.2. Auto-scopes to a case's implant system; falls back to compact summary of populated systems if no scope.
- AI prompt has a do-not-invent guardrail: GPT must only quote values present in the catalog block; says "no entry" when absent.
- Existing `POST /ai/explain-recommendation` now injects the same catalog summary so per-implant explanations cite real components.

**Frontend admin browser** (`/app/frontend/app/admin/implant-catalog.tsx`, route registered in `_layout.tsx`, link added to Profile → Compliance):
- Two-pane: left = filterable list (All / With data / Pending), right = detail card.
- List rows: brand label + system name + green `N comp` or amber `Pending` badge.
- Detail: Connection / Implant specs / Features bullets / per-Component cards / Compatibility Notes.
- **Ask Implanr AI** panel embedded at bottom — pre-scoped to selected system, input + Ask button, answer card.

**Self-test (curl, GPT-5.2)** — 3/3 PASS:
1. Ankylos angulations → quoted 0/7.5/15/22.5/30/37.5° + GH + retention. ✓
2. Osstem TS III multi-unit → quoted 0/17/30° + indication. ✓
3. Stub system (BioHorizons Tapered Pro healing GH) → "no entry" + suggested Ankylos/Osstem alternatives, no fabrication. ✓

**Self-test (UI)** — Catalog browser at `/admin/implant-catalog`: 36 systems list, "With data" filter shows the 2 populated systems, detail panes render correctly, Ask AI panel renders scoped to selection.

**Deferred to next session**:
- Full CRUD **editor forms** in the admin UI (add/edit/delete components inline). Current write path = API only.
- Standalone **"Ask Implanr AI" persistent chat tab** in main navigation (currently embedded inside catalog detail).
- Bulk catalog **CSV import**.



## Iteration 140 (Feb 2026) — Copy MUA from Phase 2 to Phase 4 Step 1 Notes

**Goal**: One-tap affordance in Phase 4 Step 1 (Prosthetic Planning) that copies the Phase 2 Multi-unit Abutment placement data into the free-text Notes field, so the restorative team doesn't have to re-type angulation + cuff-height per tooth.

**UI — `/app/frontend/app/procedures/submit-stage2-prosthetic/[id].tsx`**:
- A blue pill button **"Copy MUA from Phase 2 (N)"** (`data-testid="copy-mua-to-notes-btn"`) appears inside the Notes section **only when** `procedure.phase2_data.multi_unit_abutment_placed === 'yes'` AND `multi_unit_abutment_details.length > 0`.
- On tap, appends a pre-formatted block to the existing Notes (never overwrites):
  ```
  Multi-unit Abutments (from Phase 2):
  - Tooth 11: Angulation 15°, Cuff Height 3 mm
  - Tooth 13: Angulation 20°, Cuff Height 4 mm
  ...
  ```
- Idempotent: if the block is already present (checks for the `Multi-unit Abutments (from Phase 2):` header), shows an "Already copied" alert instead of duplicating.
- Editable: the pasted text can be modified freely — notes remain a plain string on submit.
- Empty entries render as `—` for the value.

**Styles (blue theme matches Phase 2 MUA card)**:
- `copyMuaBtn`: pill, `#E1F5FE` bg / `#B3E5FC` border / `#0277BD` text, left-aligned, above the textarea.
- `copyMuaText`: 12px, weight 700, `#0277BD`.

**No backend changes** — pure client-side UX enhancement reading `procedure.phase2_data` already loaded via GET `/procedures/{id}`.



## Iteration 138 (Feb 2026) — Phase 2 Cuff-Height Catalogue (wired to Phase-1 Attachment Type)

**Goal**: Close the loop between iter-137's Phase-1 `attachment_type` field and the Phase-2 Healing-Abutment-Placed flow. Students no longer type a free numeric cuff height — they pick from a dropdown constrained to the manufacturer's real SKU range for the exact attachment brand they chose in Phase 1.

**Data — new module `/app/frontend/constants/attachmentCuffCatalogue.ts`:**
- `ATTACHMENT_CUFF_CATALOGUE` — hardcoded catalogue map (vendor → string[] of mm values). Sourced from published product ranges:
  - Locator (Zest): 1, 2, 3, 4, 5 mm
  - Locator R-Tx (Zest): 1, 2, 3, 4, 5, 6 mm
  - Rheine 83 / OT Equator: 0.5, 1, 2, 3, 4, 5, 6, 7 mm
  - Novaloc (Straumann): 0.5, 1.5, 2.5, 3.5, 4.5, 5.5 mm
  - TiSi Snap (Bredent): 0.5, 1, 2, 3, 4, 5 mm
  - Stud and Ball: 1, 2, 3, 4 mm
- `getCuffHeightsFor(value)` — returns `null` for bar-type attachments (custom-milled, no SKU catalogue) and for `"Other"` / `"Other: <custom>"` wrappers, which keeps the legacy free-text numeric input available as a fallback for bespoke cases.

**UI — `/app/frontend/app/procedures/submit-phase2/[id].tsx`:**
- Loads `procedure.attachment_type` into state on mount.
- When `prostheticComponent === 'Healing Abutment Placed'`:
  - If `getCuffHeightsFor(attachmentType)` returns a list → renders a per-implant **dropdown picker** with data-testid `healing-abutment-cuff-picker-<idx>` and option testids `healing-abutment-cuff-<idx>-option-<mm>`. A subheader reads `Catalogue: <brand> · N SKUs` so the student/supervisor sees exactly which vendor list is active.
  - If it returns `null` (bar, Other, empty) → falls back to the original free-text decimal-pad TextInput (`healing-abutment-cuff-<idx>`).

**Tests** — `/app/frontend/tests/attachmentCuffCatalogue.test.ts` exec-style (dependency-free, runs via `npx tsx`):
- **32/32 assertions PASS**. Covers every vendor catalogue, null-return semantics, `"Other: <custom>"` wrapper stripping, and catalogue-integrity checks (unique, non-empty, numeric-string entries per vendor).

## Iteration 137 (Feb 2026) — Guided Surgery Prosthetic Plan + Type of Attachment Sub-Dropdown

### Change 1 — Guided Surgery gets a Prosthetic Plan
- `MULTIPLE_GROUP` in `/app/frontend/constants/checklist.ts` now includes `'Guided Surgery'`. Since `getProstheticOptions()` returns `BRIDGE_OPTIONS` for any procedure type in `MULTIPLE_GROUP`, Guided Surgery cases now get the full list (Cement Retained Bridge – Zirconia / PFM, Screw Retained Bridge – Zirconia / PFM, Hybrid Bridge, Overdenture with Attachment, Other) in Phase 1 Step 1.
- Guided Surgery remains in `NON_FULL_ARCH_TYPES` + `CLINICAL_EXAM_GROUP` as before.

### Change 2 — Type of Attachment sub-dropdown
- New catalogue `PHASE1_ATTACHMENT_TYPE_OPTIONS` in `/app/frontend/constants/checklist.ts` with the 9 user-specified options: Stud and Ball Attachment · Locator – Zest Dental Solutions · Locator R-Tx – Zest Dental Solutions · Rheine 83 – OT Equator · Novaloc – Straumann · TiSi Snap – Bredent · Bar Attachment · Locator Bar · Other.
- `/app/frontend/app/(tabs)/new-procedure.tsx`:
  - New formData fields `attachment_type` + `attachment_type_other` (persisted on draft load/reset/save).
  - Dropdown (testID `attachment-type-dropdown`) appears inside the Prosthetic Treatment Plan section immediately below the Prosthetic Plan dropdown, ONLY when Prosthetic Plan = "Overdenture with Attachment". Required on save.
  - Free-text input (data-testid `attachment-type-other-input`) appears when user picks "Other". Required on save.
  - Switching Prosthetic Plan AWAY from Overdenture-with-Attachment clears both attachment-type fields.
  - Save payload: `attachment_type` value is sent as-is, or `"Other: <custom>"` when "Other" was picked. Cleared to `''` otherwise.
- Step 1 validation: blocks submit with clear Alert if `attachment_type` is missing when plan is Overdenture-with-Attachment, or if "Other" is picked without a custom value.

### Verification
- Bundle compiled cleanly (no Metro errors). App boots without regressions. Smoke-tested as student: dashboard, drafts, and Phase 1 form all render correctly.
- Backend has no schema changes — `procedures` accepts arbitrary extra fields, so `attachment_type` is stored and round-trips via the existing GET `/procedures/{id}` endpoint.

## Iteration 136 (Feb 2026) — Pre-Op Augmentation Checklist

**Goal**: Convert the per-site clinical correlations surfaced by iter-135's AI into structured, ticked-off-able checklist items the supervisor signs off during Phase 1 approval. Deterministic rule engine (no AI cost, no hallucination, instant generation).

### Backend
- **`/app/backend/augmentation_checklist.py` (new)**: `generate_augmentation_checklist(proc)` — pure function, takes a procedure dict, emits a list of items keyed to each cluster-leader tooth (or `"<arch> arch"` fallback for full-arch / single-tooth flows). Triggers:
  - Inadequate keratinized mucosa (<2mm / minimal / absent) → free gingival graft / apically-positioned flap item
  - Thin biotype (≤1mm) → connective-tissue graft item
  - Thick biotype (>2mm) → favourable note recommending zirconia abutment
  - Knife-edge / atrophied / Type B/C/D ridge → ridge augmentation (GBR / ridge-split) + narrower-platform implant items
- **`/app/backend/server.py`**:
  - Auto-generate on `POST /procedures` (line ~1521) — checklist seeded into the new procedure doc.
  - Auto-regenerate on `PATCH /procedures/{id}/edit-fields` (line ~2410) when `clinical_exam_per_site` / legacy ridge / soft-tissue / keratinized / arch / missing-teeth fields are touched. Preserves completed-state on items whose title still matches (so a benign edit doesn't lose supervisor sign-offs).
  - Three new endpoints (line ~2470):
    - `GET    /procedures/{id}/augmentation-checklist` — list items (case stakeholders only).
    - `POST   /procedures/{id}/augmentation-checklist/regenerate` — force rebuild (case stakeholders).
    - `PATCH  /procedures/{id}/augmentation-checklist/{item_id}` — toggle completed (Supervisor / Implant In-Charge / Admin only). Captures `completed_by_id`, `completed_by_name`, `completed_at`, `completed_notes`.

### Frontend
- **`/app/frontend/components/AugmentationChecklist.tsx` (new)**: Rendered at the top of `/procedures/[id]` ScrollView (just below the page header). Self-hides when no items. Supervisors / In-Charge see tappable cards with checkbox + sign-off line; students see read-only cards. Items are colour-coded by category (keratinized = orange, biotype = purple, ridge = deep-orange, soft-tissue = orange, general = grey) with Ionicon, blue site chip ("Site 16"), title, and rationale. "Regenerate" button (top-right of section) reruns the rule engine on demand.

### Behaviour example (live curl-tested)
For a procedure with `clinical_exam_per_site = { "16": { ridge: "Type B Knife Edge Ridge", soft_tissue: "Thin (≤1mm)", keratinized: "Inadequate (<2mm)" } }`, the engine emits 4 items at site 16:
1. Plan free gingival graft / apically-positioned flap (keratinized)
2. Plan connective-tissue graft to thicken biotype (biotype)
3. Plan ridge augmentation (GBR / ridge-split) (ridge)
4. Consider narrower-platform implant (ridge)

Each with a one-line clinical rationale referencing the actual finding value.

### Regression tests (`/app/backend/tests/test_augmentation_checklist_iteration136.py`)
**7/7 PASS in 4.18s** (combined with iter-135's 4 tests: **11/11 PASS in 22.67s**):
1. Rule engine emits keratinized item for inadequate KM
2. Rule engine emits full set (keratinized + biotype + ridge) for deficient site
3. Rule engine returns [] when no findings
4. Rule engine falls back to legacy fields when `clinical_exam_per_site` is empty
5. GET endpoint returns items list
6. Regenerate produces consistent items after seeding deficient findings
7. Toggle 403's for student, 200/403/404 for supervisor (stakeholder-aware)

## Iteration 135 (Feb 2026) — AI Per-Site Clinical Correlation

**Goal**: Now that Phase 1 Step 1 captures distinct intraoral findings per edentulous site (iter-134), surface those findings to the AI "Explain Recommendation" so the rationale is per-site instead of globally averaged.

**Backend changes in `/app/backend/server.py`:**
- `_build_case_context()` (line ~4266): emits a structured **"Per-Site Intraoral Findings:"** block listing each cluster-leader tooth with its Ridge Contour / Soft Tissue Thickness / Keratinized Mucosa values (only when `clinical_exam_per_site` is non-empty). All 4 procedure-bound AI endpoints (`/ai/explain-recommendation`, `/ai/case-summary`, `/ai/surgical-notes`, `/ai/chat`) inherit this automatically.
- `/ai/explain-recommendation` (line ~4404): resolves the cluster-leader for the SELECTED implant's tooth (replicates frontend `findMissingRuns` adjacency rule + `clusterLeader` highest-tooth-in-run), then injects a focused `Site-Specific Findings (tooth X, leader Y): ...` line just above `inst_block` so the AI can correlate the implant directly to its specific edentulous site. Prompt instructions extended to weight thin biotypes, knife-edge ridges, and inadequate keratinized mucosa with explicit clinical correlations (CTG / FGG / ridge-split / GBR / narrower platform).
- `/ai/explain-standalone` (line ~4494): now accepts optional `ridge_contour`, `soft_tissue_thickness`, `keratinized_mucosa` body fields — the Home implant tool can pass them in. Same per-site weighting added to its prompt.

**Verified live** with curl probe (Tooth 36, NobelActive 4.3×10mm, Type II bone, **Knife-Edge Ridge + Thin (≤1mm) + Inadequate KM (<2mm)**) — AI response correctly mentioned:
- "ridge-split and/or contour-augmentation GBR... narrower platform"
- "biologic width is more likely to consume crestal bone unless tissue thickness is increased"
- "free gingival graft or apically positioned flap"
- Connective-tissue graft for biotype thickening

**Regression test**: `/app/backend/tests/test_ai_per_site_iteration135.py` — 4 tests, all PASS (21.58s):
1. `_build_case_context` includes per-site block when populated
2. `_build_case_context` omits the block when `clinical_exam_per_site={}`
3. `/ai/explain-standalone` with thin biotype + inadequate KM + knife-edge ridge correctly surfaces soft-tissue augmentation AND ridge-split/GBR/narrower-platform terms
4. `/ai/explain-standalone` with NO per-site fields does NOT echo `site-specific findings` (no hallucination)

## Iteration 134 (Feb 2026) — Phase 1 Step 1 Restructure (Prosthetic Plan reorder + Overdenture full-arch override + per-cluster Intraoral findings)

**Scope**: Applies to student / supervisor / implant-incharge users (NOT nurse, who never sees this form).

### Change 1 — Reorder
Moved **Prosthetic Treatment Plan** from below Loading Type to its own section immediately AFTER Procedure Information. New flow: Patient Info → Procedure Information → **Prosthetic Treatment Plan** → FDI Chart (if applicable) → Clinical Examination → Loading Type → CBCT.
- Verified y-positions in DOM: Procedure Info=64, Prosthetic Plan=231, Missing Teeth=398, Clinical Exam=640.

### Change 2 — Overdenture-with-Attachment Override
When `procedure_type ∈ NON_FULL_ARCH_TYPES` AND `prosthetic_plan === 'Overdenture with Attachment'`:
- FDI Chart / 'Select missing tooth/teeth' is HIDDEN.
- Clinical Examination renders the FULL-ARCH layout (Arch dropdown `data-testid="overdenture-arch-dropdown"` + Arch Condition + single Ridge Contour + Soft Tissue + Keratinized).
- Switching INTO Overdenture-with-Attachment auto-clears `missing_teeth`, `edentulous_site_measurements`, `clinical_exam_per_site` so the FDI chart returns empty when toggled back.

### Change 3 — Per-Cluster Intraoral Dropdowns
When `procedure_type ∈ CLINICAL_EXAM_GROUP \ {Single Conventional Implant}` AND `missing_teeth.length ≥ 2` AND `prosthetic_plan ≠ 'Overdenture with Attachment'`:
- Inside each missing-run card (singleton or cluster), the existing OC/MD measurements are followed by 3 per-site dropdowns: `ridge-contour-<leader>`, `soft-tissue-<leader>`, `keratinized-<leader>`.
- Adjacent missing teeth in the same arch share ONE set of dropdowns (continuous edentulous span = one site).
- Non-adjacent gaps each get their own card with their own set.
- The 3 single dropdowns at the bottom of the Intraoral block are HIDDEN in this mode.

### Back-compat (Change 4 — automatic)
On save, if per-cluster mode is active, the FIRST cluster's per-site values are copied into the legacy `ridge_contour`, `soft_tissue_thickness`, `keratinized_mucosa` strings so existing case-detail and PDF renderers keep working without modification. The new canonical map is `clinical_exam_per_site: { '<leaderTooth>': { ridge_contour, soft_tissue_thickness, keratinized_mucosa } }`.

### Testability fixes (post-iter-126 follow-up)
- **Local `<Dropdown>` component**: now accepts `testID` and raw `data-testid` props and forwards them onto the trigger TouchableOpacity, taking precedence over the auto-generated `dropdown-<labelKebab>`. Option items now emit `<triggerTestId>-option-<valueKebab>`.
- **FDI tooth `<TouchableOpacity>`**: now sets BOTH `testID={`fdi-${t}`}` AND `data-testid={`fdi-${t}`}` for RN-Web safety.

### Verification (`iteration_127.json`)
- 5 of 5 priority testid scenarios verified end-to-end in live DOM.
- 3 of 3 behavioural changes (reorder, overdenture override, auto-clear) verified visually + via DOM state assertions.
- Marking adjacent cluster (16/17) + singleton (26) produces EXACTLY 2 sets × 3 dropdowns = 6 dropdown trigger testids in DOM (NOT 3 sets — adjacent teeth share one site as designed).
- `retest_needed: false`, `main_agent_can_self_test: true`.

## Iteration 133 (Feb 2026) — Attach Picker Centered Dialog (fix for iter-132 bottom-sheet that users rejected)

**User feedback driving this iteration:**
- "None of the attachment pickers is working now through the app, not even the CBCT attachment in Phase 1."
- "The attachment pop-up, in iOS-native style with a blue-coloured border icon for each file type, should open in the middle of the screen for all attachment types for all types of users across the app."
- "CBCT uploaded in Phase 1 and Post Surgical Radiograph - IOPA by the student are not visible to Supervisor or Implant In-Charge once it's uploaded."

**What changed in `/app/frontend/components/AttachPickerModal.tsx`:**
- Replaced the React Native `<Modal>` with a plain absolutely-positioned `<View>` overlay. iOS enforces a single-modal-at-a-time rule, so a RN Modal mid-dismiss silently aborts any native DocumentPicker/ImagePicker launched from it. A plain View overlay has no such constraint.
- Dialog is now CENTERED horizontally + vertically (`alignItems: center; justifyContent: center`). Card `width: 86%, maxWidth: 360, borderRadius: 18`.
- Header: title "Add attachment" + subtitle "Choose where your file is coming from".
- Three `IconTile` rows — each with its Ionicon rendered inside a **blue-bordered** rounded-square frame (`borderWidth: 1.5, borderColor: #1565C0, bg: #F5FAFF`):
  - Photo Library (`images-outline`)
  - Take Photo or Video (`camera-outline`, `mediaTypes: ['images','videos']`)
  - Choose Files (`folder-outline`)
- Added a Cancel row at the bottom (`data-testid='attach-cancel-btn'`).
- Backdrop: `Pressable` filling the overlay with `rgba(0,0,0,0.42)` — tap-outside dismiss.

**CBCT / IOPA visibility to supervisor — ROOT CAUSE (documented):**
Direct DB probe via `GET /api/procedures` as Paresh.gandhi (Supervisor) confirmed ALL 16 supervisor-visible procedures have `cbct_files=None` and `phase2_data.iopa_files=None`. The rendering code at `/app/frontend/app/procedures/[id].tsx` lines 1425-1478 (CBCT) and 1574-1609 (IOPA) has NO role gate — both render for supervisor whenever data is present. The real root cause is that students were NEVER successfully uploading files because the picker was broken. Fixing the picker (iter-133) transitively fixes visibility for all future uploads.

**Bundle cache quirk documented:**
Initial post-deploy test (iteration_125.json first run) reported the rewrite was NOT live. Main agent wiped `/app/frontend/.metro-cache`, `/app/frontend/.expo`, `/tmp/metro-*` and restarted Expo to force a cold rebuild (`Web Bundled 32534ms ... 2263 modules`). Subsequent re-test (iteration_125.json second run) confirmed the rewrite IS live with centerY=450 exact, all spec items PASS. Future cache-busting commands are documented in `/app/memory/BACKLOG.md`.

**Known minor items (low priority, non-blocking):**
- `iconFrame.borderWidth: 1.5` rounds to 1px on RN-Web sub-pixel. Visual impact: invisible. Can bump to 2 if pixel-perfect matters.
- Several interactive RN components across the codebase ship `data-testid={...}` as a raw prop instead of `testID={...}`. RN-Web does NOT forward raw `data-testid` on TouchableOpacity/TextInput/Pressable to the underlying DOM element. The picker itself correctly sets both. Main user-flow functionality is unaffected; only Playwright-based automated DOM queries are affected for those buttons.

## Iteration 132 (Feb 2026) — BackButton global sweep + What's New fix + Unified Attach Picker (superseded by iter-133)

### Task 1 — iOS Default `<BackButton />` everywhere (full app sweep)
- `app/_layout.tsx`: stripped the native stack header (`headerShown:true, headerBackTitle:'Back'`) from `procedures/[id]`, `legal/privacy-policy`, `legal/terms`, `admin/audit-log`. All four now render the circular floating BackButton inline.
- `procedures/[id].tsx`: added a custom `pageHeader` row above `ScrollView` with `<BackButton testID='case-detail-back-btn' />` + centered "Case Details" title. SafeArea extended with `top` edge.
- `legal/privacy-policy.tsx` & `legal/terms.tsx`: same in-page header row pattern.
- `admin/audit-log.tsx`: added BackButton at start of the existing header.
- `components/CaseImplantPlanning.tsx`: replaced the 3 remaining `ms.backBtn` TouchableOpacity+Text "Back" patterns (lines ~1645, 1845, 1972) with `<BackButton onPress={() => setStep(...)} />`.

### Task 2 — What's New tile route fix
- `app/(tabs)/_layout.tsx`: tile route changed from `/whatsnew` → `/whatsnew?mode=history`. Previously, `/whatsnew` auto-redirected to `/dashboard` once users had acked all entries. `mode=history` shows the full role-matched release changelog regardless.

### Task 3+4 — Unified Attach Picker (replaces old ActionSheetIOS + Forum/Chat inline sheets)
- NEW `components/AttachPickerModal.tsx` — a globally-mounted bottom-sheet with exactly 3 rows matching the user-provided reference image:
  - **Photo Library** — `images-outline` (blue `#1565C0`)
  - **Take Photo or Video** — `camera-outline` (blue) — now accepts images AND videos via `mediaTypes: ['images','videos']`
  - **Choose Files** — `folder-outline` (blue)
  - No Cancel row (tap-outside dismisses). Rounded top, soft shadow, iOS-safe bottom inset.
- NEW `utils/attachPickerManager.ts` — singleton bridge between imperative `showUploadPicker()` calls and the mounted modal. Guarantees ONE modal instance exists → solves the iOS single-modal constraint that previously broke Forum/Chat attach flows.
- `utils/uploadPicker.ts` — rewritten (now 15 lines). `showUploadPicker(allowedDocTypes?)` simply delegates to `openAttachPicker()` from the manager.
- `app/_layout.tsx` — mounts `<AttachPickerModalRoot />` once inside `<ActivityTracker>`.
- `app/forum/[threadId].tsx` — removed old `showAttachSheet` state, `pickFromCamera`/`pickFromLibrary`/`pickFromFiles`, `waitForSheetClose` helper, and the 40-line inline `<Modal>` sheet. Replaced with a single `pickAttachment()` function that awaits `showUploadPicker(['application/pdf','image/*'])` then uploads via the existing `uploadAsset()` helper.
- `app/forum/chat/[groupId].tsx` — same migration. `chat-attach-btn` now opens the singleton.

### Verification (iter-124 test report)
- `/app/test_reports/iteration_124.json` — `retest_needed: false`, `main_agent_can_self_test: true`. 5/7 primary flows live-verified via Playwright, 5/5 code-review-verified. No critical bugs; pre-existing cosmetic warnings unchanged.

## Iteration 131 (Feb 2026) — Phase 1 BackButton Verification

Post-handoff verification of the iter-123 global `<BackButton />` rollout in Phase 1 screens that were left untested when the prior agent ran out of context:
- Verified `app/(tabs)/new-procedure.tsx` — `<BackButton />` imports (line 12) + usage at Step 1 header (line 803, default `router.back()`) + Step 2 header (line 680, custom onPress that flips step back to 'details').
- Verified `components/CaseImplantPlanning.tsx` — `<BackButton />` import (line 19) + usage in the Implant Plan modal's step-2 nav row (line 1476, custom onPress flips modal step back to 1).
- Smoke test screenshot confirmed Phase 1 header renders cleanly: circular white halo chip with chevron-back, sits to the left of the "Phase 1 - Diagnosis and Treatment Planning" title.
- Metro bundle healthy, no new console errors. No testID regressions.

## Iteration 129 (Feb 2026) — BackButton iOS-Default + Forum/Chat Inline Header

- **BackButton**: reverted `chevron-back-outline` → **`chevron-back`** (filled iOS-default), size 30 → **34 px** for proper proportion in the 44 px halo, `marginLeft: -2` to optically center.
- **Forum + Chat single-row header**: both `/forum` and `/forum/chat` now place the floating BackButton + the segmented Forum/Chat pill on ONE row (`s.topRow`). Layout: `BackButton ↔ flex:1 wrapper that centers the segment ↔ 44 px spacer` → pill stays optically centered, screen-top compact.
- Legacy `backBtnWrap` / `segmentRow` styles retained as no-ops for safety.

## Iteration 126 (Feb 2026) — Drilldown Chip Real Profile Photos

- **Backend**: Both `/api/admin/students/{id}/summary` and `/api/admin/supervisors/{id}/summary` now include `profile_photo` in the returned `profile` dict (base64 data URL when the user has uploaded one, else None).
- **Frontend** (student + supervisor drilldown):
  - `Summary.profile` type widened with optional `profile_photo?: string`.
  - Chip avatar renders an `<Image>` thumbnail (36 × 36 circle, 2 px blue/purple border matching the role accent) when the photo exists; falls back to the initial-on-colored-circle otherwise.
  - New `identityAvatarImg` style alongside the existing `identityAvatar`.
- Zero test-ID changes; iter-123's E2E suite remains valid.

## Iteration 125 (Feb 2026) — Admin Drilldown Identity Chips

Added pastel identity chips to the Admin/Supervisor drilldown headers so it's instantly clear whose stats are being viewed:
- **Student drilldown** (`/admin/student/[id]`): blue-tinted chip (`#E3F2FD` bg) + circular avatar with student's initial on `#1565C0` fill + their name + email inside the chip.
- **Supervisor drilldown** (`/admin/supervisor/[id]`): purple-tinted chip (`#F3E5F5` bg) + circular avatar on `#6A1B9A` fill — same pattern, different accent so admins can tell supervisor vs student context at a glance.
- Chips sit between the floating BackButton and the Nudge pill, taking `flex: 1`. Layout unchanged, testIDs preserved.
- Zero backend changes. Bundle reloaded clean.

## Iteration 124 (Feb 2026) — BackButton Press-In Scale Effect

Added a subtle tactile squish to the shared `BackButton` component:
- `Pressable` with `onPressIn` / `onPressOut` drives an `Animated.Value` scale via `Animated.spring` (`useNativeDriver: true`).
- Press-in: scale 1 → 0.92, `bounciness: 0` (clean squish, no toy bounce).
- Press-out: scale 0.92 → 1, `bounciness: 4` (gentle release).
- Wrapped in `Animated.View` so the halo shadow scales with the chip — looks like the whole floating button breathes.
- Zero impact on the 11 call-sites (props interface unchanged).
- testID + accessibility props preserved → iter-123's 100% E2E suite remains valid.

## Iteration 123 (Feb 2026) — Global Circular BackButton + Forum Header Cleanup

**User request**: Replace every "← Back" / arrow-with-Back label at top-left with a single elegant circular floating back chip (per uploaded reference). Remove the redundant "Discussion Forum" title sitting above the Forum/Chat toggle and shift the toggle up.

### Implementation
- New shared `/app/frontend/components/BackButton.tsx`:
  - 44 × 44 circle, `#FFFFFF` fill, iOS-style soft halo `shadowOpacity: 0.12, shadowRadius: 10`, Android `elevation: 4`.
  - `Ionicons name="chevron-back"` size 24, color `#1A2332` (near-black per user pick 1a).
  - `Haptics.ImpactFeedbackStyle.Light` on press (web no-op).
  - Props: `onPress?` (defaults to `router.back()`), `style?`, `color?`, `testID?`.
- Wired into 11 screens + 1 shared component:
  - `forum/index.tsx`, `forum/chat/index.tsx`, `forum/[threadId].tsx`, `forum/chat/[groupId].tsx`
  - `help-workflow.tsx`, `whatsnew.tsx`
  - `implantlens/index.tsx`, `implantlens/[caseId].tsx`
  - `admin/student/[id].tsx`, `admin/supervisor/[id].tsx`
  - `components/DrillingProtocol.tsx`, `components/PhaseHeader.tsx` (Phase 1-4 shared)
- **Forum header cleanup**:
  - Removed standalone "Discussion Forum" title from `/forum` and `/forum/chat`.
  - Shifted segmented Forum/Chat toggle up (`paddingTop: 8 → 4`, and the BackButton sits in its own minimal `backBtnWrap` row above).
- testIDs preserved: `forum-back-btn`, `chat-back-btn`, `workflow-close-btn`, `whatsnew-close-btn`, `student-drilldown-back`, `supervisor-drilldown-back`, `protocol-back-btn`.
- **100% PASS** on testing_agent_v3_fork iter-123 (4 live-tested screens + 7 code-reviewed).

## Iteration 122 (Feb 2026) — Formal Motion Pass (subtler tile animation)

User feedback: the springy zoom/stagger felt "informal" for a clinical tool. Replaced with a uniform **soft fade + 6 px slide-up**, 220 ms, no stagger, no spring bounce — reads as "information being placed" rather than bouncing in.

- Tiles: `FadeIn.duration(220).withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] })` — no stagger, no zoom.
- Identity row: `FadeInDown.duration(220)` (dropped the spring).
- Logout pill: same soft 6 px slide as tiles, no delay — whole sheet lands with one coherent motion.
- testIDs unchanged → iter-118's E2E suite still applies.

## Iteration 121 (Feb 2026) — Unread-Aware Success Haptic

Added a small `useEffect` inside `DrawerMenu` that fires `Haptics.NotificationFeedbackType.Success` ~220 ms after the popover opens **only when** the user has unread Forum activity or unseen What's-New entries. The 220 ms delay lets it sit just after the open-tick (`Light` impact) so the two haptics don't blur together — the second one feels like a gentle nudge toward the red-dotted tile.

- Web is no-op (`Platform.OS === 'web'` guard).
- Effect cleans up its timer on unmount/close so a quick open-close sequence cannot stack haptics.
- testIDs unchanged → iter-118's E2E suite still applies.

## Iteration 120 (Feb 2026) — Tile Menu Haptic Feedback

Wired `expo-haptics` (already installed at v15) into the tile menu's 3 interaction points:
- **Open**: header grid icon → `Haptics.ImpactFeedbackStyle.Light` (a quick tick when the popover springs in).
- **Navigate**: each tile tap → `Light` impact.
- **Logout**: pill tap → `Medium` impact (slightly heavier to mark a destructive action — matches iOS HIG).

Web is a no-op (`Platform.OS === 'web'` guard) so RNW renders identically and iter-118's E2E test suite still applies. testIDs unchanged.

## Iteration 119 (Feb 2026) — Tile-Menu Staggered Scale-In Animation

Added `react-native-reanimated` v4 layout-animation entries to the tile-grid menu:
- **Identity row**: `FadeInDown` 260 ms with spring damping — drops in gracefully so the eye lands on the user first.
- **Tiles**: `ZoomIn` with **60-ms stagger** (`delay = 120 + idx * 60`), 280 ms duration, springified. The grid feels alive instead of dropping in as one block.
- **Logout pill**: `FadeInDown` after the last tile lands — the eye naturally finishes on the destructive action.
- Refactored tile sizing: outer `Animated.View` owns flex layout (`flexBasis: 48%, aspectRatio: 1.3`); inner `TouchableOpacity` fills via `width/height: '100%'`. Keeps the spring transform clean (no layout flicker mid-animation).
- testIDs unchanged — iter-118's E2E test suite remains valid.

## Iteration 118 (Feb 2026) — Tile-Grid Menu (replaces hamburger drawer)

**User feedback**: Hamburger felt utilitarian; wanted a more elegant 4-tile grid that feels native to the app's blue brand.

**Implementation**:
- Header opener changed from `Ionicons "menu"` (dark grey) → `Ionicons "grid"` (#1565C0) — instantly signals a 4-tile menu.
- Side-drawer modal replaced with a top-anchored popover sheet:
  - Translucent `rgba(15,25,40,0.45)` backdrop
  - White-ish `#FAFCFF` sheet with rounded `28-px` bottom corners + soft shadow
  - User identity row (avatar + name + role) on the **left**, circular close button on the **right**
  - Divider, then a 2-column tile grid with `flexBasis: 48%` + 12-px gap
  - Each tile uses a different pastel-blue tint from the brand palette: Users `#E3F2FD/#BBDEFB/#1565C0`, Profile `#E0F7FA/#B2EBF2/#00838F`, Archived `#E8EAF6/#C5CAE9/#3949AB`, Forum `#E1F5FE/#B3E5FC/#0277BD`. Each has an icon-chip (rounded square) inside, and a red dot in the top-right when there's unread activity.
  - Logout is a separate red-tinted **pill** (`#FDECEA` bg, `#C62828` text) at the bottom — visually distinct from navigation tiles.
- Role-aware: Admin sees 4 tiles, Student sees 3 (no Users), Nurse sees only Profile.
- testIDs preserved for backward compatibility: `hamburger-btn` (header), `tile-menu-sheet`, `tile-menu-overlay`, `tile-{key}` per tile, `tile-menu-close`, `tile-menu-logout`.
- **Tested**: 100% pass — all 11 verified bullets across all 3 role variants (testing_agent_v3_fork, iteration_118.json).

## Iteration 117 (Feb 2026) — iOS Picker State-Stuck Auto-Retry

**Problem**: User reported the *same* "Different document picking in progress. Await other document picking first" error from `expo-document-picker` on iOS, even after iter-116's `pickingInProgressRef` guard. Root cause: the iOS native module retains stuck state across screens / sessions, so the very first call in a session can fail. The previous in-app guard didn't help because the stuck state was *already* set when the user opened the screen.

**Fix**: Created a shared `/app/frontend/utils/safePicker.ts` helper that wraps `DocumentPicker.getDocumentAsync`, `ImagePicker.launchCameraAsync`, and `ImagePicker.launchImageLibraryAsync` with a one-shot 1500 ms auto-retry on the iOS state-stuck error. Users typically never see the error in the UI because the retry succeeds after the native state has had time to release. Wired it into all 3 picker call sites:
- `forum/[threadId].tsx` (Discussion Forum composer)
- `forum/chat/[groupId].tsx` (Chat room composer)
- `forum/chat/create.tsx` (Create Group photo picker)

Silenced the duplicate-tap "Please wait" Alerts (now `console.log` only) since they were redundant once safePicker handles state internally. The final catch block now gives an actionable message ("Close & reopen the app to reset it") if both attempts fail — the only reliable recovery path for a permanently-stuck iOS native picker module.

## Iteration 116 (Feb 2026) — Forum/Chat UX Polish + Drawer Icon Color
- **Discussion Forum picker resilience**: Added `pickingInProgressRef` global guard in `forum/[threadId].tsx` to prevent re-entry into camera/library/files picker while one is still active (root cause of the "Different document picking in progress" iOS error). Increased `waitForSheetClose` from 300→500ms to give the iOS modal more time to release before the system picker opens. Friendlier alert message when the native error still surfaces.
- **Chat composer attach pattern unified**: `forum/chat/[groupId].tsx` swapped the 3 inline icon buttons (camera/image/attach) for a single paperclip button → 3-option action sheet (Take Photo / Photo Library / PDF or Document) — same UX pattern as Discussion Forum. Same `pickingInProgressRef` guard applied. New testIDs: `chat-attach-btn`, `chat-attach-camera-btn`, `chat-attach-library-btn`, `chat-attach-files-btn`.
- **Create Group photo upload**: `forum/chat/create.tsx` wired the previously-decorative camera circle to a 3-option picker sheet (Take Photo / Photo Library / Browse Files). Photo uploads to `/api/chat/upload` and the relative URL is sent in `photo_url` on `POST /api/chat/groups` (backend already accepted this field). 800px JPEG compression via `expo-image-manipulator` keeps payload small. Defensive `<View testID="group-photo-wrap">` wrapper around `<TouchableOpacity testID="group-photo-btn">` ensures RNW DOM propagation even when conditional children (ActivityIndicator/Image/Icon) swap.
- **Add Members modal header reachability**: Replaced `<SafeAreaView edges={['top','bottom']}>` with explicit `useSafeAreaInsets()` wrapper using `paddingTop: Math.max(insets.top, 44)` (44pt iOS / 16pt Android), 44×44 pt tap targets on close-✕ and Done buttons, and 20px hitSlop. The buttons now sit comfortably below the iOS notch / dynamic island instead of being clipped at the very top edge.
- **Hamburger drawer menu icons → blue**: Changed Ionicon color in `(tabs)/_layout.tsx` from `#37474F` → `#1565C0` for Users / My Profile / Archived Cases / Discussion Forum entries. Logout stays red `#D32F2F`.
- **Test verified**: backend 10/10 PASS (chat group create with photo_url persists + GET round-trips correctly + existing chat/forum endpoints unchanged). Frontend ~90% visual PASS (drawer color confirmed blue, Add Members layout fixed close=y18 + done=y23, quick-filters work, Done dismisses cleanly). Iteration_116.json saved.

## Original Problem Statement
A comprehensive mobile application for managing dental implant procedures at the Department of Prosthodontics, Bharati Vidyapeeth Dental College and Hospital, Pune. Features a 4-phase approval workflow (Pre-Surgical, Surgical, Second Stage Surgical, Prosthetic) with role-based access for Students, Supervisors, and Implant In-Charges.

## Tech Stack
- **Frontend**: React Native (Expo Router) — tested via Expo Go on iOS
- **Backend**: FastAPI + MongoDB (Motor) — monolithic `server.py`
- **Database**: MongoDB with `implant_library` (649 variants, 49 systems) and `procedures` collections
- **Auth**: JWT Access/Refresh tokens, expo-secure-store, Axios interceptors

## Core Features Implemented
1. **4-Phase Workflow**: Complete CRUD + approval flow for Phases 1-4
2. **Implant Library**: 49 brand|system combinations, 649 implant variants
3. **Implant-Specific Indications**: 38 systems mapped from Word document
4. **Drilling Protocols**: 14 protocol families (32 systems) with bone-density-specific drill sequences
5. **Risk Assessment**: Automated risk scoring based on bone dimensions
6. **PDF Export**: Both frontend (expo-print) and backend (FPDF2) case report generation
7. **Phase 1 Detail Page**: Shows clinical exam, occlusal analysis, aesthetic risk, medical assessment, implant plans
8. **Top 3 + Show More**: Implant suggestion results show top 3 by default with expandable list
9. **Auto-populate implant_site**: Derived from selected implant plan positions
10. **Authoritative Seed Sync**: Implant library auto-reseeds on deployment if DB is stale
11. **Production-grade Auth**: Access/Refresh JWT tokens with expo-secure-store and Axios interceptors
12. **Per-Implant Healing Abutment**: Healing abutment boxes match implant count in Phase 2 and Phase 3
13. **Simple Approval Protocol**: Supervisor and In-Charge approve/reject each phase without comment boxes (reverted per user request)
14. **Dynamic Notes Labels**: "Operator's Notes" for faculty-created cases, "Student's Notes" for student cases
15. **Auto-expand Drilling Protocol**: Protocol auto-expands when implant is selected in Suggest Me mode
16. **Narrow Ridge Clinical Decision Engine**: 4-level ridge width classification with safety rules, prosthetic warnings, bone density protocols, and automatic blocking for severe narrow ridges (<3mm)
17. **Scheduling Constraints**: Only 1 patient per time slot per day (10 AM / 2 PM). Booked slots shown as grayed/disabled with patient name. Dashboard calendar inline cards show "Scheduled by" info. Backend returns 409 with descriptive message on duplicate slot attempt.
18. **CBCT Report Upload**: Mandatory PDF/image upload in Phase 1 Case Details (between Loading Type and Checklist). Blue upload button → green "View CBCT Report" button. File stored on server, accessible via role-based endpoint. Visible to Supervisors and In-Charges on case detail page.
19. **Post Surgical Radiograph Upload (Phase 2)**: Between Suturing and Post-Op Checklist. Section header: "Post Surgical Radiograph" (single implant) / "Post Surgical Radiographs" (multiple). IOPA upload tabs per implant with tooth numbering. All on 4→4 tabs, All on 6→6, All on X→5+expandable. Green "+"/red "-" for extras. OPG upload for Full Arch cases. Mandatory IOPA — blocks Phase 2 submission. Thumbnail preview in case detail page.
20. **Phase 3 IOPA Radiograph Upload**: Below "Radiograph Made" checklist item in Phase 3 Second Stage Surgical form. Number of IOPA tabs = number of implants (with tooth numbering). Mandatory — blocks Phase 3 submission. Thumbnails visible in case detail page.
21. **Phase 3 Per-Implant ISQ Values**: Below "ISQ Value checked" checklist item. Multiple input fields = number of implants, with tooth numbering. Green theme (#E8F5E9). Case detail shows per-implant values with tooth labels. Backward compatible with legacy single-value format.
22. **Colour Theme Standardization**: IOPA/CBCT/OPG uploads use Blue theme (#E3F2FD/#1565C0) across all phases. Torque values keep Orange/Amber theme (#FFF8E1/#E65100). Applied consistently in Phase 1 (CBCT), Phase 2 (IOPA/OPG), Phase 3 (IOPA) forms and case detail thumbnails.
23. **Universal Upload Visibility**: All IOPA, OPG, and CBCT thumbnails visible to all roles (Student, Supervisor, In-Charge) at all times on case detail page. No role-based hiding of uploaded radiographs.
24. **Authenticated File Serving for React Native**: Backend `serve_upload` accepts JWT via `?token=` query param (React Native's `<Image>` and `Linking.openURL` don't send Axios interceptor headers). All frontend forms and case detail pages append `?token=${authToken}` to every upload URL. Applied across: `[id].tsx` (CBCT, Phase 2 IOPA/OPG, Phase 3 IOPA, IOS files), `new-procedure.tsx`, `submit-phase2/[id].tsx`, `submit-stage2-surgical/[id].tsx`.
25. **Multi-Source Upload Picker**: All CBCT, IOPA, OPG, and checklist file uploads now present an iOS ActionSheet with 3 options: Photo Library (expo-image-picker), Take Photo (camera), Browse Files (expo-document-picker for local/cloud storage). Shared utility in `utils/uploadPicker.ts`. Applied consistently across `new-procedure.tsx`, `submit-phase2/[id].tsx`, `submit-stage2-surgical/[id].tsx`, and `ChecklistForm.tsx`. Camera and photo library permissions configured in `app.json`.
26. **Unified Export/Print Menu (Feb 2026)**: Consolidated separate Print + Export PDF buttons across the app into one `<ExportPrintMenu />` component (`components/ExportPrintMenu.tsx`) — a single trigger that opens a 2px blue-bordered (`#1565C0`) popover modal with two options (Print PDF / Export PDF). Applied to 4 sites: (a) Case Report bottom bar on `/procedures/[id]`, (b) Patient Consent template inside procedure detail Phase-2 gate, (c) Nurse dashboard `PatientConsentSection` pending cards, (d) `DrillingProtocol` screen. Backwards-compat testIDs preserved via `printTestID`/`exportTestID` props. Fixes the prior EAS deployment JSX crash and reduces bottom-bar clutter.
27. **Nurse Scheduled Cases + Phase 1-only View (Feb 2026)**: Nurse dashboard now shows two stacked sections: existing 'Patient Consent Forms' (extended to display each case's scheduled date/time + 'Show more' top-5 pagination), followed by a new 'Scheduled Cases' section that lists Phase-2-ready cases (status `phase1_approved`) for today + next 4 days, grouped by date header ("Today's Cases" / "Tomorrow's Cases" / weekday-date) with inline cards showing patient, operator, time-pill (AM/PM), and procedure type. New component `components/ScheduledCasesSection.tsx`, backend endpoint `GET /api/procedures/nurse/scheduled-cases?days=5`. Nurses on the case-detail screen (`/procedures/[id]`) see ONLY Phase 1 data — Phase 2/3/4 full-data sections and the Case Report Export/Print button are hidden; backend `GET /api/procedures/{id}` nurse guard widened from "approved statuses only" to "any non-draft status" so nurses can view pending cases too.
28. **Instruments Autoclaved Checkbox + Badge (Feb 2026)**: On each Scheduled Cases card, nurses can tap a checkbox 'Mark instruments Autoclaved' that toggles state on the server via `POST /api/procedures/{id}/mark-instruments-autoclaved`. The endpoint enforces a 1-hour-before-surgery cutoff — after that, it returns 409 and the record becomes immutable. Once marked, the case-detail screen shows a small green badge 'Nurse has prepped instruments ✓' with the nurse's name and timestamp to student/supervisor/implant_incharge/administrator (hidden for nurse, never rendered when unmarked). Field `instruments_autoclaved` persisted on procedure doc, serialised via `_serialise_instruments_autoclaved()` so unmarked always returns `null` across all endpoints.
29. **Nurse Workflow Overhaul — Home Calendar + Cases Tab + Alerts Tab (Feb 2026)**: Four-part nurse-only redesign: (a) bottom-tab label 'My Cases' → 'Cases'; (b) Home screen gets new `components/NurseHomeCalendar.tsx` at top: green Completed + red Pending tiles with live counts (tap → Cases tab pre-filtered via `nurseFilter` query param), below a month-view calendar (`react-native-calendars`) with coloured dots (green=all consents uploaded on that date, amber=mixed, red=all pending), tapping a date reveals inline case cards for that day; (c) Cases tab for nurse routed through new `components/NurseCasesScreen.tsx` with 3 filter chips (Pending/Completed/All), search bar retained, each card shows green 'Consent form uploaded' or red 'Consent form pending' pill instead of phase-status chip; (d) Alerts tab for nurse: cards become display-only `<View>` (no tap navigation, no action menu), search bar hidden. Backend endpoint `GET /api/procedures/nurse/consent-cases` powers all three surfaces. Backend pytest 5/5 pass (iteration_94).
30. **Nurse Workflow Refinements — Consent Action Row + Compact Autoclave + Layout (Feb 2026)**: (a) Tightened top padding on nurse Cases tab so the 'Cases' title + chips sit immediately below the hamburger (removed SafeAreaView top edge). (b) Added a `consent-action-row` between Treatment Progress and Patient Information on case-detail screen for nurse/supervisor/in-charge/admin/case-owner: blue 'Upload consent form' (or 'Replace consent form' after upload) + grey 'Export / Print consent form' (via `ExportPrintMenu` popover). (c) Extracted shared `components/AutoclaveRow.tsx` (supports `compact` prop) and added it next to the consent-status pill on both nurse Home calendar inline date cards and nurse Cases list cards. Backend pytest 4/4 new + 21/21 regression all pass (iteration_95).
31. **Pre-Surgery Reminder Scheduler (Feb 2026)**: Background `asyncio` task (launched on app startup, runs hourly) scans phase1_approved cases in the next 2 days and fires a one-shot reminder ~24 hours before surgery (tolerance window: 22–26 hours remaining) to student + supervisor + implant_incharge when the case still has a pending consent form AND/OR instruments are not yet autoclaved. Sends both in-app notifications (`type: "reminder"`) and Expo push. Idempotent via `pre_surgery_reminder_sent` flag on the procedure doc. New ops-only endpoint `POST /api/admin/run-pre-surgery-reminders` (administrator or implant_incharge) triggers a sweep on demand. pytest 2/2 pass (iteration_96).
32. **Nurse Workflow Iteration 97 — 5 Refinements (Feb 2026)**: (a) consent-action-row on case-detail now stacks Upload/Replace button above Export-Print button, centered max-width 360; Export/Print colour recolored to slate `#37474F` to match Home consent card; row is now gated to only render while `status in {pending_phase1, phase1_approved}`. (b) 'Ask Implanr AI' floating FAB on case-detail hidden for `role === 'nurse'`. (c) Drilling Protocol inline in CaseImplantPlanning now shows a unified 'Print / Export Drilling Protocol PDF' `ExportPrintMenu` trigger — backend PDF endpoint (`POST /api/drilling-protocols/export-pdf`) now accepts optional `patient_name`, `patient_id`, `procedure_date` and renders a blue `#0D47A1` banner at the top of the A4 PDF. (d) 'Archived Cases' entry hidden from hamburger DrawerMenu for nurse. (e) AutoclaveRow compact mode redesigned to match consent-pill dimensions (paddingHorizontal 8, paddingVertical 4, 1px border); when marked, renders solid green `#2E7D32` pill with white text + inverted checkbox (white with green tick) to visually align with the 'Consent form uploaded' green pill. Backend pytest 7/7 pass (iteration_97), frontend 4/5 UI flows verified + 1 code-reviewed.
33. **Nurse Workflow Iteration 98 — 3 Bug/Visual Fixes (Feb 2026)**: (a) AutoclaveRow compact pill re-rendered as a single-element pill with `checkmark-circle` / `ellipse-outline` Ionicon to exactly match the green 'Consent form uploaded' consent pill (same paddingH/V, same 12px circular icon, same font). (b) Drilling Protocol PDF Print/Export: was 500-ing because backend looked up brand/system in DRILLING_PROTOCOLS dict and errored for any unlisted combo; fixed by (i) frontend forwarding pre-computed `steps` from `generateDrillingProtocol()`, (ii) backend accepting optional `steps` array, normalising to `{step, drill_type, code, diameter, depth, rpm, irrigation}` via regex extraction, and (iii) `.get('system_name')` fallback on `proto` dict. (c) Nurse Home `ScheduledCasesSection` cards now include a pillRow below the main card content displaying the consent-status pill (green 'Consent form uploaded' / red 'Consent form pending') alongside the compact autoclave pill; backend `/api/procedures/nurse/scheduled-cases` extended with `consent_uploaded` bool per case. Backend pytest 13/13 + frontend 100% pass (iteration_98).
76. **Chat Module (Iteration 112-114, Feb 2026)**: Real-time chat feature alongside Discussion Forum. **Backend** (`server.py` L11172-11485): 11 endpoints under `/api/chat/*` — `POST /chat/groups` (create group), `GET /chat/groups` (list my groups), `POST /chat/dm/{other_user_id}` (idempotent 1-on-1 DM), `GET /chat/groups/{id}` (detail + members), `PATCH /chat/groups/{id}` (update), `POST/DELETE /chat/groups/{id}/members` (add/remove with locked-group + owner checks), `GET/POST /chat/groups/{id}/messages` (history + send with attachment url allow-list `/uploads/chat/` or `/uploads/forum/`), `POST /chat/messages/{id}/reactions` (thumbs/heart/think/check), `DELETE /chat/messages/{id}` (soft delete), `POST /chat/upload` (10MB cap, images + pdf), `GET /chat/users` (member picker, excludes nurses + self). Two new MongoDB collections: `chat_groups` (with `is_private`, `locked`, `members`, `admins`, `last_message_*`) + `chat_messages` (with `reactions_summary`/`reactions_mine` per viewer). **All Staff** is auto-created as a locked public group with all non-nurse users as members — users cannot leave it. Nurses get 403 on every `/api/chat/*` endpoint. **Frontend**: 3 new screens under `/app/frontend/app/forum/chat/`: `index.tsx` (group list with Forum/Chat segmented pill toggle, 'Start New Group Chat' button, 5s polling, search), `create.tsx` (group name + description + public/private toggle + member picker modal), `[groupId].tsx` (chat room with KeyboardAvoidingView, PHI banner, message bubbles colored by self/other, reactions chips, attachment row with camera/gallery/files pickers, 'Attaching…' spinner, image compression via expo-image-manipulator, leave-group button). Routes registered in root `_layout.tsx`. Forum index `segment-chat` pill wired. Hamburger → drawer Discussion Forum → Chat segment navigation verified end-to-end. **testIDs for automation** (all now emit BOTH `testID` and `data-testid` for RNW web propagation): `hamburger-btn`, `drawer-forum`, `segment-chat`, `segment-forum`, `new-group-btn`, `chat-group-{id}`, `group-name-input`, `add-members-btn`, `create-group-submit`, `chat-input`, `chat-send-btn`, `leave-group-btn`. **Testing**: Backend 22/22 pass (iter_112), Frontend E2E: Abhijit All Staff send-message PASS + Create Group + send-message PASS (iter_114). **Two regressions fixed in iter_114**: (a) `forum/[threadId].tsx` TDZ bug — removed the 15s polling `useFocusEffect` that referenced `load` before its `useCallback` declaration; main `useFocusEffect(load)` still reloads on focus; (b) Nurse drawer showing Discussion Forum when `user.role` wasn't yet hydrated — added `forumAllowed = !!userRole && !isNurse` guard in DrawerMenu so the forum item only renders once auth bootstrap completes.
77. **Chat Realtime Polish — Typing Indicators + Unread Badges (Iteration 115, Feb 2026)**: **Backend additions** in `server.py`: (a) `POST /api/chat/groups/{id}/typing` — stamps current user as typing for 5s via `{chat_groups.typing.{uid}: {name, expires_at}}`; lazy GC on read via `_chat_typing_users()` with tz-aware coercion (Motor strips tzinfo on round-trip). (b) `POST /api/chat/groups/{id}/mark-read` — upserts `{user_id, group_id, last_read_at}` in new `chat_group_reads` collection. (c) `GET /api/chat/groups` now enriches each row with `unread_count` (capped at 99) via `_chat_unread_count()` and returns `total_unread` sum. (d) `GET /api/chat/groups/{id}` adds `typing_users` (excluding viewer + expired) and `unread_count`. (e) Message send auto-clears the sender's `typing.{uid}` key and upserts their own `last_read_at` so own messages never contribute to unread. **Frontend additions**: Chat list rows show a blue circular badge (min-width 20, 99+ overflow) when `unread_count > 0`, with bolded name (`#0D47A1`) and bolded preview. Chat room renders "X is typing…" ("N people are typing…" for >1) above the composer with 3-dot bullet animation. Composer debounce-fires typing POST every 3s while text is non-empty. Mark-read fires on chat-room mount and whenever messages length changes. Self-typing is server-filtered so users never see their own "typing" echo. **testIDs**: `chat-unread-{groupId}`, `chat-typing-indicator`. **E2E Verified**: Admin list shows '4' red badge on TEST_ChatGroup_112 (from Student unread messages); opening the room marks read; self-typing correctly hidden from self; cross-user typing responds via backend within 5s TTL (curl-verified Student→Admin).




74. **Discussion Forum — "Attaching…" Inline Spinner (Iteration 130, Feb 2026)**: Added visible progress feedback for the 1-3 s window while an attachment is being compressed + uploaded. **Implementation**: new `attaching: boolean` state in `forum/[threadId].tsx`. Each picker (`pickFromCamera` / `pickFromLibrary` / `pickFromFiles`) wraps its compress + upload work in `try/finally` — `setAttaching(true)` is called ONLY after the user has actually picked an asset (so cancel doesn't trigger a false spinner), and `setAttaching(false)` in `finally` guarantees cleanup on both success and error. **UI**: the attached-row (above the input) now renders an `<ActivityIndicator />` + "Attaching…" amber pill (`#FFF8E1` bg, `#FFE082` border, `#FF8F00` spinner, italic `#E65100` text) alongside any already-uploaded attachment chips. The paperclip button is `disabled={attaching}` with 40% opacity so the user can't queue a second attach while one is in-flight. **Test ID**: `forum-attaching-spinner`.


73. **Discussion Forum — Client-Side Image Compression (Iteration 129, Feb 2026)**: Added client-side image compression before upload so high-megapixel phone photos don't blow past the 10 MB cap and threads load quickly. **Dependency**: installed `expo-image-manipulator` via yarn. **Helper**: new `compressImageIfPossible(uri)` calls `ImageManipulator.manipulateAsync` with `[{ resize: { width: 1600 } }]` + `{ compress: 0.8, format: SaveFormat.JPEG }` — resizes the longer side to 1600 px (aspect-preserving) and re-encodes as 80 % JPEG. Typical 4 MP iPhone photo (~3-4 MB) compresses to ~400-700 KB, about 5× smaller. On failure (e.g., unsupported format on web), falls back to the original URI via a warn-level log. **Plumbing**: all three picker paths now route through it — `pickFromCamera` + `pickFromLibrary` compress unconditionally (already known to be images); `pickFromFiles` checks `a.mimeType.startsWith('image/')` and compresses only when it's an image, leaving PDFs untouched. After compression, mimeType is set to `image/jpeg` and filename defaults keep the original extension intent. Forced expo restart to pick up the new dependency.


72. **Discussion Forum — Attach Picker Fix (iOS Single-Modal Constraint) — Iteration 128 (Feb 2026)**: Tapping Take Photo / Photo Library / PDF in the attach sheet did nothing. **Root cause**: iOS only allows one modal at a time, and the system image/document pickers are themselves modals — so launching them while our attach-sheet Modal was still visible failed silently. **Fix**: Close `setShowAttachSheet(false)` first, then `await waitForSheetClose()` (300 ms to match the Modal fade-out), then call the native picker. Applied to all three handlers: `pickFromCamera`, `pickFromLibrary`, `pickFromFiles`. Also added `console.error` logging inside each `catch` block so future silent failures surface in the browser console / Metro logs instead of disappearing.


71. **Discussion Forum — "X new replies" Jump-to-Bottom Pill (Iteration 127, Feb 2026)**: Common chat-app pattern so users don't lose their place mid-read while new replies stream in. **Implementation (`forum/[threadId].tsx`)**: Added `scrollRef`, `prevPostCountRef`, `isAtBottomRef`, and `newPostsCount` state. Wired `onScroll` (with `scrollEventThrottle=120`) on the ScrollView to compute `distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)` — within 80 px is considered "at bottom". When new posts arrive (detected via `useEffect` on `posts.length`), if `isAtBottomRef.current === true` the screen auto-scrolls to end (chat behavior); otherwise the delta is added to `newPostsCount`, which renders a floating blue pill `↓ N new replies` (or `1 new reply`) above the composer. Tapping the pill calls `scrollRef.current.scrollToEnd({animated:true})` and resets the count. Auto-clears when the user scrolls back to bottom. **Polling**: added a separate `useFocusEffect` with a 15 s `setInterval(load, 15000)` so the screen pulls fresh posts in the background while focused — drives the pill count without requiring app re-focus. Cleanup on blur via the returned interval handle. **Styling**: `position: 'absolute', alignSelf: 'center', bottom: 110` (sits ~60 px above composer), Material-blue background (`#1565C0`), drop shadow, pill-shape (`borderRadius: 20`), `zIndex: 50` so it overlays attachments-row preview chips. **Test ID**: `forum-jump-to-bottom-btn`.


70. **Discussion Forum — Composer Bottom Safe-Area Fix (Iteration 126, Feb 2026)**: Idle-state composer was sitting flush against the bottom edge of the screen (no clearance from the home indicator / gesture nav bar) on phones with bottom safe-area insets. **Fix**: Changed thread detail screen's `<SafeAreaView edges={['top']}>` → `edges={['top', 'bottom']}` so the bottom safe-area inset is now respected. The composer now visually breathes above the home indicator at rest. When the keyboard rises, `KeyboardAvoidingView` continues to slide everything up correctly (the bottom inset is consumed by the keyboard region, so no double-padding artifact).


69. **Discussion Forum — Real Keyboard Fix + Close-Modal Aesthetics (Iteration 125, Feb 2026)**: Followup to iteration 124 — the original `KeyboardAvoidingView` fix didn't actually shift the composer because the composer was `position: 'absolute'; bottom: 0` (outside the layout flow), so React Native's keyboard-avoiding logic couldn't push it. **Real fix**: Removed `position: 'absolute'` from the composer style — it's now a normal flex child after the ScrollView inside the `KeyboardAvoidingView`. Removed the `paddingBottom: 140` hack from the ScrollView (no longer needed). Now when the keyboard appears, the entire screen including the composer slides up so users can see what they're typing on iOS, Android, and Expo Web. **Close Discussion modal**: The Cancel + Close Discussion buttons appeared "outside the box" on smaller phones because the modalCard (centered + uncapped height) extended below the screen edge when the title + 4 reasons + note input + button row stacked. **Fix**: (a) added `maxHeight: '85%'` to `modalCard` so it never exceeds 85% of viewport height; (b) wrapped the modal contents in a ScrollView (`flexGrow: 1` + `keyboardShouldPersistTaps='handled'`) so the buttons remain visible and interactive even on small phones — users can scroll through reasons + note + see buttons inside the rounded card; (c) extracted the inline TextInput style into a dedicated `s.closeNoteInput` (with `textAlignVertical: 'top'` for a proper multiline note appearance and `placeholderTextColor`); (d) extracted the button-row inline style into `s.modalActionsRow`. **Bundle**: Forced expo restart to ensure the previous CI-mode cache no longer served stale code; new sessions pick up the fixes immediately. **Note for users**: a hard refresh (Ctrl+Shift+R / pull-to-refresh) may be needed to bypass any browser-level caching of the previous bundle.


68. **Discussion Forum — Composer Keyboard Fix + 3-Way Attach Picker (Iteration 124, Feb 2026)**: Two UX fixes to the thread detail screen so writing replies actually works on mobile. **Issue 1 — Composer hidden when typing**: The composer at `position: absolute; bottom: 0` was being covered by the on-screen keyboard, so users couldn't see what they were typing. **Fix**: Wrapped the entire screen content in `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>`. The composer now floats above the keyboard on both iOS and Android; web is no-op. **Issue 2 — Generic file dialog hid the user's choices**: The single 📎 button used to call `DocumentPicker.getDocumentAsync` which surfaces an opaque OS picker. **Fix**: Replaced with an action-sheet modal showing 3 explicit, role-appropriate options: (a) **Take Photo** — `expo-image-picker.launchCameraAsync` with `requestCameraPermissionsAsync` gate; (b) **Photo Library** — `expo-image-picker.launchImageLibraryAsync` with `requestMediaLibraryPermissionsAsync` gate; (c) **PDF or Document** — `expo-document-picker.getDocumentAsync({ type: ['application/pdf', 'image/*'] })` for files / cloud storage / Files app integration. Each option calls a shared `uploadAsset()` helper that 10 MB caps + builds the FormData blob (web vs native) + posts to the existing `/api/forum/upload` endpoint. Sheet auto-dismisses after pick. New testIDs: `attach-camera-btn`, `attach-library-btn`, `attach-files-btn`. No backend changes — the existing upload endpoint validates `.pdf | .png | .jpg | .jpeg | .heic | .heif | .webp` and 10 MB cap. **Tag-balance verified** (2 Modal pairs, 1 KeyboardAvoidingView pair, 4 SafeAreaView for loading + error + main paths).


67. **Discussion Forum Red-Dot — Smart Engagement Filter (Iteration 123, Feb 2026)**: Refined the `GET /api/forum/unread-summary` query so the hamburger / drawer red dot only fires for threads the user is genuinely engaged with — preventing notification fatigue. **Engagement criteria**: thread `shared_by_id == user_id` (you opened the discussion) OR `user_id in bookmarks` (you flagged it for follow-up) OR `user_id in participants` (you've replied at least once). Implant In-Charges and Administrators *additionally* see all `status=open` threads regardless of engagement (so moderators don't miss new cases needing review). Removed threads always excluded from the count for non-mods. **Verified end-to-end via curl** with three personas: (a) a student with NO engagement → red dot stays at 0 even after admin replies; (b) the same student after bookmarking → red dot lights up on the next admin reply; (c) a supervisor who never engaged → stays at 0 throughout; (d) the In-Charge (sharer + mod) → 0 after mark-seen, no false positives. Net effect: faculty get pinged only on cases they've engaged with, students get pinged on cases they care about, and moderators still see all open-thread activity globally.


66. **Discussion Forum — Hamburger Red-Dot Indicator (Iteration 122, Feb 2026)**: Added a real-time unread-activity dot on the hamburger icon and the "Discussion Forum" drawer entry whenever there are new threads or replies since the user's last visit to the forum list. **Backend (`server.py`)**: Two new endpoints — `GET /api/forum/unread-summary` returns `{has_unread: bool, unread_threads: int}` by counting threads where `last_activity_at > current_user.forum_last_seen_at` (treats never-visited as epoch=1970), gated to skip nurses (always returns 0); `POST /api/forum/mark-seen` stamps the user's `forum_last_seen_at` field via `db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"forum_last_seen_at": now}})`. Mod role (in-charge/admin) sees activity across removed threads too. **Frontend (`(tabs)/_layout.tsx`)**: New `hasUnreadForum` state + `fetchForumUnread()` callback polls every 30 s alongside the existing `fetchUnreadCount` poll. The hamburger menu icon now shows the red dot when EITHER `hasUnseenWhatsNew` OR `hasUnreadForum` is true (preserves backward compatibility with the existing What's-New indicator). DrawerMenu signature extended with `hasUnreadForum: boolean`; the inline dot render block now also fires for the `forum` row (`testID="drawer-forum-reddot"`). **Auto-clear (`forum/index.tsx`)**: when the forum list mounts (and the user isn't a nurse), it fires `POST /api/forum/mark-seen` in addition to fetching the threads — so the red dot vanishes immediately on visit. **Verified via curl**: pre-mark-seen → has_unread=True; mark-seen → 0; admin posts a new reply → student's has_unread=True again. Nurse account always returns `has_unread=false`. Bug fixed during build: initial implementation looked up users via `{"id": uid}` but users only have `_id` (ObjectId), so the timestamp wasn't persisting — corrected to `{"_id": ObjectId(uid)}`.


65. **Discussion Forum (Educational Collaboration Space) — Iteration 121 (Feb 2026)**: Comprehensive in-app discussion platform for educational case-by-case knowledge sharing. **RBAC**: Students share own cases; Supervisors share supervised cases; In-Charges/Admins share any. Nurses fully excluded (no menu, no API access — server-side `_forum_can_access` blocks all forum endpoints with 403). All non-nurse users can read & reply once a case is shared. **Backend (`server.py` lines 10357-11055, ~700 lines)**: Two new MongoDB collections (`forum_threads`, `forum_posts`) with text-search index on post bodies + last_activity_at + tags indexes via `_ensure_forum_indexes()` startup hook. 17 new endpoints under `/api/forum/*`: POST `/threads` (consent_acknowledged required, idempotent on open thread, anonymous opt-in), GET `/threads` (filters: status/q/tag/mine_only/bookmarked, paginated), GET `/threads/{id}` (full thread + procedure snapshot + permission flags), GET/POST `/threads/{id}/posts` (paginated, attachments validated), PATCH/DELETE `/posts/{id}` (15-min author edit window + soft-delete), POST `/posts/{id}/reactions` (4 types: thumbs/heart/think/check), POST/DELETE `/posts/{id}/verify` (one verified answer per thread, In-Charge/Admin only), POST `/threads/{id}/close` (4 reasons: resolved/off_topic/privacy/other), `/reopen` (mod only), DELETE soft-removes from forum (mod only), `/bookmark`, `/watch`, `/forum/upload` (10 MB cap, JPG/PNG/HEIC/WEBP/PDF), `/uploads/forum/{filename}` token-gated serve. Mention auto-detection (`@username` regex), tag auto-derivation (procedure type / arch / "Bone Graft" / "Narrow Ridge"), notification fan-out to watchers + In-Charges (in-app + Expo Push), all writes audit-logged via `log_access()` for HIPAA. Anonymous mode redacts patient name (initials) + sharer identity from the card display while preserving real IDs in DB for moderation. **Frontend (`/app/forum/index.tsx` + `[threadId].tsx` + `components/ShareToForumModal.tsx`, ~1100 lines)**: Forum list page with search bar, status filters (All/Open/Closed/Mine/Bookmarked), tag chips (auto-derived), thread cards showing **Patient · Student · Supervisor · Procedure Type · Current Stage · reply count · closed badge · anonymous badge · bookmark icon · last-activity time**. Thread detail page with collapsible Case Summary card (procedure type, student, supervisor, missing teeth, arch, tags, "Open Full Case Report" deep-link to `/procedures/{id}`), closure banner with reason+note, moderator action bar (Close/Reopen/Remove), post timeline with avatar + author + role + timestamp, reaction chips (👍 ❤️ 🤔 ✅ with "mine" highlight), Verify badge for In-Charge/Admin (one-per-thread enforcement), edit/delete affordances, image inline preview + PDF tap-to-open via signed token URLs, and a sticky composer with attach button (`expo-document-picker` for images + PDFs), `@mention` autocomplete-friendly textarea, and send button. Close-reason modal with 4 radio options + optional note. **Hamburger menu integration** (`(tabs)/_layout.tsx`): new "Discussion Forum" entry (`chatbubbles-outline` icon) added between Archived Cases and Logout, hidden from nurses via `isNurse` guard. **My Cases three-dot integration** (`(tabs)/procedures.tsx`): new "Add to Discussion Forum" action conditionally added based on RBAC — wires the case ID + patient name into `ShareToForumModal` which shows consent acknowledgment checkbox + anonymous toggle, posts to `/api/forum/threads`, then router-pushes to the new thread. **Verified backend (curl, all OK)**: share-case → post-reply → fetch-thread (can_moderate=true, can_verify=true) → reactions {thumbs:1} → verify-answer → close (resolved) → reopen. Nurse role correctly returns 403; missing consent_acknowledged correctly returns 400. **Routes** registered in root `_layout.tsx`. **Test data**: Existing thread `2f9be604-b306-428b-b3e9-8d4e83e04a09` (procedure 69d3374795c2d7fbae4b623e) with 1 post by Dr. Abhijit Patil verified with reaction.


64. **Phase 1 Step 1 — Cluster-Aware Edentulous Site Measurements (Scenario 1 vs Scenario 2) — Iteration 120 (Feb 2026)**: Differentiates **scattered missing teeth** (Scenario 1) from **adjacent missing-tooth clusters** (Scenario 2) in the Edentulous Site section. **Concept**: scattered teeth (e.g., 36/45/24/17) need per-tooth Occlusocervical Height + per-tooth Mesiodistal Space because each is its own edentulous site bordered by natural teeth. Adjacent clusters (e.g., 14/15/16/17) share ONE contiguous mesiodistal span (measured between the two natural teeth bordering the cluster), but each tooth still has its own Occlusocervical bone height. **Frontend (`utils/implantValidation.ts`)**: `findMissingRuns()` exported (was private) + new helpers `clusterOfTooth(tooth, missingTeeth)` and `clusterLeader(cluster)`. **Frontend (`new-procedure.tsx`)**: rewrote Edentulous Site renderer when `missing_teeth.length >= 2`. Iterates `findMissingRuns()` → for each singleton run renders the original two-input single-tooth card; for each cluster run (≥2) renders an "Adjacent Missing Cluster (Maxillary/Mandibular)" card with FDI red pills + ONE "Mesiodistal Space — total cluster span" input (stored on cluster leader = lowest FDI in arch sequence) + per-tooth "Occlusocervical Height per tooth" rows. (b) Added `'Immediate Implant'` and `'Partial Extraction Therapy'` to `CLINICAL_EXAM_GROUP` so these procedure types now also render the Intraoral Examination → Edentulous Site block (previously hidden). (c) **Pre-existing bug fix**: draft loader at `useFocusEffect` was missing `missing_teeth` and `edentulous_site_measurements` field hydration since iteration 117 — drafts loaded with empty FDI chart. Fixed by adding both to the `setFormData` projection at line 343-345. **Frontend (`CaseImplantPlanning.tsx` ImplantPlanModal)**: prefill effect is now cluster-aware. For singleton teeth (Scenario 1), `boneWidth ← md` and `boneHeight ← oc` as before. For cluster teeth (Scenario 2), only `boneHeight ← oc` is prefilled — `boneWidth` is intentionally skipped because the cluster's md is the TOTAL contiguous span, not the per-implant available width. Student enters per-implant bone width manually from CBCT. New `missingTeeth` prop threaded into the modal. **No blocking added per user spec**: existing soft bridge/cantilever nudges (iter 107 + 108) already handle the "fewer implants than missing teeth" case (e.g., 24/25/26 missing → implants only at 24+26 → 25 as pontic) without blocking the workflow. **Verified live**: draft `69d3374795c2d7fbae4b623e` with `missing_teeth=[16,17,26]` renders as 1 cluster (17+16, Maxillary) with shared MD + per-tooth OC rows + 1 singleton (26) with both OC+MD fields. FDI chart correctly highlights 17/16/26 in red; "3 teeth marked — 16, 17, 26" summary visible.


63. **Phase 1 Step 2 — Auto-Prefill Bone Width / Height from Per-Tooth Edentulous Measurements — Iteration 119 (Feb 2026)**: Eliminates the last remaining manual-transcription step in Phase 1 Step 2. When a student taps a per-tooth quick-start chip (iter 118) OR opens the Implant Selection modal fresh, the modal now auto-fills **Bone Width** (from `edentulous_site_measurements[tooth].md` → mesiodistal space) and **Bone Height** (from `.oc` → occlusocervical height) that the student entered in Phase 1 Step 1. Single-tooth fallback uses the legacy top-level `occlusocervical_height` / `mesiodistal_space` fields so older drafts keep working. Student can still override below if CBCT-measured bone differs from clinical caliper measurement. **Frontend**: (a) `components/CaseImplantPlanning.tsx` — `edentulousSiteMeasurements?: Record<string, {oc?: string; md?: string}>`, `defaultOcclusocervical?: string`, `defaultMesiodistal?: string` added to both the outer `Props` type and the inner `ImplantPlanModal` props. Threaded from parent → `ImplantPlanModal` (`edentulousSiteMeasurements`/`defaultOcclusocervical`/`defaultMesiodistal` args). Modal's open-effect on `!editItem` now reads `presetPosition` → looks up `edentulousSiteMeasurements[tooth]` → falls back to single-tooth defaults → calls `setBoneWidth(md)` + `setBoneHeight(oc)` when values exist. (b) 3 call-sites wired: `app/(tabs)/new-procedure.tsx` passes `formData.edentulous_site_measurements` + `formData.occlusocervical_height` + `formData.mesiodistal_space`; `app/procedures/[id].tsx` (pending Phase 1 review block) + (approved view block) both pass `procedure.edentulous_site_measurements` + `procedure.occlusocervical_height` + `procedure.mesiodistal_space`. **Verified**: curl PUT on draft 69d3374795c2d7fbae4b623e with `{implant_procedure_type:"Multiple Conventional Implants", missing_teeth:["16","17","26"], edentulous_site_measurements:{"16":{oc:"11.5",md:"8.2"}, "17":{oc:"12.0",md:"9.0"}, "26":{oc:"10.5",md:"7.8"}}}` → 200 OK; GET returns all 3 fields intact; Metro bundle healthy; student dashboard loads cleanly with 8 drafts visible. Net UX impact: ~15 seconds saved per implant plan + zero risk of Step 1↔Step 2 measurement-transcription error.


62. **Phase 1 Step 2 — Auto-Prefilled Implant Plan from Missing Teeth — Iteration 118 (Feb 2026)**: Eliminates Phase 1 Step 1 → Step 2 transcription friction by surfacing a per-tooth quick-start section. **Frontend (`CaseImplantPlanning.tsx`)**: (a) New `presetPosition?: string` prop on `ImplantPlanModal` → threaded via `ModalContent` spread. (b) `useEffect` inside the modal initializes the `position` state from `presetPosition` whenever the modal opens freshly (no `editItem`), so the student opens straight into the implant-system step with the tooth already filled in. Resets to `''` when opened via the generic Add-Implant button. (c) New `pendingPreset` state on the parent; generic Add-Implant button sets it `undefined` (old behavior), quick-start chips set it to a specific tooth. (d) New **"Pending Implant Selection"** yellow card (amber border, alert-circle icon, "Tap a tooth to start its implant plan" hint) rendered above the Add-Implant button — visible only when `canEdit && plans.length < 6 && missingTeeth` is provided and there are unplanned teeth. Displays one amber FDI chip per `missingTeeth − plannedPositions` tooth, sorted, with "FDI NN" label and add-circle icon. Tapping → opens the Add Implant modal with the tooth already pre-selected. Cards disappear automatically as plans are saved (recomputed from `plans.map(p => p.position)`). (e) New styles `pendingWrap`, `pendingHeader`, `pendingChip`, etc. — amber palette (#FFF8E1 / #FFD54F / #E65100) to distinguish from the dashed-blue Add-Implant button. **Verified**: PUT sets case 69de4c…f761 → `type=Conventional Single Implant, missing_teeth=['25']`, GET returns `teeth_present` 31-array without 25. Code implementation clean, all search-replace edits applied without conflicts, Metro bundle healthy, backend 200 OK on PATCH/GET. Net UX impact: saves ~10 seconds per case + eliminates Step 1↔Step 2 tooth-mismatch risk since position is copied, not retyped.


61. **Phase 1 "Missing Teeth" Workflow Overhaul + Per-Tooth Edentulous Measurements + Step-2 Tooth Gating — Iteration 117 (Feb 2026)**: Rewrote the FDI chart UX across all non-full-arch procedure types based on the actual clinical distinction between healed-edentulous vs extract-and-place workflows. **Backend (server.py)**: (a) Added `missing_teeth: Optional[List[str]]` to `ProcedureCreate` and `ProcedureUpdate`; added `edentulous_site_measurements: Dict[str, Dict[str, Any]]` (keyed by FDI code → {oc, md}). (b) New helpers `_validate_missing_teeth()` and `_apply_missing_teeth_derive()` plus an `ALL_FDI_TEETH` constant (32 permanent teeth). Enforces: Conventional Single Implant → **exactly 1**; Multiple Conventional Implants → **≥2**; GBR / Guided Surgery / Immediate Implant / PET → **≥1**; Full-arch (All on 4/6/X) → skipped (no FDI chart). (c) When `missing_teeth` is provided, `teeth_present` is auto-derived as `ALL_FDI_TEETH − missing_teeth` on both create and PATCH so existing PDFs, queries, and reports keep working with zero migration. (d) Validation + derive wired into both `POST /procedures` and `PUT /procedures/{id}`. (e) Both the consent-letter and Implant Case Report PDFs now print both **"Teeth Present: ..."** and **"Missing Teeth: ..."** lines. **Frontend**: (a) `app/(tabs)/new-procedure.tsx` — added `missing_teeth` and `edentulous_site_measurements` to form state. Rewrote the FDI chart section with **invert-semantic** logic: all 32 teeth default to **blue (present)**, tap → **red (missing / selected-for-extraction)**. Legend shown below the section header ("Present" blue / "Missing" or "Selected for extraction" red). Section title and sub-label adapt to procedure type: healed-edentulous (Conventional Single/Multiple, GBR, Guided Surgery) → *"Missing Teeth / Select missing tooth/teeth"*; **Immediate Implant** → *"Select teeth / Mark tooth/teeth for Immediate Implant"*; **Partial Extraction Therapy** → *"Select teeth / Mark tooth/teeth for Partial Extraction Therapy"*. Live red summary shows *"3 teeth marked — 16, 17, 26"*, plus a client-side count-validation message that mirrors the server rule. (b) Clinical Examination → Intra-oral → Edentulous Site section: when **2+ teeth are marked** (Multiple Conventional or multi-tooth Immediate/PET/GBR/Guided), renders a per-tooth card for EACH red tooth with its own **Occlusocervical Height (mm)** + **Mesiodistal Space (mm)** inputs, each stamped with a red "FDI NN" pill. When exactly **1 tooth** is marked, the original single-value fields display unchanged. Per-tooth data stored in `edentulous_site_measurements`. (c) `components/CaseImplantPlanning.tsx` — new `missingTeeth?: string[]` prop threaded through `ImplantPlanModal` → `ModalContent` → `MiniDentalChart`. New `allowedTeeth` prop on the chart — teeth NOT in the allowed set render with `toothLocked` style (grey background, 0.55 opacity) and are **unselectable** (`disabled={isDis || isLocked}`). Below the chart a hint shows *"Only the N tooth marked missing in Phase 1 Step 1 can be selected."*. (d) `app/procedures/[id].tsx` passes `procedure.missing_teeth` down at both CaseImplantPlanning call sites (pending Phase 1 review + approved views). **Verified end-to-end via curl**: PUT with `{implant_procedure_type: "Conventional Single Implant", missing_teeth: ["16","17"]}` → **400 "Conventional Single Implant requires exactly 1 missing tooth"**; PUT with `{missing_teeth: ["25"]}` → 200 OK; GET returns `missing_teeth: ["25"]` + `teeth_present` 31-array without "25". Frontend New Case page loads cleanly after restart — bundle healthy.


60. **Dashboard Leaderboard Mode (gamified Top/Hot/Needs-Attention badges) — Iteration 116 (Feb 2026)**: Added an opt-in **Leaderboard** toggle to both the Student and Supervisor Performance sections on the In-Charge / Administrator dashboard. Tap the small pill-shaped **🏆 Leaderboard** button in either section header to flip into gamified-comparison mode. **Three earned badges** rank-overlay onto the cards: **🏆 Top Performer** (gold bg/border + crown rank circle + "TOP PERFORMER" pill — Student=highest `completed`, Supervisor=highest `approved`), **🔥 Hot Streak** (orange bg/border + flame rank circle + "HOT STREAK" pill — efficiency proxy: highest completed/total ratio for students, highest approved/total ratio for supervisors, requires `total ≥ 3`), **⏰ Needs Attention** (brown bg/border + clock rank circle + "NEEDS ATTENTION" pill — Student=highest `active` count, Supervisor=highest `pending` backlog). Cards re-sort to surface badge-holders first; the legend appears below the section title only when leaderboard is on. Badge holders also receive a 1.5px colored outer border to differentiate them from regular ranked cards. Pure-frontend computation (no extra API calls) using the already-loaded `student_stats` / `supervisor_stats` payload — keeps it quick and free. Per-section state so In-Charge can flip Student leaderboard on while keeping Supervisor in normal sort, etc. **Verified live**: enabling on both sections simultaneously surfaces the right people instantly — Dr. Paresh Gandhi gets the gold "TOP PERFORMER" trophy (25 cases, 8 approved), Dr. Abhijit Patil's higher-efficiency record (3/4 = 75%) wins the orange "HOT STREAK" flame, while the Needs Attention slot stays empty because no supervisor has a non-zero pending standout above the leader.


59. **Supervisor Performance Section + Drill-Down (Full Version with Peer-Comparison) — Iteration 115 (Feb 2026)**: Built a complete Supervisor Performance counterpart to the Student Performance flow, tuned for the supervisor's role (review/approval-centric metrics). **Backend**: (a) Added `supervisor_stats` to `/api/dashboard/stats` (in-charge/admin only) — aggregates per supervisor: total, approved, rejected, pending. (b) New `GET /api/admin/supervisors/{supervisor_id}/summary` returning `profile`; `kpis {total, approved, rejected, pending, completed, stale_count, avg_review_hours, approval_rate, rejection_rate, permanent_rejection_share}`; `phase_approvals {phase1, phase2, phase3, phase4}` derived from `supervisor_phaseN_approved` flags; `monthly_decisions` (last 6 months — approvals + rejections paired); `supervised_students` (top 5 under this supervisor); `peer_comparison {review_time_percentile, rejection_rate_percentile, peer_median_review_hours, peer_median_rejection_rate, peer_count_*}` computed across all supervisors with ≥3 decisions; `recent_actions` (last 10 supervisor edit_log entries with field/new_value/edited_at). Avg review-hours computed from `created_at → supervisor_phase1_approved_at` delta with tz-safe handling and 90-day outlier cap. Stale = pending status + `created_at < now-48h`. (c) Extended `GET /api/procedures` with `supervisor_id` query param (in-charge/admin only). **Frontend**: (a) New `SupervisorPerformanceSection` on dashboard (purple theme to differentiate from the blue Student section) — Top 5 + Show more / Show less pagination; each card shows total/approved/pending/approval-rate chips + chevron; `router.push('/admin/supervisor/{id}')`. (b) New screen `app/admin/supervisor/[id].tsx` — header w/ Nudge button, **stale-cases red banner** when `stale_count > 0`, **8 KPI tiles** (Cases Supervised, Approved, Pending Review, Rejected, Stale >48h, Avg Review Time, Approval Rate, Rejection Rate), **Performance vs. Peers** twin cards (review-time percentile + rejection-rate percentile, color-coded green/orange based on peer comparison), **Per-Phase Approval Distribution** bars (P1–P4), **Last 6 Months Review Decisions** dual-bar sparkline (green=approved + red=rejected, with legend), **Top Students Under Supervision** mini-list cross-linking to student drill-down, **Cases filter+search list** (filters: All/Pending/Approved/Rejected/Completed), **Recent Review Actions timeline** (last 10 supervisor edit_log events tappable to the case). Reuses `NudgeBottomSheet` so In-Charge can nudge a slow-reviewing supervisor with the same cooldown / push / history flow. Route registered in `app/_layout.tsx`. **Verified live (Dr. Paresh Gandhi)**: stale-banner shows "7 cases pending >48h"; 25/8/7 KPI counts; Avg Review Time **0.4h**; Approval Rate 100%; Per-phase 8/4/0/0; Mar=2/0, Apr=6/0 dual bars; Top Student cross-link to Dr. Gaurav Pandey works; Cases (25) filter chips work; Recent Review Actions timeline lists supervisor edit events.


58. **Nudge Student — In-App Notification + Push + Cooldown + History — Iteration 114 (Feb 2026)**: Built end-to-end "Nudge Student" feature giving In-Charge / Administrator / Supervisor a one-tap way to gently remind a student about pending cases without leaving the app. **Backend**: (a) New `POST /api/students/{student_id}/nudge` — Pydantic `NudgePayload(message ≤ 500 chars, case_ids?: list)`; role gate (in-charge/admin/supervisor); supervisor scope-check (`_verify_nudge_access` requires at least one supervised/created case for that student); enforces 30-minute cooldown per (sender, student); writes a row to `notifications` collection with `type: "nudge"`, `from_user_id`, `from_user_name`, `from_user_role`, `message`, `case_ids`; calls `send_expo_push_notifications([student_id], "Nudge from {sender}", message[:200], {type: "nudge"})` (best-effort); writes a `nudge_student` HIPAA `access_logs` row. (b) New `GET /api/students/{student_id}/nudge-history?limit=5` — returns recent nudges (in-charge/admin see all, supervisor sees only their own); also returns `cooldown_seconds_remaining` for the current sender so the UI can render a live countdown. tz-aware datetime fix on MongoDB round-trip. (c) Extended `/api/admin/students/{id}/summary` and `/api/procedures?student_id=X` to allow supervisors (scoped to their supervised cases). **Frontend**: (a) New `components/NudgeBottomSheet.tsx` — bottom-sheet modal with quick-template chips ("Friendly reminder" auto-fills `Hi {firstName}, ... you have {pendingCount} cases pending phase submission ...`, "Phase 2 overdue", "Patient follow-up"), live char counter `xx/500`, error box, Send button that transitions to **"Wait Xm Ys"** countdown when cooldown is active, Recent-nudges history list with Read/Unread dot indicators. (b) `app/admin/student/[id].tsx` drill-down screen: new pill-shaped **Nudge** button on the header (visible to in-charge/admin/supervisor); passes `pendingCount` and the first 10 `pendingCaseIds` to the sheet so the auto-generated text and audit row reference real cases. Role gate extended to allow supervisor (backend enforces cases-under-them filtering, so supervisor sees only their supervised slice of stats). **Verified live**: Dr. Abhijit Patil → Dr. Gaurav Pandey → Nudge sheet opens with default text "Hi Gaurav, just a friendly reminder — you have 6 cases pending phase submission..." → Send returns 200, sheet closes; reopening shows the message in **Recent nudges** with **UNREAD** dot, and the Send button now reads **"Wait 29m 52s"** confirming cooldown is enforced; immediate POST returns 429 with `seconds_remaining: 1800`; push notifications are dispatched best-effort (no-op if student has no `push_token`). Email path is intentionally skipped per user direction.


57. **Student Performance Drill-Down + Show More Pagination — Iteration 113 (Feb 2026)**: Made the In-Charge / Administrator dashboard **Student Performance** section fully interactive and added a brand-new per-student drill-down screen. **Backend**: (a) Added `student_id` to the `student_stats` aggregation output in `/api/dashboard/stats`. (b) Added optional `student_id` query-param filter to `GET /api/procedures` (honoured for `implant_incharge` / `administrator` roles only). (c) Added `skip` + `student_id` query params to `GET /api/procedures/recent-activity` for paginated Show-More behaviour. (d) New endpoint `GET /api/admin/students/{student_id}/summary` returns `profile` (best-effort), `kpis` (total/completed/active/rejected/pending_approval/approval_rate), `phase_pipeline` (P1–P4 + Done counts), and `monthly_throughput` (last 6 calendar months of completed cases). **Frontend**: (a) New `StudentPerformanceSection` component on `(tabs)/dashboard.tsx` — wraps each student card in `TouchableOpacity` → `router.push('/admin/student/{id}')`, paginated 5-at-a-time with **Show more** + **Show less** buttons. (b) `RecentActivityWidget` upgraded with `skip`-based pagination (probes the next page after each Show more click, hides the button when no more pages) and an optional `studentId` prop for the drill-down. (c) New screen `/app/admin/student/[id].tsx` rendering: avatar header → 6 KPI tiles → phase-pipeline bar chart → 6-month throughput sparkline → filter chips (All/Active/Pending Review/Completed/Rejected) + search bar + interactive case cards → per-student `RecentActivityWidget`. Defensive role gate redirects non `implant_incharge` / `administrator` users back to `/dashboard`. Route registered in `app/_layout.tsx` with `headerShown: false`. **Verified live**: in-app click on Dr. Gaurav Pandey → drilldown loaded with Total 17 / Active 15 / Completed 2 / Approval Rate 100% / Phase pipeline P1=10 P2=4 P3=1 P4=0 Done=2 / 17 case cards filterable & searchable → tapping a case routes to existing `/procedures/[id]`.


56. **Case Report PDF — De-Branded Header & Footer + "Generated by Implanr" Stamp — Iteration 112 (Feb 2026)**: Removed institutional branding ("Department of Prosthodontics", "Bharati Vidyapeeth Dental College and Hospital, Pune") from the case-report PDF header AND from both backend cover-page generators (`server.py` L4547 + L5276). Added **"Generated by Implanr"** as the new top-of-footer line in `pdfGenerator.ts` (above "This is a computer-generated report"). Footer now reads: *Generated by Implanr / This is a computer-generated report / Generated on {date}*. Header now shows only "Dental Implant Procedure Report" + status badge. The certificate-body sentence in `server.py` L4992 ("...as per the Department of Prosthodontics Standard Operating Protocol...") was deliberately left intact since it's part of a complete sentence and would need rewording — flagged for the multi-tenant rollout below.

**🔮 FUTURE PRODUCT NOTE — Multi-Tenant College / Clinic Branding (P2 backlog)**: When the Dental College and Dental Clinic versions of Implanr ship, the **college name / dental clinic name** entered at sign-up time MUST flow by default into BOTH PDF reports — (a) the **Dental Implant Procedure Report** (currently `pdfGenerator.ts` + backend `case_report_pdf` / `generate_case_report` paths) and (b) the **Drilling Protocol PDF** (currently `export_drilling_protocol_pdf` in `server.py`). Suggested data-flow when implemented: add `tenant_name` / `institution_name` field at signup → persist on tenant doc → PDF generators interpolate it into the slot the old static "Department of Prosthodontics / Bharati Vidyapeeth..." pair previously occupied. The `server.py` L4992 certificate-body string should also switch from hardcoded "Department of Prosthodontics" to interpolated `{institution_name}` once tenant context is available. Apply consistently to drilling-protocol PDF top banner.


55. **Implant Selection Top-5 Safety Sort + Suggest-Me Tap Wiring — Iteration 111 (Feb 2026)**: User-driven UX completion of the biological-safety feature. **(a) `CaseImplantPlanning.tsx` Phase 1 Step 2 result list**: switched from naive `slice(0, 3)` to a safety-aware sort + `slice(0, 5)`. New `_safetyRank()` ranks each variant — `length_block → -Infinity` (sinks to bottom), `width_warning → marginMm` (smallest margin lower), `ok → +Infinity` (top). Header text now reads "Top 5 Best Matches" (was "Top 3"). `Show more` toggle reveals all remaining options; greyed-out length-blocked rows display the red "Too long — vital structure at risk" chip. Width warnings render the amber "Tight bone — N.N mm margin" chip and tap triggers a soft 2-button Alert (Continue posts to `/api/audit/safety-override` under context `phase1_step2`). **(b) `(tabs)/implant-selection.tsx` Home tab `SuggestResult`**: previously had `handleSuggestTap` defined but the size-badge `onPress` was bypassing it (calling `setSelectedKey` directly), so length-blocked sizes could be silently selected. Re-wired the `TouchableOpacity` to call `handleSuggestTap(i, j, sys, imp)`, which gates length_block with a blocking Alert and width_warning with the soft Alert + audit POST. Also added the safety chip (red blocked / amber warning) below each size badge using `imp._safety` from `annotatedSystems`. New testIDs: `suggest-safety-chip-{i}-{j}`. The Home tab `ChooseResult` already had this pattern from iter 109 — this iteration brings `SuggestResult` and Phase 1 Step 2 to feature-parity. **Testing (iteration_111)**: 100% static code-review pass; live login + tab-nav verified. RNW Modal-based system-picker offscreen render is a Playwright-only ergonomics quirk (real mobile users unaffected). Backend untouched — last regression (iter_110) 54/54 PASS.

47. **Consistent PhaseHeader Across All Submission Screens — Iteration 113 (Feb 2026)**: Created a reusable `PhaseHeader` component at `/app/frontend/components/PhaseHeader.tsx` (back arrow + big bold 18px dark-blue title + lighter blue 13px subtitle, wrap-friendly — no `numberOfLines={1}` / `adjustsFontSizeToFit` so full titles always render). Switched Phase 2/3/4 submission screens to use it + hid the native stack headers (`headerShown: false` in `_layout.tsx`): Phase 2 → "Phase 2 - Implant Surgery" / "Surgical Checklist"; Phase 3 → "Phase 3 - Healing and Second Stage Surgery"; Phase 4 Step 1 → "Phase 4 - Prosthetic Rehabilitation" / "Step 1 of 2: Prosthetic Planning"; Phase 4 Step 2 → "Phase 4 - Prosthetic Rehabilitation" / "Step 2 of 2: Final Restoration". Updated Phase 1 (`/new-procedure.tsx`) font to match (fontSize 18 + `lineHeight: 22`) and removed truncation so full title shows on all devices. Removed the redundant `pageTitle` Text nodes from all four Phase 2-4 files (they duplicated the title inside content cards). Playwright-verified all 5 screens — consistent typography, no truncation, back arrow works, screenshots captured.







54. **Implant Biological-Safety Validation + Override Audit + AI Explain Enrichment — Iteration 109/110 (Feb 2026)**: Three tightly-coupled clinical safety features. **(a) Pure-function validator** (`/app/frontend/utils/implantSafety.ts`, **42/42 unit tests pass**). Rule 1 (FLEXIBLE) — bone_width minus implant_diameter must leave ≥1.0 mm of bone on each side; if margin<1.0 mm, soft warning *"Maintain 1–1.5 mm of bone around the implant"* with **Continue with selection** (audit-logged) / **Change the selection** (cancels). Rule 2 (HARD) — for posterior teeth `{14,15,16,17, 24,25,26,27, 35,36,37, 45,46,47}`, implant length must be ≥1.5 mm shorter than bone_height; if not, hard block — *"Choose an implant at least 1.5–2 mm shorter than the entered bone length to protect the inferior alveolar nerve"* (mandible) or *"…to protect the maxillary sinus floor"* (maxilla). Third molars 18/28/38/48 deliberately excluded from the posterior set per institutional convention. **`annotateImplantSafety()`** + **`shortSafetyChip()`** drive Suggest-Me filtering — unsafe options render greyed-out with a colour-coded chip (red "Too long — vital structure at risk" / amber "Tight bone — N.N mm margin"). Wired into BOTH "Let Me Choose" + "Suggest Me" surfaces in BOTH `(tabs)/implant-selection.tsx` and `CaseImplantPlanning.tsx` Phase 1 Step 2 modal. **(b) New backend endpoint** `POST /api/audit/safety-override` (server.py L2540-2586) — `SafetyOverrideBody` Pydantic captures context / tooth_position / bone_width / bone_height / implant_diameter / implant_length / margin_mm / system; persists into the existing `access_logs` collection with `action="safety_override"`, `resource_type="implant_selection"`, `resource_id=<system>`. Surfaces in the In-Charge `/admin/access-logs` viewer alongside login / procedure_view / pdf_export rows; filterable by `action=safety_override`. **(c) AI Explain Recommendation enrichment** — `/app/backend/implant_indications.py` mirrors the frontend constants for 30 implant systems; both `/api/ai/explain-recommendation` (procedure-based) and `/api/ai/explain-standalone` (Home-tab-based) now inject `Institutional Indications: ...\nInstitutional Features: ...` into the prompt context for known systems, telling the LLM to "anchor reasoning in those system-specific properties (e.g. tapered body for soft bone, conical connection for crestal preservation) rather than generic platitudes." Live curl verification showed the LLM output now references 1.5 mm circumferential margin + 2 mm apical safety per institutional rules and ties them to system-specific design (e.g. tapered body, deep conical connection). Unknown systems fall back to the prior generic context with no exception. **HIPAA env-var fix**: `EMERGENT_LLM_KEY` was missing from `/app/backend/.env` (must have been wiped earlier in the session); restored from `emergent_integrations_manager`. Backend pytest **iter_109 9/9 + 54/54 regression PASS** (after key restore in iter_110), 0 bugs.

53. **Implant-System Indications & Features + Cantilever Warning — Iteration 108 (Feb 2026)**: Two coordinated frontend-only enhancements driven by user feedback. **(a) Indications & Features panel** — institutional `Implant Specific Indications.docx` extracted into `/app/frontend/constants/implantIndications.ts` as a typed `IMPLANT_SYSTEM_DETAILS` map covering 30 systems verbatim (Neodent Drive GM Acqua/Neoporous, Helix GM Acqua/Neoporous, Titamax GM Acqua/Neoporous; Nobel Biocare NobelActive NP/RP/WP + NobelParallel NP/RP/WP; BioHorizons Tapered Pro / Tapered Pro Conical RBT / Tapered Short Conical RBT / Tapered IM / Tapered Short / Narrow Diameter; CONELOG Progressive Line; Bredent Mini 2/Copa/Narrow/Blue/Classic Sky; B&B Dental EV-Line, 3P, 3P Long, Wide-Line, Dura-Vit Slim). Lookup helper `getImplantDetails(brand, system)` does fuzzy prefix-match on a normalised `keyOf()` so dropdown labels still resolve when system names drift. Wired into BOTH "Let Me Choose" surfaces — `(tabs)/implant-selection.tsx` (Home tab) and `CaseImplantPlanning.tsx` ImplantPlanModal (Phase 1 → Step 2) — rendered inline below the existing dropdown indication preview using the SAME `indBox` / `indicationBanner` styling per spec (no new colour palette). The legacy short `indication` string in the dropdown is left untouched per explicit user instruction. Empty Features field auto-hides (one entry — B&B 3P Long — has Indication only). **(b) Cantilever pontic warning** — sibling to the bridge nudge in `/app/frontend/utils/implantValidation.ts`. New `detectCantileverCandidates()` flags missing teeth at the end of a consecutive missing-tooth run that have implant support on one side only (e.g. 24,25 missing with implant only at 25 → 24 dangles distally; or 36,37,38 missing with implants at 36+37 → 38 dangles distally; or 15,16,17 missing with single implant at 16 → both 15 + 17 dangle). Soft-warning Alert in `CaseImplantPlanning.handleAddImplant` (live, fresh-only) and final-summary Alert in `new-procedure.tsx` Submit-for-Approval. **Tests**: frontend unit suite expanded to **27/27 PASS** covering single-side mesial cantilever, single-side distal cantilever, both-ends double-cantilever, bridge-vs-cantilever disambiguation, and full-coverage edge case. Backend regression **85/85 PASS** (iteration_108) — no backend code changed.

52. **Phase 1 Implant–Tooth Clinical Correlation — Iteration 107 (Feb 2026)**: Live + final-summary validation linking `implant_procedure_type` with `teeth_present` and the planned implant positions. **Pure-function utility** (`/app/frontend/utils/implantValidation.ts`) with 14/14 unit tests under `/app/frontend/tests/`. **Two rules** the user explicitly stated: (a) **Single Conventional Implant** must have exactly 1 implant — adding a 2nd is hard-blocked with the message *"More than one implant selected. Please change Type of Implant Procedure."*; (b) **Multiple Conventional Implants** — when missing teeth form a consecutive run of ≥3 in the same arch (FDI sequence, joined at midline 11↔21 / 41↔31) and implants are placed at both ends with at least one inner missing tooth without an implant, surface a 3-unit bridge nudge. Detection covers both the 3-tooth-in-a-row scenario (e.g. 14/15/16 missing → implants at 14+16 → pontic at 15) and the 4-tooth-in-a-row scenario (e.g. 23/24/25/26 missing → implants at 23+24+26 → pontic at 25). User picks "Yes, set as default" → material picker (Metal / Porcelain Fused to Metal / Zirconia) → 4 fields persist on the procedure document. "No" → info Alert *"Three-unit bridge is indicated"* with explicit reminder *"You may still choose your own prosthesis."* Live nudge fires inside `CaseImplantPlanning.handleAddImplant` only when the new implant *creates* a fresh bridge candidate; final-summary nudge runs on Submit-for-Approval inside `new-procedure.tsx`. **Backend**: 4 new top-level fields on `ProcedureUpdate` Pydantic model (`bridge_design` ≤200, `bridge_material` ≤80, `bridge_pontics` `List[str]`, `bridge_implants` `List[str]`); Case Report PDF Phase 1 section now emits *Default Prosthesis Plan / Bridge Material / Bridge Implants / Bridge Pontics* when set. Save uses `PUT /procedures/{id}` (student-owner can edit own draft) — `/edit-fields` is reviewer-only. Backend pytest **12/12 new + 73/73 regression PASS** (iteration_107) — boundary max_length checks, partial-update non-clobbering, RBAC denial for non-owner students, PDF emission with and without bridge fields all green.

51. **Audit Log Viewer + CSV Export + App Store/Play Store Listing Copy — Iteration 106 (Feb 2026)**: Makes the HIPAA access-logs infra from iter_105 usable by non-developers. **Backend**: new `GET /api/admin/access-logs/export-csv` endpoint (implant_incharge + administrator only; same filter contract as list endpoint + `start_date` / `end_date` ISO-8601; 10k-row cap; `text/csv` response with `Content-Disposition: attachment` filename `access_logs_YYYYMMDD_HHMMSS.csv`; 11-column header — `created_at,action,outcome,user_id,user_name,user_role,resource_type,resource_id,ip,user_agent,extra`; CSV export writes its own `audit_export` row into `access_logs` for audit-of-the-audit). Extended `GET /api/admin/access-logs` with the same `start_date` / `end_date` filters. Added top-of-file `import csv` + `import json`. **Frontend**: new role-gated screen at `/admin/audit-log` (`app/admin/audit-log.tsx`) — bottom-sheet filter modal with action pills (login / procedure_view / pdf_export / audit_export), outcome pills (success / failure / denied), user selector (loaded from `/api/users`), date-range text inputs (YYYY-MM-DD). Per-row card shows colour-coded outcome pill, actor name + role, resource ref, timestamp + IP. Infinite-scroll pagination (50 rows/page). Export button downloads CSV via `expo-file-system` (`downloadAsync` → `Sharing.shareAsync`) on native and `<a download>` on web. Defensive client-side role gate (`useEffect` bounces non-privileged users back). New "Compliance" section on Profile tab (`(tabs)/profile.tsx`) exposes the tab to In-Charge + Administrator only — Students / Supervisors / Nurses never see it. Route registered in `_layout.tsx`. Backend pytest **23/23 PASS + 50/50 regression (iter_103 + iter_104 + iter_105)** (iteration_106).

**Parallel deliverable — `/app/memory/app_store_listings.md`**: paste-ready copy for App Store Connect + Google Play Console. Includes: app name / subtitle / primary category, 4000-char description, 100-char keywords, Release notes, Support / Marketing / Privacy / Terms URLs, App Review demo account + reviewer instructions, age-rating questionnaire answers (→ 17+), Apple App Privacy "Nutrition Labels" (Health & Medical Data / Name / Email / User ID / App Interaction / Crash Data — all **Linked to user, no tracking**), Google Play Data Safety section-by-section (Personal Info, Health & Fitness, Photos/Videos, App Activity, Device IDs — all **not shared, not sold**), data-collection justification statement, and pre-submission checklist (Privacy Policy URL required, target SDK ≥34, BAAs signed, etc.). Noted TODOs for user: replace `implanr.app` URLs with actual domain; seed demo account in prod; commit to 30-day data-deletion SLA.

50. **HIPAA Technical Safeguards Batch 1 — Iteration 105 (Feb 2026)**: Four coordinated technical HIPAA items landed together. **(a) Auto-logout tightened to 15 min** (was 20) in `contexts/AuthContext.tsx` — aligns with HIPAA-recommended workstation timeout. Timer resets on any touch/move via existing `ActivityTracker`. **(b) Screenshot blocking** via new `hooks/useScreenCaptureProtection.ts` + `expo-screen-capture` (~8.0.9) — Android applies `FLAG_SECURE` (screenshots return black; screen-record captures black frames); iOS uses `preventScreenCaptureAsync` to blur on screenshot and block recording; web is a safe no-op. Wired into `ActivityTracker` with `useScreenCaptureProtection(!!user)` so protection is active whenever any user is signed in. **(c) Access audit logging** — new `log_access()` helper + `access_logs` MongoDB collection with TTL (180d) + `(user_id, created_at desc)` + `(resource_type, resource_id, created_at desc)` indexes created on startup. Rows capture `action` (login / procedure_view / pdf_export), `outcome` (success / failure / denied), `user_id`/`user_name`/`user_role`, `resource_type`/`resource_id`, `ip` (x-forwarded-for → client.host), truncated `user_agent`, and `extra` dict (with sensitive keys stripped). Hooks live at: `POST /api/auth/login` (both failure branches + success), `GET /api/procedures/{id}` (3 deny branches + success with patient_name), `POST /api/procedures/{id}/case-report` (pdf_export on entry). **New viewer endpoint** `GET /api/admin/access-logs` — implant_incharge/administrator only, paginated (limit 1-500, skip ≥ 0), filters on user_id/action/resource_type/resource_id/outcome, returns `{total, skip, limit, items[]}` sorted desc — items are `_id`-free and have ISO datetime strings. **(d) Secrets hardening** — `_SensitiveLogRedactor` logging.Filter attached to `uvicorn.access`, `uvicorn.error`, `uvicorn`, root, and app logger. Redacts `Bearer <jwt>` → `Bearer <redacted>` and any `(access_token|refresh_token|api_key|token)=<value>` query param → `...=<redacted>`. `.env` files are already gitignored (`*.env` + `.env` + `.env.*`). Backend pytest **19/19 PASS + 31/31 regression (iter_103 + iter_104) PASS** (iteration_105). Live verification: admin viewer returned correctly-ordered audit rows for login failure/success, procedure_view, pdf_export; student/supervisor/nurse hit 403; secrets redactor visible in live uvicorn access log. **Not yet done (require external steps)**: BAAs with MongoDB Atlas + OpenAI + Expo; production MongoDB migration (currently ephemeral on preview pod); EAS build with Android `FLAG_SECURE` + iOS `UIScreenCapturedDidChangeNotification` — all require a build and user-side signup.

49. **Pre-Phase 3 Summary + Request-Edit Workflow — Iteration 104 (Feb 2026)**: Non-blocking bridge between Phase 2 and Phase 3 so students can flag wrong prosthesis/cuff data locked during Phase 2 without stalling the case. **Backend (`server.py` L1776-1934)**: new `phase2_edit_requests[]` embedded array on the procedure doc and three endpoints — (a) `POST /procedures/{id}/phase2-edit-request` (student owner only; 400 if phase 2 not submitted; 409 if one pending; accepts `{fields: ["prosthesis_type"|"healing_abutment_cuff_height"|"other"], note: max 500 chars}`; fires in-app + Expo push to supervisor + in-charge), (b) `POST /phase2-edit-request/{req_id}/cancel` (only original requester, sets status=cancelled), (c) `POST /phase2-edit-request/{req_id}/resolve` (supervisor on the case OR any in-charge/admin, sets status=resolved, notifies student). Actual data fixes reuse the existing `PATCH /procedures/{id}/edit-fields` which already logs `phase2_data.*` sub-key diffs into `edit_log`. **Frontend Phase 3 screen (`submit-stage2-surgical/[id].tsx`)**: the existing green "Immediate Prosthesis Done" and blue "Healing Abutment Placed" banners now double as the locked-in summary preview — each carries an amber pill "Need Changes — Request Edit" (student-only, hidden while a request is pending). Tap opens a bottom-sheet modal with multi-select checkboxes (Prosthesis Type / Cuff Height / Other) + a 500-char note textarea. On submit, a yellow pending banner appears ("Edit requested — waiting for Supervisor / In-Charge") with the student's note quoted and a Cancel request pill. **Case-detail (`[id].tsx`)**: supervisor/in-charge/admin see an orange-left-border banner "{Student} requested Phase 2 edit" with the note + an "Edit Now" CTA that launches a new reusable `Phase2EditModal.tsx` component. The modal renders the correct prosthesis-type option set (driven by `implant_procedure_type` + `teeth_present`) when `prosthetic_component === 'Immediate Loading Done'`, or a per-implant cuff-height grid when `'Healing Abutment Placed'`. Save calls `PATCH /edit-fields` then `/resolve` in one click. Backend pytest **21/22 PASS (iteration_104)** covering 403/404/409/400 edge cases, duplicate-blocking, role gates, and full E2E create → edit → resolve flow with `edit_log` audit + stakeholder notifications. Manual curl also confirmed the student's pending banner clears after resolve and `phase2_data.prosthesis_type` correctly persists.

48. **Phase 2 / Phase 3 Dynamic Workflow — Iteration 114 (Feb 2026)**: Added clinical dependency between Phase 2 and Phase 3 based on `prosthetic_component` selection. **Phase 2 (`submit-phase2/[id].tsx`)**: When `Prosthetic Component === "Immediate Loading Done"`, a new **"Prosthesis Type"** dropdown appears with option sets driven by Phase 1 `implant_procedure_type` + teeth count — full arch types get 3 options (Multiunit temporary prosthesis / PMMA CAD on Multiunit / PMMA CAD on Ti-Base); single implant (or overlap types with ≤1 teeth) get 3 options (PMMA Crown w/ Temporary Abutment / PMMA Crown w/ Ti-Base / Other); multi-unit bridge gets 4 options (PMMA Crowns w/ Temp Abutment / PMMA Crowns w/ Ti-Base / PMMA Bridge / Other). "Other" reveals a free-text field. **Backend (`server.py`)**: `Phase2Submit` Pydantic model gained `prosthesis_type: Optional[str] (max_length=200)` + `prosthesis_type_other: Optional[str] (max_length=500)`; both persisted inside `phase2_data`. **Phase 3 (`submit-stage2-surgical/[id].tsx`)**: On mount, reads `phase2_data.prosthetic_component` / `prosthesis_type` / `healing_abutment_cuff_height` from the procedure GET (**bug fixed this iteration** — prior code read these directly off the top-level response, missing nested `phase2_data`). Renders a colour-coded summary banner at the top (green for Immediate Prosthesis Done, blue for Healing Abutment Placed with per-implant cuff heights) and simplifies the Second Stage checklist: always drops the "Healing Abutment Placed" row (never re-captured in Phase 3), and when the Immediate/Healing flag is set, also drops "All Components Available" — leaving 4 items; ISQ remains optional. **PDF (`case_report_pdf` / `generate_case_report`)**: Phase 2 section prints "Prosthesis Type: <value>" (with "Other — <free text>" formatting); Phase 3 section opens with the same green/blue banner inherited from Phase 2 (showing either the prosthesis type or per-implant cuff heights via `Tooth #NN: X.X mm` lines). Backend pytest **10/10 PASS** (iteration_103), including 422 validation on oversize prosthesis_type, persistence round-trip, and PDF content verification via pypdf for both Immediate Loading and Healing Abutment flows.


46. **New Case Header Declutter — Iteration 112 (Feb 2026)**: Removed the duplicate "New Case" headline that sat inside the scroll content (was added alongside the new phase subtitle in iteration 111 and clashed with the bottom-tab/stack "New Case" title at the top). Now the `/new-procedure` screen shows: top tab header "☰ New Case" (unchanged), then right below — next to the back arrow — **"Phase 1 - Diagnosis and Treatment Planning"** as the main big-bold title (`fontSize: 20, fontWeight: 800, color: #0D47A1`, `numberOfLines={1} adjustsFontSizeToFit` to keep it one line on narrow screens), followed by the subtitle "Step 1 of 2: Case Details" (`fontSize: 13, marginLeft: 12, marginTop: 2`). Fixed stale `stepIndicator` marginLeft (was `54px` for the old standalone layout) so it aligns cleanly under the title inside the same flex column. Verified via Playwright screenshot — clutter-free, no duplicate "New Case" inside content.

45. **Phase Rename Across App — Iteration 111 (Feb 2026)**: Renamed the 4 workflow phases app-wide per product spec. **Mapping:** Phase 1 "Pre-surgical" → "Diagnosis and Treatment Planning"; Phase 2 "Surgical" → "Implant Surgery"; Phase 3 "Second Stage Surgical" → "Healing and Second Stage Surgery"; Phase 4 "Prosthetic Protocol" → "Prosthetic Rehabilitation" with Step 1 "Prosthetic Planning" + Step 2 "Final Restoration". **Scope of changes:** (a) `[id].tsx` treatment-progress timeline subtitles, phase-2 CTA subtitle, phase-3 CTA subtitle, Phase 2/3/4 section headers, checklist section titles, reviewer "Awaiting student to start Phase N" indicator map; (b) `/new-procedure.tsx` — restructured header from `"New Case - Phase 1"` single line to **two-line layout** `"New Case" + "Phase 1 - Diagnosis and Treatment Planning"` followed by unchanged `"Step 1 of 2: Case Details"`; (c) `_layout.tsx` stack titles for all four submit screens; (d) `submit-stage2-surgical/[id].tsx` pageTitle; (e) `help-workflow.tsx` — all step titles updated; (f) backend `server.py` — case-report PDF now emits a prominent blue **"Phase 1 - Diagnosis and Treatment Planning"** banner immediately before the Patient & Treatment Details section (page 2), renamed all phase headings inside PDF, renamed Phase 2/3/4 notification messages, AI summary parts, and `case-report` markdown section; (g) `frontend/utils/pdfGenerator.ts` Phase 1/3 completion labels. **Added What's New entry v1.4** so all users see the rename heads-up on next login. Curl-verified: case-report PDF page-2 shows "Phase 1 - Diagnosis and Treatment Planning" before "Patient & Treatment Details", phase-3 shows "Phase 2 - Implant Surgery" heading, `/whatsnew` returns v1.4 entry. Internal checklist section titles ("Pre-Surgical Checklist", "Surgical Checklist") left intentionally unchanged per user instruction — only phase *names* were requested, not internal checklist labels.

44. **Consent Replace Audit + Implant In-Charge Consent Override + Profile Red-dot — Iteration 110 (Feb 2026)**: Three coordinated changes. **(a) Consent replace audit trail**: modified `upload_consent` in `server.py` to push a new entry into the procedure's unified `edit_log` array (alongside the existing `consent_history` versioned archive) every time anyone replaces the patient consent form. Entry shape: `{field: "patient_consent_form", old_value: <prev filename>, new_value: "v<N> · <new filename>", edited_by, edited_by_role, edited_at}`. This surfaces the replacement both in the case's Edit History timeline modal and in the role-filtered `/procedures/recent-activity` dashboard feed (no frontend changes needed — `prettyField` already humanises the field name). Initial uploads are also logged so the timeline has a first-upload anchor. **(b) "Edit Patient Consent Form" for Implant In-Charge**: added a blue TouchableOpacity with the `create-outline` icon inside the `consent-action-row` block in `[id].tsx`, gated by `user?.role === 'implant_incharge' && !canUpload` — so it only renders for In-Charge on cases they did NOT schedule. Tapping opens a slide-up bottom-sheet modal (`showInchargeConsentEdit`) that mirrors the scheduler's consent controls with two stacked buttons — `incharge-reprint-consent-btn` (dark grey, calls `downloadConsentTemplate`) and `incharge-upload-consent-btn` (blue, calls the shared `uploadConsentForProcedure`) — plus italic footnote *"Any replacement is logged in the case's edit history with your name and timestamp."* Re-uses the same backend upload path so the audit entry fires automatically. **(c) Red-dot badge on hamburger + drawer Profile**: in `(tabs)/_layout.tsx` added `hasUnseenWhatsNew` state fetched from `GET /whatsnew` on mount + whenever the drawer opens; renders a red dot `badgeStyles.reddot` absolutely positioned on the hamburger icon and an inline `badgeStyles.reddotInline` next to the "My Profile" drawer row. Cleared on ack (server-side `last_seen_whatsnew_version` updates → `/whatsnew` returns 0 entries). Curl-validated the audit flow (nurse replaces consent → edit_log entry present, supervisor's Recent Activity feed shows it as top row). Playwright E2E verified In-Charge sees both "View uploaded consent form" + blue "Edit Patient Consent Form" → bottom-sheet opens with Reprint + Upload buttons on student-scheduled phase1_approved case.

43. **"What's New" Changelog Screen — Iteration 109 (Feb 2026)**: Added a role-filtered, server-driven changelog that auto-shows after login whenever unseen entries exist. **Backend**: new `last_seen_whatsnew_version: Optional[str]` on user doc + `UserResponse`; constant `WHATSNEW_ENTRIES` list in `server.py` holding entries `{version, date, title, items, roles?}`; helpers `_parse_version`, `_latest_whatsnew_version`, `_entries_for_user` for semver comparison + role filtering; three endpoints — `GET /api/whatsnew` (unseen + role-filtered), `GET /api/whatsnew/history` (full role-matched list), `POST /api/whatsnew/ack` (sets user's version to latest shipped). Seed changelog covers iteration 107's shipped changes with three role-scoped v1.3 entries (supervisor/in-charge/admin, nurse, student). **Frontend**: new screen `/app/frontend/app/whatsnew.tsx` with sparkles hero, per-entry card (title + version chip + date + checkmark bullets), ack-and-dismiss "Got it" CTA on first-run mode; `?mode=history` reuses the same screen for Profile → "What's new" (fetches `/whatsnew/history`, hides the CTA, shows a back button). **Login hook** (`auth/login.tsx`) now gates routing: first-timers → `/onboarding` → `/help-workflow` → `/whatsnew` → dashboard; returning users with unseen entries → `/whatsnew` → dashboard; otherwise → dashboard directly. **Help-Workflow screen** chains through `/whatsnew` on Got-it for first-timers. **Profile menu**: new "What's new" link next to "How it works". **Route registered** in root `_layout.tsx`. Backend curl-validated (1 entry returned for unseen supervisor, 0 after ack, student/nurse see different role-filtered entries). Playwright E2E verified supervisor landing at `/whatsnew` after login with `whatsnew-screen=1, entry-0=1, title-match=1`.

42. **Onboarding + Help & Workflow Screens — Iteration 108 (Feb 2026)**: Added two coordinated first-login education screens gated by a new server-side `workflow_seen_at: Optional[datetime]` field on the user doc + `POST /api/auth/me/ack-workflow` endpoint (idempotent, sets `datetime.now(timezone.utc)`). **(a) Onboarding carousel** (`/app/frontend/app/onboarding.tsx`) — role-specific 3-4 slide primer: index-based state rendering (switched from FlatList horizontal paging for web reliability), big lucide icon + title + body + progress dots + Back/Next/Skip controls. Content dictionary `SLIDES_BY_ROLE` covers student (4) / supervisor (3) / implant_incharge (4) / nurse (3) / administrator (3). Skip → `ackWorkflow` → dashboard. Next on final slide → `/help-workflow`. **(b) Help & Workflow screen** (`/app/frontend/app/help-workflow.tsx`) — vertical flowchart of the full 4-phase case lifecycle with role-scoped copy, tone-colored step cards (blue/green/orange/purple/grey/yellow for `pre`/`phase1`/`phase2`/`phase3`/`phase4`/`done`/`reviewer`), chevron connectors between steps, and a status-code legend. Accepts `?mode=review` search param to switch to re-open mode (shows a back button, skips the ack + dashboard redirect) so Profile can open it anytime. Got-it button → `ackWorkflow` → dashboard. **AuthContext wiring**: added `workflow_seen_at` to `User` type, new `refreshUser(): Promise<User|null>` and `ackWorkflow(): Promise<void>` methods. **Login hook** (`auth/login.tsx`): after successful login, re-fetches `/auth/me` via `refreshUser()` and routes first-timers to `/onboarding`, returning users straight to `/(tabs)/dashboard`. **Profile menu**: new "Help" section with "How it works" link (`data-testid="link-how-it-works"`) pointing to `/help-workflow?mode=review`. **Route registration**: added `<Stack.Screen name="onboarding"/>` and `<Stack.Screen name="help-workflow"/>` to root `_layout.tsx`. Curl-validated endpoints, Playwright-validated first-login routing + Skip path → dashboard.

41. **Role-Scoped Consent Access + Passive Reviewer Indicator — Iteration 107 (Feb 2026)**: Two coordinated UX changes on `/procedures/[id]`. **(a)** Restricted consent upload + template export to the **case scheduler** (owner via `student_id` or `created_by_id`) + **Nurse** only. Non-owner Supervisor / Implant In-Charge / Administrator now see a single read-only **"View uploaded consent form"** button that deep-links to `${EXPO_PUBLIC_BACKEND_URL}/uploads/<filename>?token=<authToken>` via `Linking.openURL` — but only when a nurse/student has actually uploaded a form; otherwise the whole consent row is hidden for them. **(b)** Added a passive **"Awaiting student to start Phase N"** indicator (hourglass + grey pill) rendered directly below Treatment Progress, visible only to reviewers (supervisor/incharge/admin) who are NOT the owner, with phase-specific copy: `phase1_approved` → Phase 2 Surgical Checklist, `phase2_approved` → Phase 3 Second Stage Surgical, `stage2_surgical_approved` → Phase 4 Prosthetic Protocol, `stage2_prosthetic_step1_approved` → Phase 4 Step 2 Trial & Delivery. Owner still sees the actionable big CTA instead. New styles: `awaitingRow`, `awaitingText`. Backend ACL unchanged — already correctly restricts which cases supervisors see (assigned students only) vs in-charges (all). Playwright-verified for supervisor on both uploaded/not-uploaded consent states, and for student (owner) with full control retained.

40. **Revert — Phase 2 CTA Gate (Feb 2026)**: Rolled back the widened `canSubmitPhase2()` gate from the prior attempt. The big blue "UPLOAD CONSENT FORM" and big green "PHASE 1 APPROVED — Tap to complete Phase 2" CTAs are now visible **only to the case scheduler** (owner via `student_id === user.id` OR `created_by_id === user.id`), matching the original authorization model. Supervisors / Implant In-Charges viewing another person's case correctly do NOT see these buttons. Debug Text removed.

39. **Consent Controls Consolidation — Iteration 106 (Feb 2026)**: De-duplicated the consent-form UX on `/procedures/[id]` for non-nurse roles: (a) the big phase-2-gate upload CTA title shortened from "UPLOAD PATIENT CONSENT FORM" (wrapped 2 lines) → **"UPLOAD CONSENT FORM"** with `numberOfLines={1}` + `adjustsFontSizeToFit`, subtitle also constrained to one line; icons trimmed to 22 px; (b) removed the duplicate `ExportPrintMenu` ("Export / Print consent form") that appeared below the big upload CTA — only the one inside the top `consent-action-row` remains; (c) moved the italic helper text ("Template is pre-filled with patient & procedure details…") out of the bottom block and appended it under the Export/Print button inside the `consent-action-row`, gated by `!consentUploaded` so it disappears once the form is uploaded. New style `consentActionHint` added. Screenshot-verified as student on phase1_approved case.

38. **Staff Section Role-Based Rendering — Iteration 105 (Feb 2026)**: Staff section on case-detail screen (`/procedures/[id]`) now branches by `created_by_role` for all non-nurse viewers: (a) `implant_incharge` creator → shows only "Implant Incharge" row (value falls back to `created_by_name` if `implant_incharge_name` missing); (b) `supervisor` creator → shows Supervisor + Implant Incharge rows only (no Student row); (c) `student` creator (default/fallback) → keeps the existing full Student + Supervisor + Implant Incharge stack. Nurse viewers retain the previous unchanged rendering. No backend changes required — all fields already returned by `GET /api/procedures/{id}`.

37. **Case Detail Layout Refinements — Iteration 104 (Feb 2026)**: Three layout tweaks on `/procedures/[id]` for all non-nurse roles: (a) removed the "Reprint blank consent template" TouchableOpacity that sat below the green PHASE 1 APPROVED button — redundant since the persistent `consent-action-row` above already exposes Export/Print; (b) moved the "Nurse has prepped instruments" autoclave badge from its prior position (above Patient Information) to sit immediately under the PHASE 1 APPROVED button — inlined inside the `canSubmitPhase2() && procedure.patient_consent_form` branch so it travels with the active-phase CTA; (c) restyled the badge as content-hugging (`alignSelf: 'center'`, removed `marginHorizontal: 16`, `flexShrink: 1` on inner text wrap via new `autoclaveBadgeTextWrap`) and removed the trailing ✓ from "Nurse has prepped instruments ✓" — left shield-checkmark icon now the only tick. Visibility gate unchanged (`user?.role !== 'nurse' && instruments_autoclaved?.marked`). Verified via Playwright screenshot as student role on phase1_approved case.

36. **Drilling Protocol PDF — Missing Fields Bugfix (Feb 2026)**: User reported Care Team, QR code, and Autoclave stamp still not rendering in the live PDF (only banner + footer showed). Root cause: the frontend helper `buildDrillingPdfBody` in `CaseImplantPlanning.tsx` and the inline payload in `DrillingProtocol.tsx` both omitted `procedure_id` from the POST body, so backend's `proc_doc = await db.procedures.find_one(...)` returned `None` and silently dropped all three procedure-dependent sections. Additionally found a latent `BytesIO` NameError in the QR-generation try/except that was swallowing the QR image. Fix: (a) added `procedureId` to `DrillingPdfPayload` type + `buildDrillingPdfBody` in `CaseImplantPlanning.tsx`, forwarded to both call sites; (b) added `procedureId` prop + forwarded it in all 3 `api.post` calls in `DrillingProtocol.tsx`; (c) backend `io.BytesIO()` fix for QR. Curl verification: PDF now 20.3 KB (vs 4.9 KB before), `/FormXob...` QR image XObject present on page 1, pypdf text extraction confirms all 5 elements (banner, care team, QR caption, autoclave stamp, Implanr footer).

35. **Drilling Protocol PDF Redesign — Iteration 103 (Feb 2026)**: Five design refinements applied to `export_drilling_protocol_pdf` in `server.py`: (a) centered blue `#0D47A1` patient/ID/surgery-date/generated banner strip at top; (b) two-column header row — left: title + info table (Tooth/System/Size/Bone/Protocol), right: 28 mm QR code pointing to `/cbct/view/{token}` (`_sign_cbct_token` HMAC-signed, 24 h TTL); (c) Care Team row (Postgraduate student + Supervisor + Implant In-Charge names pulled from procedure doc) on an `#ECEFF1` grey strip; (d) INSTRUMENTS AUTOCLAVED green stamp (`#E8F5E9` bg, `#2E7D32` 1px border, `#1B5E20` text) rendering "By: <nurse> · <timestamp>" — only when `instruments_autoclaved.marked === true` on the procedure; (e) footer text changed from "Generated by My Implant Planner" to "Generated by Implanr". Public CBCT viewer endpoint `GET /cbct/view/{token}` already serves HEIC-converted CBCT previews via `pillow_heif`. Curl-validated: HTTP 200, valid `%PDF-1.4`, pypdf text extraction confirms all 5 elements render as expected.

34. **Nurse Workflow Iteration 99 + 100 — PillRow Parity + Tap Propagation Fix (Feb 2026)**: (a) Unified the consent/autoclave pillRow across all three nurse surfaces — added `flexGrow: 0 + flexShrink: 0` to prevent TouchableOpacity children from stretching on react-native-web wrap, normalised consent pill padding/font/radius to match ScheduledCasesSection reference; both pills now render content-hugging with heights within 2px on NurseHomeCalendar date cards, NurseCasesScreen cards, and ScheduledCasesSection cards. (b) Fixed a HIGH bug where tapping the compact AutoclaveRow pill inside any nurse card caused the parent card to also fire and navigate to /procedures/<id>; root cause was RN-web's responder system not honouring `e.stopPropagation()` in nested TouchableOpacity. Added `onStartShouldSetResponderCapture={() => true}` and `onResponderTerminationRequest={() => false}` on the AutoclaveRow's wrapper to eagerly claim the press responder. Verified across all 3 surfaces: pill tap stays on current screen + fires toggle POST; card body tap still navigates correctly (iteration_100 pass 100%).

## Key Credentials
- Admin/In-Charge: `Abhijit.patil@dental.edu` / `Admin@123`
- Student: `Gaurav.pandey@student.dental.edu` / `Student@123`
- Supervisor: `Paresh.gandhi@dental.edu` / `Supervisor@123`

## Key API Endpoints
- `POST /api/auth/login` (accepts `identifier` field)
- `POST /api/auth/refresh`
- `GET /api/health`
- `GET /api/procedures` / `GET /api/procedures/{id}`
- `POST /api/procedures` (creation)
- `GET /api/procedures/{id}/implant-plan`
- `POST /api/procedures/{id}/implant-plan`
- `POST /api/procedures/{id}/approve` (Phase 1 & 2 approval with optional comment)
- `POST /api/procedures/{id}/stage2/surgical/approve` (Phase 3 with optional comment)
- `POST /api/procedures/{id}/stage2/prosthetic/approve` (Phase 4 Step 1 with optional comment)
- `POST /api/procedures/{id}/stage2/prosthetic/step2/approve` (Phase 4 Step 2 with optional comment)
- `POST /api/procedures/{id}/case-report` (PDF generation)
- `POST /api/drilling-protocols/generate`
- `GET /api/implant-library/systems`
- `POST /api/implant-library/evaluate-narrow-ridge` (Narrow Ridge Clinical Decision Engine)
- `GET /api/implant-library/procedure-options` (includes "Narrow Ridge")

## Architecture
```
/app
  backend/
    server.py                        # Monolithic (~6350 lines) — ALL endpoints, models, protocol dicts
    implant_library_latest.xlsx      # Authoritative implant data source
  frontend/
    app/
      (tabs)/new-procedure.tsx
      (tabs)/_layout.tsx             # Tab navigation with role-based visibility
      procedures/[id].tsx            # Case detail with approval comments + dynamic notes labels
      procedures/submit-phase2/[id].tsx       # Per-implant healing abutment + Operator's Notes
      procedures/submit-stage2-surgical/[id].tsx  # Per-implant healing abutment + Operator's Notes
      procedures/submit-stage2-prosthetic/[id].tsx # Operator's Notes
      procedures/submit-phase4-step2/[id].tsx      # Operator's Notes
    components/
      CaseImplantPlanning.tsx        # Implant planning modal with auto-expand drilling protocol
    contexts/
      AuthContext.tsx                 # Auth state management with onAuthFailure callback
    utils/
      api.ts                         # Centralized Axios with interceptors
      pdfGenerator.ts                # Frontend HTML-to-PDF via expo-print
    constants/
      checklist.ts                   # Dropdown options, checklist definitions
```

## Session History

### April 3, 2026 — Session 6 (Fork)
- **4 Modifications Implemented** (21/21 backend tests passed):
  - **Mod 1**: Healing abutment per-implant boxes (Phase 2 + Phase 3). Changed from single input to N boxes matching implant count. Backend accepts both array and single string for backward compatibility.
  - **Mod 2**: Supervisor/Incharge approval comments. Added `comment` field to `ApprovalAction` model. All 5 approval endpoints save comments as `phase{N}_supervisor_notes` or `phase{N}_incharge_notes` based on approver role.
  - **Mod 3**: Dynamic notes labels. "Operator's Notes" for faculty-created cases, "Student's Notes" for student cases. Applied to all phase submission forms and case detail display.
  - **Mod 4**: Auto-expand drilling protocol when implant is selected from suggestions in the modal.
- **Approve/Reject Visibility Fix** (33/33 backend tests passed):
  - Moved approval section (comment box + Approve/Reject buttons) ABOVE the CaseImplantPlanning component so it's immediately visible after phase data sections
  - Added prominent "Approval Required" orange banner with icon
  - Verified all 5 approval phases work for student-created and incharge-created cases
- **Previous P0 Bug Fix**: "Add Implant Position" blank screen crash fixed (backend 404 for new procedures, ObjectId validation, procedureType prop chain, api.ts interceptor).

### April 3, 2026 — Session 7 (Fork)
- **Approval Comment Revert Verified**: Reverted approval comment boxes per user request. Restored simple Approve/Reject protocol across all 5 phases.
- **Approve/Reject Button UI Fix**: Removed "! Approval Required" banner, centered buttons with clean layout.
- **Bone Graft & Membrane Field**: Added Yes/No toggle + text box in Phase 2 form (between Torque Values and Other Notes). Data stored in phase2_data, displayed in case detail, and included in PDF.
- **Supervisor/InCharge Approval Comments (Phase 2-4)**: Comment text box above Approve/Reject buttons for Phase 2 through Phase 4. Independent of approval action. Saved as phase{N}_supervisor_notes / phase{N}_incharge_notes. Visible to student. Included in PDF. Phase 1 intentionally has no comment box.
- **Role-Based Dashboards**: Three distinct dashboard views:
  - Student: Action Needed cards, Drafts with "Send" buttons, Faculty Remarks feed
  - Supervisor: Pending Approval Queue with phase badges, My Students with pending counts, Approval Rate stat
  - In-Charge/Admin: Case Pipeline bar chart (Phase 1-4 + Complete), Pending Review queue, Student Performance leaderboard, Quick Actions grid
- **Medical Risk Assessment Upgrade**: Replaced simple Yes/No with granular scoring:
  - Diabetes (No/Controlled/Uncontrolled), Smoking (No/Light/Heavy), Anticoagulant, Osteoporosis, Radiation
  - Per-factor scoring (1=Low, 2=Moderate, 3=High) with override rules (MRONJ, osteoradionecrosis)
  - Clinical warnings and suggested actions in risk output
  - Updated total risk formula: 6 factors, score 6-18 (Low=6-9, Moderate=10-14, High=15-18)
  - Backwards compatible with old data

### April 4, 2026 — Session 8 (Fork)
- **Narrow Ridge Clinical Decision Engine** (25/25 + 25/25 backend tests passed):
  - New endpoint: `POST /api/implant-library/evaluate-narrow-ridge`
  - 4-level classification: Adequate (>=6mm), Mildly Narrow (4.5-6mm), Moderately Narrow (3-4.5mm), Severely Narrow (<3mm)
  - Safety rules: bone_envelope warning (remaining <2mm), severe_ridge critical block (<3mm)
  - Prosthetic rules: molar warning for narrow implants (<=3.5mm), splinting recommendation (<=3.3mm)
  - Bone density drilling protocol mapping (D1: full, D2: slight undersizing, D3: undersized, D4: osteotome)
  - Integrated into `suggest` and `suggest-auto` endpoints (automatic evaluation when bone_width<6mm)
  - Blocked flow: suggest-auto returns `narrow_ridge_blocked=true` with empty results when ridge<3mm
  - **Suggest Me mode**: "Narrow Ridge" checkbox in Procedure Type list below "Restricted Bone Height"
  - **Let Me Choose mode**: When bone_width<6mm, returns `narrow_options` (implants <=3.5mm diameter) from selected system + `narrow_ridge_warning` if system has no narrow options
  - **Treatment Protocol Display**: Prominent card in Step 3 showing classification, recommended implant type, treatment protocols (undersized drilling/ridge expansion/split crest/GBR/block graft), bone density drilling protocol, and clinical warnings
  - **Blocked UI**: Full blocked state with augmentation message for severe narrow ridge (<3mm) in both modes
  - Frontend: Real-time ridge classification indicator in Step 2 (both modes)
  - Frontend: "Narrow Diameter Options" header when showing narrow_options in Let Me Choose
  - **High Constraint Mode** (Narrow Ridge + Restricted Height combined — 39/39 tests passed):
    - Activates when BOTH bone_width < 6mm AND bone_height <= 10mm
    - Uses tooth number → arch (maxilla/mandible) → region-specific clinical logic
    - **Maxilla** (all teeth): HIGH risk, Augmentation Preferred (Sinus Lift for posterior, GBR/Block Graft for anterior), narrow short implant as compromise
    - **Mandible** (all teeth): MODERATE risk, Narrow Short Implant primary, Ultra-Short secondary, IAN/mental foramen warnings
    - Diameter capped at 3.5mm in high constraint mode
    - Implemented in both `suggest` and `suggest-auto` endpoints
    - Frontend: High Constraint Display card in both CaseImplantPlanning.tsx and implant-selection.tsx
  - **Implant Selection Tab (Home Screen)**: Replicated entire Narrow Ridge protocol from New Case into standalone `implant-selection.tsx`:
    - "Narrow Ridge" checkbox in Suggest Me Procedure Type
    - Real-time RidgeClassIndicator in both Let Me Choose and Suggest Me bone input cards
    - NarrowRidgeProtocol Treatment Protocol Display card in both ChooseResult and SuggestResult
    - Blocked state (augmentation required) handled in both modes
    - Narrow diameter options filtering with "No narrow options" warning in Let Me Choose
    - Consistent UX between New Case and Implant Selection workflows

### April 6, 2026 — Session 10 (Fork)
- **CBCT Report Upload Feature** (17/17 backend tests passed):
  - Backend: `POST /api/uploads/cbct-temp` endpoint for pre-uploading CBCT files before procedure creation
  - Backend: `POST /api/procedures/{id}/upload-cbct` for attaching CBCT to existing procedures
  - Backend: `GET /api/uploads/{filename}` serves uploaded files with role-based access control
  - Backend: `ProcedureCreate` schema includes `cbct_file`, `cbct_original_name`, `cbct_content_type` fields
  - File validation: PDF, PNG, JPG, JPEG, HEIF, HEIC allowed; max 25MB
  - Frontend `new-procedure.tsx`: Mandatory CBCT upload section between Loading Type and Phase 1 Checklist
  - Blue "Upload CBCT Report (PDF)" button → Green "View CBCT Report" button after upload
  - CBCT upload is mandatory (form cannot proceed without it)
  - Frontend `[id].tsx`: Green "View CBCT Report" button visible to all roles when CBCT exists on procedure
  - Role-based file access: student owner, assigned supervisor, incharge/admin can view
- **Post Surgical Radiograph Upload - IOPA/OPG (Phase 2)** (18/18 + mandatory validation):
  - IOPA uploads now MANDATORY: blocks Phase 2 submission if any slot is empty
  - Backend: `Phase2Submit` with `iopa_files` (list) and `opg_file` (dict)
  - IOPA count: All on 4→4, All on 6→6, All on X→5+expandable with +/- buttons
  - OPG upload shown for Full Arch cases only
  - Added "Implant Prosthesis" as 3rd option in Opposing Dentition
- **Multi-CBCT Report Upload (Phase 1)** (11/11 self-tests passed):
  - Backend: `cbct_files: List[Dict]` array field + backward-compat `cbct_file`
  - Frontend: 2 mandatory CBCT tabs by default, green "+" to add more, red "-" on extras (3rd+)
  - Validation: blocks form if fewer than 2 CBCTs uploaded
  - Case detail: CBCT/IOPA/OPG thumbnail previews with Image component

### June 5, 2026 — Session 11 (Fork)
- **Image Auth Token Fix (P0 Bug)** (13/13 backend tests passed):
  - Completed frontend propagation of JWT token to all file URLs in `[id].tsx` (case detail page)
  - Added `authToken` state + `useEffect` fetch in `[id].tsx`
  - Appended `?token=${authToken}` to 6 file URL constructions: IOS file, CBCT array, CBCT legacy, Phase 2 IOPA, Phase 2 OPG, Phase 3 IOPA
  - All 4 frontend files (case detail, new-procedure, submit-phase2, submit-stage2-surgical) now consistently pass JWT tokens for file access
  - Backend `serve_upload` endpoint verified: 200 with valid token, 401 without
- **Multi-Source Upload Picker** (code review verified):
  - Created shared `utils/uploadPicker.ts` with ActionSheet offering 3 options: Photo Library, Take Photo, Browse Files
  - Replaced all 5 DocumentPicker.getDocumentAsync calls across 4 files with showUploadPicker
  - Added expo-image-picker plugin to app.json with camera/photo permission strings
- **Refirm R Series Implant System** (20/20 tests passed):
  - Added 31 implant variants (6 diameters: 3.2-5.5mm) to implant_library_latest.xlsx
  - Implemented full surgical drilling protocols with bone-density logic (D1-D4)
  - Special Ø5.5 case: mandatory CSK Ø5.3 for D1/D2
  - RPM differentiation: Lance/Cylindrical 1200-1500, Taper 800-1000, CSK 600-800, Implant 20-30
  - Target torque: 35-45 Ncm
- **Edentulous Site Fields Replacement** (8/8 tests passed):
  - Replaced multi-select dropdown (Sufficient/Insufficient Occlusocervical/Mesiodistal) with two numeric text inputs
  - "Occlusocervical Height (mm)" and "Mesiodistal Space (mm)" under "Edentulous Site" heading
  - Visible to all roles in case detail page, exported to PDF under Clinical Examination section
  - Fixed pre-existing PDF crash when checklist is null (NoneType bug)
- **Blue Bullet Theme + Full Arch Interarch/Opposing Arch** (11/11 tests passed):
  - Changed all section/subsection/label colors to #1565C0 blue across Phase 1-4 forms (new-procedure, submit-phase2, submit-stage2-surgical)
  - Renamed "Vertical Dimension (mm)" to "Available Interarch Space (mm)" for All on 4/6/X procedures
  - Added "Opposing Arch" single-select scrollable dropdown (Natural Dentition, Fixed Implant Prosthesis, Removable Prosthesis, Edentulous)
  - Both fields visible to all roles and exported to PDF
- **UI Aesthetic Enhancements Phase 1-4** (7/7 tests passed):
  - Warmer background (#F0F4F8), rounded section cards (borderRadius 16) with blue shadows
  - Thicker input borders (1.5px), rounded inputs (borderRadius 10), subtle blue focus styling
  - Pill-shaped buttons with deeper shadows and letter-spacing
  - Consistent blue (#1565C0) label theme across all forms and case detail page
  - Applied across: new-procedure.tsx, submit-phase2/[id].tsx, submit-stage2-surgical/[id].tsx, [id].tsx
- **Smart Prosthetic Planner** (12/12 tests passed):
  - Rule-based Pre-Prosthetic Insights engine, appears after Phase 3 approval
  - Backend: POST/GET /api/procedures/{id}/smart-planner endpoints
  - Dentulous path: Space Analysis (critical/warning/adequate flags), Esthetic Zone (anterior teeth), Retention Guidance, Occlusal Considerations
  - Full Arch path: Interarch Space (severe/moderate/adequate), Material Compatibility, Biomechanics, Opposing Arch, Hygiene
  - ISQ-based stability alerts for low values (<60)
  - Report stored in `smart_planner_report` field, visible to all roles once generated
  - Frontend: Collapsible card in case detail with module-specific renderers
  - **Full Arch Material Compatibility Update**: Evaluates exactly 5 prosthesis types (Fixed Prosthesis, Overdentures with Individual Attachments, Overdenture with Bar Attachments, Hybrid Prosthesis with Metal Framework and Acrylic, Zirconia Hybrid Prosthesis) against evidence-based interarch space mm thresholds. Three-tier classification: Feasible/Marginal/Not Feasible. No ITI/SAC references. Frontend renders green/orange/red indicators per category.

### June 18, 2026 — Session 12 (Fork)
- **Arch Selection for Full Arch Cases** (11/11 backend tests passed):
  - New `arch` field (Maxillary/Mandibular) added to ProcedureCreate model and procedure form
  - "Arch" dropdown appears in Procedure Information section only for All on 4/6/X
  - Dynamic Intraoral label: "Maxillary Arch Condition" or "Mandibular Arch Condition" based on arch selection
  - Dynamic Occlusal label: "Maxillary Restorative Space (mm)" or "Mandibular Restorative Space (mm)" with blue info icon ("Residual alveolar ridge to opposing occlusal table")
  - Case detail page shows arch value and uses dynamic labels throughout
  - Smart Planner uses arch context: module titles dynamically reflect "Maxillary/Mandibular Restorative Space Analysis"
  - PDF export uses dynamic labels for arch condition and restorative space
  - Backward compatible: non-full-arch and legacy procedures without arch field work unchanged
- **Tooth-Specific Bone Measurement Info Icons** (14/14 tests passed):
  - Blue info icons next to "Bone Width (mm)" and "Bone Height (mm)" labels in all 4 workflows: Let Me Choose + Suggest Me in both CaseImplantPlanning.tsx (New Case Phase 1 Step 2) and implant-selection.tsx (Home Implant Selection tab)
  - Bone Width guidance varies by tooth: labial/palatal (anteriors upper), buccal/palatal (posteriors upper), labial/lingual (anteriors lower), buccal/lingual (posteriors lower)
  - Bone Height guidance varies by tooth: crest to maxillary sinus floor (posterior upper), crest to inferior alveolar nerve (posterior lower), no info for anteriors
  - Info text appears inline below label and disappears when input is focused
- **Draft Case Workflow** (22/22 backend tests passed):
  - If only Step 1 is filled and user navigates away, form resets completely (no draft)
  - Once user proceeds to Step 2 (Implant Selection), case is saved as draft in DB
  - Dashboard shows "Drafts" section with inline cards containing patient name, type, and "Continue" button
  - "Continue" navigates to new-procedure with `draftId` param, resumes at Step 2
  - "Delete Draft" button in Step 2 header allows removal of draft cases
  - All roles (Student, Supervisor, InCharge) can delete their own draft cases
  - Available on all user dashboards (Student, Supervisor, InCharge)

### June 18, 2026 — Session 12c (Fork)
- **CBCT Button Overflow Fix**: Reduced padding/font size of green "View CBCT Report" buttons to stay within card boundaries on mobile screens
- **Vertical Dimension Removed**: Removed "Vertical Dimension" dropdown from non-full-arch Occlusal Analysis (Single Conventional, Multiple Conventional, Immediate Implant, Partial Extraction Therapy, GBR, Guided Surgery)
- **Opposing Dentition/Arch Updated**: Both full-arch and non-full-arch now use unified 5 options: Natural Dentition, Fixed Partial Denture, Fixed Implant Prosthesis, Removable Prosthesis, Edentulous
- **InCharge Drafts Section**: Added Drafts section to InCharge dashboard (was missing — Student and Supervisor already had it)
- **Profile Photo in Drawer Menu & User Management** (13/13 tests passed):
  - Hamburger drawer menu now shows user's profile photo (circular, blue border) when available, falls back to generic person icon
  - Drawer header shows user name and role next to the photo
  - InCharge User Management page shows profile photos for all users in the user list cards
  - Profile photo auto-refreshes after upload via auth context state update
  - All API endpoints confirmed: GET /auth/me, GET /users, PUT /auth/profile-photo, and login response all include profile_photo

### Bug Fixes — Session 12e
- **Drawer Username Fix** (11/11 tests): Changed `user?.full_name` to `user?.name` — backend returns `name` field, not `full_name`
- **Draft Slot Conflict Fix**: Own draft no longer blocks re-creation on same slot. Other users still get 409 on booked slots.
- **Draft Delete Persistence**: Deleted drafts removed from DB; dashboard uses `useFocusEffect` to auto-refresh on navigate back
- **Drafts Hidden from My Cases/Alerts**: Procedures page filters out `status === 'draft'`; removed `draft` from `ACTION_NEEDED_MAP`
- **My Cases Sort Order**: GET /api/procedures now sorts by `created_at` descending (latest first) for all filter types

### June 18, 2026 — Session 12f: Implanr AI Integration (22/22 tests passed)
- **AI Clinical Explanation Engine** (`POST /api/ai/explain-recommendation`):
  - "Explain Recommendation" button appears after implant suggestion in Phase 1 Step 2 (CaseImplantPlanning.tsx)
  - Generates 3-4 sentence clinical reasoning explaining why the selected implant is appropriate
  - Stored in `procedure.ai_explanations.implant_{index}`
- **AI Case Summary Generator** (`POST /api/ai/case-summary`):
  - "AI SUMMARY" button on case detail page alongside PDF export
  - Generates structured clinical summary (Presentation, Treatment Plan, Risk, Notes)
  - Displayed in purple-accented card below action buttons; stored in `procedure.ai_case_summary`
- **Auto Surgical Notes Generator** (`POST /api/ai/surgical-notes`):
  - "Generate Surgical Notes" button in Phase 2 submission page above Submit button
  - Generates operative notes from drilling protocol, torque, ISQ, and case data
  - Stored in `procedure.ai_surgical_notes`
- **AI Chat Assistant** (`POST /api/ai/chat`, `GET /api/ai/chat/{id}`):
  - Floating "Ask Implanr AI" button on case detail page (visible after Phase 1)
  - Full chat modal with conversation history, context-aware responses grounded in case data
  - History stored per procedure in `procedure.ai_chat_history`
- **Tech**: GPT-5.2 via Emergent Universal Key (emergentintegrations library). Production-ready: swap to own OpenAI key in .env before App Store launch.
- **Interactive Case Pipeline for Supervisor & InCharge** (22/22 tests passed):
  - Supervisor dashboard now shows Case Pipeline section (Phase 1-4 + Complete bars)
  - InCharge pipeline bars made interactive
  - Tapping a pipeline bar navigates to procedures list filtered by that phase
  - Backend GET /api/procedures accepts `phase` query param (1,2,3,4,completed)
  - Procedures page supports `phase` URL param for filtered views

### Earlier Sessions
- Session 11 (Apr 16, 2026): Fixed 3 P0 bugs: (1) Black screen when transitioning Step 1→Step 2 in New Case workflow — added data-testid, fixed useFocusEffect dependency array to include params.draftId. (2) Draft data hydration — updated loadDraft to restore ALL form fields (clinical exam, occlusal analysis, aesthetic risk, medical assessment, checklist). (3) Standalone AI Explain Recommendation — created POST /api/ai/explain-standalone endpoint for use without procedure_id, added AI button to both ChooseResult and SuggestResult in implant-selection.tsx. Also fixed procedureId prop missing in CaseImplantPlanning ImplantPlanModal. Then fixed 3 UI/UX bugs in case detail page: (a) Bottom action bar overflow — changed from single-row to 2-row grid layout so Dashboard/DELETE/EXPORT PDF/AI SUMMARY all fit properly. (b) AI Summary not scrollable, no close button, persists across navigation — moved summary inside ScrollView, added close (X) button, removed auto-load from DB on page open. (c) AI Chat input positioned too low — replaced static View with KeyboardAvoidingView, added safe area padding, proper flex layout. Then major AI Summary enhancement: (i) Phase-aware summaries — Phase 1 only shows Patient Info/Procedure/Clinical Exam/Occlusal/Aesthetic/Medical/Implant Selection; cumulative for Phase 2+3+4. (ii) Dynamic case-type detection (full_arch, overdenture, bone_graft, multiple_implant, immediate_loading, single_implant). (iii) ITI/ICOI/Misch guidelines enforced in all AI prompts. (iv) Supervisor/In-Charge can now see AI Summary for all relevant cases via canViewAiSummary().
- Session 13 (Feb 19, 2026): (1)–(10) as before. (11) **Consent flow refinement**: Removed the Patient Consent tile from Phase 1 `new-procedure.tsx` (between Medical Assessment and Continue) — case creators now upload/print consent only from the case detail page after Phase 1 submission (at the location between Treatment Progress and Patient Information tiles). Nurse workflow unchanged. (12) **PDF content upgraded**: Added a "Planned Implant(s)" table listing each selected implant (site, brand/system, diameter × length). Added a new section 6 "Data Protection & Digital Record Consent" with (a) plain-language summary ("my clinical information will be stored in the Implanr application and shared with the clinicians and authorized staff directly involved in my care"), and (b) formal clause citing the Digital Personal Data Protection Act 2023, GDPR, and HIPAA — covering collection, storage, processing, transmission, audit, and sharing with lawful stakeholders. Renumbered Consent Statement → 7. PDF now 2 pages, 6.9 KB. (13) **Fixed native download bug**: Replaced the blob-reader approach in `consentPdf.ts` with `FileSystem.downloadAsync(url, localPath, { headers: { Authorization } })` — the blob reader doesn't work reliably in React Native's axios adapter. Web path unchanged (window.open on blob URL). Validated: PDF contains all 8 required sections, HTTP 200 with valid 2-page document.
- Session 12 (Apr 17, 2026): 6 UI/clinical changes: (1) Edentulous Site labels changed from black to blue. (2) Fixed duplicate Periodontal Status. (3) All checklists Phase 1-4 converted from checkboxes to Yes/No toggles, mandatory. (4) Phase 1 checklist hides Oral Prophylaxis for full-arch. (5) Phase 2 Access Channel Opening per-implant with tooth-dependent options. (6) Treatment Confirmed Complete text overflow fixed. Also: Added Patient Info fields (age, sex, profession, mobile, email, chief_complaint, periodontal_status). AI summary references removed from output. Download Photo Album removed. Then: Case Detail layout fix (grey gap removed, DELETE removed from bottom bar, compact centered EXPORT PDF + AI SUMMARY). Three-dot menu on My Cases cards (Edit/Delete/Archive for In-Charge, Edit/Archive for Supervisor, Archive for Student, none for Nurse). Archive feature with backend endpoints (archive/unarchive/get-archived), Archived Cases page in drawer menu with Unarchive/Delete options. Alerts tab search bar + In-Charge three-dot Edit Phase menu.
- Session 10: Integrated 4 AI features (Explain Recommendation, PDF Case Summary, Surgical Notes, Floating AI Chat) using emergentintegrations Universal Key with OpenAI GPT-5.2.
- Session 9: Narrow Ridge, High Constraint engines, scheduling constraints, logo replacement
- Session 8: Narrow Ridge Clinical Decision Engine, Implant Selection Tab replication
- Session 7: Approval revert, Bone Graft, Role-Based Dashboards, Medical Risk Assessment
- Session 6: Per-implant healing abutment, approval comments, dynamic notes
- Session 5: Blank screen crash fix, backend seed sync, auth upgrade
- Session 4: EAS Deployment Fix, Auth Upgrade (20/20 tests), Health endpoint
- Session 3: Drilling Protocol Audit, PDF Enhancement, Stale Data Fix
- Sessions 1-2: Full 4-phase workflow, Security/UX features, EAS build fixes

## Backlog (Prioritized)
### P0
- (None — all P0 items resolved)

### P1
- Microsoft Login Integration (user explicitly requested for sign up and login)
- Add indications/protocols for remaining 17 systems (when user provides data)
- Production AI Key Setup: Switch from Emergent Universal Key to user's own OPENAI_API_KEY for App Store deployment
- Production deployment verification (user needs to "Save to Github" + Deploy)

### P2
- Multi-tenant architecture (Hybrid: Colleges + Clinics mode with institution_id filtering)
- Backend refactoring: Decompose server.py into modular routers, models, services
- Frontend refactoring: Modularize CaseImplantPlanning.tsx and [id].tsx
- Data cleanup: Remove duplicate user entries
