import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { EraRow, RiskLevel, eraGuidance, RISK_COLORS } from '../utils/aestheticRisk';

interface Props {
  rows: EraRow[];
  overall: RiskLevel | null;
  complete: boolean;
  testID?: string;
}

/** Collapsible clinical-guidance box — only renders once the grade is complete and Medium/High. */
export default function EraGuidance({ rows, overall, complete, testID = 'era-guidance' }: Props) {
  const [open, setOpen] = useState(false);
  const g = eraGuidance(rows, overall, complete);
  if (!g || !overall) return null;
  const c = RISK_COLORS[overall];
  return (
    <View style={[styles.box, { borderColor: c.border }]} testID={testID} data-testid={testID}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen(o => !o)} activeOpacity={0.7}
        testID={`${testID}-toggle`} data-testid={`${testID}-toggle`} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name={overall === 'High' ? 'medkit' : 'bulb'} size={16} color={c.fg} />
        <Text style={[styles.title, { color: c.fg }]}>{g.title} ({g.tips.length} tips)</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.fg} />
      </TouchableOpacity>
      {open && (
        <View style={styles.body} testID={`${testID}-body`} data-testid={`${testID}-body`}>
          {g.tips.map((t, i) => (
            <View key={i} style={styles.tipRow} testID={`${testID}-tip-${i}`}>
              <Text style={[styles.bullet, { color: c.fg }]}>•</Text>
              <Text style={styles.tip}>{t}</Text>
            </View>
          ))}
          <Text style={styles.foot}>Guidance only</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 10, borderWidth: 1, borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44 },
  title: { fontSize: 13, fontWeight: '700', flex: 1 },
  body: { paddingHorizontal: 12, paddingBottom: 12 },
  tipRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  bullet: { fontSize: 13, lineHeight: 18 },
  tip: { flex: 1, fontSize: 12.5, color: '#37474F', lineHeight: 18 },
  foot: { fontSize: 10.5, color: '#90A4AE', marginTop: 4, fontStyle: 'italic' },
});
