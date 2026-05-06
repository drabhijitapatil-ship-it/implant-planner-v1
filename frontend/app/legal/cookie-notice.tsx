import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../../components/BackButton';

export default function CookieNoticeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.pageHeader}>
        <BackButton testID="cookie-back-btn" />
        <Text style={styles.pageHeaderTitle} numberOfLines={1}>Cookie Notice</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} data-testid="cookie-notice-screen">
        <Text style={styles.h1}>Cookie Notice</Text>
        <Text style={styles.updated}>Last updated: February 2026 · Version 1.0</Text>

        <Section title="1. What this notice covers">
          This Cookie Notice explains how Implanr uses cookies and similar technologies on the Implanr web application. It supplements our Privacy Policy and Terms of Service. The mobile apps do not set tracking cookies.
        </Section>

        <Section title="2. The Implanr cookie philosophy">
          Implanr is a clinical workflow tool, not an ad-supported product. We use the minimum number of cookies required to deliver the Service securely:{"\n\n"}
          ✓ Strictly necessary cookies for authentication, security, and session.{"\n"}
          ✓ Functional cookies for theme / language / last-active timestamp.{"\n"}
          ✗ No third-party advertising cookies.{"\n"}
          ✗ No retargeting or social-media trackers.{"\n"}
          ✗ No selling of cookie data, IDs, or browsing behaviour.
        </Section>

        <Section title="3. Strictly necessary cookies (always on)">
          • implanr_session — session authentication (HttpOnly, Secure, SameSite=Strict; ≤8h){"\n"}
          • csrf_token — CSRF protection (Secure, SameSite=Strict; session){"\n"}
          • last_activity (localStorage) — drives the 15-minute auto-logout for HIPAA compliance{"\n"}
          • device_fingerprint_hash — brute-force protection on login (30 days){"\n\n"}
          You cannot opt out of these without breaking the Service.
        </Section>

        <Section title="4. Functional cookies">
          • theme (localStorage) — light/dark mode preference{"\n"}
          • lang (localStorage) — language preference{"\n"}
          • tenant_pref (localStorage) — last-active workspace for multi-tenant users{"\n\n"}
          All values are first-party and never shared with third parties.
        </Section>

        <Section title="5. Performance & error monitoring (opt-in)">
          We use a privacy-respecting error monitoring service (Sentry) to capture crashes. By default it is enabled with fully masked user identifiers so we cannot link an error to an individual user. You can disable it from Settings → Privacy → Crash Reporting.
        </Section>

        <Section title="6. Product analytics (opt-in)">
          analytics_session_id — aggregated, IP-truncated usage analytics. OFF by default. Only runs if you opt in via Settings → Privacy → Product Analytics. We do not use Google Analytics, Mixpanel, Amplitude, or any third-party SDK that ships data outside our control.
        </Section>

        <Section title="7. Mobile apps">
          Our iOS and Android apps do NOT use the IDFA / AAID for tracking. We honour Apple's App Tracking Transparency framework and display "Data Not Linked to You" in our App Store privacy nutrition label.{"\n\n"}
          On-device only (encrypted by the OS):{"\n"}
          • Authentication token (iOS Keychain / Android Keystore){"\n"}
          • Last-active timestamp (auto-logout){"\n"}
          • Device push notification token{"\n"}
          • Cached attachment thumbnails (purgeable from Settings)
        </Section>

        <Section title="8. Third-party cookies">
          A small number of third-party services may set cookies on your behalf:{"\n\n"}
          • Stripe — payment & fraud detection on the billing page (only on /settings/billing){"\n"}
          • Google / Microsoft / Apple SSO — set only on the sign-in redirect page{"\n"}
          • Sentry — crash reporting, only if you opt in{"\n\n"}
          We do not allow these providers to use cookies for advertising or cross-site tracking.
        </Section>

        <Section title="9. Cookie consent">
          The first time you visit the Implanr web app from a region requiring consent (EEA / UK / India), we display a cookie banner with three equally-prominent options:{"\n\n"}
          • Accept all{"\n"}
          • Reject all (only strictly-necessary cookies remain){"\n"}
          • Manage preferences (granular toggles){"\n\n"}
          You can change or withdraw your consent at any time from Settings → Privacy → Cookie Preferences.
        </Section>

        <Section title="10. Browser controls">
          You can control cookies in your browser settings:{"\n"}
          • Chrome — Settings → Privacy → Cookies and other site data{"\n"}
          • Firefox — Preferences → Privacy → Cookies and Site Data{"\n"}
          • Safari — Preferences → Privacy → Manage Website Data{"\n"}
          • Edge — Settings → Cookies and site permissions{"\n\n"}
          Note: blocking strictly-necessary cookies will break the Service — you will not be able to log in.
        </Section>

        <Section title="11. Global Privacy Control (GPC)">
          We honour the Global Privacy Control (GPC) signal where it is recognised in law. When we detect a Sec-GPC: 1 header, we treat your visit as if you selected "Reject all" in the cookie banner.
        </Section>

        <Section title="12. Children">
          Implanr is not intended for individuals under 18. We do not knowingly set cookies for, or collect data via cookies from, anyone under 18.
        </Section>

        <Section title="13. Changes to this Notice">
          We may update this Cookie Notice from time to time. Material changes will be highlighted by an in-app banner and a refreshed effective date.
        </Section>

        <Section title="14. Contact">
          For questions about cookies or this Notice, please contact your workspace administrator or write to privacy@implanr.com.
        </Section>

        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} data-testid="cookie-close-btn">
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={styles.closeButtonText}>Got it</Text>
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
