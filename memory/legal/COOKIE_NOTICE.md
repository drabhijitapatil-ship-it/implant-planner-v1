# Cookie Notice — Implanr

**Effective date:** [DD MMM YYYY]
**Last updated:** [DD MMM YYYY]
**Version:** 1.0

This Cookie Notice explains how **[Legal Entity Name]** ("**Implanr**", "**we**", "**us**") uses cookies and similar technologies on the Implanr web application at **[implanr.com]** and on any subdomain. It supplements our [Privacy Policy](./PRIVACY_POLICY.md) and [Terms of Service](./TERMS_OF_SERVICE.md).

---

## 1. What are cookies?

A **cookie** is a small text file that a website places on your device (computer, tablet, or smartphone) when you visit. Cookies allow the website to recognise your device on subsequent visits and to remember information about your preferences and activity.

Beyond cookies, websites and apps may also use **similar technologies** such as:
- **Local storage** (`localStorage`, `sessionStorage`) — small amounts of data stored in your browser by the website.
- **IndexedDB** — a larger client-side database.
- **Pixel tags / web beacons** — tiny invisible images embedded in pages or emails to track interactions.
- **Mobile identifiers** (IDFA, AAID) — used by mobile operating systems.

For brevity, this notice refers to all of these as "**cookies**" unless distinguished.

---

## 2. The Implanr cookie philosophy

Implanr is a clinical workflow tool, not an ad-supported product. We use the **minimum** number of cookies required to deliver the Service securely. Specifically:

- ✅ We use **strictly necessary** cookies for authentication, security, and session management.
- ✅ We use **functional** cookies to remember your preferences (theme, last-active timestamp).
- ❌ We do **not** use third-party advertising cookies.
- ❌ We do **not** sell cookie data, IDs, or browsing behaviour to any party.
- ❌ We do **not** use re-targeting pixels (Meta, Google Ads, LinkedIn, etc.).
- ❌ We do **not** use social-media trackers (FB Pixel, Twitter Pixel, etc.).

---

## 3. Categories of cookies we use

### 3.1 Strictly necessary (always on)
These cookies are essential for the Service to function. You cannot opt out without breaking the app.

| Cookie / item | Purpose | Type | Duration |
|---|---|---|---|
| `implanr_session` | Session authentication after login | HttpOnly, Secure, SameSite=Strict | Session (≤ 8 hours) |
| `csrf_token` | Prevents Cross-Site Request Forgery | Secure, SameSite=Strict | Session |
| `last_activity` (localStorage) | Drives 15-minute auto-logout for HIPAA | First-party | Session |
| `device_fingerprint_hash` | Brute-force protection on login | First-party | 30 days |

### 3.2 Functional (always on, but data is local)
| Cookie / item | Purpose | Type | Duration |
|---|---|---|---|
| `theme` (localStorage) | Remembers light/dark mode preference | First-party | Persistent |
| `lang` (localStorage) | Remembers language preference | First-party | Persistent |
| `tenant_pref` (localStorage) | Remembers last-active workspace for multi-tenant users | First-party | Persistent |

### 3.3 Performance & error monitoring (opt-in)
We use a privacy-respecting error monitoring service (e.g., Sentry) to capture crashes and unhandled exceptions. By default this is enabled with **fully masked user identifiers** so we cannot link an error to an individual user. You can disable it from **Settings → Privacy → Crash Reporting**.

### 3.4 Analytics (opt-in)
| Cookie / item | Purpose | Type | Duration |
|---|---|---|---|
| `analytics_session_id` | Aggregated, IP-truncated usage analytics | First-party | Session |

Analytics are **off by default** and only run if you opt in via **Settings → Privacy → Product Analytics**. We do not use Google Analytics, Mixpanel, Amplitude, or any third-party analytics SDK that ships data outside our control.

### 3.5 Mobile app
Our iOS and Android apps do **not** use the IDFA / AAID for tracking. We honour Apple's App Tracking Transparency framework and display "Data Not Linked to You" in our App Store privacy nutrition label.

The mobile apps store the following on-device:
- Authentication token (in iOS Keychain / Android Keystore — encrypted by the OS).
- Last-active timestamp (for auto-logout).
- Device push notification token.
- Cached attachment thumbnails (purgeable from Settings).

---

## 4. Third-party cookies

We use a small number of third-party services that may set cookies on your behalf. Each is listed below with the cookie's purpose and where to learn more.

| Provider | Purpose on Implanr | When it sets cookies | More info |
|---|---|---|---|
| Stripe | Payment & fraud detection on the billing page | Only when you visit `/settings/billing` | https://stripe.com/cookies |
| Google Workspace SMTP | Transactional email delivery | Never sets browser cookies on Implanr | https://policies.google.com/technologies/cookies |
| Apple / Google SSO (when enabled) | Sign-in with Google / Microsoft / Apple | Only on the SSO redirect page | Provider's own policy |
| Sentry / monitoring | Crash reporting | Only if you opt in | https://sentry.io/privacy |

We do **not** allow these providers to use cookies for advertising or cross-site tracking.

---

## 5. Cookie consent

### 5.1 What requires consent
Per the EU GDPR, the UK GDPR, and the Indian DPDP Act 2023, **strictly necessary** cookies do not require consent. **All other** cookies (functional, analytics, performance) require your **freely-given, specific, informed, and unambiguous** consent before they are set.

### 5.2 Our consent banner
The first time you visit the Implanr web app from a region requiring consent (EEA / UK / India), we display a cookie banner with three clearly equal options:

- **Accept all**
- **Reject all** (only strictly-necessary cookies remain)
- **Manage preferences** (granular toggles per category)

The "Reject all" option is **as prominent as** the "Accept all" option, per EDPB and ICO guidance.

### 5.3 Withdraw consent
You can change or withdraw your consent at any time from **Settings → Privacy → Cookie Preferences** in the web app.

### 5.4 Mobile apps
The mobile apps do not show a cookie banner because they do not set tracking cookies. Functional preferences (theme, language) are managed in **Settings → Preferences**, and crash reporting / analytics opt-ins are at **Settings → Privacy**.

---

## 6. How to control cookies in your browser

You can also control cookies in your browser settings:

- **Chrome**: Settings → Privacy and security → Cookies and other site data
- **Firefox**: Preferences → Privacy & Security → Cookies and Site Data
- **Safari (desktop)**: Preferences → Privacy → Manage Website Data
- **Safari (iOS)**: Settings → Safari → Privacy & Security
- **Edge**: Settings → Cookies and site permissions
- **Brave**: Shields → Cookies

Blocking strictly-necessary cookies will break the Service — you will not be able to log in.

For mobile-OS-level tracking controls:
- **iOS**: Settings → Privacy & Security → Tracking → "Allow Apps to Request to Track" (off)
- **Android**: Settings → Privacy → Ads → Reset / Delete advertising ID

---

## 7. Do Not Track (DNT) & Global Privacy Control (GPC)

We honour the **Global Privacy Control (GPC)** signal where it is recognised in law. When we detect a GPC `Sec-GPC: 1` header, we treat your visit as if you had selected "Reject all" in the cookie banner.

We do not currently respond to the legacy "Do Not Track" (`DNT`) header because no consensus exists on its meaning, but we plan to support GPC fully for all visitors regardless of region by [target date].

---

## 8. Children

The Service is not intended for individuals under 18. We do not knowingly set cookies for, or collect data via cookies from, anyone under 18.

---

## 9. Changes to this Cookie Notice

We may update this Cookie Notice from time to time. Material changes will be highlighted by an in-app banner and a refreshed effective date at the top of this page. The current version is always available at **[implanr.com/legal/cookies]**.

---

## 10. Contact

For questions about cookies or this Notice:

- **Privacy enquiries:** **[privacy@implanr.com]**
- **Grievance Officer:** **[admin@implanr.com]**
- **Postal address:** [Full postal address]

---

*© [Year] [Legal Entity Name]. All rights reserved.*
