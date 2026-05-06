import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../components/BackButton';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.pageHeader}>
        <BackButton testID="terms-back-btn" />
        <Text style={styles.pageHeaderTitle} numberOfLines={1}>Terms of Service</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} data-testid="terms-screen">
        <Text style={styles.h1}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: February 2026 · Version 1.0</Text>

        <Section title="1. Acceptance">
          Please read these Terms of Service ("Terms") carefully. They govern your access to and use of the Implanr application and services. By creating an account, signing in, or otherwise using Implanr, you agree to be bound by these Terms. If you accept on behalf of a Dental College or Dental Clinic ("Customer"), you represent that you have authority to bind that organisation.
        </Section>

        <Section title="2. Definitions">
          • "Implanr" / "we" / "us" — the legal entity operating Implanr.{"\n"}
          • "Service" — Implanr iOS / Android / web apps, APIs, dashboards, support, and related materials.{"\n"}
          • "Customer" — the Dental College or Dental Clinic that creates a workspace.{"\n"}
          • "End User" — any individual authorised by the Customer (dentists, students, supervisors, nurses, dental assistants, receptionists).{"\n"}
          • "Clinical Content" — case data, treatment plans, radiographs, implant selections, surgical reports, attachments, and PDF case reports.{"\n"}
          • "PHI" — Protected Health Information as defined under HIPAA, where applicable.
        </Section>

        <Section title="3. Eligibility & accounts">
          • You must be at least 18 and a licensed dental professional, an accredited dental student, or staff authorised by a Customer.{"\n"}
          • You must provide accurate information at signup and keep it updated.{"\n"}
          • You are responsible for keeping your password / OTP / SSO credentials confidential and for activity under your account.{"\n"}
          • Notify admin@implanr.com immediately of any suspected unauthorised access.{"\n"}
          • Customer admins (Implant In-Charge / Chief Dentist) manage seat assignments, role changes, and offboarding for their workspace.{"\n"}
          • We may require mobile-OTP, email verification, or SSO at signup; failure to verify may result in account suspension.
        </Section>

        <Section title="4. Free trial & subscriptions">
          • New Customers may receive a 14-day free trial of the Standard Plan. No credit card required to start.{"\n"}
          • At trial end, the workspace converts to a free read-only state for 7 days, then archived if no plan is purchased.{"\n"}
          • Plans, seats, and prices are listed on our pricing page. We may revise pricing on 30 days' written notice.{"\n"}
          • Subscriptions auto-renew unless cancelled at least 24 hours before term end.{"\n"}
          • Indian dental healthcare services are 0% GST; the Implanr SaaS subscription itself is taxable at the applicable GST rate (currently 18%). We will issue tax invoices to your GSTIN.{"\n"}
          • Subscription fees are non-refundable except where required by law or where Implanr has materially breached and failed to cure within 30 days.{"\n"}
          • Failed payments: we retry for 7 days; if unpaid, the workspace is suspended; data retained for 30 days then archived.
        </Section>

        <Section title="5. Acceptable use">
          You agree NOT to:{"\n"}
          1. Use the Service for any unlawful, fraudulent, or harmful purpose.{"\n"}
          2. Upload data you do not have the right to share, including third-party PHI without lawful consent.{"\n"}
          3. Reverse-engineer, decompile, or disassemble the Service except where permitted by law.{"\n"}
          4. Probe, scan, or test the Service's security without written authorisation.{"\n"}
          5. Bypass or disable rate limits, authentication, audit logs, screen-capture blocking, or any other safeguard.{"\n"}
          6. Use the Service to send spam, phishing, or malware.{"\n"}
          7. Impersonate any person or misrepresent affiliation.{"\n"}
          8. Resell, sublicense, or white-label the Service without written consent.{"\n"}
          9. Use the Service to make a final clinical decision SOLELY based on AI suggestions; AI features are decision support only.{"\n"}
          10. Interfere with another Customer's use of the Service.{"\n\n"}
          We may suspend or terminate accounts that violate this section.
        </Section>

        <Section title="6. Customer Content & Clinical Content">
          • The Customer retains all rights, title, and interest in Customer Content. We claim no ownership.{"\n"}
          • We require only a limited licence to host, transmit, process, display, and back up Customer Content as needed to provide the Service.{"\n"}
          • The Customer is solely responsible for: valid patient consent for use of Implanr; the clinical correctness of all Clinical Content; compliance with the National Dental Commission (NDC) regulations, DPDP Act 2023, IT Act 2000, and any applicable foreign healthcare laws (HIPAA, GDPR); and ensuring End Users follow these Terms.{"\n"}
          • Backups: 35-day encrypted rolling retention. Customer admins may export data anytime via Settings → Account → Export.{"\n"}
          • We may remove Customer Content that we reasonably believe violates these Terms or applicable law.
        </Section>

        <Section title="7. AI-assisted features">
          • AI outputs are probabilistic, may be incomplete or incorrect, and must be reviewed by a qualified clinician before any clinical action.{"\n"}
          • Implanr is NOT a medical device; AI features are clinical decision support, not a substitute for clinician judgment.{"\n"}
          • AI prompts and outputs are processed by third-party LLM providers via the Emergent LLM key. No prompt is used to train any model.{"\n"}
          • Do not submit prompts containing data outside the scope of the Service's intended clinical workflow.
        </Section>

        <Section title="8. Privacy & data protection">
          Our handling of personal data is described in our Privacy Policy and Data Processing Addendum (DPA), both incorporated into these Terms by reference. By accepting these Terms, you also accept the Privacy Policy and (for Customers handling PHI) the DPA.
        </Section>

        <Section title="9. Intellectual property">
          • The Service, including all software, design, branding, "Implanr" trademark, the implant catalog, AI prompts, and documentation, is and remains our exclusive property.{"\n"}
          • Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to use the Service for your internal business purposes during the subscription term.{"\n"}
          • Feedback you submit may be used by us perpetually and royalty-free without obligation to credit you.{"\n"}
          • With your written consent, we may list your organisation's name and logo on our customer page; you may revoke consent in writing.
        </Section>

        <Section title="10. Third-party services">
          The Service integrates with Google Workspace SMTP, Stripe, Twilio / MSG91, Apple APNs, Google FCM, OpenAI / Anthropic / Google LLMs, App Store and Play Store. We are not responsible for their availability, accuracy, or content. Your use is subject to their own terms and privacy policies.
        </Section>

        <Section title="11. Service levels & support">
          • Target uptime: 99.5% per calendar month, excluding scheduled maintenance and force majeure.{"\n"}
          • Maintenance windows: 48 hours' advance notice.{"\n"}
          • Support: support@implanr.com, in-app help.{"\n"}
          • Response time targets — P1 (down): 1 business hour; P2 (major degradation): 4 business hours; P3 (minor): 1 business day; P4 (question): 3 business days.{"\n"}
          • Business hours: 09:30–18:30 IST, Monday to Friday, excluding national holidays.{"\n"}
          • No financial SLA / service credits in standard plans; enterprise SLAs on request.
        </Section>

        <Section title="12. Suspension & termination">
          • You may terminate from Settings → Billing; takes effect at the end of the current billing cycle.{"\n"}
          • We may suspend or terminate immediately for material breach, payment overdue more than 30 days, legal requirement, or risk to other users.{"\n"}
          • On termination: access ceases; we retain Customer data in a recoverable state for 30 days during which you may export. After that, production deletion within 90 days; backups expire within 35 days thereafter.{"\n"}
          • Audit logs are retained for the full statutory period.{"\n"}
          • Sections that by their nature should survive (IP, indemnity, liability, governing law) survive termination.
        </Section>

        <Section title="13. Disclaimers">
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, TO THE MAXIMUM EXTENT PERMITTED BY LAW.{"\n\n"}
          • NOT A MEDICAL DEVICE. Implanr is a workflow management and decision-support tool. It is not a regulated medical device and does not diagnose, treat, or cure any condition.{"\n"}
          • AI OUTPUTS are advisory only. The treating clinician is solely responsible for the final clinical decision.{"\n"}
          • NO UPTIME GUARANTEE. We target 99.5% but do not guarantee uninterrupted, error-free, or fully secure operation.{"\n"}
          • NO LEGAL OR TAX ADVICE. Templates (consent forms, GST language, privacy notices) are convenience only and not legal or tax advice.
        </Section>

        <Section title="14. Limitation of liability">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:{"\n\n"}
          1. NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, GOODWILL, DATA, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY.{"\n"}
          2. IMPLANR'S TOTAL AGGREGATE LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE TOTAL FEES YOU PAID US IN THE 12 MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.{"\n"}
          3. NOTHING LIMITS LIABILITY THAT CANNOT BE LIMITED BY LAW (FRAUD, GROSS NEGLIGENCE, OR DEATH / PERSONAL INJURY CAUSED BY NEGLIGENCE).
        </Section>

        <Section title="15. Indemnification">
          You agree to defend, indemnify, and hold us harmless from any third-party claims arising from: your or your End Users' violation of these Terms or applicable law; Customer Content (including PHI processed without lawful consent); any clinical decision made using the Service; or your infringement of third-party IP / privacy rights.{"\n\n"}
          We will defend you against any third-party claim alleging that the Service, when used in accordance with these Terms, infringes a valid IP right, subject to the cap in § 14.
        </Section>

        <Section title="16. Force majeure">
          Neither party is liable for failure or delay caused by events beyond its reasonable control, including acts of God, war, civil unrest, pandemic, government action, internet or power outage, third-party service failure, or labour disruption.
        </Section>

        <Section title="17. Governing law & dispute resolution">
          • These Terms are governed by the laws of India, without regard to conflict-of-laws principles.{"\n"}
          • The parties shall attempt amicable resolution within 30 days of written notice.{"\n"}
          • If unresolved, disputes shall be finally settled by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator. Seat and venue: Pune / Mumbai, India. Language: English.{"\n"}
          • Subject to the above, the courts at Pune / Mumbai have exclusive jurisdiction.
        </Section>

        <Section title="18. Changes to these Terms">
          We may update these Terms from time to time. Material changes will be notified via in-app banner and email at least 30 days before the effective date. If you do not agree to new Terms, you may cancel before the effective date and we will issue a pro-rata refund of pre-paid fees for any remaining term.
        </Section>

        <Section title="19. Miscellaneous">
          • Entire agreement: these Terms (with the Privacy Policy and DPA) are the entire agreement and supersede all prior agreements.{"\n"}
          • Severability: if any provision is invalid, the rest remains in full force.{"\n"}
          • No waiver: failure to enforce is not a waiver of future enforcement.{"\n"}
          • Assignment: you may not assign without our written consent. We may assign to an affiliate or in connection with a merger / acquisition / sale of assets.{"\n"}
          • Notices: to you via email or in-app banner; to us at legal@implanr.com.{"\n"}
          • Independent contractors. No partnership, joint venture, agency, or employment relationship is created.
        </Section>

        <Section title="20. Contact">
          • Legal & contracts — legal@implanr.com{"\n"}
          • Privacy & DPDP — admin@implanr.com{"\n"}
          • Security incidents — admin@implanr.com{"\n"}
          • Customer support — support@implanr.com
        </Section>

        <View style={styles.linkRow}>
          <TouchableOpacity onPress={() => router.push('/legal/privacy-policy')} data-testid="terms-link-privacy">
            <Text style={styles.crossLink}>View Privacy Policy ›</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/legal/cookie-notice')} data-testid="terms-link-cookies">
            <Text style={styles.crossLink}>View Cookie Notice ›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} data-testid="terms-close-btn">
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.closeButtonText}>I Agree</Text>
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
