# Backlog

Open follow-ups that are known but not built yet. Keep entries short and dated; move an entry to the release notes once it ships.

Older ideas and environment notes live in `memory/BACKLOG.md`.

---

## Free management viewer role (Dean, Principal, HOD)
**Saved**: 26 Oct 2026
**Priority**: P1 (part of the college rate card)
**Context**: The college rate card ("Implanr Subscription Plans.xlsx") gives every college up to 3 free, read-only management viewers who see the dashboards and reports. The app has no read-only role yet, so today a Dean would have to be added as an admin or supervisor (and use a paid seat with edit rights).

**To build**:
- New role `management_viewer` for colleges: read-only access to the college and unit dashboards, analytics and case reports; no case edits, approvals or user management.
- Limit of 3 per college, not counted against licence seats (`role_caps` in `backend/college_licensing.py`).
- Add it to user creation and the roles list; hide every write action in the app for this role and block writes on the server.

---

## Separate intern and fellow roles (observing interns stay free)
**Saved**: 26 Oct 2026
**Priority**: P1 (seat counting is wrong without it)
**Context**: Fellows and interns use the `student` role. The pooled student limit for a licensed college = PG capacity + fellows + interns on the Intern Programme, so every intern added as a user takes a seat, including interns who only observe or assist, which the rate card says are free.

**To build**:
- Roles (or a `student_type` on the student role): `pg_student`, `fellow`, `intern_placing`, `intern_observer`.
- Count each against its own limit: PG seats from licences, fellows from the fellows add-on, placing interns from the Intern Programme tier; observing interns uncounted.
- Observing interns: view cases and be logged as assistant only; no own cases.
- Update `derive_caps` in `backend/college_licensing.py` and `_assert_role_cap` in `backend/server.py`.

---

## Enforce Solo plan's admin dashboard and analytics level
**Saved**: 26 Oct 2026
**Priority**: P2
**Context**: The Solo clinic plan excludes the clinic admin dashboard and gets "Basic" analytics (Clinic: Standard, Specialist/Enterprise: Full). These are stored on the plan (`features.admin_dashboard`, `features.analytics`) but not enforced. AI planning, lab prescriptions, data export and the 25 cases/month cap are already enforced.

**To build**:
- Define what Basic / Standard / Full analytics include (which screens and reports).
- Gate the admin dashboard and analytics endpoints with `_assert_org_feature` on the server, and hide the entry points in the app for orgs whose plan switches them off.

---

## Next iOS submission: App Store Connect version + reviewer note
**Saved**: 26 Oct 2026
**Priority**: P0 (needed for the next App Review)
**Context**: Apple rejected 1.3.3 (47) under Guideline 3.1.1. Build 1.3.6 (48) makes the iOS app sign-in only for institution members: no registration, trials, pricing or upgrade requests; new institutions use "Request Access".

**Steps**:
1. In App Store Connect, create the new version as **1.3.6** so it matches the build.
2. In App Review Information → Notes, add:

```
Implanr is licensed only to institutions (dental colleges and clinics) for their staff and
students (Guideline 3.1.3(c)). Institutions are quoted, invoiced and set up directly by our
team outside the app. The iOS app is sign-in only for their members and contains no
registration, pricing, trials or purchase options. A new institution can tap "Request Access"
to leave its contact details; our team then contacts it — no account or purchase is created
in the app. Demo account: [username / password].
```

3. Fill in the demo account before submitting.
