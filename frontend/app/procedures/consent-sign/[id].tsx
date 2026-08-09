/**
 * iter-406/325 — In-app Patient Consent e-Signature (Phase 1).
 * Shows the COMPLETE informed-consent form (same content as the printable
 * template) + language-selectable consent statement (EN/HI/MR, v2.1) +
 * custom SVG signature pad. Scrolling is frozen while the patient signs.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, router as globalRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import { PhaseHeader } from '../../../components/PhaseHeader';
import SignaturePad, { Stroke } from '../../../components/SignaturePad';

/** Route-level error boundary: any render/runtime error on this screen shows
 * a readable message with Retry/Back instead of a blank native screen. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }} edges={['top']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} testID="consent-sign-error-boundary">
        <Ionicons name="warning" size={40} color="#E53935" />
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#37474F', marginTop: 12, textAlign: 'center' }}>
          The e-signature screen hit an error
        </Text>
        <Text selectable style={{ fontSize: 12, color: '#78909C', marginTop: 10, textAlign: 'center' }}>
          {String(error?.message || error)}
        </Text>
        <TouchableOpacity
          onPress={() => retry()}
          style={{ marginTop: 20, backgroundColor: '#1565C0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
          testID="consent-sign-retry-btn"
        >
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => globalRouter.back()}
          style={{ marginTop: 10, paddingHorizontal: 24, paddingVertical: 10 }}
          testID="consent-sign-error-back-btn"
        >
          <Text style={{ color: '#546E7A', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

const InfoRows = ({ rows, testID }: { rows: string[][]; testID: string }) => (
  <View style={s.infoCard} testID={testID}>
    {rows.map(([label, value], i) => (
      <View key={i} style={[s.infoRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    ))}
  </View>
);

export default function ConsentSignScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [content, setContent] = useState<any>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [version, setVersion] = useState('v2.1');
  const [lang, setLang] = useState<'en' | 'hi' | 'mr'>('en');
  const [confirmed, setConfirmed] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [padSize, setPadSize] = useState({ w: 0, h: 180 });
  const [signing, setSigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('[consent-sign] mounted, id =', id);
    (async () => {
      try {
        const [contentRes, textRes] = await Promise.all([
          api.get(`/procedures/${id}/consent-content`),
          api.get('/consent-texts'),
        ]);
        setContent(contentRes.data);
        setTexts(textRes.data.texts || {});
        setVersion(textRes.data.version || 'v2.1');
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load consent form');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totalPts = strokes.reduce((a, st) => a + st.length, 0);

  const submit = async () => {
    setError('');
    if (!confirmed) {
      setError('Please confirm the procedure was explained to the patient.');
      return;
    }
    if (totalPts < 8) {
      setError('Patient signature is required — please sign inside the box.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/procedures/${id}/consent/esign`, {
        strokes,
        pad_width: padSize.w || 300,
        pad_height: padSize.h,
        consent_version: version,
        language: lang,
        confirmed_explained: true,
      });
      Alert.alert('Consent recorded', 'The e-signed consent has been saved.');
      router.replace(`/procedures/${id}` as any);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save the signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <PhaseHeader
        title="Patient Consent e-Signature"
        subtitle={`Consent text ${version} · Signed on this device`}
        onBack={() => router.back()}
        testID="consent-sign-header"
      />
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!signing}
      >
        {/* ── Full informed-consent form (same content as printable template) ── */}
        <Text style={s.formTitle} testID="consent-form-title">{content?.title || 'INFORMED CONSENT — DENTAL IMPLANT PROCEDURE'}</Text>
        <Text style={s.formSub}>Please read carefully before signing.</Text>

        <Text style={s.sectionLabel}>Patient Information</Text>
        <InfoRows rows={content?.patient_info || []} testID="consent-patient-info" />

        <Text style={s.sectionLabel}>Planned Procedure</Text>
        <InfoRows rows={content?.procedure_details || []} testID="consent-procedure-details" />

        {(content?.implants || []).length > 0 && (
          <>
            <Text style={s.sectionLabel}>Planned Implant(s)</Text>
            <View style={s.infoCard} testID="consent-implants">
              {content.implants.map((imp: any, i: number) => (
                <View key={i} style={[s.infoRow, i === content.implants.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={s.infoLabel}>Site {imp.site}</Text>
                  <Text style={s.infoValue}>{imp.label}  ·  {imp.size}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {(content?.sections || []).map((sec: any, i: number) => (
          <View key={i} testID={`consent-section-${i + 1}`}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        {/* ── Consent statement in patient's language ── */}
        <Text style={[s.sectionLabel, { marginTop: 18 }]}>Consent Statement — Patient's Language</Text>
        <View style={s.langRow}>
          {LANGS.map(l => (
            <TouchableOpacity
              key={l.code}
              style={[s.langChip, lang === l.code && s.langChipActive]}
              onPress={() => setLang(l.code as any)}
              testID={`consent-lang-${l.code}`}
            >
              <Text style={[s.langChipText, lang === l.code && s.langChipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.textCard} testID="consent-text-body">
          <Text style={s.consentText}>{texts[lang] || texts.en || ''}</Text>
          <Text style={s.versionNote}>Consent text version {version}</Text>
        </View>

        {/* Explanation confirmation */}
        <TouchableOpacity
          style={s.checkRow}
          onPress={() => setConfirmed(!confirmed)}
          activeOpacity={0.8}
          testID="consent-explained-checkbox"
        >
          <Ionicons
            name={confirmed ? 'checkbox' : 'square-outline'}
            size={22}
            color={confirmed ? '#1565C0' : '#90A4AE'}
          />
          <Text style={s.checkText}>
            I confirm the procedure, risks and alternatives were explained to the patient in the selected language, and the patient agreed to sign.
          </Text>
        </TouchableOpacity>

        {/* Signature pad */}
        <View style={s.sigHeaderRow}>
          <Text style={s.sectionLabel}>Patient Signature</Text>
          <TouchableOpacity
            onPress={() => setStrokes([])}
            disabled={strokes.length === 0}
            style={[s.clearBtn, strokes.length === 0 && { opacity: 0.4 }]}
            testID="signature-clear-btn"
          >
            <Ionicons name="refresh" size={13} color="#C62828" />
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View onLayout={e => { const w = e.nativeEvent.layout.width; setPadSize(p => ({ ...p, w })); }}>
          <SignaturePad
            strokes={strokes}
            onChange={setStrokes}
            height={180}
            testID="signature-pad"
            onSigningChange={setSigning}
          />
        </View>
        <Text style={s.padHint}>The page stays still while signing — lift the finger/stylus to scroll again.</Text>

        {!!error && (
          <View style={s.errorRow} testID="consent-sign-error">
            <Ionicons name="alert-circle" size={15} color="#C62828" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.submitBtn, (submitting || totalPts < 8 || !confirmed) && s.submitBtnDim]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.85}
          testID="consent-esign-submit-btn"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="finger-print" size={18} color="#FFF" />
              <Text style={s.submitBtnText}>Save e-Signed Consent</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={s.footNote}>
          The signature is stored as a tamper-evident PNG with a SHA-256 hash, and unlocks Phase 2 for this case.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 48 },
  formTitle: { fontSize: 15, fontWeight: '800', color: '#0D47A1', textAlign: 'center', letterSpacing: 0.3 },
  formSub: { fontSize: 11, color: '#78909C', textAlign: 'center', marginTop: 4, marginBottom: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 8, marginTop: 6 },
  infoCard: { backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 },
  infoRow: {
    flexDirection: 'row', paddingVertical: 8, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECEFF1',
  },
  infoLabel: { width: 130, fontSize: 12, fontWeight: '700', color: '#546E7A' },
  infoValue: { flex: 1, fontSize: 12.5, color: '#263238' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', marginTop: 12, marginBottom: 4 },
  sectionBody: { fontSize: 12.5, lineHeight: 19, color: '#37474F', backgroundColor: '#FFF', borderRadius: 10, padding: 12 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  langChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC',
  },
  langChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  langChipText: { fontSize: 13, fontWeight: '600', color: '#546E7A' },
  langChipTextActive: { color: '#FFF' },
  textCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 14 },
  consentText: { fontSize: 13.5, lineHeight: 21, color: '#263238' },
  versionNote: { fontSize: 10.5, color: '#90A4AE', marginTop: 8, fontStyle: 'italic' },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 16, paddingRight: 6 },
  checkText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#455A64' },
  sigHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#FFEBEE',
  },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: '#C62828' },
  padHint: { fontSize: 10.5, color: '#90A4AE', marginTop: 6, fontStyle: 'italic' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  errorText: { flex: 1, fontSize: 12.5, color: '#C62828', fontWeight: '600' },
  submitBtn: {
    marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#00897B', paddingVertical: 14, borderRadius: 10,
  },
  submitBtnDim: { opacity: 0.55 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  footNote: { fontSize: 11, color: '#90A4AE', textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
