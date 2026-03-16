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
- **Faculty case creation:** Supervisors and Implant In-Charges can create New Cases (without a student).
  - **Supervisor creates:** status=draft, supervisor_phase1/2_approved pre-set. Only Implant In-Charge needs to approve each phase.
  - **Implant In-Charge creates:** status=completed, all phases auto-approved instantly.
  - Notifications handle null student_id gracefully.
- Frontend adapted: auto-fill supervisor/incharge fields, locked dropdowns, faculty banner, no 24h restriction for faculty.

## Key Endpoints
- `POST /api/procedures` — Create case (student/supervisor/incharge)
- `POST /api/procedures/{id}/implant-plan` — Save implant plans (role-based lock)
- `POST /api/procedures/{id}/approve` — Phase approval
- `GET /api/notifications/unread-count` — Unread count
- `POST /api/procedures/{id}/generate-album` — Photo album PDF
- `POST /api/implant-library/suggest-auto` — Auto-suggest implants

## Status Flow
`draft` -> `pending_phase1` -> `phase1_approved` -> `pending_phase2` -> `phase2_approved` -> `pending_stage2_surgical` -> `stage2_surgical_approved` -> `pending_stage2_prosthetic` -> `completed`

## Backlog
### P2 - Refactoring
- Backend refactoring (decompose server.py into routers/models/services)
- Frontend refactoring (modularize new-procedure.tsx, [procedureId].tsx)
- Data cleanup (duplicate user removal)
