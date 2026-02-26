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
- Student creates procedure -> Dual approval (Supervisor + Implant Incharge) for Phase 1
- Phase 1 approved -> Student submits Phase 2 (Surgical checklist)
- Phase 2 submitted -> Dual approval again -> "Stage 1 Implant Placement Done Successfully"
- If same person is both Supervisor AND Implant Incharge -> single approval counts for both

## Architecture
- **Frontend**: Expo (React Native SDK 54), Expo Router, React Context, Axios
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic, JWT, Passlib
- **Database**: MongoDB

## What's Been Implemented
- [x] JWT authentication with 5 roles (RBAC)
- [x] Phase-based dual-approval workflow (Phase 1 + Phase 2)
- [x] Auto-approve when same person is both supervisor AND incharge
- [x] User management (create/delete users) for Administrator and Implant Incharge
- [x] Scheduling restrictions: No Sundays, Saturday 9:30 AM only, 24hr student restriction
- [x] "Instructor" -> "Supervisor" rename (code + DB migration)
- [x] Profile photo upload
- [x] Red field highlighting for missing required fields
- [x] Calendar date-picker + fixed time slots
- [x] Modal-based dropdowns for Supervisor/Incharge selection
- [x] BackToDashboard button (bottom-left on all screens)
- [x] Green Phase 2 button after Phase 1 approval
- [x] Red Export PDF button at bottom for completed procedures
- [x] Assignment-based approval logic (not role-based)
- [x] Nurse read-only access
- [x] Push Notification system (expo-notifications)
- [x] User credential generation for all roles

## Deployment Fix (Feb 26, 2026)
- **Root Cause:** Build pipeline's `npm install` doesn't hoist `@expo/config-plugins` to top-level `node_modules/`. Pipeline injects `plugins/withAndroidNetworkConfig.js` that requires it.
- **Fix Applied:**
  1. Created resolution shim at `plugins/node_modules/@expo/config-plugins/` with 3-strategy fallback
  2. Removed `@expo/config-plugins` from direct dependencies (expo-doctor recommendation)
  3. Deleted stale `package-lock.json`, added to `.gitignore`
  4. Added `.npmrc` with `legacy-peer-deps=true`
  5. Pre-created `plugins/withAndroidNetworkConfig.js`
  6. Added `postinstall` script for safety
- **Result:** 17/17 expo-doctor checks pass, deployment health check PASS

## Credentials
- **Implant Incharge**: abhijit.patil@dental.edu / Admin@123
- **Administrator**: ajay.sabane@dental.edu / Admin@123
- **Supervisors**: rajeshree.jadhav, vasantha.n, rupali.patil, pankaj.kadam @dental.edu / Supervisor@123
- **Students**: gaurav.pandey, anand.kurum, etc. @student.dental.edu / Student@123
- **Nurses**: priya.sharma, anjali.desai @dental.edu / Nurse@123

## Pending/Backlog
- [ ] Frontend Admin UI for user management
- [ ] Refactor server.py into modular structure
- [ ] Refactor new-procedure.tsx into smaller components
- [ ] Clean up duplicate student entries in DB
- [ ] PDF export visual testing
