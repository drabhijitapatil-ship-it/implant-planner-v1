import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, ScrollView, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

// iter-280: Smart Clinical Tip banner — Phase 1. Floating card placed
// mid-dashboard. Same tip shown to a user all day; new tip rotates
// nightly with anti-repetition + per-week category limits enforced
// server-side.
type Tip = {
  tip_id: string;
  title: string;
  category: string;
  evidence_level: string;
  source_organization?: string;
  source_reference?: string;
  publication_year?: number;
  tip_text: string;
  saved?: boolean;
  dismissed_today?: boolean;
  personalised_hint?: string | null;
  streak?: { current: number; longest: number; engaged_today: boolean } | null;
};

const EVIDENCE_COLORS: Record<string, string> = {
  High: '#2E7D32', Moderate: '#F9A825', Low: '#90A4AE',
};

export default function SmartTipBanner() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/tips/daily');
      setTip(data);
      if (data?.dismissed_today) setDismissed(true);
    } catch {
      // best-effort — banner just stays hidden if API fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onToggleSave = async () => {
    if (!tip) return;
    try {
      const { data } = await api.post(`/tips/${tip.tip_id}/save`);
      setTip({ ...tip, saved: data.saved });
    } catch {}
  };

  const onDismiss = async () => {
    if (!tip) return;
    setDismissed(true);
    try { await api.post(`/tips/${tip.tip_id}/dismiss`); } catch {}
  };

  const onShare = async () => {
    if (!tip) return;
    const text =
      `💡 Implanr Smart Clinical Tip — ${tip.title}\n\n` +
      `${tip.tip_text}\n\n` +
      `Source: ${tip.source_organization || ''}` +
      (tip.source_reference ? ` (${tip.source_reference}${tip.publication_year ? `, ${tip.publication_year}` : ''})` : '') +
      `\nEvidence Level: ${tip.evidence_level}`;
    try {
      if (Platform.OS === 'web' && navigator.share) {
        await navigator.share({ title: 'Implanr Smart Tip', text });
      } else if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        await Share.share({ message: text, title: 'Implanr Smart Tip' });
      }
    } catch {}
  };

  if (loading || !tip || dismissed) return null;

  const evColor = EVIDENCE_COLORS[tip.evidence_level] || '#90A4AE';

  return (
    <>
      <View style={s.card} data-testid="smart-tip-banner">
        <View style={s.header}>
          <View style={s.iconWrap}>
            <Ionicons name="bulb" size={18} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Today's Smart Clinical Tip</Text>
            <Text style={s.title} numberOfLines={2}>{tip.title}</Text>
          </View>
          {tip.streak && tip.streak.current > 0 ? (
            <View style={s.streakChip} data-testid="smart-tip-streak">
              <Ionicons name="flame" size={12} color="#E65100" />
              <Text style={s.streakTxt}>{tip.streak.current}</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} data-testid="smart-tip-dismiss">
            <Ionicons name="close" size={18} color="#90A4AE" />
          </TouchableOpacity>
        </View>

        <View style={s.chipsRow}>
          <View style={s.catChip}><Text style={s.catChipTxt}>{tip.category}</Text></View>
          <View style={[s.evChip, { backgroundColor: `${evColor}1A`, borderColor: `${evColor}55` }]}>
            <View style={[s.evDot, { backgroundColor: evColor }]} />
            <Text style={[s.evTxt, { color: evColor }]}>{tip.evidence_level}</Text>
          </View>
        </View>

        <Text style={s.tipTxt} numberOfLines={4}>{tip.tip_text}</Text>

        <View style={s.sourceRow}>
          <Ionicons name="book-outline" size={12} color="#78909C" />
          <Text style={s.sourceTxt} numberOfLines={1}>
            {tip.source_organization}{tip.source_reference ? ` · ${tip.source_reference}` : ''}
          </Text>
        </View>

        {tip.personalised_hint ? (
          <View style={s.hintRow} data-testid="smart-tip-personalised-hint">
            <Ionicons name="sparkles" size={11} color="#1565C0" />
            <Text style={s.hintTxt} numberOfLines={2}>{tip.personalised_hint}</Text>
          </View>
        ) : null}

        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionBtn} onPress={onToggleSave} data-testid="smart-tip-save">
            <Ionicons name={tip.saved ? 'bookmark' : 'bookmark-outline'} size={16} color={tip.saved ? '#1565C0' : '#546E7A'} />
            <Text style={[s.actionTxt, tip.saved && { color: '#1565C0' }]}>{tip.saved ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={onShare} data-testid="smart-tip-share">
            <Ionicons name="share-outline" size={16} color="#546E7A" />
            <Text style={s.actionTxt}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.primaryAction]} onPress={() => setShowModal(true)} data-testid="smart-tip-read-more">
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
            <Text style={[s.actionTxt, { color: '#FFF' }]}>Read more</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{tip.title}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="#546E7A" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              <View style={s.chipsRow}>
                <View style={s.catChip}><Text style={s.catChipTxt}>{tip.category}</Text></View>
                <View style={[s.evChip, { backgroundColor: `${evColor}1A`, borderColor: `${evColor}55` }]}>
                  <View style={[s.evDot, { backgroundColor: evColor }]} />
                  <Text style={[s.evTxt, { color: evColor }]}>{tip.evidence_level} evidence</Text>
                </View>
              </View>
              <Text style={s.modalBody}>{tip.tip_text}</Text>
              <View style={s.modalSourceBlock}>
                <Text style={s.modalSourceLabel}>Source</Text>
                <Text style={s.modalSourceVal}>
                  {tip.source_organization}{tip.source_reference ? ` — ${tip.source_reference}` : ''}{tip.publication_year ? ` (${tip.publication_year})` : ''}
                </Text>
              </View>
            </ScrollView>
            <View style={s.modalFooter}>
              <TouchableOpacity style={s.actionBtn} onPress={onToggleSave}>
                <Ionicons name={tip.saved ? 'bookmark' : 'bookmark-outline'} size={16} color={tip.saved ? '#1565C0' : '#546E7A'} />
                <Text style={[s.actionTxt, tip.saved && { color: '#1565C0' }]}>{tip.saved ? 'Saved' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, s.primaryAction]} onPress={onShare}>
                <Ionicons name="share-outline" size={16} color="#FFF" />
                <Text style={[s.actionTxt, { color: '#FFF' }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginVertical: 12, padding: 14,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E0E7EE',
    shadowColor: '#0D47A1', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFB300', alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { fontSize: 10, fontWeight: '700', color: '#1565C0', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '800', color: '#1A2332', marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  catChip: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#E3F2FD', borderRadius: 10 },
  catChipTxt: { fontSize: 10, fontWeight: '700', color: '#1565C0', letterSpacing: 0.3 },
  evChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  evDot: { width: 6, height: 6, borderRadius: 3 },
  evTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  tipTxt: { fontSize: 13, color: '#37474F', lineHeight: 19, marginTop: 10 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  sourceTxt: { fontSize: 11, color: '#78909C', flex: 1 },
  hintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: '#E3F2FD', borderRadius: 8,
    alignSelf: 'flex-start', maxWidth: '100%',
  },
  hintTxt: { fontSize: 10, color: '#1565C0', fontWeight: '700', letterSpacing: 0.2 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, marginRight: 6,
    backgroundColor: '#FFF3E0', borderRadius: 10,
    borderWidth: 1, borderColor: '#FFCC80',
  },
  streakTxt: { fontSize: 11, fontWeight: '800', color: '#E65100', letterSpacing: 0.2 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FAFCFF',
  },
  actionTxt: { fontSize: 12, fontWeight: '700', color: '#546E7A' },
  primaryAction: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,25,40,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1A2332', flex: 1, marginRight: 10 },
  modalBody: { fontSize: 14, color: '#37474F', lineHeight: 21, marginTop: 12 },
  modalSourceBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  modalSourceLabel: { fontSize: 11, fontWeight: '700', color: '#78909C', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  modalSourceVal: { fontSize: 13, color: '#37474F' },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
