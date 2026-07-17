/**
 * iter-332: Admin "Treatment Timeline Backfill" screen
 *
 * Lists legacy procedures that are missing one or more clinical
 * "Done On" dates and lets the Implant In-Charge / Administrator fill
 * them in. The backend endpoint enforces chronological order across
 * phases and rejects future dates; partial updates are allowed.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import BackToDashboard from '../../components/BackToDashboard';

type TimelineCase = {
  id: string;
  patient_name?: string;
  registration_number?: string;
  status?: string;
  student_name?: string;
  procedure_date?: string;
  implant_procedure_type?: string;
  phase2_actual_done_date?: string | null;
  phase3_done_date?: string | null;
  phase4_step1_done_date?: string | null;
  phase4_step2_done_date?: string | null;
  missing_fields: string[];
};

const FIELDS: { key: keyof TimelineCase; label: string }[] = [
  { key: 'procedure_date', label: 'Phase 1 — Planning' },
  { key: 'phase2_actual_done_date', label: 'Phase 2 — Surgery' },
  { key: 'phase3_done_date', label: 'Phase 3 — Healing' },
  { key: 'phase4_step1_done_date', label: 'Phase 4 Step 1 — Impressions' },
  { key: 'phase4_step2_done_date', label: 'Phase 4 Step 2 — Delivery' },
];

export default function TimelineBackfillScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<TimelineCase[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const canAccess = user?.role === 'implant_incharge' || user?.role === 'administrator';

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/cases-missing-timeline');
      setCases(res.data?.items || []);
      const seeded: Record<string, Record<string, string>> = {};
      (res.data?.items || []).forEach((c: TimelineCase) => {
        seeded[c.id] = {
          procedure_date: c.procedure_date || '',
          phase2_actual_done_date: c.phase2_actual_done_date || '',
          phase3_done_date: c.phase3_done_date || '',
          phase4_step1_done_date: c.phase4_step1_done_date || '',
          phase4_step2_done_date: c.phase4_step2_done_date || '',
        };
      });
      setEdits(seeded);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess]);

  const setField = (caseId: string, field: string, value: string) => {
    setEdits(prev => ({ ...prev, [caseId]: { ...(prev[caseId] || {}), [field]: value } }));
  };

  const save = async (caseId: string) => {
    setSavingId(caseId);
    try {
      const e = edits[caseId] || {};
      const body: Record<string, string | null> = {};
      FIELDS.forEach(f => {
        const v = (e[f.key as string] || '').trim();
        if (v) body[f.key as string] = v;
      });
      const res = await api.patch(`/admin/procedures/${caseId}/timeline`, body);
      if (res.data?.updated) {
        Alert.alert('Saved', 'Treatment timeline updated for this case.');
        await load();
      } else {
        Alert.alert('No changes', 'Nothing to save.');
      }
    } catch (err: any) {
      Alert.alert('Save Failed', err?.response?.data?.detail || 'Could not save timeline');
    } finally {
      setSavingId(null);
    }
  };

  if (!canAccess) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.errorText}>You don&apos;t have permission to view this page.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.header}>
        <BackToDashboard floating={false} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>Treatment Timeline — Backfill</Text>
          <Text style={s.headerSub}>Fill in the clinical &ldquo;Done On&rdquo; dates on legacy cases.</Text>
        </View>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : cases.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-done-circle" size={56} color="#43A047" />
          <Text style={s.emptyText}>All caught up. No legacy cases need backfilling.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={s.summary} data-testid="backfill-cases-count">
            {cases.length} case{cases.length === 1 ? '' : 's'} missing one or more dates.
          </Text>
          {cases.map(c => (
            <View key={c.id} style={s.card} data-testid={`backfill-card-${c.id}`}>
              <TouchableOpacity onPress={() => router.push(`/procedures/${c.id}`)}>
                <Text style={s.caseTitle}>{c.patient_name || 'Unknown patient'}</Text>
                <Text style={s.caseSub}>
                  {c.implant_procedure_type || 'Implant case'} · Reg {c.registration_number || '—'} · Student {c.student_name || '—'}
                </Text>
                <Text style={s.caseStatus}>Status: {(c.status || '').replace(/_/g, ' ')}</Text>
              </TouchableOpacity>

              <View style={{ marginTop: 12 }}>
                {FIELDS.map(f => {
                  const missing = c.missing_fields.includes(f.key as string);
                  const value = edits[c.id]?.[f.key as string] || '';
                  return (
                    <View key={f.key as string} style={s.row}>
                      <Text style={[s.fieldLabel, missing && { color: '#C62828' }]}>
                        {f.label}{missing ? ' *' : ''}
                      </Text>
                      {Platform.OS === 'web' ? (
                        // @ts-ignore
                        <TextInput
                          style={s.input}
                          value={value}
                          onChangeText={(v) => setField(c.id, f.key as string, v)}
                          // @ts-ignore RN-Web passes <input> attrs through.
                          type="date"
                          max={new Date().toISOString().slice(0, 10)}
                          data-testid={`backfill-${c.id}-${f.key}`}
                        />
                      ) : (
                        <TextInput
                          style={s.input}
                          value={value}
                          onChangeText={(v) => setField(c.id, f.key as string, v)}
                          placeholder="YYYY-MM-DD"
                          inputMode="numeric"
                          maxLength={10}
                          testID={`backfill-${c.id}-${f.key as string}`}
                        />
                      )}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, savingId === c.id && { opacity: 0.6 }]}
                disabled={savingId === c.id}
                onPress={() => save(c.id)}
                data-testid={`backfill-save-${c.id}`}
              >
                {savingId === c.id ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#FFF" />
                    <Text style={s.saveText}>Save Timeline</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E0E6EF', backgroundColor: '#FFF',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  headerSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#37474F', fontSize: 14, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  summary: { fontSize: 13, fontWeight: '700', color: '#0D47A1', marginBottom: 12 },
  card: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#E0E6EF',
  },
  caseTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A2E' },
  caseSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  caseStatus: { fontSize: 11, color: '#90A4AE', marginTop: 4, fontStyle: 'italic' },
  row: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#37474F', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 10, fontSize: 13, color: '#1e2a44',
    backgroundColor: '#FAFAFA', width: '100%', alignSelf: 'stretch',
  },
  saveBtn: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10,
  },
  saveText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  errorText: { textAlign: 'center', marginTop: 80, color: '#C62828', fontWeight: '600' },
});
