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
- Fixed `.gitignore` blocking `.env` files from deployment
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

## Backlog
### P2 - Refactoring
- Backend refactoring (decompose server.py into routers/models/services)
- Frontend refactoring (modularize new-procedure.tsx, [procedureId].tsx)
- Data cleanup (duplicate user removal)
