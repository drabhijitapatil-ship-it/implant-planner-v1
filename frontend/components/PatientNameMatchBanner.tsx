/**
 * iter-398 — "Possible Existing Patient" banner fired by an exact patient-NAME
 * match on the New Procedure form. Because different patients can share a
 * name, nothing is linked until the clinician confirms via "Auto-fill patient
 * details"; the Cancel tab rejects the match entirely.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { STATUS_LABELS } from '../constants/checklist';

type PatientEntry = {
  registration_number: string;
  patient: any;
  cases: any[];
  cases_count: number;
  latest_case_id: string;
};

type Props = {
  lookup: { patients: PatientEntry[] };
  name: string;
  onConfirmAutofill: (entry: PatientEntry) => void;
  onCancel: () => void;
};

export default function PatientNameMatchBanner({ lookup, name, onConfirmAutofill, onCancel }: Props) {
  const router = useRouter();
  const patients = lookup?.patients || [];
  const [selectedIdx, setSelectedIdx] = useState<number>(patients.length === 1 ? 0 : -1);
  const [showCases, setShowCases] = useState(false);
  const sel = selectedIdx >= 0 ? patients[selectedIdx] : null;

  return (
    <View style={s.card} testID="name-match-banner" data-testid="name-match-banner">
      <View style={s.head}>
        <Ionicons name="people-outline" size={21} color="#B26A00" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Possible Existing Patient</Text>
          <Text style={s.sub}>
            {patients.length} patient{patients.length === 1 ? '' : 's'} named "{name}" found in records
          </Text>
        </View>
      </View>

      {!sel && (
        <>
          <Text style={s.note}>Select the matching patient, or cancel if this is a different person.</Text>
          {patients.map((p, i) => (
            <TouchableOpacity
              key={p.registration_number || i}
              style={s.row}
              onPress={() => { setSelectedIdx(i); setShowCases(false); }}
              testID={`name-match-patient-${i}`}
              data-testid={`name-match-patient-${i}`}
            >
              <Ionicons name="person-outline" size={16} color="#B26A00" />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Reg. No. {p.registration_number || '—'}</Text>
                <Text style={s.rowSub}>
                  {p.patient?.age ? `${p.patient.age} yrs · ` : ''}{p.patient?.sex ? `${p.patient.sex} · ` : ''}
                  {p.cases_count} case{p.cases_count === 1 ? '' : 's'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#B0BEC5" />
            </TouchableOpacity>
          ))}
        </>
      )}

      {sel && (
        <>
          <View style={s.selBox}>
            <Text style={s.rowTitle}>
              {sel.patient?.patient_name}
              {sel.patient?.age ? ` · ${sel.patient.age} yrs` : ''}
              {sel.patient?.sex ? ` · ${sel.patient.sex}` : ''}
            </Text>
            <Text style={s.rowSub}>Reg. No. {sel.registration_number || '—'} · {sel.cases_count} previous case{sel.cases_count === 1 ? '' : 's'}</Text>
          </View>
          <Text style={s.note}>
            If this is the same patient, auto-fill copies their details (including registration number) and links this new implant to their treatment history.
          </Text>
          <View style={s.btnRow}>
            <TouchableOpacity style={s.fillBtn} onPress={() => onConfirmAutofill(sel)}
              testID="name-match-autofill-btn" data-testid="name-match-autofill-btn">
              <Ionicons name="flash-outline" size={15} color="#FFF" />
              <Text style={s.fillBtnTxt}>Auto-fill patient details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={() => setShowCases(!showCases)}
              testID="name-match-toggle-cases" data-testid="name-match-toggle-cases">
              <Text style={s.ghostBtnTxt}>{showCases ? 'Hide cases' : 'View cases'}</Text>
              <Ionicons name={showCases ? 'chevron-up' : 'chevron-down'} size={14} color="#B26A00" />
            </TouchableOpacity>
            {patients.length > 1 && (
              <TouchableOpacity style={s.ghostBtn} onPress={() => { setSelectedIdx(-1); setShowCases(false); }}
                testID="name-match-back-btn" data-testid="name-match-back-btn">
                <Text style={s.ghostBtnTxt}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
          {showCases && sel.cases.map((c, i) => (
            <TouchableOpacity key={c.id} style={s.row} onPress={() => router.push(`/procedures/${c.id}`)}
              testID={`name-match-case-${c.id}`} data-testid={`name-match-case-${c.id}`}>
              <View style={s.numBubble}><Text style={s.numTxt}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {c.implant_procedure_type || 'Implant Treatment'}
                  {(c.missing_teeth || []).length ? ` — teeth ${c.missing_teeth.join(', ')}` : ''}
                </Text>
                <Text style={s.rowSub}>{c.procedure_date || 'Not scheduled'} · {(STATUS_LABELS as any)[c.status] || c.status}</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#B0BEC5" />
            </TouchableOpacity>
          ))}
        </>
      )}

      <TouchableOpacity style={s.cancelBtn} onPress={onCancel}
        testID="name-match-cancel-btn" data-testid="name-match-cancel-btn">
        <Ionicons name="close-circle-outline" size={15} color="#C62828" />
        <Text style={s.cancelBtnTxt}>Cancel — different patient</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF7E8', borderRadius: 12, padding: 13, marginTop: 4, marginBottom: 14, borderWidth: 1, borderColor: '#FFE0A3' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontSize: 14, fontWeight: '800', color: '#B26A00' },
  sub: { fontSize: 12, color: '#5D4037', marginTop: 1.5 },
  note: { fontSize: 11.5, color: '#795548', marginTop: 8, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#F5E3BC' },
  selBox: { backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#F5E3BC' },
  rowTitle: { fontSize: 12.5, fontWeight: '700', color: '#37474F' },
  rowSub: { fontSize: 11, color: '#8D6E63', marginTop: 2 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  fillBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EF6C00', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  fillBtnTxt: { color: '#FFF', fontSize: 12.5, fontWeight: '700' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  ghostBtnTxt: { color: '#B26A00', fontSize: 12.5, fontWeight: '700' },
  numBubble: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EF6C00', alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#EF9A9A', backgroundColor: '#FFF' },
  cancelBtnTxt: { color: '#C62828', fontSize: 12.5, fontWeight: '700' },
});
