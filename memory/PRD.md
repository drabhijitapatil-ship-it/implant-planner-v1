# Prosthodontics Case Management App — PRD

## Original Problem Statement
A mobile application for prosthodontics departments to manage implant cases through a multi-phase approval workflow. Students create cases, plan implants, and submit for faculty approval across multiple phases (Pre-surgical, Surgical, Second Stage Surgery, Prosthetic Rehabilitation).

## Core Requirements
- Multi-step case creation wizard (Step 1: Case Details, Step 2: Implant Selection)
- Phase-based approval workflow (4 phases)
- Implant planning with FDI tooth chart, system/size selection, drilling protocol
- Role-based access: student, supervisor, implant_incharge, administrator, nurse
- Clinical photo album for documentation
- Case report PDF generation
- Push notifications via Expo

## Architecture
- **Frontend:** React Native (Expo) with Expo Router
- **Backend:** FastAPI (monolithic `server.py`)
- **Database:** MongoDB (Motor async driver)
- **Auth:** JWT-based

## What's Been Implemented
- Full case creation wizard (2-step)
- Implant selection with FDI chart, drilling protocol generator
- 4-phase approval workflow (Phase 1-4)
- Clinical photo album (4 phases of photo documentation)
- Case report PDF generation
- User management (CRUD)
- Push notifications (Expo Push API)
- Delayed Phase 1 Approval Workflow (cases start as "draft", approval sent after implant planning)
- **Draft Cases section on student dashboard**
- Username-based login support + case-insensitive password matching
- **Phase A — New Case Workflow Changes:**
  - Removed attachment upload from checklist items #3 and #9
  - Fixed Add Implant Position modal header overlap with mobile status bar
  - Added "Generate Drilling Protocol" button on each saved implant card
  - Phase-wise photo upload with camera capture and library pick support
- **Phase B — Data Visibility & UI Cleanup (Feb 2026):**
  - Task 5: Photo visibility for Supervisors/In-Charges — auto-expand relevant phase during approval, review prompt banner
  - Task 6: Notification badge count on Alerts tab — polls every 30s, resets on tab press
  - Task 7: Removed duplicate "Post-Surgical Notes by Student" from Phase 2 surgical checklist
  - Task 8: Torque values per implant visible in procedure detail and implant planning cards
  - Added Phase 2 remark display in procedure detail page
- **Phase C — Case Summary & Downloads (Mar 2026):**
  - Task 9: Removed duplicate Student/Faculty/Incharge remark additionalFields from Phase 4 prosthetic_phase checklist
  - Task 10: Final Prosthetic Plan prominently displayed on procedure detail page (visible to all roles at all times)
  - Task 11: Case report PDF excludes photos; all key details (Implant Selection, Torque, Final Prosthesis) visible in case summary
  - Task 12: "Download Photo Album" button added to CaseCompletionBadge — separate from case report PDF, available for all cases

## Key Endpoints
- `POST /api/procedures` — Create case (status: "draft")
- `POST /api/procedures/{id}/request-phase1-approval` — Draft -> pending_phase1
- `POST /api/procedures/{id}/approve` — Phase approval/rejection
- `POST /api/procedures/{id}/submit-phase2` — Submit surgical protocol (with torque_values)
- `POST /api/procedures/{id}/stage2/prosthetic` — Submit Phase 4 (with final_prosthetic_plan)
- `POST /api/procedures/{id}/implant-plan` — Save implant plans
- `GET /api/notifications/unread-count` — Unread notification count
- `POST /api/procedures/{id}/case-report` — Generate case report PDF (no photos)
- `POST /api/procedures/{id}/generate-album` — Generate photo album PDF (with photos)

## Status Flow
`draft` -> `pending_phase1` -> `phase1_approved` -> `pending_phase2` -> `phase2_approved` -> `pending_stage2_surgical` -> `stage2_surgical_approved` -> `pending_stage2_prosthetic` -> `completed`

## Backlog
### P2 - Refactoring
- Backend refactoring (decompose server.py into routers/models/services)
- Frontend refactoring (modularize new-procedure.tsx, [procedureId].tsx)
- Data cleanup (duplicate user removal)
