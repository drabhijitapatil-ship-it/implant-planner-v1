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
          By accessing or using the Dental Phase App (the "App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.
        </Section>

        <Section title="2. Eligibility">
          The App is intended exclusively for authorized postgraduate students, supervisors, implant in-charges, nurses, and administrators affiliated with a registered dental institution. You must maintain an active institutional account to use the App.
        </Section>

        <Section title="3. Clinical Use Disclaimer">
          The App provides decision-support tools (implant suggestions, drilling protocols, risk scoring, AI-generated summaries) for educational and workflow purposes. It is NOT a substitute for professional clinical judgement. All treatment decisions remain the sole responsibility of the licensed practitioner. The App does not replace a device-regulated medical decision system.
        </Section>

        <Section title="4. Patient Data & Consent">
          Users warrant that they have obtained appropriate consent from patients before entering identifiable clinical data, radiographs, or photographs into the App. Users are responsible for complying with applicable health-data regulations (HIPAA, GDPR, DISHA, or local equivalents).
        </Section>

        <Section title="5. Acceptable Use">
          You agree NOT to:{"\n"}
          • share your account credentials;{"\n"}
          • enter data for patients outside your direct clinical responsibility;{"\n"}
          • attempt to reverse-engineer, copy, or extract the App's source code;{"\n"}
          • use the App to harass, defame, or harm any individual.
        </Section>

        <Section title="6. Intellectual Property">
          The App, including all code, clinical content, drilling protocols, and UI, is the intellectual property of the Department of Prosthodontics, Bharati Vidyapeeth Dental College and Hospital, Pune, and its licensors. No rights are transferred to you other than the limited right to use the App as intended.
        </Section>

        <Section title="7. Third-Party Content">
          Implant manufacturer names, drilling sequences, and product references are shown for educational purposes only. Their inclusion does not imply endorsement by the respective manufacturers.
        </Section>

        <Section title="8. Service Availability">
          We aim to keep the App available at all times but do not guarantee uninterrupted service. Scheduled maintenance, network issues, or third-party outages may cause temporary unavailability.
        </Section>

        <Section title="9. Limitation of Liability">
          To the fullest extent permitted by law, the App developers, the hosting institution, and any integrated third-party providers shall not be liable for any indirect, incidental, or consequential damages arising from use of the App, including but not limited to loss of data, clinical outcomes, or business interruption.
        </Section>

        <Section title="10. Account Suspension">
          Accounts may be suspended or terminated by institutional administrators or the App developers for violations of these Terms, misuse of patient data, or upon separation from the institution.
        </Section>

        <Section title="11. Governing Law">
          These Terms are governed by the laws of India. Any disputes arising shall be subject to the exclusive jurisdiction of the courts of Pune, Maharashtra.
        </Section>

        <Section title="12. Changes to Terms">
          We may revise these Terms at any time. Continued use of the App after any revision constitutes acceptance of the updated Terms.
        </Section>

        <Section title="13. Contact">
          For questions about these Terms, contact your institutional administrator or the Department of Prosthodontics at Bharati Vidyapeeth Dental College and Hospital, Pune.
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
