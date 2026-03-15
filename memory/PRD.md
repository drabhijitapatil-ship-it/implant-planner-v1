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
- [x] Two-tab Implant Selection: "Let Me Choose" (manual) + "Suggest Me" (auto-suggestion)
- [x] "Suggest Me" tab: Select Tooth → Procedure Type (multi-select, 6 options) → Bone Type (D1-D4) → Bone Measurements → Auto-suggest from all systems
- [x] Procedure-bone type compatibility validation (Indication Dictionary): Immediate(D1-D3), Sinus Lift(D3-D4), etc.
- [x] Backend: POST /api/implant-library/suggest-auto, GET /api/implant-library/procedure-options
- [x] Implant Risk Calculator in "Let Me Choose" results: 5-factor scoring (Width, Height, Density, Procedure, Tooth Position), total 5-15, Low/Moderate/High with color-coded visual meter and suggested actions
- [x] Implant Risk Calculator also in "Suggest Me" results: auto-populates bone type from input, procedure selector if multiple chosen
- [x] Backend: POST /api/implant-library/calculate-risk endpoint

## Credentials
- Student: gaurav.pandey@student.dental.edu / Student@123
- Supervisor: vasantha.n@dental.edu / Supervisor@123
- Implant Incharge: abhijit.patil@dental.edu / Admin@123
- Administrator: ajay.sabane@dental.edu / Admin@123
- Nurse: priya.sharma@dental.edu / Nurse@123

## Backlog / Future
- [ ] P1: Add more drilling protocol data for other implant systems (awaiting user data)
- [ ] P2: Data cleanup (remove duplicate users from earlier runs)
- [ ] P2: Break down backend/server.py monolith into routers/models/services
- [ ] P2: Modularize frontend/app/new-procedure.tsx form logic

## Completed Features — Clinical Case Album Generator (March 2026)
- [x] Backend: PHOTO_STEPS data structure with 44 photo steps across 4 phases (14+12+7+11)
- [x] Backend: ALBUM_CAPTIONS dictionary for figure captions in PDF generation
- [x] Backend: POST /api/procedures/{id}/photos/{step_id} - Upload photo with validation (student only, file type/size checks)
- [x] Backend: DELETE /api/procedures/{id}/photos/{step_id}/{filename} - Delete photo (removes DB record + file)
- [x] Backend: GET /api/procedures/{id}/photos - List all photos grouped by step with progress info
- [x] Backend: GET /api/photo-steps - Returns all photo step definitions
- [x] Backend: GET /api/photo-steps/{phase} - Returns phase-specific steps
- [x] Backend: GET /api/photos/{filename} - Serve uploaded photo files
- [x] Backend: POST /api/procedures/{id}/generate-album - Generate PDF album (fixed UnicodeEncode + missing import bugs)
- [x] Frontend: CasePhotoAlbum component (components/CasePhotoAlbum.tsx) with:
  - 4 collapsible phase sections with color-coded indicators
  - Per-phase progress bars and photo counts
  - Per-step expandable cards with purpose/armamentarium/capture instructions
  - Photo thumbnails with horizontal scroll preview
  - Upload button (student owners only) using expo-image-picker
  - Delete photo capability (student owners only)
  - Generate Case Album PDF button with blob download
- [x] Frontend: CasePhotoAlbum integrated into procedure detail page (app/procedures/[id].tsx)
- [x] Permission checks: Students can upload/delete own photos; non-students read-only
- [x] Tested: 20/20 backend tests passed, frontend UI fully verified (iteration 20)

## Completed Features — Drilling Protocol (March 2026)
- [x] Backend: Drilling protocol data for BioHorizons Tapered Pro Conical RBT and Tapered Short RBT
- [x] Backend: POST /api/drilling-protocols/generate — generates step-by-step drill sequence for implant + bone density
- [x] Backend: POST /api/drilling-protocols/export-pdf — generates downloadable PDF of drilling protocol
- [x] Backend: GET /api/drilling-protocols/available — returns list of systems with protocols
- [x] Frontend: Top 5 results display with "Show More" button in both "Let Me Choose" and "Suggest Me" tabs
- [x] Frontend: Selectable implant cards with radio-button UI in both result workflows
- [x] Frontend: "Best" badge on top-ranked implant
- [x] Frontend: "Give Drilling Protocol" button appears after implant selection
- [x] Frontend: Full Drilling Protocol screen (DrillingProtocol.tsx) with bone density selector, step-by-step timeline, navigation, quick reference, and Export PDF
- [x] End-to-end tested: Login → Implant tab → Search → Select → Protocol → PDF Export (100% pass rate)
- [x] Bug fix: "Let Me Choose" now shows all available sizes when no exact matches (e.g., BioHorizons Tapered Short) with info note, enabling drilling protocol access
- [x] Updated implant library: 438→485 records, 42→45 systems. Added BioHorizons Tapered Pro Conical RBT (25 sizes), BioHorizons Tapered Short Conical RBT (3 sizes), Conelog Progressive Line (17 sizes)
- [x] Drilling protocol aliases: Conical RBT systems share protocols with their non-RBT counterparts
- [x] IMPLANT_INDICATIONS added for all 3 new systems
- [x] Conelog Progressive Line drilling protocol: Full implementation with bone-density-dependent algorithm (D1/D2 standard with dense bone drill, D3/D4 soft bone with under-preparation), 4 diameters (3.3/3.8/4.3/5.0), 5 lengths (7/9/11/13/16), progressive twist drill sequence, profile drills, PDF export
- [x] Neodent Grand Morse drilling protocols: 6 systems (Helix GM Acqua/Neoporous, Drive GM Acqua/NeoPorous, Titamax GM Acqua/NeoPorous) with 3 distinct engines: Helix (progressive under-osteotomy, D1/D2 adds contour drill, D4 skips final), Drive (soft bone optimized, D1/D2 adds final drill), Titamax (dense bone, combination drills). Surface type doesn't affect protocol. RPM: D1/D2=800-1200, D3/D4=500-800, Placement=30. Torque: 60 Ncm.
- [x] Dropdown UI fix: Replaced ScrollView with FlatList for reliable rendering of all 45 systems on mobile; increased modal height to 80%

## Key API Endpoints — Implant Library
- `GET /api/implant-library/systems` - Returns 42 implant systems with indications and restricted_teeth
- `GET /api/implant-library/tooth-recommendations` - Returns 28 FDI tooth entries with region, diameter range, length range
- `GET /api/implant-library/tooth-recommendations/{tooth}` - Returns single tooth recommendation
- `GET /api/implant-library/suggest?brand=X&system=Y&bone_width=Z&bone_height=W&tooth=T` - "Let Me Choose" engine with tooth intersection
- `POST /api/implant-library/suggest-auto` - "Suggest Me" engine: validates procedure+bone type, filters all systems by diameter/length
- `GET /api/implant-library/procedure-options` - Returns 6 procedures, 4 bone types, compatibility dict
- `POST /api/implant-library/calculate-risk` - Risk Calculator: 5-factor scoring (Width, Height, Density, Procedure, Tooth) → Low/Moderate/High

## Important Notes
- Internal status codes use `stage2_surgical`/`stage2_prosthetic` for DB stability
- All user-facing labels use "Phase 3" and "Phase 4" terminology
- Do NOT modify `app.config.js` (deployment monkey-patching)
- XLSX brand name "Noble Biocare" in data has extra 'l' vs user spec "Nobel Biocare"

## Key API Endpoints — Clinical Photo Album
- `GET /api/photo-steps` - Returns all 44 photo step definitions across 4 phases
- `GET /api/photo-steps/{phase}` - Returns phase-specific steps (1-4)
- `POST /api/procedures/{id}/photos/{step_id}` - Upload photo (student only)
- `DELETE /api/procedures/{id}/photos/{step_id}/{filename}` - Delete photo (student only)
- `GET /api/procedures/{id}/photos` - List all photos grouped by step with progress
- `GET /api/photos/{filename}` - Serve uploaded photo file
- `POST /api/procedures/{id}/generate-album` - Generate PDF album with all photos
