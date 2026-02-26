# Dental Implant Management App - PRD

## Original Problem Statement
Mobile app (Expo) for the Department of Prosthodontics to plan and manage dental implant procedures with phase-based workflow and dual-approval system.

## User Roles
1. **Postgraduate (PG) Student** - Create procedures, fill checklists, view own procedures
2. **Supervisor** (formerly Instructor) - View/edit/approve assigned procedures
3. **Implant Incharge** - View/edit/approve all procedures, manage users
4. **Administrator** - Full access, manage users
5. **Nurse** - Read-only access to approved/completed procedures

## Core Workflow
- Student creates procedure → Dual approval (Supervisor + Implant Incharge) for Phase 1
- Phase 1 approved → Student submits Phase 2 (Surgical checklist)
- Phase 2 submitted → Dual approval again → "Stage 1 Implant Placement Done Successfully"
- If same person is both Supervisor AND Implant Incharge → single approval counts for both

## Architecture
- **Frontend**: Expo (React Native), Expo Router, React Context, Axios
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic, JWT, Passlib
- **Database**: MongoDB

## What's Been Implemented (as of Feb 26, 2026)
- [x] JWT authentication with 5 roles (RBAC)
- [x] Phase-based dual-approval workflow (Phase 1 + Phase 2)
- [x] Auto-approve when same person is both supervisor AND incharge
- [x] User management (create/delete users) for Administrator and Implant Incharge
- [x] Scheduling restrictions: No Sundays, Saturday 9:30 AM only, 24hr student restriction
- [x] "Instructor" → "Supervisor" rename (code + DB migration)
- [x] Profile photo upload
- [x] Red field highlighting for missing required fields
- [x] Calendar date-picker + fixed time slots
- [x] Modal-based dropdowns for Supervisor/Incharge selection
- [x] BackToDashboard button (bottom-left on all screens)
- [x] Green Phase 2 button after Phase 1 approval
- [x] Red Export PDF button at bottom for completed procedures
- [x] Assignment-based approval logic (not role-based)
- [x] Nurse read-only access
- [x] Notification system

## Credentials
- **Implant Incharge**: abhijit.patil@dental.edu / Admin@123
- **Administrator**: ajay.sabane@dental.edu / dental123
- **Student**: gaurav.pandey@student.dental.edu / Student@123
- **Nurse**: nurse1@dental.edu / Nurse@123

## Pending/Backlog
- [ ] Frontend Admin UI for user management
- [ ] Refactor server.py into modular structure
- [ ] Refactor new-procedure.tsx into smaller components
- [ ] Clean up duplicate student entries in DB
- [ ] PDF export visual testing

## User Credentials & Push Notifications (Feb 26, 2026)
- Registered all user roles with standardized credentials:
  - Implant Incharge: abhijit.patil@dental.edu / Admin@123
  - Administrator: ajay.sabane@dental.edu / Admin@123
  - Supervisors (4): Supervisor@123 (rajeshree.jadhav, vasantha.n, rupali.patil, pankaj.kadam @dental.edu)
  - Students (12): Student@123 (gaurav.pandey, anand.kurum, manasi.dhiren, etc. @student.dental.edu)
  - Nurses (2): Nurse@123 (priya.sharma, anjali.desai @dental.edu)
- Cleaned up duplicate user entries from previous script runs
- Added Expo Push Notifications:
  - Backend: push token registration endpoint, async push delivery via Expo API
  - Frontend: usePushNotifications hook, automatic token registration on login
  - Triggers: New procedure creation, Phase 2 submission, approval/rejection events
- All 12 backend tests passed (100%)

## Deployment Fix (Feb 26, 2026)
- **Root Cause:** Emergent EAS builder image (2025101601) runs `eas update` without `--environment` flag, which SDK 55 requires
- **Fix:** Downgraded Expo SDK from 55 to 54 (54.0.33) where `--environment` is not required
- expo-updates downgraded from ^55.0.11 to ~29.0.16 (SDK 54 compatible)
- Removed SDK 55 features: `newArchEnabled`, `edgeToEdgeEnabled`
- Fixed app.json schema: backgroundColor hex codes (#000 -> #000000)
- Fixed icon images to be exactly 512x512 (were 512x513)
- Removed conflicting package-lock.json (only yarn.lock needed)
- Created `eas.json` with production/preview build profiles
- All 17/17 expo-doctor checks pass
- **Deployment agent verified PASS ✅** — No blockers
