# Dental Implant Management System - PRD

## Original Problem Statement
Mobile app using Expo for the Department of Prosthodontics to plan and manage dental implant procedures with multi-stage approval workflows.

## User Roles
1. **PG Student** - Creates procedures, fills checklists, submits for approval
2. **Supervisor** - Reviews and approves/rejects procedures
3. **Implant Incharge** - Reviews and approves/rejects procedures (also has admin capabilities)
4. **Administrator** - User management, system administration
5. **Nurse** - Read-only access to approved/completed procedures

## Core Workflow (Multi-Stage)

### Stage 1: Implant Placement
- **Phase 1 (Pre-surgical):** Student fills pre-surgical checklist → Dual approval (Supervisor + Implant Incharge)
- **Phase 2 (Surgical):** Student fills surgical checklist → Dual approval (Supervisor + Implant Incharge)
- When both Phase 1 & 2 approved → Status: `phase2_approved` (Stage 1 Complete)

### Stage 2: Healing & Prosthetic Phase
- **Second Stage Surgical Protocol:** Student fills healing/exposure checklist → Dual approval
- **Prosthetic Phase Protocol:** Student fills prosthetic checklist → Dual approval  
- When both protocols approved → Status: `completed` (Treatment Complete)

## Status Flow
`pending_phase1` → `phase1_approved` → `pending_phase2` → `phase2_approved` → `pending_stage2_surgical` → `stage2_surgical_approved` → `pending_stage2_prosthetic` → `completed`

## Tech Stack
- **Frontend:** React Native, Expo SDK 54, Expo Router
- **Backend:** FastAPI, Python, Motor (async MongoDB), JWT
- **Database:** MongoDB
- **Deployment:** Emergent Native Deployments (EAS Build)

## Features Implemented
- [x] JWT Authentication with 5 user roles
- [x] Stage 1 workflow (Phase 1 + Phase 2 with dual approval)
- [x] Stage 2 workflow (Surgical + Prosthetic protocols with dual approval)
- [x] Push notifications for all approval steps (Stage 1 & 2)
- [x] Treatment Complete status and banner
- [x] PDF Export with all Stage 1 and Stage 2 data
- [x] Dashboard statistics (includes all statuses)
- [x] Procedure list filtering (pending/completed/rejected)
- [x] Rejection reasons for Stage 2 protocols
- [x] Status labels and colors for all stages

## API Endpoints
- `POST /api/auth/login` - User login
- `GET /api/procedures` - List procedures (with status filter)
- `POST /api/procedures` - Create new procedure
- `GET /api/procedures/{id}` - Get procedure detail
- `POST /api/procedures/{id}/submit-phase2` - Submit Phase 2 surgical checklist
- `POST /api/procedures/{id}/approve` - Approve/reject Phase 1 or Phase 2
- `POST /api/procedures/{id}/stage2/surgical` - Submit Stage 2 Surgical Protocol
- `POST /api/procedures/{id}/stage2/prosthetic` - Submit Stage 2 Prosthetic Protocol
- `POST /api/procedures/{id}/stage2/surgical/approve` - Approve/reject Stage 2 Surgical
- `POST /api/procedures/{id}/stage2/prosthetic/approve` - Approve/reject Stage 2 Prosthetic
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/notifications` - User notifications
- `POST /api/register-push-token` - Register push notification token

## Upcoming Tasks
- [ ] User Management UI for administrator/implant_incharge roles (P1)

## Backlog
- [ ] Data consistency check (Instructor → Supervisor refactor cleanup) (P2)
- [ ] Data cleanup: Remove duplicate users from DB (P2)
- [ ] Refactor server.py monolith into routers/models/services (P2)
- [ ] Refactor new-procedure.tsx into smaller components (P2)
