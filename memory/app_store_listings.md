# App Store + Play Store Listing Copy

> **Instructions:** Copy each block directly into the corresponding field in App Store Connect or Google Play Console. Fields marked 🔒 are privacy/compliance disclosures — do **not** modify without legal review.

---

## App Name & Identity

| Field | Value |
|-------|-------|
| **App Name (30 char max)** | Implanr — Dental Implant Suite |
| **Subtitle / Short Description (80 char)** | Clinical workflow & decision support for implant surgery teams |
| **Bundle ID (iOS)** | `com.implanr.prosthodontics` |
| **Package Name (Android)** | `com.implanr.prosthodontics` |
| **Primary Category** | Medical |
| **Secondary Category** | Healthcare & Fitness |
| **Content Rating** | 17+ (Medical/Treatment Information — per Apple guidelines) |

---

## Promotional Text (170 char — App Store only, editable without review)

> Guided four-phase implant workflow with AI-assisted planning, live drilling protocols, and role-based approvals for students, supervisors, in-charges, and nurses.

---

## Description — App Store (4000 char max) / Play Store (same)

**Implanr is a clinical workflow platform for dental implant teams.**

Built with the Department of Prosthodontics at Bharati Vidyapeeth Dental College & Hospital, Implanr guides your surgical case from pre-surgical diagnosis to final prosthesis delivery across four structured phases — with role-based review, automated PDF documentation, and AI-powered clinical decision support.

**WHO IT'S FOR**
• Postgraduate students managing their implant caseload
• Clinical supervisors reviewing and approving cases
• Implant in-charges auditing workflow across the department
• Surgical nurses preparing instruments and patient consent

**WHAT IT DOES**

■ **Four-Phase Workflow**
Diagnosis & Treatment Planning → Implant Surgery → Healing & Second Stage → Prosthetic Rehabilitation. Each phase gates on supervisor + in-charge approval, so nothing ships without oversight.

■ **Implant Library of 649 Variants across 49 Systems**
Search by brand, system, diameter, length, and bone density. Get clinical indications, contraindications, and surgical protocols instantly.

■ **Bone-Density Drilling Protocols**
Exports an A4 PDF with step-by-step drill sequence, RPM, irrigation, and a QR link to the patient's CBCT — autoclave stamp included.

■ **AI-Assisted Clinical Notes**
Summarise surgical observations in one tap. Ask clinical questions in natural language. Backed by OpenAI GPT with all queries logged for audit.

■ **Narrow-Ridge Safety Engine**
Four-level ridge classification blocks severely narrow placements (<3mm) and surfaces prosthetic warnings before you commit.

■ **Patient Consent & Instrument Readiness**
Nurses upload signed consent and mark instruments autoclaved; the case auto-unlocks for surgery. Every replacement is audit-logged.

■ **Case-Level PDF Reports**
Generate a comprehensive record — Phase 1 exam, drilling protocol, surgical notes, second-stage findings, and prosthetic delivery — ready to print or email to the faculty.

■ **HIPAA-Aligned Privacy**
15-minute auto-logout. Screen-capture blocked on authenticated screens (FLAG_SECURE on Android / blur on iOS). Access audit logs on every PHI touch. Data encrypted in transit via TLS.

**CLINICAL DISCLAIMER**

Implanr is a workflow and documentation aid. It does not diagnose, treat, or replace clinical judgment. All surgical decisions remain the responsibility of the licensed practitioner. Indications, protocols, and system recommendations are sourced from manufacturer IFUs and peer-reviewed literature — always verify against the manufacturer's most recent documentation before use.

**GETTING STARTED**

Your institution provisions your account. Log in with the credentials your program administrator provides — you'll then complete a one-time onboarding tour tailored to your role.

Questions? Contact your department's Implant In-Charge or email support@implanr.app.

---

## Keywords (100 char — App Store only, comma-separated, no spaces after commas)

```
dental implant,prosthodontics,oral surgery,implant planning,CBCT,drilling protocol,implant library,clinical decision support,dental workflow,implantology,oral maxillofacial,surgical checklist,implant brands,bone density
```

---

## What's New (release-notes — 4000 char, update every release)

**Version 1.5 — Feb 2026**

• New Phase 2 → Phase 3 summary preview — students can flag wrong prosthesis data and request a supervisor edit without re-submitting the entire phase.
• Screen-capture protection on all authenticated screens.
• 15-minute inactivity auto-logout.
• Full audit trail for every patient-data access (admins only).
• Faster PDF generation for case reports.

---

## Support & Marketing URLs

| Field | Value |
|-------|-------|
| **Support URL** | `https://implanr.app/support` |
| **Marketing URL** | `https://implanr.app` |
| **Privacy Policy URL** | `https://implanr.app/legal/privacy-policy` |
| **Terms of Service URL** | `https://implanr.app/legal/terms` |

> ⚠️ Replace with your actual domain. Apple and Google REQUIRE a public Privacy Policy URL; your app will be rejected without one.

---

## App Review Notes (Apple — private, only seen by reviewers)

**Demo Account**
Username: `demo.student@implanr.app`
Password: `DemoPass123!`

**Optional Second Account**
Username: `demo.supervisor@implanr.app`
Password: `DemoPass123!`

**Reviewer Instructions**
1. Log in with the Student account above.
2. Tap "New Case" to create a test procedure. Patient data in the demo environment is synthetic — no real PHI.
3. Observe the Phase 1–4 workflow. To see supervisor approval, log out and back in with the Supervisor account.
4. Implanr requires HTTPS to our production API — tested on iOS 16+ and Android 10+.

**Clinical Safety**
Implanr is workflow software. It does not make diagnoses and cannot administer treatment. All decisions require a licensed clinician.

**HIPAA / GDPR**
All patient data is encrypted at rest and in transit. Access is logged per HIPAA §164.312(b). BAA signed with MongoDB Atlas and OpenAI.

---

## Age Rating (fill in App Store Connect Questionnaire)

| Category | Rating |
|----------|--------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | None |
| Alcohol, Tobacco, or Drug Use | None |
| Mature/Suggestive Themes | None |
| Simulated Gambling | None |
| Horror/Fear Themes | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Medical/Treatment Information | **Frequent/Intense** ← select this |
| Unrestricted Web Access | None |
| Gambling and Contests | None |

**Resulting rating:** 17+

---

# 🔒 Apple App Privacy "Nutrition Labels" — App Store Connect

> Navigate to: **App Store Connect → My App → App Privacy → Get Started**
> Answer **"Yes, we collect data from this app"**

## Data collected — Linked to the User

### Health & Fitness → **Health and Medical Data**
- [x] App Functionality
- [x] Product Personalization

### Contact Info → **Name**
- [x] App Functionality

### Contact Info → **Email Address**
- [x] App Functionality
- [x] Account Management

### Identifiers → **User ID**
- [x] App Functionality
- [x] Authentication

### Usage Data → **Product Interaction**
- [x] Analytics
- [x] App Functionality

### Diagnostics → **Crash Data**
- [x] App Functionality

### Diagnostics → **Performance Data**
- [x] App Functionality

## Data collected — Linked to the User & Used for Tracking
**NONE.** (Implanr does not track users across third-party apps or websites.)

## Data NOT Collected
- Financial Info
- Location
- Sensitive Info (beyond medical)
- Contacts
- User Content (photos/videos of users — we only collect patient radiographs which are NOT linked to the app user)
- Browsing History
- Search History
- Purchases

## Privacy Choices
- Users can request data deletion by contacting support — supported by the `DELETE /api/auth/account` flow (once you expose it) or by emailing support@implanr.app.
- Encrypted at rest (via MongoDB Atlas once migrated). Encrypted in transit (TLS 1.2+).

---

# 🔒 Google Play Data Safety — Play Console

> Navigate to: **Play Console → App content → Data safety → Start**

## Section 1: Data collection and security

**Does your app collect or share any of the required user data types?**
✅ **Yes**

**Is all of the user data collected by your app encrypted in transit?**
✅ **Yes** (TLS 1.2+)

**Do you provide a way for users to request that their data is deleted?**
✅ **Yes** (contact support@implanr.app — commit to 30-day SLA)

## Section 2: Data types (for each, mark ✅ Collected)

### Personal Info
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Name | ✅ | No | No (required) | Account management, App functionality |
| Email address | ✅ | No | No | Account management, App functionality |
| User IDs | ✅ | No | No | Account management, App functionality, Analytics |
| Address | ❌ | — | — | — |
| Phone number | ❌ | — | — | — |

### Financial Info
| Type | Collected? |
|------|------------|
| (none) | ❌ |

### Health and Fitness
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Health info | ✅ | No (only between authorised clinicians on the same institution) | No | App functionality (clinical workflow) |

### Photos and Videos
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Photos | ✅ | No | No | App functionality (CBCT / IOPA / OPG radiographs linked to patient cases — NOT user photos) |

### Files and Docs
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Files and docs | ✅ | No | Optional (consent form upload) | App functionality |

### App Activity
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| App interactions | ✅ | No | No | Analytics, App functionality |
| In-app search history | ❌ | — | — | — |
| Other user-generated content | ✅ | No | No | App functionality (clinical notes) |

### Device or other IDs
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Device or other IDs | ✅ | No | No | App functionality (push notification token), Analytics |

### App Info and Performance
| Type | Collected? | Shared? | Optional? | Purpose |
|------|------------|---------|-----------|---------|
| Crash logs | ✅ | No | No | App functionality |
| Diagnostics | ✅ | No | No | App functionality |

## Section 3: Security practices

- [x] Data is encrypted in transit
- [x] You can request that data be deleted
- [x] Follows Google Play Families Policy: **N/A — 17+ audience only**
- [x] Independent security review: **Not yet — commit to SOC 2 Type I within 12 months**

## Section 4: Data collection justification (written statement)

> Implanr is a workflow application for dental-implant clinicians. Patient health data (radiographs, consent forms, surgical notes, prosthetic plans) is collected and stored only for the purpose of providing the application's core clinical workflow — it is never used for advertising, never shared with third parties outside the user's institution, and never sold. Authentication data (name, email, user ID) is collected to identify clinicians within their institution and enforce role-based access control. Diagnostics and app-interaction data are collected to detect crashes and improve product reliability. Patient data is not linked to the user's marketing or advertising profile in any way.

---

# 📋 Pre-Submission Checklist

Before tapping "Submit for Review":

- [ ] Replace `https://implanr.app/*` URLs with your actual domain
- [ ] Demo account (`demo.student@implanr.app`) actually exists in production database
- [ ] Privacy Policy published at public URL (required — rejection reason if missing)
- [ ] Terms of Service published
- [ ] App built against **production API URL**, not preview (update `EXPO_PUBLIC_BACKEND_URL` before `eas build`)
- [ ] iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSFaceIDUsageDescription` in Info.plist match what you actually request
- [ ] Android: `targetSdkVersion ≥ 34` (Play Console requirement Nov 2024+)
- [ ] App icon uploaded (1024x1024 for App Store, 512x512 + feature graphic 1024x500 for Play Store)
- [ ] 6.7" iPhone + 6.1" iPhone + 12.9" iPad screenshots (App Store)
- [ ] 6.1" Android phone + 7" tablet + 10" tablet screenshots (Play Store)
- [ ] Age rating questionnaire completed → 17+
- [ ] BAA signed with MongoDB Atlas, OpenAI, Expo (HIPAA)
- [ ] Contact email for support is monitored (Apple's reviewers will email you)

---

_Last updated: Feb 2026. Review before every submission — Apple and Google update their privacy-label taxonomies every ~6 months._
