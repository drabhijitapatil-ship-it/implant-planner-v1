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
- `POST /api/procedures/{id}/upload-cbct` - Upload CBCT file (student only, owner only)
- `GET /api/uploads/{filename}` - Download CBCT file (authorized users only)
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/notifications` - User notifications
- `GET /api/users` - List users (all authenticated)
- `POST /api/users` - Create user (admin/implant_incharge only)
- `PUT /api/users/{id}` - Update user name/role/password (admin/implant_incharge only)
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
- [x] User Management tab (admin/implant_incharge: list, create, edit, delete users)
- [x] Edit user functionality (change name, role, reset password)

- [x] CBCT file upload on new procedure form (PDF, PNG, JPEG, HEIF up to 25MB)
- [x] CBCT file visible to supervisor/implant_incharge on procedure detail page
- [x] Login page updated with college name

- [x] Implant Selection module with complete multi-step workflow
- [x] Step 1: FDI dental chart (28 teeth) with tooth-wise recommendation (diameter + length ranges)
- [x] Step 2: Implant system dropdown with search (42 systems from XLSX)
- [x] Step 3: Bone width/height input with algorithm-based filtering
- [x] Step 4: Results display with recommended implant, clinical guidance, safety notes, all sizes
- [x] Backend: /api/implant-library/systems, /tooth-recommendations, /suggest endpoints
- [x] Suggestion engine: Bone width algorithm (<5->3.0-3.5, 5-6->3.75-4.0, 6-7->4.0-4.5, >=7->4.5-6.0), Bone height (>=13->Long, >=10->Standard, >=8->Short), 2mm safety clearance
- [x] Tooth-specific range intersection for diameter and length
- [x] Copy recommendation to clipboard, New Selection reset
- [x] Implant library: 42 systems, 438 records from implant_library_latest.xlsx
- [x] Auto-seed on startup: Users (20 accounts) and Implant Library (438 records) seeded when production DB is empty
- [x] Tab navigation: Admin/Incharge see Users tab, Nurses hidden from New Case/Implants
- [x] Implant system-specific indications: 17 systems with clinical indications (bone type, immediate placement, etc.)
- [x] Auto-restrict NobelActive NP to teeth 41,42,31,32,12,22 and Osstem MS to teeth 31,32,33,41,42,43
- [x] Indications displayed in dropdown, selected system area, and results screen

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

## Key API Endpoints — Implant Library
- `GET /api/implant-library/systems` - Returns 42 implant systems grouped by brand+system with diameters, lengths, count
- `GET /api/implant-library/tooth-recommendations` - Returns 28 FDI tooth entries with region, diameter range, length range
- `GET /api/implant-library/tooth-recommendations/{tooth}` - Returns single tooth recommendation
- `GET /api/implant-library/suggest?brand=X&system=Y&bone_width=Z&bone_height=W&tooth=T` - Runs suggestion engine with bone algorithms + tooth intersection

## Important Notes
- Internal status codes use `stage2_surgical`/`stage2_prosthetic` for DB stability
- All user-facing labels use "Phase 3" and "Phase 4" terminology
- Do NOT modify `app.config.js` (deployment monkey-patching)
- XLSX brand name "Noble Biocare" in data has extra 'l' vs user spec "Nobel Biocare"
