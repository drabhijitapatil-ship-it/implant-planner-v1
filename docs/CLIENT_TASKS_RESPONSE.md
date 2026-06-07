# Client Tasks — My Plan & Response

---

## Task 1 — Two Different Workflows: Dental College vs Dental Clinic

### What's the difference?

| Aspect | Dental College | Dental Clinic |
|--------|---------------|---------------|
| Users | Students + Supervisors + Nurses + Admin | Dentists + Assistants + Admin |
| Case flow | Student creates → Supervisor reviews → Approve per phase | Dentist creates → manages solo or with team |
| Approval gates | Mandatory at each phase | Optional internal review |
| AI features | Full (learning-focused, with explanations) | Streamlined (efficiency-focused) |
| Reporting | Student progress tracking, supervisor summaries | Clinic production reports, patient history |
| Compliance focus | Educational standards + HIPAA | Clinical standards + HIPAA |

### What needs to be built

1. **`org_type` field on user/organization** — `"college"` or `"clinic"` — set at signup
2. **Organization model in DB** — `organizations` collection with type, subscription tier, member list
3. **Workflow routing** — after login, app reads `org_type` and loads appropriate layout/navigation
4. **College workflow** (mostly exists already — refine):
   - Student creates case → phases locked until supervisor approves each one
   - Supervisor dashboard with student overview
   - Progress analytics per student
5. **Clinic workflow** (new):
   - Dentist creates case → moves through phases without mandatory approval gates
   - Optional: assign to colleague for second opinion
   - Faster flow, less bureaucracy
   - Focus on patient records, not academic evaluation
6. **Role mapping**:
   - College: `student`, `supervisor`, `nurse`, `admin`
   - Clinic: `dentist`, `assistant`, `admin`
7. **Feature flags per org_type** — some screens only show for college (student progress, nudge system), some only for clinic (production reports)

### Key file changes
- `backend/server.py` — new `organizations` collection, `org_type` on user, workflow routing logic
- `frontend/contexts/AuthContext.tsx` — store `org_type`, expose to all screens
- `frontend/app/(tabs)/_layout.tsx` — conditional tab structure based on `org_type`
- `frontend/app/auth/register.tsx` — org type selection step

---

## Task 2 — Sign Up Flow for Both

### Current state
Single register screen. No org differentiation. No invite system.

### What I'll build

**Step 1 — Choose your setup (new onboarding screen)**
- "I'm setting up for a Dental College" / "I'm setting up for a Dental Clinic"
- Stores `org_type` in registration flow

**Step 2 — Organization setup**
- College: college name, city, country, number of students (approx)
- Clinic: clinic name, address, number of dentists

**Step 3 — Admin account creation**
- First person who signs up becomes org admin
- Email + password + name + role

**Step 4 — Invite team**
- Admin gets a unique invite link/code
- Share with students (college) or dentists (clinic)
- Invitee opens link → app → pre-filled org, just creates personal account

**Step 5 — Role assignment**
- College: invited users pick `student` or `supervisor`
- Clinic: invited users pick `dentist` or `assistant`

### Backend changes needed
- `POST /organizations` — create org
- `POST /organizations/invite` — generate invite token
- `GET /organizations/join/:token` — validate + pre-fill registration
- `organizations` MongoDB collection
- User gets `org_id` field linking to their organization

### Frontend changes
- New multi-step signup flow (replace single-screen register)
- Invite landing screen
- Role picker during registration

---

## Task 3 — HIPAA Compliance, Terms of Use & Privacy Policy

### What's already done
- 15-minute session timeout
- Screenshot prevention (iOS + Android)
- Audit logs in MongoDB
- JWT token blocklist on logout
- Bcrypt password hashing
- Pydantic input validation + XSS sanitization
- Terms (`legal/terms.tsx`) and Privacy Policy (`legal/privacy-policy.tsx`) screens exist

### What still needs to be verified / completed

**Technical HIPAA requirements:**
- [ ] **Encryption at rest** — MongoDB Atlas (if used) has this. Self-hosted needs explicit disk encryption. Confirm this is set up.
- [ ] **Encryption in transit** — HTTPS everywhere. Verify TLS cert on backend server. No HTTP fallback.
- [ ] **Access controls** — Role-based already implemented. Verify no endpoint leaks cross-user data.
- [ ] **Audit log completeness** — Every PHI access (view, edit, export) must be logged. Check current audit scope — case creates and updates logged? Photo views? PDF exports?
- [ ] **Data retention policy** — How long is patient data kept? Need a deletion endpoint for patients. Need to define this in policy.
- [ ] **Breach notification plan** — Not a code thing, but need documented process for what happens if DB is compromised.
- [ ] **BAA (Business Associate Agreement)** — If using AWS S3, MongoDB Atlas, OpenAI, Gemini — need BAAs with each. OpenAI and Gemini BAA availability needs to be confirmed before going live with real patient data.

**Legal documents:**
- Current Terms and Privacy Policy screens exist but content needs legal review
- Need a licensed attorney to review both before app store submission
- Privacy Policy must explicitly mention: what PHI is collected, how it's stored, who has access, retention period, user rights
- Terms must cover: user responsibilities, data handling, liability limitations, HIPAA responsibilities of the user organization

**App store HIPAA note:**
- App Store submission — healthcare apps must clearly state if they handle PHI
- Do NOT claim HIPAA compliance in store listing unless certified — say "designed with HIPAA in mind" or "HIPAA-conscious features"

---

## Task 4 — Thorough Testing

### What's already done
- 103 backend integration tests (FastAPI endpoints, workflows, edge cases)

### What's missing

**Frontend testing:**
- No automated frontend tests currently
- Need to add **Maestro** (simpler) or **Detox** (more powerful) for E2E mobile testing
- Key flows to test: login → create case → submit phase → supervisor approve → complete
- Recommendation: Maestro — easier setup, YAML-based, works with Expo

**Manual QA checklist I'll create:**
- Auth: register, login, logout, timeout, refresh
- Case CRUD: create, edit, archive, restore
- All 4 phases: each submission path, each role's view
- Implant planning: tooth selection, AI recommendations, safety overrides
- Drilling protocol: all 15 brands
- PDF export: case summary, consent form
- Photo upload, CBCT upload
- Forum: post, reply, react, share case
- Chat: create group, send message
- Notifications: push notification delivery
- Admin: user management, catalog edit
- Nurse: calendar, consent view
- Offline/poor network behavior

**Device testing matrix:**
- iOS: iPhone 15, iPhone 12, iPhone SE (smallest)
- Android: Samsung Galaxy S24, Pixel 7, older mid-range device
- iPad: at least one tablet test (TabletFrame component exists)

**Performance:**
- Load test backend with 50+ concurrent users (use Locust or k6)
- Measure AI endpoint response times (OpenAI/Gemini can be slow)

---

## Task 5 — Making App Ready for Launch

### iOS App Store requirements
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) — required for iOS 17+, must declare API usage
- [ ] All permission strings in `app.json` must be user-friendly (camera, photos, notifications)
- [ ] App icon: 1024x1024 PNG, no alpha channel
- [ ] Screenshots: required sizes for iPhone 6.7", 6.5", 5.5" and iPad 12.9"
- [ ] App description: clear, no keyword stuffing, mention dental implant planning
- [ ] Age rating: 4+ (medical professional tool)
- [ ] Content rights: confirm you own all implant brand data
- [ ] Review notes for App Review: explain what the app does, provide test credentials

### Android Play Store requirements
- [ ] Target SDK 34 (Android 14) minimum for 2024+ submissions
- [ ] Permissions: remove any unused permissions from `AndroidManifest.xml`
- [ ] App bundle (AAB) not APK for store submission — EAS Build handles this
- [ ] Play Store listing: feature graphic (1024x500), screenshots for phone + tablet
- [ ] Data safety form: declare PHI collection, encryption, sharing practices
- [ ] Content rating questionnaire: complete IARC rating

### EAS Build config (already present, verify):
- `eas.json` has production profile configured
- Bundle IDs set in `app.json`
- Push notification certificates configured

---

## Task 6 — App Submission

### iOS (Apple)
1. Set up App Store Connect account (Apple Developer Program) (Already Done)
2. Create app listing in App Store Connect
3. Run: `eas build --platform ios --profile production`
4. Upload build: `eas submit --platform ios`
5. Fill metadata (description, screenshots, privacy URL)
6. Submit for review (typically 1-3 days review time)
7. TestFlight first — send to beta testers, get feedback, then submit to production

### Android (Google) 
1. Set up Google Play Console account  (Already Done)
2. Create app in Play Console
3. Run: `eas build --platform android --profile production`
4. Upload: `eas submit --platform android`
5. Start with Internal Testing → Closed Testing → Production rollout
6. Fill store listing, data safety form, content rating
7. Production review typically 1-3 days for new apps

### Timeline estimate
- TestFlight/Internal: 1 week
- Beta testing: 1-2 weeks
- Production submission: 1-2 weeks review
- Total: 4-6 weeks from code freeze to live on both stores

---

## Task 7 — Handling Store Review Queries

### Most common rejection reasons for medical/healthcare apps

**Apple:**
- Missing or broken privacy policy URL → privacy policy must be live on web, not just in-app
- PHI handling not explained in review notes → write detailed notes explaining what data is collected and how it's protected
- Permissions not justified → must explain every permission request in review notes
- In-app purchase required for core features not disclosed → clearly state what's free vs paid
- HIPAA claims → don't claim "HIPAA certified" (nobody self-certifies)

**Google:**
- Data safety form incomplete → fill every section matching actual behavior
- Sensitive permission usage → justify camera, storage in declaration form
- Target audience unclear → confirm it's for dental professionals only (not general public)

### How I'll handle queries
- Monitor App Store Connect and Play Console daily during review
- Respond within 24 hours to any Reviewer questions
- Keep test credentials ready (test dentist account + test student account)
- Document all app features in review notes upfront to reduce back-and-forth

---

## My Additional Recommendations (Not Asked But Important)


### 1. Data residency
If targeting international markets (EU especially), need to know where MongoDB data is hosted. EU customers will ask about GDPR, not just HIPAA.

### 2. BAA with AI providers before clinical use (Just Asking)
Using OpenAI or Gemini with real patient data requires a Business Associate Agreement. OpenAI does offer a BAA (under their Enterprise agreement). Google Cloud Healthcare API is HIPAA-eligible. Standard OpenAI API and standard Gemini API are NOT covered by BAA — this is a compliance risk for real clinical data.

### 3. App Store review: provide demo video
For medical apps, App Review often needs to see the app in action. Record a 2-minute Loom of the full workflow. Include link in review notes.


---
