# Privacy Policy — Implanr

**Effective date:** [DD MMM YYYY]
**Last updated:** [DD MMM YYYY]
**Version:** 1.0

---

## 1. Who we are

This Privacy Policy describes how **[Legal Entity Name, e.g., "Implanr Technologies Private Limited"]** ("**Implanr**", "**we**", "**us**", "**our**") collects, uses, stores, shares, and protects your information when you use the **Implanr** mobile application, web application, or any related services (collectively, the "**Service**").

- **Registered address:** [Full registered office address, India]
- **Grievance Officer / Data Protection Officer:** [Name], reachable at **[admin@implanr.com]**, postal address as above.
- **General contact:** **[info@implanr.com]**
- **Security incident reporting:** **[admin@implanr.com]**

We are the **Data Fiduciary** under India's Digital Personal Data Protection Act, 2023 ("**DPDP Act**") for personal data we determine the purpose and means of processing. Where we process Protected Health Information ("**PHI**") on behalf of a dental college or clinic, that organisation is the controller and we act as a processor / data processor under their instructions.

---

## 2. Scope

This policy applies to:
- The Implanr iOS, Android, and web applications.
- All Implanr APIs, dashboards, websites at **[implanr.com]**, and email communications.
- All workspace types: **Dental College** and **Dental Clinic** (Freelancer Consultant workspace will be governed by an addendum when launched).

It does **not** apply to third-party websites, services, or applications that integrate with Implanr (e.g., Google, Microsoft, Apple SSO, Stripe, payment gateways, App Store, Play Store), each of which has its own privacy policy.

---

## 3. Roles & responsibilities

| Workspace owner | Implanr's role | Their role |
|---|---|---|
| Dental College | Data Processor (PHI) | Data Controller / Fiduciary for student, supervisor, and patient records they create. |
| Dental Clinic | Data Processor (PHI) | Data Controller / Fiduciary for staff and patient records they create. |
| End user (dentist / student / staff / patient) | Data Fiduciary for the account profile we create for you | Data Principal whose rights this policy describes. |

When PHI is involved, the dental college or clinic ("**Customer**") is responsible for obtaining valid patient consent for use of the Service and for the lawful basis of processing under DPDP, the National Dental Commission (NDC) regulations, and any applicable healthcare law.

---

## 4. What information we collect

### 4.1 Information you give us directly
- **Account & identity data:** name, prefix (Dr / Mr / Mrs), email, mobile number (E.164 format), password (hashed; we never store plaintext), profile photo, role, qualifications.
- **Workspace data:** college / clinic name, registration number, state of registration, state of practice, number of seats, billing address.
- **Clinical data ("Clinical Content"):** diagnostic notes, intra-oral photographs, radiographs, treatment plans, implant brand / system / size selections, surgical reports, prosthesis details, healing notes, audit overrides, and PDF case reports. This may include **Sensitive Personal Data and PHI** about identified patients (name, age, sex, medical history, allergies).
- **Uploaded attachments:** PDFs, images, documents you upload (e.g., manufacturer brochures, consent forms, lab slips). Text is automatically extracted from PDFs to power AI search and recommendations.
- **Communications:** messages and attachments you send through the in-app **Chat** module, posts and replies in the **Discussion Forum**, support tickets, feedback, and survey responses.
- **Payment data:** for paid plans, billing contact, GSTIN (if applicable), and payment method tokens. **Card numbers / UPI IDs are processed by our payment processor (Stripe) and never stored on our servers.**

### 4.2 Information we collect automatically
- **Device & usage data:** device type, operating system, app version, IP address, time zone, language, crash logs, screen-view events, click events, and feature-usage counts.
- **Authentication telemetry:** login attempts (success/fail), session start/end, auto-logout events, IP and device fingerprint per session.
- **Audit logs (HIPAA-aligned):** every PHI view, edit, export, PDF download, role change, password reset, biological-safety override, and admin action. Audit logs include user ID, tenant ID, action, resource type, resource ID, IP, user-agent, and timestamp. Retention: **6 years minimum** (HIPAA), or longer per Indian medical record retention rules.
- **Cookies & local storage (web):** session cookie, CSRF token, theme preference, last-active timestamp for the 15-minute auto-logout. We do **not** use third-party advertising cookies.

### 4.3 Information we collect from third parties
- **Single Sign-On (SSO):** if you sign in with Google, Microsoft, or Apple, we receive your name, email, and profile photo per the SSO scopes you approve.
- **OTP delivery:** we send mobile OTPs via [Twilio / MSG91 / SMS provider]; the provider may log delivery status.
- **Email delivery:** invite and notification emails are sent via Google Workspace SMTP (`smtp.gmail.com`).
- **Push notifications:** Apple Push Notification Service (APNs) and Firebase Cloud Messaging (FCM). Tokens are stored to deliver alerts.

### 4.4 Information we do **not** collect
- We do **not** collect biometric data (Aadhaar, fingerprint, face) for authentication.
- We do **not** track precise GPS location in the background.
- We do **not** access your device's contacts, SMS history, or call logs.
- We do **not** sell your data to advertisers, brokers, or any third party — ever.

---

## 5. How we use your information

We use your information only for the purposes below and only with a lawful basis under the DPDP Act (consent, legitimate use, or legal obligation).

| Purpose | Lawful basis | Examples |
|---|---|---|
| Provide and maintain the Service | Performance of contract | Account creation, case management, PDF generation. |
| Clinical decision support | Performance of contract; Customer's legitimate interest | Bridge / cantilever detection, biological safety validation, AI explanations. |
| Authentication & security | Legitimate interest; legal obligation | Password hashing, OTP, 15-min auto-logout, brute-force protection, audit logs. |
| Customer support | Performance of contract | Replying to support tickets, troubleshooting bugs. |
| Service improvements | Legitimate interest | Aggregated, de-identified analytics on feature usage. |
| Legal & regulatory compliance | Legal obligation | Responding to subpoenas, tax filing, medical record retention. |
| Billing & payments | Performance of contract | Subscription invoicing, GST invoicing, refunds. |
| Marketing communications | Consent | Product updates, newsletters (you can opt out anytime). |
| AI-assisted features | Performance of contract; Customer instructions | "Ask Implanr" assistant, implant recommendation, PDF text extraction. |

**We do not** use Clinical Content (PHI) to train any general-purpose AI model. AI features are stateless calls to OpenAI / Anthropic / Google via the **Emergent LLM** key with no training opt-in. See § 8 (AI processing).

---

## 6. Sharing & disclosure

We share your data only in these scenarios:

### 6.1 Within your workspace
Other members of your dental college or clinic see data per their assigned role and the role-based access control matrix described in our help docs. **Workspace data is fully tenant-scoped** — a clinic never sees a college's data and vice versa.

### 6.2 Service providers (sub-processors)
We engage carefully selected third parties under written data-processing agreements. Current sub-processors:

| Sub-processor | Purpose | Data shared | Region |
|---|---|---|---|
| MongoDB Atlas (or self-hosted Mongo on Kubernetes) | Primary database | All operational data | India [or region] |
| Object storage (S3-compatible) | Attachments & images | PDFs, photos | India [or region] |
| Google Workspace (SMTP) | Transactional email | Recipient address, name, invite token | Global |
| [Twilio / MSG91] | Mobile OTP | Mobile number, OTP code | India / Global |
| Stripe | Payments & subscription billing | Billing address, payment token, amount | Global |
| OpenAI / Anthropic / Google (via Emergent LLM key) | AI prompts (anonymised where possible) | Selected case fields submitted to "Ask Implanr" | Global |
| Apple APNs, Google FCM | Push notifications | Device token, alert title/body | Global |
| Sentry / similar (if enabled) | Crash & error monitoring | Stack trace, masked user ID | Global |
| Expo Application Services | Mobile build & OTA update delivery | App version metadata | Global |

A current list of sub-processors is maintained at **[implanr.com/legal/subprocessors]**. We will provide 30 days' advance notice of any new sub-processor.

### 6.3 Legal disclosures
We may disclose information if required to do so by law, court order, or government request, including law-enforcement and regulatory bodies. We will challenge overbroad requests where lawful and notify the affected Customer unless legally prohibited.

### 6.4 Business transfers
If Implanr is involved in a merger, acquisition, or asset sale, your data may be transferred. We will give you notice before your data becomes subject to a different privacy policy.

### 6.5 De-identified, aggregated data
We may share fully **de-identified, aggregated** statistics (e.g., "mean number of implants placed per case, all customers") for research, marketing, or product analytics. De-identified data cannot reasonably be linked back to you or any patient.

### 6.6 What we will never share
- Plaintext passwords (we never have them).
- Card numbers, full UPI IDs, or bank account numbers (Stripe handles them).
- Patient PHI to advertisers, data brokers, or any party for marketing.

---

## 7. International transfers

Implanr is operated from India. If you access the Service from outside India, your data will be transferred to and processed on servers in **[India / region]**. Where required, we use Standard Contractual Clauses or equivalent safeguards under DPDP § 16 and the EU GDPR (where applicable) for cross-border transfers.

---

## 8. AI processing of your data

Implanr uses third-party large language model ("**LLM**") providers via the **Emergent Universal LLM** integration to power features such as "Ask Implanr", implant-system recommendations, and explainable suggestions.

- We send only the **minimum context** needed for the request (e.g., implant catalog metadata, your selected tooth numbers, the question you typed). We **do not** send the full case record unless you explicitly ask Implanr to summarise it.
- LLM providers have contractually agreed (a) not to train their models on our prompts and outputs, and (b) to delete prompts within 30 days of processing.
- AI suggestions are clinical decision *support*, not a substitute for professional judgment. The treating clinician is solely responsible for the final clinical decision.
- You can disable AI features for your workspace at **Settings → AI Features → Off**.

---

## 9. Data retention

| Data category | Retention period |
|---|---|
| Active account & profile | While your account is active. |
| Clinical Content & case PDFs | Per the Customer's medical record retention policy; default **10 years** from case closure (Indian medical record convention) and **6 years minimum** for any record subject to HIPAA. |
| Audit logs | **6 years minimum** (HIPAA) or longer per Indian law. |
| Authentication telemetry | 18 months. |
| Crash logs / device telemetry | 90 days. |
| Marketing communication records | Until you opt out + 1 year for compliance. |
| Backups | 35 days rolling, encrypted, isolated from production. |
| Deleted account residual data | Anonymised within 90 days of deletion request; backups expire within 35 days thereafter. |

Customers may request earlier deletion of their workspace data at any time; see § 11.

---

## 10. Security measures

We implement administrative, physical, and technical safeguards aligned with HIPAA Technical Safeguards and DPDP § 8(5):

- **Encryption** — TLS 1.2+ in transit; AES-256 at rest for database and object storage.
- **Access control** — role-based access; least-privilege; multi-factor authentication for engineering staff.
- **Auto-logout** — 15-minute inactivity timeout in the app, audit-logged.
- **Screen-capture blocking** — enabled on Android; iOS visual blur on app-switcher.
- **Audit logging** — every PHI view / export / override is logged.
- **Vulnerability management** — automated dependency scanning, quarterly third-party penetration tests, annual SOC-2-style internal review (target).
- **Backups** — encrypted, region-redundant, 35-day rolling retention.
- **Incident response** — 72-hour breach notification to the Indian Computer Emergency Response Team (CERT-In) per the IT Act 2000 and DPDP § 8(6).
- **Secure development** — code review on every change, secrets in environment variables only, no secrets in git.

No system is 100% secure. We cannot guarantee absolute security; if you discover a vulnerability, please email **[admin@implanr.com]**.

---

## 11. Your rights as a Data Principal

Under the DPDP Act 2023, and to the extent applicable to you under GDPR / HIPAA / other laws, you have the right to:

| Right | How to exercise |
|---|---|
| **Access** your personal data | Settings → Account → Download my data |
| **Correct** inaccurate data | Settings → Profile → Edit, or contact your workspace admin |
| **Erase** your account & data | Settings → Account → Delete account (90-day soft-delete; instant hard-delete on request) |
| **Withdraw consent** | Settings → Privacy → Manage consents; or email **[admin@implanr.com]** |
| **Data portability** | Settings → Account → Export data (JSON) |
| **Nominate** a representative for your data after death / incapacity | Settings → Account → Nominee |
| **Grievance redressal** | Email **[admin@implanr.com]**; we respond within **15 working days**. |

If you are a **patient** whose data is held in a college's or clinic's workspace, please first contact that organisation. If they do not respond satisfactorily, contact us; we will assist in resolving the issue per the DPDP grievance ladder.

You may also lodge a complaint with the **Data Protection Board of India** at the address published on **dpb.gov.in**.

---

## 12. Children's privacy

Implanr is intended for licensed dental professionals, students enrolled in accredited PG/UG programmes, and clinic staff. We do not knowingly collect personal data from any individual under 18. If you believe a child has created an account, contact **[admin@implanr.com]** and we will delete the account within 7 working days.

Patient records may include data about minor patients under their parents' / lawful guardians' explicit consent obtained by the treating dentist; that consent is the Customer's responsibility under the DPDP Act § 9.

---

## 13. Cookies & similar technologies

The Implanr web app uses:
- A **session cookie** (HttpOnly, Secure, SameSite=Strict) to keep you logged in.
- A **CSRF token cookie** to prevent cross-site request forgery.
- **Local storage** for theme preference and last-active timestamp (auto-logout).

We do **not** use third-party advertising cookies, retargeting pixels, or social-media trackers. Mobile apps follow Apple's App Tracking Transparency framework — we display "Data Not Linked to You" in our App Store privacy nutrition label.

---

## 14. Changes to this Privacy Policy

We may update this Privacy Policy from time to time. Material changes will be notified to you at least **30 days in advance** via in-app banner, email to your registered address, and an updated effective date at the top of this page. Continued use of the Service after the change date constitutes acceptance.

A version history is maintained at **[implanr.com/legal/privacy/changelog]**.

---

## 15. Contact us

For any questions, requests, or complaints regarding privacy or this policy:

- **Grievance Officer / Data Protection Officer**
  [Name]
  Email: **[admin@implanr.com]**
  Address: [Full postal address]
- **General privacy queries:** **[admin@implanr.com]**
- **Security incidents:** **[admin@implanr.com]**

We respond to all verified requests within **15 working days** (DPDP requirement).

---

*© [Year] [Legal Entity Name]. All rights reserved.*
