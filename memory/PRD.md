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

### Foundation
- Full case creation wizard (2-step)
- Implant selection with FDI chart, drilling protocol generator
- 4-phase approval workflow (Phase 1-4)
- Clinical photo album (4 phases of photo documentation)
- User management (CRUD), Push notifications (Expo Push API)
- Username-based login + stale session validation
- Draft Cases section on student dashboard

### Phase A — New Case Workflow Changes
- Removed attachment upload from checklist items #3 and #9
- Fixed Add Implant Position modal header overlap (useSafeAreaInsets)
- Added "Generate Drilling Protocol" button on each saved implant card
- Phase-wise photo upload with camera capture and library pick support

### Phase B — Data Visibility & UI Cleanup
- Photo visibility for Supervisors/In-Charges — auto-expand during approval, review prompt
- Notification badge count on Alerts tab — polls every 30s
- Removed duplicate "Post-Surgical Notes by Student" from Phase 2 checklist
- Torque values per implant visible in procedure detail and implant cards
- Phase 2 remark display in procedure detail page

### Phase C — Case Summary & Downloads
- Removed duplicate remark additionalFields from Phase 4 prosthetic_phase checklist
- Final Prosthetic Plan displayed on procedure detail page (all roles, all times)
- Case report PDF excludes photos; all key details visible in case summary
- "Download Photo Album" button in CaseCompletionBadge (completed cases only)

### Workflow & PDF Refinements (Mar 2026)
- **Implant plan lock:** Students and supervisors can edit/remove implant details until Phase 2 approved. Backend enforces 403 after phase2_approved. Frontend hides edit/remove UI.
- **System options display:** Step 2 of Add Implant Position shows all available diameters/lengths of selected system
- **Suggest Me fix:** Fixed key mismatch (`suggestions` -> `recommended_systems`) so auto-suggest engine works
- **Download buttons cleanup:** Removed "Download Case Report PDF" button entirely. "Download Photo Album" only shows after case completion.
- **Export PDF enhanced:** Available from phase2_approved through completed. Now includes implant selection table (position, brand, system, diameter, length), torque values, final prosthetic plan, and phase2 remarks.

## Key Endpoints
- `POST /api/procedures` — Create case (status: "draft")
- `POST /api/procedures/{id}/request-phase1-approval` — Draft -> pending_phase1
- `POST /api/procedures/{id}/approve` — Phase approval/rejection
- `POST /api/procedures/{id}/submit-phase2` — Submit surgical protocol (with torque_values)
- `POST /api/procedures/{id}/stage2/prosthetic` — Submit Phase 4 (with final_prosthetic_plan)
- `POST /api/procedures/{id}/implant-plan` — Save implant plans (locked after phase2_approved)
- `GET /api/notifications/unread-count` — Unread notification count
- `POST /api/procedures/{id}/generate-album` — Generate photo album PDF
- `POST /api/implant-library/suggest-auto` — Auto-suggest implants (returns recommended_systems)
- `GET /api/implant-library/systems` — List all systems with diameters/lengths/count

## Status Flow
`draft` -> `pending_phase1` -> `phase1_approved` -> `pending_phase2` -> `phase2_approved` -> `pending_stage2_surgical` -> `stage2_surgical_approved` -> `pending_stage2_prosthetic` -> `completed`

## Backlog
### P2 - Refactoring
- Backend refactoring (decompose server.py into routers/models/services)
- Frontend refactoring (modularize new-procedure.tsx, [procedureId].tsx)
- Data cleanup (duplicate user removal)
