# Prosthodontics Implant Workflow App — Developer Reference

## Application Overview

A comprehensive mobile application for the **Department of Prosthodontics, Bharati Vidyapeeth Dental College and Hospital, Pune** that manages dental implant surgical case workflows across **4 clinical phases** with role-based access control and multi-level approval workflows.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React Native (Expo Router) — tested via Expo Go on iOS |
| **Backend** | Python FastAPI (monolithic `server.py` ~6300 lines) |
| **Database** | MongoDB (Motor async driver) |
| **Auth** | JWT (access + refresh tokens), bcrypt password hashing |
| **PDF Export** | FPDF2 (backend), expo-print (frontend fallback) |
| **Push Notifications** | Expo Push API |
| **Deployment** | Expo EAS (frontend), Emergent Platform (backend) |

---

## User Roles & Access

| Role | Count | Permissions |
|------|-------|------------|
| `implant_incharge` | 2 | Create cases, approve all phases, view all cases, manage users |
| `supervisor` | 5 | Create cases, approve Phase 1 & Phase 2, view assigned cases |
| `student` | 12 | Create cases, submit phases for approval, view own cases |
| `nurse` | 2 | View cases (limited access) |

---

## Login Credentials

```json
{
  "implant_incharge": [
    {"name": "Dr. Abhijit Patil", "login": "Abhijit.patil@dental.edu", "password": "Admin@123"},
    {"name": "Dr. Ajay Sabane", "login": "Ajay.sabane@dental.edu", "password": "Admin@123"}
  ],
  "supervisors": [
    {"name": "Dr. Paresh Gandhi", "login": "Paresh.gandhi@dental.edu", "password": "Supervisor@123"},
    {"name": "Dr. Rajshree Jadhav", "login": "Rajshree.jadhav@dental.edu", "password": "Supervisor@123"},
    {"name": "Dr. Vasantha N", "login": "Vasantha.n@dental.edu", "password": "Supervisor@123"},
    {"name": "Dr. Rupali Patil", "login": "Rupali.patil@dental.edu", "password": "Supervisor@123"},
    {"name": "Dr. Pankaj Kadam", "login": "Pankaj.kadam@dental.edu", "password": "Supervisor@123"}
  ],
  "students": [
    {"name": "Dr. Gaurav Pandey", "login": "Gaurav.pandey@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Atharva Mahadik", "login": "Atharva.mahadik@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Anand Kurum", "login": "Anand.kurum@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Yashica Jain", "login": "Yashica.jain@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Vaibhav Deshpande", "login": "Vaibhav.deshpande@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Manasi Dhiren", "login": "Manasi.dhiren@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Renuka Bodakhe", "login": "Renuka.bodakhe@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Shritej Shevakari", "login": "Shritej.shevakari@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Aaditya Patil", "login": "Aaditya.patil@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Kunal Parikh", "login": "Kunal.parikh@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Krishna Mehta", "login": "Krishna.mehta@student.dental.edu", "password": "Student@123"},
    {"name": "Dr. Sakshi Lohade", "login": "Sakshi.lohade@student.dental.edu", "password": "Student@123"}
  ],
  "nurses": [
    {"name": "Nurse 1", "login": "Nurse.1@dental.edu", "password": "Nurse@123"},
    {"name": "Nurse 2", "login": "Nurse.2@dental.edu", "password": "Nurse@123"}
  ]
}
```

> Login is **case-insensitive**. Both email (`Abhijit.patil@dental.edu`) and username (`Abhijit.patil`) work.

---

## 4-Phase Clinical Workflow

### Phase 1: Pre-Surgical Planning
**Status flow:** `draft` → `pending_phase1` → `phase1_approved` (or `rejected`)

**Data collected:**
- Patient demographics (name, registration number)
- Assigned supervisor and implant in-charge
- Receipt/payment info
- Procedure type and loading type
- Clinical examination (intraoral): edentulous sites, arch condition, ridge contour, soft tissue, keratinized mucosa
- Occlusal analysis: scheme, parafunction, vertical dimension, opposing dentition
- Aesthetic risk assessment: smile line, gingival biotype
- Medical assessment: systemic conditions, medications, allergies, risk level
- Implant planning: position (FDI), brand, system, diameter, length, bone dimensions, risk scoring
- Drilling protocol generation
- CBCT & IOS file uploads
- Photo documentation

**Approval:** Requires both Supervisor AND Implant In-Charge approval.

### Phase 2: Surgical Phase
**Status flow:** `phase1_approved` → `pending_phase2` → `phase2_approved`

**Data collected:**
- Pre-surgery checklist (7 items)
- Anesthesia details
- Flap design
- Drilling type
- Implant seating verification + torque values
- Prosthetic component selection
- Healing abutment cuff height
- Sutures and hemostasis
- Post-operative checklist
- Student/Supervisor/In-charge notes

### Phase 3: Second Stage Surgical
**Status flow:** `phase2_approved` → `pending_stage2_surgical` → `stage2_surgical_approved`

**Data collected:**
- Second stage surgical checklist
- ISQ value
- Healing abutment height
- Notes

### Phase 4: Prosthetic Phase (2 steps)
**Step 1 - Impressions:**
**Status flow:** `stage2_surgical_approved` → `pending_stage2_prosthetic` → `stage2_prosthetic_approved`

- Final prosthetic plan
- Prosthetic material
- Custom abutment selection
- Overdenture attachment
- Payment and component verification
- Impression type

**Step 2 - Trial & Delivery:**
**Status flow:** `stage2_prosthetic_approved` → `pending_phase4_step2` → `completed`

- Trial checklist
- Confirmation statement
- Final notes

---

## Database Schema

### Collection: `users`
```json
{
  "_id": "ObjectId",
  "name": "Dr. Gaurav Pandey",
  "username": "Gaurav.pandey",
  "email": "Gaurav.pandey@student.dental.edu",
  "password_hash": "$2b$12$...",
  "role": "student",
  "profile_photo": "base64_string | null",
  "push_token": "ExponentPushToken[...] | null"
}
```

### Collection: `procedures`
```json
{
  "_id": "ObjectId",
  "patient_name": "John Doe",
  "registration_number": "REG001",
  "student_id": "user_id",
  "student_name": "Dr. Gaurav Pandey",
  "supervisor_id": "user_id",
  "supervisor_name": "Dr. Paresh Gandhi",
  "implant_incharge_id": "user_id",
  "implant_incharge_name": "Dr. Abhijit Patil",
  "created_by_id": "user_id",
  "created_by_role": "student",
  "status": "draft | pending_phase1 | phase1_approved | pending_phase2 | phase2_approved | pending_stage2_surgical | stage2_surgical_approved | pending_stage2_prosthetic | stage2_prosthetic_approved | pending_phase4_step2 | completed | rejected",
  "procedure_date": "2026-04-01",
  "procedure_time": "10:00 AM",
  "implant_procedure_type": "Single Implant",
  "loading_type": ["Delayed Loading"],
  "prosthetic_plan": "Cement-Retained Crown",
  "receipt_number": "REC001",
  "amount_paid": 25000.0,
  "implant_site": "14",
  "implant_region": "Maxilla",
  "implant_company": "Nobel Biocare",
  "edentulous_sites": ["14"],
  "arch_condition": "Adequate",
  "ridge_contour": "Flat",
  "soft_tissue_thickness": "Thick",
  "keratinized_mucosa": "Adequate",
  "occlusal_scheme": "Mutually Protected",
  "parafunction_habit": "None",
  "vertical_dimension": "Adequate",
  "opposing_dentition": "Natural",
  "smile_line": "Medium",
  "gingival_biotype": "Thick",
  "medical_assessment": {
    "hypertension": "controlled",
    "diabetes": "none",
    "bleeding_disorders": "none"
  },
  "medical_risk_level": "Low",
  "implant_plans": [
    {
      "position": "14",
      "brand": "Nobel Biocare",
      "system": "NobelActive",
      "diameter": 4.3,
      "length": 11.5,
      "bone_width": 8.0,
      "bone_height": 12.0,
      "bone_type": "D2",
      "risk_level": "Low",
      "risk_score": 2
    }
  ],
  "phase2_data": {
    "pre_surgery_checklist": {},
    "anesthesia_adequate": "Yes",
    "flap_design": "Full thickness mucoperiosteal",
    "drilling_type": "Sequential",
    "implant_seated_correctly": true,
    "torque_values": [35.0],
    "prosthetic_component": "Healing abutment",
    "healing_abutment_cuff_height": "4mm",
    "sutures_placed": true,
    "hemostasis_achieved": true,
    "post_op_checklist": {},
    "student_notes": "",
    "supervisor_notes": "",
    "incharge_notes": ""
  },
  "stage2_surgical": {
    "checklist_items": {},
    "isq_value": "72",
    "healing_abutment_height": "4mm"
  },
  "stage2_prosthetic": {
    "final_prosthetic_plan": "PFM Crown",
    "prosthetic_material": "Porcelain Fused to Metal",
    "impression_type": "conventional"
  },
  "phase4_step2": {
    "trial_checklist": {},
    "confirmation_statement": true
  },
  "approval_history": [
    {
      "phase": "phase1",
      "action": "approve",
      "by": "user_id",
      "by_name": "Dr. Paresh Gandhi",
      "role": "supervisor",
      "at": "2026-04-01T10:00:00Z"
    }
  ],
  "created_at": "2026-04-01T09:00:00Z",
  "updated_at": "2026-04-01T12:00:00Z"
}
```

### Collection: `implant_library` (649 documents, 49 systems)
```json
{
  "_id": "ObjectId",
  "brand": "Nobel Biocare",
  "system": "NobelActive",
  "diameter": 4.3,
  "length": 11.5,
  "platform": "Internal",
  "connection_type": "Conical",
  "bone_level": "Bone Level",
  "material": "Titanium Grade 4",
  "surface_treatment": "TiUnite"
}
```

### Collection: `refresh_tokens`
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "token": "jwt_refresh_token_string",
  "created_at": "2026-04-01T09:00:00Z",
  "expires_at": "2026-04-08T09:00:00Z"
}
```

### Collection: `notifications`
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "procedure_id": "string",
  "message": "Phase 1: Case approved by Dr. Paresh Gandhi",
  "type": "approved | rejected | submitted",
  "read": false,
  "created_at": "2026-04-01T10:00:00Z"
}
```

---

## API Endpoints Reference

### Authentication
```
POST /api/auth/login          — Login (accepts {identifier} or {email} + password)
POST /api/auth/register       — Register new user
GET  /api/auth/me             — Get current user profile (requires Bearer token)
POST /api/auth/logout         — Logout (invalidates refresh token)
POST /api/auth/refresh        — Refresh access token ({refresh_token})
PUT  /api/auth/profile-photo  — Update profile photo (base64)
POST /api/auth/push-token     — Register push notification token
```

### Login Request/Response
```json
// REQUEST
POST /api/auth/login
{
  "identifier": "Gaurav.pandey@student.dental.edu",  // or "email" field for backward compat
  "password": "Student@123"
}

// RESPONSE (200 OK)
{
  "access_token": "eyJhbG...",      // JWT, 15-minute expiry
  "refresh_token": "eyJhbG...",     // JWT, 7-day expiry (stored in DB)
  "token": "eyJhbG...",             // same as access_token (backward compat)
  "token_type": "bearer",
  "user": {
    "id": "60f7b...",
    "name": "Dr. Gaurav Pandey",
    "email": "Gaurav.pandey@student.dental.edu",
    "role": "student",
    "profile_photo": null
  }
}
```

### Token Refresh
```json
// REQUEST
POST /api/auth/refresh
{"refresh_token": "eyJhbG..."}

// RESPONSE (200 OK)
{"access_token": "eyJhbG...", "token_type": "bearer"}
```

### Users
```
GET    /api/users                — List all users (optional ?role=student)
POST   /api/users                — Create user (admin)
PUT    /api/users/{user_id}      — Update user
DELETE /api/users/{user_id}      — Delete user
```

### Procedures (Cases)
```
POST   /api/procedures                                  — Create new case
GET    /api/procedures                                  — List cases (filtered by role)
GET    /api/procedures/{id}                             — Get case details
PUT    /api/procedures/{id}                             — Update case
DELETE /api/procedures/{id}                             — Delete case
POST   /api/procedures/{id}/case-report                 — Generate PDF case report
GET    /api/procedures/{id}/badge                       — Get completion badge status
```

### Phase Workflow
```
POST /api/procedures/{id}/request-phase1-approval       — Submit Phase 1 for approval
POST /api/procedures/{id}/approve                       — Approve/reject Phase 1
POST /api/procedures/{id}/submit-phase2                 — Submit Phase 2
POST /api/procedures/{id}/stage2/surgical               — Submit Stage 2 Surgical
POST /api/procedures/{id}/stage2/surgical/approve       — Approve Stage 2 Surgical
POST /api/procedures/{id}/stage2/prosthetic             — Submit Stage 2 Prosthetic Step 1
POST /api/procedures/{id}/stage2/prosthetic/approve     — Approve Stage 2 Prosthetic Step 1
POST /api/procedures/{id}/stage2/prosthetic/step2       — Submit Prosthetic Step 2
POST /api/procedures/{id}/stage2/prosthetic/step2/approve — Approve Prosthetic Step 2 (case complete)
```

### Implant Planning
```
POST /api/procedures/{id}/implant-plan                  — Save implant plan
GET  /api/procedures/{id}/implant-plan                  — Get implant plan
```

### Implant Library
```
GET  /api/implant-library/systems                       — List all 49 implant systems
GET  /api/implant-library/suggest?brand=...&system=...&diameter=...&length=... — Search implants
POST /api/implant-library/suggest-auto                  — Auto-suggest implants for tooth position
GET  /api/implant-library/tooth-recommendations/{tooth} — Get recommendations for specific tooth
POST /api/implant-library/calculate-risk                — Calculate implant risk score
GET  /api/implant-library/procedure-options              — Get procedure type options
```

### Drilling Protocols
```
POST /api/drilling-protocols/generate                   — Generate drilling sequence
GET  /api/drilling-protocols/available                  — List available protocol systems
POST /api/drilling-protocols/export-pdf                 — Export drilling protocol as PDF
```

### File Uploads
```
POST /api/procedures/{id}/upload-cbct                   — Upload CBCT scan
POST /api/procedures/{id}/upload-ios                    — Upload IOS scan
POST /api/procedures/{id}/photos/{step_id}              — Upload phase photo
GET  /api/procedures/{id}/photos                        — List all photos
DELETE /api/procedures/{id}/photos/{step_id}/{filename}  — Delete photo
POST /api/procedures/{id}/generate-album                — Generate photo album PDF
```

### Notifications
```
GET /api/notifications                                  — Get user notifications
PUT /api/notifications/{id}/read                        — Mark notification as read
GET /api/notifications/unread-count                     — Get unread count
```

### Dashboard
```
GET /api/dashboard/stats                                — Dashboard statistics (role-aware)
```

### Health Checks
```
GET /                                                   — Root health check
GET /api/health                                         — API health check
GET /api/health/db-status                               — DB status with counts
```

---

## Project Structure

```
/app
├── backend/
│   ├── server.py                      # Monolithic FastAPI app (~6300 lines)
│   │   ├── Lines 1-80:    Imports, DB setup, security config
│   │   ├── Lines 80-160:  Health checks, helper functions, token creation
│   │   ├── Lines 160-415: Pydantic models (all request/response schemas)
│   │   ├── Lines 415-690: Auth routes (login, register, logout, refresh, me)
│   │   ├── Lines 690-850: User CRUD routes
│   │   ├── Lines 850-1270: Procedure CRUD + file uploads
│   │   ├── Lines 1270-1750: Implant plan, case report PDF generation
│   │   ├── Lines 1750-2500: Photo management, approval workflow Phase 1
│   │   ├── Lines 2500-3550: Phase 2, Stage 2 Surgical, Prosthetic workflows
│   │   ├── Lines 3550-3900: Notifications, dashboard stats
│   │   ├── Lines 3900-4400: Implant library search/suggest/risk-calc
│   │   ├── Lines 4400-5800: IMPLANT_INDICATIONS dict, DRILLING_PROTOCOLS dict
│   │   ├── Lines 5800-6000: Drilling protocol generation endpoints
│   │   └── Lines 6000-6312: Startup seed (users + implant library from Excel)
│   ├── requirements.txt               # 127 Python packages
│   ├── implant_library_latest.xlsx    # Authoritative seed data (649 implant variants)
│   └── .env                           # MONGO_URL, DB_NAME, SECRET_KEY, CORS_ORIGINS
│
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx            # Tab navigator (role-based tab visibility)
│   │   │   ├── index.tsx              # Dashboard/home screen
│   │   │   └── new-procedure.tsx      # Create new case form (~885 lines)
│   │   ├── auth/
│   │   │   ├── login.tsx              # Login screen
│   │   │   └── register.tsx           # Registration screen
│   │   ├── procedures/
│   │   │   └── [id].tsx               # Case detail view (all 4 phases)
│   │   ├── implantlens/              # ImplantLens feature screens
│   │   ├── _layout.tsx                # Root layout (AuthProvider wrapper)
│   │   └── index.tsx                  # App entry/redirect
│   ├── components/
│   │   ├── CaseImplantPlanning.tsx    # Implant selection & planning UI
│   │   ├── DrillingProtocol.tsx       # Drilling protocol display
│   │   ├── CasePhotoAlbum.tsx         # Photo capture & management
│   │   ├── ChecklistForm.tsx          # Dynamic checklist renderer
│   │   ├── CaseCompletionBadge.tsx    # Completion badge display
│   │   └── BackToDashboard.tsx        # Navigation helper
│   ├── contexts/
│   │   └── AuthContext.tsx            # Auth state (SecureStore + interceptors)
│   ├── utils/
│   │   ├── api.ts                     # Axios instance with auto-refresh interceptor
│   │   ├── config.ts                  # Backend URL resolution
│   │   ├── pdfGenerator.ts           # Frontend PDF generation (expo-print)
│   │   └── usePushNotifications.ts   # Push notification hook
│   ├── constants/
│   │   └── checklist.ts              # Dropdown options, form definitions
│   ├── app.json                       # Expo config (EAS project ID, backendUrl)
│   ├── eas.json                       # EAS build profiles with env vars
│   ├── package.json                   # Node dependencies
│   └── .env                           # EXPO_PUBLIC_BACKEND_URL
│
└── memory/
    ├── PRD.md                         # Product requirements & session history
    └── test_credentials.md            # All login credentials
```

---

## Authentication Flow

```
1. User opens app → AuthContext checks SecureStore for access_token
2. If token exists → GET /api/auth/me (interceptor auto-attaches Bearer token)
   - Success → User is logged in
   - 401 → Interceptor auto-refreshes via POST /api/auth/refresh
     - Success → Retry original request with new token
     - Fail → Clear tokens, redirect to login
3. Login screen → POST /api/auth/login {identifier, password}
   - Response → Store access_token + refresh_token in SecureStore
4. All subsequent API calls → Interceptor auto-attaches access_token
5. Logout → POST /api/auth/logout → Clear SecureStore → Redirect to login
```

---

## Implant Library & Drilling Protocols

### Implant Library
- **49 brand|system combinations** with **649 implant variants**
- Seeded from `implant_library_latest.xlsx` on every backend startup
- Supports auto-suggestion based on tooth position, bone dimensions
- Risk scoring algorithm based on bone width, height, and density

### Drilling Protocols
- **14 protocol families** covering **32 implant systems**
- Bone-density-specific drill sequences (D1-D4)
- Dynamic step generation based on implant diameter and bone type
- Protocol systems include: Nobel Biocare, Straumann, Osstem, BioHorizons, Zimmer Biomet, Dentium, Neodent, Alpha-Bio, Ankylos, and more

### Implant Indications
- **38 systems** mapped with clinical indications from master Word document
- Indications include: bone density suitability, jaw region, surgical approach

---

## Key Features

1. **Role-based dashboard** — Different views for students, supervisors, in-charges
2. **Multi-level approval** — Both supervisor AND in-charge must approve each phase
3. **Rejection workflow** — "Permanent rejection" or "Reconsider" with reasons
4. **Push notifications** — Real-time alerts for approvals, rejections, submissions
5. **Photo documentation** — Phase-specific photo capture with defined steps
6. **PDF case reports** — Comprehensive report generation (backend FPDF2)
7. **Risk assessment** — Automated scoring based on bone dimensions
8. **Implant suggestions** — AI-like auto-matching based on clinical parameters
9. **Drilling protocol generation** — Dynamic drill sequences per implant/bone type
10. **Case completion badges** — Visual progress tracking

---

## Environment Variables

### Backend (`/app/backend/.env`)
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
SECRET_KEY="<random-32-byte-key>"
CORS_ORIGINS="*"
```

### Frontend (`/app/frontend/.env`)
```
EXPO_PUBLIC_BACKEND_URL=https://implant-workflow-hub.preview.emergentagent.com
```

---

## Startup Behavior

On every backend startup (`seed_on_startup`):
1. **Users**: Upserts all 21 authoritative users (only hashes passwords for NEW users)
2. **Implant Library**: Reads `implant_library_latest.xlsx`, drops and reseeds if system/record count mismatches the Excel file
3. **MongoDB ping**: Gracefully handles unreachable DB (app starts without seeding)

---

## Pending / Backlog

### P0 (Blocking)
- Production deployment at `https://implant-app.emergent.host` — user needs to save to correct GitHub branch and redeploy

### P1
- Data visibility: Ensure all data visible to Supervisor/In-Charge before approval
- Add indications/protocols for remaining 17 implant systems

### P2
- Backend refactoring: Decompose `server.py` into modular routers/services
- Frontend refactoring: Modularize large components
- Data cleanup: Remove duplicate user entries
