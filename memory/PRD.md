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

### Earlier Sessions
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
- Microsoft Login Integration (user explicitly requested for sign up and login)

### P1
- Data visibility refinement for approval workflow (ensure all entered data visible before/after approval)
- Add indications/protocols for remaining 17 systems (when user provides data)
- Production deployment verification (user needs to "Save to Github" + Deploy)

### P2
- Multi-tenant architecture (Hybrid: Colleges + Clinics mode with institution_id filtering)
- Backend refactoring: Decompose server.py into modular routers, models, services
- Frontend refactoring: Modularize CaseImplantPlanning.tsx and [id].tsx
- Data cleanup: Remove duplicate user entries
