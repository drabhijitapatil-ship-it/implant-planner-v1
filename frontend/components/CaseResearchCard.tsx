/**
 * Research Module — case screen study card (S12): studies this case is in,
 * forms due, and active studies the case is eligible for.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../utils/api';
import { RC, Chip, FORM_STATUS } from './research/ResearchUI';

export default function CaseResearchCard({ procedureId, role }: { procedureId: string; role?: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ enrolled: any[]; eligible: any[] } | null>(null);

  useEffect(() => {
    if (!procedureId || role === 'nurse') return;
    api.get(`/research/case/${procedureId}`).then(r => setData(r.data)).catch(() => setData(null));
  }, [procedureId, role]);

  if (!data || role === 'nurse' || (data.enrolled.length === 0 && data.eligible.length === 0)) return null;

  return (
    <View style={s.card} testID="case-research-card">
      <View style={s.hdr}>
        <Ionicons name="flask" size={16} color={RC.purple} />
        <Text style={s.title}>Research</Text>
      </View>
      {data.enrolled.map(e => (
        <TouchableOpacity key={e.enrolment_id} style={s.row} disabled={!e.is_member} onPress={() => router.push(`/research/enrolment/${e.enrolment_id}`)} testID={`case-study-${e.study_code}`}>
          <View style={{ flex: 1 }}>
            <Text style={s.code}>{e.study_code} · {e.subject_code}</Text>
            <Text style={s.sub} numberOfLines={1}>{e.study_title} · tooth {e.tooth_number}</Text>
            {e.forms_due.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {e.forms_due.map((f: any) => { const st = FORM_STATUS[f.status]; return <Chip key={f.timepoint_key} label={`${f.label} ${st.label.toLowerCase()}`} color={st.color} bg={st.bg} small />; })}
              </View>
            )}
          </View>
          {e.is_member && <Ionicons name="chevron-forward" size={16} color={RC.muted} />}
        </TouchableOpacity>
      ))}
      {data.eligible.map(e => (
        <TouchableOpacity key={`${e.study_id}-${e.tooth_number}`} style={[s.row, s.eligible]} onPress={() => router.push(`/research/${e.study_id}/screening`)} testID={`case-eligible-${e.study_code}`}>
          <Ionicons name={e.result === 'eligible' ? 'checkmark-circle' : 'help-circle'} size={18} color={e.result === 'eligible' ? RC.green : RC.amber} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={s.code}>{e.result === 'eligible' ? 'Eligible for' : 'Possible candidate for'} {e.study_code}</Text>
            <Text style={s.sub} numberOfLines={1}>Tooth {e.tooth_number} · {e.study_title}</Text>
          </View>
          <Text style={s.add}>Add to study</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#E1BEE7' },
  hdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { marginLeft: 6, fontSize: 13, fontWeight: '800', color: RC.purple, letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3E5F5', minHeight: 48 },
  eligible: { backgroundColor: '#FAF5FC', borderRadius: 10, paddingHorizontal: 8, borderTopWidth: 0, marginTop: 6 },
  code: { fontSize: 13, fontWeight: '700', color: RC.text },
  sub: { fontSize: 11, color: RC.sub, marginTop: 1 },
  add: { fontSize: 12, fontWeight: '700', color: RC.purple, marginLeft: 6 },
});
