import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import api from '../utils/api';

// iter-280: Saved Smart Clinical Tips library.
type Tip = {
  tip_id: string;
  title: string;
  category: string;
  evidence_level: string;
  source_organization?: string;
  source_reference?: string;
  publication_year?: number;
  tip_text: string;
  saved_at?: string;
};

const EVIDENCE_COLORS: Record<string, string> = {
  High: '#2E7D32', Moderate: '#F9A825', Low: '#90A4AE',
};

export default function SavedTipsScreen() {
  const router = useRouter();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('All');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tips/saved');
      setTips(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Could not load saved tips');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tips) if (t.category) set.add(t.category);
    return ['All', ...Array.from(set).sort()];
  }, [tips]);

  const filtered = activeCat === 'All' ? tips : tips.filter(t => t.category === activeCat);

  const unsave = async (tipId: string) => {
    try {
      await api.post(`/tips/${tipId}/save`); // toggle removes
      setTips(prev => prev.filter(t => t.tip_id !== tipId));
    } catch {}
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: 'Saved Tips', headerBackTitle: 'Back' }} />
      {loading ? (
        <View style={s.center}><ActivityIndicator color="#1565C0" /></View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
            {categories.map(c => {
              const active = c === activeCat;
              return (
                <TouchableOpacity
                  key={c}
                  style={[s.catChip, active && s.catChipActive]}
                  onPress={() => setActiveCat(c)}
                  testID={`saved-tips-filter-${c}`}
                >
                  <Text style={[s.catChipTxt, active && s.catChipTxtActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="bookmark-outline" size={48} color="#CFD8DC" />
              <Text style={s.emptyTitle}>No saved tips yet</Text>
              <Text style={s.emptyTxt}>Tap the bookmark icon on a daily Smart Tip to keep it here for later reading.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {filtered.map(t => {
                const ev = EVIDENCE_COLORS[t.evidence_level] || '#90A4AE';
                return (
                  <View key={t.tip_id} style={s.card}>
                    <View style={s.cardHeader}>
                      <Text style={s.cardTitle}>{t.title}</Text>
                      <TouchableOpacity onPress={() => unsave(t.tip_id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID={`unsave-${t.tip_id}`}>
                        <Ionicons name="bookmark" size={20} color="#1565C0" />
                      </TouchableOpacity>
                    </View>
                    <View style={s.chipsRow}>
                      <View style={s.tagChip}><Text style={s.tagChipTxt}>{t.category}</Text></View>
                      <View style={[s.evChip, { backgroundColor: `${ev}1A`, borderColor: `${ev}55` }]}>
                        <View style={[s.evDot, { backgroundColor: ev }]} />
                        <Text style={[s.evTxt, { color: ev }]}>{t.evidence_level}</Text>
                      </View>
                    </View>
                    <Text style={s.cardBody}>{t.tip_text}</Text>
                    <View style={s.sourceRow}>
                      <Ionicons name="book-outline" size={12} color="#78909C" />
                      <Text style={s.sourceTxt} numberOfLines={1}>
                        {t.source_organization}{t.source_reference ? ` · ${t.source_reference}` : ''}{t.publication_year ? ` · ${t.publication_year}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  catRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, alignItems: 'center' },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  catChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  catChipTxt: { fontSize: 12, fontWeight: '700', color: '#37474F' },
  catChipTxtActive: { color: '#FFF' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#37474F', marginTop: 10 },
  emptyTxt: { fontSize: 13, color: '#90A4AE', textAlign: 'center' },
  card: {
    marginHorizontal: 14, marginVertical: 6, padding: 14, backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E7EE',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#1A2332', flex: 1, marginRight: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tagChip: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#E3F2FD', borderRadius: 10 },
  tagChipTxt: { fontSize: 10, fontWeight: '700', color: '#1565C0', letterSpacing: 0.3 },
  evChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  evDot: { width: 6, height: 6, borderRadius: 3 },
  evTxt: { fontSize: 10, fontWeight: '700' },
  cardBody: { fontSize: 13, color: '#37474F', lineHeight: 19 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  sourceTxt: { fontSize: 11, color: '#78909C', flex: 1 },
});
