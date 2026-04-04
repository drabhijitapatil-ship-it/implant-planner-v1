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

### Earlier Sessions
- Session 5: Blank screen crash fix, backend seed sync, auth upgrade
- Session 4: EAS Deployment Fix, Auth Upgrade (20/20 tests), Health endpoint
- Session 3: Drilling Protocol Audit, PDF Enhancement, Stale Data Fix
- Sessions 1-2: Full 4-phase workflow, Security/UX features, EAS build fixes

## Backlog (Prioritized)
### P1
- Add indications/protocols for remaining 17 systems (when user provides data)
- Production deployment verification (user needs to "Save to Github" + Deploy)

### P2
- Multi-tenant architecture (Hybrid: Colleges + Clinics mode with institution_id filtering)
- Backend refactoring: Decompose server.py into modular routers, models, services
- Frontend refactoring: Modularize CaseImplantPlanning.tsx and [id].tsx
- Data cleanup: Remove duplicate user entries
