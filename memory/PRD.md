# Prosthodontics Dental Implant Mobile App — PRD

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
