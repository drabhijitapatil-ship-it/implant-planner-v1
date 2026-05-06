import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../components/BackButton';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.pageHeader}>
        <BackButton testID="privacy-back-btn" />
        <Text style={styles.pageHeaderTitle} numberOfLines={1}>Privacy Policy</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} data-testid="privacy-policy-screen">
        <Text style={styles.h1}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: February 2026 · Version 1.0</Text>

        <Section title="1. Who we are">
          This Privacy Policy describes how Implanr ("we", "us") collects, uses, stores, shares, and protects your information when you use the Implanr mobile application, web application, or any related services (the "Service"). We are the Data Fiduciary under India's Digital Personal Data Protection Act, 2023 ("DPDP Act") for personal data we determine the purpose and means of processing. Where we process Protected Health Information ("PHI") on behalf of a dental college or clinic, that organisation is the controller and we act as a data processor.{"\n\n"}
          Grievance Officer: grievance@implanr.com{"\n"}
          General contact: info@implanr.com{"\n"}
          Security incidents: security@implanr.com
        </Section>

        <Section title="2. Scope">
          This policy applies to the Implanr iOS, Android, and web applications, all Implanr APIs, dashboards, websites, and email communications. It covers two workspace types — Dental College and Dental Clinic. It does not apply to third-party services that integrate with Implanr (Google, Microsoft, Apple SSO, Stripe, App Store, Play Store), each of which has its own policy.
        </Section>

        <Section title="3. Roles & responsibilities">
          • Dental College / Clinic: Data Controller / Fiduciary for staff, student, and patient records they create. Responsible for valid patient consent.{"\n"}
          • Implanr: Data Processor when handling PHI; Data Fiduciary for the account profile we create for you.{"\n"}
          • End User (you): Data Principal whose rights this policy describes.
        </Section>

        <Section title="4. What we collect">
          4.1 You give us directly:{"\n"}
          • Account & identity: name, prefix, email, mobile (E.164), hashed password, profile photo, role, qualifications.{"\n"}
          • Workspace: college / clinic name, registration number, state, seats, billing address.{"\n"}
          • Clinical Content: diagnostic notes, intra-oral photos, radiographs, treatment plans, implant brand / system / size, surgical reports, prosthesis details, audit overrides, and PDF case reports. May include patient-identified PHI.{"\n"}
          • Uploaded attachments: PDFs, images, documents. Text is auto-extracted from PDFs to power AI search.{"\n"}
          • Communications: Chat messages, Forum posts, support tickets, feedback.{"\n"}
          • Payment data: billing contact, GSTIN, payment method tokens. Card numbers / UPI IDs are processed by Stripe and never stored on our servers.{"\n\n"}
          4.2 We collect automatically:{"\n"}
          • Device & usage data, crash logs, screen-view events, click events.{"\n"}
          • Authentication telemetry (login attempts, sessions, auto-logout, IP, device fingerprint).{"\n"}
          • Audit logs (HIPAA-aligned): every PHI view / edit / export / PDF download / role change / safety override. Retention: 6 years minimum.{"\n"}
          • Cookies & local storage on web (session, CSRF, theme, last-active timestamp). See our Cookie Notice.{"\n\n"}
          4.3 From third parties:{"\n"}
          • SSO (Google / Microsoft / Apple) — name, email, photo per scopes you approve.{"\n"}
          • OTP delivery providers — delivery status.{"\n"}
          • Email & push providers — delivery telemetry, device tokens.{"\n\n"}
          4.4 We do NOT collect:{"\n"}
          • Biometrics (Aadhaar, fingerprint, face) for authentication.{"\n"}
          • Background GPS location.{"\n"}
          • Contacts, SMS, or call logs.{"\n"}
          • We never sell your data — to anyone, ever.
        </Section>

        <Section title="5. How we use your information">
          • Provide and maintain the Service (account, cases, PDFs).{"\n"}
          • Clinical decision support (bridge / cantilever detection, biological safety, AI explanations).{"\n"}
          • Authentication & security (password hashing, OTP, 15-min auto-logout, brute-force protection, audit logs).{"\n"}
          • Customer support and bug investigation.{"\n"}
          • Service improvements via aggregated, de-identified analytics.{"\n"}
          • Legal & regulatory compliance (subpoenas, tax filing, medical record retention).{"\n"}
          • Billing, payments, and GST invoicing.{"\n"}
          • Marketing communications (only with your consent; you can opt out anytime).{"\n\n"}
          We do NOT use Clinical Content (PHI) to train any general-purpose AI model. AI features are stateless calls to OpenAI / Anthropic / Google with no training opt-in.
        </Section>

        <Section title="6. Sharing & sub-processors">
          Within your workspace, others see data per the role-based access control matrix. Workspace data is fully tenant-scoped — a clinic never sees a college's data and vice versa.{"\n\n"}
          Our sub-processors (under written DPAs):{"\n"}
          • MongoDB / managed database — primary database{"\n"}
          • Object storage (S3-compatible) — attachments, images{"\n"}
          • Google Workspace SMTP — transactional email{"\n"}
          • Twilio Verify / MSG91 — mobile-OTP{"\n"}
          • Stripe — payments & subscriptions{"\n"}
          • OpenAI / Anthropic / Google (via Emergent LLM key) — AI prompts (anonymised where possible){"\n"}
          • Apple APNs, Google FCM — push notifications{"\n"}
          • Sentry — crash & error monitoring{"\n"}
          • Expo Application Services — mobile build & OTA delivery{"\n\n"}
          We may also disclose data if required by law, in connection with a merger or acquisition (with notice), or as fully de-identified, aggregated statistics. We will never share plaintext passwords, card numbers, or patient PHI with advertisers / data brokers.
        </Section>

        <Section title="7. International transfers">
          Implanr is operated from India. If you access the Service from outside India, your data will be transferred to and processed on servers in India / our region. Where required, we use Standard Contractual Clauses or equivalent safeguards under DPDP § 16 and GDPR.
        </Section>

        <Section title="8. AI processing of your data">
          Implanr uses third-party LLM providers via the Emergent Universal LLM integration to power "Ask Implanr", implant recommendations, and explainable suggestions.{"\n\n"}
          • We send only the minimum context needed.{"\n"}
          • LLM providers have contractually agreed not to train on our prompts and to delete prompts within 30 days.{"\n"}
          • AI suggestions are clinical decision support, not a substitute for professional judgment.{"\n"}
          • You can disable AI features at Settings → AI Features → Off.
        </Section>

        <Section title="9. Data retention">
          • Active account & profile: while active.{"\n"}
          • Clinical Content & case PDFs: per the Customer's medical record policy; default 10 years (Indian convention) and 6 years minimum where HIPAA applies.{"\n"}
          • Audit logs: 6 years minimum.{"\n"}
          • Authentication telemetry: 18 months.{"\n"}
          • Crash logs / device telemetry: 90 days.{"\n"}
          • Backups: 35 days rolling, encrypted.{"\n"}
          • Deleted account residual data: anonymised within 90 days of deletion request; backups expire within 35 days thereafter.
        </Section>

        <Section title="10. Security measures">
          • TLS 1.2+ in transit; AES-256 at rest.{"\n"}
          • Role-based access; least-privilege; MFA for engineering staff.{"\n"}
          • 15-minute inactivity auto-logout, audit-logged.{"\n"}
          • Screen-capture blocking on Android; iOS app-switcher blur.{"\n"}
          • Audit logging for every PHI view / export / override.{"\n"}
          • Quarterly third-party penetration tests; annual internal review (target SOC-2 Type II).{"\n"}
          • Encrypted, region-redundant backups; 35-day rolling retention.{"\n"}
          • CERT-In incident reporting under the IT Act 2000.{"\n\n"}
          No system is 100% secure. Report any vulnerabilities to security@implanr.com.
        </Section>

        <Section title="11. Your rights as a Data Principal">
          Under DPDP Act 2023 (and GDPR / HIPAA where applicable):{"\n\n"}
          • Access — Settings → Account → Download my data{"\n"}
          • Correct — Settings → Profile → Edit, or contact your workspace admin{"\n"}
          • Erase — Settings → Account → Delete account (90-day soft-delete; instant hard-delete on request){"\n"}
          • Withdraw consent — Settings → Privacy → Manage consents, or email privacy@implanr.com{"\n"}
          • Data portability — Settings → Account → Export data (JSON){"\n"}
          • Nominate a representative — Settings → Account → Nominee{"\n"}
          • Grievance redressal — grievance@implanr.com (we respond within 15 working days){"\n\n"}
          Patients should first contact the college / clinic that holds their record. You may also lodge a complaint with the Data Protection Board of India (dpb.gov.in).
        </Section>

        <Section title="12. Children's privacy">
          Implanr is intended for licensed dental professionals, students enrolled in accredited PG/UG programmes, and clinic staff. We do not knowingly collect personal data from any individual under 18. Patient records may include data about minor patients under their parents' / lawful guardians' explicit consent obtained by the treating dentist; that consent is the Customer's responsibility under DPDP § 9.
        </Section>

        <Section title="13. Cookies">
          The web app uses a session cookie (HttpOnly, Secure, SameSite=Strict), a CSRF token cookie, and local storage for theme and last-active timestamp (auto-logout). We do not use third-party advertising cookies, retargeting pixels, or social-media trackers. See the separate Cookie Notice for full details.
        </Section>

        <Section title="14. Changes to this policy">
          We may update this Privacy Policy from time to time. Material changes will be notified at least 30 days in advance via in-app banner, email, and an updated effective date. Continued use after the change date constitutes acceptance.
        </Section>

        <Section title="15. Contact">
          • Grievance Officer / DPO — grievance@implanr.com{"\n"}
          • General privacy queries — privacy@implanr.com{"\n"}
          • Security incidents — security@implanr.com{"\n\n"}
          We respond to all verified requests within 15 working days (DPDP requirement).
        </Section>

        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => router.push('/legal/cookie-notice')} data-testid="privacy-link-cookies">
            <Text style={styles.crossLink}>View Cookie Notice ›</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/legal/terms')} data-testid="privacy-link-terms">
            <Text style={styles.crossLink}>View Terms of Service ›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} data-testid="privacy-close-btn">
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.closeButtonText}>I Understand</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#ECEFF1',
  },
  pageHeaderTitle: {
    flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0D47A1',
  },
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '800', color: '#0D47A1', marginBottom: 4 },
  updated: { fontSize: 12, color: '#78909C', marginBottom: 20 },
  section: { marginBottom: 18 },
  h2: { fontSize: 15, fontWeight: '700', color: '#1565C0', marginBottom: 6 },
  body: { fontSize: 13, color: '#37474F', lineHeight: 20 },
  linkRow: { marginTop: 8, marginBottom: 4, gap: 10 },
  crossLink: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
  closeButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingVertical: 14,
  },
  closeButtonText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
