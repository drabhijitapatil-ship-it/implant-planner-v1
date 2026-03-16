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
- Frontend: React Native, Expo, Expo Router, Axios
- Backend: FastAPI, Motor (async MongoDB), fpdf2
- Database: MongoDB

## What's Implemented (Complete)
- Clinical Case Album Generator (backend PDF + frontend UI)
- New Case Form with 2-step wizard (Step 1: Case Details + Checklist, Step 2: Implant Selection with all 45 systems)
- Phase 2-4 submission forms with torque values and clinical remarks
- Case Completion Engine (badge + PDF report)
- Checklist File Uploads
- Implant Planning: integrated into New Case workflow + standalone on detail page + standalone tab
- Faculty/Incharge dropdowns working (auth-dependent loading)

## Bug Fixes & Changes
### March 15, 2026
1. Faculty/Incharge Dropdowns (P0): Fixed race condition - useEffect depends on `user`
2. CBCT Upload Removed (P0): Removed hasUpload from "Radiographic Investigations"
3. Implant Planning Phase 1 Integration (P1): Conditional rendering with Phase 1 banner

### March 16, 2026
4. 2-Step New Case Wizard: Step 1 = Case details + Phase 1 checklist, Step 2 = Implant Selection
5. Loading Type Styling Fix: Chips contained in bordered container (borderWidth: 1.5, borderColor: #C5CDD5, bg: #F4F6F8, white chip backgrounds for contrast)
6. Standalone Implant Selection Preserved: Always visible on detail page + standalone tab
7. All 45 Implant Systems in Dropdown: Changed Promise.all to Promise.allSettled
8. Dental Chart Positioning: Fixed modal paddingTop: 130 for proper vertical centering (RN Web padding shorthand override workaround)

## RN Web Gotchas Documented
- padding shorthand overrides paddingTop in atomic CSS — use paddingHorizontal/paddingBottom/paddingTop separately
- justifyContent: 'center' in StyleSheet.create gets dropped in Modal contexts
- flex: 1 on conditional Views doesn't work — use fixed dimensions/padding instead

## Test Credentials
- Admin: abhijit.patil@dental.edu / Admin@123
- Student: gaurav.pandey@student.dental.edu / Student@123

## Backlog (Prioritized)
- P2: Notification system for phase approvals/status changes
- P2: Backend refactoring (decompose monolithic server.py)
- P2: Frontend refactoring (modularize complex components)
- P2: Data cleanup (remove duplicate user entries)
