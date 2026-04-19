import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Privacy Policy', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={styles.content} data-testid="privacy-policy-screen">
        <Text style={styles.h1}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: February 2026</Text>

        <Section title="1. Introduction">
          This Privacy Policy explains how the Dental Phase App (the "App") collects, uses, discloses, and safeguards information when used by postgraduate students, supervisors, and implant in-charges at the Department of Prosthodontics.
        </Section>

        <Section title="2. Information We Collect">
          • Account data: name, institutional email, role, profile photo.{"\n"}
          • Patient clinical data entered by authorized users: demographics, medical history, radiographs, clinical notes, and treatment plans.{"\n"}
          • Technical data: device type, app version, timestamps of access for audit logs.
        </Section>

        <Section title="3. How We Use Information">
          • To operate the 4-phase implant workflow and deliver clinical decision support.{"\n"}
          • To maintain audit trails (edit history) for academic and medico-legal accountability.{"\n"}
          • To generate de-identified AI summaries and surgical notes via the configured AI provider.{"\n"}
          • We do not sell personal or clinical data to third parties.
        </Section>

        <Section title="4. Data Storage & Security">
          • Patient data is stored on encrypted MongoDB servers with access restricted by role-based authentication (JWT).{"\n"}
          • All network traffic is transmitted over HTTPS/TLS.{"\n"}
          • Authentication tokens on-device are stored using platform-native secure storage (iOS Keychain / Android Keystore).{"\n"}
          • The App applies session timeout after a period of inactivity.
        </Section>

        <Section title="5. Third-Party Services">
          The App integrates with the following third parties solely for delivering core features:{"\n"}
          • OpenAI API (for AI-assisted clinical summaries — de-identified text only).{"\n"}
          • Expo / EAS (for app delivery and over-the-air updates).{"\n"}
          These providers act as data processors and are bound by their own privacy terms.
        </Section>

        <Section title="6. Data Sharing">
          Patient data is only visible to authorized users (the case's assigned student, supervisor, implant in-charge, and institutional administrators). We do not share identifiable patient data outside your institution without explicit consent or a legal obligation.
        </Section>

        <Section title="7. Your Rights">
          Users may request access to, correction of, or deletion of their account data by contacting their institutional administrator. Patient data retention follows your institution's clinical records policy.
        </Section>

        <Section title="8. Children's Privacy">
          The App is intended for use by clinical professionals and students. It is not directed at persons under 16 acting on their own behalf.
        </Section>

        <Section title="9. Changes to This Policy">
          We may update this Privacy Policy from time to time. Material changes will be highlighted in the App. Continued use after the effective date constitutes acceptance of the revised policy.
        </Section>

        <Section title="10. Contact">
          Questions about this Privacy Policy should be directed to your institutional administrator or the Department of Prosthodontics, Bharati Vidyapeeth Dental College and Hospital, Pune.
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
