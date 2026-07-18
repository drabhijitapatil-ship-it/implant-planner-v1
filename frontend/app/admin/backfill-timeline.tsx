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
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import CalendarPicker from '../../components/CalendarPicker';

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

const getInitials = (name?: string) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getStatusColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s.includes('complete')) return '#E8F5E9';
  if (s.includes('pending') || s.includes('review') || s.includes('progress')) return '#FFF3E0';
  if (s.includes('fail') || s.includes('reject') || s.includes('error')) return '#FEF2F2';
  return '#F8FAFC';
};

const getStatusTextColor = (status?: string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('approved') || s.includes('complete')) return '#10B981';
  if (s.includes('pending') || s.includes('review') || s.includes('progress')) return '#F59E0B';
  if (s.includes('fail') || s.includes('reject') || s.includes('error')) return '#EF4444';
  return '#64748B';
};

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
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          testID="backfill-back-btn"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="#1E1B4B" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>Treatment Timeline — Backfill</Text>
          <Text style={s.headerSub}>Fill in the clinical &ldquo;Done On&rdquo; dates on legacy cases.</Text>
        </View>
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#1E1B4B" /></View>
      ) : cases.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="checkmark-done-circle" size={56} color="#10B981" />
          <Text style={s.emptyText}>All caught up. No legacy cases need backfilling.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Stats summary banner */}
          <View style={s.statsCard}>
            <View style={s.statsIconContainer}>
              <Ionicons name="alert-circle" size={20} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.statsTitle}>Backfill Checklist</Text>
              <Text style={s.statsSub}>
                {cases.length} case{cases.length === 1 ? '' : 's'} require clinical date updates.
              </Text>
            </View>
            <View style={s.statsBadge}>
              <Text style={s.statsBadgeText}>{cases.length}</Text>
            </View>
          </View>

          {cases.map(c => (
            <View key={c.id} style={s.card} data-testid={`backfill-card-${c.id}`}>
              {/* Card Header */}
              <TouchableOpacity
                onPress={() => router.push(`/procedures/${c.id}`)}
                style={s.cardHeader}
                accessibilityLabel={`View details for ${c.patient_name || 'patient'}`}
              >
                <View style={s.avatarContainer}>
                  <Text style={s.avatarText}>{getInitials(c.patient_name)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.patientName}>{c.patient_name || 'Unknown patient'}</Text>
                  
                  <View style={s.metaBadges}>
                    {c.registration_number && (
                      <View style={s.badge}>
                        <Ionicons name="card-outline" size={12} color="#64748B" />
                        <Text style={s.badgeText}>Reg {c.registration_number}</Text>
                      </View>
                    )}
                    {c.student_name && (
                      <View style={s.badge}>
                        <Ionicons name="person-outline" size={12} color="#64748B" />
                        <Text style={s.badgeText}>{c.student_name}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Subtitle Chips */}
              <View style={s.chipsRow}>
                <View style={[s.chip, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={[s.chipText, { color: '#1D4ED8' }]}>
                    {c.implant_procedure_type || 'Implant Case'}
                  </Text>
                </View>
                <View style={[s.chip, { backgroundColor: getStatusColor(c.status) }]}>
                  <Text style={[s.chipText, { color: getStatusTextColor(c.status) }]}>
                    {(c.status || '').replace(/_/g, ' ').toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Vertical Timeline */}
              <View style={s.timelineContainer}>
                {FIELDS.map((f, idx) => {
                  const missing = c.missing_fields.includes(f.key as string);
                  const value = edits[c.id]?.[f.key as string] || '';
                  const hasValue = !!value;

                  return (
                    <View key={f.key as string} style={s.timelineRow}>
                      {/* Left timeline connector line and dot */}
                      <View style={s.timelineLeft}>
                        {idx < FIELDS.length - 1 && (
                          <View style={s.timelineLine} />
                        )}
                        <View style={[
                          s.timelineDot,
                          hasValue ? s.dotCompleted : s.dotMissing
                        ]}>
                          {hasValue ? (
                            <Ionicons name="checkmark" size={10} color="#FFF" />
                          ) : (
                            <View style={s.dotInnerMissing} />
                          )}
                        </View>
                      </View>

                      {/* Right field label and input */}
                      <View style={s.timelineRight}>
                        <Text style={[s.fieldLabel, missing && { color: '#EF4444' }]}>
                          {f.label}{missing ? ' *' : ''}
                        </Text>
                        <CalendarPicker
                          value={value}
                          onChange={(v) => setField(c.id, f.key as string, v)}
                          placeholder="Select date"
                          allowPast
                          allowFuture={false}
                          compact
                          variant="standard"
                          testID={`backfill-${c.id}-${f.key as string}`}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Card Action */}
              <TouchableOpacity
                style={[s.saveBtn, savingId === c.id && { opacity: 0.6 }]}
                disabled={savingId === c.id}
                onPress={() => save(c.id)}
                data-testid={`backfill-save-${c.id}`}
              >
                {savingId === c.id ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="save" size={16} color="#FFF" />
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FFF',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#1E1B4B' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#475569', fontSize: 14, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  
  statsCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  statsIconContainer: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFEDD5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  statsTitle: { fontSize: 13, fontWeight: '700', color: '#1E1B4B' },
  statsSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  statsBadge: {
    backgroundColor: '#EA580C', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statsBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  card: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
  },
  avatarContainer: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2F6',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#475569' },
  patientName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  metaBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  timelineContainer: { marginTop: 16, paddingLeft: 4 },
  timelineRow: { flexDirection: 'row', minHeight: 70, marginBottom: 12 },
  timelineLeft: { width: 32, alignItems: 'center', position: 'relative' },
  timelineLine: { position: 'absolute', top: 22, bottom: -20, left: 15, width: 2, backgroundColor: '#F1F5F9' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', zIndex: 10, top: 2 },
  dotCompleted: { backgroundColor: '#10B981', borderColor: '#10B981' },
  dotMissing: { borderColor: '#EF4444' },
  dotInnerMissing: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  timelineRight: { flex: 1, paddingLeft: 8 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  saveBtn: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1E1B4B', borderRadius: 12, paddingVertical: 12,
  },
  saveText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  errorText: { textAlign: 'center', marginTop: 80, color: '#EF4444', fontWeight: '600' },
});
