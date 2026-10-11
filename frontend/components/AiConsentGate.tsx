/**
 * AiConsentGate — the AI-features consent screen (App Store Guidelines
 * 5.1.1(i) / 5.1.2(i)).
 *
 * Mounted once at the app root. When any AI request is refused by the
 * backend with "AI_CONSENT_REQUIRED" (utils/api.ts interceptor), this shows a
 * screen that explains WHAT is sent, WHO receives it and WHY, and asks the
 * user to Allow / Don't Allow. Allow → saved on the server and the original
 * request is retried automatically. Nothing is sent before the user allows.
 * The choice can be changed anytime in Profile → Privacy → AI features.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { setOnAiConsentRequired } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export const AI_PROVIDERS_TEXT =
  'Anthropic (Claude) — chat, case summaries, explanations and notes\nOpenAI (GPT) — radiograph comparison notes';

export async function saveAiConsent(granted: boolean) {
  await api.post('/ai/consent', { granted });
}

export default function AiConsentGate() {
  const { user, refreshUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    if (!user) {
      setOnAiConsentRequired(null);
      return;
    }
    setOnAiConsentRequired(
      (force?: boolean) =>
        new Promise<boolean>((resolve) => {
          // Already declined → don't nag on every automatic AI call; the user
          // can turn AI on in Profile → Privacy (which passes force=true).
          if (!force && user.ai_consent === false) {
            resolve(false);
            return;
          }
          // A second AI call while the screen is open shares the same answer.
          const prev = resolver.current;
          resolver.current = (v: boolean) => { prev?.(v); resolve(v); };
          setVisible(true);
        }),
    );
    return () => setOnAiConsentRequired(null);
  }, [user]);

  const finish = async (granted: boolean) => {
    setSaving(true);
    try {
      await saveAiConsent(granted);
      await refreshUser().catch(() => null);
    } catch {
      granted = false; // couldn't record consent → don't send anything
    } finally {
      setSaving(false);
      setVisible(false);
      const r = resolver.current;
      resolver.current = null;
      r?.(granted);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => finish(false)}>
      <View style={st.overlay}>
        <View style={st.sheet} testID="ai-consent-sheet">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={st.iconWrap}>
              <Ionicons name="sparkles" size={26} color="#1565C0" />
            </View>
            <Text style={st.title}>Allow AI features?</Text>
            <Text style={st.lead}>
              To use AI features, Implanr needs to send some data to a third-party AI service. Nothing is
              sent unless you allow it.
            </Text>

            <Text style={st.h}>What is sent</Text>
            {[
              'Your question or request to the AI assistant',
              'Clinical details of the case you are viewing (procedure, teeth, measurements, risk factors, phase notes)',
              'Radiograph images — only when you use radiograph comparison',
            ].map((t) => (
              <View key={t} style={st.row}><Ionicons name="arrow-forward-circle" size={16} color="#1565C0" /><Text style={st.rowText}>{t}</Text></View>
            ))}
            <View style={[st.row, st.good]}>
              <Ionicons name="shield-checkmark" size={16} color="#2E7D32" />
              <Text style={[st.rowText, { color: '#1B5E20' }]}>
                Patient identifiers (name, phone, email, date of birth, address) are removed before sending.
              </Text>
            </View>

            <Text style={st.h}>Who receives it</Text>
            {AI_PROVIDERS_TEXT.split('\n').map((t) => (
              <View key={t} style={st.row}><Ionicons name="business-outline" size={16} color="#455A64" /><Text style={st.rowText}>{t}</Text></View>
            ))}
            <Text style={st.small}>
              They process the data only to return the AI response and do not use it to train their models.
            </Text>

            <Text style={st.h}>Why</Text>
            <Text style={st.rowText}>
              To generate case summaries, answer your questions, explain recommendations and draft clinical notes.
            </Text>

            <Text style={[st.small, { marginTop: 12 }]}>
              You can change this anytime in Profile → Privacy → AI features. If you don't allow, the rest of the app
              works normally; only AI features are turned off. Details are in Profile → Privacy Policy
              (section "AI features").
            </Text>
          </ScrollView>

          <TouchableOpacity style={st.allow} onPress={() => finish(true)} disabled={saving} testID="ai-consent-allow">
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={st.allowText}>Allow</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={st.deny} onPress={() => finish(false)} disabled={saving} testID="ai-consent-deny">
            <Text style={st.denyText}>Don't Allow</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, maxHeight: '90%' },
  iconWrap: { alignSelf: 'center', width: 52, height: 52, borderRadius: 26, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  lead: { fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  h: { fontSize: 14, fontWeight: '800', color: '#0D47A1', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 6 },
  rowText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 19 },
  good: { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 8, marginTop: 4 },
  small: { fontSize: 12, color: '#64748B', lineHeight: 18 },
  allow: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  allowText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  deny: { paddingVertical: 12, alignItems: 'center' },
  denyText: { color: '#475569', fontSize: 15, fontWeight: '600' },
});
