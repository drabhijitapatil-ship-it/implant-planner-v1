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
        <Text style={styles.updated}>Last updated: February 2026</Text>

        <Section title="1. Introduction">
          This Privacy Policy explains how Implanr (the "App") collects, uses, discloses, and safeguards information when used by authorized personnel at a dental institution or private dental practice — including postgraduate students, supervisors, implant in-charges, dental surgeons, associate dentists, practice owners, clinic managers, and auxiliary staff (referred to collectively as "Users"). The organisation operating the App at any given deployment — whether a dental college, hospital, or private clinic — is referred to as the "Operator".
        </Section>

        <Section title="2. Information We Collect">
          • Account data: name, institutional or clinic email, assigned role, profile photo.{"\n"}
          • Patient clinical data entered by authorized Users: demographics, medical history, radiographs, intraoral scans, clinical notes, surgical protocols, and treatment plans.{"\n"}
          • Technical data: device type, app version, timestamps of access, and IP addresses for audit logs.{"\n"}
          • Edit history: a granular record of every field change, including the editor's identity, role, and timestamp, maintained for clinical accountability.
        </Section>

        <Section title="3. How We Use Information">
          • To operate the 4-phase implant workflow and deliver clinical decision support.{"\n"}
          • To maintain audit trails (edit history, access logs) for academic evaluation, clinical accountability, and medico-legal defensibility.{"\n"}
          • To generate de-identified AI summaries and surgical notes via the configured AI provider.{"\n"}
          • To send in-app alerts and push notifications about case updates to the relevant Users.{"\n"}
          • We do not sell personal or clinical data to third parties under any circumstances.
        </Section>

        <Section title="4. Data Storage & Security">
          • Patient data is stored on encrypted MongoDB servers with access restricted by role-based authentication (JWT).{"\n"}
          • All network traffic is transmitted over HTTPS/TLS.{"\n"}
          • Authentication tokens on-device are stored using platform-native secure storage (iOS Keychain / Android Keystore).{"\n"}
          • The App applies a session timeout after a period of inactivity — especially important for shared clinic devices.{"\n"}
          • The Operator is responsible for enforcing device-level safeguards (screen lock, trusted Wi-Fi, approved hardware).
        </Section>

        <Section title="5. Third-Party Services">
          The App integrates with the following third parties solely for delivering core features:{"\n"}
          • OpenAI API — for AI-assisted clinical summaries. Only de-identified text is transmitted.{"\n"}
          • Expo / EAS — for application delivery and over-the-air updates.{"\n"}
          These providers act as data processors and are bound by their own privacy terms.
        </Section>

        <Section title="6. Data Sharing & Access">
          Patient data is only visible to authorized Users assigned to the case — typically the treating clinician (student or practitioner), their supervising faculty or senior dentist, the implant in-charge or practice owner, and designated administrative staff. We do not share identifiable patient data outside your institution or clinic without explicit consent or a legal obligation. Inter-clinic or inter-institutional sharing, if enabled in a future multi-tenant release, will always require written consent from the Operator and the patient.
        </Section>

        <Section title="7. Your Rights">
          Users may request access to, correction of, or deletion of their account data by contacting their Operator administrator. Patient data retention follows the Operator's clinical records policy and applicable law (for example, Indian Dental Council record-retention rules, GDPR where applicable, or HIPAA for US deployments).
        </Section>

        <Section title="8. Children's Privacy">
          The App is intended for use by clinical professionals, students, and support staff. It is not directed at, and does not knowingly collect data from, persons under 16 acting on their own behalf. Paediatric patient data entered by a qualified clinician is treated with the same safeguards as adult patient data.
        </Section>

        <Section title="9. Regional Compliance">
          • India: compliant with the Digital Personal Data Protection Act, 2023 and Dental Council of India record-keeping guidelines.{"\n"}
          • European Economic Area / UK: compliant with GDPR Article 6(1)(f) legitimate interest and Article 9(2)(h) healthcare provisions.{"\n"}
          • United States: when deployed by covered entities, a Business Associate Agreement is required with the hosting provider to ensure HIPAA compliance.{"\n"}
          The Operator is responsible for confirming the App's suitability under local law before deployment.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy from time to time. Material changes will be highlighted in the App. Continued use after the effective date constitutes acceptance of the revised policy.
        </Section>

        <Section title="11. Contact">
          For questions about this Privacy Policy, Users should contact their Operator administrator — typically the Department Head (for college deployments) or the Practice Owner / Privacy Officer (for private clinic deployments).
        </Section>

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
