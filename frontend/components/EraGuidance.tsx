import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { EraSummary, eraGuidance, RISK_COLORS } from '../utils/aestheticRisk';

export default function EraGuidance({ summary, testID = 'era-guidance' }: { summary: EraSummary; testID?: string }) {
  const g = eraGuidance(summary);
  if (!g || !summary.overall) return null;
  const c = RISK_COLORS[summary.overall];
  return (
    <View style={[styles.box, { borderColor: c.border }]} testID={testID} data-testid={testID}>
      <View style={styles.head}>
        <Ionicons name={summary.overall === 'High' ? 'medkit' : 'bulb'} size={16} color={c.fg} />
        <Text style={[styles.title, { color: c.fg }]}>{g.title}</Text>
      </View>
      {g.tips.map((t, i) => (
        <View key={i} style={styles.tipRow} testID={`${testID}-tip-${i}`}>
          <Text style={[styles.bullet, { color: c.fg }]}>•</Text>
          <Text style={styles.tip}>{t}</Text>
        </View>
      ))}
      <Text style={styles.foot}>Guidance only — final plan at the supervisor's discretion.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', flex: 1 },
  tipRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  bullet: { fontSize: 13, lineHeight: 18 },
  tip: { flex: 1, fontSize: 12.5, color: '#37474F', lineHeight: 18 },
  foot: { fontSize: 10.5, color: '#90A4AE', marginTop: 4, fontStyle: 'italic' },
});
