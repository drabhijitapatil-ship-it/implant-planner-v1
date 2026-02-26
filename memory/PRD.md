# Dental Implant Management App - PRD

## Original Problem Statement
Mobile app (Expo) for the Department of Prosthodontics to plan and manage dental implant procedures with phase-based workflow and dual-approval system.

## User Roles
1. **Postgraduate (PG) Student** - Create procedures, fill checklists, view own procedures
2. **Supervisor** - View/edit/approve assigned procedures
3. **Implant Incharge** - View/edit/approve all procedures, manage users
4. **Administrator** - Full access, manage users
5. **Nurse** - Read-only access to approved/completed procedures

## Architecture
- **Frontend**: Expo (React Native SDK 54), Expo Router, React Context, Axios
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic, JWT, Passlib
- **Database**: MongoDB

## What's Been Implemented
- [x] JWT authentication with 5 roles (RBAC)
- [x] Phase-based dual-approval workflow (Phase 1 + Phase 2)
- [x] Auto-approve when same person is both supervisor AND incharge
- [x] Scheduling restrictions, calendar, time slots
- [x] Profile photo upload
- [x] Push Notification system (expo-notifications)
- [x] User credential generation for all roles
- [x] N+1 query fix for push notifications (batch query with $in)

## Deployment Fix History (Feb 26, 2026)
**Problem:** `Cannot find module '@expo/config-plugins'` during EAS Android build.

**Root Cause:** The EAS build pipeline:
1. Removes all lock files and runs fresh `npm install`
2. Injects `plugins/withAndroidNetworkConfig.js` requiring `@expo/config-plugins`
3. But npm doesn't hoist `@expo/config-plugins` to top-level `node_modules/`
4. `plugins/node_modules/` shims are excluded from the deployment zip

**Final Fix (app.config.js monkey-patch):**
- Created `app.config.js` that patches `Module._resolveFilename` at load time
- When `@expo/config-plugins` can't be found normally, it tries fallback paths including `expo/node_modules/@expo/config-plugins`
- This runs BEFORE plugin files are loaded, making the module always resolvable
- File IS included in the deployment zip (not in node_modules)
- 17/17 expo-doctor checks pass

## Credentials
- **Implant Incharge**: abhijit.patil@dental.edu / Admin@123
- **Administrator**: ajay.sabane@dental.edu / Admin@123
- **Supervisors**: rajeshree.jadhav, vasantha.n, rupali.patil, pankaj.kadam @dental.edu / Supervisor@123
- **Students**: gaurav.pandey, anand.kurum, etc. @student.dental.edu / Student@123
- **Nurses**: priya.sharma, anjali.desai @dental.edu / Nurse@123

## Pending/Backlog
- [ ] Frontend Admin UI for user management (P1)
- [ ] Data cleanup - remove duplicate users (P2)
- [ ] Refactor server.py into modular structure
- [ ] Refactor new-procedure.tsx into smaller components
