/**
 * iter-344 — Shared FDI Dental Chart component.
 *
 * Extracted from /app/(tabs)/implant-selection.tsx so multiple screens can
 * reuse a consistent tooth-picker. Adds an optional `restrictToQuadrantOf`
 * prop that limits the selectable teeth to the same quadrant as the given
 * anchor tooth (used by the Implant Survival Review when a site-change is
 * recorded — the alternate tooth must sit in the same quadrant per clinical
 * guideline 1c).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const UPPER_RIGHT = ['17', '16', '15', '14', '13', '12', '11'];
const UPPER_LEFT  = ['21', '22', '23', '24', '25', '26', '27'];
const LOWER_RIGHT = ['47', '46', '45', '44', '43', '42', '41'];
const LOWER_LEFT  = ['31', '32', '33', '34', '35', '36', '37'];

function quadrantOf(tooth: string): 'UR' | 'UL' | 'LR' | 'LL' | null {
  if (UPPER_RIGHT.includes(tooth)) return 'UR';
  if (UPPER_LEFT.includes(tooth)) return 'UL';
  if (LOWER_RIGHT.includes(tooth)) return 'LR';
  if (LOWER_LEFT.includes(tooth)) return 'LL';
  return null;
}

const TOOTH_TYPE: Record<string, string> = {};
['16', '17', '26', '27', '36', '37', '46', '47'].forEach((t) => (TOOTH_TYPE[t] = 'molar'));
['14', '15', '24', '25', '34', '35', '44', '45'].forEach((t) => (TOOTH_TYPE[t] = 'premolar'));
['13', '23', '33', '43'].forEach((t) => (TOOTH_TYPE[t] = 'canine'));
['11', '12', '21', '22', '31', '32', '41', '42'].forEach((t) => (TOOTH_TYPE[t] = 'incisor'));

function getToothWidth(tooth: string) {
  const t = TOOTH_TYPE[tooth];
  return t === 'molar' ? 26 : t === 'premolar' ? 23 : t === 'canine' ? 22 : 20;
}

function Tooth({
  tooth, isSelected, isDisabled, onPress,
}: { tooth: string; isSelected: boolean; isDisabled: boolean; onPress: () => void; }) {
  const w = getToothWidth(tooth);
  const isMolar = TOOTH_TYPE[tooth] === 'molar';
  const h = isMolar ? 34 : TOOTH_TYPE[tooth] === 'premolar' ? 32 : TOOTH_TYPE[tooth] === 'canine' ? 30 : 28;
  return (
    <TouchableOpacity
      onPress={isDisabled ? undefined : onPress}
      activeOpacity={isDisabled ? 1 : 0.7}
      data-testid={`fdi-tooth-${tooth}`}
      testID={`fdi-tooth-${tooth}`}
      style={[styles.tooth, {
        width: w,
        height: h,
        borderRadius: isMolar ? 5 : 9,
        backgroundColor: isSelected ? '#1E88E5' : (isDisabled ? '#F5F5F7' : '#E8EDF2'),
        borderColor: isSelected ? '#1565C0' : (isDisabled ? '#E0E0E0' : '#C5CDD5'),
        opacity: isDisabled ? 0.45 : 1,
      }]}
    >
      <Text style={[styles.num, { color: isSelected ? '#FFF' : (isDisabled ? '#B0BEC5' : '#37474F') }]}>
        {tooth}
      </Text>
    </TouchableOpacity>
  );
}

export default function FDIChart({
  selectedTooth,
  onSelect,
  restrictToQuadrantOf,
  excludeTooth,
}: {
  selectedTooth: string | null;
  onSelect: (tooth: string) => void;
  /** iter-344: When provided, only teeth in the same quadrant as this
   * tooth are selectable. Others render disabled. */
  restrictToQuadrantOf?: string | null;
  /** iter-344: Optional tooth to render disabled (e.g. the already-failed
   * tooth so the user picks a different one). */
  excludeTooth?: string | null;
}) {
  const allowedQuadrant = restrictToQuadrantOf ? quadrantOf(restrictToQuadrantOf) : null;
  const isEnabled = (tooth: string): boolean => {
    if (excludeTooth && tooth === excludeTooth) return false;
    if (!allowedQuadrant) return true;
    const q = quadrantOf(tooth);
    return q === allowedQuadrant;
  };

  const renderRow = (rightTeeth: string[], leftTeeth: string[]) => (
    <View style={styles.jawRow}>
      <View style={styles.quadrant}>
        <View style={styles.teethRow}>
          {rightTeeth.map((t) => (
            <Tooth key={t} tooth={t} isSelected={selectedTooth === t} isDisabled={!isEnabled(t)}
              onPress={() => onSelect(t)} />
          ))}
        </View>
      </View>
      <View style={styles.midline} />
      <View style={styles.quadrant}>
        <View style={styles.teethRow}>
          {leftTeeth.map((t) => (
            <Tooth key={t} tooth={t} isSelected={selectedTooth === t} isDisabled={!isEnabled(t)}
              onPress={() => onSelect(t)} />
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <View>
      <Text style={styles.jawLabel}>Upper Jaw (Maxillary)</Text>
      {renderRow(UPPER_RIGHT, UPPER_LEFT)}
      <View style={styles.jawDivider} />
      <Text style={styles.jawLabel}>Lower Jaw (Mandibular)</Text>
      {renderRow(LOWER_RIGHT, LOWER_LEFT)}
      {restrictToQuadrantOf ? (
        <Text style={styles.restrictHint}>
          Only teeth in the same quadrant as {restrictToQuadrantOf} are selectable.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tooth: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginHorizontal: 1 },
  num: { fontWeight: '700', fontSize: 10 },
  jawRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  quadrant: { flex: 1, alignItems: 'center' },
  teethRow: { flexDirection: 'row', alignItems: 'center' },
  midline: { width: 2, height: 24, backgroundColor: '#B0BEC5', marginHorizontal: 4 },
  jawLabel: { fontSize: 11, fontWeight: '700', color: '#546E7A', textAlign: 'center', marginTop: 6 },
  jawDivider: { height: 1, backgroundColor: '#E0E6EF', marginVertical: 8 },
  restrictHint: { fontSize: 11, color: '#78909C', textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
});
