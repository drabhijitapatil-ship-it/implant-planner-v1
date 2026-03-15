# Prosthodontics Case Management App - PRD

## Original Problem Statement
Overhauling the "New Case" workflow for a prosthodontics mobile application. Initially a "Clinical Case Album Generator" request, expanded to a complete redesign of case creation and management.

## Core Requirements
1. **New Case Form:** Redesigned form with conditional logic for prosthetic plans based on procedure type
2. **Phase-Based Workflow:** Cases progress through 4 phases (Pre-Surgical, Surgical, Second Stage, Prosthetic)
3. **Implant Selection Integration:** Integrated into Phase 1 workflow
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
│   ├── app/(tabs)/           # Tab-based navigation
│   ├── app/procedures/       # Procedure detail + phase forms
│   ├── components/           # Reusable components
│   ├── constants/checklist.ts # Checklist definitions
│   ├── contexts/AuthContext.tsx
│   └── utils/api.ts
```

## What's Implemented (Complete)
- Clinical Case Album Generator (backend PDF + frontend UI)
- New Case Form with conditional prosthetic plan logic
- Phase 2-4 submission forms with torque values and clinical remarks
- Case Completion Engine (badge + PDF report)
- Checklist File Uploads
- Implant Planning component (CaseImplantPlanning.tsx)
- Treatment timeline/progress tracker on detail page

## Bug Fixes Applied (March 15, 2026)
1. **Faculty/Incharge Dropdowns (P0):** Fixed race condition where `/api/users` was called before auth token was available. Changed useEffect to depend on `user` from AuthContext.
2. **CBCT Upload Removed (P0):** Removed `hasUpload: true` from "Radiographic Investigations" in checklist.ts
3. **Implant Planning Phase 1 Integration (P1):** CaseImplantPlanning now shown prominently with Phase 1 banner during `pending_phase1` status; shown read-only in later phases

## Test Credentials
- **Admin/Implant Incharge:** abhijit.patil@dental.edu / Admin@123
- **Student:** gaurav.pandey@student.dental.edu / Student@123
- **Supervisors:** vasantha.n@dental.edu, rajeshree.jadhav@dental.edu

## Backlog (Prioritized)
- **P2:** Notification system for phase approvals/status changes
- **P2:** Backend refactoring (decompose monolithic server.py into routers/models/services)
- **P2:** Frontend refactoring (modularize complex components with custom hooks)
- **P2:** Data cleanup (remove duplicate user entries)
