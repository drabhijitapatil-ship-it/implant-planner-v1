/**
 * iter-332: Shared "Done On" date picker used by Phase 2 / 3 / 4-Step1 /
 * 4-Step2 submission forms.
 *
 * Defaults to today, capped at today, no further back than 30 days, and
 * (when `minDate` is supplied) cannot be earlier than the previous
 * phase's done-date. Renders a native HTML date input on web and a
 * tappable inline calendar grid on native (iOS/Android) — no typing
 * required on either platform.
 */
import React, { useState } from 'react';
import { Platform, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type DoneDatePickerProps = {
  label?: string;
  value: string;                    // ISO YYYY-MM-DD
  onChange: (v: string) => void;
  minDate?: string;                 // ISO YYYY-MM-DD - previous phase done-date
  required?: boolean;
  testID?: string;
  helperText?: string;
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Effective lower bound: the later of (30 days ago) and the caller-supplied
// previous-phase minDate, so a recent prior phase tightens the window.
function effectiveMinIso(minDate?: string): string {
  const floor = thirtyDaysAgoIso();
  return minDate && minDate > floor ? minDate : floor;
}

export default function DoneDatePicker({
  label = 'Done On',
  value,
  onChange,
  minDate,
  required = false,
  testID = 'done-date-picker',
  helperText,
}: DoneDatePickerProps) {
  const today = todayIso();
  const min = effectiveMinIso(minDate);
  const [open, setOpen] = useState(false);

  const parsed = (value || today).split('-').map((n) => parseInt(n, 10));
  const [viewYear, setViewYear] = useState(parsed[0] || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed[1] || new Date().getMonth() + 1) - 1);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const isoFor = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day: number) => {
    onChange(isoFor(day));
    setOpen(false);
  };

  const isDisabled = (day: number) => {
    const iso = isoFor(day);
    return iso < min || iso > today;
  };
  const isSelected = (day: number) => (value || today) === isoFor(day);
  const isToday = (day: number) => isoFor(day) === today;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={styles.box} data-testid={`${testID}-wrap`}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: '#DC3545' }}> *</Text> : null}
      </Text>
      {Platform.OS === 'web' ? (
        // @ts-ignore — RN-Web passes <input> attrs through TextInput.
        <TextInput
          style={styles.input}
          value={value || today}
          onChangeText={onChange}
          // @ts-ignore — RN-Web converts these to attributes on the input.
          type="date"
          data-testid={testID}
          testID={testID}
        />
      ) : (
        <>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setOpen((v) => !v)}
            testID={testID}
            data-testid={testID}
          >
            <Text style={{ fontSize: 14, color: '#1e2a44' }}>{value || today}</Text>
            <Ionicons name="calendar-outline" size={18} color="#666" />
          </TouchableOpacity>
          {open && (
            <View style={calStyles.container}>
              <View style={calStyles.header}>
                <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn} data-testid={`${testID}-prev-month`}>
                  <Ionicons name="chevron-back" size={20} color="#1A73E8" />
                </TouchableOpacity>
                <Text style={calStyles.monthYear}>{monthNames[viewMonth]} {viewYear}</Text>
                <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn} data-testid={`${testID}-next-month`}>
                  <Ionicons name="chevron-forward" size={20} color="#1A73E8" />
                </TouchableOpacity>
              </View>
              <View style={calStyles.dayNamesRow}>
                {dayNames.map((dn) => (
                  <Text key={dn} style={calStyles.dayName}>{dn}</Text>
                ))}
              </View>
              <View style={calStyles.grid}>
                {cells.map((day, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={calStyles.cell}
                    disabled={!day || isDisabled(day)}
                    onPress={() => day && selectDate(day)}
                  >
                    <View style={[
                      calStyles.cellInner,
                      !!day && isSelected(day) && calStyles.cellSelected,
                      !!day && isToday(day) && !isSelected(day) && calStyles.cellToday,
                    ]}>
                      <Text style={[
                        calStyles.cellText,
                        !!day && isDisabled(day) && calStyles.cellDisabled,
                        !!day && isSelected(day) && calStyles.cellSelectedText,
                        !!day && isToday(day) && !isSelected(day) && calStyles.cellTodayText,
                      ]}>
                        {day || ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}
      <Text style={styles.helper}>
        {helperText || `Defaults to today. Allowed range: ${min} to ${today}.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginVertical: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#1e2a44', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 12, fontSize: 14, color: '#1e2a44',
    backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  helper: { fontSize: 11, color: '#78909C', marginTop: 4 },
});

const calStyles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  navBtn: { padding: 6 },
  monthYear: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  dayNamesRow: { flexDirection: 'row', marginBottom: 2 },
  dayName: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#999' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 38, justifyContent: 'center', alignItems: 'center' },
  cellInner: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 14, color: '#333', textAlign: 'center', lineHeight: 30 },
  cellDisabled: { color: '#CCC' },
  cellSelected: { backgroundColor: '#1A73E8' },
  cellSelectedText: { color: '#FFF', fontWeight: '700' },
  cellToday: { borderWidth: 1.5, borderColor: '#1A73E8' },
  cellTodayText: { color: '#1A73E8', fontWeight: '600' },
});
