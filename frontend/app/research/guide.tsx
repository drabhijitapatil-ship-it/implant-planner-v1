/**
 * Research Module — in-app User Guide: table of contents, search, collapsible
 * sections, tables rendered as cards, PDF download (rendered server-side from the same content).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { downloadAuthenticated } from '../../utils/csvDownload';
import { RESEARCH_GUIDE, GUIDE_VERSION, Block } from '../../constants/researchGuide';
import { RC, PrimaryButton, ScreenHeader, u } from '../../components/research/ResearchUI';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

function blockText(b: Block): string {
  if (b.type === 'table') return [...b.columns, ...b.rows.flat()].join(' ');
  if ('items' in b) return b.items.join(' ');
  return b.text;
}

export default function ResearchGuide() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ before: true });
  const [downloading, setDownloading] = useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const offsets = React.useRef<Record<string, number>>({});

  const q = search.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return RESEARCH_GUIDE;
    return RESEARCH_GUIDE.map(s => ({ ...s, blocks: s.blocks.filter(b => blockText(b).toLowerCase().includes(q) || s.title.toLowerCase().includes(q)) })).filter(s => s.blocks.length);
  }, [q]);

  const toggle = (id: string) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(o => ({ ...o, [id]: !o[id] })); };
  const jump = (id: string) => { setOpen(o => ({ ...o, [id]: true })); setTimeout(() => scrollRef.current?.scrollTo({ y: (offsets.current[id] || 0) - 8, animated: true }), 60); };
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const r = await api.post('/research/guide/pdf', { version: GUIDE_VERSION, sections: RESEARCH_GUIDE });
      await downloadAuthenticated(`${api.defaults.baseURL}/research/guide/pdf/${r.data.token}`, 'Implanr_Research_Module_User_Guide.pdf', 'application/pdf');
    } catch { /* handled in helper */ } finally { setDownloading(false); }
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Research — User guide" subtitle={GUIDE_VERSION} testID="guide-title" onBack={() => (router.canGoBack() ? router.back() : router.replace('/research'))}
        right={<PrimaryButton label="PDF" icon="download-outline" variant="outline" onPress={downloadPdf} loading={downloading} testID="guide-pdf" style={{ paddingVertical: 8, minHeight: 36 }} />} />
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <View style={[u.input, u.row, { paddingVertical: 0 }]}>
          <Ionicons name="search" size={16} color={RC.muted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search the guide… (e.g. calibrate, window, subject code)" placeholderTextColor={RC.muted} style={{ flex: 1, marginLeft: 8, fontSize: 14, color: RC.text, minHeight: 42 }} testID="guide-search" />
          {!!search && <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close-circle" size={18} color={RC.muted} /></TouchableOpacity>}
        </View>
      </View>
      {!q && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 6 }} testID="guide-toc">
          {RESEARCH_GUIDE.map((s, i) => (
            <TouchableOpacity key={s.id} onPress={() => jump(s.id)} style={st.tocChip} testID={`toc-${s.id}`}>
              <Text style={st.tocNum}>{i + 1}</Text><Text style={st.tocTxt} numberOfLines={1}>{s.title.replace(/^Step \d — /, '')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 80 }}>
        {sections.length === 0 && <Text style={[u.kv, { textAlign: 'center', marginTop: 30 }]}>Nothing matches “{search}”.</Text>}
        {sections.map((s, i) => {
          const isOpen = !!q || !!open[s.id];
          return (
            <View key={s.id} style={st.section} onLayout={e => { offsets.current[s.id] = e.nativeEvent.layout.y; }} testID={`guide-section-${s.id}`}>
              <TouchableOpacity style={st.sectionHdr} onPress={() => toggle(s.id)} testID={`guide-toggle-${s.id}`}>
                <View style={st.sectionIcon}><Ionicons name={s.icon as any} size={18} color={RC.primary} /></View>
                <Text style={st.sectionTitle}>{s.title}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={RC.muted} />
              </TouchableOpacity>
              {isOpen && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{s.blocks.map((b, j) => <BlockView key={j} b={b} />)}</View>}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case 'p': return <Text style={st.p}>{b.text}</Text>;
    case 'tip': return (<View style={st.tip}><Ionicons name="bulb-outline" size={16} color="#7A4100" /><Text style={st.tipTxt}>{b.text}</Text></View>);
    case 'later': return (<View style={st.later}><Ionicons name="time-outline" size={14} color={RC.purple} /><Text style={st.laterTxt}>Coming in a later version — {b.text}</Text></View>);
    case 'steps': return (<View style={{ marginTop: 6 }}>{b.items.map((t, i) => (<View key={i} style={st.stepRow}><View style={st.stepNum}><Text style={st.stepNumTxt}>{i + 1}</Text></View><Text style={st.stepTxt}>{t}</Text></View>))}</View>);
    case 'bullets': return (<View style={{ marginTop: 6 }}>{b.items.map((t, i) => (<View key={i} style={st.stepRow}><Text style={[st.stepTxt, { flex: 0, marginRight: 6, color: RC.primary }]}>•</Text><Text style={st.stepTxt}>{t}</Text></View>))}</View>);
    case 'table': return (
      <View style={{ marginTop: 8, gap: 6 }}>
        {b.rows.map((r, i) => (
          <View key={i} style={st.tcard}>
            <Text style={st.tHead}>{r[0]}</Text>
            {r.slice(1).map((c, j) => (
              <View key={j} style={{ flexDirection: 'row', marginTop: 3 }}>
                {b.columns.length > 2 && <Text style={st.tLabel}>{b.columns[j + 1]}: </Text>}
                <Text style={[st.tCell, { flex: 1 }]}>{c}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
}

const st = StyleSheet.create({
  tocChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: RC.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 34, maxWidth: 200 },
  tocNum: { width: 18, height: 18, borderRadius: 9, backgroundColor: RC.primary, color: '#FFF', fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 18, marginRight: 6, overflow: 'hidden' },
  tocTxt: { fontSize: 12, fontWeight: '600', color: RC.text },
  section: { backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: RC.border, overflow: 'hidden' },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 56 },
  sectionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: RC.text },
  p: { fontSize: 13, color: RC.text, lineHeight: 20, marginTop: 6 },
  tip: { flexDirection: 'row', backgroundColor: RC.amberSoft, borderRadius: 10, padding: 10, marginTop: 8, alignItems: 'flex-start' },
  tipTxt: { flex: 1, marginLeft: 8, fontSize: 12, color: '#7A4100', lineHeight: 18 },
  later: { flexDirection: 'row', backgroundColor: RC.purpleSoft, borderRadius: 8, padding: 8, marginTop: 8, alignItems: 'flex-start' },
  laterTxt: { flex: 1, marginLeft: 6, fontSize: 11, color: RC.purple, lineHeight: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 1 },
  stepNumTxt: { fontSize: 11, fontWeight: '800', color: RC.primary },
  stepTxt: { flex: 1, fontSize: 13, color: RC.text, lineHeight: 19 },
  tcard: { backgroundColor: '#F7F9FC', borderRadius: 10, padding: 10 },
  tHead: { fontSize: 13, fontWeight: '800', color: RC.text },
  tLabel: { fontSize: 12, fontWeight: '700', color: RC.sub },
  tCell: { fontSize: 12, color: RC.text, lineHeight: 17 },
});
