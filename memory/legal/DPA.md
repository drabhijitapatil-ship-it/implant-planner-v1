# Data Processing Addendum (DPA) — Implanr

**Effective date:** [DD MMM YYYY]
**Version:** 1.0

This Data Processing Addendum ("**DPA**") forms part of, and is incorporated by reference into, the Implanr Terms of Service ("**Terms**") between **[Legal Entity Name]** ("**Implanr**", "**Processor**") and the Customer ("**Controller**") (each a "**Party**", together the "**Parties**"). It governs the Processing of Personal Data and Protected Health Information by Implanr on the Controller's behalf in connection with the Service.

In the event of any conflict between this DPA and the Terms, this DPA prevails for matters of data protection.

---

## 1. Definitions

Capitalised terms not defined here have the meanings given in the Terms.

- "**Applicable Data Protection Law**" — every law, regulation, or binding code that applies to the Processing of Personal Data, including:
  - The Digital Personal Data Protection Act, 2023 (India) ("**DPDP Act**")
  - The Information Technology Act, 2000 and the IT (Reasonable Security Practices) Rules, 2011
  - The U.S. Health Insurance Portability and Accountability Act of 1996 and its implementing regulations ("**HIPAA**"), where applicable
  - The EU General Data Protection Regulation 2016/679 ("**GDPR**") and the UK GDPR, where applicable
  - Any successor or equivalent law
- "**Controller**" / "**Data Fiduciary**" — the Customer, who determines the purposes and means of Processing.
- "**Processor**" / "**Data Processor**" — Implanr, who Processes Personal Data on behalf of the Controller.
- "**Personal Data**" — any information relating to an identified or identifiable individual that is Processed under this DPA, including PHI.
- "**PHI**" — Protected Health Information as defined under HIPAA § 160.103.
- "**Data Principal**" / "**Data Subject**" — the individual to whom Personal Data relates.
- "**Sub-processor**" — any third party engaged by Implanr to Process Personal Data on Controller's behalf.
- "**Personal Data Breach**" — any unauthorised access, disclosure, alteration, loss, or destruction of Personal Data Processed under this DPA.

---

## 2. Subject matter, duration & scope

### 2.1 Subject matter
Implanr Processes Personal Data on the Controller's behalf to provide the Service described in the Terms.

### 2.2 Duration
This DPA applies for the entire period during which Implanr Processes Personal Data on the Controller's behalf, plus any post-termination retention period required by law or specified in § 11.

### 2.3 Categories of Data Subjects
- The Controller's End Users (dentists, students, supervisors, nurses, dental assistants, receptionists, administrators).
- Patients whose information is recorded by the Controller's End Users in the course of clinical workflow.

### 2.4 Categories of Personal Data
- Identification data (name, prefix, email, mobile, profile photo, qualifications)
- Authentication data (hashed password, OTP delivery records, session tokens)
- Clinical data / PHI (medical history, allergies, intra-oral exams, radiographs, treatment plans, implant selections, surgical reports, prosthesis details)
- Uploaded files (PDFs, images, documents)
- Communications (chat messages, forum posts, support tickets)
- Audit & access logs (who viewed/edited what, when, from which IP)
- Device & usage telemetry (OS, app version, crash logs, IP address)

### 2.5 Special categories
The Service is designed to Process special-category data (health data) under GDPR Art. 9 / DPDP Act § 9. The Controller is responsible for the lawful basis (typically Art. 9(2)(h) for healthcare in the EEA / explicit patient consent in India) and for record-keeping.

---

## 3. Roles & responsibilities

### 3.1 Controller's responsibilities
The Controller:
- Is responsible for the accuracy, quality, and lawfulness of Personal Data and the means by which it was acquired.
- Will provide all required notices and obtain all required consents (including patient consent for clinical record-keeping under DPDP § 6 and HIPAA § 164.508 where applicable).
- Will use reasonable means to maintain the accuracy of Personal Data and to inform Implanr of any required corrections.
- Determines the configuration choices (e.g., enabling AI features, retention windows, role assignments).

### 3.2 Implanr's responsibilities
Implanr:
- Will Process Personal Data only on the Controller's documented instructions, including with regard to international transfers, unless required to do so by law (in which case Implanr will inform the Controller of that legal requirement before Processing, unless the law prohibits notification).
- Will ensure persons authorised to Process Personal Data are bound by appropriate confidentiality obligations.
- Will implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk (see § 6).
- Will assist the Controller in fulfilling Data Subject rights (see § 7).
- Will notify the Controller of Personal Data Breaches without undue delay (see § 8).
- Will assist the Controller with Data Protection Impact Assessments and consultation with supervisory authorities, where applicable.

### 3.3 Documented instructions
This DPA, the Terms, the configuration of the Service available to Controller administrators, and any subsequent written instructions agreed in writing constitute the Controller's documented instructions to Implanr. Implanr will inform the Controller without delay if, in Implanr's opinion, an instruction infringes Applicable Data Protection Law.

---

## 4. Sub-processing

### 4.1 General authorisation
The Controller grants Implanr general written authorisation to engage Sub-processors, subject to the terms of this section.

### 4.2 List of Sub-processors
A current list of Sub-processors is published at **[implanr.com/legal/subprocessors]**. The list includes:

| Sub-processor | Service provided | Data categories | Region |
|---|---|---|---|
| MongoDB Atlas (or self-hosted) | Database hosting | All operational data | India / [region] |
| Object storage (S3-compatible) | File / image / PDF storage | Attachments | India / [region] |
| Google Workspace SMTP | Transactional email | Email address, name, invite token | Global |
| Twilio Verify / MSG91 | Mobile-OTP | Mobile number | Global / India |
| Stripe | Payments | Billing details, payment token | Global |
| OpenAI / Anthropic / Google (via Emergent LLM key) | AI assistant prompts | Selected non-PHI fields submitted by user | Global |
| Apple APNs, Google FCM | Push notifications | Device token, alert title/body | Global |
| Sentry / monitoring | Crash & error monitoring | Stack traces, masked user ID | Global |
| Expo Application Services | Mobile build & OTA delivery | App version metadata | Global |

### 4.3 Notification of changes
Implanr will give the Controller at least **30 days' prior written notice** of any new Sub-processor or replacement of an existing Sub-processor. Notice will be by in-app banner and email to the Controller's billing/admin address.

### 4.4 Right to object
The Controller may object to a new Sub-processor in writing within the 30-day notice period on reasonable grounds related to data protection. If the Parties cannot reach agreement within 15 working days of objection, the Controller may terminate the affected portion of the Service without penalty by giving written notice.

### 4.5 Sub-processor obligations
Implanr will impose data protection obligations on each Sub-processor that are no less protective than those in this DPA, by written contract, and remains fully liable to the Controller for the performance of each Sub-processor.

---

## 5. International transfers

### 5.1 Indian law
Where the DPDP Act applies, Implanr will only transfer Personal Data outside India to countries permitted by the Government of India under DPDP § 16 and as listed in the Sub-processors table.

### 5.2 EEA / UK transfers
Where Personal Data of Data Subjects in the EEA, UK, or Switzerland is transferred to a country not deemed adequate, the Parties will rely on the European Commission's Standard Contractual Clauses (Module 2 — Controller to Processor) or the UK Addendum, as appropriate, which are incorporated into this DPA by reference. Implanr will execute these clauses upon written request.

### 5.3 Onward transfers
For transfers from a Sub-processor in one jurisdiction to another, Implanr ensures back-to-back contractual protections.

---

## 6. Security measures

### 6.1 Technical & organisational measures
Implanr implements at minimum the following measures (further detailed in **Annex A**):

| Domain | Measure |
|---|---|
| Encryption | TLS 1.2+ in transit; AES-256 at rest for database, object storage, and backups |
| Access control | Role-based access; least-privilege; multi-factor authentication for engineering staff |
| Authentication | Bcrypt-hashed passwords; mobile-OTP; SSO; 15-minute inactivity auto-logout |
| Network security | VPC isolation; firewall; ingress restriction; rate limiting; WAF |
| Vulnerability management | Automated dependency scanning; quarterly third-party penetration test; coordinated vulnerability disclosure |
| Logging & monitoring | Audit log of all PHI access (6-year retention); anomaly detection |
| Backup & recovery | Encrypted, region-redundant; 35-day rolling retention; documented restore procedure |
| Personnel | Background checks; confidentiality agreements; mandatory data-protection training |
| Physical security | Cloud provider's certified data centres (ISO 27001 / SOC-2) |
| Incident response | 24/7 on-call; documented playbook; post-incident review |
| Application controls | Screen-capture blocking on Android; biological-safety override audit; brute-force protection |

### 6.2 HIPAA Technical Safeguards
For Customers subject to HIPAA, Implanr implements the Technical Safeguards required under 45 C.F.R. § 164.312:
- Access control (§ 164.312(a)) — unique user identification, automatic logoff, encryption.
- Audit controls (§ 164.312(b)) — comprehensive PHI access logging.
- Integrity (§ 164.312(c)) — change history, edit attribution.
- Person/entity authentication (§ 164.312(d)) — password + optional OTP.
- Transmission security (§ 164.312(e)) — TLS 1.2+ end-to-end.

### 6.3 Updates to security measures
Implanr may update the security measures from time to time provided the new measures do not materially diminish the level of protection afforded to Personal Data.

---

## 7. Data Subject rights

Implanr will, taking into account the nature of the Processing and to the extent reasonably possible, assist the Controller by appropriate technical and organisational measures in fulfilling the Controller's obligation to respond to requests from Data Subjects exercising their rights of access, rectification, erasure, restriction, portability, and objection. Specifically:

- **Self-service tools:** the Service includes administrative tools enabling the Controller to access, correct, export, and delete Personal Data without assistance from Implanr.
- **Direct requests:** if a Data Subject contacts Implanr directly with a rights request, Implanr will (a) acknowledge the request, (b) refer the Data Subject to the Controller, and (c) notify the Controller within 5 working days unless legally prohibited.
- **Specific support:** for complex requests, Implanr will provide reasonable assistance at no additional charge for up to 4 hours per quarter; additional assistance is billable at Implanr's standard professional services rate.

---

## 8. Personal Data Breach notification

### 8.1 Notification by Implanr
Implanr will notify the Controller of any Personal Data Breach affecting the Controller's Personal Data **without undue delay and in any event within 48 hours** of becoming aware. Notification will include, to the extent then known:

- The nature of the breach, including the categories and approximate number of Data Subjects and Personal Data records concerned.
- The likely consequences.
- The measures taken or proposed to address the breach and to mitigate possible adverse effects.
- The name and contact details of Implanr's data protection contact.

### 8.2 Information updates
Implanr will provide updates as further information becomes available and will cooperate with the Controller's investigation.

### 8.3 Controller's obligations
The Controller is responsible for assessing whether the breach must be notified to a supervisory authority (e.g., the Data Protection Board of India under DPDP § 8(6), or supervisory authorities under GDPR Art. 33) and to affected Data Subjects.

### 8.4 CERT-In compliance
Where required by Indian law, Implanr will report cybersecurity incidents to the Indian Computer Emergency Response Team (CERT-In) within 6 hours under the IT Act 2000 directives.

---

## 9. Audits & inspections

### 9.1 Audit reports
Implanr will make available to the Controller, on request, the most recent third-party audit report, penetration test summary, and any relevant compliance certifications (e.g., SOC-2 Type II, ISO 27001), subject to confidentiality undertakings.

### 9.2 Inspections
Where the audit reports do not provide sufficient information, the Controller may, on **30 days' written notice** and no more than once per calendar year (except after a Personal Data Breach affecting the Controller), conduct an inspection at Implanr's premises during business hours. The Controller bears its own costs and Implanr's reasonable costs of supporting the inspection.

### 9.3 Confidentiality
All information obtained during an audit or inspection is Implanr's Confidential Information.

---

## 10. Return & deletion

### 10.1 During the term
The Controller may export Personal Data at any time using the Service's data-export functionality.

### 10.2 On termination
On termination or expiry of the Terms, Implanr will, at the Controller's choice expressed in writing within 30 days:
- Return all Personal Data in a structured, commonly used, machine-readable format (JSON / CSV / PDF, plus binary attachments); or
- Permanently delete all Personal Data from production systems within 90 days, and from backups within 35 days thereafter.

If the Controller does not express a choice within 30 days, Implanr will delete the Personal Data per the second option.

### 10.3 Mandatory retention
Implanr may retain Personal Data only to the extent and for the period required by Applicable Data Protection Law (e.g., audit logs under HIPAA § 164.530(j) for 6 years; medical records under Indian law for 10 years). Retained data remains subject to this DPA.

### 10.4 Certification
On the Controller's written request, Implanr will provide a written certification of deletion within 15 working days of completion.

---

## 11. Liability

The liability of each Party under or in connection with this DPA is governed by the limitations and exclusions of liability set out in the Terms. Each Party's aggregate liability arising from this DPA is included in (and not in addition to) the cap set out in the Terms.

---

## 12. Term & survival

This DPA enters into force on the Effective Date and remains in force for so long as Implanr Processes Personal Data on the Controller's behalf, and thereafter for the periods reasonably necessary to comply with §§ 8, 9, and 10.

---

## 13. Conflict & severability

In the event of any conflict between this DPA and the Terms regarding data protection, this DPA prevails. If any provision of this DPA is held invalid or unenforceable, the rest remains in full force.

---

## 14. Governing law & jurisdiction

This DPA is governed by the laws of India and subject to the dispute-resolution provisions of the Terms, except that for Data Subjects in the EEA / UK, the Standard Contractual Clauses incorporated under § 5 are governed by the laws of [Ireland / England & Wales] respectively, as required by those clauses.

---

## Annex A — Technical & Organisational Measures (TOMs)

### A.1 Confidentiality
- **Access control to processing systems:** unique user IDs, role-based access, MFA for privileged users, automatic logoff after 15 minutes, password policy (min 8 chars, bcrypt cost 12+), brute-force lockout.
- **Access control to data:** least-privilege, tenant isolation enforced at the application and database query level, audit logging of all PHI access.
- **Pseudonymisation & anonymisation:** AI prompts use anonymised case fields where possible; de-identified statistics for analytics.

### A.2 Integrity
- **Input control:** server-side validation, immutable audit log, signed PDF case reports.
- **Transfer control:** TLS 1.2+, certificate pinning on mobile clients, no plain HTTP.
- **Disclosure control:** explicit consent screens, data export rate-limited, redaction where applicable.

### A.3 Availability & resilience
- **Uptime target:** 99.5% per calendar month.
- **Backups:** encrypted (AES-256), region-redundant, 35-day rolling retention.
- **Disaster recovery:** documented runbook, RTO ≤ 4 hours, RPO ≤ 1 hour, annual restore drill.
- **Monitoring:** 24/7 alerting, on-call rotation, incident playbooks.

### A.4 Process for regular testing, assessment & evaluation
- Automated CI dependency scans on every commit.
- Quarterly third-party penetration test.
- Annual SOC-2-style internal review (target SOC-2 Type II certification within 18 months of GA).
- Coordinated vulnerability disclosure programme: **[admin@implanr.com]**.

### A.5 Personnel
- Mandatory data-protection training on hire and annually.
- Background checks for personnel with PHI access.
- Confidentiality undertakings in employment / contractor agreements.
- Access revocation within 4 hours of role change / termination.

---

## Annex B — Sub-processors

The current list is published at **[implanr.com/legal/subprocessors]** and updated at least 30 days before any new Sub-processor begins Processing.

---

## Annex C — Standard Contractual Clauses

For transfers from the EEA / UK, the European Commission's Standard Contractual Clauses (Decision 2021/914, Module 2) and the UK ICO's International Data Transfer Addendum, as applicable, are incorporated by reference. The Parties select:

- Clause 7 (Docking clause): not used.
- Clause 9 (Sub-processing): Option 2 — General written authorisation, 30-day notice.
- Clause 11 (Redress): independent dispute resolution body not selected.
- Clause 17 (Governing law): law of Ireland.
- Clause 18 (Choice of forum): courts of Ireland.

Annex I (Parties), Annex II (Description of transfer), Annex III (Technical and organisational measures), and Annex IV (Sub-processors) are populated by reference to the body of this DPA and Annexes A–B.

---

## 15. Execution

This DPA is incorporated into and forms part of the Terms. By accepting the Terms or continuing to use the Service after the effective date, the Controller is deemed to have accepted this DPA. A Controller-signed copy is available on request to **[legal@implanr.com]**.

---

*© [Year] [Legal Entity Name]. All rights reserved.*
