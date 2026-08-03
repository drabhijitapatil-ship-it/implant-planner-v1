/**
 * iter-397 — Patient Treatment History strip on the case detail screen.
 * Groups every case sharing this patient's registration number so faculty
 * see the full treatment timeline (multiple implant episodes) at a glance.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { STATUS_LABELS } from '../constants/checklist';

export default function PatientHistoryStrip({ procedure }: { procedure: any }) {
  const router = useRouter();
  const [cases, setCases] = useState<any[]>([]);
  const [open, setOpen] = useState(true);
  const pid = procedure?._id || procedure?.id;

  useEffect(() => {
    if (!pid) return;
    api.get(`/procedures/${pid}/patient-history`)
      .then(r => setCases(r.data.cases || []))
      .catch(() => {});
  }, [pid, procedure?.status]);

  if (cases.length <= 1) return null;

  return (
    <View style={s.card} testID="patient-history-strip">
      <TouchableOpacity style={s.head} onPress={() => setOpen(!open)} testID="patient-history-toggle">
        <Ionicons name="albums-outline" size={19} color="#4527A0" />
        <Text style={s.title}>Patient Treatment History ({cases.length} cases)</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color="#78909C" />
      </TouchableOpacity>
      {open && cases.map((c, i) => {
        const current = c.is_current;
        return (
          <TouchableOpacity
            key={c.id}
            style={[s.row, current && s.rowCurrent]}
            disabled={current}
            onPress={() => router.push(`/procedures/${c.id}`)}
            testID={`patient-history-case-${c.id}`}
          >
            <View style={s.numBubble}><Text style={s.numTxt}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {c.implant_procedure_type || 'Implant Treatment'}
                {(c.missing_teeth || []).length ? ` — teeth ${c.missing_teeth.join(', ')}` : ''}
              </Text>
              <Text style={s.rowSub}>
                {c.procedure_date || 'Not scheduled'} · {(STATUS_LABELS as any)[c.status] || c.status}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {current && <View style={s.badge}><Text style={s.badgeTxt}>This case</Text></View>}
                {!!c.linked_parent_case_id && (
                  <View style={[s.badge, { backgroundColor: '#E3F2FD' }]}>
                    <Text style={[s.badgeTxt, { color: '#1565C0' }]}>Additional implant treatment</Text>
                  </View>
                )}
                {!!c.augmentation_required && (
                  <View style={[s.badge, { backgroundColor: '#EFEBE9' }]}>
                    <Text style={[s.badgeTxt, { color: '#5D4037' }]}>Augmentation</Text>
                  </View>
                )}
              </View>
            </View>
            {!current && <Ionicons name="chevron-forward" size={16} color="#B0BEC5" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#F6F4FB', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#DDD5F0' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14.5, fontWeight: '800', color: '#4527A0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 11, marginTop: 9, borderWidth: 1, borderColor: '#ECE7F7' },
  rowCurrent: { borderColor: '#B39DDB', backgroundColor: '#FBFAFE' },
  numBubble: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#4527A0', alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#FFF', fontSize: 11.5, fontWeight: '800' },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  rowSub: { fontSize: 11.5, color: '#78909C', marginTop: 2 },
  badge: { backgroundColor: '#EDE7F6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5 },
  badgeTxt: { fontSize: 10, fontWeight: '700', color: '#4527A0' },
});
