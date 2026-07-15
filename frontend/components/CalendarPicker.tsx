/**
 * iter-365 (revised iter-366) — Reusable Calendar Picker
 *
 * Two visual modes:
 *   • Default (inline)  — used inside Phase-1 scheduling forms.
 *     Calendar drops down below the trigger, blocking future/past
 *     dates per `allowPast` / `allowFuture` flags.
 *   • `compact` (modal) — used in the analytics filter rows where
 *     multiple pickers sit side-by-side. Trigger takes flex:1 of its
 *     parent row; opening the picker mounts a centered Modal that
 *     never spills off-screen.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  allowPast?: boolean;
  allowFuture?: boolean;
  compact?: boolean;
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

  // ── The calendar body — reused in both inline and modal modes ──
  const CalendarBody = (
    <View style={compact ? cs.calCompact : cs.calendar}>
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
      {compact && (
        <View style={cs.modalFooter}>
          <TouchableOpacity onPress={clear} style={cs.footerBtn} testID={`${testID || 'calendar'}-modal-clear`}>
            <Ionicons name="trash-outline" size={14} color="#78909C" />
            <Text style={cs.footerBtnTxt}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setOpen(false)} style={[cs.footerBtn, { backgroundColor: '#F5F7FB' }]} testID={`${testID || 'calendar'}-modal-close`}>
            <Text style={[cs.footerBtnTxt, { color: '#1A2332', fontWeight: '700' }]}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={compact ? cs.wrapCompact : cs.wrap}>
      {label ? <Text style={cs.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text> : null}
      <TouchableOpacity
        style={compact ? cs.triggerCompact : cs.trigger}
        onPress={() => setOpen(!open)}
        testID={testID || 'calendar-trigger'}
        /* @ts-ignore */ data-testid={testID || 'calendar-trigger'}
      >
        <Text style={[compact ? cs.triggerTxtCompact : cs.triggerTxt, !value && { color: '#B0BEC5' }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {value ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); clear(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID={`${testID || 'calendar'}-clear`}
            >
              <Ionicons name="close-circle" size={14} color="#90A4AE" />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="calendar-outline" size={14} color="#546E7A" />
        </View>
      </TouchableOpacity>

      {/* Inline (non-compact) — drops below trigger */}
      {!compact && open && CalendarBody}

      {/* Compact — modal so it never spills off-screen */}
      {compact && (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          statusBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={cs.backdrop} onPress={() => setOpen(false)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={cs.modalCenter}>
              {CalendarBody}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapCompact: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: '#546E7A', letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },

  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF',
  },
  triggerCompact: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#1E88E5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#E3F2FD',
    minHeight: 42,
    shadowColor: '#1E88E5', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  triggerTxt: { fontSize: 13, color: '#1A2332', fontWeight: '600' },
  triggerTxtCompact: { fontSize: 13, color: '#0D47A1', fontWeight: '700', flex: 1, marginRight: 6 },

  // Inline calendar body (Phase-1 scheduling form)
  calendar: {
    marginTop: 6, backgroundColor: '#FFF',
    borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF',
    padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 6,
  },
  // Compact calendar body (rendered inside centered modal)
  calCompact: {
    backgroundColor: '#FFF',
    borderRadius: 14, padding: 12,
    width: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
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

  // Modal backdrop + centering
  // The extreme zIndex/elevation values ensure the modal renders on top of
  // Expo Web's `position: fixed` chrome (nav bars, sticky headers) and on
  // Android where TextInput/Native components can otherwise appear above.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 9999,
    elevation: 24,
    // @ts-ignore — RN-Web accepts position:'fixed' here to escape parent transforms
    position: (typeof document !== 'undefined' ? 'fixed' : 'absolute') as any,
    top: 0, left: 0, right: 0, bottom: 0,
  },
  modalCenter: {
    alignSelf: 'center',
    zIndex: 10000,
    elevation: 25,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F8',
  },
  footerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999,
  },
  footerBtnTxt: { fontSize: 12, fontWeight: '600', color: '#78909C' },
});
