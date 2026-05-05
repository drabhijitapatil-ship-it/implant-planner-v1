# Implanr — Workspace Types & Sign-Up Workflow (Consolidated Reference)

> Source documents (Feb 2026):
> - `Sign-up_Registration_Process.docx` (user)
> - `Difference_in_Dental_College_Private_Dental_Clinic_Workflow.docx` (user)
> - Reviewer notes & enhancements (Implanr engineering)
>
> **Status: REFERENCE — not yet implemented.** Build will start when explicitly requested.
> **First implementation slice approved by user**: Consultant profile + referral flow (Phase 1 hand-off).

---

## 1. Three Workspace Types

Implanr supports three distinct workspace types, each created at public sign-up.
**A single human user, identified by a single email address, MAY hold accounts in all three workspace types simultaneously** (e.g., a dentist who teaches at a college, runs a private clinic, and visits other clinics as an implant consultant).

| Workspace | Top-level role | Use case |
|---|---|---|
| **Dental College** | Implant In-Charge | PG / UG / Fellow training programmes; hierarchical, approval-driven |
| **Dental Clinic** | Chief Dentist / Owner / Admin | Private practice, billing, multi-doctor clinics |
| **Freelancer Consultant** *(new — added Feb 2026)* | Consultant (self) | Solo practitioner who visits other clinics; searchable; receives referred cases |

### Cross-workspace identity
- One email = one **Identity** (single login).
- Identity → 0..N **Workspace Memberships**, each carrying its own role + permissions + tenant scope.
- After login, user lands on a **Workspace switcher** (chip strip at top) showing all their memberships. Active workspace controls all data scopes (cases, audit, forum).
- **Backend**: a new `identities` collection (above `users`); each `users` row is a per-tenant projection: `{ identity_id, tenant_id, role, sub_role, ... }`.

---

## 2. Sign-Up Flow (Public)

### Welcome screen
Three large tiles instead of two:
1. **Dental College** — Icon: graduation cap. Tagline: "For PG/UG training programmes."
2. **Dental Clinic** — Icon: clinic + tooth. Tagline: "For private practice & multi-doctor clinics."
3. **Freelancer Consultant** *(new)* — Icon: stethoscope + briefcase. Tagline: "For visiting implantologists who consult across clinics."

### Common fields (all three)
- Email (with three SSO tiles: Google / Microsoft / Apple — V1 ships Google only, M+A in V2)
- Mobile (E.164 stored: `+91XXXXXXXXXX`)
- **Mandatory mobile-OTP verification before activation** (DPDP Act 2023 / India healthcare standard)
- Password / Confirm Password
- Terms & Privacy checkbox
- 14-day free-trial banner

### Type-specific fields

**Dental College**
- College Name (typeahead from Dental_Colleges_List_India.pdf — V2)
- State (Indian states dropdown)
- Implant In-Charge: Prefix (Dr/Mr/Mrs) + Name
- Number of Individuals (hard cap; "Buy more seats" CTA at limit)
- CTA: *Create College Workspace*

**Dental Clinic**
- Dental Clinic Name
- Chief Dentist / Owner: Prefix + Name
- Registration Number
- State of Registration / State of Practice
- Number of Individuals (hard cap)
- CTA: *Create Dental Clinic Workspace*

**Freelancer Consultant** *(new)*
- Consultant Profile fields (see § 5 below for full schema)
- Single-user workspace by definition — no "Add User"
- CTA: *Create Consultant Profile*

### Anti-abuse (P0)
- Rate-limit public signup: 3 per IP / day
- Mandatory mobile-OTP (already listed)
- Optional CAPTCHA on the workspace creation step

---

## 3. Roles & Permissions

### Dental College
| Role | Cap | Permissions |
|---|---|---|
| Implant In-Charge | Max 2 | Full admin |
| Supervisor | Unlimited | Schedule + edit own/under-them; needs Implant In-Charge approval to advance phases |
| Student (PG/UG/Fellow) | Unlimited | Create case, limited edit, no phase approval, see own only |
| Auxiliary - Clinical (Hygienist / Nurse) | Unlimited | No case scheduling; can upload consent + mark instruments autoclaved; see Phase 1 only |
| Auxiliary - Front-Desk *(new split)* | N/A in college; promoted only in clinics | — |

### Dental Clinic
| Role | Cap | Permissions |
|---|---|---|
| Chief Dentist / Owner / Admin | Max 2 | Full admin (= Implant In-Charge) |
| Dentist / Consultant *(employed)* | Unlimited | Schedule + edit own/under-them; needs Chief Dentist approval (= Supervisor in college). **Asterisk in original doc clarified**: dentists self-approve their own cases; counter-sign needed only for cases assigned to them by another dentist. |
| Auxiliary - Clinical (Hygienist / Nurse) | Unlimited | Same as college Nurse |
| **Auxiliary - Front-Desk (Receptionist)** *(new split — split from generic Auxiliary)* | Unlimited | Register patients, collect payment, see Phase 1 patient-info section. **Cannot** mark instruments autoclaved or upload consent forms. |

### Freelancer Consultant *(new)*
- Single user; no role hierarchy.
- Permissions: full admin over their own consultant workspace (cases referred to them).
- Cannot invite others. Cannot delegate. Solo by design.

### Visibility / data-access matrix
- Each workspace's data is fully tenant-scoped (cases, forum, chat, audit log).
- **Catalog stays GLOBAL** across all tenants — manufacturer data is shared.
- Consultant workspace shares only the cases referred to them by clinics (see § 5).

---

## 4. Invite & Onboarding Flow (Clinic & College only)

(Consultant workspaces don't invite — they only receive referrals.)

- Public signup creates Implant In-Charge / Chief Dentist + tenant.
- Everyone else joins via invite (email + optional SMS) with 7-day single-use token.
- Invitee sets their own password on the activation page; email is locked, mobile editable but flagged for review if changed.
- **P0 enhancements (promoted from "Optional Advanced")**:
  - **Resend invite** (one click).
  - **Revoke pending invite** (admin can recall before acceptance).
  - **Promote Supervisor → Implant In-Charge** (if 2nd slot vacant; audit-logged + re-auth).
  - **Disable user** (no login, data preserved, cases reassigned to chief on disable).
  - **Role change** (audit-logged).
- **Email anti-collision policy**: if invitee's email matches an existing Identity, link the invite to that Identity instead of creating a duplicate. Activation just adds a new Workspace Membership row.

### Email delivery (P0)
- Pinned to Google Workspace SMTP (user has noreply@implanr.com / admin@implanr.com / info@implanr.com).
- All invite + system mail sent from `noreply@implanr.com`.
- HTML template with logo, inviter name, tenant name, single hero CTA. Plain-text fallback.
- "expires in 4 days" countdown shown on the activation page.

### CSV bulk import (P2)
- Columns: `Name | Email | Mobile | Role | Sub-role` (sub-role added — required for Student & Auxiliary).
- Auto-validates against role caps; preview-then-confirm.

### Forgot password / lone-admin recovery
- Self-service email reset.
- Emergency org-owner reset via `admin@implanr.com` mailbox (24-hr SLA, manual identity-doc verification).

---

## 5. Freelancer Consultant — Profile Schema *(new)*

A Consultant workspace is a **searchable, public-by-default profile** that other clinics can find and refer cases to.

```
consultants {
  id                       # uuid
  identity_id              # FK → identities (login owner)
  tenant_id                # uuid (this consultant's own workspace)
  display_name             # "Dr. Abhijit Patil"
  prefix                   # Dr / Mr / Mrs
  registration_number      # mandatory; verified in V2
  state_of_registration    # India dropdown
  states_of_practice       # multi-select India dropdown (consultants visit multiple states)
  cities_of_practice       # multi-select; typeahead
  qualifications           # MDS, FICOI, etc. — string list
  years_of_experience      # int
  specialisations          # multi-select: Implantology, Full-arch, Sinus Lift, Bone Graft, etc.
  implant_systems_certified # multi-select; pulls from global Implant Catalog brands
  bio                      # 500-char free text
  profile_photo_url        # object-storage path
  consultation_fee_inr     # number; optional; "On request" if blank
  visit_radius_km          # how far they travel
  rating                   # 0..5; aggregated from clinic feedback after referrals close
  rating_count             # int
  is_searchable            # bool; consultant can pause discoverability anytime
  created_at / updated_at
  verified_at              # set when admin@implanr.com verifies registration #
}
```

### Discoverability
- Public Consultant Directory inside the app: filter by state, city, specialisation, implant system, fee range.
- Clinics see only **verified** + **searchable** consultants by default.

### Privacy / opt-out
- Consultant can toggle `is_searchable` off; their existing referrals continue, but new searches don't surface them.
- Consultant can hide fee, photo, or bio individually.
- DPDP Act 2023 § 11 compliant — full data export available from Settings.

---

## 6. Referral / Case-Sharing Workflow *(new — first implementation slice)*

### Who initiates: a **Dental Clinic** (later: Dental College too).
### Who receives: a **Freelancer Consultant**.

#### Lifecycle
```
[CLINIC]                              [CONSULTANT]
   |
   | 1. Create case in Clinic workspace
   |    Phase 1 (diagnosis + treatment plan + consent)
   |
   | 2. Mark Phase 1 Complete + Patient Type =
   |    "Refer to External Consultant"
   |
   | 3. Search Consultant Directory →
   |    select consultant → "Send Referral"
   |
   | 4. Optional referral note + suggested
   |    procedure window
   |   --[ Referral payload ]------------>  5. Notification + Inbox row
   |                                        (Consultant Workspace)
   |
   |                                        6. Consultant accepts (or declines
   |                                           with reason — clinic can re-route)
   |
   |                                        7. On accept: case visible in
   |                                           consultant's case list,
   |                                           Phase 1 read-only,
   |                                           Phase 2 fully editable
   |
   | 8. Clinic sees Phase 2 progress
   |    in real-time (read-only)
   |
   |                                        9. Phases 2/3 by consultant
   |                                            (surgery, healing)
   |
   |                                       10. Consultant marks Phase 3
   |                                            "Complete & Hand Back"
   |
   | 11. Phase 4 (prosthesis) by clinic
   |     (read-only Phase 2/3 record)
   |
   | 12. Case closed → both sides receive
   |     final PDF; clinic rates consultant
```

### Data model

```
referrals {
  id
  procedure_id              # the case being shared
  origin_tenant_id          # clinic
  origin_user_id            # who sent it (clinic user)
  consultant_tenant_id      # accepted consultant's workspace
  consultant_id             # FK → consultants
  status                    # pending / accepted / declined / withdrawn / handed_back / closed
  referral_note             # clinic's note to consultant
  suggested_procedure_date  # optional
  decline_reason            # if declined
  accepted_at / handed_back_at / closed_at
  created_at
}
```

### Case-record co-ownership
- The single `procedures` document is shared. New field `procedures.shared_with[]` lists tenant IDs that have read/write access.
- Per-phase write permission resolved by a small ACL helper:
  - **Origin clinic**: full write on Phase 1 and Phase 4.
  - **Consultant**: full write on Phase 2 and Phase 3.
  - Either side: full read on all phases at all times.
  - Audit log records every cross-tenant view/edit (HIPAA / DPDP-grade transparency).

### Notifications
- Consultant gets a push + in-app notification on referral.
- Clinic gets push on accept / decline / hand-back.
- Both get push on every phase transition.

### Edge cases handled
1. **Consultant unavailable / declines** → clinic can re-route to a 2nd consultant; original referral row stays as audit.
2. **Clinic withdraws referral** before acceptance → consultant inbox row removed; audit retained.
3. **Patient withdraws consent mid-case** → clinic + consultant both get a freeze notification; case marked `terminated`; both sides keep read-only access.
4. **Consultant disabled mid-case** → ownership reverts to clinic with admin alert; clinic can pick another consultant or take Phase 2/3 in-house.
5. **Phase 4 needs consultant input again** (rare — e.g., abutment torque dispute) → clinic can request a "review consult" — micro-referral, read-only, no phase ownership change.

### Discovery + search UX (in clinic app)
- New tab in left rail: **Consultants** (visible to Dental Clinic users only).
- Filters: State (defaults to clinic's state) → City → Specialisation → Implant System → Fee → Rating → Distance.
- Result cards: photo, name, qualifications, ratings, distance, "Send Referral" CTA.
- Tap card → full profile + verified badge + sample procedures (count only, no PHI).

### Privacy of patient data during referral
- The referral payload to the consultant carries only the fields required for clinical decisions (chief complaint, medical history, intra-oral exam, radiographs).
- **Patient name, contact, address default to MASKED** until the consultant accepts. Clinic can override (un-mask) if patient consent specifically allows.
- Consent form must explicitly include "I consent to my anonymised case being shared with an external consultant" — checkbox in Phase 1 consent V2.

---

## 7. Phase-Level Differences Between Workspace Types

(Phases 2, 3, 4 are unchanged — same logic across all three workspace types. Only Phase 1 differs.)

### Phase 1 — Diagnosis & Treatment Planning
| Field / Step | Dental College | Dental Clinic | Freelancer Consultant |
|---|---|---|---|
| Patient registration fields | Same | Same | Inherits from referring clinic (read-only) |
| **Patient Type** *(new for clinic + consultant)* | N/A (always institutional patient) | `Own Clinic` / `Refer to External Consultant` | Always pre-set to "Referred In" |
| Clinic Name (when Patient Type = consultation) *(legacy doc field — now redundant; replaced by referral row)* | N/A | Auto-filled from referral or free text | N/A |
| Payment Details | Existing structured options | Structured if `Own Clinic`; free-text if referred (optional) | Read from referral; consultant logs their own fee separately |
| Consent form | College template (with IEC clause) *(new — split)* | Clinic template (no IEC) *(new — split)* | Inherits clinic's consent + adds explicit "shared with consultant" clause |
| Phase 1 Checklist — "Full Payment Done" | Mandatory | **Renamed "Payment Confirmed"; optional** | Optional |
| Phase 1 Checklist — "RealGuide Planning and Report Generated" | Existing | **Renamed "Surgical Plan Generated"; optional** | Inherits from clinic |
| Phase 1 → Phase 2 advance | Implant In-Charge approval | Chief Dentist approval | Auto on referral acceptance |

### GST / Indian tax fields *(updated Feb 2026 per user input)*
**Dental healthcare services other than aesthetic procedures are 0% GST in India.** No GST invoice required for clinical implant work. Only show GST fields if the procedure type is tagged `aesthetic` (whitening, veneers, smile design). Out of scope for V1 implant workflow.

---

## 8. Top 5 Highest-Leverage P0 Enhancements (priority for build phase)

1. ✅ **Mandatory mobile-OTP at public signup** (India healthcare standard; DPDP Act compliance).
2. ✅ **Split Auxiliary into Clinical (Hygienist/Nurse) and Front-Desk (Receptionist)** with different permission sets.
3. ✅ **Two consent-form templates** (college vs clinic), gated by tenant type. Consultant inherits clinic's + adds referral clause.
4. ✅ **Resend / Revoke / Promote / Disable / Role-Change** moved to P0 (without these, the invite system is fragile).
5. ✅ **Cross-workspace single-identity model** so Dr Patil can be Implant In-Charge at his college, Chief Dentist at his clinic, AND Consultant simultaneously — single login, three workspaces, one email.

(Original suggestion #5 — Indian GST invoicing — withdrawn per user clarification: 0% GST for non-aesthetic dental services.)

---

## 9. V1 Build Order (when implementation is approved)

> **Phased delivery, staged for low risk** (per user decision 4b).

| Phase | Scope | Effort |
|---|---|---|
| **A** | Multi-tenancy core: `tenants`, `identities`, `users.tenant_id`, migration to default tenant "Bharati Vidyapeeth Dental College and Hospital, Pune" | 1 session |
| **B** | Three-tile public signup + Implant In-Charge / Chief Dentist / **Consultant** registration flows + Google Workspace SMTP + mobile OTP | 1 session |
| **C** | Invite system (resend / revoke / accept / promote / disable) + activation page | 1 session |
| **D** | Phase 1 deltas for Clinic + Consent template split + Front-Desk Auxiliary permission split | 1 session |
| **E** *(IMMEDIATE — first slice approved)* | **Consultant profile + searchable directory + clinic→consultant referral flow with Phase 2/3 hand-off** (described in detail in § 5–6 above) | 1 session |
| **F** | Google SSO + free-trial enforcement + 14-day banner + 7-day grace | 1 session |
| **G** | CSV bulk import + Microsoft / Apple SSO + Dental Colleges typeahead + workspace switcher chip | 1 session |

---

## 10. Out-of-Scope for V1 (parked for V2+)
- Multi-clinic chains (one chain = N clinic workspaces under a parent group; revenue lever for franchises).
- Patient-portal (patient logs in, sees their own case).
- Inter-college research-data sharing (anonymised).
- WhatsApp invite link delivery.
- Apple Watch / iPad-native split-view.
- Vision-OCR fallback for scanned-PDF brochures (catalog feature).

---

*End of consolidated reference.*  *Last updated: Feb 2026.*
