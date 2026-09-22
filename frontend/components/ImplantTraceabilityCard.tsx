/**
 * ImplantTraceabilityCard — read-only "Implant Traceability" block for the
 * Case Details Phase 2 review (students, supervisors, in-charge) listing the
 * GS1 box-code data captured per implant, with the label-photo thumbnail.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { getAuthFileUrl } from '../utils/api';

type Trace = {
  gtin?: string; lot?: string; serial?: string; expiry?: string; mfg_date?: string;
  model_label?: string; label_photo?: string; source?: string; recorded_by?: string; recorded_at?: string;
};

function Thumb({ filename }: { filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getAuthFileUrl(filename).then(setUrl).catch(() => setUrl(null)); }, [filename]);
  if (!url) return null;
  return (
    <TouchableOpacity onPress={() => Linking.openURL(url)} testID="trace-photo-thumb">
      <Image source={{ uri: url }} style={st.thumb} />
    </TouchableOpacity>
  );
}

export default function ImplantTraceabilityCard({ traceability, labelFor }: {
  traceability: Record<string, Trace> | null | undefined;
  labelFor?: (pos: string) => string;
}) {
  const entries = Object.entries(traceability || {}).filter(([, t]) => t && typeof t === 'object');
  if (!entries.length) return null;
  const posLabel = (pos: string) => pos.startsWith('idx') ? `Implant ${parseInt(pos.slice(3), 10) + 1}` : (labelFor ? labelFor(pos) : pos);
  return (
    <View style={st.card} testID="implant-traceability-card">
      <View style={st.head}>
        <Ionicons name="qr-code-outline" size={20} color="#00695C" />
        <Text style={st.title}>Implant Traceability</Text>
      </View>
      {entries.map(([pos, t]) => {
        const expired = !!t.expiry && /^\d{4}-\d{2}-\d{2}$/.test(t.expiry) && new Date(t.expiry) < new Date();
        return (
          <View key={pos} style={st.row} testID={`trace-row-${pos}`}>
            <View style={{ flex: 1 }}>
              <View style={st.rowHead}>
                <Text style={st.pos}>{posLabel(pos)}</Text>
                <View style={[st.badge, t.source === 'scan' ? st.badgeScan : st.badgeManual]}>
                  <Text style={st.badgeText}>{t.source === 'scan' ? 'Scanned' : 'Manual'}</Text>
                </View>
              </View>
              <Text style={st.model}>{t.model_label || 'Model not recorded'}</Text>
              <Text style={st.meta}>GTIN {t.gtin || '—'}</Text>
              <Text style={st.meta}>Lot {t.lot || '—'}  ·  SN {t.serial || '—'}</Text>
              <Text style={[st.meta, expired && st.expired]}>Expiry {t.expiry || '—'}{expired ? '  (expired)' : ''}</Text>
              {!!t.recorded_by && <Text style={st.by}>Recorded by {t.recorded_by}</Text>}
            </View>
            {!!t.label_photo && <Thumb filename={t.label_photo} />}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#00897B' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#00695C' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  pos: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeScan: { backgroundColor: '#E8F5E9' },
  badgeManual: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#37474F' },
  model: { fontSize: 14, fontWeight: '600', color: '#0D47A1', marginBottom: 2 },
  meta: { fontSize: 12, color: '#546E7A' },
  expired: { color: '#D32F2F', fontWeight: '600' },
  by: { fontSize: 11, color: '#90A4AE', marginTop: 4 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#ECEFF1' },
});
