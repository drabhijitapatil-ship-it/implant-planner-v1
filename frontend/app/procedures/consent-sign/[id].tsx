/**
 * iter-406 — In-app Patient Consent e-Signature (Phase 1).
 * Language-selectable consent text (EN/HI/MR, v2.1) + custom SVG signature pad.
 * Submits strokes to the backend which rasterizes the PNG + SHA-256 hash.
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

export default function ConsentSignScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [procedure, setProcedure] = useState<any>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [version, setVersion] = useState('v2.1');
  const [lang, setLang] = useState<'en' | 'hi' | 'mr'>('en');
  const [confirmed, setConfirmed] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [padSize, setPadSize] = useState({ w: 0, h: 180 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('[consent-sign] mounted, id =', id);
    (async () => {
      try {
        const [procRes, textRes] = await Promise.all([
          api.get(`/procedures/${id}`),
          api.get('/consent-texts'),
        ]);
        setProcedure(procRes.data);
        setTexts(textRes.data.texts || {});
        setVersion(textRes.data.version || 'v2.1');
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totalPts = strokes.reduce((a, s) => a + s.length, 0);

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
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Case summary */}
        <View style={s.caseCard} testID="consent-sign-case-card">
          <Text style={s.patientName}>{procedure?.patient_name || 'Patient'}</Text>
          <Text style={s.caseMeta}>
            {[procedure?.implant_procedure_type, procedure?.registration_number ? `Reg. ${procedure.registration_number}` : null]
              .filter(Boolean).join('  ·  ')}
          </Text>
          <Text style={s.caseMeta}>
            {[procedure?.student_name ? `Clinician: ${procedure.student_name}` : null,
              procedure?.supervisor_name ? `Supervisor: ${procedure.supervisor_name}` : null]
              .filter(Boolean).join('  ·  ')}
          </Text>
        </View>

        {/* Language selector */}
        <Text style={s.sectionLabel}>Consent Language</Text>
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

        {/* Consent text */}
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
          <SignaturePad strokes={strokes} onChange={setStrokes} height={180} testID="signature-pad" />
        </View>

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
  caseCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#1565C0',
  },
  patientName: { fontSize: 16, fontWeight: '700', color: '#0D47A1' },
  caseMeta: { fontSize: 12, color: '#546E7A', marginTop: 3 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 8 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
