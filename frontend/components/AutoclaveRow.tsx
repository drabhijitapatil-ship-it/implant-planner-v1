import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import api from '../utils/api';

export type InstrumentsAutoclaved = {
  marked: boolean;
  marked_by?: string;
  marked_by_name?: string;
  marked_at?: string;
} | null;

/** Returns true when we are within 1 hour of (or past) the scheduled surgery time. */
export function isAutoclaveLocked(dateStr: string, timeStr: string): boolean {
  if (!dateStr || !timeStr) return false;
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

type Props = {
  caseId: string;
  procedureDate: string;
  procedureTime: string;
  marked: boolean;
  markedAt?: string;
  onToggled: (next: InstrumentsAutoclaved) => void;
  /** Compact mode = smaller chip suited to inline list/calendar cards. */
  compact?: boolean;
  style?: ViewStyle | ViewStyle[];
};

/**
 * Single-checkbox row for marking instruments autoclaved. Used on:
 *  - Scheduled Cases section cards (full-width row)
 *  - Nurse Home calendar inline date cards (compact)
 *  - Nurse Cases tab list cards (compact)
 */
export default function AutoclaveRow({
  caseId,
  procedureDate,
  procedureTime,
  marked,
  markedAt,
  onToggled,
  compact = false,
  style,
}: Props) {
  const [busy, setBusy] = useState(false);
  const locked = isAutoclaveLocked(procedureDate, procedureTime);
  const showRow = marked || !locked; // hide when locked+unmarked (matches spec)
  if (!showRow) return null;

  const canInteract = !locked;

  const toggle = async (e?: any) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (busy || !canInteract) return;
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

  return (
    <TouchableOpacity
      onPress={toggle}
      // react-native-web: parent TouchableOpacity still fires even when child
      // onPress runs. Claim the responder eagerly + stop the DOM bubble via a
      // no-op wrapper on web. The capture props are ignored on native but make
      // nested taps reliably non-propagating on web.
      onStartShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      activeOpacity={canInteract ? 0.7 : 1}
      disabled={busy || !canInteract}
      style={[
        compact ? styles.rowCompact : styles.row,
        marked ? styles.rowOn : styles.rowOff,
        !canInteract && { opacity: 0.85 },
        style,
      ]}
      testID={`autoclave-toggle-${caseId}`}
    >
      {compact ? (
        // Render as a single pill, matching the "Consent form uploaded" pill visually.
        <>
          {busy ? (
            <ActivityIndicator size="small" color={marked ? '#FFF' : '#2E7D32'} />
          ) : (
            <Ionicons
              name={marked ? 'checkmark-circle' : 'ellipse-outline'}
              size={12}
              color={marked ? '#FFF' : '#546E7A'}
            />
          )}
          <Text
            style={[styles.labelCompact, marked ? styles.labelCompactOn : styles.labelCompactOff]}
            numberOfLines={1}
          >
            {marked ? 'Instruments autoclaved' : 'Mark instruments autoclaved'}
          </Text>
        </>
      ) : (
        <>
          <View style={[styles.checkbox, marked && styles.checkboxOn]}>
            {busy ? (
              <ActivityIndicator size="small" color="#2E7D32" />
            ) : marked ? (
              <Ionicons name="checkmark" size={14} color="#2E7D32" />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, marked && { color: '#1B5E20' }]} numberOfLines={1}>
              {marked ? 'Instruments autoclaved ✓' : 'Mark instruments Autoclaved'}
            </Text>
            {marked && markedAt ? (
              <Text style={styles.hint} numberOfLines={1}>
                {locked ? 'Locked · ' : ''}Marked {format(parseISO(markedAt), 'MMM dd · hh:mm a')}
              </Text>
            ) : !canInteract ? (
              <Text style={styles.hint} numberOfLines={1}>Locked — within 1 hr of surgery</Text>
            ) : null}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  rowCompact: {
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
  rowOff: { backgroundColor: '#ECEFF1', borderWidth: 1, borderColor: '#CFD8DC' },
  rowOn: { backgroundColor: '#2E7D32', borderWidth: 1, borderColor: '#2E7D32' },
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
  checkboxCompact: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#2E7D32',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#455A64',
  },
  labelCompact: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelCompactOn: { color: '#FFF' },
  labelCompactOff: { color: '#546E7A' },
  hint: {
    fontSize: 10,
    color: '#78909C',
    marginTop: 2,
  },
});
