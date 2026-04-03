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
- Backend refactoring: Decompose server.py into modular routers, models, services
- Frontend refactoring: Modularize CaseImplantPlanning.tsx and [id].tsx
- Data cleanup: Remove duplicate user entries
