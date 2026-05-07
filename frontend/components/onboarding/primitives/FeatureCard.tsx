/**
 * Reusable card with an icon, title, and bullet list. Used inside slide 4
 * (Implant Database + Selection) and inside the help-workflow Smart Tools grid.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type FeatureCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  bullets: string[];
  tint?: string;
  testID?: string;
};

export default function FeatureCard({ icon, title, bullets, tint = '#1565C0', testID }: FeatureCardProps) {
  return (
    <View style={[styles.card, { borderTopColor: tint }]} testID={testID}>
      <View style={[styles.iconBubble, { backgroundColor: `${tint}1A` }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {bullets.map((b, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: tint }]} />
          <Text style={styles.bulletText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderTopWidth: 3,
    boxShadow: '0px 8px 16px rgba(13, 71, 161, 0.06)',
  } as any,
  iconBubble: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  title: { fontSize: 14, fontWeight: '800', color: '#0D47A1', marginBottom: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 12, color: '#37474F', lineHeight: 17 },
});
