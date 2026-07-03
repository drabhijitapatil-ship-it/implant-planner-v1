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

const EVIDENCE_COLORS: Record<string, { main: string; bg: string; border: string; text: string }> = {
  High: { main: '#059669', bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' },
  Moderate: { main: '#D97706', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  Low: { main: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', text: '#475569' },
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
      Alert.alert('Error', 'Could not load saved tips');
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
    } catch {
      Alert.alert('Error', 'Could not unsave tip');
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: 'Saved Tips', headerBackTitle: 'Back' }} />
      
      {/* Custom Header Row */}
      <View style={s.headerContainer}>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Saved Tips</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#007AFF" /></View>
      ) : (
        <>
          <View style={s.catRowContainer}>
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
          </View>

          {filtered.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIconContainer}>
                <Ionicons name="bookmark" size={32} color="#007AFF" />
              </View>
              <Text style={s.emptyTitle}>No saved tips yet</Text>
              <Text style={s.emptyTxt}>Tap the bookmark icon on a daily Smart Tip to keep it here for later reading.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
              {filtered.map(t => {
                const ev = EVIDENCE_COLORS[t.evidence_level] || EVIDENCE_COLORS.Low;
                return (
                  <View key={t.tip_id} style={s.card}>
                    <View style={s.cardHeader}>
                      <Text style={s.cardTitle}>{t.title}</Text>
                      <TouchableOpacity 
                        onPress={() => unsave(t.tip_id)} 
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} 
                        testID={`unsave-${t.tip_id}`}
                        style={s.bookmarkBtn}
                      >
                        <Ionicons name="bookmark" size={18} color="#007AFF" />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={s.chipsRow}>
                      <View style={s.tagChip}>
                        <Text style={s.tagChipTxt}>{t.category}</Text>
                      </View>
                      <View style={[s.evChip, { backgroundColor: ev.bg, borderColor: ev.border }]}>
                        <View style={[s.evDot, { backgroundColor: ev.main }]} />
                        <Text style={[s.evTxt, { color: ev.text }]}>{t.evidence_level}</Text>
                      </View>
                    </View>
                    
                    <Text style={s.cardBody}>{t.tip_text}</Text>
                    
                    {(t.source_organization || t.source_reference) && (
                      <View style={s.sourceRow}>
                        <Ionicons name="book" size={14} color="#64748B" />
                        <Text style={s.sourceTxt} numberOfLines={1}>
                          {t.source_organization}{t.source_reference ? ` · ${t.source_reference}` : ''}{t.publication_year ? ` · ${t.publication_year}` : ''}
                        </Text>
                      </View>
                    )}
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
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  catRowContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  catRow: { 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    gap: 8, 
    alignItems: 'center' 
  },
  catChip: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    backgroundColor: '#FFF' 
  },
  catChipActive: { 
    backgroundColor: '#0B1930', 
    borderColor: '#0B1930' 
  },
  catChipTxt: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#475569' 
  },
  catChipTxtActive: { 
    color: '#FFF' 
  },
  empty: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 32, 
    gap: 12 
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#0F172A' 
  },
  emptyTxt: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    marginHorizontal: 16, 
    marginTop: 12, 
    padding: 16, 
    backgroundColor: '#FFF', 
    borderRadius: 16,
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    justifyContent: 'space-between', 
    marginBottom: 10,
    gap: 8,
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#0F172A', 
    flex: 1, 
  },
  bookmarkBtn: {
    padding: 4,
  },
  chipsRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginBottom: 12 
  },
  tagChip: { 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    backgroundColor: '#F1F5F9', 
    borderRadius: 8 
  },
  tagChipTxt: { 
    fontSize: 11, 
    fontWeight: '600', 
    color: '#475569', 
  },
  evChip: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 8, 
    borderWidth: 1 
  },
  evDot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3 
  },
  evTxt: { 
    fontSize: 11, 
    fontWeight: '600' 
  },
  cardBody: { 
    fontSize: 14, 
    color: '#334155', 
    lineHeight: 21,
    marginBottom: 12,
  },
  sourceRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: '#F8FAFC', 
    borderRadius: 8, 
    padding: 8,
  },
  sourceTxt: { 
    fontSize: 12, 
    color: '#64748B', 
    flex: 1 
  },
});
