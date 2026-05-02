/**
 * AugmentationChecklist (iter-136) — Pre-Op Augmentation Checklist component.
 *
 * Renders the rule-based, per-site augmentation/grafting plan items generated
 * by the backend on Phase 1 save. Visible to all case stakeholders; only
 * Supervisor / Implant In-Charge / Admin can tick items as completed.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type ChecklistItem = {
  id: string;
  site: string;
  category: 'soft_tissue' | 'keratinized' | 'ridge' | 'biotype' | 'general';
  title: string;
  rationale: string;
  completed: boolean;
  completed_by_id?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  completed_notes?: string;
};

const CATEGORY_STYLE: Record<string, { bg: string; border: string; chip: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  keratinized: { bg: '#FFF3E0', border: '#FFB74D', chip: '#E65100', icon: 'leaf-outline', label: 'Keratinized Mucosa' },
  biotype: { bg: '#F3E5F5', border: '#BA68C8', chip: '#7B1FA2', icon: 'water-outline', label: 'Biotype' },
  ridge: { bg: '#FBE9E7', border: '#FF8A65', chip: '#D84315', icon: 'pulse-outline', label: 'Ridge' },
  soft_tissue: { bg: '#FFF3E0', border: '#FFB74D', chip: '#E65100', icon: 'medkit-outline', label: 'Soft Tissue' },
  general: { bg: '#ECEFF1', border: '#90A4AE', chip: '#455A64', icon: 'information-circle-outline', label: 'General' },
};

export default function AugmentationChecklist({
  procedureId,
  canSignOff,
}: {
  procedureId: string;
  canSignOff: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/procedures/${procedureId}/augmentation-checklist`);
      setItems(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch (e: any) {
      console.error('[AugChecklist] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [procedureId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item: ChecklistItem) => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const r = await api.patch(`/procedures/${procedureId}/augmentation-checklist/${item.id}`, {
        completed: !item.completed,
      });
      if (Array.isArray(r.data?.items)) setItems(r.data.items);
    } catch (e: any) {
      Alert.alert('Update failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setBusyId(null);
    }
  };

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const r = await api.post(`/procedures/${procedureId}/augmentation-checklist/regenerate`);
      if (Array.isArray(r.data?.items)) setItems(r.data.items);
    } catch (e: any) {
      Alert.alert('Regenerate failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={s.section}>
        <ActivityIndicator color="#1565C0" />
      </View>
    );
  }

  if (!items.length) {
    return null; // No findings → no checklist; keep the page clean.
  }

  const completedCount = items.filter(i => i.completed).length;

  return (
    <View style={s.section} testID="augmentation-checklist" /* @ts-ignore */ data-testid="augmentation-checklist">
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Pre-Op Augmentation Checklist</Text>
          <Text style={s.subtitle}>
            {completedCount} of {items.length} signed off · auto-derived from per-site clinical findings
          </Text>
        </View>
        <TouchableOpacity
          style={[s.regenBtn, regenerating && { opacity: 0.5 }]}
          onPress={regenerate}
          disabled={regenerating}
          testID="aug-regenerate-btn"
          /* @ts-ignore */ data-testid="aug-regenerate-btn"
        >
          <Ionicons name="refresh" size={14} color="#1565C0" />
          <Text style={s.regenTxt}>{regenerating ? 'Refreshing…' : 'Regenerate'}</Text>
        </TouchableOpacity>
      </View>

      {items.map(item => {
        const cs = CATEGORY_STYLE[item.category] || CATEGORY_STYLE.general;
        const isBusy = busyId === item.id;
        const ItemWrap: any = canSignOff ? TouchableOpacity : View;
        return (
          <ItemWrap
            key={item.id}
            style={[s.card, { backgroundColor: cs.bg, borderColor: cs.border }, item.completed && s.cardDone]}
            onPress={canSignOff ? () => toggle(item) : undefined}
            disabled={!canSignOff || isBusy}
            activeOpacity={canSignOff ? 0.6 : 1}
            testID={`aug-item-${item.id}`}
            /* @ts-ignore */ data-testid={`aug-item-${item.id}`}
          >
            <View style={s.cardHeader}>
              <View style={[s.checkbox, { borderColor: cs.chip }, item.completed && { backgroundColor: cs.chip }]}>
                {item.completed && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <View style={[s.chip, { backgroundColor: cs.chip }]}>
                <Ionicons name={cs.icon} size={11} color="#FFF" />
                <Text style={s.chipTxt}>{cs.label}</Text>
              </View>
              <View style={[s.siteChip]}>
                <Text style={s.siteTxt}>Site {item.site}</Text>
              </View>
            </View>
            <Text style={[s.itemTitle, item.completed && s.itemTitleDone]}>{item.title}</Text>
            <Text style={s.rationale}>{item.rationale}</Text>
            {item.completed && item.completed_by_name ? (
              <Text style={s.signOff}>
                Signed off by {item.completed_by_name}
                {item.completed_at ? ` · ${new Date(item.completed_at).toLocaleString()}` : ''}
              </Text>
            ) : null}
            {isBusy && <ActivityIndicator size="small" color={cs.chip} style={{ marginTop: 6 }} />}
          </ItemWrap>
        );
      })}

      {!canSignOff && (
        <Text style={s.helper}>Only Supervisor / Implant In-Charge can sign off items.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: 12, marginVertical: 8, borderWidth: 1, borderColor: '#ECEFF1' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '800', color: '#0D47A1' },
  subtitle: { fontSize: 11, color: '#78909C', marginTop: 2 },
  regenBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  regenTxt: { fontSize: 11, fontWeight: '700', color: '#1565C0' },
  card: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  cardDone: { opacity: 0.78 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  chipTxt: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  siteChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#0D47A1' },
  siteTxt: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#1A2332', marginBottom: 4 },
  itemTitleDone: { textDecorationLine: 'line-through', color: '#546E7A' },
  rationale: { fontSize: 11, color: '#37474F', lineHeight: 16 },
  signOff: { fontSize: 10, color: '#2E7D32', marginTop: 6, fontStyle: 'italic' },
  helper: { fontSize: 11, color: '#90A4AE', textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
});
