/**
 * iter-397 — "Existing Patient Detected" banner on the New Procedure form.
 * Fires when the typed registration number matches prior case(s). Lets the
 * clinician auto-fill demographics/medical history and jump to prior cases.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { STATUS_LABELS } from '../constants/checklist';

type Props = {
  lookup: { patient: any; cases: any[] };
  autofilled: boolean;
  onAutofill: () => void;
  onDismiss: () => void;
};

export default function ExistingPatientBanner({ lookup, autofilled, onAutofill, onDismiss }: Props) {
  const router = useRouter();
  const [showCases, setShowCases] = useState(false);
  const p = lookup?.patient || {};
  const cases = lookup?.cases || [];

  return (
    <View style={s.card} testID="existing-patient-banner" data-testid="existing-patient-banner">
      <View style={s.head}>
        <Ionicons name="person-circle-outline" size={22} color="#0D47A1" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Existing Patient Detected</Text>
          <Text style={s.sub}>
            {p.patient_name || 'Unknown'}
            {p.age ? ` · ${p.age} yrs` : ''}
            {p.sex ? ` · ${p.sex}` : ''} — {cases.length} previous case{cases.length === 1 ? '' : 's'}
          </Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="existing-patient-dismiss-btn" data-testid="existing-patient-dismiss-btn">
          <Ionicons name="close" size={18} color="#78909C" />
        </TouchableOpacity>
      </View>

      <Text style={s.note}>
        This new implant will be recorded as a separate case linked to this patient's treatment history.
      </Text>

      <View style={s.btnRow}>
        <TouchableOpacity
          style={[s.fillBtn, autofilled && s.fillBtnDone]}
          onPress={onAutofill}
          disabled={autofilled}
          testID="existing-patient-autofill-btn"
          data-testid="existing-patient-autofill-btn"
        >
          <Ionicons name={autofilled ? 'checkmark-circle' : 'flash-outline'} size={15} color="#FFF" />
          <Text style={s.fillBtnTxt}>{autofilled ? 'Details auto-filled' : 'Auto-fill patient details'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.casesBtn} onPress={() => setShowCases(!showCases)}
          testID="existing-patient-toggle-cases" data-testid="existing-patient-toggle-cases">
          <Text style={s.casesBtnTxt}>{showCases ? 'Hide cases' : 'View cases'}</Text>
          <Ionicons name={showCases ? 'chevron-up' : 'chevron-down'} size={14} color="#0D47A1" />
        </TouchableOpacity>
      </View>

      {showCases && cases.map((c, i) => (
        <TouchableOpacity
          key={c.id}
          style={s.row}
          onPress={() => router.push(`/procedures/${c.id}`)}
          testID={`existing-patient-case-${c.id}`}
          data-testid={`existing-patient-case-${c.id}`}
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
          </View>
          <Ionicons name="chevron-forward" size={15} color="#90A4AE" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#E8F1FC', borderRadius: 12, padding: 13, marginTop: 4, marginBottom: 14, borderWidth: 1, borderColor: '#BBDEFB' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontSize: 14, fontWeight: '800', color: '#0D47A1' },
  sub: { fontSize: 12, color: '#37474F', marginTop: 1.5 },
  note: { fontSize: 11.5, color: '#546E7A', marginTop: 8, lineHeight: 16 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  fillBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1565C0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  fillBtnDone: { backgroundColor: '#2E7D32' },
  fillBtnTxt: { color: '#FFF', fontSize: 12.5, fontWeight: '700' },
  casesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  casesBtnTxt: { color: '#0D47A1', fontSize: 12.5, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#DBE9F9' },
  numBubble: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  rowTitle: { fontSize: 12.5, fontWeight: '700', color: '#37474F' },
  rowSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
});
