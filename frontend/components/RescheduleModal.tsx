import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import api from '../utils/api';

// iter-269 / iter-273: shared modal used from both the My Cases three-dot
// menu and the case-detail screen to reschedule a case. Validation rules
// mirror the server: Sundays blocked, Saturdays restricted to the
// 10:00 slot. iter-273: KeyboardAvoidingView so the form lifts above the
// keyboard and the date input is now a tap-to-open inline calendar.
const TIME_SLOTS: { label: string; value: string }[] = [
  { label: '10:00 AM', value: '10:00' },
  { label: '2:00 PM', value: '14:00' },
];

const isoToday = () => format(new Date(), 'yyyy-MM-dd');

export default function RescheduleModal({
  visible,
  procedureId,
  patientName,
  currentDate,
  currentTime,
  onClose,
  onRescheduled,
}: {
  visible: boolean;
  procedureId: string;
  patientName?: string;
  currentDate?: string;
  currentTime?: string;
  onClose: () => void;
  onRescheduled?: () => void;
}) {
  const [newDate, setNewDate] = useState<string>(currentDate || isoToday());
  const [newTime, setNewTime] = useState<string>(currentTime || '10:00');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  // iter-274: OT slot density map for the calendar dots.
  //   value 0 = empty (no dot), 1 = partially booked (amber), 2 = full (red).
  // Excludes drafts and the current case being rescheduled.
  const [densityMap, setDensityMap] = useState<Record<string, number>>({});

  // Reset state every time the modal is re-opened so we don't carry
  // over a half-typed reason from a previous attempt.
  React.useEffect(() => {
    if (visible) {
      setNewDate(currentDate || isoToday());
      setNewTime(currentTime || '10:00');
      setReason('');
      setSubmitting(false);
      setShowCalendar(false);
    }
  }, [visible, currentDate, currentTime]);

  // iter-274: fetch booking density once per open.
  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/procedures');
        if (cancelled || !Array.isArray(data)) return;
        const counts: Record<string, Set<string>> = {};
        for (const p of data) {
          if (!p?.procedure_date || !p?.procedure_time) continue;
          if (p.status === 'draft') continue;
          if (String(p.id) === String(procedureId)) continue; // exclude self
          const set = counts[p.procedure_date] || new Set<string>();
          set.add(String(p.procedure_time));
          counts[p.procedure_date] = set;
        }
        const map: Record<string, number> = {};
        for (const [d, set] of Object.entries(counts)) {
          map[d] = set.size; // 1 or 2
        }
        setDensityMap(map);
      } catch {
        // best-effort — calendar still works without dots
      }
    })();
    return () => { cancelled = true; };
  }, [visible, procedureId]);

  const dateError = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      return 'Pick a valid date';
    }
    const d = new Date(`${newDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'Pick a valid date';
    if (d.getDay() === 0) return 'Sundays are not available for scheduling';
    if (d.getDay() === 6 && newTime !== '10:00') return 'Saturdays only allow the 10:00 AM slot';
    return null;
  }, [newDate, newTime]);

  const sameAsCurrent = newDate === currentDate && newTime === currentTime;

  const canSubmit =
    !!newDate && !!newTime && reason.trim().length >= 3 && !dateError && !sameAsCurrent && !submitting;

  // Calendar markings: density dot + selected highlight. We compute the
  // dot per date — 1 booking = amber (partial), 2+ = red (full). Saturdays
  // only allow 1 slot so a single booking already saturates the day.
  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    for (const [date, count] of Object.entries(densityMap)) {
      let dotColor: string | null = null;
      const isSat = new Date(`${date}T00:00:00`).getDay() === 6;
      if (count >= 2 || (isSat && count >= 1)) dotColor = '#C62828';
      else if (count === 1) dotColor = '#F9A825';
      if (dotColor) m[date] = { marked: true, dotColor };
    }
    if (newDate) {
      m[newDate] = { ...(m[newDate] || {}), selected: true, selectedColor: '#1565C0' };
    }
    return m;
  }, [densityMap, newDate]);

  const minDate = isoToday();

  const prettyDate = (() => {
    if (!newDate) return 'Pick a date';
    const d = new Date(`${newDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return newDate;
    return format(d, 'EEE, MMM d, yyyy');
  })();

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedureId}/reschedule`, {
        procedure_date: newDate,
        procedure_time: newTime,
        reason: reason.trim(),
      });
      Alert.alert('Rescheduled', `${patientName || 'Case'} moved to ${prettyDate} at ${newTime}.`);
      onRescheduled?.();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to reschedule. Please try again.';
      Alert.alert('Could not reschedule', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.backdrop}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={s.sheet} testID="reschedule-modal">
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Reschedule surgery</Text>
              {patientName ? <Text style={s.subtitle} numberOfLines={1}>{patientName}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="reschedule-close">
              <Ionicons name="close" size={22} color="#546E7A" />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {currentDate ? (
              <View style={s.currentRow}>
                <Ionicons name="calendar-outline" size={16} color="#78909C" />
                <Text style={s.currentTxt}>
                  Current: <Text style={{ fontWeight: '700' }}>{currentDate} {currentTime ? `at ${currentTime}` : ''}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={s.label}>New date</Text>
            <TouchableOpacity
              style={[s.dateRow, dateError && s.inputError]}
              onPress={() => setShowCalendar(v => !v)}
              activeOpacity={0.7}
              testID="reschedule-date-open"
            >
              <Ionicons name="calendar-outline" size={18} color="#1565C0" />
              <Text style={s.dateRowTxt}>{prettyDate}</Text>
              <Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={18} color="#90A4AE" />
            </TouchableOpacity>

            {showCalendar ? (
              <View style={s.calendarWrap} testID="reschedule-calendar">
                <Calendar
                  minDate={minDate}
                  current={newDate || minDate}
                  markedDates={markedDates}
                  disabledDaysIndexes={[0] /* block Sundays */}
                  onDayPress={(day: any) => {
                    setNewDate(day.dateString);
                    setShowCalendar(false);
                  }}
                  theme={{
                    selectedDayBackgroundColor: '#1565C0',
                    todayTextColor: '#1565C0',
                    arrowColor: '#1565C0',
                    textDayFontWeight: '500',
                    textMonthFontWeight: '700',
                    textMonthFontSize: 14,
                    textDayHeaderFontWeight: '600',
                  }}
                  firstDay={1}
                />
                <View style={s.legendRow} data-testid="reschedule-density-legend">
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#F9A825' }]} />
                    <Text style={s.legendTxt}>Partially booked</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#C62828' }]} />
                    <Text style={s.legendTxt}>OT full</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#CFD8DC' }]} />
                    <Text style={s.legendTxt}>Free</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <Text style={s.label}>New time</Text>
            <View style={s.slotRow}>
              {TIME_SLOTS.map(slot => {
                const active = newTime === slot.value;
                return (
                  <TouchableOpacity
                    key={slot.value}
                    style={[s.slot, active && s.slotActive]}
                    onPress={() => setNewTime(slot.value)}
                    testID={`reschedule-slot-${slot.value}`}
                  >
                    <Text style={[s.slotTxt, active && s.slotTxtActive]}>{slot.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {dateError ? (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={14} color="#C62828" />
                <Text style={s.errorTxt}>{dateError}</Text>
              </View>
            ) : null}

            <Text style={s.label}>Reason for reschedule <Text style={s.required}>*</Text></Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Patient requested due to travel, equipment delay…"
              placeholderTextColor="#B0BEC5"
              style={[s.input, s.textarea]}
              multiline
              numberOfLines={3}
              data-testid="reschedule-reason-input"
              testID="reschedule-reason-input"
            />
            <Text style={s.helper}>Visible on the case audit trail and shared with assigned stakeholders.</Text>
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={submitting} testID="reschedule-cancel">
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
              testID="reschedule-submit"
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={s.submitTxt}>Confirm reschedule</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,25,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#1A2332' },
  subtitle: { fontSize: 12, color: '#78909C', marginTop: 2 },
  currentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECEFF1', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, marginTop: 6, marginBottom: 4,
  },
  currentTxt: { fontSize: 12, color: '#455A64' },
  label: { fontSize: 12, fontWeight: '700', color: '#37474F', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: '#C62828' },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FAFCFF',
  },
  dateRowTxt: { flex: 1, fontSize: 14, color: '#1A2332', fontWeight: '600' },
  calendarWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E7EE',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F7FAFD',
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 10, color: '#546E7A', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A2332',
    backgroundColor: '#FAFCFF',
  },
  inputError: { borderColor: '#EF9A9A', backgroundColor: '#FFF5F5' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  helper: { fontSize: 11, color: '#90A4AE', marginTop: 6 },
  slotRow: { flexDirection: 'row', gap: 10 },
  slot: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, backgroundColor: '#FAFCFF',
  },
  slotActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  slotTxt: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  slotTxtActive: { color: '#FFF' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorTxt: { fontSize: 12, color: '#C62828', fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#CFD8DC' },
  cancelTxt: { fontSize: 14, fontWeight: '700', color: '#455A64' },
  submitBtn: {
    flex: 1.4, paddingVertical: 12, alignItems: 'center', borderRadius: 10,
    backgroundColor: '#1565C0', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  submitBtnDisabled: { backgroundColor: '#B0BEC5' },
  submitTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
