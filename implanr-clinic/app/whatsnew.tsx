/**
 * "What's new" changelog screen. Shown automatically after login when the
 * backend returns unseen entries (`GET /api/whatsnew`). Also re-accessible
 * anytime from Profile → "What's new" (uses ?mode=history to show the full
 * role-matched changelog instead of just the unseen diff).
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CenteredHeader from '../components/CenteredHeader';
import api from '../utils/api';

type Entry = { version: string; date?: string; title: string; items: string[] };

export default function WhatsNewScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isHistory = mode === 'history';
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const path = isHistory ? '/whatsnew/history' : '/whatsnew';
        const resp = await api.get(path);
        if (alive) setEntries(resp.data?.entries || []);
      } catch {
        if (alive) setEntries([]);
      }
    })();
    return () => { alive = false; };
  }, [isHistory]);

  const gotIt = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.post('/whatsnew/ack'); } catch {}
    router.replace('/(tabs)/dashboard');
  };

  if (entries === null) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color="#1565C0" />
      </SafeAreaView>
    );
  }

  // No items to show in first-login mode → skip straight to dashboard.
  if (!isHistory && entries.length === 0) {
    // Use setTimeout to avoid routing-during-render warning.
    setTimeout(() => router.replace('/(tabs)/dashboard'), 0);
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} testID="whatsnew-screen">
      {isHistory ? (
        <CenteredHeader title="What's new" subtitle="Release history" fallback="/(tabs)/profile" />
      ) : (
        <View style={styles.headerNoBack}>
          <Text style={styles.headerTitle}>What's new</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={28} color="#FF8F00" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hero}>
              {isHistory ? 'Release history' : `We shipped ${entries.length === 1 ? 'an update' : 'a few updates'} for you`}
            </Text>
            <Text style={styles.heroSub}>
              {isHistory ? 'Everything we\'ve released that\'s relevant to your role.' : 'Here\'s what\'s changed since your last visit.'}
            </Text>
          </View>
        </View>

        {entries.map((e, i) => (
          <View key={`${e.version}-${i}`} style={styles.entryCard} testID={`whatsnew-entry-${i}`}>
            <View style={styles.entryHeaderRow}>
              <Text style={styles.entryTitle}>{e.title}</Text>
              <View style={styles.versionChip}>
                <Text style={styles.versionChipText}>v{e.version}</Text>
              </View>
            </View>
            {!!e.date && <Text style={styles.entryDate}>{e.date}</Text>}
            {e.items.map((item, j) => (
              <View key={j} style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={16} color="#2E7D32" style={{ marginTop: 2 }} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>You can revisit this list anytime from Profile → What's new.</Text>
      </ScrollView>

      {!isHistory && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.primary} onPress={gotIt} disabled={busy} testID="whatsnew-gotit-btn">
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Got it — take me to my dashboard</Text>}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerNoBack: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#ECEFF1', backgroundColor: '#FFF',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#01579B' },
  scroll: { padding: 20, paddingBottom: 40 },
  heroRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 18 },
  heroIcon: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF3E0',
    alignItems: 'center', justifyContent: 'center',
  },
  hero: { fontSize: 18, fontWeight: '800', color: '#0D47A1' },
  heroSub: { marginTop: 2, fontSize: 12, color: '#78909C' },
  entryCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#ECEFF1',
  },
  entryHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  entryTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1A237E' },
  versionChip: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  versionChipText: { color: '#1565C0', fontWeight: '800', fontSize: 11 },
  entryDate: { marginTop: 2, marginBottom: 10, fontSize: 11, color: '#90A4AE' },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 13, color: '#37474F', lineHeight: 19 },
  footer: { marginTop: 14, fontSize: 11, color: '#90A4AE', textAlign: 'center', fontStyle: 'italic' },
  bottomBar: { padding: 14, borderTopWidth: 1, borderTopColor: '#ECEFF1', backgroundColor: '#FFF' },
  primary: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
