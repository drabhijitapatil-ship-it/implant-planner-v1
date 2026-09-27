import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../contexts/AuthContext';
import {
  ANALYTICS_GUIDE, GUIDE_INTRO, RESEARCH_QUESTIONS, DATA_DICTIONARY, GuideEntry, buildAnalyticsGuideHtml,
} from '../../constants/analyticsGuide';

function GuideCard({ entry, index, open, onToggle }: { entry: GuideEntry; index: number; open: boolean; onToggle: () => void }) {
  return (
    <View style={s.card} testID={`guide-card-${entry.key}`} data-testid={`guide-card-${entry.key}`}>
      <TouchableOpacity style={s.cardHead} onPress={onToggle} activeOpacity={0.7} testID={`guide-toggle-${entry.key}`} data-testid={`guide-toggle-${entry.key}`}>
        <View style={s.iconWrap}><Ionicons name={entry.icon} size={16} color="#1565C0" /></View>
        <Text style={s.cardTitle}>{index}. {entry.title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#78909C" />
      </TouchableOpacity>
      {open && (
        <View style={s.cardBody} testID={`guide-body-${entry.key}`} data-testid={`guide-body-${entry.key}`}>
          <Text style={s.h3}>What data is collected</Text>
          <Text style={s.p}>{entry.collects}</Text>
          <Text style={s.h3}>How to read it</Text>
          <Text style={s.p}>{entry.read}</Text>
          <Text style={s.h3}>Using it for research</Text>
          <Text style={s.p}>{entry.research}</Text>
          <View style={s.warn}>
            <Text style={[s.h3, { color: '#8D6E00', marginTop: 0 }]}>Interpretation cautions</Text>
            {entry.cautions.map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 3 }}>
                <Text style={{ color: '#8D6E00' }}>•</Text>
                <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function AnalyticsGuideScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge' || user?.role === 'administrator';
  const entries = useMemo(() => ANALYTICS_GUIDE.filter(e => !e.facultyOnly || isFaculty), [isFaculty]);
  const [open, setOpen] = useState<Record<string, boolean>>(() => (params.tab ? { [params.tab]: true } : {}));
  const [showDict, setShowDict] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const cardY = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!params.tab) return;
    const t = setTimeout(() => {
      const y = cardY.current[params.tab as string];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 350);
    return () => clearTimeout(t);
  }, [params.tab]);

  const exportPdf = async () => {
    const html = buildAnalyticsGuideHtml(isFaculty);
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Implanr_Analytics_Guide.pdf', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Saved', 'The guide PDF was generated but sharing is not available on this device.');
      }
    } catch (e: any) {
      Alert.alert('Export failed', e?.message || 'Could not generate the guide PDF.');
    }
  };

  const allOpen = entries.every(e => open[e.key]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerIcon} testID="guide-back" data-testid="guide-back">
          <Ionicons name="chevron-back" size={22} color="#1A2332" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} testID="guide-title" data-testid="guide-title">Analytics Guide</Text>
          <Text style={s.headerSub}>How to read &amp; use every analytics view</Text>
        </View>
        <TouchableOpacity onPress={exportPdf} style={s.exportBtn} testID="guide-export-pdf" data-testid="guide-export-pdf">
          <Ionicons name="download-outline" size={16} color="#FFF" />
          <Text style={s.exportTxt}>PDF</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        <View style={s.intro} testID="guide-intro" data-testid="guide-intro">
          <Ionicons name="information-circle" size={18} color="#1565C0" />
          <Text style={s.introTxt}>{GUIDE_INTRO}</Text>
        </View>

        <Text style={s.sectionTitle}>Research question → where to look</Text>
        <View style={s.table} testID="guide-quick-ref" data-testid="guide-quick-ref">
          {RESEARCH_QUESTIONS.map((q, i) => (
            <View key={i} style={[s.tr, i % 2 === 1 && { backgroundColor: '#F8FAFC' }]}>
              <Text style={[s.td, { flex: 1.4 }]}>{q.question}</Text>
              <Text style={[s.td, s.tdTabs]}>{q.tabs.join(' · ')}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 6 }}>
          <Text style={[s.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>The views</Text>
          <TouchableOpacity onPress={() => setOpen(Object.fromEntries(entries.map(e => [e.key, !allOpen])))} testID="guide-expand-all" data-testid="guide-expand-all">
            <Text style={s.link}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
          </TouchableOpacity>
        </View>
        {entries.map((e, i) => (
          <View key={e.key} onLayout={ev => { cardY.current[e.key] = ev.nativeEvent.layout.y; }}>
            <GuideCard entry={e} index={i + 1} open={!!open[e.key]} onToggle={() => setOpen(o => ({ ...o, [e.key]: !o[e.key] }))} />
          </View>
        ))}

        <TouchableOpacity style={[s.card, s.cardHead, { marginTop: 8 }]} onPress={() => setShowDict(v => !v)} testID="guide-dict-toggle" data-testid="guide-dict-toggle">
          <View style={s.iconWrap}><Ionicons name="book-outline" size={16} color="#1565C0" /></View>
          <Text style={s.cardTitle}>Appendix — Research Export data dictionary</Text>
          <Ionicons name={showDict ? 'chevron-up' : 'chevron-down'} size={18} color="#78909C" />
        </TouchableOpacity>
        {showDict && (
          <View style={s.table} testID="guide-dict" data-testid="guide-dict">
            {DATA_DICTIONARY.map((d, i) => (
              <View key={d.field} style={[s.tr, i % 2 === 1 && { backgroundColor: '#F8FAFC' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.code}>{d.field} <Text style={s.type}>{d.type}</Text></Text>
                  <Text style={[s.td, { paddingTop: 2 }]}>{d.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E1E7EF' },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A2332' },
  headerSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1565C0', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, minHeight: 44 },
  exportTxt: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  intro: { flexDirection: 'row', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BBDEFB' },
  introTxt: { flex: 1, fontSize: 12.5, color: '#0D47A1', lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A2332', marginTop: 18, marginBottom: 8 },
  table: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF', overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F4F8', gap: 8 },
  td: { fontSize: 12, color: '#37474F', lineHeight: 17 },
  tdTabs: { flex: 1, color: '#1565C0', fontWeight: '600' },
  link: { color: '#1565C0', fontWeight: '700', fontSize: 13, paddingVertical: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E1E7EF', marginBottom: 8, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48 },
  iconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1A2332' },
  cardBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#F0F4F8' },
  h3: { fontSize: 11, fontWeight: '800', color: '#546E7A', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 3 },
  p: { fontSize: 12.5, color: '#37474F', lineHeight: 18, marginBottom: 4 },
  warn: { backgroundColor: '#FFF8E1', borderLeftWidth: 3, borderLeftColor: '#FFB300', padding: 10, borderRadius: 8, marginTop: 8 },
  code: { fontSize: 12, fontWeight: '700', color: '#1565C0', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  type: { fontSize: 11, color: '#78909C', fontWeight: '500' },
});
