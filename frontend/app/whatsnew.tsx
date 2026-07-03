/**
 * "What's new" changelog screen. Shown automatically after login when the
 * backend returns unseen entries (`GET /api/whatsnew`). Also re-accessible
 * anytime from Profile → "What's new" (uses ?mode=history to show the full
 * role-matched changelog instead of just the unseen diff).
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
        <ActivityIndicator size="large" color="#007AFF" />
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
    <SafeAreaView style={styles.safe} testID="whatsnew-screen" edges={['top', 'bottom']}>
      {/* Header Block */}
      <View style={styles.headerContainer}>
        {isHistory ? (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.headerTitle}>What's new</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero Row Section */}
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={24} color="#FF9800" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hero}>
              {isHistory ? 'Release History' : `We shipped ${entries.length === 1 ? 'an update' : 'new updates'} for you`}
            </Text>
            <Text style={styles.heroSub}>
              {isHistory ? "Everything we've released that's relevant to your role." : "Here's what's changed since your last visit."}
            </Text>
          </View>
        </View>

        {/* Entries List */}
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
                <Ionicons name="checkmark-circle" size={16} color="#059669" style={{ marginTop: 2 }} />
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
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  scroll: { padding: 16, paddingBottom: 32 },
  heroRow: { 
    flexDirection: 'row', 
    gap: 12, 
    alignItems: 'center', 
    marginBottom: 20,
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
  },
  heroIcon: {
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#DBEAFE',
    alignItems: 'center', 
    justifyContent: 'center',
  },
  hero: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#1E3A8A' 
  },
  heroSub: { 
    marginTop: 2, 
    fontSize: 13, 
    color: '#1D4ED8',
    lineHeight: 18,
  },
  entryCard: {
    backgroundColor: '#FFF', 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 12,
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  entryHeaderRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    gap: 8 
  },
  entryTitle: { 
    flex: 1, 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#0F172A' 
  },
  versionChip: { 
    backgroundColor: '#E0F2FE', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 8 
  },
  versionChipText: { 
    color: '#0369A1', 
    fontWeight: '700', 
    fontSize: 12 
  },
  entryDate: { 
    marginTop: 4, 
    marginBottom: 12, 
    fontSize: 12, 
    color: '#64748B' 
  },
  bulletRow: { 
    flexDirection: 'row', 
    gap: 8, 
    marginTop: 10,
    alignItems: 'flex-start',
  },
  bulletText: { 
    flex: 1, 
    fontSize: 14, 
    color: '#334155', 
    lineHeight: 20 
  },
  footer: { 
    marginTop: 24, 
    fontSize: 12, 
    color: '#94A3B8', 
    textAlign: 'center', 
    fontStyle: 'italic',
    paddingHorizontal: 24,
  },
  bottomBar: { 
    padding: 16, 
    borderTopWidth: 1, 
    borderTopColor: '#E2E8F0', 
    backgroundColor: '#FFF' 
  },
  primary: { 
    backgroundColor: '#0B1930', 
    borderRadius: 12, 
    paddingVertical: 14, 
    alignItems: 'center' 
  },
  primaryText: { 
    color: '#FFF', 
    fontSize: 15, 
    fontWeight: '600' 
  },
});
