import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import api from '../utils/api';
import SharedAutoclaveRow, { InstrumentsAutoclaved as SharedInstrumentsAutoclaved } from './AutoclaveRow';

type InstrumentsAutoclaved = {
  marked: boolean;
  marked_by?: string;
  marked_by_name?: string;
  marked_at?: string;
} | null;

type ScheduledCase = {
  id: string;
  patient_name: string;
  patient_id: string;
  student_name: string;
  implant_procedure_type: string;
  status: string;
  procedure_date: string;
  procedure_time: string;
  supervisor_name?: string;
  implant_incharge_name?: string;
  instruments_autoclaved?: InstrumentsAutoclaved;
  consent_uploaded?: boolean;
};

const DAYS_WINDOW = 5;

/** Format "10:00" → "10:00 AM", "14:00" → "2:00 PM"; pass through when already formatted. */
function formatTimeSlot(t: string): string {
  if (!t) return '';
  if (/am|pm/i.test(t)) return t.toUpperCase().replace(/\s+/g, ' ');
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = parseInt(m[1], 10);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

/** Human-friendly header for a given YYYY-MM-DD relative to today. */
function dayHeader(dateStr: string): string {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseISO(dateStr);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Today's Cases";
    if (diff === 1) return "Tomorrow's Cases";
    return `${format(d, 'EEEE, MMM dd')}`;
  } catch {
    return dateStr;
  }
}

/** Returns true when we are within 1 hour of (or past) the scheduled surgery time. */
function isLocked(dateStr: string, timeStr: string): boolean {
  if (!dateStr || !timeStr) return false;
  // Accept "10:00", "10:00 AM", "14:00" formats
  const t = timeStr.trim().toUpperCase();
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  let hh = 0;
  let mm = 0;
  if (match24) {
    hh = parseInt(match24[1], 10);
    mm = parseInt(match24[2], 10);
  } else if (match12) {
    hh = parseInt(match12[1], 10) % 12;
    mm = parseInt(match12[2], 10);
    if (match12[3] === 'PM') hh += 12;
  } else {
    return false;
  }
  const dt = new Date(dateStr + 'T00:00:00');
  dt.setHours(hh, mm, 0, 0);
  const cutoff = dt.getTime() - 60 * 60 * 1000;
  return Date.now() >= cutoff;
}

type AutoclaveRowProps = {
  caseId: string;
  locked: boolean;
  marked: boolean;
  markedAt?: string;
  onToggled: (next: InstrumentsAutoclaved) => void;
};

function AutoclaveRow({ caseId, locked, marked, markedAt, onToggled }: AutoclaveRowProps) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy || (locked && marked)) return; // locked + already marked = read-only display
    if (locked && !marked) return;
    setBusy(true);
    try {
      const res = await api.post(`/procedures/${caseId}/mark-instruments-autoclaved`, {
        marked: !marked,
      });
      onToggled(res.data?.instruments_autoclaved ?? null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Could not update instrument status';
      Alert.alert('Could not update', msg);
    } finally {
      setBusy(false);
    }
  };

  const canInteract = !locked;
  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={canInteract ? 0.7 : 1}
      disabled={busy || !canInteract}
      style={[
        styles.autoclaveRow,
        marked ? styles.autoclaveRowOn : styles.autoclaveRowOff,
        !canInteract && { opacity: 0.85 },
      ]}
      testID={`autoclave-toggle-${caseId}`}
    >
      <View style={[styles.checkbox, marked && styles.checkboxOn]}>
        {busy ? (
          <ActivityIndicator size="small" color={marked ? '#FFF' : '#2E7D32'} />
        ) : marked ? (
          <Ionicons name="checkmark" size={14} color="#FFF" />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.autoclaveLabel, marked && { color: '#1B5E20' }]} numberOfLines={1}>
          {marked ? 'Instruments autoclaved ✓' : 'Mark instruments Autoclaved'}
        </Text>
        {marked && markedAt ? (
          <Text style={styles.autoclaveHint} numberOfLines={1}>
            {locked ? 'Locked · ' : ''}Marked {format(parseISO(markedAt), 'MMM dd · hh:mm a')}
          </Text>
        ) : !canInteract ? (
          <Text style={styles.autoclaveHint} numberOfLines={1}>Locked — within 1 hr of surgery</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function ScheduledCasesSection({ router }: { router: any }) {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<ScheduledCase[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/procedures/nurse/scheduled-cases?days=${DAYS_WINDOW}`);
      setCases(res.data.cases || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Already sorted chronologically from backend. Slice first 5 by default.
  const visible = showAll ? cases : cases.slice(0, 5);

  // Group visible cards by procedure_date preserving order.
  const grouped: { date: string; items: ScheduledCase[] }[] = [];
  for (const c of visible) {
    const last = grouped[grouped.length - 1];
    if (last && last.date === c.procedure_date) {
      last.items.push(c);
    } else {
      grouped.push({ date: c.procedure_date, items: [c] });
    }
  }

  return (
    <View style={styles.section} testID="scheduled-cases-section">
      <View style={styles.header}>
        <Ionicons name="calendar" size={16} color="#2E7D32" />
        <Text style={styles.title}>Scheduled Cases</Text>
        {cases.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{cases.length}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={load} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="scheduled-refresh">
          <Ionicons name="refresh" size={16} color="#78909C" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sub}>Next {DAYS_WINDOW} days · Phase 2-ready cases</Text>

      {loading ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator size="small" color="#2E7D32" />
        </View>
      ) : cases.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={32} color="#81C784" />
          <Text style={styles.emptyText}>No surgeries scheduled</Text>
          <Text style={styles.emptySubtext}>No Phase-2-ready cases in the next {DAYS_WINDOW} days.</Text>
        </View>
      ) : (
        <>
          {grouped.map((g) => (
            <View key={g.date} style={{ marginBottom: 6 }}>
              <Text style={styles.groupHeader} testID={`scheduled-group-${g.date}`}>
                {dayHeader(g.date)} <Text style={styles.groupCount}>· {g.items.length}</Text>
              </Text>
              {g.items.map((c) => {
                const marked = !!c.instruments_autoclaved?.marked;
                const consentUploaded = !!c.consent_uploaded;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.card}
                    onPress={() => router.push(`/procedures/${c.id}`)}
                    activeOpacity={0.85}
                    testID={`scheduled-card-${c.id}`}
                  >
                    <View style={styles.cardMain}>
                      <View style={styles.timePill}>
                        <Ionicons name="time-outline" size={12} color="#FFF" />
                        <Text style={styles.timePillText}>{formatTimeSlot(c.procedure_time)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.patientName} numberOfLines={1}>{c.patient_name || 'Patient'}</Text>
                        <Text style={styles.meta} numberOfLines={1}>{c.implant_procedure_type}</Text>
                        <Text style={styles.studentLine} numberOfLines={1}>
                          <Ionicons name="person-outline" size={10} color="#546E7A" /> {c.student_name}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
                    </View>
                    <View style={styles.pillRow}>
                      <View style={[styles.consentPill, consentUploaded ? styles.consentPillOk : styles.consentPillWarn]}>
                        <Ionicons
                          name={consentUploaded ? 'checkmark-circle' : 'alert-circle'}
                          size={12}
                          color="#FFF"
                        />
                        <Text style={styles.consentPillText}>
                          {consentUploaded ? 'Consent form uploaded' : 'Consent form pending'}
                        </Text>
                      </View>
                      <SharedAutoclaveRow
                        caseId={c.id}
                        procedureDate={c.procedure_date}
                        procedureTime={c.procedure_time}
                        marked={marked}
                        markedAt={c.instruments_autoclaved?.marked_at}
                        compact
                        onToggled={(next: SharedInstrumentsAutoclaved) => {
                          setCases((prev) =>
                            prev.map((x) =>
                              x.id === c.id ? { ...x, instruments_autoclaved: next } : x,
                            ),
                          );
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          {cases.length > 5 && (
            <TouchableOpacity
              onPress={() => setShowAll(!showAll)}
              style={styles.showMoreBtn}
              testID="scheduled-show-more-btn"
            >
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color="#2E7D32" />
              <Text style={styles.showMoreText}>
                {showAll ? 'Show less' : `Show more (${cases.length - 5})`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: '700', color: '#37474F' },
  sub: { fontSize: 11, color: '#78909C', marginBottom: 10 },
  countBadge: {
    backgroundColor: '#2E7D32',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 4,
  },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#455A64', marginTop: 4 },
  emptySubtext: { fontSize: 12, color: '#78909C', textAlign: 'center' },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E20',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#66BB6A',
    textTransform: 'none',
    letterSpacing: 0,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#2E7D32',
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 0,
  },
  consentPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexGrow: 0,
    flexShrink: 0,
  },
  consentPillOk: { backgroundColor: '#2E7D32' },
  consentPillWarn: { backgroundColor: '#C62828' },
  consentPillText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  autoclaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  autoclaveRowOff: { backgroundColor: '#FAFAFA' },
  autoclaveRowOn: { backgroundColor: '#E8F5E9' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2E7D32',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  autoclaveLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#455A64',
  },
  autoclaveHint: {
    fontSize: 10,
    color: '#78909C',
    marginTop: 2,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 78,
    justifyContent: 'center',
  },
  timePillText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  patientName: { fontSize: 14, fontWeight: '700', color: '#0D47A1' },
  meta: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  studentLine: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  showMoreText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },
});
