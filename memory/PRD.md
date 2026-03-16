# Prosthodontics Case Management App - PRD

## Original Problem Statement
Overhauling the "New Case" workflow for a prosthodontics mobile application. Initially a "Clinical Case Album Generator" request, expanded to a complete redesign of case creation and management.

## Core Requirements
1. **New Case Form:** Redesigned form with conditional logic for prosthetic plans based on procedure type
2. **Phase-Based Workflow:** Cases progress through 4 phases (Pre-Surgical, Surgical, Second Stage, Prosthetic)
3. **Implant Selection Integration:** Integrated into Phase 1 workflow AND as Step 2 in the New Case wizard
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
- New Case Form with 2-step wizard (Step 1: Case Details + Checklist, Step 2: Implant Selection)
- Phase 2-4 submission forms with torque values and clinical remarks
- Case Completion Engine (badge + PDF report)
- Checklist File Uploads
- Implant Planning component integrated into New Case workflow AND as standalone on detail page
- Phase 1 banner on procedure detail page for pending_phase1 procedures
- Standalone Implant Selection tab in bottom navigation

## Bug Fixes & Changes (March 16, 2026)
1. **Faculty/Incharge Dropdowns (P0):** Fixed race condition - useEffect depends on `user` from AuthContext
2. **CBCT Upload Removed (P0):** Removed hasUpload from "Radiographic Investigations" in checklist.ts
3. **Implant Planning Phase 1 Integration (P1):** CaseImplantPlanning shows with Phase 1 banner during pending_phase1; shown as standalone for other phases
4. **2-Step New Case Wizard:** Step 1 = Case details + Phase 1 checklist, Step 2 = Implant Selection (after procedure creation). Submit button reads "Submit & Continue to Implant Selection"
5. **Loading Type Styling Fix:** Immediate/Delayed Loading chips properly contained in bordered container (borderStyle: solid added for React Native Web)
6. **Standalone Implant Selection Preserved:** Implant Selection tab remains accessible alongside new workflow integration

## Test Credentials
- **Admin/Implant Incharge:** abhijit.patil@dental.edu / Admin@123
- **Student:** gaurav.pandey@student.dental.edu / Student@123
- **Supervisors:** vasantha.n@dental.edu, rajeshree.jadhav@dental.edu

## Backlog (Prioritized)
- **P2:** Notification system for phase approvals/status changes
- **P2:** Backend refactoring (decompose monolithic server.py into routers/models/services)
- **P2:** Frontend refactoring (modularize complex components with custom hooks)
- **P2:** Data cleanup (remove duplicate user entries)
