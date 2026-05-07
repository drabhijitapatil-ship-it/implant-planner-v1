/**
 * Chat-style bubble that types out a static message word-by-word.
 * Pre-written sample (no live API call) — fast, deterministic, works offline.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const QUESTION = "Implanr, summarise Phase 2 in 3 sentences.";
const ANSWER =
  'Implant placed at site #36, Bredent SKY 4.0 × 11.5, torque 35 N·cm. Primary stability confirmed; cover screw seated; sutures placed (3-0 vicryl). Patient discharged with post-op instructions and 1-week review.';

export default function TypingBubble() {
  const [shown, setShown] = useState(0);
  const words = ANSWER.split(' ');

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= words.length) clearInterval(id);
    }, 55);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.wrap} testID="typing-bubble">
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{QUESTION}</Text>
      </View>
      <View style={[styles.bubble, styles.aiBubble]}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={12} color="#0D47A1" />
          <Text style={styles.aiLabel}>Implanr AI</Text>
        </View>
        <Text style={styles.aiText}>
          {words.slice(0, shown).join(' ')}
          {shown < words.length && <Text style={styles.cursor}>▋</Text>}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 8 },
  bubble: { borderRadius: 14, padding: 11, maxWidth: '92%' },
  userBubble: { backgroundColor: '#1565C0', alignSelf: 'flex-end' },
  userText: { color: '#FFF', fontSize: 12, lineHeight: 17 },
  aiBubble: {
    backgroundColor: '#F1F5FA', alignSelf: 'flex-start',
    borderLeftWidth: 3, borderLeftColor: '#0D47A1',
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiLabel: { fontSize: 10, color: '#0D47A1', fontWeight: '800' },
  aiText: { color: '#263238', fontSize: 12, lineHeight: 18 },
  cursor: { color: '#0D47A1', fontWeight: '900' },
});
