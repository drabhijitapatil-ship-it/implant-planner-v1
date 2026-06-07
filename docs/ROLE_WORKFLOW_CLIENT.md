# Implanr — Role-Based Workflow Document
### Dental College App & Dental Clinic App

---

## Overview

Implanr operates on a **role-based access system**. Every user is assigned a role at signup, and their role determines what they can see, what they can do, and what requires approval from someone senior. The workflow is structured around a 4-phase case lifecycle — from initial diagnosis all the way to final prosthetic rehabilitation.

Both the Dental College App and the Dental Clinic App follow the **exact same 4-phase workflow**. The only differences are the role names and the removal of the Student role in the Clinic version.

---

## Role Overview

### Platform-Level: Superadmin

Above all institutions sits a **Superadmin** role — held exclusively by the Implanr platform team. This is not visible or accessible to any college or clinic user.

| What Superadmin controls |
|--------------------------|
| Push app OTA updates to all users across all institutions |
| Add, modify, or remove app workflows and features platform-wide |
| Manage all registered colleges and clinics on the platform |
| Enable or disable features per institution |
| Access any institution's data for support/troubleshooting |
| Configure subscription plans and billing |
| Monitor platform health, errors, and usage analytics |

**How it is implemented:** Superadmin operates through a separate secure web-based admin dashboard (not the mobile app). The mobile app has no Superadmin interface — all platform-level changes happen server-side and push down to all apps automatically. No college or clinic Implant In-Charge has access to this level.

---

### Cross-App Access: College ↔ Clinic Switching

Many faculty members who use the College App also have their own private dental clinic. To support this, **a single registered account can have access to both the College App and the Clinic App**.

- User registers once (college or clinic)
- From their profile, they can request or be granted access to the other app context
- Switching between College and Clinic view happens from the profile screen
- Data is kept separate — college cases stay in college context, clinic cases in clinic context
- Roles may differ: same person could be a Supervisor in college and a Chief Dentist in their clinic

---

### Dental College App

| Role | Who is this? |
|------|-------------|
| **Implant In-Charge** | Senior faculty. Full control over everything in the system. Final approver for all phases. Self-approved — can create and manage cases without requiring anyone else's approval. |
| **Supervisor** | Faculty member. Reviews and approves student cases at every phase independently. Can also create own cases. |
| **PG / UG Student** | Creates and manages patient cases under supervisor guidance. Submits each phase for approval. |
| **Nurse** | Clinical support. Cannot create cases. Handles consent forms and instrument sterilisation. |

### Dental Clinic App

| Role | Who is this? | College Equivalent |
|------|-------------|-------------------|
| **Chief Dentist / Owner / Admin** | Clinic owner or senior dentist. Full control. Final approver. Self-approved. | Implant In-Charge |
| **Dentist / Consultant** | Associate dentist. Creates and manages own patient cases. Submits to Chief Dentist. | Supervisor |
| **Dental Assistant** | Clinical support. Cannot create cases. Handles consent and instruments. | Nurse |

> **Note:** There is no Student role in the Clinic App. The Dentist directly manages their own cases and submits each phase to the Chief Dentist for approval.

---

## The 4-Phase Case Lifecycle

Every case in Implanr goes through 4 phases. Each phase must be completed and approved before the next phase unlocks.

```
Phase 1 — Diagnosis & Treatment Planning
      ↓  Student submits → Supervisor + Implant In-Charge both approve (independently) → Phase 2 unlocks
Phase 2 — Implant Surgery
      ↓  Student submits → Supervisor + Implant In-Charge both approve (independently) → Phase 3 unlocks
Phase 3 — Healing & Second Stage Surgery
      ↓  Student submits → Supervisor + Implant In-Charge both approve (independently) → Phase 4 unlocks
Phase 4 — Prosthetic Rehabilitation
      ↓  Student submits → Supervisor + Implant In-Charge both approve (independently) → Case Complete
```

### Approval Rules

- **Both Supervisor and Implant In-Charge must approve** at every phase for the next phase to unlock
- They can approve **independently and simultaneously** — there is no forced sequence between them
- If Implant In-Charge has approved but Supervisor's approval is still pending → next phase remains **locked**
- If Supervisor has approved but Implant In-Charge's approval is still pending → next phase remains **locked**
- The next phase unlocks **only when both approvals are recorded**
- Either approver can reject at any point — rejection immediately notifies the student to correct and resubmit

### Configurable Approval (Per Institution)

Some colleges or clinics may only require **Supervisor-level approval** to unlock the next phase, without mandatory Implant In-Charge approval. This is configurable per institution by the Superadmin at the platform level.

| Configuration | How it works |
|--------------|-------------|
| **Both required** (default) | Supervisor + In-Charge must both approve. Phase locks until both done. |
| **Supervisor only** | Supervisor approval alone unlocks the next phase. In-Charge can still review but is not a gate. |
| **In-Charge only** | In-Charge approval alone is sufficient. Supervisor review is advisory only. |

---

### Special Case: "Existing Implants" Procedure Type

When the procedure type selected is **Existing Implants**, Phase 2 (Implant Surgery) is skipped entirely. After Phase 1 approval, the user chooses where to continue based on the clinical situation and the stage at which the case was received:

```
Existing Implants case:
Phase 1 — Diagnosis & Treatment Planning
      ↓  (Phase 2 skipped)
      ↓  User chooses based on clinical situation:
Phase 3 — Healing & Second Stage Surgery
      (if implants are placed but healing/second stage is pending)
          OR
Phase 4 — Prosthetic Rehabilitation
      (if implants are already placed and healed — only prosthetics remain)
```

### Case Assignment — Current & Future

**Currently:** When creating a new case in Phase 1, the student selects their assigned Supervisor and Implant In-Charge from a dropdown list.

**Future customisation (planned):** Some colleges may require that the Implant In-Charge or Supervisor assigns cases to students directly, rather than students choosing. This will be configurable per institution.

---

## Dental College App — Detailed Role Workflows

---

### Role 1: Implant In-Charge

**Who uses this:** Head of the implant department or senior faculty responsible for overseeing all cases in the college.

#### Key privilege: Self-Approved
Cases created by the Implant In-Charge do not require Supervisor or any other approval. They are approved by themselves and can proceed through all phases directly.

#### Edit History
Every edit made to any case detail — regardless of who makes it — is automatically saved in the case's edit history. The Implant In-Charge can review the full edit trail at any time.

#### What they can see
- Every case in the system — regardless of which student or supervisor created it
- Full patient data across all 4 phases
- All user accounts
- Audit trail of all activity in the system
- Student progress summaries
- Supervisor performance summaries

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Full view — all pending approvals, recent activity |
| New Case | ✅ Can create cases (self-approved) |
| Implant Library | ✅ Full access — add, edit, delete implant systems |
| My Cases | ✅ Sees ALL cases in system |
| Alerts & Notifications | ✅ |
| User Management | ✅ Add/remove/edit users, change roles |
| Archived Cases | ✅ |
| Forum & Discussion | ✅ |
| Group Chat | ✅ Can create open or closed group chats |
| What's New | ✅ |
| Student Profiles | ✅ View individual student progress |
| Supervisor Summaries | ✅ |
| Audit Log | ✅ |
| Implant Database | ✅ Full edit access |

#### What they can do
- Create new patient cases — self-approved, no external approval needed
- View, edit, and manage **any case** at **any phase** at **any time**
- All edits are automatically recorded in case edit history
- **Approve or reject** case submissions at every phase (Phase 1 through Phase 4)
- Add, edit, and remove implant systems from the catalog
- Add or remove users from the system
- Change user roles (e.g. upgrade student to supervisor)
- Archive and restore cases
- Export full case PDF reports
- Use all AI features — Smart Planner, Ask Implanr, ImplantLens
- Send push notification nudges to supervisors and students
- View complete student progress analytics
- View supervisor performance summaries
- Review and resolve Phase 2 edit requests

#### Approval Responsibilities
The Implant In-Charge is the **mandatory final approver** at every phase. A phase does not unlock for the next step until the In-Charge explicitly approves it — even if the Supervisor has already approved.

| Phase Submission | Action Required |
|-----------------|----------------|
| Phase 1 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 2 unlocks |
| Phase 2 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 3 unlocks |
| Phase 3 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 4 unlocks |
| Phase 4 Step 1 submitted | Review → Approve or Reject |
| Phase 4 Step 2 (Final) submitted | Final approval → Case marked Complete |

---

### Role 2: Supervisor

**Who uses this:** Faculty members who are assigned to specific students and oversee their cases throughout all 4 phases.

#### What they can see
- Their own cases
- Cases of students assigned to them
- Cannot see cases belonging to other supervisors' students

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Own activity + assigned student case summaries |
| New Case | ✅ Can create own cases |
| Implant Library | ✅ Read-only |
| My Cases | ✅ Own + assigned student cases |
| Alerts & Notifications | ✅ |
| Archived Cases | ✅ |
| Forum & Discussion | ✅ |
| Group Chat | ✅ Can create open or closed group chats |
| What's New | ✅ |
| Implant Database | ✅ Read-only |
| User Management | ❌ |
| Audit Log | ❌ |

#### What they can do
- Create and manage their own patient cases
- **Review and approve or reject student case submissions at every phase** (Phase 1 through Phase 4)
- Add review notes when approving or rejecting at any phase
- Request edits on any phase (send edit request back to student with specific instructions)
- After approving, submit the case to Implant In-Charge for final approval
- Upload consent forms, case photos, CBCT scans
- Export case PDF reports
- Use all AI features — Smart Planner, Ask Implanr, ImplantLens
- Participate in the discussion forum
- Create and join group chats (open or closed groups) — any user except Nurse / Dental Assistant can initiate a new group chat
- Schedule case appointments
- View drilling protocols for selected implants

#### What they cannot do
- View or edit cases not assigned to them
- Give final approval — Implant In-Charge approval is always required after Supervisor approval
- Add or remove users
- Edit the implant catalog
- View audit logs

#### Approval Workflow (Supervisor's perspective — all phases)
```
PHASE 1:
Student submits Phase 1
  → Supervisor receives notification
  → Supervisor reviews all Phase 1 data
  → Supervisor Approves OR Rejects (student notified to fix and resubmit)
  → If approved: Supervisor submits to Implant In-Charge
  → In-Charge Approves OR Rejects
  → If In-Charge approves: Phase 2 unlocks for student

PHASE 2:
Student submits Phase 2
  → Supervisor reviews Phase 2 data
  → Can request edits → student revises → resubmits
  → Supervisor Approves → submits to In-Charge
  → In-Charge Approves → Phase 3 unlocks

PHASE 3:
Student submits Phase 3
  → Supervisor reviews → Approves → submits to In-Charge
  → In-Charge Approves → Phase 4 unlocks

PHASE 4:
Student submits Phase 4
  → Supervisor reviews → Approves → submits to In-Charge
  → In-Charge gives final approval → Case marked Complete
```

---

### Role 3: PG / UG Student

**Who uses this:** Postgraduate or undergraduate dental students conducting implant cases under faculty supervision.

#### What they can see
- Only their own cases
- Cannot see anyone else's cases

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Own cases summary, upcoming appointments |
| New Case | ✅ Can create cases |
| Implant Library | ✅ Read-only |
| My Cases | ✅ Own cases only |
| Alerts & Notifications | ✅ |
| Archived Cases | ✅ |
| Forum & Discussion | ✅ |
| Group Chat | ✅ Can join and create group chats |
| What's New | ✅ |
| Implant Database | ✅ Read-only |
| User Management | ❌ |

#### What they can do
- Create new patient cases
- Select procedure type (including Existing Implants — skips Phase 2)
- Select assigned Supervisor and Implant In-Charge from dropdown (during case creation)
- Fill complete Phase 1 data:
  - Patient information (name, age, registration number, medical history)
  - Clinical examination (arch, missing teeth, bone type, dimensions)
  - AI-assisted implant selection — Smart Planner recommends implants per tooth site
  - Review and confirm implant plan (can override with safety acknowledgment)
  - View auto-generated drilling protocol for chosen implants
- Submit Phase 1 for Supervisor approval
- Fill Phase 2 — implant surgery planning, augmentation checklist
- Upload patient consent form
- Upload case photos and CBCT scans
- Fill Phase 3 — document healing and second stage surgery
- Fill Phase 4 — document prosthetic rehabilitation
- Request edits at any phase (ask supervisor to review a specific section)
- Use all AI features — Ask Implanr for guidance, ImplantLens for case analysis
- Export case PDF once case is complete

#### What they cannot do
- Edit a submitted phase (locked until approved or rejected)
- View other students' cases
- Approve or reject anything
- Manage users or catalog

#### Full Case Workflow (Student's perspective — step by step)

**Phase 1 — Diagnosis & Treatment Planning**
1. Student creates new case, selects procedure type
2. Selects assigned Supervisor and Implant In-Charge from dropdown
3. Enters patient details (name, age, registration number, medical history)
4. Selects arch (upper/lower jaw) and marks missing teeth on tooth map
5. Enters bone dimensions (height, width, density)
6. AI Smart Planner suggests implants per tooth site based on clinical data
7. Student reviews suggestions, can override with safety acknowledgment
8. Drilling protocol auto-generates for chosen implants
9. Student reviews all data → clicks **Submit for Approval**
10. Supervisor receives notification → reviews → approves or rejects
11. If rejected by Supervisor: student sees notes, corrects, resubmits
12. If approved by Supervisor: case goes to Implant In-Charge
13. In-Charge reviews → approves or rejects
14. If In-Charge approves → **Phase 2 unlocks**

**Phase 2 — Implant Surgery**
1. Student fills surgical planning data and augmentation checklist (bone grafting plan if needed)
2. Uploads signed patient consent form
3. Documents pre-surgical assessments
4. Submits Phase 2
5. Supervisor reviews → may request edits → approves → submits to In-Charge
6. In-Charge approves → **Phase 3 unlocks**

**Phase 3 — Healing & Second Stage Surgery**
1. Student documents the healing period observations
2. Documents second stage surgery details
3. Records clinical findings
4. Uploads photos
5. Submits Phase 3
6. Supervisor reviews → approves → submits to In-Charge
7. In-Charge approves → **Phase 4 unlocks**

**Phase 4 — Prosthetic Rehabilitation**
1. Student documents prosthetic rehabilitation steps
2. Records impressions, abutment selection, crown/prosthesis placement
3. Submits Phase 4 Step 1 → then Step 2
4. Supervisor approves → In-Charge gives final approval
5. Case status changes to **Complete**
6. Student exports full PDF case report

---

### Role 4: Nurse

**Who uses this:** Clinical nurse supporting the implant team. No clinical case decisions.

#### What they can see
- Scheduled cases list and surgery calendar
- Phase 1 patient information only (name, scheduled date, basic info)
- Cannot see Phase 2, 3, or 4 clinical data

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Calendar + scheduled cases only |
| Cases | ✅ Read-only list |
| New Case | ❌ Hidden |
| Implant Library | ❌ Hidden |
| Alerts & Notifications | ✅ |
| Forum | ❌ |
| Archived Cases | ❌ |

#### What they can do
- View surgical calendar and upcoming appointments
- See which cases are scheduled for surgery on which dates
- Upload signed patient consent forms to a case
- Mark surgical instruments as autoclaved (sterilisation record)
- Receive push notification reminders before scheduled surgeries
- View basic patient info for surgical preparation purposes

#### What they cannot do
- Create cases
- Edit any clinical data
- View Phase 2, 3, or 4 data
- Approve or reject anything
- Access forum, archive, user management, implant catalog

---

## Dental Clinic App — Detailed Role Workflows

> All workflows are identical to the College App. Role names are different and the Student role does not exist. Dentist fills the Supervisor role — creates cases and submits each phase to the Chief Dentist for approval.

---

### Role 1: Chief Dentist / Owner / Admin

**Identical to Implant In-Charge in the College App.**

**Who uses this:** The clinic owner or most senior dentist overseeing all cases.

#### Key privilege: Self-Approved
Cases created by the Chief Dentist are self-approved — no other approval needed.

#### Edit History
All edits to any case are automatically saved in edit history.

#### What they can see
- Every case in the clinic
- Full patient data across all 4 phases
- All staff accounts
- Full activity and audit history

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Full view — all pending approvals, clinic activity |
| New Case | ✅ (self-approved) |
| Implant Library | ✅ Full access — add/edit/delete |
| My Cases | ✅ All clinic cases |
| Alerts & Notifications | ✅ |
| User Management | ✅ |
| Archived Cases | ✅ |
| Implant Database | ✅ Full edit access |
| Forum & Discussion | ✅ |
| Group Chat | ✅ Can create open or closed group chats |
| What's New | ✅ |
| Audit Log | ✅ |

#### What they can do
- Create and manage any case — self-approved
- View and edit any case from any dentist, at any phase, at any time
- All edits recorded in edit history automatically
- Approve or reject case submissions at every phase
- Add/edit/remove implants from catalog
- Add/remove staff accounts, change roles
- Archive and restore cases
- Export case PDF reports
- Use all AI features
- Send notifications to dentists

#### Approval Responsibilities

| Phase Submission | Action Required |
|-----------------|----------------|
| Dentist submits Phase 1 | Review → Approve or Reject → Phase 2 unlocks |
| Dentist submits Phase 2 | Review → Approve or Reject → Phase 3 unlocks |
| Dentist submits Phase 3 | Review → Approve or Reject → Phase 4 unlocks |
| Dentist submits Phase 4 | Final approval → Case Complete |

---

### Role 2: Dentist / Consultant

**Identical to Supervisor in the College App.**

**Who uses this:** Associate dentists or consultants managing their own patient cases.

#### What they can see
- Their own patient cases
- Cases assigned to them by the Chief Dentist

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Own cases summary |
| New Case | ✅ |
| Implant Library | ✅ Read-only |
| My Cases | ✅ Own cases |
| Alerts & Notifications | ✅ |
| Archived Cases | ✅ |
| Implant Database | ✅ Read-only |
| Forum & Discussion | ✅ |
| Group Chat | ✅ Can create open or closed group chats |
| What's New | ✅ |
| User Management | ❌ |

#### What they can do
- Create and manage their own patient cases
- Fill all 4 phases of the case workflow
- Submit each phase to Chief Dentist for approval
- Upload consent forms, case photos, CBCT scans
- Use all AI features — Smart Planner, Ask Implanr, ImplantLens
- Export case PDF reports
- View drilling protocols
- Schedule case appointments

#### What they cannot do
- View other dentists' cases
- Give final approval (Chief Dentist must approve every phase)
- Add or remove staff accounts
- Edit the implant catalog

#### Full Case Workflow (Dentist's perspective)

**Phase 1 — Diagnosis & Treatment Planning**
1. Dentist creates new case, selects procedure type
2. Enters patient details, arch, missing teeth, bone dimensions
3. AI Smart Planner suggests implants per site
4. Dentist reviews, adjusts if needed
5. Drilling protocol auto-generates
6. Submits Phase 1 to Chief Dentist
7. Chief Dentist approves or rejects
8. If approved → **Phase 2 unlocks**

**Phase 2 — Implant Surgery**
1. Dentist fills surgical planning and augmentation checklist
2. Uploads consent form and pre-surgical data
3. Submits Phase 2 to Chief Dentist
4. Chief Dentist approves → **Phase 3 unlocks**

**Phase 3 — Healing & Second Stage Surgery**
1. Dentist documents healing period and second stage surgery
2. Uploads photos
3. Submits Phase 3 to Chief Dentist
4. Chief Dentist approves → **Phase 4 unlocks**

**Phase 4 — Prosthetic Rehabilitation**
1. Dentist documents prosthetic steps
2. Submits Phase 4 Step 1 → Step 2
3. Chief Dentist gives final approval
4. Case marked **Complete** — PDF available for export

---

### Role 3: Dental Assistant

**Identical to Nurse in the College App.**

**Who uses this:** Clinical assistant supporting the dental team.

#### What they can see
- Scheduled cases calendar and upcoming appointments
- Phase 1 basic patient info (name, scheduled date)
- Cannot see Phase 2, 3, 4 clinical data

#### Navigation & Screens Available
| Section | Access |
|---------|--------|
| Home Dashboard | Calendar + upcoming appointments |
| Cases | ✅ Read-only list |
| New Case | ❌ Hidden |
| Implant Library | ❌ Hidden |
| Alerts & Notifications | ✅ |

#### What they can do
- View surgery calendar and upcoming scheduled procedures
- Upload signed patient consent forms
- Mark instruments as autoclaved
- Receive pre-surgery reminder notifications

#### What they cannot do
- Create or edit cases
- View any clinical phase data
- Approve or reject anything
- Access user management, implant catalog, or admin screens

---

## Full Comparison: All Roles

| Capability | Implant In-Charge | Supervisor | Student | Nurse | Chief Dentist | Dentist | Dental Assistant |
|-----------|:-----------------:|:----------:|:-------:|:-----:|:-------------:|:-------:|:----------------:|
| Create cases | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Self-approved | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View all cases | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View own/assigned cases | ✅ | ✅ | Own only | View only | ✅ | ✅ | View only |
| Approve at any phase | ✅ Independent | ✅ Independent | ❌ | ❌ | ✅ Independent | ❌ | ❌ |
| Edit any case | ✅ | Own + assigned | Own only | ❌ | ✅ | Own only | ❌ |
| Edit history tracked | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Edit implant catalog | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View implant catalog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI features | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Export PDF | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Upload consent form | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload photos / CBCT | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Discussion Forum | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Group Chat | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| What's New changelog | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Student analytics | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Archive cases | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Mark instruments | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Surgery calendar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Key Differences: College App vs Clinic App

| Feature | College App | Clinic App |
|---------|-------------|------------|
| Student role | ✅ Present | ❌ Not applicable |
| Approval chain | Student → (Supervisor + In-Charge independently) | Dentist → Chief Dentist |
| Approval configurable | ✅ Both required / Supervisor only / In-Charge only | ✅ Same |
| Role names | Implant In-Charge, Supervisor, Student, Nurse | Chief Dentist, Dentist, Dental Assistant |
| Student progress analytics | ✅ In-Charge + Supervisor | ❌ Not applicable |
| Discussion Forum | ✅ All roles except Nurse | ✅ All roles except Dental Assistant |
| Group Chat | ✅ All roles except Nurse | ✅ All roles except Dental Assistant |
| What's New changelog | ✅ All roles except Nurse | ✅ All roles except Dental Assistant |
| Cross-app switching | ✅ College user can access Clinic context from profile | ✅ Clinic user can access College context from profile |
| All 4 phases | ✅ Identical | ✅ Identical |
| AI features | ✅ Identical | ✅ Identical |
| Implant catalog | ✅ Identical | ✅ Identical |
| PDF export | ✅ Identical | ✅ Identical |
| Edit history | ✅ Identical | ✅ Identical |
| HIPAA compliance features | ✅ Identical | ✅ Identical |

---

## Notification & Alert System

All roles receive targeted notifications relevant to their responsibilities:

| Event | Who gets notified |
|-------|------------------|
| Case submitted for review | Supervisor + Implant In-Charge notified simultaneously |
| Supervisor approves | In-Charge notified (if not yet approved) |
| In-Charge approves | Supervisor notified (if not yet approved) |
| Both approved | Phase unlocks — case creator notified |
| Case approved (phase unlocked) | Case creator |
| Case rejected at any phase | Case creator (with rejection notes) |
| Edit request raised | Relevant party |
| Pre-surgery reminder | Nurse / Dental Assistant + operating dentist |
| Nudge from In-Charge | Supervisor / Dentist |
| New forum activity | All forum participants |
| Session timeout (15-min inactivity) | Current logged-in user |

---

## Security & Compliance Features (Both Apps)

- **15-minute auto-logout** — session expires after 15 minutes of inactivity on any shared device
- **Screenshot prevention** — HIPAA-compliant screen capture blocking on iOS and Android
- **Audit trail** — every action logged with user identity, timestamp, and case reference
- **Edit history** — every case edit automatically recorded, viewable by In-Charge / Chief Dentist
- **Encrypted data in transit** — HTTPS enforced across all API communications
- **Role-based data isolation** — users can only access data their role permits
- **Token-based authentication** — secure login with automatic silent token refresh
