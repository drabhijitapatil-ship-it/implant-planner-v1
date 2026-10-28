import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import SignaturePad from './SignaturePad';
import { downloadPrescriptionPdf } from '../utils/prescriptionPdf';
import {
  Drug, DRUG_FORMS, FREQUENCY_OPTIONS, TIMING_OPTIONS, MAX_DRUGS, emptyDrug,
  STANDARD_TEMPLATE, DEFAULT_ADVICE, PREOP_TEMPLATE, PREOP_DEFAULT_ADVICE, prescriptionWarnings,
} from '../constants/prescription';

type RxState = { hasDrugs: boolean; creatorSigned: boolean };
type RxKind = 'postop' | 'preop';
type RxFields = { prescribed_date?: string; diagnosis: string; allergies: string; advice: string; drugs: Drug[] };

// Today's date in IST as YYYY-MM-DD (default date of a pre-operative Rx).
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: '#ECEFF1', fg: '#546E7A' },
  pending: { label: 'Pending approval', bg: '#FFF3E0', fg: '#E65100' },
  approved: { label: 'Approved', bg: '#E8F5E9', fg: '#2E7D32' },
};

/**
 * kind="postop" (default): Phase 2 prescription, approved with Phase 2.
 * kind="preop": Phase 1 "Pre-operative Prescription" with its own date,
 *   approved with Phase 1.
 * `local`: edit an Rx that isn't saved on a case yet (New Case form) —
 *   changes go to local.onChange; save/sign/approve/PDF are hidden.
 */
export default function PrescriptionEditor({
  procedure, onChanged, onStateChange, kind = 'postop', local,
}: {
  procedure: any; onChanged?: () => void; onStateChange?: (s: RxState) => void;
  kind?: RxKind; local?: { value: Partial<RxFields> | null | undefined; onChange: (v: RxFields) => void };
}) {
  const { user } = useAuth();
  const preop = kind === 'preop';
  const kq = preop ? '?kind=preop' : '';
  const rx = (local ? local.value : procedure?.[preop ? 'preop_prescription' : 'prescription']) || {};
  const status: string | undefined = local ? undefined : rx.status;
  const caseStatus: string | undefined = procedure?.status;
  const uid = user?.id;
  const role = user?.role;
  const isCreator = procedure?.created_by_id === uid || procedure?.student_id === uid;
  const isFaculty = role === 'implant_incharge' || role === 'administrator'
    || (role === 'supervisor' && procedure?.supervisor_id === uid);
  const approved = status === 'approved';
  const creatorStates = preop ? ['draft', 'pending_phase1', 'rejected_phase1'] : ['phase1_approved'];
  const creatorCanEdit = isCreator && !approved && creatorStates.includes(caseStatus || '');
  const facultyCanEdit = isFaculty && !approved;
  const localLocked = !!local && (local.value as any)?.status === 'approved';
  const canEdit = (!!local && !localLocked) || (!local && (creatorCanEdit || facultyCanEdit));
  const signSlot: 'creator' | 'supervisor' | null = local ? null : (isFaculty && !isCreator) ? 'supervisor' : (isCreator ? 'creator' : null);
  const template = preop ? PREOP_TEMPLATE : STANDARD_TEMPLATE;
  const defaultAdvice = preop ? PREOP_DEFAULT_ADVICE : DEFAULT_ADVICE;

  const [drugs, setDrugs] = useState<Drug[]>(rx.drugs || []);
  const [diagnosis, setDiagnosis] = useState(rx.diagnosis || '');
  const [allergies, setAllergies] = useState(rx.allergies || '');
  const [advice, setAdvice] = useState(rx.advice || '');
  const [rxDate, setRxDate] = useState<string>(rx.prescribed_date || todayIST());
  const [saving, setSaving] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [sigStrokes, setSigStrokes] = useState<number[][][]>([]);
  const [padSize, setPadSize] = useState({ w: 300, h: 150 });
  const syncedRef = useRef<string>('');

  // Resync from the server only when the stored Rx actually changed (status,
  // signatures, template apply) — never mid-edit of the same version.
  useEffect(() => {
    const stamp = rx.updated_at || '';
    if (stamp && stamp !== syncedRef.current) {
      syncedRef.current = stamp;
      setDrugs(rx.drugs || []);
      setDiagnosis(rx.diagnosis || '');
      setAllergies(rx.allergies || '');
      setAdvice(rx.advice || '');
      setRxDate(rx.prescribed_date || todayIST());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rx.updated_at]);

  // Form (local) mode: every edit flows straight back to the parent form.
  useEffect(() => {
    if (!local) return;
    local.onChange({ ...(preop ? { prescribed_date: rxDate } : {}), diagnosis, allergies, advice, drugs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drugs, diagnosis, allergies, advice, rxDate]);

  const hasNamedDrugs = drugs.some(d => (d.name || '').trim());
  useEffect(() => {
    onStateChange?.({ hasDrugs: hasNamedDrugs, creatorSigned: !!(rx.signatures?.creator) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNamedDrugs, rx.signatures?.creator]);

  const warnings = prescriptionWarnings(drugs, allergies, procedure?.medical_assessment);

  const persist = async (): Promise<any | null> => {
    setSaving(true);
    try {
      const res = await api.put(`/procedures/${procedure.id}/prescription${kq}`, {
        diagnosis, allergies, advice, drugs, ...(preop ? { prescribed_date: rxDate } : {}),
      });
      syncedRef.current = res.data?.updated_at || syncedRef.current;
      onChanged?.();
      return res.data;
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Could not save the prescription');
      return null;
    } finally { setSaving(false); }
  };

  const applyTemplate = () => {
    setDrugs(prev => {
      const names = new Set(prev.map(d => (d.name || '').toLowerCase()));
      const add = template.filter(d => !names.has(d.name.toLowerCase()));
      return [...prev, ...add].slice(0, MAX_DRUGS);
    });
    if (!advice.trim()) setAdvice(defaultAdvice);
  };
  const addDrug = () => setDrugs(prev => (prev.length >= MAX_DRUGS ? prev : [...prev, emptyDrug()]));
  const removeDrug = (i: number) => setDrugs(prev => prev.filter((_, idx) => idx !== i));
  const updateDrug = (i: number, key: keyof Drug, val: string) =>
    setDrugs(prev => prev.map((d, idx) => (idx === i ? { ...d, [key]: val } : d)));

  const doSign = async () => {
    if (!hasNamedDrugs) { Alert.alert('Add a medication', 'Please add at least one drug before signing.'); return; }
    const total = sigStrokes.reduce((a, s) => a + s.length, 0);
    if (total < 8) { Alert.alert('Signature required', 'Please draw your signature in the box.'); return; }
    const saved = await persist();
    if (!saved) return;
    try {
      const res = await api.post(`/procedures/${procedure.id}/prescription/sign${kq}`, {
        strokes: sigStrokes, pad_width: padSize.w, pad_height: padSize.h,
      });
      syncedRef.current = res.data?.updated_at || syncedRef.current;
      setSigStrokes([]); setShowPad(false);
      onChanged?.();
      Alert.alert('Signed', `Prescription signed as ${signSlot === 'supervisor' ? 'Supervisor' : 'Treating Clinician'}.`);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Could not record signature'); }
  };

  const doReopen = () => {
    Alert.alert('Reopen prescription', 'This unlocks the approved prescription for corrections. Continue?', [
      { text: 'Cancel' },
      { text: 'Reopen', style: 'destructive', onPress: async () => {
        try { await api.post(`/procedures/${procedure.id}/prescription/reopen${kq}`); onChanged?.(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Could not reopen'); }
      } },
    ]);
  };

  const doApprove = () => {
    Alert.alert('Approve prescription', 'Lock this prescription as approved?', [
      { text: 'Cancel' },
      { text: 'Approve', onPress: async () => {
        try { await api.post(`/procedures/${procedure.id}/prescription/approve${kq}`); onChanged?.(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Could not approve'); }
      } },
    ]);
  };

  const sm = STATUS_META[status || ''] || null;
  const creatorSig = rx.signatures?.creator;
  const supervisorSig = rx.signatures?.supervisor;

  // Nothing to show for a non-editor viewer with an empty Rx.
  if (!canEdit && !hasNamedDrugs && !status) return null;

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipActive]} disabled={!canEdit}>
      <Text style={[s.chipTxt, active && s.chipTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.card} testID={preop ? 'preop-prescription-section' : 'prescription-section'} data-testid={preop ? 'preop-prescription-section' : 'prescription-section'}>
      <View style={s.header}>
        <Ionicons name="medkit" size={20} color="#00897B" />
        <Text style={s.title}>{preop ? 'Pre-operative Prescription' : 'Prescription (Rx)'}</Text>
        {sm && (
          <View style={[s.statusPill, { backgroundColor: sm.bg }]} testID="rx-status-pill">
            <Text style={[s.statusTxt, { color: sm.fg }]}>{sm.label}</Text>
          </View>
        )}
      </View>

      <Text style={s.patientLine}>
        {procedure?.patient_name || '—'} · {procedure?.age ? `${procedure.age} yrs` : 'age —'} · {procedure?.sex || '—'}
      </Text>

      {preop && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.fieldLabel}>Date</Text>
          {canEdit ? (
            <TextInput style={s.input} value={rxDate} onChangeText={setRxDate} placeholder="YYYY-MM-DD"
              placeholderTextColor="#90A4AE" maxLength={10} testID="rx-preop-date" />
          ) : <Text style={s.roView}>{rxDate}</Text>}
        </View>
      )}

      {/* Empty-state CTA */}
      {canEdit && drugs.length === 0 && (
        <View style={s.emptyCta}>
          <Text style={s.emptyHint}>{preop ? 'Add the medication the patient should take before surgery.' : 'Optional — add post-surgical medication for this case.'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity style={s.primaryBtn} onPress={applyTemplate} testID="rx-use-template-btn">
              <Ionicons name="flash" size={14} color="#FFF" />
              <Text style={s.primaryBtnTxt}>Use standard template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={addDrug} testID="rx-add-drug-btn">
              <Ionicons name="add" size={16} color="#00695C" />
              <Text style={s.secondaryBtnTxt}>Add drug</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Diagnosis + allergies (editable) */}
      {(canEdit || diagnosis || allergies) && (drugs.length > 0 || canEdit) && (
        <View style={{ gap: 8, marginTop: 8 }}>
          <View>
            <Text style={s.fieldLabel}>Diagnosis</Text>
            {canEdit ? (
              <TextInput style={s.input} value={diagnosis} onChangeText={setDiagnosis}
                placeholder="e.g. Missing 11 — implant placed" placeholderTextColor="#90A4AE" testID="rx-diagnosis" />
            ) : <Text style={s.roView}>{diagnosis || '—'}</Text>}
          </View>
          <View>
            <Text style={s.fieldLabel}>Known drug allergies</Text>
            {canEdit ? (
              <TextInput style={s.input} value={allergies} onChangeText={setAllergies}
                placeholder="e.g. Penicillin, Sulfa — or 'None known'" placeholderTextColor="#90A4AE" testID="rx-allergies" />
            ) : <Text style={s.roView}>{allergies || '—'}</Text>}
          </View>
        </View>
      )}

      {/* Allergy / interaction warnings */}
      {warnings.length > 0 && (
        <View style={s.warnBox} testID="rx-warnings">
          {warnings.map((w, i) => <Text key={i} style={s.warnTxt}>{w}</Text>)}
        </View>
      )}

      {/* Drug list */}
      {drugs.map((d, i) => (
        <View key={i} style={s.drugCard} testID={`rx-drug-${i}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.drugIdx}>{i + 1}</Text>
            {canEdit ? (
              <TextInput style={[s.input, { flex: 1 }]} value={d.name} onChangeText={v => updateDrug(i, 'name', v)}
                placeholder="Drug name" placeholderTextColor="#90A4AE" testID={`rx-drug-name-${i}`} />
            ) : <Text style={[s.drugName, { flex: 1 }]}>{d.name}</Text>}
            {canEdit && (
              <TouchableOpacity onPress={() => removeDrug(i)} style={{ padding: 4 }} testID={`rx-remove-drug-${i}`}>
                <Ionicons name="trash-outline" size={18} color="#C62828" />
              </TouchableOpacity>
            )}
          </View>

          {canEdit ? (
            <>
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Strength</Text>
                  <TextInput style={s.input} value={d.strength} onChangeText={v => updateDrug(i, 'strength', v)} placeholder="625 mg" placeholderTextColor="#90A4AE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Dose</Text>
                  <TextInput style={s.input} value={d.dosage} onChangeText={v => updateDrug(i, 'dosage', v)} placeholder="1 tab" placeholderTextColor="#90A4AE" />
                </View>
              </View>
              <Text style={s.miniLabel}>Form</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {DRUG_FORMS.map(f => <Chip key={f} label={f} active={d.form === f} onPress={() => updateDrug(i, 'form', f)} />)}
              </ScrollView>
              <Text style={s.miniLabel}>Frequency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {FREQUENCY_OPTIONS.map(f => <Chip key={f} label={f} active={d.frequency === f} onPress={() => updateDrug(i, 'frequency', f)} />)}
              </ScrollView>
              <View style={s.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Duration</Text>
                  <TextInput style={s.input} value={d.duration} onChangeText={v => updateDrug(i, 'duration', v)} placeholder="5 days" placeholderTextColor="#90A4AE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Timing</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                    {TIMING_OPTIONS.map(t => <Chip key={t} label={t} active={d.timing === t} onPress={() => updateDrug(i, 'timing', t)} />)}
                  </ScrollView>
                </View>
              </View>
              <Text style={s.miniLabel}>Notes</Text>
              <TextInput style={[s.input, { minHeight: 36 }]} value={d.notes} onChangeText={v => updateDrug(i, 'notes', v)} placeholder="Instructions" placeholderTextColor="#90A4AE" multiline />
            </>
          ) : (
            <Text style={s.roDrugMeta}>
              {[d.strength, d.form, d.dosage, d.frequency, d.duration, d.timing].filter(Boolean).join(' · ')}
              {d.notes ? `\n${d.notes}` : ''}
            </Text>
          )}
        </View>
      ))}

      {canEdit && drugs.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <TouchableOpacity style={s.secondaryBtn} onPress={addDrug} testID="rx-add-drug-btn-2">
            <Ionicons name="add" size={16} color="#00695C" />
            <Text style={s.secondaryBtnTxt}>Add drug</Text>
          </TouchableOpacity>
          {!local && <TouchableOpacity style={s.primaryBtn} onPress={persist} disabled={saving} testID="rx-save-btn">
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="save" size={14} color="#FFF" />}
            <Text style={s.primaryBtnTxt}>Save prescription</Text>
          </TouchableOpacity>}
        </View>
      )}

      {/* Advice */}
      {(canEdit || advice) && drugs.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={s.fieldLabel}>{preop ? 'Pre-operative instructions' : 'Post-operative advice'}</Text>
          {canEdit ? (
            <TextInput style={[s.input, { minHeight: 56 }]} value={advice} onChangeText={setAdvice} multiline
              placeholder={defaultAdvice} placeholderTextColor="#90A4AE" testID="rx-advice" />
          ) : <Text style={s.roView}>{advice || defaultAdvice}</Text>}
        </View>
      )}

      {/* Signatures summary */}
      {(creatorSig || supervisorSig) && (
        <View style={s.sigSummary}>
          {creatorSig && (
            <View style={s.sigChip} testID="rx-creator-signed">
              <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
              <Text style={s.sigChipTxt}>Clinician: {creatorSig.signed_by_name}</Text>
            </View>
          )}
          {supervisorSig && (
            <View style={s.sigChip} testID="rx-supervisor-signed">
              <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
              <Text style={s.sigChipTxt}>Supervisor: {supervisorSig.signed_by_name}</Text>
            </View>
          )}
        </View>
      )}

      {/* Sign action */}
      {signSlot && !approved && hasNamedDrugs && (
        <View style={{ marginTop: 10 }}>
          {!showPad ? (
            <TouchableOpacity style={s.signBtn} onPress={() => setShowPad(true)} testID="rx-open-sign-btn">
              <Ionicons name="create" size={16} color="#FFF" />
              <Text style={s.signBtnTxt}>
                {(signSlot === 'creator' ? creatorSig : supervisorSig) ? 'Re-sign' : 'Sign'} as {signSlot === 'supervisor' ? 'Supervisor' : 'Treating Clinician'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={s.miniLabel}>Draw your signature below</Text>
              <View onLayout={e => setPadSize({ w: e.nativeEvent.layout.width, h: 150 })}>
                <SignaturePad strokes={sigStrokes} onChange={setSigStrokes} height={150} testID="rx-signature-pad" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={s.secondaryBtn} onPress={() => setSigStrokes([])} testID="rx-clear-sign">
                  <Text style={s.secondaryBtnTxt}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.secondaryBtn]} onPress={() => { setShowPad(false); setSigStrokes([]); }}>
                  <Text style={s.secondaryBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={doSign} disabled={saving} testID="rx-confirm-sign-btn">
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                  <Text style={s.primaryBtnTxt}>Confirm signature</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {local && (
        <Text style={s.lockedNote}>Saved with the case. You can sign it from the case page; it is approved together with Phase 1.</Text>
      )}

      {/* Faculty approve (post-reopen) / reopen / download */}
      {!local && <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {isFaculty && !approved && hasNamedDrugs && supervisorSig && (
          <TouchableOpacity style={s.approveBtn} onPress={doApprove} testID="rx-approve-btn">
            <Ionicons name="shield-checkmark" size={14} color="#FFF" />
            <Text style={s.primaryBtnTxt}>Approve Rx</Text>
          </TouchableOpacity>
        )}
        {canReopenHelper(isFaculty, approved) && (
          <TouchableOpacity style={s.reopenBtn} onPress={doReopen} testID="rx-reopen-btn">
            <Ionicons name="lock-open" size={14} color="#E65100" />
            <Text style={s.reopenTxt}>Reopen</Text>
          </TouchableOpacity>
        )}
        {hasNamedDrugs && (
          <TouchableOpacity style={s.downloadBtn} onPress={() => downloadPrescriptionPdf(procedure.id, kind)} testID="rx-download-btn">
            <Ionicons name="download" size={14} color="#1565C0" />
            <Text style={s.downloadTxt}>{approved ? 'Download PDF' : 'Preview PDF'}</Text>
          </TouchableOpacity>
        )}
      </View>}

      {approved && (
        <Text style={s.lockedNote}>Approved & locked with Phase {preop ? 1 : 2}. Faculty can reopen to make corrections.</Text>
      )}
    </View>
  );
}

const canReopenHelper = (isFaculty: boolean, approved: boolean) => isFaculty && approved;

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#00897B', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#00695C', flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  patientLine: { fontSize: 12, color: '#546E7A', marginTop: 4, fontWeight: '600' },
  emptyCta: { marginTop: 10, gap: 8 },
  emptyHint: { fontSize: 13, color: '#607D8B' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#37474F', marginBottom: 4 },
  miniLabel: { fontSize: 11, fontWeight: '600', color: '#78909C', marginTop: 6, marginBottom: 3 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#1A1A2E', backgroundColor: '#FAFCFF' },
  roView: { fontSize: 14, color: '#263238' },
  twoCol: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#B2DFDB', backgroundColor: '#F1F8F7' },
  chipActive: { backgroundColor: '#00897B', borderColor: '#00897B' },
  chipTxt: { fontSize: 12, color: '#00695C', fontWeight: '600' },
  chipTxtActive: { color: '#FFF' },
  drugCard: { borderWidth: 1, borderColor: '#E0F2F1', borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: '#FBFEFE' },
  drugIdx: { width: 20, fontSize: 14, fontWeight: '700', color: '#00897B' },
  drugName: { fontSize: 15, fontWeight: '700', color: '#1A2332' },
  roDrugMeta: { fontSize: 13, color: '#546E7A', marginTop: 4, marginLeft: 20 },
  warnBox: { backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082', borderRadius: 10, padding: 10, marginTop: 10, gap: 6 },
  warnTxt: { fontSize: 12.5, color: '#8D6E00', fontWeight: '600' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00897B', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  primaryBtnTxt: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E0F2F1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  secondaryBtnTxt: { color: '#00695C', fontSize: 13, fontWeight: '700' },
  signBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 11, justifyContent: 'center' },
  signBtnTxt: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  sigSummary: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  sigChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sigChipTxt: { fontSize: 11.5, color: '#2E7D32', fontWeight: '700' },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  reopenBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FFCC80', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  reopenTxt: { color: '#E65100', fontSize: 13, fontWeight: '700' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#90CAF9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  downloadTxt: { color: '#1565C0', fontSize: 13, fontWeight: '700' },
  lockedNote: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 8 },
});
