/**
 * iter-213 — Existing Implant branch of the unified New Case form.
 *
 * Rendered inside `app/(tabs)/new-procedure.tsx` when the operator picks
 * "Existing Implant" from the Type of Implant Procedure dropdown. Captures:
 *
 *   • Type of Implant Procedure DONE (the original surgery — 8 standard types)
 *   • Per-implant inventory (FDI picker · Brand · System · auto-filled
 *     Connection / Platform · Ø · L · GH · Present Prosthetic Component
 *     dropdown with conditional GH + Angle inputs · surgery date · surgeon · notes)
 *   • Prosthetic History (Yes/No → Temporary | Final → Type · Material text boxes)
 *   • Radiograph (per-implant IOPA for non-full-arch · single OPG for full-arch)
 *   • Save + "Move to Phase 3" / "Move to Phase 4 Step 1" routing buttons
 *
 * On submit, calls `POST /api/procedures/with-existing-implants` (iter-211 endpoint)
 * with the `phase_to_start` parameter so the backend routes the case to the
 * correct status (`pending_phase3` vs `pending_stage2_prosthetic`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Alert,
  StyleSheet, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';

// ── FDI tooth chart (Universal-FDI 11-48) ──
const FDI_QUADRANTS: { label: string; teeth: string[] }[] = [
  { label: 'Upper Right', teeth: ['18','17','16','15','14','13','12','11'] },
  { label: 'Upper Left',  teeth: ['21','22','23','24','25','26','27','28'] },
  { label: 'Lower Left',  teeth: ['31','32','33','34','35','36','37','38'] },
  { label: 'Lower Right', teeth: ['48','47','46','45','44','43','42','41'] },
];

// "Type of Implant Procedure Done" (excludes "Existing Implant" so the user
// can't pick it recursively per Q1 spec).
const ORIGINAL_PROCEDURE_TYPES = [
  'Single Conventional Implant',
  'Multiple Conventional Implants',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
  'All on 4',
  'All on 6',
  'All on X',
];
const FULL_ARCH_DONE = new Set(['All on 4', 'All on 6', 'All on X']);

const PRESENT_COMPONENTS = ['None', 'Healing Abutment', 'Final Abutment', 'Multi-Unit Abutment'] as const;
type PresentComponent = typeof PRESENT_COMPONENTS[number];

type ImplantRow = {
  tooth: string;
  brand: string;
  system: string;
  connection_type: string;
  platform: string;
  diameter_mm: string;
  length_mm: string;
  gingival_height_mm: string;
  // present prosthetic component
  present_component: PresentComponent;
  pc_gingival_height: string;
  pc_angle: string;
  // surgical history
  surgery_date: string;
  original_surgeon: string;
  notes: string;
  // per-implant IOPA radiograph (non-full-arch only)
  iopa_url?: string;
};

const blankImplant = (): ImplantRow => ({
  tooth: '',
  brand: '',
  system: '',
  connection_type: '',
  platform: '',
  diameter_mm: '',
  length_mm: '',
  gingival_height_mm: '',
  present_component: 'None',
  pc_gingival_height: '',
  pc_angle: '',
  surgery_date: '',
  original_surgeon: '',
  notes: '',
});

type Props = {
  patient: {
    student_name: string;
    patient_name: string;
    age: string;
    sex: string;
    profession: string;
    mobile_number: string;
    patient_email: string;
    registration_number: string;
    chief_complaint: string;
    supervisor_id: string;
    supervisor_name: string;
    implant_incharge_id: string;
    implant_incharge_name: string;
    receipt_number: string;
    amount_paid: string;
    procedure_date: string;
    procedure_time: string;
    remark: string;
  };
  validatePatient: () => string | null; // returns null on OK, else error message
};

export default function ExistingImplantSection({ patient, validatePatient }: Props) {
  // Catalog cache for Brand/System dropdowns + auto-fill of connection/platform.
  const [catalog, setCatalog] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/implant-catalog');
        const sysl = (res.data?.systems || []).filter((s: any) => !s.is_stub && !s.is_shared_instruments_doc);
        setCatalog(sysl);
      } catch { /* silent */ }
    })();
  }, []);
  const brands = useMemo(() => Array.from(new Set(catalog.map((s: any) => s.brand).filter(Boolean))).sort(), [catalog]);
  const systemsForBrand = (brand: string) => catalog.filter((s: any) => s.brand === brand).map((s: any) => s.name).sort();
  const lookupCatalog = (brand: string, system: string) => catalog.find((s: any) => s.brand === brand && s.name === system);

  // Form state
  const [originalProcedure, setOriginalProcedure] = useState('');
  const isFullArchDone = FULL_ARCH_DONE.has(originalProcedure);
  const [implants, setImplants] = useState<ImplantRow[]>([blankImplant()]);
  const [hadProsthesis, setHadProsthesis] = useState(false);
  const [prosthesisStage, setProsthesisStage] = useState<'' | 'temporary' | 'final'>('');
  const [prosthesisType, setProsthesisType] = useState('');
  const [prosthesisMaterial, setProsthesisMaterial] = useState('');
  const [opgUrl, setOpgUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | string | null>(null);

  // Helpers
  const updateImplant = (idx: number, key: keyof ImplantRow, val: any) => {
    setImplants(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next: ImplantRow = { ...r, [key]: val };
      // Auto-fill connection/platform when brand+system both set.
      if (key === 'system' || key === 'brand') {
        const hit = lookupCatalog(key === 'brand' ? val : next.brand, key === 'system' ? val : next.system);
        if (hit) {
          // shape varies — try to read connection + platform from catalog doc
          const conn = (hit as any).connection_type
            || (hit as any).connection
            || ((hit as any).implant?.connection_type)
            || '';
          const plat = (hit as any).platform || ((hit as any).implant?.platform) || '';
          if (conn) next.connection_type = String(conn);
          if (plat) next.platform = String(plat);
        }
      }
      return next;
    }));
  };
  const addImplant = () => setImplants(prev => [...prev, blankImplant()]);
  const removeImplant = (idx: number) => {
    if (implants.length === 1) {
      Alert.alert('At least one implant required', 'Add details for the implant in this row.');
      return;
    }
    setImplants(prev => prev.filter((_, i) => i !== idx));
  };

  // Radiograph upload (re-uses existing /uploads endpoint).
  const pickAndUpload = async (kind: 'iopa' | 'opg', idx?: number) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Please grant photo library access.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (r.canceled || !r.assets?.length) return;
      const asset = r.assets[0];
      setUploadingIdx(kind === 'iopa' ? (idx ?? -1) : 'opg');
      const fd = new FormData();
      // @ts-ignore RN FormData blob shape
      fd.append('file', { uri: asset.uri, name: asset.fileName || `${kind}-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' });
      const up = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = up.data?.url || up.data?.public_url || up.data?.objectKey;
      if (!url) throw new Error('Upload returned no URL');
      if (kind === 'iopa' && typeof idx === 'number') {
        updateImplant(idx, 'iopa_url', url);
      } else {
        setOpgUrl(url);
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || e?.message || 'Could not upload the image.');
    } finally {
      setUploadingIdx(null);
    }
  };

  // Validation + submit
  const validate = (): string | null => {
    const pErr = validatePatient(); if (pErr) return pErr;
    if (!originalProcedure) return 'Please pick the Type of Implant Procedure Done.';
    for (let i = 0; i < implants.length; i++) {
      const r = implants[i];
      if (!r.tooth) return `FDI position is required for Implant #${i + 1}.`;
      if (r.brand && !r.system) return `Pick a System for Implant #${i + 1} (or clear the brand).`;
      if (r.present_component !== 'None' && !r.pc_gingival_height) {
        return `Cuff height is required for Implant #${i + 1} present component (${r.present_component}).`;
      }
      if ((r.present_component === 'Final Abutment' || r.present_component === 'Multi-Unit Abutment') && !r.pc_angle) {
        return `Angle is required for Implant #${i + 1} (${r.present_component}).`;
      }
    }
    if (hadProsthesis && !prosthesisStage) return 'Pick Temporary or Final for the existing prosthesis.';
    return null;
  };

  const submit = async (phaseToStart: 'phase3' | 'phase4_step1' | 'draft') => {
    const err = validate();
    if (err) { Alert.alert('Missing info', err); return; }
    setSubmitting(true);
    try {
      const payload: any = {
        student_name: patient.student_name,
        patient_name: patient.patient_name.trim(),
        age: patient.age,
        sex: patient.sex,
        profession: patient.profession,
        mobile_number: patient.mobile_number,
        patient_email: patient.patient_email,
        registration_number: patient.registration_number.trim(),
        chief_complaint: patient.chief_complaint,
        supervisor_id: patient.supervisor_id,
        supervisor_name: patient.supervisor_name,
        implant_incharge_id: patient.implant_incharge_id,
        implant_incharge_name: patient.implant_incharge_name,
        receipt_number: patient.receipt_number.trim(),
        amount_paid: parseFloat(patient.amount_paid),
        procedure_date: patient.procedure_date,
        procedure_time: patient.procedure_time,
        original_procedure_type: originalProcedure,
        existing_implants: implants.map(r => ({
          tooth: r.tooth,
          system_unknown: !r.brand && !r.system,
          brand: r.brand || null,
          system: r.system || null,
          connection_type: r.connection_type || null,
          platform: r.platform || null,
          diameter_mm: r.diameter_mm ? parseFloat(r.diameter_mm) : null,
          length_mm: r.length_mm ? parseFloat(r.length_mm) : null,
          gingival_height_mm: r.gingival_height_mm ? parseFloat(r.gingival_height_mm) : null,
          surgery_date: r.surgery_date || null,
          original_surgeon: r.original_surgeon || null,
          abutment_present: r.present_component !== 'None' ? true : null,
          notes: r.notes || null,
          // iter-213 additions
          present_component: r.present_component,
          present_component_gh: r.pc_gingival_height ? parseFloat(r.pc_gingival_height) : null,
          present_component_angle: r.pc_angle ? parseFloat(r.pc_angle) : null,
          iopa_url: r.iopa_url || null,
        })),
        prosthesis_history: {
          had_prosthesis: hadProsthesis,
          prosthesis_stage: hadProsthesis ? prosthesisStage : null,    // 'temporary' | 'final'
          prosthesis_type: hadProsthesis ? (prosthesisType || null) : null,
          material: hadProsthesis ? (prosthesisMaterial || null) : null,
          failed: false,
          failure_categories: [], failure_modes: [], suspected_root_causes: [],
          failure_narrative: null, attachments: [],
        },
        radiographs: {
          opg_url: isFullArchDone ? (opgUrl || null) : null,
          iopas: !isFullArchDone ? implants.map(r => r.iopa_url || null) : [],
        },
        remark: patient.remark || '',
        phase_to_start: phaseToStart,   // backend routes status accordingly
      };
      const res = await api.post('/procedures/with-existing-implants', payload);
      Alert.alert(
        'Case created',
        `Case ${res.data?.case_id ? `(${res.data.case_id}) ` : ''}created. ${
          phaseToStart === 'phase3' ? 'Routed to Phase 3 inbox.'
          : phaseToStart === 'phase4_step1' ? 'Routed to Phase 4 Step 1 inbox.'
          : 'Saved as draft.'
        }`,
        [{ text: 'Open case', onPress: () => router.replace(`/procedures/${res.data.id}`) }],
      );
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || e?.message || 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render helpers ──
  const Chip = ({ label, active, onPress, testID }: any) => (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} testID={testID} /* @ts-ignore */ data-testid={testID}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // FDI picker — single-select per implant row.
  const FdiPicker = ({ value, onPick, testID }: { value: string; onPick: (t: string) => void; testID: string }) => {
    const [open, setOpen] = useState(false);
    return (
      <View>
        <TouchableOpacity style={s.fdiTrigger} onPress={() => setOpen(true)} testID={testID} /* @ts-ignore */ data-testid={testID}>
          <Ionicons name="grid-outline" size={16} color="#0277BD" />
          <Text style={s.fdiTriggerText}>{value ? `Tooth #${value}` : 'Pick tooth from FDI chart'}</Text>
        </TouchableOpacity>
        <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)}>
            <View style={s.fdiCard}>
              <Text style={s.modalTitle}>FDI Chart — pick tooth</Text>
              {FDI_QUADRANTS.map(q => (
                <View key={q.label} style={{ marginBottom: 6 }}>
                  <Text style={s.fdiQuadrantLabel}>{q.label}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {q.teeth.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[s.fdiCell, value === t && s.fdiCellActive]}
                        onPress={() => { onPick(t); setOpen(false); }}
                      >
                        <Text style={[s.fdiCellText, value === t && s.fdiCellTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  };

  return (
    <View style={s.container} testID="existing-implant-section" /* @ts-ignore */ data-testid="existing-implant-section">
      <View style={s.headerCard}>
        <Ionicons name="information-circle" size={18} color="#0277BD" />
        <Text style={s.headerText}>
          Patient already has implants placed. Surgical phases will be skipped — you'll route the case to Phase 3 or Phase 4 Step 1 below.
        </Text>
      </View>

      {/* ── Type of Implant Procedure DONE ── */}
      <Section title="Type of Implant Procedure Done" icon="construct">
        <View style={s.chipsRow}>
          {ORIGINAL_PROCEDURE_TYPES.map(t => (
            <Chip key={t} label={t} active={originalProcedure === t} onPress={() => setOriginalProcedure(t)} testID={`ei-orig-${t.replace(/\s+/g, '-').toLowerCase()}`} />
          ))}
        </View>
      </Section>

      {/* ── Existing Implant inventory ── */}
      <Section title={`Existing Implants (${implants.length})`} icon="medical">
        {implants.map((row, idx) => {
          const sysOpts = row.brand ? systemsForBrand(row.brand) : [];
          const showAngle = row.present_component === 'Final Abutment' || row.present_component === 'Multi-Unit Abutment';
          const showGH = row.present_component !== 'None';
          return (
            <View key={idx} style={s.implantCard} testID={`ei-row-${idx}`}>
              <View style={s.implantHeader}>
                <Text style={s.implantTitle}>Implant #{idx + 1}</Text>
                <TouchableOpacity onPress={() => removeImplant(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ei-remove-${idx}`}>
                  <Ionicons name="trash-outline" size={18} color="#C62828" />
                </TouchableOpacity>
              </View>
              <Field label="FDI Position *">
                <FdiPicker value={row.tooth} onPick={(t) => updateImplant(idx, 'tooth', t)} testID={`ei-fdi-${idx}`} />
              </Field>
              <View style={s.row2}>
                <Field label="Brand" cellStyle={s.flex1}>
                  <ScrollDropdown value={row.brand} options={brands} onPick={(b) => { updateImplant(idx, 'brand', b); updateImplant(idx, 'system', ''); }} placeholder="Select brand" testID={`ei-brand-${idx}`} />
                </Field>
                <Field label="System" cellStyle={s.flex1}>
                  <ScrollDropdown value={row.system} options={sysOpts} onPick={(sys) => updateImplant(idx, 'system', sys)} placeholder={row.brand ? 'Select system' : 'Pick brand first'} disabled={!row.brand} testID={`ei-system-${idx}`} />
                </Field>
              </View>
              {(row.connection_type || row.platform) && (
                <View style={s.autoFillRow}>
                  {row.connection_type ? <Text style={s.autoFillChip}>Connection: <Text style={s.autoFillBold}>{row.connection_type}</Text></Text> : null}
                  {row.platform ? <Text style={s.autoFillChip}>Platform: <Text style={s.autoFillBold}>{row.platform}</Text></Text> : null}
                </View>
              )}
              <View style={s.row3}>
                <Field label="Ø (mm)" cellStyle={s.flex1}><TextInput style={s.input} keyboardType="numeric" value={row.diameter_mm} onChangeText={(t) => updateImplant(idx, 'diameter_mm', t)} testID={`ei-d-${idx}`} /></Field>
                <Field label="Length (mm)" cellStyle={s.flex1}><TextInput style={s.input} keyboardType="numeric" value={row.length_mm} onChangeText={(t) => updateImplant(idx, 'length_mm', t)} testID={`ei-l-${idx}`} /></Field>
                <Field label="GH (mm)" cellStyle={s.flex1}><TextInput style={s.input} keyboardType="numeric" value={row.gingival_height_mm} onChangeText={(t) => updateImplant(idx, 'gingival_height_mm', t)} testID={`ei-gh-${idx}`} /></Field>
              </View>

              {/* Present Prosthetic Component */}
              <Text style={s.subTitle}>Present Prosthetic Component</Text>
              <View style={s.chipsRow}>
                {PRESENT_COMPONENTS.map(pc => (
                  <Chip key={pc} label={pc} active={row.present_component === pc} onPress={() => updateImplant(idx, 'present_component', pc)} />
                ))}
              </View>
              {(showGH || showAngle) && (
                <View style={s.row2}>
                  {showGH && (
                    <Field label="Cuff / GH (mm)" cellStyle={s.flex1}>
                      <TextInput style={s.input} keyboardType="numeric" value={row.pc_gingival_height} onChangeText={(t) => updateImplant(idx, 'pc_gingival_height', t)} testID={`ei-pcgh-${idx}`} />
                    </Field>
                  )}
                  {showAngle && (
                    <Field label="Angle (°)" cellStyle={s.flex1}>
                      <TextInput style={s.input} keyboardType="numeric" value={row.pc_angle} onChangeText={(t) => updateImplant(idx, 'pc_angle', t)} placeholder="0 / 17 / 30" testID={`ei-pcang-${idx}`} />
                    </Field>
                  )}
                </View>
              )}

              <View style={s.row2}>
                <Field label="Surgery Date" cellStyle={s.flex1}><TextInput style={s.input} value={row.surgery_date} onChangeText={(t) => updateImplant(idx, 'surgery_date', t)} placeholder="YYYY-MM (approx OK)" /></Field>
                <Field label="Original Surgeon" cellStyle={s.flex1}><TextInput style={s.input} value={row.original_surgeon} onChangeText={(t) => updateImplant(idx, 'original_surgeon', t)} /></Field>
              </View>
              <Field label="Notes"><TextInput style={[s.input, { minHeight: 50, textAlignVertical: 'top' }]} multiline value={row.notes} onChangeText={(t) => updateImplant(idx, 'notes', t)} /></Field>

              {/* Per-implant IOPA (non-full-arch only) */}
              {!isFullArchDone && (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.subTitle}>IOPA Radiograph</Text>
                  <TouchableOpacity style={s.uploadBtn} onPress={() => pickAndUpload('iopa', idx)} disabled={uploadingIdx === idx} testID={`ei-iopa-${idx}`}>
                    {uploadingIdx === idx
                      ? <ActivityIndicator size="small" color="#0277BD" />
                      : <><Ionicons name="cloud-upload-outline" size={16} color="#0277BD" /><Text style={s.uploadText}>{row.iopa_url ? 'Re-upload IOPA' : 'Upload IOPA'}</Text></>}
                  </TouchableOpacity>
                  {row.iopa_url && <Text style={s.uploadedHint}>✓ IOPA uploaded</Text>}
                </View>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={s.addBtn} onPress={addImplant} testID="ei-add-implant">
          <Ionicons name="add-circle-outline" size={18} color="#0277BD" />
          <Text style={s.addBtnText}>Add another implant</Text>
        </TouchableOpacity>
      </Section>

      {/* ── Prosthetic History ── */}
      <Section title="Prosthetic History" icon="cube">
        <View style={s.toggleRow}>
          <Text style={s.label}>Was Prosthesis Placed?</Text>
          <TouchableOpacity style={[s.toggle, hadProsthesis && s.toggleActive]} onPress={() => setHadProsthesis(v => !v)} testID="ei-had-prosthesis">
            <Text style={[s.toggleText, hadProsthesis && { color: '#FFF' }]}>{hadProsthesis ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        </View>
        {hadProsthesis && (
          <>
            <Text style={s.label}>Type of Prosthesis</Text>
            <View style={s.chipsRow}>
              <Chip label="Temporary" active={prosthesisStage === 'temporary'} onPress={() => setProsthesisStage('temporary')} testID="ei-stage-temp" />
              <Chip label="Final" active={prosthesisStage === 'final'} onPress={() => setProsthesisStage('final')} testID="ei-stage-final" />
            </View>
            {prosthesisStage && (
              <View style={s.row2}>
                <Field label="Type" cellStyle={s.flex1}><TextInput style={s.input} value={prosthesisType} onChangeText={setProsthesisType} placeholder="e.g. PFM Crown" testID="ei-pros-type" /></Field>
                <Field label="Material" cellStyle={s.flex1}><TextInput style={s.input} value={prosthesisMaterial} onChangeText={setProsthesisMaterial} placeholder="e.g. Zirconia" testID="ei-pros-mat" /></Field>
              </View>
            )}
          </>
        )}
      </Section>

      {/* ── Radiograph (full arch OPG) ── */}
      {isFullArchDone && (
        <Section title="Radiograph (OPG)" icon="image">
          <TouchableOpacity style={s.uploadBtn} onPress={() => pickAndUpload('opg')} disabled={uploadingIdx === 'opg'} testID="ei-opg-upload">
            {uploadingIdx === 'opg'
              ? <ActivityIndicator size="small" color="#0277BD" />
              : <><Ionicons name="cloud-upload-outline" size={16} color="#0277BD" /><Text style={s.uploadText}>{opgUrl ? 'Re-upload OPG' : 'Upload OPG'}</Text></>}
          </TouchableOpacity>
          {opgUrl && <Text style={s.uploadedHint}>✓ OPG uploaded</Text>}
        </Section>
      )}

      {/* ── Save + phase routing ── */}
      <View style={s.actionsRow}>
        <TouchableOpacity style={[s.saveBtn, submitting && { opacity: 0.6 }]} onPress={() => submit('draft')} disabled={submitting} testID="ei-save-btn">
          {submitting ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="save-outline" size={18} color="#FFF" /><Text style={s.saveText}>Save</Text></>}
        </TouchableOpacity>
      </View>
      <View style={s.actionsRow}>
        <TouchableOpacity style={[s.phase3Btn, submitting && { opacity: 0.6 }]} onPress={() => submit('phase3')} disabled={submitting} testID="ei-move-phase3">
          <Ionicons name="arrow-forward-circle" size={18} color="#FFF" />
          <Text style={s.phaseBtnText}>Move to Phase 3</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.phase4Btn, submitting && { opacity: 0.6 }]} onPress={() => submit('phase4_step1')} disabled={submitting} testID="ei-move-phase4">
          <Ionicons name="arrow-forward-circle" size={18} color="#FFF" />
          <Text style={s.phaseBtnText}>Move to Phase 4 Step 1</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Inline sub-components ──
const Section: React.FC<{ title: string; icon: any; children: any }> = ({ title, icon, children }) => (
  <View style={s.section}>
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={18} color="#0277BD" />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const Field: React.FC<{ label: string; cellStyle?: any; children: any }> = ({ label, cellStyle, children }) => (
  <View style={[{ marginBottom: 8 }, cellStyle]}>
    <Text style={s.label}>{label}</Text>
    {children}
  </View>
);

const ScrollDropdown: React.FC<{ value: string; options: string[]; onPick: (v: string) => void; placeholder?: string; disabled?: boolean; testID?: string }> = ({ value, options, onPick, placeholder, disabled, testID }) => {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={[s.input, disabled && { opacity: 0.5 }]}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
        /* @ts-ignore */ data-testid={testID}
      >
        <Text style={{ color: value ? '#1A1A1A' : '#90A4AE' }}>{value || placeholder || 'Select…'}</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Select</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.length === 0
                ? <Text style={{ padding: 12, color: '#999', fontStyle: 'italic' }}>No options</Text>
                : options.map((o, i) => (
                  <TouchableOpacity key={i} style={s.modalRow} onPress={() => { onPick(o); setOpen(false); }}>
                    <Text style={s.modalRowText}>{o}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  container: { marginTop: 8 },
  headerCard: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#E1F5FE', borderRadius: 10, borderWidth: 1, borderColor: '#B3E5FC', marginBottom: 12 },
  headerText: { fontSize: 12, color: '#01579B', flex: 1, lineHeight: 18 },
  section: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0277BD' },
  subTitle: { fontSize: 12, fontWeight: '700', color: '#37474F', marginTop: 8, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '600', color: '#37474F', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A1A1A', backgroundColor: '#FFF' },
  row2: { flexDirection: 'row', gap: 8 },
  row3: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#01579B' },
  chipTextActive: { color: '#FFF' },
  implantCard: { backgroundColor: '#F8FBFF', borderRadius: 10, borderWidth: 1, borderColor: '#BBDEFB', padding: 10, marginBottom: 10 },
  implantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  implantTitle: { fontSize: 13, fontWeight: '700', color: '#01579B' },
  fdiTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, backgroundColor: '#FFF' },
  fdiTriggerText: { fontSize: 13, color: '#1A1A1A' },
  fdiCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, maxHeight: '85%' },
  fdiQuadrantLabel: { fontSize: 11, fontWeight: '700', color: '#0277BD', marginBottom: 4 },
  fdiCell: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#B3E5FC', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  fdiCellActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  fdiCellText: { fontSize: 11, fontWeight: '600', color: '#01579B' },
  fdiCellTextActive: { color: '#FFF' },
  autoFillRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  autoFillChip: { fontSize: 11, color: '#37474F', backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#A5D6A7' },
  autoFillBold: { fontWeight: '800', color: '#1B5E20' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF', marginTop: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#0277BD' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  toggle: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  toggleActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#01579B' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  uploadText: { fontSize: 12, fontWeight: '700', color: '#0277BD' },
  uploadedHint: { fontSize: 11, color: '#2E7D32', marginTop: 4, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#37474F', paddingVertical: 12, borderRadius: 10 },
  saveText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  phase3Btn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#388E3C', paddingVertical: 12, borderRadius: 10 },
  phase4Btn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#0277BD', paddingVertical: 12, borderRadius: 10 },
  phaseBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#0277BD', marginBottom: 8 },
  modalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  modalRowText: { fontSize: 14, color: '#1A1A1A' },
});
