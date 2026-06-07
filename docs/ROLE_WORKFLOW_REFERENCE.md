# Implanr — Role-Based Workflow Reference

**Dental College App and Dental Clinic App**
**Version:** V2 — Reflects current codebase state

---

## Overview

Implanr is a role-based access system. Every user has one role assigned at account creation. That role determines what they can see, what they can do, and what requires approval from someone senior.

The core structure is a 4-phase case lifecycle. Every implant case goes through four phases from initial diagnosis to final prosthetic rehabilitation. Each phase must be submitted, reviewed, and approved before the next phase unlocks.

Both the College App and the Clinic App follow the same 4-phase workflow. The only differences are the role names and the removal of the Student role in the Clinic version.

---

## Apps and Role Mapping

| College App Role | Clinic App Role | Description |
|---|---|---|
| Implant In-Charge | Chief Dentist / Owner | Senior authority, final approver, full access |
| Supervisor | Dentist / Consultant | Mid-level, creates cases, first-level approver |
| Student (PG / UG / Fellow) | — | Case creator, submits to Supervisor |
| Nurse | Dental Assistant | Clinical support, no case decisions |

> **Note on Administrator role:** Administrator is not a role available to College or Clinic users. It is a top-level internal role used by the Implanr team to manage and maintain the platform across all institutions. Admins can access all data and settings but are not part of any institution's day-to-day workflow.

---

## The 4-Phase Case Lifecycle

```
Phase 1 — Diagnosis and Treatment Planning
Phase 2 — Implant Surgery
Phase 3 — Healing and Second Stage Surgery
Phase 4 — Prosthetic Rehabilitation (Step 1 + Step 2)
```

Each phase must be fully approved before the next one unlocks.

### College App Approval Chain (per phase)

```
Student submits
  → Supervisor reviews → Approves or Rejects
      → If approved: Supervisor submits to In-Charge
          → In-Charge reviews → Approves or Rejects
              → If approved: Next phase unlocks
```

Both Supervisor and In-Charge can approve simultaneously — neither is technically blocked waiting for the other. The Implant In-Charge can approve a case before the Supervisor approves, and the system will accept it. However, since the case is conducted directly under the Supervisor's guidance and the Supervisor is fully aware of the clinical details, the expected practice is that the In-Charge approves only after the Supervisor has reviewed and approved first. Both approvals must be present for the phase to unlock — the phase does not move forward until both are recorded.

**Special case:** If the same person is selected as both Supervisor and Implant In-Charge on a case, a single approval from that person triggers both approvals at once and the phase unlocks immediately.

### Clinic App Approval Chain (per phase)

```
Dentist submits
  → Chief Dentist reviews → Approves or Rejects
      → If approved: Next phase unlocks
```

Single-step approval. No intermediate approver. Chief Dentist is both reviewer and final approver.

### Special Case: Existing Implants Procedure

When procedure type is Existing Implants, Phase 2 is skipped entirely. After Phase 1 approval, the case moves directly to Phase 3 or Phase 4 depending on what was selected at case creation.

```
Phase 1 → (Phase 2 auto-skipped) → Phase 3 or Phase 4
```

### Self-Approved Cases

Cases created by Implant In-Charge or Chief Dentist are self-approved. Both supervisor and incharge approval flags are marked simultaneously when the creator approves. No waiting for anyone else.

---

## College App — Detailed Role Workflows

---

### Role 1: Implant In-Charge

The head of the implant department or senior faculty responsible for overseeing all cases.

**Key privilege:** Self-approved. Cases created by In-Charge skip the supervisor step and auto-approve when the In-Charge approves their own case.

**Edit history:** Every edit made to any case by anyone is saved to the case edit log. In-Charge can review the full edit trail at any time.

#### What In-Charge can see

- Every case in the system regardless of who created it
- Full patient data across all 4 phases
- All user accounts and full audit trail
- Student progress and supervisor performance summaries

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Full view — all pending approvals, recent activity, pipeline stats |
| New Case | Can create cases (self-approved) |
| Implant Library | Full access — add, edit, delete implant systems |
| My Cases | Sees all cases in system |
| Alerts and Notifications | Yes |
| User Management | Add, remove, edit users and change roles |
| Archived Cases | Yes |
| Forum | Yes |
| What's New | Yes |
| Student Profiles | View individual student progress |
| Supervisor Summaries | Yes |
| Audit Log | Yes |
| Implant Database | Full edit access |
| AI Features | Full access — Smart Planner, Ask Implanr, ImplantLens, AI Summary |

#### What In-Charge can do

- Create new patient cases — self-approved, no external approval needed
- View, edit, and manage any case at any phase at any time
- All edits automatically recorded in case edit history
- Approve or reject case submissions at every phase
- Add, edit, and remove implant systems from the catalog
- Add or remove users and change user roles
- Archive and restore cases, export full case PDF reports
- Use all AI features — Smart Planner, Ask Implanr, ImplantLens
- Send push notification nudges to supervisors and students
- View complete student progress analytics and supervisor summaries
- Review and resolve Phase 2 edit requests

#### Approval responsibilities

The In-Charge is the mandatory final approver at every phase. A phase does not unlock until In-Charge explicitly approves, even if Supervisor has already approved.

| Phase submission | Action required |
|---|---|
| Phase 1 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 2 unlocks |
| Phase 2 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 3 unlocks |
| Phase 3 submitted (after Supervisor approval) | Review → Approve or Reject → Phase 4 unlocks |
| Phase 4 Step 1 submitted | Review → Approve or Reject |
| Phase 4 Step 2 submitted | Final approval → Case marked Complete |

#### Dashboard layout

The In-Charge dashboard shows:

- Pipeline stats (how many cases in each phase across the institution)
- Pending approvals queue (cases waiting for In-Charge action)
- Student performance leaderboard with badges (Top Performer, Hot Streak, Needs Attention)
- Quick Actions row 1: New Case, All Cases, Users, Implants
- Quick Actions row 2: Students Analytics, Supervisors Summaries, Audit Log, Implant DB
- Surgery calendar
- Recent activity feed

---

### Role 2: Supervisor

Faculty members assigned to specific students, overseeing their cases across all 4 phases.

#### What Supervisor can see

- Their own cases (cases they created)
- Cases of students assigned to them
- Cannot see cases belonging to other supervisors' students

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Own activity + assigned student case summaries |
| New Case | Can create own cases |
| Implant Library | Read-only |
| My Cases | Own + assigned student cases |
| Alerts and Notifications | Yes |
| Archived Cases | Yes |
| Forum | Yes |
| What's New | Yes |
| Implant Database | Read-only |
| User Management | No |
| Audit Log | No |
| Student Analytics | Yes (scoped to their students only) |
| AI Features | Full access |

#### What Supervisor can do

- Create and manage their own patient cases
- Review and approve or reject student submissions at every phase
- Add review notes when approving or rejecting
- Request edits at any phase with specific instructions back to the student
- After approving, submit the case to In-Charge for final approval
- Upload consent forms, case photos, and CBCT scans
- Export case PDF reports and use all AI features
- Participate in the forum and schedule case appointments
- View drilling protocols for selected implants
- Send nudge notifications to assigned students
- View student analytics for their own supervised students

#### What Supervisor cannot do

- View or edit cases not assigned to them
- Give independent final approval — Supervisor approves first, then In-Charge approval is also required
- Add or remove users, edit implant catalog, or view audit logs

#### Approval workflow

```
Phase 1:
  Student submits → Supervisor reviews → Approves or Rejects
  If approved → Supervisor submits to In-Charge → In-Charge approves → Phase 2 unlocks

Phase 2:
  Student submits → Supervisor reviews → may request edits → Approves
  Supervisor submits to In-Charge → In-Charge approves → Phase 3 unlocks

Phase 3:
  Student submits → Supervisor reviews → Approves
  Supervisor submits to In-Charge → In-Charge approves → Phase 4 unlocks

Phase 4:
  Student submits → Supervisor reviews → Approves
  Supervisor submits to In-Charge → In-Charge final approval → Case Complete
```

#### Dashboard layout

Supervisor dashboard shows:

- Stat cards: To Review, Approved, Total, Rate
- Phase pipeline (how many of their cases are in each phase)
- Pending approval queue (cases needing supervisor action)
- Student leaderboard for assigned students
- Quick Actions: New Case, All Cases, My Students, Implants
- Surgery calendar
- Recent activity widget

---

### Role 3: PG Student / UG Student / Fellow

Postgraduate or undergraduate dental students conducting implant cases under faculty supervision.

All three sub-roles (Postgraduate Student, Undergraduate Student, Fellow) have identical permissions inside the app. The sub-role is stored for record-keeping and display only.

#### What Student can see

- Only their own cases
- Cannot see any other student's cases

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Own cases summary, upcoming appointments |
| New Case | Can create cases |
| Implant Library | Read-only |
| My Cases | Own cases only |
| Alerts and Notifications | Yes |
| Archived Cases | Yes |
| Forum | Yes |
| What's New | Yes |
| Implant Database | Read-only |
| User Management | No |
| Audit Log | No |
| AI Features | Full access |

#### What Student can do

- Create new patient cases and select procedure type
- Select assigned Supervisor and Implant In-Charge from dropdown during case creation
- Fill all phase data across Phase 1 through Phase 4
- Use AI Smart Planner for implant suggestions per tooth site
- Override AI suggestions with a safety acknowledgment
- View auto-generated drilling protocols for selected implants
- Submit phases for approval up the chain
- Upload consent forms, case photos, and CBCT scans
- Request edits at any phase
- Use Ask Implanr AI
- Export case PDF once case is complete

#### What Student cannot do

- Edit a submitted phase (locked until approved or rejected)
- View other students' cases
- Approve or reject anything
- Manage users or catalog

#### Full case workflow — Phase by Phase

**Phase 1 — Diagnosis and Treatment Planning**

1. Create new case and select procedure type
2. Select assigned Supervisor and Implant In-Charge from dropdown
3. Enter patient details — name, age, registration number, medical history
4. Select arch and mark missing teeth on tooth map
5. Enter bone dimensions (height, width, density)
6. AI Smart Planner suggests implants per tooth site
7. Review and confirm — override with safety acknowledgment if needed
8. Drilling protocol auto-generates for chosen implants
9. Submit for Supervisor approval
10. If rejected: review notes, correct, and resubmit
11. If Supervisor approves: case goes to In-Charge for final approval
12. If In-Charge approves: Phase 2 unlocks

**Phase 2 — Implant Surgery**

1. Fill surgical planning data and augmentation checklist
2. Upload signed patient consent form
3. Document pre-surgical assessments and submit
4. Supervisor reviews → may request edits → approves → submits to In-Charge
5. In-Charge approves → Phase 3 unlocks

**Phase 3 — Healing and Second Stage Surgery**

1. Document healing period observations
2. Document second stage surgery details and clinical findings
3. Upload photos and submit
4. Supervisor reviews → approves → submits to In-Charge
5. In-Charge approves → Phase 4 unlocks

**Phase 4 — Prosthetic Rehabilitation**

1. Document prosthetic rehabilitation steps
2. Record impressions, abutment selection, crown or prosthesis placement
3. Submit Phase 4 Step 1 → Step 2
4. Supervisor approves → In-Charge gives final approval
5. Case status changes to Complete — export full PDF case report

---

### Role 4: Nurse

Clinical nurse supporting the implant team. No clinical case decisions.

#### What Nurse can see

- Scheduled cases list and surgery calendar
- Phase 1 patient information only (name, scheduled date, basic info)
- Cannot see Phase 2, 3, or 4 clinical data

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Calendar and scheduled cases only |
| Cases | Read-only list (Phase 1 info only) |
| New Case | Hidden |
| Implant Library | Hidden |
| Implant Selection | Hidden |
| Alerts and Notifications | Yes |
| Forum | No |
| Archived Cases | No |
| What's New | No |
| AI Features | No |
| PDF Export | No |
| User Management | No |
| Audit Log | No |

#### What Nurse can do

- View surgical calendar and upcoming appointments
- Upload signed patient consent forms to a case
- Mark surgical instruments as autoclaved
- Receive push notification reminders before scheduled surgeries
- View basic patient info for surgical preparation

#### What Nurse cannot do

- Create or edit cases
- View Phase 2, 3, or 4 data
- Approve or reject anything
- Use AI features
- Export PDF reports
- Access forum, archive, user management, or implant catalog
- Upload photos or CBCT scans (consent form upload is allowed)

#### Dashboard layout

Nurse dashboard shows:

- Surgery calendar with upcoming procedures
- Patient consent upload section (pending consent forms)
- Scheduled cases list for the day

---

## Clinic App — Detailed Role Workflows

All workflows are identical to the College App. Role names are different and the Student role does not exist. The Dentist fills the Supervisor role — creates cases and submits each phase to the Chief Dentist for approval.

---

### Role 1: Chief Dentist / Owner / Admin

The clinic owner or most senior dentist overseeing all cases. Identical to Implant In-Charge in the College App.

**Key privilege:** Self-approved. Cases created by Chief Dentist auto-approve without waiting for anyone else.

#### What Chief Dentist can see

- Every case in the clinic
- Full patient data across all 4 phases
- All staff accounts and full activity and audit history

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Full view — all pending approvals, clinic activity |
| New Case | Yes (self-approved) |
| Implant Library | Full access — add, edit, delete |
| My Cases | All clinic cases |
| Alerts and Notifications | Yes |
| User Management | Yes |
| Archived Cases | Yes |
| Implant Database | Full edit access |
| Forum | Yes |
| What's New | Yes |
| Audit Log | Yes |
| AI Features | Full access |

#### Approval responsibilities

| Phase submission | Action required |
|---|---|
| Dentist submits Phase 1 | Review → Approve or Reject → Phase 2 unlocks |
| Dentist submits Phase 2 | Review → Approve or Reject → Phase 3 unlocks |
| Dentist submits Phase 3 | Review → Approve or Reject → Phase 4 unlocks |
| Dentist submits Phase 4 | Final approval → Case marked Complete |

---

### Role 2: Dentist / Consultant

Associate dentists or consultants managing their own patient cases. Identical to Supervisor in the College App.

#### What Dentist can see

- Their own patient cases
- Cases assigned to them by the Chief Dentist
- Cannot see other dentists' cases

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Own cases summary |
| New Case | Yes |
| Implant Library | Read-only |
| My Cases | Own cases |
| Alerts and Notifications | Yes |
| Archived Cases | Yes |
| Implant Database | Read-only |
| Forum | Yes |
| What's New | Yes |
| User Management | No |
| AI Features | Full access |

#### Case creation workflow

When creating a case, the Dentist selects the Chief Dentist as the approving authority. Both `supervisor_id` and `implant_incharge_id` on the case are set to the Chief Dentist's ID. This triggers the single-step approval path — when Chief Dentist approves, both approval flags are marked at once and the phase unlocks immediately.

#### Full case workflow

**Phase 1 — Diagnosis and Treatment Planning**

1. Create new case and select procedure type
2. Select Chief Dentist from Case Assignment picker
3. Enter patient details, arch, missing teeth, bone dimensions
4. AI Smart Planner suggests implants per site — review and adjust if needed
5. Drilling protocol auto-generates
6. Submit Phase 1 to Chief Dentist
7. If approved → Phase 2 unlocks

**Phase 2 — Implant Surgery**

1. Fill surgical planning and augmentation checklist
2. Upload consent form and pre-surgical data
3. Submit to Chief Dentist — if approved → Phase 3 unlocks

**Phase 3 — Healing and Second Stage Surgery**

1. Document healing period and second stage surgery
2. Upload photos and submit to Chief Dentist
3. If approved → Phase 4 unlocks

**Phase 4 — Prosthetic Rehabilitation**

1. Document prosthetic steps and submit Phase 4 Step 1 → Step 2
2. Chief Dentist final approval → case marked Complete
3. Export full PDF case report

#### What Dentist cannot do

- View other dentists' cases
- Give final approval — Chief Dentist must approve every phase
- Add or remove staff accounts or edit the implant catalog

---

### Role 3: Dental Assistant

Clinical assistant supporting the dental team. Identical to Nurse in the College App.

#### What Dental Assistant can see

- Scheduled cases calendar and upcoming appointments
- Phase 1 basic patient info (name, scheduled date)
- Cannot see Phase 2, 3, or 4 clinical data

#### Screen access

| Screen | Access |
|---|---|
| Home Dashboard | Calendar and upcoming appointments |
| Cases | Read-only list |
| New Case | Hidden |
| Implant Library | Hidden |
| Alerts and Notifications | Yes |
| Forum | No |
| Archived Cases | No |
| What's New | No |
| AI Features | No |
| PDF Export | No |
| User Management | No |

#### What Dental Assistant can do

- View surgery calendar and upcoming scheduled procedures
- Upload signed patient consent forms
- Mark instruments as autoclaved
- Receive pre-surgery reminder notifications

#### What Dental Assistant cannot do

- Create or edit cases
- View any clinical phase data
- Approve or reject anything
- Use AI features
- Access user management, implant catalog, or admin screens

---

## Full Permissions Comparison

| Capability | In-Charge | Supervisor | Student | Nurse | Chief Dentist | Dentist | Dental Asst |
|---|---|---|---|---|---|---|---|
| Create cases | Yes | Yes | Yes | No | Yes | Yes | No |
| Self-approved | Yes | No | No | No | Yes | No | No |
| View all cases | Yes | No | No | No | Yes | No | No |
| View own/assigned | Yes | Yes | Own only | View only | Yes | Yes | View only |
| Approve at phase | Final | First | No | No | Final | No | No |
| Edit any case | Yes | Own + assigned | Own only | No | Yes | Own only | No |
| Edit history tracked | Yes | Yes | Yes | No | Yes | Yes | No |
| Manage users | Yes | No | No | No | Yes | No | No |
| Edit implant catalog | Yes | No | No | No | Yes | No | No |
| View implant catalog | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| AI features | Yes | Yes | Yes | No | Yes | Yes | No |
| Export PDF | Yes | Yes | Yes | No | Yes | Yes | No |
| Upload consent form | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Upload photos/CBCT | Yes | Yes | Yes | No | Yes | Yes | No |
| Forum | Yes | Yes | Yes | No | Yes | Yes | No |
| What's New | Yes | Yes | Yes | Only if update is relevant to their role | Yes | Yes | Only if update is relevant to their role |
| Audit log | Yes | No | No | No | Yes | No | No |
| Student analytics | Yes | Yes | No | No | No | No | No |
| Archive cases | Yes | Yes | Yes | No | Yes | Yes | No |
| Mark instruments | No | No | No | Yes | No | No | Yes |
| Surgery calendar | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

---

## College App vs Clinic App — Key Differences

| Feature | College App | Clinic App |
|---|---|---|
| Student role | Present | Not applicable |
| Approval chain | Student → Supervisor → In-Charge (all phases) | Dentist → Chief Dentist (all phases) |
| Role names | Implant In-Charge, Supervisor, Student, Nurse | Chief Dentist, Dentist, Dental Assistant |
| Administrator role | Not available to institution users — Implanr internal use only | Same |
| Student progress analytics | In-Charge and Supervisor | Not applicable |
| Discussion forum | All roles except Nurse | All roles except Dental Assistant |
| What's New changelog | All roles — including Nurse if the update is relevant to them | All roles — including Dental Assistant if the update is relevant to them |
| 4-phase workflow | Identical | Identical |
| AI features | Identical | Identical |
| Implant catalog | Identical | Identical |
| PDF export | Identical | Identical |
| Edit history | Identical | Identical |

---

## Notification and Alert System

| Event | Who gets notified |
|---|---|
| Case submitted for Supervisor review | Assigned Supervisor and Implant In-Charge simultaneously |
| Supervisor approves | Implant In-Charge notified (expected to review and give final approval) |
| In-Charge approves (phase unlocked) | Case creator notified |
| Case rejected at any phase | Case creator (with rejection notes) |
| Edit request raised | Relevant party |
| Pre-surgery reminder (T-24h and T-30min) | Nurse or Dental Assistant + operating dentist |
| Nudge from In-Charge | Supervisor or Dentist |
| New forum reply in thread | All watchers of that thread (in-app + push) |
| Mention in forum post | Mentioned user |
| Session timeout (15-min inactivity) | Current logged-in user |

---

## Security and Compliance

| Feature | Detail |
|---|---|
| Auto-logout | Session expires after 15 minutes of inactivity on any device |
| Screenshot prevention | iOS: preventScreenCaptureAsync. Android: FLAG_SECURE window flag. Both applied on app start |
| Audit trail | Every PHI-touching action logged with user identity, timestamp, and case reference. TTL: 180 days |
| Edit history | Every case edit automatically recorded in edit_log, viewable by In-Charge or Chief Dentist |
| Data in transit | HTTPS enforced across all API communications |
| Data isolation | Users can only access data their role permits |
| Authentication | JWT access token (15-min expiry) + refresh token (7-day expiry) with automatic silent refresh |
| Token blocklist | Logout invalidates token server-side via in-memory blocklist |
| Input sanitization | User inputs sanitized on backend — strips script injection characters |
| Rate limiting | Login endpoint rate-limited via SlowAPI |
| Patient anonymisation in Forum | When a case is shared to the Discussion Forum, the patient's name and registration number are hidden and displayed as anonymous. The clinical data (radiographs, treatment plan, phase details) is shared for peer discussion but no identifying information is exposed to other forum participants. |

---

## Backend Permission Enforcement

All role checks are enforced at the API layer in server.py, independent of the frontend. Key enforcement points:

**AI endpoints** (`/ai/*`) — blocked for `nurse` and `dental_assistant`. Returns HTTP 403.

**CBCT and media upload** (`/uploads/cbct-temp`, `/uploads/media-temp`, `/procedures/{id}/upload-cbct`) — blocked for `nurse` and `dental_assistant`.

**Consent form upload** (`/procedures/{id}/upload-consent`) — allowed for all roles including `nurse` and `dental_assistant`.

**Mark instruments autoclaved** (`/procedures/{id}/mark-instruments-autoclaved`) — restricted to `nurse` and `dental_assistant` only.

**ImplantLens** (`/implantlens/cases`) — blocked for `nurse` and `dental_assistant`.

**Approval endpoints** (`/procedures/{id}/approve`) — restricted to assigned Supervisor and In-Charge only. Students and nurses cannot approve.

**User management** (`/users`, `/users/{id}`) — restricted to `implant_incharge` and `administrator` only.

**Audit log / recent activity** (`/admin/recent-activity`) — restricted to `supervisor`, `implant_incharge`, and `administrator`.

**Student analytics** (`/admin/students`) — restricted to `implant_incharge`, `administrator`, and `supervisor`. Supervisor sees only their assigned students.

**Supervisor summaries** (`/admin/supervisors`) — restricted to `implant_incharge` and `administrator` only.

---

## Role Normalization — Clinic to College Mapping

The backend uses a single permission system written for college role names. Clinic role names are normalized at authentication time so all existing permission checks work without duplication.

```
chief_dentist    →  implant_incharge
dentist          →  supervisor
dental_assistant →  nurse
```

The original role name is preserved in `_original_role` on the user session object. API responses and database writes use the original clinic role names. Permission checks use the normalized college equivalents.

---

## Sub-Roles

Sub-roles provide additional classification within a role. They are stored on the user record and displayed on profiles but do not change permissions inside the app.

### College App Sub-Roles

**Student sub-roles:**
- Postgraduate Student
- Undergraduate Student
- Fellow

**Nurse sub-roles:**
- Dental Hygienist
- Nurse

### Clinic App Sub-Roles

**Dental Assistant sub-roles:**
- Nurse
- Receptionist

---

*This document reflects the current codebase state as of Role-Based Workflow Reference V2.*
