# Dental Implant Management App - PRD

## Original Problem Statement
Mobile app (Expo) for the Department of Prosthodontics to plan and manage dental implant procedures with phase-based workflow and dual-approval system.

## Architecture
- **Frontend**: Expo (React Native SDK 54), Expo Router, React Context, Axios
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic, JWT, Passlib
- **Database**: MongoDB

## What's Been Implemented
- JWT authentication with 5 roles (RBAC)
- Phase-based dual-approval workflow (Phase 1 + Phase 2)
- Push Notification system (expo-notifications)
- User credential generation for all roles
- Scheduling restrictions, profile photos, PDF export
- N+1 query fix for push notifications

## Deployment Fix (Feb 26, 2026)
**Problem:** `Cannot find module '@expo/config-plugins'` during EAS Android build.

**Root Cause:** Build pipeline injects `plugins/withAndroidNetworkConfig.js` requiring `@expo/config-plugins`, but npm doesn't install the module correctly in the build environment. `node_modules/` directories are excluded from the deployment zip, so shim-in-node_modules approach doesn't work.

**Final Fix - 4 Strategy Fallback:**
1. `app.config.js` - Monkey-patches `Module._resolveFilename` at load time with fallback chain
2. `_expo_config_plugins_shim.js` - Local file with minimal implementations of all config-plugins exports
3. Strategy chain: Normal resolution → project node_modules → expo nested node_modules → process.cwd → local shim file
4. Both files included in deployment zip (not in node_modules)
5. 17/17 expo-doctor checks pass, worst-case simulation verified

## Credentials
- **Implant Incharge**: abhijit.patil@dental.edu / Admin@123
- **Administrator**: ajay.sabane@dental.edu / Admin@123
- **Supervisors**: @dental.edu / Supervisor@123
- **Students**: @student.dental.edu / Student@123
- **Nurses**: @dental.edu / Nurse@123

## Pending/Backlog
- [ ] Frontend Admin UI for user management (P1)
- [ ] Data cleanup - remove duplicate users (P2)
- [ ] Refactor server.py into modular structure
- [ ] Refactor new-procedure.tsx into smaller components
