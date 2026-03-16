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
- **Draft Cases section on student dashboard** — shows incomplete cases with quick "Send for Approval" action + tap to navigate to case detail

## Key Endpoints
- `POST /api/procedures` — Create case (status: "draft")
- `POST /api/procedures/{id}/request-phase1-approval` — Draft -> pending_phase1
- `POST /api/procedures/{id}/approve` — Phase approval/rejection
- `POST /api/procedures/{id}/submit-phase2` — Submit surgical protocol
- `POST /api/procedures/{id}/implant-plan` — Save implant plans

## Status Flow
`draft` -> `pending_phase1` -> `phase1_approved` -> `pending_phase2` -> `phase2_approved` -> `pending_stage2_surgical` -> `stage2_surgical_approved` -> `pending_stage2_prosthetic` -> `completed`

## Backlog
- P2: Notification system enhancements
- P2: Backend refactoring (decompose server.py into routers/models/services)
- P2: Frontend refactoring (modularize new-procedure.tsx)
- P2: Data cleanup (duplicate user removal)
