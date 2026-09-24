import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../utils/api';

/**
 * iter-Jun-2026: Profile → Training Records → "Cases assisted" summary card.
 * Shows the count + completed/in-progress split and opens the full logbook.
 */
export default function AssistantLogbookCard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const r = await api.get('/me/assistant-logbook');
          if (alive) setData(r.data);
        } catch {
          if (alive) setData(null);
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }, [])
  );

  const total = data?.total ?? 0;
  const completed = data?.by_status?.completed ?? 0;
  const inProgress = data?.by_status?.in_progress ?? 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/assistant-logbook' as any)}
      testID="assistant-logbook-card"
      data-testid="assistant-logbook-card"
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="people" size={22} color="#4527A0" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Cases assisted</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#5E35B1" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        ) : (
          <Text style={styles.sub} data-testid="assistant-logbook-summary">
            {total === 0
              ? 'No assisted cases yet — you will see them here once added as an assistant'
              : `${completed} completed · ${inProgress} in progress`}
          </Text>
        )}
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countTxt} data-testid="assistant-logbook-count">{loading ? '–' : total}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#999" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, minHeight: 56,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDE7F6',
  },
  title: { fontSize: 15, fontWeight: '600', color: '#222' },
  sub: { fontSize: 12, color: '#777', marginTop: 2 },
  countPill: {
    minWidth: 36, height: 28, borderRadius: 14, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#5E35B1',
  },
  countTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});
