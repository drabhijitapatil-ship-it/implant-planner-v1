# Prosthodontics Case Management App — PRD

## Original Problem Statement
A mobile application for prosthodontics departments to manage implant cases through a multi-phase approval workflow.

## Architecture
- **Frontend:** React Native (Expo) with Expo Router
- **Backend:** FastAPI (monolithic `server.py`)
- **Database:** MongoDB (Motor async driver)
- **Auth:** JWT-based

## What's Been Implemented

### Foundation
- Full case creation wizard (2-step), Implant selection with FDI chart, drilling protocol
- 4-phase approval workflow, Clinical photo album (4 phases), PDF reports
- User management, Push notifications, Username/email login

### Phase A — Checklist & Implant UI Fixes
- Removed attachment from checklist items #3 & #9
- Fixed modal header overlap (useSafeAreaInsets)
- Drilling protocol button on implant cards
- Phase-wise photo upload (camera + library)

### Phase B — Data Visibility & UI Cleanup
- Photo auto-expand for reviewers, notification badge on Alerts tab
- Removed duplicate Phase 2 notes, torque visibility in detail & implant cards

### Phase C — Case Summary & Downloads
- Removed duplicate Phase 4 remark fields, Final Prosthetic Plan display
- Photo Album download (completed cases only), Export PDF enhanced

### Workflow & PDF Refinements
- System options display in Step 2, Suggest Me fix (key mismatch)
- Download Case Report PDF removed, Export PDF from phase2_approved onwards
- Export PDF includes implant table, torque, final prosthesis, phase2 remarks

### Permissions & Faculty Case Creation (Mar 2026)
- **Implant plan edit lock:** Students locked after Phase 2 approval. Supervisors/In-Charges can edit at ALL stages. Backend enforces via role + status check.
- **Edit implant flow fixed:** Edit now opens at Step 2 (System Selection) with pre-filled values, allowing users to change system, diameter, and length. Previously skipped to Step 4 (read-only summary).
- **Faculty case creation:** Supervisors and Implant In-Charges can create New Cases (without a student).
  - **Supervisor creates:** status=draft, supervisor_phase1/2_approved pre-set. Only Implant In-Charge needs to approve each phase.
  - **Implant In-Charge creates:** status=completed, all phases auto-approved instantly.
  - Notifications handle null student_id gracefully.
- Frontend adapted: auto-fill supervisor/incharge fields, locked dropdowns, faculty banner, no 24h restriction for faculty.

### Two-Tier Rejection System (Mar 2026)
- **Reject Permanently:** Case set to `permanently_rejected` (terminal status). No further phases can proceed. Reason stored, creator notified.
- **Reject with Consideration:** Phase goes back to editable state (Phase 1→draft, Phase 2→phase1_approved, Phase 3→phase2_approved, Phase 4→stage2_surgical_approved). Approval flags reset. Student can edit and resubmit. Reason/feedback stored, creator notified.
- Works for all 4 phases (Phase 1, 2, 3, 4). Both types require a reason.
- Frontend: Two-step rejection modal (select type → enter reason). Permanent rejection banner (red) and revision-requested banner (orange) displayed on case detail page.
- Notifications sent to case creator for both rejection types with reason included.

### ImplantLens – Clinical Case Album (Mar 2026)
- New standalone feature accessible from hamburger menu
- **Case Album Listing** (`/implantlens`): Lists all cases with photo completion progress bars, missing photo alerts (count + first 5 missing steps), search by patient/student name, and stats (Total/Complete/In Progress/No Photos)
- **Case Album Detail** (`/implantlens/[caseId]`): Full-screen CasePhotoAlbum view with case info header and "Full Case" link
- **Backend** `GET /api/implantlens/cases`: Returns cases with photo stats (photos_uploaded, photos_total, missing_count, missing_steps). Role-filtered: students see own, supervisors see assigned/created, admin/incharge see all.

## Key Endpoints
- `POST /api/procedures` — Create case (student/supervisor/incharge)
- `POST /api/procedures/{id}/implant-plan` — Save implant plans (role-based lock)
- `POST /api/procedures/{id}/approve` — Phase approval
- `GET /api/notifications/unread-count` — Unread count
- `POST /api/procedures/{id}/generate-album` — Photo album PDF
- `POST /api/implant-library/suggest-auto` — Auto-suggest implants

## Status Flow
`draft` -> `pending_phase1` -> `phase1_approved` -> `pending_phase2` -> `phase2_approved` -> `pending_stage2_surgical` -> `stage2_surgical_approved` -> `pending_stage2_prosthetic` -> `completed`

## Deployment Fixes (Mar 2026)
- Fixed `.gitignore` blocking `.env` files from deployment (removed duplicate *.env entries)
- CORS origins now read from `CORS_ORIGINS` env variable
- Aligned `package.json` start script with supervisor config (`--tunnel`)
- **Fixed ERR_NGROK_3200 / Expo Go tunnel failure:**
  - Root cause: Expo SDK 54 bundles ngrok v2 binary (deprecated servers) + shared ngrok account (throttled)
  - Fix: Installed ngrok v3 binary via `scripts/install-ngrok-v3.sh` (auto-detects architecture)
  - Patched `@expo/cli` to use user's ngrok auth token via `EXPO_NGROK_AUTH_TOKEN` env var
  - Patched `@expo/ngrok` for v3 API compatibility (cleaned tunnel config, kill stale processes)
  - Skips custom subdomain on free tier (ngrok v3 free doesn't support subdomains)
  - All patches persisted via `patch-package` in `frontend/patches/`
  - `EXPO_NGROK_AUTH_TOKEN` env variable required in frontend/.env
- **Fixed DateTimePicker build crash (Mar 2026):** Removed `@react-native-community/datetimepicker` usage from `new-procedure.tsx` and replaced with text-based date input (YYYY-MM-DD) to resolve EAS build failure due to missing dependency.

## New Case Workflow Overhaul (Mar 2026)
**Two-Step Flow:** Case Details → "Continue to Implant Selection" → Implant Selection → "Submit for Approval"

**New Fields in Case Details (Phase 1):**
- Clinical Examination: Intraoral exam (edentulous site, ridge contour, soft tissue, keratinized mucosa)
- Occlusal Analysis: Conditional on procedure type (non-full-arch: occlusal scheme, parafunction, vertical dimension, opposing dentition; full-arch: vertical dimension in mm, TMJ)
- Aesthetic Risk Assessment: Conditional non-full-arch (smile line, gingival biotype)
- Medical Assessment: Diabetes, Smoking, Anticoagulant, Osteoporosis, Radiation (Yes/No) + auto risk classification
- Prosthetic Plan: Conditional options based on procedure type + loading type, "Other" with manual entry

**Updated Options:**
- Procedure Types: "Implant Placement with GBR" → "Implant Placement with Guided Bone Regeneration"
- Loading Types: Added "Early Loading" (now: Immediate, Early, Delayed)
- Prosthetic Plans: Expanded with Zirconia Ti Base, Custom Abutment, Malo, PEEK, Full Arch options

**Risk Calculator:** Now accepts `medical_assessment` parameter. When provided, adds Medical Risk factor (score 1-3), max_score becomes 18 (vs 15). Generates specific clinical recommendations per medical factor.

## Backend Security & Hardening (Mar 2026)
1. **Rate Limiting** — `slowapi` with `@limiter.limit("5/minute")` on `/auth/login` (SlowAPI + get_remote_address)
2. **JWT Session Invalidation** — `jti` claim added to tokens; in-memory `token_blocklist` set; `/auth/logout` endpoint adds jti to blocklist; all protected routes check blocklist
3. **Global Exception Handler** — `@app.exception_handler(Exception)` returns `{"error":"Internal server error","detail":str(exc)}` with 500; HTTPException handler returns clean JSON
4. **Gunicorn Multi-Worker Config** — `gunicorn.conf.py` (2 workers, UvicornWorker, bind 0.0.0.0:8001) + `start.sh`
5. **HTTPS Enforcement** — Startup check warns if any configured URL uses `http://` in production
6. **Unicode Patient Names** — Regex `^[\w\s\-'.À-ÿ]+$` validates patient_name; Pydantic `field_validator` applied
7. **Input Sanitisation** — `sanitize_input()` strips `<>"';` from all string inputs; `max_length` constraints on all fields (name:100, email:255, etc.); applied via Pydantic `field_validator` on all request models

New dependencies: `slowapi==0.1.9`, `gunicorn==25.1.0`
New files: `/app/backend/gunicorn.conf.py`, `/app/backend/start.sh`

## Frontend Security & UX Hardening (Mar 2026)
1. **JWT Expiry → Auto Redirect** — Axios response interceptor in `api.ts` catches 401, clears AsyncStorage, redirects to login
2. **HTTPS Enforcement** — Runtime warning in `api.ts` if `EXPO_PUBLIC_BACKEND_URL` doesn't use `https://`
3. **Patient Name Input** — `autoCorrect={false}`, `autoCapitalize="none"` on patient name field in `new-procedure.tsx`
4. **Form State Persistence** — AppState listener saves form data to AsyncStorage on app background; restores on mount; clears after successful submission
5. **Client-side Input Sanitisation** — `sanitizeString()` trims whitespace and strips `< > " ' ;` from all string fields before API submission

### Bug Fix: Case Creation Status (Mar 2026)
- **Fixed**: Implant In-Charge cases no longer auto-complete on creation. All roles (student, supervisor, incharge) now start as `draft` and must go through the normal `draft → pending_phase1 → ...` approval workflow.
- **Fixed**: Added `status` field to `ProcedureUpdate` model so "Submit for Approval" (PUT with `{status: "pending_phase1"}`) actually works.
- **Fixed**: Status transition validation — only `draft → pending_phase1` is allowed via PUT endpoint.
- **Fixed**: Students can now edit their own `draft` procedures (was previously restricted to `pending_supervisor` only).

### Phase 1 Overhaul (Mar 2026 — Doc-Aligned)
- **Clinical Exam Group A** (Single, Multiple, GBR, Guided Surgery) — Multi-select "Edentulous Site", Ridge Contour, Soft Tissue, Keratinized Mucosa
- **Clinical Exam Group B** (All on 4/6/X) — "Mandibular/Maxillary Arch Condition" + Ridge/Tissue/Keratinized
- **Edentulous Site → Multi-Select** — New MultiSelectDropdown with checkboxes
- **Occlusal/Aesthetic for all non-full-arch** — All 6 types (incl. Immediate/PET) now trigger Occlusal Analysis + Aesthetic Risk
- **Schedule** — Mon-Fri: 10am/2pm, Saturday: 10am only, Sunday: No slots. Time resets on date change
- **Prosthetic Plan** — 4 conditional option lists (Single crowns, Bridge/Multiple, Immediate Loading PMMA, Full-Arch)
- **Checklist** — Matches document: Academic Readiness + upload, RealGuide, Pre-op Medication, Full Payment
- **Backend** — Added `edentulous_sites` (List[str]), `arch_condition` (str) to ProcedureCreate/Update

### Phase 2 Implementation (Mar 2026 — Doc-Aligned)
- **Pre-Surgery Checklist**: 7 items (consent, vitals, drilling protocol, implant kit, drapes, instruments, asepsis)
- **Surgical Procedure**: Anesthesia (Yes/No), Flap Design (5 options), Drilling Type (4 options), Implant Seated + Torque per implant, Prosthetic Component (3 options), Suturing (sutures + hemostasis)
- **Post-Operative Checklist**: 3 items (radiograph, instructions, medications)
- **Notes**: Student, Supervisor, In-Charge text areas
- **Backend**: `Phase2Submit` model with all fields, `phase2_data` subdocument stored, permissions opened for faculty-created cases
- **Frontend**: Full rewrite of `submit-phase2/[id].tsx` with scrollable dropdowns, toggles, torque inputs

### Phase 3 Implementation (Mar 2026 — Doc-Aligned)
- **Checklist**: 6 items (Components Available, Implant Site Exam, Radiograph, ISQ Value with text input, Healing Abutment with cuff height mm input, Prosthetic Plan Evaluated)
- **Notes**: Student, Supervisor, In-Charge text areas
- **Backend**: `Stage2SurgicalSubmit` model with `checklist_items`, `isq_value`, `healing_abutment_height`, `student_notes`. `phase3_data` subdocument stored. Permissions opened for faculty

### Phase 4 Implementation (Mar 2026 — Doc-Aligned, 2-Step)
- **Step 1: Final Prosthesis & Impressions** — Conditional prosthesis dropdown (FP1/2/3 per type, material, custom abutment, overdenture attachment), payment + components checkboxes, impression type selector
- **Step 2: Trial & Prosthesis Delivery** — 5-item trial checklist (Jig/Sheffield's/Radiographic, Prosthesis Trial, Occlusion, Final Placement), student notes, confirmation statement
- **New Statuses**: `stage2_prosthetic_step1_approved`, `pending_final_delivery`
- **Backend**: `Phase4Step2Submit` model, new submission + approval endpoints for Step 2, badge generation + completion on final approval
- **Frontend**: Rewritten `submit-stage2-prosthetic/[id].tsx` for Step 1, new `submit-phase4-step2/[id].tsx` for Step 2

### Phase 1 Refinements (Mar 2026)
1. **Top 3 + Show More implants**: Fixed React hooks violation (useState inside render callback). Extracted `showAllResults` state to parent `ImplantPlanModal`. Added missing `matchHeader`, `showMoreBtn`, `showMoreText` styles to modal StyleSheet.
2. **Clinical Examination data on detail page**: Added new sections to `[id].tsx` — Procedure Details (type, loading, prosthetic plan), Clinical Examination (edentulous sites, arch condition, ridge contour, soft tissue, keratinized mucosa), Occlusal Analysis, Aesthetic Risk Assessment, Medical Assessment (with risk level badge). Each section has colored left border and appropriate icons.
3. **PDF Export enhanced**: Added Procedure Details, Clinical Examination, Occlusal Analysis, Aesthetic Risk, and Medical Assessment sections to `pdfGenerator.ts`. Medical factors shown with color-coded Yes/No. PDF export now available from `pending_phase1` onwards (previously only from `phase2_approved`).
4. **Auto-populate Implant Site**: Backend `save_implant_plan` endpoint now auto-sets `implant_site` field from sorted unique tooth positions (e.g., "14, 36"). No manual entry needed.
5. **Data visibility by role/status**: All Phase 1 clinical data is now visible on the detail page regardless of role. PDF export enabled for all non-draft statuses.

### Phase 2 Refinements (Mar 2026)
1. **Header collision fix**: Added `'top'` to SafeAreaView edges in `submit-phase2/[id].tsx` so the "Phase 2 — Surgical Protocols" header sits below the mobile status bar.
2. **Drilling Type options updated**: Changed from 4 options to 3: Guided Surgery, Free Hand Sequential Drilling, Combination of Guided and Free Hand Sequential Drilling.
3. **Healing Abutment cuff height**: When "Healing Abutment Placed" is selected as Prosthetic Component, a text input for cuff height (mm) appears. Value stored in `phase2_data.healing_abutment_cuff_height`.
4. **Full Phase 2 data visibility on detail page**: Added comprehensive Phase 2 section to `[id].tsx` showing:
   - Pre-Surgery Checklist (with check/uncheck status)
   - Surgical Procedure details (Anaesthesia, Incision/Flap, Drilling, Implant Seating, Torque, Prosthetic Component, Cuff Height, Sutures, Hemostasis)
   - Post-Operative Checklist
   - Post-surgical Notes by Student, Remarks by Supervisor, Remarks by In-Charge
   - All data visible to all roles at all times (during and after approval)
5. **Backend**: `phase2_supervisor_notes` and `phase2_incharge_notes` now saved as top-level fields for easy retrieval.

### Phase 3 & Phase 4 Data Consolidation (Mar 2026)
1. **Phase 3 — Second Stage Surgical** section on detail page: Shows checklist items (with check/uncheck icons), ISQ Value, Healing Abutment Height, and notes by Student/Supervisor/In-Charge.
2. **Phase 4 Step 1 — Prosthetic Protocol** section: Shows Final Prosthetic Plan, Prosthetic Material, Custom Abutment, Overdenture Attachment, Impression Type, Payment/Components status, and notes by Student/Supervisor/In-Charge.
3. **Phase 4 Step 2 — Trial & Delivery** section: Shows Trial Checklist (check/uncheck), Confirmation Statement, and notes by Student/Supervisor/In-Charge.
4. **Backend**: Phase 3 submit now saves `phase3_supervisor_notes` and `phase3_incharge_notes`. Phase 4 Step 2 submit now saves `phase4_step2_supervisor_notes` and `phase4_step2_incharge_notes`.
5. All phase data visible to all roles (student, supervisor, in-charge) at all times.

## Backlog
### P2 - Refactoring
- Backend refactoring (decompose server.py into routers/models/services)
- Frontend refactoring (modularize new-procedure.tsx, [procedureId].tsx)
- Data cleanup (duplicate user removal)
- Consider installing `@react-native-community/datetimepicker` properly for better native date picking UX
