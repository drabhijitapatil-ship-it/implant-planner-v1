# Subscriptions and Onboarding

How institutions join Implanr, how they are billed, and what the app enforces. Applies from version **1.3.6** onward.

Pricing source: `Implanr Subscription Plans.xlsx` (Oct 2026). If prices change, update the code locations listed under [Where things live](#where-things-live).

---

## 1. The short version

- Implanr is sold **to institutions**: dental colleges and dental clinics. Individuals never buy in the app.
- **Billing happens outside the app**: a quote, then a GST invoice, then payment to Implanr. There are no in-app payments on any platform.
- **iOS is sign-in only.** Apple allows outside billing only for apps sold to organisations for their staff and students (App Store guideline 3.1.3(c)). So the iOS app has no registration, trial, pricing or upgrade screens. New institutions tap **Request Access** instead.
- **Android and web** keep self-registration with a free trial and the Subscription screen.
- **Limits are enforced by the server** on every platform (users, students, departments, monthly cases, features). Changing what the app shows never changes what an institution is allowed.

---

## 2. What each platform shows

| | iOS | Android | Web |
|---|---|---|---|
| Sign in | ✅ | ✅ | ✅ |
| Register college / clinic (starts free trial) | ❌ → **Request Access** form | ✅ | ✅ |
| Subscription screen (plan, prices, usage, upgrade request) | ❌ hidden | ✅ | ✅ |
| "Free trial ends in N days" banner on Home | ❌ hidden | ✅ | ✅ |
| Access-expired banner | Neutral text, no link | Links to Subscription | Links to Subscription |
| Super-admin tools (plans, licences, access requests) | ✅ | ✅ | ✅ |

The switch is one flag: `HIDE_COMMERCE` in `frontend/utils/storePolicy.ts` (true on iOS only).

**Rules for the iOS app**, so App Review doesn't reject it again:
- Never show a price, plan name to buy, trial countdown, "upgrade", "renew" or "subscribe" text.
- Never link or point to a website where the user can pay or sign up. Contacting the team **outside** the app (phone, email, WhatsApp) is fine.
- Messages about limits say *"Please contact your Implanr account manager."* This is already the wording of every server error.

---

## 3. Onboarding a new institution

### 3a. Starting on iPhone (Request Access)

1. The person taps **Request Access for Your Institution** on the login screen.
2. They fill in: college or clinic, institution name, city, their name and designation, email, phone or WhatsApp, size (PG students or team size), and an optional message.
3. The request is saved. Every super-admin gets an in-app notification, a push notification and an email.
4. The team opens **Super Admin → Access Requests**. They can call or email from there and move the request through **New → Contacted → Quoted → Onboarded → Closed**.
5. The team sends a quote (section 5 for colleges, section 4 for clinics) and agrees terms.
6. **The workspace is created through signup on the web or Android** (see the note below). The team sends the signup link by email or WhatsApp, or completes signup together with the founder on a call. The founder verifies their email with a one-time code.
7. Super-admin applies the plan or licences to the new organisation (section 6). This ends the trial.
8. The founder adds staff and students: **Profile → Users**, or invites by email. Everyone then signs in on any device, including iPhone.

> **Gap:** super-admins can't create an organisation directly yet, so every new workspace goes through signup (step 6). See `docs/BACKLOG.md` → "Super-admin: create organization".

### 3b. Starting on Android or web (self-registration)

1. **Create Account → Dental College** or **Dental Clinic**.
2. Enter details, verify the email with a one-time code, and create the founder account.
3. The organisation starts on a **free trial**: 14 days by default. A super-admin can change the length and limits in **Subscription Plans → Free Trial**.
4. Three days before the trial ends, the founder gets an email, and Android/web show the banner.
5. The founder may **Request Upgrade** from the Subscription screen. That only notifies the team; it changes nothing by itself.
6. The team quotes, invoices, and applies the plan or licences (section 6).

### 3c. When access ends (trial over, or subscription expired or cancelled)

- **Existing users can still sign in** and keep working on their cases.
- **No new users** can be added, and no new departments.
- The founder gets an email when the trial ends.
- The app says access is inactive; on iOS it only says to contact the account manager.
- Restore access by applying a plan or licences (section 6), or by extending the trial for that organisation.

---

## 4. Private clinic plans

Billed monthly or yearly (yearly = 10 × monthly), plus GST.

| Plan | Users | Monthly | Yearly | New cases / month | Extra user / month |
|---|---|---|---|---|---|
| **Solo** | 1–3 | ₹3,500 | ₹35,000 | 25 | ₹500 |
| **Clinic** | 4–10 | ₹6,000 | ₹60,000 | Unlimited | ₹450 |
| **Specialist** | 11–25 | ₹10,000 | ₹1,00,000 | Unlimited | ₹400 |
| **Enterprise** | 26–50 | ₹18,000 | ₹1,80,000 | Unlimited | ₹350 |
| **Chain / Group** | 50+ | Custom quote | Custom quote | Unlimited | — |

**Feature differences**, enforced by the server unless marked *not yet*:

| Feature | Solo | Clinic | Specialist | Enterprise / Chain |
|---|---|---|---|---|
| AI-assisted treatment planning | ❌ | ✅ | ✅ | ✅ |
| AI case summary | ✅ | ✅ | ✅ | ✅ |
| Automatic lab prescription | ❌ | ✅ | ✅ | ✅ |
| Data export (CSV) | ❌ | ✅ | ✅ | ✅ |
| Clinic admin dashboard | ❌ *(not yet enforced)* | ✅ | ✅ | ✅ |
| Analytics level | Basic *(not yet enforced)* | Standard | Full | Full |
| API access | ❌ | ❌ | ❌ | ✅ |
| Support / onboarding | Email, 1 session | Email, 3 sessions | Dedicated, full | Dedicated, full |

- **Case limit:** new cases are counted per calendar month in IST. Case number 26 in a month is refused with *"…reached its limit of 25 new cases this month."*
- **Trials:** organisations on a free trial get every feature and no case limit.
- **Old plans:** Starter, Professional and Premium are retired. Clinics already on them keep their limits until the team moves them to a new plan.

---

## 5. Dental college licences

Colleges don't buy a plan. They buy **one licence per implant department, Centralised Implant Clinic or Unit**, sized by the PG students on its roll across all three years. **Every tier has every feature**; tiers differ only in size. Billing is **annual only**, aligned to the MDS academic session, by quote and invoice, 100% in advance, plus 18% GST.

| Tier | PG students | Supervisors incl. | In-charges incl. | Admins incl. | Price / year |
|---|---|---|---|---|---|
| Essential 9 | up to 9 | 3 | 1 | 1 | ₹50,000 |
| Standard 12 | 10–12 | 4 | 2 | 1 | ₹60,000 |
| Advanced 18 | 13–18 | 5 | 3 | 2 | ₹80,000 |
| Premier 24 | 19–24 (+ extra PGs) | 6 | 4 | 2 | ₹1,00,000 |

**Extras** (per person per year):
- **Extra users:** supervisor ₹3,000, in-charge ₹4,000, admin ₹5,000. Only beyond the pooled allowance.
- **Extra PG:** ₹4,000. Only above 24 PGs on a Premier 24 licence.
- **Fellow:** ₹6,000.
- **Management viewers** (Dean, Principal, HOD): free, up to 3 *(role not built yet; see the backlog)*.

**Intern Implant Programme** (interns who place implants; interns who observe or assist are free):

| Interns | 20 | 40 | 60 | 80 | 100 | above 100 |
|---|---|---|---|---|---|---|
| Price / year | ₹15,000 | ₹28,000 | ₹40,000 | ₹50,000 | ₹60,000 | ₹60,000 + ₹600 each |

**Other add-ons:** Research Module ₹40,000 per college per year. One-time setup ₹25,000, waived on 3-year contracts. Extra storage ₹2,500 per 100 GB above 250 GB per licence.

### How a quote is calculated

The order matches the spreadsheet's College Quote sheet:

1. **Licence fees** = sum of tier prices + extra-PG charges.
2. **Volume discount** on licence fees: 10% for 2 licences, 15% for 3 or more. University groups get 15%, whichever is higher (they don't stack).
3. **Add:** extra users + Intern Programme + fellows + Research Module = **annual subtotal**.
4. **Commercial discount** on the subtotal: founding institution 25% (first 20 colleges, price locked 3 years), government 20%, 3-year prepaid 10%, plus any negotiated discount. These stack but are **capped at 30%**.
5. **Net annual fee** = subtotal − commercial discount.
6. **Invoice on signing** = net annual fee (× 3 for 3-year prepaid) + setup fee (new customers on 1-year terms), plus 18% GST.
7. **Renewal:** +7% a year, except founding colleges during their locked 3 years.

**Worked example.** This matches the spreadsheet exactly and is checked in code.
- **Licences:** Prosthodontics 12, Periodontology 9, OMFS 9, so Standard + Essential + Essential = ₹1,60,000. Less 15% for 3 licences = ₹1,36,000.
- **Add-ons:** 2 extra supervisors (₹6,000) and Interns 60 (₹40,000), giving a subtotal of ₹1,82,000.
- **Discount:** founding 25% = −₹45,500, so the **net annual fee is ₹1,36,500**.
- **On signing:** + setup ₹25,000 = ₹1,61,500, + GST ₹29,070 = **₹1,90,570**. Works out to ₹3,400 per PG per year.

### Seat limits a licensed college gets

Allowances are **pooled across all of the college's licences**:

| Limit | Value |
|---|---|
| Students | PG capacity of every licence (+ extra PGs) + fellows + interns on the Intern Programme |
| Supervisors / guides | Included allowance, or the number paid for if higher |
| Implant In-Charges | Included allowance, or the number paid for if higher |
| College admins | Included allowance, or the number paid for if higher |
| Departments | Number of licences |
| Nurses | Not limited |

When a limit is full, adding a user (or changing someone's role) is refused with *"Your college's licences include N …, and all are in use."*

> Fellows and interns currently use the student role, so an observing intern added as a user takes a student seat. A separate intern/fellow role is in the backlog.

---

## 6. Day-to-day tasks for the Implanr team

All of these are in the **Super Admin** dashboard.

| Task | Where |
|---|---|
| Follow up a new lead | **Access Requests**, then call or email, then update the status |
| Price a college | **Organizations → (college) → Department Licences**. The quote updates as you type. |
| Apply college licences | Same screen → **Apply Licences to College**. Ends the trial and sets the seat limits immediately. |
| Put a clinic on a plan | **Organizations → (clinic) → Subscription → Manage** → choose plan and billing cycle |
| Handle an upgrade request (Android/web) | **Organizations → (org) → Subscription**: the request shows there. Assign the plan or dismiss it. |
| Extend or restart a trial for one org | **Organizations → (org) → Subscription → Manage** → trial days |
| Change trial length and limits for all new signups | **Subscription Plans → Free Trial** |
| Change a clinic plan's price, limits or features | **Subscription Plans → (plan)**. Only new assignments get the new values; existing subscribers keep theirs. |
| Change college tier prices or discounts | Code: `backend/college_licensing.py` (see below) |

---

## 7. Where things live

| What | Location |
|---|---|
| iOS-only hiding (`HIDE_COMMERCE`) | `frontend/utils/storePolicy.ts` |
| Request Access form | `frontend/app/auth/request-access.tsx` |
| Access Requests inbox (super-admin) | `frontend/app/admin/access-requests.tsx`; API `POST /api/access-requests`, `GET/PATCH /api/admin/access-requests` |
| Clinic plans (seed data) | `backend/server.py` → `LAUNCH_OFFER_PLANS_SEED`; retired keys in `RETIRED_PLAN_KEYS` |
| Plan admin screen | `frontend/app/admin/subscription-plans.tsx` |
| College rate card + quote maths | `backend/college_licensing.py` (`LICENCE_TIERS`, `RATES`, `INTERN_TIERS`, `compute_quote`, `derive_caps`) |
| College licence editor | `frontend/app/admin/organizations/licences.tsx`; API `GET /api/admin/college-rate-card`, `POST /api/admin/college-quote`, `PUT /api/organizations/{org_id}/licences` |
| Limit checks (server) | `backend/server.py` → `_get_org_caps`, `_assert_role_cap`, `_assert_case_quota`, `_assert_org_feature`, `_assert_subscription_not_expired` |
| Organisation's own Subscription screen (Android/web) | `frontend/app/subscription.tsx` |

Seed changes (new clinic plans, retiring old ones) apply when the backend restarts. A plan that a super-admin has edited is never overwritten by the seed.

---

## 8. Open items

Tracked in `docs/BACKLOG.md`:

- Super-admin "create organization" screen, so the team can onboard an institution without the signup flow.
- Free management viewer role (Dean, Principal, HOD).
- Separate intern and fellow roles, so observing interns don't use seats.
- Enforce Solo's admin dashboard and analytics level.
- Next iOS submission: version 1.3.6 in App Store Connect and the reviewer note.
