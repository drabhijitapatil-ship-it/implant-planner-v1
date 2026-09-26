import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RISK_COLORS, RiskLevel } from '../utils/aestheticRisk';

export default function RiskPill({ level, large, testID }: { level: RiskLevel | null; large?: boolean; testID?: string }) {
  if (!level) return null;
  const c = RISK_COLORS[level];
  return (
    <View
      style={[styles.pill, large && styles.pillLarge, { backgroundColor: c.bg, borderColor: c.border }]}
      testID={testID}
      // @ts-ignore RN-Web mapping
      data-testid={testID}
    >
      <View style={[styles.dot, large && styles.dotLarge, { backgroundColor: c.fg }]} />
      <Text style={[styles.text, large && styles.textLarge, { color: c.fg }]}>{level} risk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  pillLarge: { paddingHorizontal: 14, paddingVertical: 7, gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotLarge: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  textLarge: { fontSize: 14 },
});
