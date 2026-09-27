import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RISK_COLORS, RiskLevel } from '../utils/aestheticRisk';

/**
 * Labelled, colour-coded risk pill, e.g. "Aesthetic Risk Assessment · High Risk".
 * `level` drives the colour; `riskText` overrides the trailing text
 * (medical uses "Moderate Risk" while its colour maps to Medium).
 */
export default function RiskLabelPill({
  label, level, riskText, compact, testID,
}: { label: string; level: RiskLevel; riskText?: string; compact?: boolean; testID?: string }) {
  const c = RISK_COLORS[level];
  const text = `${label} · ${riskText ?? `${level} Risk`}`;
  return (
    <View
      style={[styles.pill, compact && styles.pillCompact, { backgroundColor: c.bg, borderColor: c.border }]}
      testID={testID}
      // @ts-ignore RN-Web mapping
      data-testid={testID}
    >
      <View style={[styles.dot, compact && styles.dotCompact, { backgroundColor: c.fg }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color: c.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  pillCompact: { paddingHorizontal: 9, paddingVertical: 3, gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotCompact: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, flexShrink: 1 },
  textCompact: { fontSize: 11 },
});
