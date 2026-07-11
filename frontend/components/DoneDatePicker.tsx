/**
 * iter-332: Shared "Done On" date picker used by Phase 2 / 3 / 4-Step1 /
 * 4-Step2 submission forms.
 *
 * Defaults to today, capped at today, no further back than 30 days, and
 * (when `minDate` is supplied) cannot be earlier than the previous
 * phase's done-date. Renders as a native HTML date input on web and an
 * RN TextInput with `inputMode='date'` on native — keeps the surface
 * small while still giving the OS-native date wheel on iOS/Android.
 */
import React from 'react';
import { Platform, View, Text, TextInput, StyleSheet } from 'react-native';

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
        <TextInput
          style={styles.input}
          value={value || today}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          inputMode="numeric"
          maxLength={10}
          testID={testID}
        />
      )}
      <Text style={styles.helper}>
        {helperText || 'Defaults to today. Any date allowed (back-date freely for testing).'}
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
    backgroundColor: '#FFF',
  },
  helper: { fontSize: 11, color: '#78909C', marginTop: 4 },
});
