/**
 * iter-401 — "Add Implant to This Case" (mid-treatment addition).
 * For Multiple Implants / All-on-4/6/X cases in Phase 2, 3 or 4: a new implant
 * that is PART of the same treatment (not a parallel case) is captured with a
 * full Phase-2-style form and appended to the case after supervisor +
 * in-charge approval (student flow). In-charge/admin additions auto-approve.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Modal, Pressable, ScrollView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import AugStep2Form, { emptyAugStep2 } from './AugStep2Form';
import PlacementDatePicker from './PlacementDatePicker';
import { showUploadPicker } from '../utils/uploadPicker';

const ELIGIBLE_TYPES = ['Multiple Conventional Implants', 'All on 4', 'All on 6', 'All on X'];
const STATUS_PHASE: Record<string, number> = {
  phase1_approved: 2, pending_phase2: 2,
  phase2_approved: 3, pending_stage2_surgical: 3,
  stage2_surgical_approved: 4, pending_stage2_prosthetic: 4,
  stage2_prosthetic_step1_approved: 4, pending_final_delivery: 4,
};
const FDI_CODES = ([1, 2, 3, 4] as const).flatMap(q => [1, 2, 3, 4, 5, 6, 7, 8].map(t => `${q}${t}`));

function Dropdown({ value, options, placeholder, onChange, testID }: {
  value: string; options: string[]; placeholder: string; onChange: (v: string) => void; testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={s.select} onPress={() => setOpen(true)} data-testid={testID} testID={testID}>
        <Text style={[s.selectT, !value && { color: '#90A4AE' }]} numberOfLines={1}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color="#546E7A" />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.mBackdrop} onPress={() => setOpen(false)}>
          <View style={s.mSheet}>
            <Text style={s.mTitle}>{placeholder}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {options.map((opt, i) => (
                <TouchableOpacity key={`${opt}-${i}`} style={[s.mItem, value === opt && s.mItemOn]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                  data-testid={testID ? `${testID}-opt-${opt.replace(/\s+/g, '-')}` : undefined}
                  testID={testID ? `${testID}-opt-${opt.replace(/\s+/g, '-')}` : undefined}>
                  <Text style={[s.mItemT, value === opt && { color: '#1565C0', fontWeight: '800' }]}>{opt}</Text>
                  {value === opt && <Ionicons name="checkmark" size={16} color="#1565C0" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const STATUS_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  pending_supervisor: { bg: '#FFF3E0', fg: '#E65100', label: 'Awaiting supervisor' },
  pending_incharge: { bg: '#FFF3E0', fg: '#E65100', label: 'Awaiting in-charge' },
  approved: { bg: '#E8F5E9', fg: '#2E7D32', label: 'Approved — added to case' },
  declined: { bg: '#FFEBEE', fg: '#C62828', label: 'Declined' },
};

export default function AddImplantSection({ procedure, onChanged }: { procedure: any; onChanged: () => void }) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [form, setForm] = useState({
    tooth_number: '', system: '', system_is_other: false, system_other_text: '',
    diameter: '', length: '', placement_date: '', insertion_torque_ncm: '', isq: '',
    iopa_url: '', iopa_uploading: false, reason: '',
    aug_used: 'No' as 'Yes' | 'No', augmentation: emptyAugStep2(),
  });
  const patch = (p: Partial<typeof form>) => setForm(prev => ({ ...prev, ...p }));

  const phase = STATUS_PHASE[procedure?.status];
  const eligibleType = ELIGIBLE_TYPES.includes(procedure?.implant_procedure_type || '');
  const requests: any[] = procedure?.implant_addition_requests || [];
  const role = user?.role;
  const canAdd = eligibleType && !!phase && (
    role === 'implant_incharge' || role === 'administrator'
    || (role === 'supervisor' && (procedure?.supervisor_id === user?.id || procedure?.created_by_id === user?.id))
    || (role === 'student' && procedure?.student_id === user?.id)
  );

  const usedSites = useMemo(() => {
    const set = new Set<string>();
    (procedure?.implants || procedure?.implant_plans || []).forEach((i: any) => {
      const t = String(i.tooth_number || i.tooth || i.position || '');
      if (t && i._active_in_treatment !== false) set.add(t);
    });
    requests.forEach(r => { if (String(r.status || '').startsWith('pending')) set.add(String(r.tooth_number)); });
    return set;
  }, [procedure, requests]);
  const toothOptions = FDI_CODES.filter(c => !usedSites.has(c));

  const openModal = async () => {
    setModalOpen(true);
    try {
      // iter-402: same 76-system implant library as Phase 1 / Survival Review
      // (the /implant-catalog endpoint has a different shape → showed "undefined").
      const res = await api.get('/implant-library/systems');
      setCatalog(Array.isArray(res.data) ? res.data : (res.data?.systems || []));
    } catch {}
  };
  const systemOptions = useMemo(
    () => [...Array.from(new Set(catalog.map((c: any) => `${c.brand} — ${c.system}`))).sort((a, b) => a.localeCompare(b)), 'Other'],
    [catalog]
  );
  const selectedCatalogSystem = useMemo(
    () => catalog.find((c: any) => `${c.brand} — ${c.system}` === form.system),
    [catalog, form.system]
  );
  const diameterOptions: number[] = selectedCatalogSystem?.diameters || [];
  const lengthOptions: number[] = selectedCatalogSystem?.lengths || [];

  const handleIopa = async () => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      patch({ iopa_uploading: true });
      const fd = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(picked.uri);
        const blob = await resp.blob();
        // @ts-ignore RN-web FormData accepts File.
        fd.append('file', new File([blob], picked.name || 'iopa', { type: picked.type || 'image/jpeg' }));
      } else {
        // @ts-ignore native FormData blob shape.
        fd.append('file', { uri: picked.uri, name: picked.name || 'iopa.jpg', type: picked.type || 'image/jpeg' });
      }
      const up = await api.post('/uploads/media-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!up.data?.filename) throw new Error('Upload returned no filename');
      patch({ iopa_url: up.data.filename, iopa_uploading: false });
    } catch (e: any) {
      patch({ iopa_uploading: false });
      Alert.alert('Upload failed', e?.response?.data?.detail || e?.message || 'Could not upload the IOPA.');
    }
  };

  const validate = (): string | null => {
    if (!form.tooth_number) return 'Select the FDI tooth site.';
    if (!form.system || (form.system_is_other && !form.system_other_text.trim())) return 'Select or enter the implant system.';
    if (!form.diameter || !form.length) return 'Enter diameter and length.';
    if (!form.placement_date) return 'Select the placement date.';
    if (!form.iopa_url) return 'IOPA radiograph is mandatory.';
    if (form.reason.trim().length < 3) return 'Enter the reason for adding this implant.';
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { Alert.alert('Incomplete', err); return; }
    setSaving(true);
    try {
      const res = await api.post(`/procedures/${procedure._id || procedure.id}/add-implant`, {
        tooth_number: form.tooth_number,
        system: form.system_is_other ? form.system_other_text.trim() : form.system,
        diameter: parseFloat(form.diameter),
        length: parseFloat(form.length),
        placement_date: form.placement_date,
        insertion_torque_ncm: form.insertion_torque_ncm ? parseFloat(form.insertion_torque_ncm) : null,
        isq: form.isq ? parseFloat(form.isq) : null,
        iopa_url: form.iopa_url,
        reason: form.reason.trim(),
        augmentation: form.aug_used === 'Yes' ? form.augmentation : null,
      });
      setModalOpen(false);
      setForm({ tooth_number: '', system: '', system_is_other: false, system_other_text: '', diameter: '', length: '', placement_date: '', insertion_torque_ncm: '', isq: '', iopa_url: '', iopa_uploading: false, reason: '', aug_used: 'No', augmentation: emptyAugStep2() });
      Alert.alert('Submitted', res.data?.request?.status === 'approved'
        ? 'Implant added to this case.'
        : 'Implant addition submitted for approval.');
      onChanged();
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not submit the implant addition.');
    } finally { setSaving(false); }
  };

  const resolve = async (reqId: string, action: 'approve' | 'decline') => {
    setResolving(reqId);
    try {
      await api.post(`/procedures/${procedure._id || procedure.id}/add-implant/${reqId}/resolve`, { action });
      onChanged();
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not resolve the request.');
    } finally { setResolving(null); }
  };

  const canActOn = (r: any) => {
    if (r.status === 'pending_supervisor') {
      return role === 'implant_incharge' || role === 'administrator'
        || (role === 'supervisor' && procedure?.supervisor_id === user?.id);
    }
    if (r.status === 'pending_incharge') return role === 'implant_incharge' || role === 'administrator';
    return false;
  };

  if (!canAdd && !requests.length) return null;

  return (
    <View style={s.card} testID="add-implant-section" data-testid="add-implant-section">
      <View style={s.head}>
        <Ionicons name="add-circle-outline" size={20} color="#1565C0" />
        <Text style={s.title}>Mid-Treatment Implant Addition</Text>
      </View>
      <Text style={s.sub}>
        For this {procedure?.implant_procedure_type} case: add an implant that is part of the SAME treatment plan (not a parallel case).
      </Text>

      {requests.map(r => {
        const chip = STATUS_CHIP[r.status] || STATUS_CHIP.pending_supervisor;
        return (
          <View key={r.id} style={s.reqRow} testID={`implant-addition-req-${r.id}`} data-testid={`implant-addition-req-${r.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={s.reqTitle}>Site {r.tooth_number} · {r.system} · Ø{r.diameter} × {r.length}mm</Text>
              <Text style={s.reqSub}>Phase {r.phase_at_request} · by {r.requested_by_name} · {String(r.requested_at || '').slice(0, 10)}</Text>
              {!!r.reason && <Text style={s.reqSub}>Reason: {r.reason}</Text>}
              <View style={[s.chip, { backgroundColor: chip.bg }]}>
                <Text style={[s.chipT, { color: chip.fg }]}>{chip.label}</Text>
              </View>
            </View>
            {canActOn(r) && (
              <View style={{ gap: 6 }}>
                <TouchableOpacity style={s.approveBtn} disabled={resolving === r.id}
                  onPress={() => resolve(r.id, 'approve')}
                  testID={`implant-addition-approve-${r.id}`} data-testid={`implant-addition-approve-${r.id}`}>
                  <Text style={s.approveT}>{resolving === r.id ? '...' : 'Approve'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.declineBtn} disabled={resolving === r.id}
                  onPress={() => resolve(r.id, 'decline')}
                  testID={`implant-addition-decline-${r.id}`} data-testid={`implant-addition-decline-${r.id}`}>
                  <Text style={s.declineT}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {canAdd && (
        <TouchableOpacity style={s.addBtn} onPress={openModal} testID="add-implant-btn" data-testid="add-implant-btn">
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={s.addBtnT}>Add implant to this treatment</Text>
        </TouchableOpacity>
      )}

      <Modal transparent visible={modalOpen} animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.mBackdrop}>
          <View style={s.formSheet}>
            <View style={s.formHead}>
              <Text style={s.formTitle}>Add Implant — Phase {phase}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} testID="add-implant-close" data-testid="add-implant-close">
                <Ionicons name="close" size={22} color="#546E7A" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
              <Text style={s.lbl}>FDI Tooth Site *</Text>
              <Dropdown value={form.tooth_number} options={toothOptions} placeholder="Select tooth (FDI)"
                onChange={v => patch({ tooth_number: v })} testID="add-implant-tooth" />

              <Text style={s.lbl}>Implant System *</Text>
              <Dropdown value={form.system} options={systemOptions} placeholder="Select Implant System"
                onChange={v => patch({ system: v, system_is_other: v === 'Other', diameter: '', length: '' })} testID="add-implant-system" />
              {form.system_is_other && (
                <TextInput style={s.input} placeholder="Enter implant system manually" value={form.system_other_text}
                  onChangeText={v => patch({ system_other_text: v })} testID="add-implant-system-other" data-testid="add-implant-system-other" />
              )}

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lbl}>Diameter (mm) *</Text>
                  {diameterOptions.length > 0 ? (
                    <Dropdown value={form.diameter ? `${form.diameter} mm` : ''} options={diameterOptions.map(d => `${d} mm`)}
                      placeholder="Diameter (mm)" onChange={v => patch({ diameter: v.replace(' mm', '') })} testID="add-implant-diameter" />
                  ) : (
                    <TextInput style={s.input} placeholder="e.g. 4.3" keyboardType="decimal-pad" value={form.diameter}
                      onChangeText={v => patch({ diameter: v })} testID="add-implant-diameter" data-testid="add-implant-diameter" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lbl}>Length (mm) *</Text>
                  {lengthOptions.length > 0 ? (
                    <Dropdown value={form.length ? `${form.length} mm` : ''} options={lengthOptions.map(l => `${l} mm`)}
                      placeholder="Length (mm)" onChange={v => patch({ length: v.replace(' mm', '') })} testID="add-implant-length" />
                  ) : (
                    <TextInput style={s.input} placeholder="e.g. 10" keyboardType="decimal-pad" value={form.length}
                      onChangeText={v => patch({ length: v })} testID="add-implant-length" data-testid="add-implant-length" />
                  )}
                </View>
              </View>

              <Text style={s.lbl}>Placement date *</Text>
              <PlacementDatePicker value={form.placement_date} onChange={(iso: string) => patch({ placement_date: iso })}
                maxDate={new Date().toISOString().slice(0, 10)} placeholder="Tap to select placement date"
                invalid={!form.placement_date} testID="add-implant-date" />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lbl}>Torque (Ncm)</Text>
                  <TextInput style={s.input} placeholder="e.g. 35" keyboardType="decimal-pad" value={form.insertion_torque_ncm}
                    onChangeText={v => patch({ insertion_torque_ncm: v })} testID="add-implant-torque" data-testid="add-implant-torque" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lbl}>ISQ{phase === 4 ? ' (else flagged pending stage-2)' : ''}</Text>
                  <TextInput style={s.input} placeholder="e.g. 72" keyboardType="decimal-pad" value={form.isq}
                    onChangeText={v => patch({ isq: v })} testID="add-implant-isq" data-testid="add-implant-isq" />
                </View>
              </View>

              <Text style={s.lbl}>IOPA Radiograph *</Text>
              <TouchableOpacity style={[s.iopaBtn, !!form.iopa_url && s.iopaBtnDone]} onPress={handleIopa}
                disabled={form.iopa_uploading} testID="add-implant-iopa-btn" data-testid="add-implant-iopa-btn">
                {form.iopa_uploading ? <ActivityIndicator size="small" color="#1565C0" /> : (
                  <>
                    <Ionicons name={form.iopa_url ? 'checkmark-circle' : 'cloud-upload-outline'} size={16}
                      color={form.iopa_url ? '#2E7D32' : '#1565C0'} />
                    <Text style={[s.iopaT, !!form.iopa_url && { color: '#2E7D32' }]}>
                      {form.iopa_url ? 'IOPA uploaded' : 'Upload IOPA (mandatory)'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={s.lbl}>Bone and Soft Tissue Augmentation</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <TouchableOpacity style={[s.pill, form.aug_used === 'Yes' && s.pillOn]}
                  onPress={() => patch({ aug_used: 'Yes' })} testID="add-implant-aug-yes" data-testid="add-implant-aug-yes">
                  <Text style={[s.pillT, form.aug_used === 'Yes' && s.pillTOn]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pill, form.aug_used !== 'Yes' && s.pillOn]}
                  onPress={() => patch({ aug_used: 'No', augmentation: emptyAugStep2() })} testID="add-implant-aug-no" data-testid="add-implant-aug-no">
                  <Text style={[s.pillT, form.aug_used !== 'Yes' && s.pillTOn]}>No</Text>
                </TouchableOpacity>
              </View>
              {form.aug_used === 'Yes' && (
                <AugStep2Form value={form.augmentation} onChange={(v: any) => patch({ augmentation: v })} testPrefix="add-implant-aug" />
              )}

              <Text style={s.lbl}>Reason for Addition *</Text>
              <TextInput style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline
                placeholder="e.g. Extra posterior implant added for AP spread / prosthesis support"
                value={form.reason} onChangeText={v => patch({ reason: v })}
                testID="add-implant-reason" data-testid="add-implant-reason" />

              <TouchableOpacity style={[s.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}
                testID="add-implant-submit" data-testid="add-implant-submit">
                <Text style={s.submitT}>{saving ? 'Submitting...' : (role === 'implant_incharge' || role === 'administrator' ? 'Add Implant to Case' : 'Submit for Approval')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E3EAF2' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#1565C0' },
  sub: { fontSize: 12, color: '#78909C', marginTop: 4, lineHeight: 17 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFD', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#E3EAF2' },
  reqTitle: { fontSize: 12.5, fontWeight: '700', color: '#37474F' },
  reqSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  chipT: { fontSize: 10.5, fontWeight: '800' },
  approveBtn: { backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  approveT: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  declineBtn: { borderWidth: 1, borderColor: '#EF9A9A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  declineT: { color: '#C62828', fontSize: 12, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1565C0', borderRadius: 999, paddingVertical: 10, marginTop: 12 },
  addBtnT: { color: '#FFF', fontSize: 13.5, fontWeight: '700' },
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  mSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, maxHeight: 500 },
  mTitle: { fontSize: 14, fontWeight: '800', color: '#37474F', marginBottom: 8 },
  mItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F0F3F7' },
  mItemOn: { backgroundColor: '#E8F1FC', borderRadius: 8 },
  mItemT: { fontSize: 13.5, color: '#455A64' },
  formSheet: { backgroundColor: '#FFF', borderRadius: 14, padding: 16 },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#1565C0' },
  lbl: { fontSize: 12.5, fontWeight: '700', color: '#546E7A', marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13.5, color: '#37474F', marginTop: 5, backgroundColor: '#FFF' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, marginTop: 5, backgroundColor: '#FFF' },
  selectT: { fontSize: 13.5, color: '#37474F', flex: 1 },
  iopaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: '#1565C0', borderStyle: 'dashed', borderRadius: 9, paddingVertical: 11, marginTop: 5 },
  iopaBtnDone: { borderColor: '#2E7D32', borderStyle: 'solid', backgroundColor: '#F1F8E9' },
  iopaT: { fontSize: 12.5, fontWeight: '700', color: '#1565C0' },
  pill: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7 },
  pillOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  pillT: { fontSize: 12.5, fontWeight: '700', color: '#546E7A' },
  pillTOn: { color: '#FFF' },
  submitBtn: { backgroundColor: '#2E7D32', borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 16, marginBottom: 6 },
  submitT: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
