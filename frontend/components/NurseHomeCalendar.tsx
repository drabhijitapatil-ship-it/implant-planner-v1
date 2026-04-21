import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import api from '../utils/api';
import AutoclaveRow, { InstrumentsAutoclaved } from './AutoclaveRow';

type ConsentCase = {
  id: string;
  patient_name: string;
  patient_id: string;
  student_name: string;
  implant_procedure_type: string;
  status: string;
  procedure_date: string;
  procedure_time: string;
  consent_uploaded: boolean;
  instruments_autoclaved?: InstrumentsAutoclaved;
};

function fmtTime(t: string): string {
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

export function NurseHomeCalendar({ router }: { router: any }) {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<ConsentCase[]>([]);
  const [completed, setCompleted] = useState(0);
  const [pending, setPending] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procedures/nurse/consent-cases');
      setCases(res.data.cases || []);
      setCompleted(res.data.completed_count || 0);
      setPending(res.data.pending_count || 0);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build marked-dates object: each date gets a small dot coloured by consent status.
  // Green = all cases on that date have uploaded consent; Red = any pending;
  // Amber = mixed day (has both).
  const markedDates = useMemo(() => {
    const byDate: Record<string, { any: boolean; allUploaded: boolean; anyPending: boolean }> = {};
    for (const c of cases) {
      if (!c.procedure_date) continue;
      const bucket = byDate[c.procedure_date] || { any: false, allUploaded: true, anyPending: false };
      bucket.any = true;
      if (c.consent_uploaded) {
        // keep allUploaded as true
      } else {
        bucket.allUploaded = false;
        bucket.anyPending = true;
      }
      byDate[c.procedure_date] = bucket;
    }
    const marked: Record<string, any> = {};
    for (const [date, info] of Object.entries(byDate)) {
      const color =
        info.allUploaded ? '#2E7D32' : info.anyPending && info.any && hasAnyUploaded(cases, date) ? '#F9A825' : '#C62828';
      marked[date] = { marked: true, dotColor: color };
    }
    if (selectedDate) {
      marked[selectedDate] = { ...(marked[selectedDate] || {}), selected: true, selectedColor: '#1565C0' };
    }
    return marked;
  }, [cases, selectedDate]);

  const dateCases = useMemo(() => {
    if (!selectedDate) return [];
    return cases
      .filter((c) => c.procedure_date === selectedDate)
      .sort((a, b) => (a.procedure_time || '').localeCompare(b.procedure_time || ''));
  }, [cases, selectedDate]);

  const goToCases = (filter: 'completed' | 'pending') => {
    router.push({ pathname: '/(tabs)/procedures', params: { nurseFilter: filter } });
  };

  return (
    <View style={styles.container}>
      {/* Tiles: Completed + Pending */}
      <View style={styles.tilesRow}>
        <TouchableOpacity
          style={[styles.tile, styles.tileCompleted]}
          onPress={() => goToCases('completed')}
          activeOpacity={0.85}
          testID="home-tile-completed"
        >
          <View style={styles.tileIcon}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileLabel}>Completed</Text>
            <Text style={styles.tileCount}>{loading ? '—' : completed}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tile, styles.tilePending]}
          onPress={() => goToCases('pending')}
          activeOpacity={0.85}
          testID="home-tile-pending"
        >
          <View style={styles.tileIcon}>
            <Ionicons name="alert-circle" size={20} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tileLabel}>Pending</Text>
            <Text style={styles.tileCount}>{loading ? '—' : pending}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>

      {/* Calendar */}
      <View style={styles.calendarWrap} testID="nurse-home-calendar">
        {loading ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <ActivityIndicator color="#1565C0" />
          </View>
        ) : (
          <Calendar
            markedDates={markedDates}
            onDayPress={(day: any) => {
              setSelectedDate((prev) => (prev === day.dateString ? null : day.dateString));
            }}
            theme={{
              selectedDayBackgroundColor: '#1565C0',
              todayTextColor: '#1565C0',
              arrowColor: '#1565C0',
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textMonthFontSize: 15,
            }}
            style={styles.calendar}
            firstDay={1}
          />
        )}
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <LegendDot color="#2E7D32" label="All consents uploaded" />
        <LegendDot color="#F9A825" label="Mixed" />
        <LegendDot color="#C62828" label="Pending" />
      </View>

      {/* Date selection reveal */}
      {selectedDate && (
        <View style={styles.selectedBlock} testID={`nurse-home-date-cases-${selectedDate}`}>
          <View style={styles.selectedHeader}>
            <Ionicons name="calendar" size={14} color="#1565C0" />
            <Text style={styles.selectedHeaderText}>
              Cases on {format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM dd')}
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setSelectedDate(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="nurse-home-close-date"
            >
              <Ionicons name="close" size={16} color="#78909C" />
            </TouchableOpacity>
          </View>

          {dateCases.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={22} color="#B0BEC5" />
              <Text style={styles.emptyText}>No cases scheduled on this date.</Text>
            </View>
          ) : (
            dateCases.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.caseCard}
                onPress={() => router.push(`/procedures/${c.id}`)}
                activeOpacity={0.85}
                testID={`nurse-home-date-card-${c.id}`}
              >
                <View style={styles.timePill}>
                  <Ionicons name="time-outline" size={11} color="#FFF" />
                  <Text style={styles.timePillText}>{fmtTime(c.procedure_time) || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName} numberOfLines={1}>
                    {c.patient_name || 'Patient'}
                  </Text>
                  {c.implant_procedure_type ? (
                    <Text style={styles.meta} numberOfLines={1}>{c.implant_procedure_type}</Text>
                  ) : null}
                  <Text style={styles.metaStudent} numberOfLines={1}>
                    <Ionicons name="person-outline" size={10} color="#546E7A" /> {c.student_name}
                  </Text>
                  <View style={styles.pillRow}>
                    <View style={[styles.statusPill, c.consent_uploaded ? styles.statusOk : styles.statusWarn]}>
                      <Ionicons
                        name={c.consent_uploaded ? 'checkmark-circle' : 'alert-circle'}
                        size={11}
                        color="#FFF"
                      />
                      <Text style={styles.statusPillText}>
                        {c.consent_uploaded ? 'Consent uploaded' : 'Consent pending'}
                      </Text>
                    </View>
                    <AutoclaveRow
                      caseId={c.id}
                      procedureDate={c.procedure_date}
                      procedureTime={c.procedure_time}
                      marked={!!c.instruments_autoclaved?.marked}
                      markedAt={c.instruments_autoclaved?.marked_at}
                      compact
                      onToggled={(next) => {
                        setCases((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, instruments_autoclaved: next } : x)),
                        );
                      }}
                    />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B0BEC5" />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function hasAnyUploaded(cases: ConsentCase[], date: string): boolean {
  return cases.some((c) => c.procedure_date === date && c.consent_uploaded);
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 6 },
  tilesRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 6px rgba(0,0,0,0.1)' } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    }),
  },
  tileCompleted: { backgroundColor: '#2E7D32' },
  tilePending: { backgroundColor: '#C62828' },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  tileCount: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 1 },
  calendarWrap: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E7EC',
  },
  calendar: { paddingBottom: 6 },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 6,
    marginBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#78909C' },
  selectedBlock: {
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: '#F5FAFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  selectedHeaderText: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  emptyCard: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  emptyText: { fontSize: 12, color: '#78909C' },
  caseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1565C0',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1565C0',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 72,
    justifyContent: 'center',
  },
  timePillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  patientName: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  meta: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  metaStudent: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  statusOk: { backgroundColor: '#2E7D32' },
  statusWarn: { backgroundColor: '#C62828' },
  statusPillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
});
