/**
 * iter-350: PlacementDatePicker — a Phase-1-style calendar picker used for
 * the Survival Review "Placement date" field. Matches the visual + UX
 * conventions of the Reschedule modal (react-native-calendars). Renders as:
 *
 *   [ Chevron button showing selected date | 📅 ]  ← tap to toggle
 *
 * On tap the full react-native-calendars grid slides open in a Modal, giving
 * users the same iOS/Android calendar experience they get when picking a
 * procedure date. Web falls back to the same react-native-calendars grid so
 * the picker looks identical across platforms.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  value: string;                         // ISO YYYY-MM-DD or empty
  onChange: (isoDate: string) => void;
  minDate?: string;                      // ISO — earliest date allowed
  maxDate?: string;                      // ISO — latest date allowed
  placeholder?: string;
  testID?: string;
  invalid?: boolean;                     // Red border when true
};

const formatHuman = (iso: string): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${months[mi] || m} ${y}`;
};

export default function PlacementDatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select placement date',
  testID = 'placement-date-picker',
  invalid = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const displayLabel = value ? formatHuman(value) : placeholder;

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.trigger, invalid && styles.triggerInvalid, !!value && styles.triggerFilled]}
        activeOpacity={0.7}
        testID={testID}
        // @ts-ignore — RN-Web forwards data-* attrs.
        data-testid={testID}
      >
        <Ionicons name="calendar-outline" size={18} color={value ? '#0D47A1' : '#78909C'} />
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>{displayLabel}</Text>
        <Ionicons name="chevron-down" size={16} color="#78909C" />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select placement date</Text>
              <TouchableOpacity onPress={() => setOpen(false)} testID={`${testID}-close`}>
                <Ionicons name="close" size={22} color="#37474F" />
              </TouchableOpacity>
            </View>
            <Calendar
              current={value || undefined}
              minDate={minDate}
              maxDate={maxDate}
              markedDates={value ? { [value]: { selected: true, selectedColor: '#0D47A1' } } : {}}
              onDayPress={(day: any) => {
                onChange(day.dateString);
                setOpen(false);
              }}
              theme={{
                todayTextColor: '#1565C0',
                arrowColor: '#0D47A1',
                monthTextColor: '#0D47A1',
                textMonthFontWeight: '800',
                textDayFontWeight: '600',
                textDayHeaderFontWeight: '700',
                selectedDayBackgroundColor: '#0D47A1',
                selectedDayTextColor: '#FFF',
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF',
  },
  triggerFilled: { borderColor: '#90CAF9', backgroundColor: '#F5FAFF' },
  triggerInvalid: { borderColor: '#EF9A9A', backgroundColor: '#FFF5F5' },
  triggerText: { flex: 1, fontSize: 14, color: '#1e2a44', fontWeight: '600' },
  triggerPlaceholder: { color: '#78909C', fontWeight: '400' },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 380, backgroundColor: '#FFF',
    borderRadius: 16, padding: 12, shadowColor: '#000',
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 6, paddingVertical: 6, marginBottom: 4,
  },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: '#0D47A1', letterSpacing: 0.3 },
});
