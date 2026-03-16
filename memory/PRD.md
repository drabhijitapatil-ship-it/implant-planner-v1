# Prosthodontics Case Management App - PRD

## Original Problem Statement
Overhauling the "New Case" workflow for a prosthodontics mobile application. Initially a "Clinical Case Album Generator" request, expanded to a complete redesign of case creation and management.

## Core Requirements
1. **New Case Form:** Redesigned form with conditional logic for prosthetic plans based on procedure type
2. **Phase-Based Workflow:** Cases progress through 4 phases (Pre-Surgical, Surgical, Second Stage, Prosthetic)
3. **Implant Selection Integration:** Integrated into Phase 1 workflow AND as Step 2 in the New Case wizard, plus standalone tab
4. **Checklist File Uploads:** Specific checklist items require file upload
5. **Case Completion Engine:** Generates completion badge and PDF case report
6. **Clinical Photo Album:** Upload and manage 26 clinical photos across 4 phases, generate PDF album

## Tech Stack
- **Frontend:** React Native, Expo, Expo Router, Axios
- **Backend:** FastAPI, Motor (async MongoDB), fpdf2
- **Database:** MongoDB

## Architecture
```
/app
├── backend/
│   ├── server.py             # Monolithic FastAPI app
│   ├── uploads/case_photos/
│   └── uploads/checklist_files/
├── frontend/
│   ├── app/(tabs)/           # Tab-based navigation (New Case, Implant Selection, etc.)
│   ├── app/procedures/       # Procedure detail + phase forms
│   ├── components/           # CaseImplantPlanning, CasePhotoAlbum, ChecklistForm, etc.
│   ├── constants/checklist.ts # Checklist definitions
│   ├── contexts/AuthContext.tsx
│   └── utils/api.ts
```

## What's Implemented (Complete)
- Clinical Case Album Generator (backend PDF + frontend UI)
- New Case Form with 2-step wizard (Step 1: Case Details + Checklist, Step 2: Implant Selection with all 45 systems)
- Phase 2-4 submission forms with torque values and clinical remarks
- Case Completion Engine (badge + PDF report)
- Checklist File Uploads
- Implant Planning component integrated into New Case workflow AND as standalone on detail page + standalone tab
- Phase 1 banner on procedure detail page for pending_phase1 procedures
- Faculty/Incharge dropdowns working (auth-dependent loading)

## Bug Fixes & Changes
### March 15, 2026
1. Faculty/Incharge Dropdowns (P0): Fixed race condition - useEffect depends on `user`
2. CBCT Upload Removed (P0): Removed hasUpload from "Radiographic Investigations"
3. Implant Planning Phase 1 Integration (P1): Conditional rendering with Phase 1 banner

### March 16, 2026
4. 2-Step New Case Wizard: Step 1 = Case details + Phase 1 checklist, Step 2 = Implant Selection
5. Loading Type Styling Fix: Chips contained in bordered container (borderStyle: solid)
6. Standalone Implant Selection Preserved: Always visible on detail page + standalone tab
7. **All 45 Implant Systems in Dropdown**: Changed `Promise.all` to `Promise.allSettled` in CaseImplantPlanning.loadData() so systems load even if implant-plan fetch fails for new procedures

## Implant Library Stats
- 45 unique brand-system combinations
- 485 total implant records (sizes)
- 15 brands: Alpha Bio, B&B Dental, BioHorizons, Blue Sky Bio, Bredent, Conelog, Cowellmedi, Dentium, Dentsply Sirona, MIS, Megagen, NeoBiotech, Neodent, Noble Biocare, Osstem, Straumann, Zimmer Biomet

## Test Credentials
- **Admin/Implant Incharge:** abhijit.patil@dental.edu / Admin@123
- **Student:** gaurav.pandey@student.dental.edu / Student@123

## Backlog (Prioritized)
- **P2:** Notification system for phase approvals/status changes
- **P2:** Backend refactoring (decompose monolithic server.py into routers/models/services)
- **P2:** Frontend refactoring (modularize complex components with custom hooks)
- **P2:** Data cleanup (remove duplicate user entries)
