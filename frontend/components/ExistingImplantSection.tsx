/**
 * iter-215 — Existing Implant branch of the unified New Case form.
 *
 * Visual + behaviour parity with the default New Case workflow:
 *   • Same section / label / dropdown / chip / input typography (16/13/15)
 *   • Spacious Implant Selection (one field per row in tight breakpoints)
 *   • FDI multi-select chart shown immediately for non-full-arch procedures
 *     (one implant card auto-generated per tooth picked)
 *   • Per-implant single-select FDI chart kept for full-arch ("All on …")
 *   • Brand / System / Diameter / Length all driven by `/implant-library/systems`
 *     so the user picks from the actual catalog instead of free-typing
 *   • Optional ISQ value per implant (matches Phase 2 default-workflow pattern)
 *   • Yes / No toggle for Prosthetic History
 *   • Action buttons stack vertically so labels never clip on narrow screens
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Alert,
  StyleSheet, Modal, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../utils/api';
import FdiAnatomicalChart from './FdiAnatomicalChart';

// Mirrors Phase 4 Step 1's prosthetic-plan grouping so the prosthesis-history
// defaults stay in sync with `constants/checklist.ts` and
// `submit-stage2-prosthetic/[id].tsx`.
const SINGLE_PROCEDURES = new Set(['Single Conventional Implant']);
const MULTIPLE_PROCEDURES = new Set([
  'Multiple Conventional Implants',
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
]);
const FULL_ARCH_PROCEDURES = new Set(['All on 4', 'All on 6', 'All on X']);

/**
 * Default Type + Material for the existing-prosthesis history form.
 *
 * Final-stage values mirror the first option of the corresponding Phase 4
 * Step 1 dropdown (`PHASE4_SINGLE_MULTIPLE_OPTIONS` / `PHASE4_FULL_ARCH_OPTIONS`)
 * + first material from `FP_MATERIAL_OPTIONS` so the data shape matches
 * downstream Lab-Slip / Case-Report renderers.
 *
 * Temporary-stage values fall back to the standard chairside provisional set
 * (heat-cure / PMMA acrylic) since the institution doesn't enumerate
 * temporary-prosthesis options in Phase 4 — temporaries are always pre-final.
 */
function getProsthesisDefaults(originalProcedure: string, stage: 'temporary' | 'final'): { type: string; material: string } {
  if (stage === 'final') {
    if (SINGLE_PROCEDURES.has(originalProcedure)) return { type: 'Cement Retained Crown FP1', material: 'Porcelain Fused to Metal' };
    if (MULTIPLE_PROCEDURES.has(originalProcedure)) return { type: 'Cement Retained Bridge FP1', material: 'Porcelain Fused to Metal' };
    if (FULL_ARCH_PROCEDURES.has(originalProcedure)) return { type: 'Full Arch FP3 - Porcelain Fused to Metal Prosthesis', material: 'Porcelain Fused to Metal' };
    return { type: '', material: '' };
  }
  // Temporary
  if (SINGLE_PROCEDURES.has(originalProcedure)) return { type: 'Acrylic Temporary Crown', material: 'Heat Cure Acrylic' };
  if (MULTIPLE_PROCEDURES.has(originalProcedure)) return { type: 'Acrylic Temporary Bridge', material: 'Heat Cure Acrylic' };
  if (FULL_ARCH_PROCEDURES.has(originalProcedure)) return { type: 'Acrylic Temporary Full Arch', material: 'Heat Cure Acrylic' };
  return { type: '', material: '' };
}

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
  iopa_url?: string;
  // optional ISQ (mirrors Phase 2 default workflow)
  isq_value: string;
  // "Other" manual-entry mode (when brand catalog doesn't carry the implant)
  manual_brand: boolean;
  // iter-216: per-row save / collapse (sequential lock)
  saved: boolean;
};

const blankImplant = (tooth = ''): ImplantRow => ({
  tooth,
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
  isq_value: '',
  manual_brand: false,
  saved: false,
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
  validatePatient: () => string | null;
};

// ── Library system shape (from /api/implant-library/systems) ──
type LibSystem = {
  brand: string; system: string;
  diameters: number[]; lengths: number[];
  count: number;
  indication?: string;
};

export default function ExistingImplantSection({ patient, validatePatient }: Props) {
  // Catalog cache for connection / platform auto-fill.
  const [catalog, setCatalog] = useState<any[]>([]);
  // Library cache for brand → system → diameter / length dropdowns.
  const [library, setLibrary] = useState<LibSystem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, libRes] = await Promise.allSettled([
          api.get('/implant-catalog'),
          api.get('/implant-library/systems'),
        ]);
        if (catRes.status === 'fulfilled') {
          const sysl = (catRes.value.data?.systems || []).filter((s: any) => !s.is_stub && !s.is_shared_instruments_doc);
          setCatalog(sysl);
        }
        if (libRes.status === 'fulfilled') setLibrary(libRes.value.data || []);
      } catch { /* silent */ }
    })();
  }, []);

  const OTHER = 'Other (manual entry)';
  const brands = useMemo(() => {
    const list = Array.from(new Set(library.map(s => s.brand).filter(Boolean))).sort();
    return [...list, OTHER];
  }, [library]);
  const systemsForBrand = (brand: string) => {
    if (brand === OTHER) return [];
    return library.filter(s => s.brand === brand).map(s => s.system).sort();
  };
  const lookupLibSystem = (brand: string, system: string) => library.find(s => s.brand === brand && s.system === system);
  const lookupCatalog = (brand: string, system: string) => catalog.find((s: any) => s.brand === brand && s.name === system);

  // Form state
  const [originalProcedure, setOriginalProcedure] = useState('');
  const isFullArchDone = FULL_ARCH_DONE.has(originalProcedure);

  // Multi-select FDI for non-full-arch (drives implant cards 1:1).
  const [missingTeeth, setMissingTeeth] = useState<string[]>([]);
  const [implants, setImplants] = useState<ImplantRow[]>([blankImplant()]);

  const [hadProsthesis, setHadProsthesis] = useState<boolean | null>(null);
  const [prosthesisStage, setProsthesisStage] = useState<'' | 'temporary' | 'final'>('');
  const [prosthesisType, setProsthesisType] = useState('');
  const [prosthesisMaterial, setProsthesisMaterial] = useState('');

  const [opgUrl, setOpgUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | string | null>(null);

  // ── Reset on procedure-type change ──
  useEffect(() => {
    if (!originalProcedure) return;
    if (isFullArchDone) {
      setMissingTeeth([]);
      setImplants(prev => (prev.length === 0 ? [blankImplant()] : prev));
    } else {
      // Non-full-arch: rows are derived from missingTeeth — start clean
      setImplants([]);
      setMissingTeeth([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalProcedure]);

  // ── Sync implant rows to missingTeeth selection (non-full-arch only) ──
  useEffect(() => {
    if (isFullArchDone) return;
    setImplants(prev => {
      // Keep existing row if its tooth still selected; create blank for new teeth.
      const byTooth = new Map(prev.filter(r => r.tooth).map(r => [r.tooth, r]));
      return missingTeeth.map(t => byTooth.get(t) || blankImplant(t));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingTeeth, isFullArchDone]);

  // Helpers
  const updateImplant = (idx: number, key: keyof ImplantRow, val: any) => {
    setImplants(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next: ImplantRow = { ...r, [key]: val };
      // "Other" branch: switch to manual entry, clear all auto-fill fields.
      if (key === 'brand' && val === OTHER) {
        next.manual_brand = true;
        next.brand = '';
        next.system = '';
        next.connection_type = '';
        next.platform = '';
        next.diameter_mm = '';
        next.length_mm = '';
        return next;
      }
      // Switching back to a catalog brand → exit manual mode.
      if (key === 'brand' && val !== OTHER) {
        next.manual_brand = false;
      }
      // Auto-fill connection / platform on brand+system change (catalog-only).
      if ((key === 'system' || key === 'brand') && !next.manual_brand) {
        if (key === 'brand') { next.system = ''; next.diameter_mm = ''; next.length_mm = ''; }
        if (key === 'system') { next.diameter_mm = ''; next.length_mm = ''; }
        const hit = lookupCatalog(key === 'brand' ? val : next.brand, key === 'system' ? val : next.system);
        if (hit) {
          const conn = (hit as any).connection_type
            || (hit as any).connection
            || ((hit as any).implant?.connection_type)
            || '';
          const plat = (hit as any).platform || ((hit as any).implant?.platform) || '';
          next.connection_type = conn ? String(conn) : '';
          next.platform = plat ? String(plat) : '';
        } else {
          next.connection_type = '';
          next.platform = '';
        }
      }
      return next;
    }));
  };
  const addImplant = () => {
    if (implants.some(r => !r.saved)) {
      Alert.alert('Save the current implant first', 'Please save the current implant before adding another one.');
      return;
    }
    setImplants(prev => [...prev, blankImplant()]);
  };
  const removeImplant = (idx: number) => {
    if (implants.length === 1) {
      Alert.alert('At least one implant required', 'Add details for the implant in this row.');
      return;
    }
    setImplants(prev => prev.filter((_, i) => i !== idx));
  };

  // iter-216 — per-row save / edit (sequential collapse).
  const validateRow = (r: ImplantRow, idx: number): string | null => {
    if (!r.tooth) return `FDI position is required for Implant #${idx + 1}.`;
    if (r.brand && !r.system) return `Pick a System for Implant #${idx + 1} (or clear the brand).`;
    if (r.present_component !== 'None' && !r.pc_gingival_height) {
      return `Cuff height is required for Implant #${idx + 1} present component (${r.present_component}).`;
    }
    if ((r.present_component === 'Final Abutment' || r.present_component === 'Multi-Unit Abutment') && !r.pc_angle) {
      return `Angle is required for Implant #${idx + 1} (${r.present_component}).`;
    }
    return null;
  };
  const saveImplantRow = (idx: number) => {
    const row = implants[idx];
    const err = validateRow(row, idx);
    if (err) { Alert.alert('Missing info', err); return; }
    setImplants(prev => prev.map((r, i) => (i === idx ? { ...r, saved: true } : r)));
  };
  const editImplantRow = (idx: number) => {
    setImplants(prev => prev.map((r, i) => (i === idx ? { ...r, saved: false } : r)));
  };
  // First unsaved implant is the only one expanded (sequential lock).
  const activeIdx = implants.findIndex(r => !r.saved);

  // Radiograph upload
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
      if (kind === 'iopa' && typeof idx === 'number') updateImplant(idx, 'iopa_url', url);
      else setOpgUrl(url);
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
    if (!isFullArchDone && missingTeeth.length === 0) return 'Mark at least one tooth on the FDI chart.';
    if (implants.length === 0) return 'Add at least one implant.';
    for (let i = 0; i < implants.length; i++) {
      const r = implants[i];
      if (!r.saved) return `Please save Implant #${i + 1} before submitting.`;
      const rowErr = validateRow(r, i);
      if (rowErr) return rowErr;
    }
    if (hadProsthesis === true && !prosthesisStage) return 'Pick Temporary or Final for the existing prosthesis.';
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
          present_component: r.present_component,
          present_component_gh: r.pc_gingival_height ? parseFloat(r.pc_gingival_height) : null,
          present_component_angle: r.pc_angle ? parseFloat(r.pc_angle) : null,
          iopa_url: r.iopa_url || null,
          isq_value: r.isq_value ? parseFloat(r.isq_value) : null,
        })),
        prosthesis_history: {
          had_prosthesis: hadProsthesis === true,
          prosthesis_stage: hadProsthesis ? prosthesisStage : null,
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
        phase_to_start: phaseToStart,
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

  // ─── Render helpers (match new-procedure styling) ───
  const Chip = ({ label, active, onPress, testID }: any) => (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} testID={testID} /* @ts-ignore */ data-testid={testID}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View testID="existing-implant-section" /* @ts-ignore */ data-testid="existing-implant-section">
      <View style={styles.headerCard}>
        <Ionicons name="information-circle" size={20} color="#1565C0" />
        <Text style={styles.headerText}>
          Patient already has implants placed. Surgical phases will be skipped — choose Phase 3 or Phase 4 Step 1 below to route the case.
        </Text>
      </View>

      {/* ─── Type of Implant Procedure DONE ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Type of Implant Procedure Done *</Text>
        <View style={styles.chipRow}>
          {ORIGINAL_PROCEDURE_TYPES.map(t => (
            <Chip key={t} label={t} active={originalProcedure === t}
              onPress={() => setOriginalProcedure(t)}
              testID={`ei-orig-${t.replace(/\s+/g, '-').toLowerCase()}`} />
          ))}
        </View>
      </View>

      {/* ─── FDI chart for non-full-arch (multi-select, drives implant rows) ─── */}
      {originalProcedure && !isFullArchDone && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mark Existing Implant Position(s) *</Text>
          <Text style={styles.helperText}>Tap each tooth that already has an implant. One Implant Selection card will be added per tooth below.</Text>
          <FdiAnatomicalChart
            mode="multi"
            value={missingTeeth}
            onChange={(next) => setMissingTeeth(next as string[])}
            selectedLabel="Existing implant"
            testIDPrefix="ei-fdi"
          />
          {missingTeeth.length > 0 && (
            <Text style={styles.fdiSummary}>
              {missingTeeth.length} {missingTeeth.length === 1 ? 'tooth' : 'teeth'} marked — {[...missingTeeth].sort().join(', ')}
            </Text>
          )}
        </View>
      )}

      {/* ─── Implant Selection — one card per implant ─── */}
      {originalProcedure && (isFullArchDone || missingTeeth.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Implant Selection {isFullArchDone ? `(${implants.length})` : ''}</Text>
          {implants.map((row, idx) => {
            const sysOpts = row.brand ? systemsForBrand(row.brand) : [];
            const libHit = lookupLibSystem(row.brand, row.system);
            const diaOpts = libHit?.diameters?.map(d => String(d)) || [];
            const lenOpts = libHit?.lengths?.map(l => String(l)) || [];
            const showAngle = row.present_component === 'Final Abutment' || row.present_component === 'Multi-Unit Abutment';
            const showGH = row.present_component !== 'None';

            // Sequential lock: only the first unsaved row is editable.
            // Saved rows render as collapsed summaries with Edit/Delete.
            // Later unsaved rows render as locked-collapsed placeholders.
            const isExpanded = !row.saved && idx === activeIdx;
            const isCollapsedSaved = row.saved;
            const isLockedAhead = !row.saved && activeIdx >= 0 && idx > activeIdx;

            // ─── Collapsed: SAVED (Edit / Delete) ───
            if (isCollapsedSaved) {
              const summary = [
                row.tooth ? `FDI #${row.tooth}` : null,
                row.brand && row.system ? `${row.brand} · ${row.system}` : (row.brand || null),
                row.diameter_mm && row.length_mm ? `Ø${row.diameter_mm} × ${row.length_mm} mm` : null,
                row.gingival_height_mm ? `GH ${row.gingival_height_mm} mm` : null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={`saved-${idx}-${row.tooth}`} style={styles.implantCardSaved} testID={`ei-row-${idx}`}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="checkmark-circle" size={22} color="#43A047" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedTitle}>Implant #{idx + 1}</Text>
                      <Text style={styles.savedSummary} numberOfLines={2}>{summary || '(saved)'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={() => editImplantRow(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.iconBtn} testID={`ei-edit-${idx}`}>
                      <Ionicons name="create-outline" size={20} color="#1565C0" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeImplant(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.iconBtn} testID={`ei-delete-${idx}`}>
                      <Ionicons name="trash-outline" size={20} color="#C62828" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            // ─── Locked-collapsed: future row, save the prior one first ───
            if (isLockedAhead) {
              return (
                <View key={`locked-${idx}-${row.tooth}`} style={styles.implantCardLocked} testID={`ei-row-${idx}`}>
                  <Ionicons name="lock-closed-outline" size={18} color="#90A4AE" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lockedTitle}>Implant #{idx + 1}{row.tooth ? ` · FDI #${row.tooth}` : ''}</Text>
                    <Text style={styles.lockedHint}>Save the previous implant to unlock this card.</Text>
                  </View>
                </View>
              );
            }

            // ─── Expanded: editable form (only the first unsaved row) ───
            return (
              <View key={`exp-${idx}-${row.tooth}`} style={styles.implantCard} testID={`ei-row-${idx}`}>
                <View style={styles.implantHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.implantTitle}>Implant #{idx + 1}</Text>
                    {row.tooth ? <View style={styles.toothBadge}><Text style={styles.toothBadgeText}>FDI #{row.tooth}</Text></View> : null}
                  </View>
                  {isFullArchDone && (
                    <TouchableOpacity onPress={() => removeImplant(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ei-remove-${idx}`}>
                      <Ionicons name="trash-outline" size={20} color="#C62828" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* FDI single-select picker — full-arch only */}
                {isFullArchDone && (
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>FDI Position *</Text>
                    <FdiSinglePicker
                      value={row.tooth}
                      onPick={(t) => updateImplant(idx, 'tooth', t)}
                      testID={`ei-fdi-${idx}`}
                    />
                  </View>
                )}

                {/* Brand */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Brand</Text>
                  {row.manual_brand ? (
                    <View style={{ gap: 6 }}>
                      <TextInput
                        style={styles.input}
                        value={row.brand}
                        onChangeText={(t) => updateImplant(idx, 'brand', t)}
                        placeholder="Type implant brand"
                        testID={`ei-brand-manual-${idx}`}
                      />
                      <TouchableOpacity
                        onPress={() => updateImplant(idx, 'manual_brand', false as any)}
                        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        testID={`ei-brand-back-${idx}`}
                      >
                        <Ionicons name="chevron-back" size={14} color="#1565C0" />
                        <Text style={{ fontSize: 12, color: '#1565C0', fontWeight: '600' }}>Back to brand list</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <DropDown
                      value={row.brand}
                      options={brands}
                      onPick={(b) => updateImplant(idx, 'brand', b)}
                      placeholder="Select implant brand"
                      testID={`ei-brand-${idx}`}
                    />
                  )}
                </View>

                {/* System */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>System</Text>
                  {row.manual_brand ? (
                    <TextInput
                      style={styles.input}
                      value={row.system}
                      onChangeText={(t) => updateImplant(idx, 'system', t)}
                      placeholder="Type implant system"
                      testID={`ei-system-manual-${idx}`}
                    />
                  ) : (
                    <DropDown
                      value={row.system}
                      options={sysOpts}
                      onPick={(sys) => updateImplant(idx, 'system', sys)}
                      placeholder={row.brand ? 'Select implant system' : 'Pick brand first'}
                      disabled={!row.brand}
                      testID={`ei-system-${idx}`}
                    />
                  )}
                </View>

                {/* Auto-filled connection / platform chips */}
                {(row.connection_type || row.platform) ? (
                  <View style={styles.autoFillRow}>
                    {row.connection_type ? (
                      <View style={styles.autoFillChip}>
                        <Text style={styles.autoFillLabel}>Connection</Text>
                        <Text style={styles.autoFillValue}>{row.connection_type}</Text>
                      </View>
                    ) : null}
                    {row.platform ? (
                      <View style={styles.autoFillChip}>
                        <Text style={styles.autoFillLabel}>Platform</Text>
                        <Text style={styles.autoFillValue}>{row.platform}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Diameter (dropdown if library has data) */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Diameter (mm)</Text>
                  {diaOpts.length > 0 ? (
                    <DropDown
                      value={row.diameter_mm}
                      options={diaOpts}
                      onPick={(v) => updateImplant(idx, 'diameter_mm', v)}
                      placeholder="Select diameter"
                      testID={`ei-d-${idx}`}
                    />
                  ) : (
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={row.diameter_mm}
                      onChangeText={(t) => updateImplant(idx, 'diameter_mm', t)}
                      placeholder={row.system ? 'e.g. 4.2' : 'Pick system to see options'}
                      testID={`ei-d-${idx}`} />
                  )}
                </View>

                {/* Length (dropdown if library has data) */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Length (mm)</Text>
                  {lenOpts.length > 0 ? (
                    <DropDown
                      value={row.length_mm}
                      options={lenOpts}
                      onPick={(v) => updateImplant(idx, 'length_mm', v)}
                      placeholder="Select length"
                      testID={`ei-l-${idx}`}
                    />
                  ) : (
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={row.length_mm}
                      onChangeText={(t) => updateImplant(idx, 'length_mm', t)}
                      placeholder={row.system ? 'e.g. 11.5' : 'Pick system to see options'}
                      testID={`ei-l-${idx}`} />
                  )}
                </View>

                {/* Gingival Height */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Gingival Height (mm)</Text>
                  <TextInput style={styles.input} keyboardType="decimal-pad" value={row.gingival_height_mm}
                    onChangeText={(t) => updateImplant(idx, 'gingival_height_mm', t)}
                    placeholder="e.g. 2"
                    testID={`ei-gh-${idx}`} />
                </View>

                {/* ISQ — optional */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>ISQ Value <Text style={styles.optional}>(optional)</Text></Text>
                  <TextInput style={styles.input} keyboardType="decimal-pad" value={row.isq_value}
                    onChangeText={(t) => updateImplant(idx, 'isq_value', t)}
                    placeholder="e.g. 72"
                    maxLength={5}
                    testID={`ei-isq-${idx}`} />
                </View>

                {/* Present Prosthetic Component */}
                <Text style={styles.subSectionTitle}>Present Prosthetic Component</Text>
                <View style={styles.chipRow}>
                  {PRESENT_COMPONENTS.map(pc => (
                    <Chip key={pc} label={pc} active={row.present_component === pc}
                      onPress={() => updateImplant(idx, 'present_component', pc)}
                      testID={`ei-pc-${idx}-${pc.toLowerCase().replace(/\s+/g, '-')}`} />
                  ))}
                </View>
                {showGH && (
                  <View style={[styles.fieldContainer, styles.conditionalGap]}>
                    <Text style={styles.label}>Cuff / Gingival Height (mm) *</Text>
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={row.pc_gingival_height}
                      onChangeText={(t) => updateImplant(idx, 'pc_gingival_height', t)}
                      placeholder="e.g. 2"
                      testID={`ei-pcgh-${idx}`} />
                  </View>
                )}
                {showAngle && (
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Angle (°) *</Text>
                    <TextInput style={styles.input} keyboardType="decimal-pad" value={row.pc_angle}
                      onChangeText={(t) => updateImplant(idx, 'pc_angle', t)}
                      placeholder="0 / 17 / 30"
                      testID={`ei-pcang-${idx}`} />
                  </View>
                )}

                {/* Surgery date — calendar picker (web HTML-native, mobile fallback) */}
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Surgery Date</Text>
                  <SurgeryDatePicker
                    value={row.surgery_date}
                    onChange={(d) => updateImplant(idx, 'surgery_date', d)}
                    testID={`ei-surg-date-${idx}`}
                  />
                </View>
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Original Surgeon</Text>
                  <TextInput style={styles.input} value={row.original_surgeon}
                    onChangeText={(t) => updateImplant(idx, 'original_surgeon', t)}
                    placeholder="e.g. Dr. Patel"
                    testID={`ei-surg-name-${idx}`} />
                </View>
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Notes</Text>
                  <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                    multiline value={row.notes}
                    onChangeText={(t) => updateImplant(idx, 'notes', t)}
                    placeholder="Any clinical observations…"
                    testID={`ei-notes-${idx}`} />
                </View>

                {/* Per-implant IOPA — non-full-arch only */}
                {!isFullArchDone && (
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>IOPA Radiograph</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndUpload('iopa', idx)}
                      disabled={uploadingIdx === idx}
                      testID={`ei-iopa-${idx}`}>
                      {uploadingIdx === idx
                        ? <ActivityIndicator size="small" color="#1565C0" />
                        : <><Ionicons name="cloud-upload-outline" size={18} color="#1565C0" /><Text style={styles.uploadText}>{row.iopa_url ? 'Re-upload IOPA' : 'Upload IOPA'}</Text></>}
                    </TouchableOpacity>
                    {row.iopa_url ? <Text style={styles.uploadedHint}>✓ IOPA uploaded</Text> : null}
                  </View>
                )}

                {/* Save Implant button — collapses card on success */}
                <TouchableOpacity
                  style={styles.saveImplantBtn}
                  onPress={() => saveImplantRow(idx)}
                  testID={`ei-save-implant-${idx}`}
                >
                  <Ionicons name="save-outline" size={18} color="#FFF" />
                  <Text style={styles.saveImplantText}>Save Implant</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Add another only for full-arch (non-full-arch is FDI-driven) */}
          {isFullArchDone && (
            <TouchableOpacity style={styles.addBtn} onPress={addImplant} testID="ei-add-implant">
              <Ionicons name="add-circle-outline" size={20} color="#1565C0" />
              <Text style={styles.addBtnText}>Add another implant</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── Prosthetic History ─── */}
      {originalProcedure && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prosthetic History</Text>
          <Text style={styles.label}>Was Prosthesis Placed?</Text>
          <View style={styles.yesNoRow}>
            <TouchableOpacity
              style={[styles.yesNoBtn, hadProsthesis === true && styles.yesActive]}
              onPress={() => setHadProsthesis(true)}
              testID="ei-prosthesis-yes"
            >
              <Text style={[styles.yesNoText, hadProsthesis === true && styles.yesNoTextActive]}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, hadProsthesis === false && styles.noActive]}
              onPress={() => { setHadProsthesis(false); setProsthesisStage(''); setProsthesisType(''); setProsthesisMaterial(''); }}
              testID="ei-prosthesis-no"
            >
              <Text style={[styles.yesNoText, hadProsthesis === false && styles.yesNoTextActive]}>No</Text>
            </TouchableOpacity>
          </View>

          {hadProsthesis === true && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.subSectionTitle}>Type of Prosthesis</Text>
              <View style={styles.chipRow}>
                <Chip label="Temporary" active={prosthesisStage === 'temporary'}
                  onPress={() => {
                    setProsthesisStage('temporary');
                    const def = getProsthesisDefaults(originalProcedure, 'temporary');
                    if (!prosthesisType) setProsthesisType(def.type);
                    if (!prosthesisMaterial) setProsthesisMaterial(def.material);
                  }} testID="ei-stage-temp" />
                <Chip label="Final" active={prosthesisStage === 'final'}
                  onPress={() => {
                    setProsthesisStage('final');
                    const def = getProsthesisDefaults(originalProcedure, 'final');
                    if (!prosthesisType) setProsthesisType(def.type);
                    if (!prosthesisMaterial) setProsthesisMaterial(def.material);
                  }} testID="ei-stage-final" />
              </View>
              {prosthesisStage ? (
                <View style={{ marginTop: 16 }}>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Type</Text>
                    <TextInput style={styles.input} value={prosthesisType}
                      onChangeText={setProsthesisType}
                      placeholder="e.g. PFM Crown"
                      testID="ei-pros-type" />
                    <Text style={styles.helperHint}>Pre-filled based on the original procedure type. Edit if needed.</Text>
                  </View>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Material</Text>
                    <TextInput style={styles.input} value={prosthesisMaterial}
                      onChangeText={setProsthesisMaterial}
                      placeholder="e.g. Zirconia"
                      testID="ei-pros-mat" />
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* ─── OPG (full-arch only) ─── */}
      {originalProcedure && isFullArchDone && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Radiograph (OPG)</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickAndUpload('opg')}
            disabled={uploadingIdx === 'opg'}
            testID="ei-opg-upload">
            {uploadingIdx === 'opg'
              ? <ActivityIndicator size="small" color="#1565C0" />
              : <><Ionicons name="cloud-upload-outline" size={18} color="#1565C0" /><Text style={styles.uploadText}>{opgUrl ? 'Re-upload OPG' : 'Upload OPG'}</Text></>}
          </TouchableOpacity>
          {opgUrl ? <Text style={styles.uploadedHint}>✓ OPG uploaded</Text> : null}
        </View>
      )}

      {/* ─── Action buttons (stacked, never clip) ─── */}
      {originalProcedure && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtnPrimary, submitting && { opacity: 0.6 }]}
            onPress={() => submit('phase4_step1')}
            disabled={submitting}
            testID="ei-move-phase4"
          >
            {submitting
              ? <ActivityIndicator color="#FFF" />
              : <><Ionicons name="arrow-forward-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText}>Move to Phase 4 Step 1</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, submitting && { opacity: 0.6 }]}
            onPress={() => submit('phase3')}
            disabled={submitting}
            testID="ei-move-phase3"
          >
            <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>Move to Phase 3</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnDraft, submitting && { opacity: 0.6 }]}
            onPress={() => submit('draft')}
            disabled={submitting}
            testID="ei-save-btn"
          >
            <Ionicons name="save-outline" size={20} color="#37474F" />
            <Text style={styles.actionBtnDraftText}>Save as Draft</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── DropDown component (matches new-procedure ScrollDropdown UX) ───
function DropDown({ value, options, onPick, placeholder, disabled, testID }: {
  value: string; options: string[]; onPick: (v: string) => void;
  placeholder?: string; disabled?: boolean; testID?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={[styles.dropdown, disabled && styles.dropdownDisabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
        /* @ts-ignore */ data-testid={testID}
      >
        <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>{value || placeholder || 'Select…'}</Text>
        <Ionicons name="chevron-down" size={20} color="#1565C0" />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{placeholder || 'Select'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.length === 0 ? (
                <Text style={styles.modalEmpty}>No options available</Text>
              ) : options.map((o, i) => (
                <TouchableOpacity key={i}
                  style={[styles.modalRow, value === o && styles.modalRowActive]}
                  onPress={() => { onPick(o); setOpen(false); }}
                  testID={`${testID}-opt-${o}`}
                >
                  <Text style={[styles.modalRowText, value === o && styles.modalRowTextActive]}>{o}</Text>
                  {value === o ? <Ionicons name="checkmark-circle" size={20} color="#1565C0" /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Surgery Date picker (native HTML <input type="date"> on web,
// inline calendar on native — past dates allowed) ───
function SurgeryDatePicker({ value, onChange, testID }: { value: string; onChange: (date: string) => void; testID?: string }) {
  // On web: render the browser-native HTML date input directly. RN-Web
  // forwards unknown props as DOM attributes via createElement, so we use a
  // small platform-aware wrapper.
  if (Platform.OS === 'web') {
    return (
      // @ts-ignore — dom element for web platform only.
      <input
        type="date"
        value={value || ''}
        onChange={(e: any) => onChange(e.target.value)}
        data-testid={testID}
        style={{
          borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10,
          padding: 12, fontSize: 15, backgroundColor: '#F8FAFC', color: '#1A1A1A',
          width: '100%', boxSizing: 'border-box', borderStyle: 'solid',
          outline: 'none', minHeight: 48,
        } as any}
      />
    );
  }
  return <NativeCalendarTrigger value={value} onChange={onChange} testID={testID} />;
}

function NativeCalendarTrigger({ value, onChange, testID }: { value: string; onChange: (date: string) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const select = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${m}-${dd}`);
    setOpen(false);
  };
  return (
    <View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)} testID={testID} /* @ts-ignore */ data-testid={testID}>
        <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>{value || 'Select Date'}</Text>
        <Ionicons name="calendar-outline" size={20} color="#1565C0" />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); }}>
                <Ionicons name="chevron-back" size={22} color="#1565C0" />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0D47A1' }}>{monthNames[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); }}>
                <Ionicons name="chevron-forward" size={22} color="#1565C0" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              {dayNames.map(d => <Text key={d} style={{ fontSize: 11, fontWeight: '700', color: '#90A4AE', width: 36, textAlign: 'center' }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => (
                <TouchableOpacity key={i}
                  disabled={!d}
                  style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => d && select(d)}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: d ? '#1A1A1A' : 'transparent' }}>{d || ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Single-tooth FDI picker (full-arch case — modal-wrapped chart) ───
function FdiSinglePicker({ value, onPick, testID }: { value: string; onPick: (t: string) => void; testID: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)} testID={testID} /* @ts-ignore */ data-testid={testID}>
        <Text style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}>
          {value ? `Tooth #${value}` : 'Pick tooth from FDI chart'}
        </Text>
        <Ionicons name="grid-outline" size={20} color="#1565C0" />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.modalCard, { padding: 18 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Pick a tooth</Text>
            <FdiAnatomicalChart
              mode="single"
              value={value}
              onChange={(t) => { onPick(t as string); setOpen(false); }}
              selectedLabel="Selected"
              testIDPrefix={`${testID}-tooth`}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles (mirrored from /app/(tabs)/new-procedure.tsx for parity) ───
const styles = StyleSheet.create({
  // Section / typography parity
  section: { backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 18, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#E8EDF5' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 14, letterSpacing: 0.3 },
  subSectionTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0', marginTop: 14, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: '#E3F2FD' },
  fieldContainer: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6, letterSpacing: 0.2 },
  optional: { fontSize: 11, fontWeight: '500', color: '#90A4AE', fontStyle: 'italic' },
  helperText: { fontSize: 12, color: '#546E7A', marginBottom: 10, fontStyle: 'italic' },
  fdiSummary: { fontSize: 13, color: '#1565C0', fontWeight: '700', marginTop: 10, textAlign: 'center', letterSpacing: 0.3 },

  // Header banner
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#E3F2FD', borderRadius: 14, borderWidth: 1.5, borderColor: '#BBDEFB', marginHorizontal: 16, marginBottom: 16 },
  headerText: { fontSize: 13, color: '#0D47A1', flex: 1, lineHeight: 18, fontWeight: '500' },

  // Inputs
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#F8FAFC', color: '#1A1A1A' },

  // Dropdown (matches new-procedure)
  dropdown: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', minHeight: 48 },
  dropdownDisabled: { opacity: 0.5 },
  dropdownText: { fontSize: 15, color: '#333', flex: 1 },
  dropdownPlaceholder: { color: '#90A4AE' },

  // Chip row
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },

  // Yes / No buttons
  yesNoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  yesNoBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#FFF', minWidth: 80, alignItems: 'center' },
  yesActive: { backgroundColor: '#43A047', borderColor: '#43A047' },
  noActive: { backgroundColor: '#90A4AE', borderColor: '#90A4AE' },
  yesNoText: { fontSize: 14, color: '#666', fontWeight: '600' },
  yesNoTextActive: { color: '#FFF' },

  // Implant card (spacious — one field per row)
  implantCard: { backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1.5, borderColor: '#D0DCE8', padding: 16, marginBottom: 16 },
  implantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E3F2FD' },
  implantTitle: { fontSize: 15, fontWeight: '700', color: '#0D47A1' },
  toothBadge: { backgroundColor: '#1565C0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  toothBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  // Collapsed-saved card (after Save Implant)
  implantCardSaved: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 14, borderWidth: 1.5, borderColor: '#A5D6A7', padding: 14, marginBottom: 12 },
  savedTitle: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  savedSummary: { fontSize: 12, color: '#2E7D32', marginTop: 2 },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E7EE' },

  // Locked-collapsed card (sequential lock)
  implantCardLocked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECEFF1', borderRadius: 14, borderWidth: 1.5, borderColor: '#CFD8DC', padding: 14, marginBottom: 12, opacity: 0.85 },
  lockedTitle: { fontSize: 14, fontWeight: '700', color: '#546E7A' },
  lockedHint: { fontSize: 11, color: '#90A4AE', marginTop: 2, fontStyle: 'italic' },

  // Save Implant button
  saveImplantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#43A047', borderRadius: 12, padding: 14, marginTop: 10, shadowColor: '#43A047', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  saveImplantText: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },

  // Spacing utilities
  conditionalGap: { marginTop: 16 },
  helperHint: { fontSize: 11, color: '#78909C', marginTop: 4, fontStyle: 'italic' },

  // Auto-fill connection / platform display
  autoFillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  autoFillChip: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#A5D6A7', flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoFillLabel: { fontSize: 11, fontWeight: '600', color: '#2E7D32' },
  autoFillValue: { fontSize: 13, fontWeight: '800', color: '#1B5E20' },

  // Add implant button (full-arch)
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' as any, borderColor: '#1565C0', backgroundColor: '#F8FAFC', marginTop: 4 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },

  // Upload button
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed' as any, borderColor: '#1565C0', backgroundColor: '#F8FAFC' },
  uploadText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  uploadedHint: { fontSize: 12, color: '#2E7D32', marginTop: 6, fontWeight: '700' },

  // Actions (stacked vertically — never clip on narrow screens)
  actionsContainer: { paddingHorizontal: 16, marginBottom: 24, gap: 10 },
  actionBtnPrimary: { flexDirection: 'row', backgroundColor: '#1565C0', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  actionBtnSecondary: { flexDirection: 'row', backgroundColor: '#43A047', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#43A047', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.20, shadowRadius: 8, elevation: 4 },
  actionBtnDraft: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#CFD8DC' },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  actionBtnDraftText: { color: '#37474F', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0D47A1', marginBottom: 12, letterSpacing: 0.3 },
  modalRow: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalRowActive: { backgroundColor: '#E3F2FD' },
  modalRowText: { fontSize: 15, color: '#333' },
  modalRowTextActive: { color: '#1565C0', fontWeight: '700' },
  modalEmpty: { padding: 16, color: '#90A4AE', fontStyle: 'italic', textAlign: 'center' },
});
