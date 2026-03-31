# Prosthodontics Dental Implant Mobile App — PRD

## Original Problem Statement
A comprehensive mobile application for managing dental implant procedures at the Department of Prosthodontics, Bharati Vidyapeeth Dental College and Hospital, Pune. Features a 4-phase approval workflow (Pre-Surgical, Surgical, Second Stage Surgical, Prosthetic) with role-based access for Students, Supervisors, and Implant In-Charges.

## Tech Stack
- **Frontend**: React Native (Expo Router) — tested via Expo Go on iOS
- **Backend**: FastAPI + MongoDB (Motor) — monolithic `server.py`
- **Database**: MongoDB with `implant_library` (649 variants, 49 systems) and `procedures` collections

## Core Features Implemented
1. **4-Phase Workflow**: Complete CRUD + approval flow for Phases 1-4
2. **Implant Library**: 49 brand|system combinations, 649 implant variants
3. **Implant-Specific Indications**: 38 systems mapped from Word document
4. **Drilling Protocols**: 14 protocol families (32 systems) with bone-density-specific drill sequences
5. **Risk Assessment**: Automated risk scoring based on bone dimensions
6. **PDF Export**: Both frontend (expo-print) and backend (FPDF2) case report generation
7. **Phase 1 Detail Page**: Shows clinical exam, occlusal analysis, aesthetic risk, medical assessment, implant plans
8. **Top 3 + Show More**: Implant suggestion results show top 3 by default with expandable list
9. **Auto-populate implant_site**: Derived from selected implant plan positions
10. **Authoritative Seed Sync**: Implant library auto-reseeds on deployment if DB is stale

## Key Credentials
- Admin/In-Charge: `Abhijit.patil` / `Admin@123`
- Student: `Gaurav.pandey` / `Student@123`
- Supervisor: `Paresh.gandhi` / `Supervisor@123`

## Key API Endpoints
- `POST /api/auth/login`
- `GET /api/procedures` / `GET /api/procedures/{id}`
- `POST /api/procedures` (creation)
- `POST /api/procedures/{id}/case-report` (PDF generation)
- `POST /api/drilling-protocols/generate`
- `GET /api/drilling-protocols/available`
- `GET /api/implant-library/systems`
- Phase submission endpoints: `/api/procedures/{id}/submit-phase2`, etc.

## Architecture
```
/app
  backend/
    server.py                        # Monolithic (~6200 lines) — ALL endpoints, models, protocol dicts
    implant_library_latest.xlsx      # Authoritative implant data source
  frontend/
    app/
      (tabs)/new-procedure.tsx
      (tabs)/_layout.tsx             # Tab navigation with role-based visibility
      procedures/[id].tsx, submit-phase2/[id].tsx, etc.
    components/
      CaseImplantPlanning.tsx, DrillingProtocol.tsx
    utils/
      pdfGenerator.ts               # Frontend HTML-to-PDF via expo-print
    constants/
      checklist.ts                   # Dropdown options, checklist definitions
```

## Session History

### March 31, 2026 — Session 4 (Fork)
- **EAS Deployment Fix**: Simplified `utils/config.ts` to remove `expo-constants` dependency — EAS deletes `app.config.js` during builds, so the previous approach of reading `Constants.expoConfig?.extra?.backendUrl` was unreliable. Now uses `process.env.EXPO_PUBLIC_BACKEND_URL` directly (inlined by Metro from `eas.json`).
- **Added `backendUrl` to `app.json` extra** as a hardcoded safety net.
- **Implemented authoritative user seed sync**: All 21 users from Login Details.docx now upsert on every startup (emails, passwords, roles synced). Deployed DB will always have correct credentials.
- **Updated login IDs to document format**: Emails now match document exactly (e.g., `Abhijit.patil@dental.edu`). Login is case-insensitive.
- **Updated login placeholder** to guide users: "Login ID (e.g. Name.surname@dental.edu)"
- **Added `/api/health` endpoint**: Emergent deployment health check was hitting this missing route (returning 404), causing the deployment to be torn down.
- **Optimized startup**: Seed no longer re-hashes bcrypt passwords for existing users (saved ~5s of blocking CPU time).
- **Production-grade Auth Upgrade** (20/20 tests passed):
  - Login uses `identifier` field (supports email or username, case-insensitive)
  - Access token (15min) + Refresh token (7 days, stored in MongoDB)
  - `/api/auth/refresh` endpoint for silent token renewal
  - `/api/auth/logout` invalidates refresh token in DB
  - Frontend: expo-secure-store for token storage, axios interceptors for auto-attach + auto-refresh on 401
  - Removed `token` from AuthContext, replaced with interceptor-based approach
  - Migrated `new-procedure.tsx`, `_layout.tsx`, `usePushNotifications.ts` to use centralized `api` module
- **Status**: USER VERIFICATION PENDING — user needs to redeploy and test Expo Go.

### March 30, 2026 — Session 3 (Fork)
- Fixed EAS build failure: incorrect import path `../utils/config` → `../../utils/config` in `new-procedure.tsx`
- Created centralized `utils/config.ts` for URL management
- Cleaned backend requirements.txt (removed 16 unused Google AI packages)
- Added `/api/health/db-status` diagnostic endpoint
- Updated `.gitignore` to stop ignoring `*.env` files

### March 30, 2026 — Session 2 (Fork)
- **Drilling Protocol Audit & Fixes**:
  - Alpha-Bio SPI 6.0mm soft bone: Added missing 4.1mm drill
  - Neodent Helix GM: Removed extra 2.8mm step to match document
  - Ankylos C/X: Tap D1-only, D3/D4 skip Conical Reamer
- **Backend Case-Report PDF Enhanced** with Clinical Examination, Medical Assessment, Phase 2-4 new data
- **Deployment Fix — Stale Data**: Rewrote seed function to do authoritative sync (drops and re-inserts if system count or record count mismatches)
- **Added EXPO_TUNNEL_SUBDOMAIN** to frontend/.env
- **Cleaned up** old duplicate Excel files
- **Testing**: 17/17 backend tests passed (iteration_58)

### March 30, 2026 — Session 1
- Verified implant_library_updated.xlsx matches DB (49 systems, 649 variants)
- Updated IMPLANT_INDICATIONS dictionary (38 systems from Word doc)
- Extracted drilling protocol Word document

### Earlier Sessions
- Full 4-phase workflow implementation (Phases 1-4)
- Security/UX features, calendar picker, scrollable dropdowns
- EAS build fixes, Expo project linking

## Backlog (Prioritized)
### P1
- Ensure all entered data visible to Supervisor/In-Charge before approval, student after approval
- Add indications/protocols for remaining 17 systems (when user provides data)

### P2
- Backend refactoring: Decompose server.py into modular routers, models, services
- Frontend refactoring: Modularize CaseImplantPlanning.tsx and [id].tsx
- Data cleanup: Remove duplicate user entries
