# Dental Implant Management App - PRD

## Original Problem Statement
Build a mobile app using Expo for the Department of Prosthodontics to plan and manage dental implant procedures with multi-phase approval workflows.

## User Roles & Access Control
- **PG Student**: Creates procedures, submits checklists for each phase
- **Supervisor**: Approves/rejects each phase (assigned per procedure)
- **Implant Incharge**: Approves/rejects each phase (assigned per procedure)
- **Administrator**: Full access, user management
- **Nurse**: Read-only access to approved/completed procedures

## Core Workflow (4-Phase)
1. **Phase 1 (Pre-surgical Protocol)**: Student creates procedure -> Dual approval (Supervisor + Implant Incharge)
2. **Phase 2 (Surgical Protocol)**: Student submits surgical checklist -> Dual approval
3. **Phase 3 (Second Stage Surgical Protocol)**: Student submits healing/exposure checklist -> Dual approval
4. **Phase 4 (Prosthetic Protocol)**: Student submits prosthetic checklist -> Dual approval -> Treatment Complete

## Tech Stack
- **Frontend**: React Native, Expo SDK 54, Expo Router
- **Backend**: FastAPI, Python, Motor (async MongoDB), JWT auth
- **Database**: MongoDB
- **Deployment**: Emergent Native Deployments (EAS Build)

## Architecture
```
/app
├── backend/
│   ├── server.py          # Monolithic FastAPI (all endpoints)
│   ├── setup_users.py     # Seeds user data
│   └── tests/             # Pytest test files
├── frontend/
│   ├── app/               # Expo Router pages
│   │   ├── (tabs)/        # Dashboard, Procedures, Notifications, User Management, Profile tabs
│   │   └── procedures/    # Procedure detail, submit forms
│   ├── components/        # Shared components (ChecklistForm, BackToDashboard)
│   ├── constants/         # checklist.ts (statuses, labels, checklist items, roles)
│   ├── contexts/          # AuthContext
│   └── utils/             # api.ts, pdfGenerator.ts
```

## Key API Endpoints
- `POST /api/auth/login` - JWT login
- `POST /api/procedures` - Create procedure (student only)
- `POST /api/procedures/{id}/approve` - Phase 1/2 approval
- `POST /api/procedures/{id}/submit-phase2` - Submit Phase 2 checklist
- `POST /api/procedures/{id}/stage2/surgical` - Submit Phase 3 checklist
- `POST /api/procedures/{id}/stage2/surgical/approve` - Phase 3 approval
- `POST /api/procedures/{id}/stage2/prosthetic` - Submit Phase 4 checklist
- `POST /api/procedures/{id}/stage2/prosthetic/approve` - Phase 4 approval
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/notifications` - User notifications
- `GET /api/users` - List users (all authenticated)
- `POST /api/users` - Create user (admin/implant_incharge only)
- `DELETE /api/users/{id}` - Delete user (admin/implant_incharge only)

## Completed Features
- [x] JWT authentication with 5 roles
- [x] Procedure creation with scheduling restrictions
- [x] Phase 1-4 dual approval workflow
- [x] Push notifications via Expo
- [x] Patient search on dashboard
- [x] User avatar with initials fallback
- [x] Visual treatment timeline on procedure detail
- [x] PDF export of complete procedure
- [x] Phase 3/4 rename (from "Stage 2") - All labels updated
- [x] Interactive dashboard stat tiles (navigate to filtered procedures)
- [x] Status badge position fix (proper SafeAreaView padding)
- [x] User Management tab (admin/implant_incharge: list, create, delete users)

## Credentials
- Student: gaurav.pandey@student.dental.edu / Student@123
- Supervisor: vasantha.n@dental.edu / Supervisor@123
- Implant Incharge: abhijit.patil@dental.edu / Admin@123
- Administrator: ajay.sabane@dental.edu / Admin@123
- Nurse: priya.sharma@dental.edu / Nurse@123

## Backlog / Future
- [ ] P2: Data cleanup (remove duplicate users from earlier runs)
- [ ] Break down backend/server.py monolith into routers/models/services
- [ ] Modularize frontend/app/new-procedure.tsx form logic

## Important Notes
- Internal status codes use `stage2_surgical`/`stage2_prosthetic` for DB stability
- All user-facing labels use "Phase 3" and "Phase 4" terminology
- Do NOT modify `app.config.js` (deployment monkey-patching)
