import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

// Cross-phase deterministic clinical-rule warnings (ITI 2023 / Misch /
// Buser / Sennerby-Meredith / Naujokat / Jiang). Rendered as a single
// card on the Case Detail screen. Tap to expand all hits.
type Citation = {
  id: string;
  title?: string;
  source?: string;
  year?: number;
  type?: string;
  takeaway?: string;
};
type Hit = {
  rule_id: string;
  severity: 'hard_block' | 'warning' | 'info';
  title: string;
  message: string;
  citation: Citation;
  phase: string;
};
type Resp = {
  hits: Hit[];
  counts: { hard_block: number; warning: number; info: number };
};

const SEV: Record<Hit['severity'], { bg: string; border: string; fg: string; icon: any; label: string }> = {
  hard_block: { bg: '#FFEBEE', border: '#EF5350', fg: '#B71C1C', icon: 'alert-circle', label: 'Hard block' },
  warning:    { bg: '#FFF8E1', border: '#FFB300', fg: '#E65100', icon: 'warning',       label: 'Warning' },
  info:       { bg: '#E3F2FD', border: '#64B5F6', fg: '#0D47A1', icon: 'information-circle', label: 'Info' },
};

export default function ClinicalEvaluationBanner({ procedureId }: { procedureId: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/procedures/${procedureId}/clinical-evaluation`);
        if (!cancelled) setData(res.data);
      } catch {
        // best-effort — banner stays hidden on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [procedureId]);

  if (loading) {
    return (
      <View style={styles.loadingRow} data-testid="clinical-eval-loading">
        <ActivityIndicator size="small" color="#5A6B86" />
        <Text style={styles.loadingText}>Evaluating clinical rules…</Text>
      </View>
    );
  }
  if (!data || !data.hits || data.hits.length === 0) return null;

  const top = data.hits[0];
  const topStyle = SEV[top.severity];
  const remaining = data.hits.length - 1;
  const { hard_block, warning, info } = data.counts;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        style={[styles.card, { backgroundColor: topStyle.bg, borderLeftColor: topStyle.border }]}
        testID="clinical-eval-banner"
        data-testid="clinical-eval-banner"
      >
        <View style={styles.headerRow}>
          <Ionicons name={topStyle.icon as any} size={22} color={topStyle.fg} />
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>Clinical Decision Support</Text>
            <Text style={[styles.title, { color: topStyle.fg }]} numberOfLines={2}>{top.title}</Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          {hard_block > 0 && (
            <View style={[styles.chip, { backgroundColor: '#B71C1C' }]} data-testid="clinical-eval-chip-hard">
              <Text style={styles.chipTextLight}>{hard_block} Hard block{hard_block > 1 ? 's' : ''}</Text>
            </View>
          )}
          {warning > 0 && (
            <View style={[styles.chip, { backgroundColor: '#E65100' }]} data-testid="clinical-eval-chip-warning">
              <Text style={styles.chipTextLight}>{warning} Warning{warning > 1 ? 's' : ''}</Text>
            </View>
          )}
          {info > 0 && (
            <View style={[styles.chip, { backgroundColor: '#0D47A1' }]} data-testid="clinical-eval-chip-info">
              <Text style={styles.chipTextLight}>{info} Info</Text>
            </View>
          )}
          {remaining > 0 && (
            <Text style={styles.moreText}>+{remaining} more — tap to review</Text>
          )}
        </View>
        {top.citation?.takeaway ? (
          <Text style={styles.takeaway} numberOfLines={2}>
            <Text style={styles.takeawayLabel}>Evidence: </Text>
            {top.citation.takeaway}
          </Text>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Clinical Decision Support</Text>
              <TouchableOpacity onPress={() => setOpen(false)} testID="clinical-eval-close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={26} color="#37474F" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 24 }}>
              {data.hits.map((h, i) => {
                const s = SEV[h.severity];
                return (
                  <View key={h.rule_id + i} style={[styles.hit, { borderLeftColor: s.border, backgroundColor: s.bg }]} data-testid={`clinical-eval-hit-${h.rule_id}`}>
                    <View style={styles.hitHeader}>
                      <Ionicons name={s.icon as any} size={18} color={s.fg} />
                      <Text style={[styles.hitSeverity, { color: s.fg }]}>{s.label}</Text>
                      <Text style={styles.hitPhase}>{h.phase}</Text>
                    </View>
                    <Text style={[styles.hitTitle, { color: s.fg }]}>{h.title}</Text>
                    <Text style={styles.hitMessage}>{h.message}</Text>
                    {h.citation?.source ? (
                      <View style={styles.citationBox}>
                        <Text style={styles.citationTitle}>{h.citation.title}</Text>
                        <Text style={styles.citationSource}>{h.citation.source}</Text>
                        {h.citation.takeaway ? (
                          <Text style={styles.citationTakeaway}>“{h.citation.takeaway}”</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 12, marginTop: 12 },
  loadingText: { marginLeft: 8, color: '#5A6B86', fontSize: 13 },
  card: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 5,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerTextWrap: { flex: 1, marginLeft: 10 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#5A6B86', textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10, gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipTextLight: { color: '#fff', fontSize: 11, fontWeight: '700' },
  moreText: { fontSize: 12, color: '#37474F', marginLeft: 6, fontStyle: 'italic' },
  takeaway: { marginTop: 10, fontSize: 12.5, lineHeight: 18, color: '#37474F' },
  takeawayLabel: { fontWeight: '700', color: '#263238' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#263238' },

  hit: { borderLeftWidth: 4, borderRadius: 10, padding: 12, marginBottom: 10 },
  hitHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hitSeverity: { fontSize: 11, fontWeight: '800', marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  hitPhase: { fontSize: 10, color: '#5A6B86', marginLeft: 8, fontWeight: '600' },
  hitTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  hitMessage: { fontSize: 13, color: '#263238', lineHeight: 19 },
  citationBox: { marginTop: 8, padding: 10, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 8 },
  citationTitle: { fontSize: 12, fontWeight: '700', color: '#37474F' },
  citationSource: { fontSize: 11, color: '#5A6B86', marginTop: 2 },
  citationTakeaway: { fontSize: 12, fontStyle: 'italic', color: '#263238', marginTop: 6, lineHeight: 17 },
});
