# Implanr — Testing Guide

Step-by-step manual testing for every role. Follow in order. Each section builds on the previous.

---

## Part 1 — Start Backend and Apps

### 1.1 Start Backend

```bash
cd /Users/prathmeshjadhav/Desktop/work/implant-planner-v1/phase1/backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Verify:** Open `http://localhost:8001/api/health/db-status` in browser.
Expected: `{"status":"ok", "users": {"total": 21}, ...}`

If users total is 0, Atlas connection failed — check `.env` MONGO_URL.

---

### 1.2 Start College App

```bash
cd /Users/prathmeshjadhav/Desktop/work/implant-planner-v1/phase1/implanr-college
npx expo start --lan --port 3000
```

Press `i` for iOS Simulator or `a` for Android emulator.

**Backend URL:** `.env.local` must have `EXPO_PUBLIC_BACKEND_URL=http://localhost:8001`
On physical device, replace `localhost` with your Mac IP (`ipconfig getifaddr en0`).

---

### 1.3 Start Clinic App (separate terminal)

```bash
cd /Users/prathmeshjadhav/Desktop/work/implant-planner-v1/phase1/implanr-clinic
npx expo start --lan --port 3001
```

---

### 1.4 Test Login Works

Open College App → tap Sign In.

| Role              | Email                              | Password         |
| ----------------- | ---------------------------------- | ---------------- |
| Implant Admin     | `admin@implanr.com`                | `Implanr#2026`   |
| Implant In-Charge | `Abhijit.patil@dental.edu`         | `Admin@123`      |
| Supervisor        | `Paresh.gandhi@dental.edu`         | `Supervisor@123` |
| Student           | `Gaurav.pandey@student.dental.edu` | `Student@123`    |
| Nurse             | `Nurse.1@dental.edu`               | `Nurse@123`      |

Login should succeed and land on dashboard. If it fails, check backend terminal for errors.

---

## Part 2 — College App Testing

### Test all roles in this order: Implant In-Charge → Supervisor → Student → Nurse

---

## Role 1: Implant In-Charge

**Login:** `Abhijit.patil@dental.edu` / `Admin@123`

### Dashboard

- [ ] Dashboard loads with pipeline stats at top
- [ ] Pending approvals section visible
- [ ] Student leaderboard visible
- [ ] Quick Actions row 1: New Case, All Cases, Users, Implants
- [ ] Quick Actions row 2: Students, Supervisors, Audit Log, Implant DB
- [ ] Surgery calendar visible

### User Management

- [ ] Tap Users button → User Management screen opens
- [ ] Can see all users listed
- [ ] Tap Add User → form opens with role dropdown
- [ ] Role dropdown shows: Implant In-Charge, Supervisor, Student, Auxiliary Staff

### Student Analytics

- [ ] Tap Students (Quick Actions row 2) → opens students-analytics screen
- [ ] All students listed with KPI cards (Total, Active, Done, Rate)
- [ ] Tap any student card → opens individual student summary

### Supervisor Summaries

- [ ] Tap Supervisors (Quick Actions row 2) → opens supervisors-analytics screen
- [ ] All supervisors listed with KPI cards + stale badge if reviews overdue
- [ ] Tap any supervisor card → opens individual supervisor summary

### Implant Catalog

- [ ] Tap Implant DB → implant catalog opens
- [ ] Edit button visible (only for In-Charge)
- [ ] Tap edit → can modify implant entries

### Create a Case (Self-Approved)

- [ ] Tap New Case
- [ ] Fill patient details (any test name and details)
- [ ] Supervisor dropdown shows all supervisors
- [ ] In-Charge dropdown shows In-Charge users
- [ ] Select yourself as both Supervisor AND In-Charge
- [ ] Submit Phase 1
- [ ] Case should auto-approve (status jumps to `phase1_approved`) without waiting
- [ ] Phase 2 button becomes available immediately

### Approve a Student Case

- [ ] Go to Procedures → see all cases in system
- [ ] Find a case with status `pending_phase1` (need student to submit first — do Student testing first if no cases exist)
- [ ] Open case → Approve button visible
- [ ] Tap Approve → phase unlocks

### Nudge

- [ ] Go to Supervisors analytics → tap a supervisor → Nudge button visible
- [ ] Tap Nudge → NudgeBottomSheet opens with message templates
- [ ] Select template, send → success message shows
- [ ] Go to Students analytics → tap a student → Nudge button visible

### Audit Log

- [ ] Tap Audit Log (Quick Actions) → access log entries visible

### AI Features

- [ ] Open any case → AI Summary button visible at bottom
- [ ] Ask Implanr FAB (bottom-right floating button) visible on dashboard

### Archived Cases

- [ ] Tap Archived Cases tab → archived cases visible

### Forum

- [ ] Tap Forum → loads thread list or empty state
- [ ] Forum tab accessible

### What's New

- [ ] Tap Profile → What's new link visible
- [ ] Tap it → changelog screen loads

---

## Role 2: Supervisor

**Login:** `Paresh.gandhi@dental.edu` / `Supervisor@123`

### Dashboard

- [ ] Dashboard shows: To Review, Approved, Total, Rate stat cards
- [ ] Pending approvals list shows only cases assigned to this supervisor
- [ ] Student leaderboard shows only assigned students
- [ ] Quick Actions: New Case, All Cases, My Students, Implants

### Case Scoping (critical)

- [ ] Go to My Cases → only own cases + assigned student cases visible
- [ ] Cannot see cases belonging to other supervisors
- [ ] **Negative test:** Manually type another supervisor's student case URL `/procedures/<id>` — should get access denied or not found

### Student Analytics (scoped)

- [ ] Tap My Students (Quick Actions) → students-analytics screen
- [ ] Only shows students whose cases are assigned to this supervisor
- [ ] NOT all students in system

### Create Own Case

- [ ] Tap New Case
- [ ] Fill details, select In-Charge from dropdown
- [ ] Submit Phase 1 → case goes to In-Charge for approval (supervisor doesn't self-approve)

### Review Student Case

- [ ] Requires a student to submit a case first (do Student section below, then come back)
- [ ] Go to My Cases → find pending student case
- [ ] Open case → Approve button visible
- [ ] Tap Approve → case moves to In-Charge queue (not fully approved yet)
- [ ] OR tap Reject → rejection notes field appears → enter reason → confirm
- [ ] Request Edit option → enter edit instructions → student gets notification

### Implant Library

- [ ] Tap Implant Library tab → loads
- [ ] Edit button NOT visible (read-only for supervisor)

### User Management

- [ ] Tap Profile → no User Management option
- [ ] **Negative test:** Try `/user-management` URL — should be inaccessible or show no data

### Audit Log

- [ ] **Negative test:** No audit log access from profile or quick actions

### AI Features

- [ ] Ask Implanr FAB visible
- [ ] Open a case → AI Summary button visible

### Forum

- [ ] Forum tab accessible, can post replies

### Archived Cases

- [ ] Archived Cases tab accessible

---

## Role 3: Student

**Login:** `Gaurav.pandey@student.dental.edu` / `Student@123`

### Dashboard

- [ ] Shows own cases summary and upcoming appointments
- [ ] No admin stats (no pipeline, no student leaderboard)

### Case Scoping (critical)

- [ ] My Cases → only own cases visible
- [ ] **Negative test:** Try URL of another student's case → access denied

### Create New Case — Full Phase 1 Flow

- [ ] Tap New Case
- [ ] Supervisor dropdown shows: Dr. Paresh Gandhi, Dr. Rajshree Jadhav, etc.
- [ ] In-Charge dropdown shows: Dr. Abhijit Patil, Dr. Ajay Sabane
- [ ] Select Dr. Paresh Gandhi as Supervisor, Dr. Abhijit Patil as In-Charge
- [ ] Fill patient name, age, sex, registration number, chief complaint
- [ ] Select arch, mark missing teeth on tooth map
- [ ] Fill bone dimensions (height, width, density)
- [ ] Smart Planner section loads implant suggestions
- [ ] Drilling protocol auto-generates
- [ ] Save as draft OR tap Submit Phase 1
- [ ] After submit: status = `pending_phase1`, case is locked for editing

### Phase Lock Verification

- [ ] Open submitted case → edit fields should be locked (no edit controls)
- [ ] Status shows "Pending Supervisor Approval"

### AI Safety Override

- [ ] In Smart Planner, if AI flags a warning/block on an implant, override option appears
- [ ] Tap Override → safety acknowledgment dialog → confirm → implant accepted

### After Supervisor Approves (come back after Supervisor testing)

- [ ] Case status changes to "Waiting for In-Charge Approval"
- [ ] After In-Charge approves: Phase 2 button appears

### Phase 2 Submit

- [ ] Fill augmentation checklist, upload consent form
- [ ] Fill surgical planning data
- [ ] Submit Phase 2 → goes to Supervisor review

### What Happens if Rejected

- [ ] If supervisor rejects: case returns, rejection notes visible
- [ ] Can edit and resubmit

### Cannot Approve

- [ ] **Negative test:** No approve/reject button on any case

### No User Management

- [ ] **Negative test:** No user management access

### AI Features

- [ ] Ask Implanr FAB visible
- [ ] AI Summary button visible on case

### Forum Access

- [ ] Forum tab visible, can view and post

---

## Role 4: Nurse

**Login:** `Nurse.1@dental.edu` / `Nurse@123`

### Dashboard (critical — most restrictions here)

- [ ] Dashboard shows: NurseHomeCalendar, PatientConsent section, ScheduledCases
- [ ] NO student leaderboard
- [ ] NO pipeline stats
- [ ] NO quick action buttons (New Case, Implants, etc.)

### Tab Bar

- [ ] New Case tab: HIDDEN (not in tab bar)
- [ ] Implant Selection tab: HIDDEN
- [ ] Cases tab: visible but labeled "Cases" (not "My Cases")

### Cases List

- [ ] Tap Cases tab → see only cases in approved/surgical phase
- [ ] Open a case → can see Phase 1 info (patient name, date)
- [ ] Phase 2, 3, 4 clinical sections: NOT visible

### Consent Form Upload

- [ ] From dashboard consent section or case detail
- [ ] Upload button visible for consent form → can upload PDF/image
- [ ] Consent upload succeeds

### Mark Instruments Autoclaved

- [ ] In ScheduledCasesSection on dashboard → cases with surgery dates listed
- [ ] "Mark instruments autoclaved" toggle visible
- [ ] Toggle → marked successfully
- [ ] Toggle again to unmark

### Blocked Features

- [ ] **Negative test:** No Forum tab or option anywhere
- [ ] **Negative test:** Tap Profile → What's new link NOT visible
- [ ] **Negative test:** No Archived Cases access
- [ ] **Negative test:** Ask Implanr FAB NOT visible on any screen
- [ ] **Negative test:** Open a case → no Export PDF button
- [ ] **Negative test:** No AI Summary button on case

---

## Part 3 — Full Case Workflow Test (End-to-End)

This test runs across 3 logins sequentially to verify the full approval chain.

### Setup

Use three devices or three simulators, OR log in and out sequentially.

**Users:**

- Student: `Gaurav.pandey@student.dental.edu` / `Student@123`
- Supervisor: `Paresh.gandhi@dental.edu` / `Supervisor@123`
- In-Charge: `Abhijit.patil@dental.edu` / `Admin@123`

---

### Step 1 — Student creates and submits Phase 1

1. Log in as Student
2. New Case → select Dr. Paresh Gandhi (Supervisor), Dr. Abhijit Patil (In-Charge)
3. Fill all required fields (patient name: "Test Patient", age: 35, registration: "TEST001", etc.)
4. Submit Phase 1
5. **Verify:** Case status = `pending_phase1`
6. **Verify:** Fields are now locked (no edit controls visible)

---

### Step 2 — Supervisor approves Phase 1

1. Log in as Supervisor (Dr. Paresh Gandhi)
2. Dashboard → pending approvals shows the Test Patient case
3. Open case → Approve button visible
4. Tap Approve (optionally add a comment)
5. **Verify:** Case status = waiting for In-Charge
6. **Verify:** Student gets notification "Phase 1: Approved by Dr. Paresh Gandhi. Waiting for implant incharge approval"

---

### Step 3 — In-Charge gives final approval

1. Log in as In-Charge (Dr. Abhijit Patil)
2. Dashboard → pending approvals shows the case
3. Open case → Approve button visible
4. Tap Approve
5. **Verify:** Case status = `phase1_approved`
6. **Verify:** Student gets notification "Phase 1 approved! You can now submit Phase 2"

---

### Step 4 — Student submits Phase 2

1. Log in as Student
2. Open case → Phase 2 section now active
3. Fill surgical planning, augmentation checklist
4. Upload consent form (any image/PDF)
5. Submit Phase 2
6. **Verify:** Case status = `pending_phase2`

---

### Step 5 — Supervisor + In-Charge approve Phase 2

Repeat Steps 2 and 3 for Phase 2. Case moves to Phase 3.

---

### Step 6 — Continue through Phase 3 and Phase 4

Repeat the same pattern. After Phase 4 Step 2 In-Charge final approval:

- **Verify:** Case status = `completed`
- **Verify:** Export PDF button appears for student, supervisor, and in-charge
- **Verify:** Nurse cannot see Phase 2/3/4 data even on completed case

---

## Part 4 — Clinic App Testing

### Login Credentials

No seeded clinic users exist by default. Create them via the backend or use the clinic signup flow.

For quick testing, register directly:

```bash
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Chief Test","email":"chief@clinic.com","password":"Test@123","role":"chief_dentist"}'

curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Dentist Test","email":"dentist@clinic.com","password":"Test@123","role":"dentist"}'

curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Assistant Test","email":"assistant@clinic.com","password":"Test@123","role":"dental_assistant"}'
```

---

### Role: Chief Dentist

**Login:** `chief@clinic.com` / `Test@123`

- [ ] Dashboard loads (no student sections)
- [ ] New Case → Case Assignment shows single "Chief Dentist" picker (not supervisor + incharge)
- [ ] Create case → select another Chief Dentist or yourself
- [ ] Self-approval: create case, select yourself as Chief Dentist → approve → phase unlocks immediately
- [ ] Can see all cases in clinic
- [ ] User Management accessible
- [ ] AI features accessible
- [ ] Audit Log accessible

---

### Role: Dentist

**Login:** `dentist@clinic.com` / `Test@123`

- [ ] New Case → Case Assignment shows "Chief Dentist" picker only (no separate supervisor picker)
- [ ] Select Chief Dentist from picker
- [ ] Submit case → goes to Chief Dentist for single-step approval
- [ ] After Chief Dentist approves → Phase 2 unlocks (NO intermediate supervisor approval needed)
- [ ] Can edit own cases (created_by_id matches)
- [ ] Cannot see other dentists' cases
- [ ] **Negative test:** No approval button on cases
- [ ] **Negative test:** No User Management

---

### Role: Dental Assistant

**Login:** `assistant@clinic.com` / `Test@123`

- [ ] Dashboard shows calendar + consent section + scheduled cases
- [ ] New Case tab: HIDDEN
- [ ] Forum tab: NOT accessible
- [ ] Archived Cases: blocked (lock screen shown)
- [ ] What's New: NOT visible in profile
- [ ] AI FAB: NOT visible
- [ ] Mark instruments toggle: visible and works
- [ ] Consent form upload: works

---

## Part 5 — Negative Tests Summary

These should all fail or show blocked screen:

| Action                           | Role                       | Expected                                        |
| -------------------------------- | -------------------------- | ----------------------------------------------- |
| Access Forum                     | Nurse                      | Blocked screen "Forum not available for nurses" |
| Access Forum                     | Dental Assistant           | Blocked screen                                  |
| Access Archived Cases            | Nurse                      | Lock screen                                     |
| Access Archived Cases            | Dental Assistant           | Lock screen                                     |
| Access What's New                | Nurse                      | Lock screen                                     |
| Access What's New                | Dental Assistant           | Lock screen                                     |
| See Ask Implanr FAB              | Nurse                      | FAB not rendered                                |
| See Ask Implanr FAB              | Dental Assistant           | FAB not rendered                                |
| Call POST /api/ai/assistant      | Nurse (via API)            | HTTP 403                                        |
| Call POST /api/uploads/cbct-temp | Nurse (via API)            | HTTP 403                                        |
| Call POST /api/uploads/cbct-temp | Dental Assistant (via API) | HTTP 403                                        |
| Edit implant catalog             | Supervisor                 | Edit button hidden                              |
| Edit implant catalog             | Student                    | Edit button hidden                              |
| Access User Management           | Supervisor                 | No access                                       |
| Access User Management           | Student                    | No access                                       |
| Access Audit Log                 | Supervisor                 | No access                                       |
| Access Audit Log                 | Student                    | No access                                       |
| View another student's case      | Student                    | Not in list, URL gives error                    |
| View unassigned case             | Supervisor                 | Not in list                                     |
| Approve a case                   | Student                    | No approve button                               |
| Approve a case                   | Nurse                      | No approve button                               |
| Export PDF                       | Nurse                      | Export button hidden                            |
| Export PDF                       | Dental Assistant           | Export button hidden                            |

---

## Part 6 — Backend Health Checks

Verify these URLs after backend starts:

```
http://localhost:8001/                        → {"status":"ok"}
http://localhost:8001/api/health              → {"status":"ok"}
http://localhost:8001/api/health/db-status    → user count, implant count
```

Check MongoDB Atlas connection from backend terminal output:

```
INFO: MongoDB connection verified.
INFO: User sync complete: 21 checked, N new users added.
```

---

## Credentials Reference

### College App

| Role                | Email                                  | Password         |
| ------------------- | -------------------------------------- | ---------------- |
| Implant In-Charge   | `Abhijit.patil@dental.edu`             | `Admin@123`      |
| Implant In-Charge 2 | `Ajay.sabane@dental.edu`               | `Admin@123`      |
| Supervisor          | `Paresh.gandhi@dental.edu`             | `Supervisor@123` |
| Supervisor          | `Rajshree.jadhav@dental.edu`           | `Supervisor@123` |
| Supervisor          | `Vasantha.n@dental.edu`                | `Supervisor@123` |
| Supervisor          | `Rupali.patil@dental.edu`              | `Supervisor@123` |
| Supervisor          | `Pankaj.kadam@dental.edu`              | `Supervisor@123` |
| Student             | `Gaurav.pandey@student.dental.edu`     | `Student@123`    |
| Student             | `Atharva.mahadik@student.dental.edu`   | `Student@123`    |
| Student             | `Anand.kurum@student.dental.edu`       | `Student@123`    |
| Student             | `Yashica.jain@student.dental.edu`      | `Student@123`    |
| Student             | `Vaibhav.deshpande@student.dental.edu` | `Student@123`    |
| Student             | `Manasi.dhiren@student.dental.edu`     | `Student@123`    |
| Student             | `Renuka.bodakhe@student.dental.edu`    | `Student@123`    |
| Nurse               | `Nurse.1@dental.edu`                   | `Nurse@123`      |
| Nurse               | `Nurse.2@dental.edu`                   | `Nurse@123`      |

### Clinic App

| Role             | Email                  | Password   |
| ---------------- | ---------------------- | ---------- |
| Chief Dentist    | `chief@clinic.com`     | `Test@123` |
| Dentist          | `dentist@clinic.com`   | `Test@123` |
| Dental Assistant | `assistant@clinic.com` | `Test@123` |

Clinic users must be created via API call (see Part 4 setup) — not seeded by default.

---

## Common Issues

**Login fails with "Email not registered"**
Backend seed didn't run. Check `http://localhost:8001/api/health/db-status` — if users=0, Atlas connection failed. Verify `.env` MONGO_URL.

**App shows blank screen after login**
Backend URL not set. Check `.env.local` in app directory has `EXPO_PUBLIC_BACKEND_URL=http://localhost:8001`.

**Case doesn't appear for Supervisor after Student submits**
Student selected wrong supervisor. Log in as In-Charge, check the case, verify supervisor_id matches.

**Phase doesn't unlock after both approvals**
Check backend terminal for errors. Most common: case was created with wrong supervisor_id (e.g. before the clinic fix, dentist set themselves as supervisor_id — old cases won't work with new logic).

**Clinic case stuck after Chief Dentist approves**
Old case created before the supervisor_id fix. Create a new test case in clinic app — new cases set both supervisor_id and implant_incharge_id to chief_dentist → single approval unlocks phase.

eas update --branch preview --message "iOS testing build"
eas build --platform android --profile production

EAS is already configured. Full guide:

Step 1 — Bump version (if needed)
In app.json, update:

"version": "1.0.1",
Also add versionCode for Android (Play Console requires incrementing integer every upload):

"android": {
"adaptiveIcon": { ... },
"package": "com.implanr.college",
"versionCode": 1
}
Step 2 — Build AAB for Play Store

cd phase1/implanr-college
eas build --platform android --profile production
This produces an .aab (Android App Bundle) — required by Play Console. Takes ~10-15 min on EAS servers.

Step 3 — Download the AAB
After build completes, EAS gives a download link. Download the .aab file.

<!-- create ios build and submit  -->

eas build --platform ios --profile production

eas submit --platform ios --latest

cd /opt/implant-backend/repo/backend

sudo systemctl restart implant-backend
sudo systemctl status implant-backend
