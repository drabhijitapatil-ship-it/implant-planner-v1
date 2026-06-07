# Project Timeline & Payment Milestones

**Project:** Implanr — Dental College App + Dental Clinic App
**Total Duration:** ~8 weeks
**Total Cost:** ₹60,000

---

## Overview

| Phase | Work | Duration | Payment |
|-------|------|----------|---------|
| Phase 1 | App Separation + Backend Foundation | 3 weeks | ₹25,000 |
| Phase 2 | Signup + Subscription + Testing | 3 weeks | ₹20,000 |
| Phase 3 | Store Listing + Publishing | 2 weeks | ₹15,000 |
| **Total** | | **~8 weeks** | **₹60,000** |

---

## Phase 1 — App Separation + Backend Foundation

**Duration:** 3 weeks
**Payment:** ₹25,000 (paid at project start / kickoff)

### Why ₹25,000 upfront?

This is not a blank-slate project. The existing app is a production-grade system — 13,000+ lines of backend code, 100+ frontend screens, 15 implant brand protocols, AI integrations, HIPAA compliance features, and 103 automated tests. Splitting this into two separate apps is a high-precision task: every screen, route, navigation flow, and backend endpoint must be untangled correctly without breaking any existing functionality.

Phase 1 is the foundation everything else depends on. If this is done wrong, Phase 2 and Phase 3 break. The advance covers 3 weeks of dedicated senior-level work on a complex, already-live codebase — not a simple copy-paste job.


### What gets done

- Fork existing codebase into 2 separate Expo projects
  - `implanr-college` — for dental colleges (students, supervisors, nurses)
  - `implanr-clinic` — for dental clinics (dentists, assistants)
- Remove college-specific screens from clinic app
- Remove clinic-specific screens from college app
- Clean navigation and tab structure per app
- Backend: add `organizations` collection, `org_type` field on users, `subscription_status` field
- Configure 2 separate EAS projects with unique bundle IDs
  - College: `com.implanr.college`
  - Clinic: `com.implanr.clinic`

**AWS Deployment setup:**
- Launch EC2 instance (Ubuntu, t3.medium recommended for production)
- Install Python, Gunicorn + Uvicorn, configure `gunicorn.conf.py`
- Deploy FastAPI backend, set up as systemd service (auto-restart on crash)
- Configure S3 bucket for file storage (consent forms, CBCT scans, case photos)
- Set up IAM user with least-privilege policy for S3 access
- Point domain/subdomain to EC2 (e.g. `api.implanr.com`)
- SSL certificate via Let's Encrypt (HTTPS enforced, HTTP blocked)
- MongoDB Atlas connected to EC2 (whitelist EC2 IP)
- Environment variables secured via `.env` on server (not committed to code)
- Nginx as reverse proxy in front of Gunicorn
- Basic CloudWatch or UptimeRobot monitoring for uptime alerts

### Deliverable
Both apps running correctly on simulator — each showing only screens relevant to its audience. Backend live on AWS with HTTPS, accessible from both apps.

---

## Phase 2 — Signup Flow + Subscription + Testing

**Duration:** 3 weeks
**Payment:** ₹20,000 (paid at Phase 2 kickoff)

### Milestone 2A — Signup Flow + Razorpay (Week 1–2)

**Signup flow (both apps):**
- Multi-step registration:
  - Step 1: Organization setup (college name / clinic name, location)
  - Step 2: Admin account creation (name, email, password)
  - Step 3: Invite link/code generated for team members
  - Step 4: Team joins via invite → picks role (student/supervisor for college, dentist/assistant for clinic)
- Backend endpoints:
  - `POST /organizations` — create org
  - `POST /organizations/invite` — generate invite token
  - `GET /organizations/join/:token` — validate + pre-fill signup

**Razorpay subscription (web portal):**
- Simple web portal with subscription plans:
  - College: Starter (₹199/mo), Standard (₹349/mo), Enterprise (custom)
  - Clinic: Solo (₹29/mo), Small (₹79/mo), Large (₹149/mo)
- Razorpay checkout → webhook → backend activates subscription
- Backend endpoints:
  - `POST /webhooks/razorpay` — handle payment events
  - `GET /organizations/:id/status` — check subscription
- Both apps check subscription on login → if inactive → redirect to website to subscribe
- No Razorpay inside app (Apple/Google policy — payment handled on web only)

**Deliverable:** Complete signup flow live on both apps + subscription activation working end-to-end (test mode)

### Milestone 2B — Testing + QA (Week 2–3)

- Manual QA: all flows, both apps, both platforms (iOS + Android)
- Device testing:
  - iOS: iPhone SE, iPhone 12, iPhone 15
  - Android: Samsung mid-range, Pixel 7
  - iPad: tablet layout check
- Backend load test (50+ concurrent users)
- Razorpay test mode → production mode switch
- Fix all bugs found during QA
- TestFlight builds (college + clinic) sent to client for review
- Play Store Internal Testing builds sent to client

**Deliverable:** Client-approved builds on TestFlight and Play Store Internal Testing. Razorpay live and processing real payments.

---

## Phase 3 — Store Listing + Publishing

**Duration:** 2 weeks
**Payment:** ₹15,000 (paid when both apps are live on both stores)

### What gets done

**App Store (iOS) — both apps:**
- App Store Connect listings created for college app + clinic app
- Screenshots for iPhone 6.7", 6.5", 5.5" and iPad 12.9"
- App description, keywords, category (Medical)
- Privacy manifest (`PrivacyInfo.xcprivacy`) — required iOS 17+
- Privacy policy URL live on web
- Age rating: 4+
- Submit for review

**Play Store (Android) — both apps:**
- Google Play Console listings created for college app + clinic app
- Feature graphic (1024×500) + screenshots for phone + tablet
- App description, category (Medical)
- Data safety form filled (PHI handling declared)
- Content rating questionnaire completed
- Submit for review

**Review handling:**
- Monitor both stores daily during review (typical: 1–3 business days)
- Respond to any App Review queries within 24 hours
- Fix and resubmit if rejected 

### Deliverable
Both apps live and publicly available on App Store + Play Store.

---

## Payment Schedule

| When | Amount | For |
|------|--------|-----|
| Project kickoff | ₹25,000 | Phase 1 start |
| Phase 1 complete | ₹20,000 | Phase 2 start |
| Phase 2 complete (TestFlight approved) | ₹15,000 | Phase 3 start |
| Both apps live on stores | — | Phase 3 already paid at start |
| **Total** | **₹60,000** | |

---

## One-Time Setup Costs (Client Pays Directly)

| Item | Cost |
|------|------|
| AWS account + EC2 instance setup | ~₹500–1,500/month (client's AWS account) |
| S3 bucket (file storage) | ~₹50–200/month depending on usage |
| MongoDB Atlas (M10 production cluster) | ~₹5,000/month |
| Razorpay account | Free (client registers) |



---

## Notes

- Client responsible for providing app icons and final app name before Phase 3
- Privacy policy and Terms of Use must be live on a public URL before store submission (client's responsibility to get legal review)
