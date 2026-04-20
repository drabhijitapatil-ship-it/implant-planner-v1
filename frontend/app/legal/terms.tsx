import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Terms of Service', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={styles.content} data-testid="terms-screen">
        <Text style={styles.h1}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: February 2026</Text>

        <Section title="1. Acceptance of Terms">
          By accessing or using Implanr (the "App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App. The organisation operating the App — whether a dental college, teaching hospital, or private dental practice — is referred to as the "Operator".
        </Section>

        <Section title="2. Eligibility">
          The App is intended exclusively for authorized Users affiliated with a registered Operator. This includes, depending on deployment context:{"\n"}
          • Academic settings: postgraduate students, supervising faculty, implant in-charges, departmental administrators, clinical support staff.{"\n"}
          • Private clinic settings: dental surgeons, associate dentists, practice owners, implant consultants, practice managers, dental hygienists, and auxiliary staff.{"\n"}
          You must hold an active Operator-issued account to use the App and must maintain registration as a qualified professional under local dental regulations where applicable.
        </Section>

        <Section title="3. Clinical Use Disclaimer">
          The App provides decision-support tools (implant suggestions, drilling protocols, risk scoring, AI-generated summaries) for educational, training, and workflow purposes. It is NOT a substitute for professional clinical judgement, nor is it a regulated medical device. All treatment decisions remain the sole responsibility of the licensed practitioner. Where the App is used in an academic setting, the supervising faculty retains ultimate clinical and educational responsibility.
        </Section>

        <Section title="4. Patient Data & Consent">
          Users warrant that they have obtained appropriate informed consent from patients (or their legal guardians) before entering identifiable clinical data, radiographs, or photographs into the App. Users are responsible for complying with all applicable health-data regulations in their jurisdiction — including but not limited to the Dental Council of India guidelines, the Digital Personal Data Protection Act 2023 (India), HIPAA (United States), GDPR (EEA/UK), and any Operator-specific policies.
        </Section>

        <Section title="5. Acceptable Use">
          You agree NOT to:{"\n"}
          • share your account credentials with any other person;{"\n"}
          • enter data for patients outside your direct clinical responsibility;{"\n"}
          • attempt to reverse-engineer, copy, decompile, or extract the App's source code or proprietary clinical content;{"\n"}
          • use the App to harass, defame, or harm any individual;{"\n"}
          • misrepresent your role, qualifications, or affiliation with the Operator.
        </Section>

        <Section title="6. Intellectual Property">
          The App, including all code, clinical content, drilling protocols, illustrations, and user interface, is the intellectual property of the App developers and their licensors. Licensed clinical content (for example, manufacturer-specific drilling sequences) remains the property of the respective clinical-content partners. The Operator and individual Users receive a limited, non-transferable right to use the App as intended; no ownership rights are transferred.
        </Section>

        <Section title="7. Third-Party Content">
          Implant-system names, drilling sequences, and product references are displayed for educational and clinical-workflow purposes only. Their inclusion does not constitute endorsement by the respective manufacturers, nor does it guarantee supply, pricing, or clinical suitability. Users must verify product details from the original manufacturer documentation before clinical use.
        </Section>

        <Section title="8. Service Availability">
          We aim to keep the App available at all times but do not guarantee uninterrupted service. Scheduled maintenance, network issues, cloud-provider outages, or third-party service degradation (e.g. AI provider downtime) may cause temporary unavailability. Users should never defer urgent clinical decisions waiting for the App to become available.
        </Section>

        <Section title="9. Limitation of Liability">
          To the fullest extent permitted by law, the App developers, the Operator (insofar as they did not directly cause the loss), and any integrated third-party providers shall not be liable for any indirect, incidental, special, or consequential damages arising from use of the App — including but not limited to loss of data, adverse clinical outcomes arising from the practitioner's own decision, reputational damage, or business interruption. Liability for direct damages shall not exceed the fees paid by the Operator for use of the App in the preceding twelve months.
        </Section>

        <Section title="10. Account Suspension & Termination">
          Accounts may be suspended or terminated by the Operator's administrators or by the App developers in the following circumstances: material breach of these Terms, misuse of patient data, separation of the User from the Operator (end of course, resignation, termination), or at the written request of the User. Upon termination, patient data created by the User remains with the Operator under its clinical records policy.
        </Section>

        <Section title="11. Governing Law">
          These Terms are governed by the laws of India. Any disputes arising shall be subject to the exclusive jurisdiction of the courts of Pune, Maharashtra. Nothing in this clause restricts the rights of a consumer User to bring proceedings in their local jurisdiction where such rights are mandatory under local law.
        </Section>

        <Section title="12. Changes to Terms">
          We may revise these Terms at any time. Material changes will be highlighted in the App. Continued use of the App after any revision constitutes acceptance of the updated Terms.
        </Section>

        <Section title="13. Contact">
          For questions about these Terms, Users should contact their Operator administrator — typically the Department Head (for college/hospital deployments) or the Practice Owner / Legal Officer (for private clinic deployments).
        </Section>

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
  content: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '800', color: '#0D47A1', marginBottom: 4 },
  updated: { fontSize: 12, color: '#78909C', marginBottom: 20 },
  section: { marginBottom: 18 },
  h2: { fontSize: 15, fontWeight: '700', color: '#1565C0', marginBottom: 6 },
  body: { fontSize: 13, color: '#37474F', lineHeight: 20 },
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
