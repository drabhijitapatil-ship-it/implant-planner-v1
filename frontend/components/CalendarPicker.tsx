/**
 * iter-365 — Reusable Calendar Picker
 *
 * Extracted from `new-procedure.tsx` and generalised with an `allowPast`
 * prop so analytics screens can pick historical date ranges while
 * scheduling flows keep the "no past dates" guard.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  allowPast?: boolean;         // default false (future dates only)
  allowFuture?: boolean;       // default true
  compact?: boolean;           // tighter styling for filter rows
  testID?: string;
};

export default function CalendarPicker({
  value, onChange, label, placeholder = 'Select Date',
  required, allowPast = false, allowFuture = true, compact, testID,
}: Props) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  };

  const clear = () => { onChange(''); setOpen(false); };

  const isDisabled = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!allowPast && date < todayMidnight) return true;
    if (!allowFuture && date > todayMidnight) return true;
    return false;
  };

  const isSelected = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return value === `${viewYear}-${m}-${d}`;
  };

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={compact ? cs.wrapCompact : cs.wrap}>
      {label ? <Text style={cs.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text> : null}
      <TouchableOpacity
        style={compact ? cs.triggerCompact : cs.trigger}
        onPress={() => setOpen(!open)}
        testID={testID || 'calendar-trigger'}
        /* @ts-ignore */ data-testid={testID || 'calendar-trigger'}
      >
        <Text style={[cs.triggerTxt, !value && { color: '#B0BEC5' }]}>{value || placeholder}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {value ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); clear(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`${testID || 'calendar'}-clear`}
            >
              <Ionicons name="close-circle" size={16} color="#90A4AE" />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="calendar-outline" size={16} color="#546E7A" />
        </View>
      </TouchableOpacity>
      {open && (
        <View style={cs.calendar}>
          <View style={cs.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={cs.navBtn} testID="cal-prev-month">
              <Ionicons name="chevron-back" size={18} color="#1A73E8" />
            </TouchableOpacity>
            <Text style={cs.monthYear}>{monthNames[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={cs.navBtn} testID="cal-next-month">
              <Ionicons name="chevron-forward" size={18} color="#1A73E8" />
            </TouchableOpacity>
          </View>
          <View style={cs.weekRow}>
            {dayNames.map(dn => (
              <View key={dn} style={cs.dayHead}><Text style={cs.dayHeadTxt}>{dn}</Text></View>
            ))}
          </View>
          <View style={cs.gridWrap}>
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={cs.dayCell} />;
              const disabled = isDisabled(day);
              const selected = isSelected(day);
              const todayFlag = isToday(day);
              return (
                <TouchableOpacity
                  key={idx}
                  disabled={disabled}
                  onPress={() => selectDate(day)}
                  style={[
                    cs.dayCell,
                    selected && cs.dayCellSelected,
                    !selected && todayFlag && cs.dayCellToday,
                  ]}
                  testID={`cal-day-${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                >
                  <Text style={[
                    cs.dayTxt,
                    disabled && { color: '#CFD8DC' },
                    selected && { color: '#FFF', fontWeight: '700' },
                    !selected && todayFlag && { color: '#1A73E8', fontWeight: '700' },
                  ]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapCompact: {},
  label: { fontSize: 11, fontWeight: '700', color: '#546E7A', letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF',
  },
  triggerCompact: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, backgroundColor: '#FFF',
  },
  triggerTxt: { fontSize: 13, color: '#1A2332', fontWeight: '600' },

  calendar: {
    marginTop: 6, backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF',
    padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 6,
  },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F0F4F8' },
  monthYear: { fontSize: 14, fontWeight: '800', color: '#1A2332' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  dayHead: { flex: 1, alignItems: 'center' },
  dayHeadTxt: { fontSize: 10, color: '#78909C', fontWeight: '700' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  dayTxt: { fontSize: 13, color: '#37474F' },
  dayCellSelected: { backgroundColor: '#1E88E5', borderRadius: 999 },
  dayCellToday: { borderWidth: 1, borderColor: '#1A73E8', borderRadius: 999 },
});
