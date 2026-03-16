# Prosthodontics Case Management App - PRD

## Original Problem Statement
Overhauling the "New Case" workflow for a prosthodontics mobile application. Multi-phase case management with implant planning, checklists, and clinical documentation.

## Core Requirements
1. **New Case Form:** 2-step wizard (Case Details + Implant Selection) with conditional prosthetic plans
2. **Phase-Based Workflow:** 4 phases (Pre-Surgical, Surgical, Second Stage, Prosthetic)
3. **Implant Selection:** Integrated into Phase 1, New Case wizard Step 2, and standalone tab
4. **Drilling Protocol:** System-specific drilling sequence generated after implant system selection
5. **Checklist File Uploads:** Specific items require file upload
6. **Case Completion Engine:** Badge + PDF report
7. **Clinical Photo Album:** 26 photos across 4 phases + PDF generation

## Tech Stack
- Frontend: React Native, Expo, Expo Router, Axios
- Backend: FastAPI, Motor (async MongoDB), fpdf2
- Database: MongoDB

## What's Implemented (Complete)
- Clinical Case Album Generator (PDF + frontend UI)
- 2-step New Case wizard (Step 1: Case Details + Checklist, Step 2: Implant Selection with drilling protocol)
- Phase 2-4 submission forms with torque values and clinical remarks
- Case Completion Engine (badge + PDF report)
- Checklist File Uploads
- Implant Planning: integrated into New Case workflow + standalone on detail page + standalone tab
- Drilling Protocol: auto-generated based on brand, diameter, bone type (D1-D4)
- Faculty/Incharge dropdowns (auth-dependent loading)

## Bug Fixes & Changes
### March 15, 2026
1. Faculty/Incharge Dropdowns: Fixed race condition - useEffect depends on `user`
2. CBCT Upload Removed: Removed hasUpload from "Radiographic Investigations"
3. Implant Planning Phase 1 Integration: Conditional rendering with Phase 1 banner

### March 16, 2026
4. 2-Step New Case Wizard: Step 1 = Case details + Checklist, Step 2 = Implant Selection
5. Loading Type Styling: Bordered container (borderWidth: 1.5, borderColor: #C5CDD5, bg: #F4F6F8)
6. All 45 Implant Systems: Promise.allSettled for independent loading
7. Dental Chart Positioning: paddingTop: 130 (RN Web padding shorthand workaround)
8. **Modal Header SafeArea**: Wrapped in SafeAreaView edges=['top'] to prevent status bar overlap
9. **Close Button Accessibility**: Larger padding (8px) on X button for easier tapping
10. **Drilling Protocol Generator**: System-specific sequential drill steps in Step 2 after system selection

## RN Web Gotchas
- padding shorthand overrides paddingTop — use paddingHorizontal/paddingBottom/paddingTop separately
- justifyContent: 'center' in StyleSheet.create gets dropped in Modal contexts
- flex: 1 on conditional Views doesn't work — use fixed dimensions/padding

## Test Credentials
- Admin: abhijit.patil@dental.edu / Admin@123
- Student: gaurav.pandey@student.dental.edu / Student@123

## Backlog (Prioritized)
- P2: Notification system for phase approvals/status changes
- P2: Backend refactoring (decompose monolithic server.py)
- P2: Frontend refactoring (modularize complex components)
- P2: Data cleanup (remove duplicate user entries)
- P3: Minor - Procedure card text rendering vertically in My Cases (RN Web flexbox issue)
