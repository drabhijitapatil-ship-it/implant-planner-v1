# Implant Planner v1 — My Understanding of What I Built

## What Is This?

This is a full-stack mobile app for dental implant case management, built specifically for dental students, supervisors, nurses, and admins working in a clinical or teaching environment. The idea is simple: a dental student creates a case, goes through multiple phases of treatment planning (from initial assessment all the way to final prosthetic placement), and a supervisor reviews and approves at each checkpoint. The app handles the entire workflow — planning, drilling protocols, augmentation checklists, consent forms, AI-assisted recommendations, and even a community forum.

It's HIPAA-conscious with screenshot prevention, session timeouts, and audit logs.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React Native + Expo (TypeScript), Expo Router (file-based nav) |
| Backend | FastAPI (Python), Motor (async MongoDB), Pydantic |
| Database | MongoDB |
| AI | OpenAI GPT + Google Gemini |
| Storage | AWS S3 |
| Auth | JWT (access + refresh tokens), Bcrypt |
| Push Notifications | Expo Push |

---

## Folder Structure

```
implant-planner-v1/
├── frontend/       → React Native app (Expo Router)
├── backend/        → FastAPI server (all in server.py, ~13K lines)
├── tests/          → Integration tests
└── *.py scripts    → Seed data, migrations, utilities
```

---

## User Roles

| Role | Can Do |
|------|--------|
| Student | Create cases, fill phases, submit for review |
| Supervisor | Review cases, approve/reject, nudge students |
| Nurse | View scheduled cases, calendar, consent forms |
| Admin | Full access, implant catalog management, audit logs, user management |

---

## Core Flow (How Cases Work)

This is the main thing I built. A case goes through 4 phases:

### Phase 1 — Initial Case Creation
Student fills in patient info: name, age, arch (upper/lower jaw), which teeth are missing, bone type, bone height/width. The app validates the data, suggests implant options based on bone dimensions, and saves a draft. Supervisor is assigned here.

### Phase 2 — Augmentation & Pre-Surgical Planning
If bone augmentation is needed, student fills an augmentation checklist. There's a separate submit flow for this (`submit-phase2/[id]`). Supervisor can request edits (Phase2EditRequest). Student and supervisor exchange edit requests/resolutions before moving forward.

### Phase 3 — Surgical Stage
Student documents the actual surgical procedure. Implant plan is locked in — brand, system, diameter, length per tooth site. Drilling protocol is auto-generated based on the selected implant brand and bone type. There are 15 supported brands (Alpha Bio, Osstem, Neodent, Ankylos, etc.). This phase has sub-flows: surgical submission and prosthetic submission.

### Phase 4 — Prosthetic Stage
Final stage. Student completes prosthetic documentation. Step 2 of Phase 4 handles MUA (Multi-Unit Abutment) and final crown placement. PDF export available here.

---

## Implant Planning Logic

This is the brain of the app — `CaseImplantPlanning.tsx` (142KB, biggest component).

1. Student selects missing teeth on a tooth map
2. App applies indications logic (`implantIndications.ts`, `implantValidation.ts`) — bone dimensions, contraindications, narrow ridge detection
3. AI (`/smart-planner-report`) generates per-site recommendations using OpenAI
4. Student reviews, overrides if needed (`implantSafety.ts` handles safety override UX)
5. Drilling protocol generated server-side (`_generate_*_protocol()` functions per brand)
6. Protocol shown in `DrillingProtocol.tsx` — step-by-step with instrument visuals

---

## Auth Flow

1. User registers → password bcrypt-hashed → stored in MongoDB
2. Login → 15-min access token + 7-day refresh token issued
3. Every API call → `api.ts` Axios interceptor attaches access token
4. Token expires → interceptor auto-calls `/refresh` → swaps tokens silently
5. 15-min inactivity detected by `ActivityTracker` in root layout → forces logout
6. HIPAA: iOS/Android screenshot prevention via `useScreenCaptureProtection` hook
7. On logout → tokens blocklisted server-side

---

## Navigation Structure

Expo Router file-based routing:

```
app/
├── index.tsx              → Auth check, redirect to dashboard or login
├── _layout.tsx            → Root layout (AuthProvider, ActivityTracker, HIPAA guard)
├── auth/
│   ├── login.tsx
│   └── register.tsx
├── (tabs)/
│   ├── _layout.tsx        → Bottom tab nav (5 tabs + drawer)
│   ├── dashboard.tsx
│   ├── procedures.tsx
│   ├── implant-selection.tsx
│   └── profile.tsx
├── procedures/
│   ├── [id].tsx           → Case detail
│   ├── submit-phase2/[id].tsx
│   ├── submit-stage2-surgical/[id].tsx
│   ├── submit-stage2-prosthetic/[id].tsx
│   └── submit-phase4-step2/[id].tsx
├── admin/
│   ├── implant-catalog.tsx
│   ├── audit-log.tsx
│   └── user-management.tsx
├── forum/
│   ├── index.tsx
│   ├── [threadId].tsx
│   └── chat/
├── ask-implanr.tsx        → AI chat assistant
└── implantlens/           → AI case analysis
    ├── index.tsx
    └── [caseId].tsx
```

---

## AI Features

| Feature | Endpoint | Model | What it does |
|---------|----------|-------|-------------|
| Ask Implanr | `/ask-implanr` | OpenAI | Chat assistant, case-aware Q&A |
| Smart Planner | `/smart-planner-report` | OpenAI | Per-site implant recommendations |
| Atrophy Classification | `/atrophy-classification` | Gemini | Classifies bone atrophy from inputs |
| ImplantLens | `/implantlens` | OpenAI | Full case AI analysis |

All AI calls include case context (`_build_case_context()`) so the AI knows the patient's bone dimensions, missing teeth, and existing plan.

---

## Database Collections

| Collection | Stores |
|-----------|--------|
| users | User accounts, roles, profile photos, push tokens |
| procedures | All cases, phases, implant plans, drilling protocols |
| implant_library | Master implant catalog (seeded from `implant_catalog_seed.py`) |
| augmentation_checklists | Per-case checklist state |
| notifications | In-app notifications |
| audit_logs | HIPAA audit trail |
| forum_threads | Forum posts |
| forum_posts | Thread replies, reactions |
| push_tokens | Expo push tokens per user |

---

## Files & Storage

- Consent forms → uploaded via `/upload-consent`, stored S3 (or local `/uploads/`)
- CBCT scans → `/upload-cbct`
- Case photos → `CasePhotoAlbum.tsx` handles camera + gallery picker
- PDF export → `pdfGenerator.ts` (34KB) generates case summary PDF

---

## Implant Brands Supported

15 brands with full drilling protocols:

Ankylos, Alpha Bio (SPI + brochure), Osstem, Neodent, Bredent, MIS Lance, TSX, BB Dental, Cowellmedi, Pro, Conical RBT, Conelog, Short implants, Refirm, Iter162

Each brand has a dedicated `_generate_*_protocol()` function in `server.py` that takes implant dimensions + bone type and returns step-by-step drilling sequence with instrument sizes.

---

## Supervisor Workflow

1. Student submits case → supervisor gets notification
2. Supervisor reviews on their dashboard
3. Can approve, reject, or request edits (NudgeBottomSheet for push notifications)
4. Edit request flow: student gets notified → makes changes → re-submits
5. Supervisor approves → case advances to next phase

---

## Forum & Community

- Students can share cases to forum (anonymized)
- Thread-based discussion
- Group chat channels
- Reactions on posts
- Moderation: supervisors and admins can moderate

---

## Notifications

- In-app notifications stored in MongoDB
- Push notifications via Expo Push API
- Triggers: phase submission, supervisor approval/rejection, nudges, pre-surgery reminders
- Nurse gets pre-surgery reminders via `/run-pre-surgery-reminders` cron-style endpoint

---

## What's Done (Feature Checklist)

- [x] Full auth (register, login, JWT, refresh, timeout, blocklist)
- [x] Role-based access (student, supervisor, nurse, admin)
- [x] 4-phase case workflow
- [x] Implant planning with tooth map
- [x] Safety validation & override
- [x] AI implant recommendations (per-site)
- [x] 15-brand drilling protocols
- [x] Augmentation checklist (AI-generated + manual)
- [x] Atrophy classification (Gemini)
- [x] Patient consent form (PDF generation + upload)
- [x] Case photos + CBCT upload
- [x] PDF case summary export
- [x] Supervisor review + edit request flow
- [x] Nurse dashboard (calendar, scheduled cases, consents)
- [x] Admin panel (user management, implant catalog, audit log)
- [x] Forum with sharing, replies, reactions
- [x] Group chat
- [x] Push notifications
- [x] In-app notifications
- [x] Ask Implanr AI chat
- [x] ImplantLens AI case analysis
- [x] HIPAA screenshot prevention
- [x] 15-min session timeout
- [x] Audit logging
- [x] Onboarding + What's New screen
- [x] Implant catalog with compare feature
- [x] OTA updates (Expo Updates)
- [x] 103 backend tests

---

## Key Files to Know

| File | Why important |
|------|--------------|
| `backend/server.py` | Everything backend — 13K lines, all endpoints |
| `frontend/app/_layout.tsx` | Root of app, auth gates, HIPAA |
| `frontend/contexts/AuthContext.tsx` | Auth state, token refresh, timeout |
| `frontend/utils/api.ts` | Axios with auto token refresh |
| `frontend/components/CaseImplantPlanning.tsx` | Core planning UI (142KB) |
| `frontend/utils/pdfGenerator.ts` | PDF export logic (34KB) |
| `backend/implant_catalog_seed.py` | Full implant database (158KB) |

---

## Known Architecture Notes

- Backend is a monolith (`server.py` is 13K lines). Works fine for current scale, but would need splitting if growing further.
- Zustand is imported but not actively used yet — auth state still in React Context.
- S3 integration is wired (`object_storage.py`) but local file serving also present — dual path.
- Forum feature is newer/lighter — less validation compared to case workflow.
- Stripe is included in deps but payment flow not fully implemented.
