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

import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Alert,
  StyleSheet, Modal, Pressable, ActivityIndicator, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api, { getAuthFileUrl } from '../utils/api';
import FdiAnatomicalChart from './FdiAnatomicalChart';
import { useAuth } from '../contexts/AuthContext';

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
const PROSTHESIS_TYPE_OTHER = 'Other (manual entry)';

// iter-218: institution-curated prosthesis type options keyed by procedure
// group + stage. Lists supplied directly by the implant-incharge so the
// downstream Lab-Slip / Case-Report renderers stay aligned.
const TEMP_SINGLE_OPTIONS = [
  'PMMA Crown with Temporary Abutment',
  'PMMA Crown with Ti-Base',
  PROSTHESIS_TYPE_OTHER,
];
const TEMP_MULTIPLE_OPTIONS = [
  'Multiple PMMA Crown with Temporary Abutment',
  'Multiple PMMA Crown with Ti-Base',
  'Temporary Bridge',
  'Implant Supported Overdenture',
  PROSTHESIS_TYPE_OTHER,
];
const TEMP_FULL_ARCH_OPTIONS = [
  'Full Arch Temporary Prostheses with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prostheses with Multiunit Abutments and Temporary Cylinders',
  'Temporary PMMA CAD Prostheses on Ti-Base',
  PROSTHESIS_TYPE_OTHER,
];
const FINAL_SINGLE_OPTIONS = [
  'Cement-retained crown, metal',
  'Cement Retained Crown Porcelain fused to Metal',
  'Cement Retained Crown Zirconia',
  'Cement Retained Crown Lithium Disilicate',
  'Screw Retained Crown Metal',
  'Screw Retained Crown Porcelain fused to Metal',
  'Screw Retained Crown Zirconia',
  'Screw Retained Crown Lithium Disilicate',
  'Zirconia Abutment Ti Base',
  'Custom Abutment',
  PROSTHESIS_TYPE_OTHER,
];
const FINAL_MULTIPLE_OPTIONS = [
  'Cement Retained Bridge Metal',
  'Cement Retained Bridge Porcelain fused to Metal',
  'Cement Retained Bridge Zirconia',
  'Cement Retained Bridge Lithium Disilicate',
  'Screw Retained Bridge Metal',
  'Screw Retained Bridge Porcelain Fused to Metal',
  'Screw Retained Bridge Zirconia',
  'Screw Retained Bridge Lithium Disilicate',
  'Overdenture with Attachment',
  'Malo Prosthesis with MUA',
  'Zirconia Abutment Ti Base',
  'Screw retained multiple Crowns Metal',
  'Screw retained multiple crowns Porcelain fused to metal',
  'Screw retained multiple crowns zirconia',
  'Screw retained multiple crowns lithium disilicate',
  'Cement retained multiple crowns zirconia',
  'Cement retained multiple crowns lithium disilicates',
  'Implant supported overdenture',
  PROSTHESIS_TYPE_OTHER,
];
const FINAL_FULL_ARCH_OPTIONS = [
  'Implant Prosthesis - Full Arch – Co-Cr Framework',
  'Full Arch – Porcelain Fused to Metal Prosthesis',
  'Full Arch – Co-Cr Framework - Zirconia Prosthesis',
  'Full Per Arch – Titanium Framework - Zirconia Prosthesis',
  'Full Arch - Peek and Zirconia Ti Base',
  PROSTHESIS_TYPE_OTHER,
];

// iter-219: For PET / Immediate Implant / GBR / Guided Surgery the FDI chart
// can have 1 OR multiple implants. The option list must pivot on the actual
// implant count, not the procedure label alone.
const COUNT_DRIVEN_PROCEDURES = new Set([
  'Immediate Implant',
  'Partial Extraction Therapy',
  'Implant Placement with Guided Bone Regeneration',
  'Guided Surgery',
]);

function getProsthesisTypeOptions(originalProcedure: string, stage: 'temporary' | 'final', implantCount: number = 0): string[] {
  // Full arch beats everything.
  if (FULL_ARCH_PROCEDURES.has(originalProcedure)) {
    return stage === 'temporary' ? TEMP_FULL_ARCH_OPTIONS : FINAL_FULL_ARCH_OPTIONS;
  }
  // Count-driven procedures pivot on the FDI selection size.
  if (COUNT_DRIVEN_PROCEDURES.has(originalProcedure)) {
    const isMulti = implantCount > 1;
    if (stage === 'temporary') return isMulti ? TEMP_MULTIPLE_OPTIONS : TEMP_SINGLE_OPTIONS;
    return isMulti ? FINAL_MULTIPLE_OPTIONS : FINAL_SINGLE_OPTIONS;
  }
  // Explicit single / multiple conventional.
  if (stage === 'temporary') {
    if (SINGLE_PROCEDURES.has(originalProcedure)) return TEMP_SINGLE_OPTIONS;
    if (MULTIPLE_PROCEDURES.has(originalProcedure)) return TEMP_MULTIPLE_OPTIONS;
  } else {
    if (SINGLE_PROCEDURES.has(originalProcedure)) return FINAL_SINGLE_OPTIONS;
    if (MULTIPLE_PROCEDURES.has(originalProcedure)) return FINAL_MULTIPLE_OPTIONS;
  }
  return [PROSTHESIS_TYPE_OTHER];
}

function getProsthesisDefaults(originalProcedure: string, stage: 'temporary' | 'final', implantCount: number = 0): { type: string; material: string } {
  // Default Type = first non-"Other" option from the institution-curated list.
  const opts = getProsthesisTypeOptions(originalProcedure, stage, implantCount).filter(o => o !== PROSTHESIS_TYPE_OTHER);
  const type = opts[0] || '';
  // Material field removed in iter-219 — empty string flows as null to backend.
  return { type, material: '' };
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
  /** iter-222: When set, the section hydrates its state from the persisted
   * draft procedure record and switches into "resume" mode (no Save-as-Draft
   * button — only Move to Phase 3 / Move to Phase 4 Step 1). The draft's
   * `id` is also sent back to the backend on submit so the existing record
   * is updated in place rather than a new one being created. */
  draft?: any | null;
};

// ── Library system shape (from /api/implant-library/systems) ──
type LibSystem = {
  brand: string; system: string;
  diameters: number[]; lengths: number[];
  count: number;
  indication?: string;
};

export default function ExistingImplantSection({ patient, validatePatient, draft }: Props) {
  const isDraftResume = !!draft;
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
  // iter-217: brands & systems are unioned from BOTH /implant-library/systems
  // and /implant-catalog so the dropdown is always populated even when one
  // source is partially seeded on production. Diameter / length options are
  // also pulled from whichever source has them.
  const brands = useMemo(() => {
    const libBrands = library.map(s => s.brand).filter(Boolean);
    const catBrands = catalog.map((s: any) => s.brand).filter(Boolean);
    const merged = Array.from(new Set([...libBrands, ...catBrands])).sort();
    return [...merged, OTHER];
  }, [library, catalog]);
  const systemsForBrand = (brand: string) => {
    if (!brand || brand === OTHER) return [];
    const libSys = library.filter(s => s.brand === brand).map(s => s.system);
    const catSys = catalog.filter((s: any) => s.brand === brand).map((s: any) => s.name);
    return Array.from(new Set([...libSys, ...catSys].filter(Boolean))).sort();
  };
  const lookupLibSystem = (brand: string, system: string) => library.find(s => s.brand === brand && s.system === system);
  const lookupCatalog = (brand: string, system: string) => catalog.find((s: any) => s.brand === brand && s.name === system);
  // Diameter / length option union — library first, fallback to catalog.implant.{diameters_mm,lengths_mm}.
  const diametersForSystem = (brand: string, system: string): string[] => {
    if (!brand || !system) return [];
    const fromLib = lookupLibSystem(brand, system)?.diameters || [];
    const cat = lookupCatalog(brand, system);
    const fromCat: number[] = (cat as any)?.implant?.diameters_mm || (cat as any)?.diameters_mm || [];
    const merged = Array.from(new Set([...fromLib, ...fromCat])).sort((a: any, b: any) => Number(a) - Number(b));
    return merged.map(v => String(v));
  };
  const lengthsForSystem = (brand: string, system: string): string[] => {
    if (!brand || !system) return [];
    const fromLib = lookupLibSystem(brand, system)?.lengths || [];
    const cat = lookupCatalog(brand, system);
    const fromCat: number[] = (cat as any)?.implant?.lengths_mm || (cat as any)?.lengths_mm || [];
    const merged = Array.from(new Set([...fromLib, ...fromCat])).sort((a: any, b: any) => Number(a) - Number(b));
    return merged.map(v => String(v));
  };

  // Form state
  const [originalProcedure, setOriginalProcedure] = useState('');
  const isFullArchDone = FULL_ARCH_DONE.has(originalProcedure);

  // Multi-select FDI for non-full-arch (drives implant cards 1:1).
  const [missingTeeth, setMissingTeeth] = useState<string[]>([]);
  const [implants, setImplants] = useState<ImplantRow[]>([blankImplant()]);

  const [hadProsthesis, setHadProsthesis] = useState<boolean | null>(null);
  const [prosthesisStage, setProsthesisStage] = useState<'' | 'temporary' | 'final'>('');
  const [prosthesisType, setProsthesisType] = useState('');
  // iter-218: switch the Type dropdown into a free-text input when user picks
  // "Other (manual entry)" so legacy / one-off prostheses can be captured too.
  const [manualProsthesisType, setManualProsthesisType] = useState(false);
  const [prosthesisMaterial, setProsthesisMaterial] = useState('');

  const [opgUrl, setOpgUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | string | null>(null);

  // iter-229: role-aware button copy. Implant in-charge keeps the original
  // "Move to …" wording because their submission auto-approves Phase 1.
  // Students and supervisors send the case for the standard dual-review,
  // so the buttons explicitly say "Send for Approval and Move to …".
  const { user } = useAuth();
  const needsApproval = user?.role !== 'implant_incharge';
  const labelPhase4 = needsApproval
    ? 'Send for Approval and Move to Phase 4 Step 1'
    : 'Move to Phase 4 Step 1';
  const labelPhase3 = needsApproval
    ? 'Send for Approval and Move to Phase 3'
    : 'Move to Phase 3';

  // iter-222: hydrate from a saved draft on mount. Runs once per fresh draft id.
  const hydratedDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (!draft || !draft.id) return;
    if (hydratedDraftId.current === draft.id) return;
    hydratedDraftId.current = draft.id;
    const op = draft.original_procedure_type || draft.implant_procedure_type || '';
    setOriginalProcedure(op);
    const isFA = FULL_ARCH_DONE.has(op);
    const savedImpls: any[] = Array.isArray(draft.existing_implants) ? draft.existing_implants : [];
    const rows: ImplantRow[] = savedImpls.map((r: any) => ({
      tooth: r.tooth || '',
      brand: r.brand || '',
      system: r.system || '',
      connection_type: r.connection_type || '',
      platform: r.platform || '',
      diameter_mm: r.diameter_mm != null ? String(r.diameter_mm) : '',
      length_mm: r.length_mm != null ? String(r.length_mm) : '',
      gingival_height_mm: r.gingival_height_mm != null ? String(r.gingival_height_mm) : '',
      present_component: (r.present_component || 'None') as PresentComponent,
      pc_gingival_height: r.present_component_gh != null ? String(r.present_component_gh) : '',
      pc_angle: r.present_component_angle != null ? String(r.present_component_angle) : '',
      surgery_date: r.surgery_date || '',
      original_surgeon: r.original_surgeon || '',
      notes: r.notes || '',
      iopa_url: r.iopa_url || '',
      isq_value: r.isq_value != null ? String(r.isq_value) : '',
      manual_brand: false,
      saved: true, // collapse all on resume so the user sees a clean summary
    }));
    if (rows.length > 0) setImplants(rows);
    if (!isFA) setMissingTeeth(rows.map(r => r.tooth).filter(Boolean));
    const ph = draft.prosthesis_history || {};
    if (ph.had_prosthesis === true) {
      setHadProsthesis(true);
      const stage = (ph.prosthesis_stage || '') as '' | 'temporary' | 'final';
      setProsthesisStage(stage);
      setProsthesisType(ph.prosthesis_type || '');
      setProsthesisMaterial(ph.material || '');
    } else if (ph.had_prosthesis === false) {
      setHadProsthesis(false);
    }
    const rg = draft.radiographs || {};
    if (rg.opg_url) setOpgUrl(rg.opg_url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // ── Reset on procedure-type change ──
  useEffect(() => {
    if (!originalProcedure) return;
    // iter-222: don't blow away state we just hydrated from a saved draft.
    if (draft?.id && hydratedDraftId.current === draft.id) return;
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
    // iter-222: preserve hydrated implant data — rebuild from byTooth map so
    // existing rows with the same tooth ID keep their captured details.
    setImplants(prev => {
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

  // iter-220: chooser sheet selecting which source the user wants to upload
  // from (image library / camera / PDF). `kind` is which target slot
  // (per-implant IOPA or case-level OPG); `idx` is the implant-row index
  // when kind === 'iopa'.
  const [picker, setPicker] = useState<{ kind: 'iopa' | 'opg'; idx?: number } | null>(null);
  // iter-222: deferred-launch state — the canonical RN fix for the iOS Modal
  // ↔ system picker race. The chooser Modal closes, its `onDismiss` fires
  // AFTER the dismiss animation completes, and only then does the picker
  // launch. setTimeout fallback covers Android (onDismiss is iOS-only).
  const [pendingPick, setPendingPick] = useState<{ source: 'library' | 'camera' | 'pdf'; target: { kind: 'iopa' | 'opg'; idx?: number } } | null>(null);

  const runPendingPick = () => {
    const job = pendingPick;
    if (!job) return;
    setPendingPick(null);
    if (job.source === 'library') pickFromLibraryInternal(job.target);
    else if (job.source === 'camera') takePhotoInternal(job.target);
    else if (job.source === 'pdf') pickPdfInternal(job.target);
  };

  // iter-222: Android / web fallback — `onDismiss` is iOS-only on RN's Modal.
  // After the chooser Modal closes on these platforms, manually fire the
  // pending pick after the typical fade duration.
  useEffect(() => {
    if (Platform.OS === 'ios') return; // iOS handled by onDismiss
    if (picker === null && pendingPick !== null) {
      const t = setTimeout(() => runPendingPick(), 350);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, pendingPick]);

  // Generic upload of a {uri,name,type} blob to /uploads/media-temp.
  const uploadBlob = async (uri: string, name: string, type: string, target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    try {
      setUploadingIdx(target.kind === 'iopa' ? (target.idx ?? -1) : 'opg');
      const fd = new FormData();
      if (Platform.OS === 'web') {
        // RN-Web FormData expects a real File / Blob to send the binary.
        const resp = await fetch(uri);
        const blob = await resp.blob();
        fd.append('file', new File([blob], name, { type }));
      } else {
        // @ts-ignore RN FormData blob shape on native.
        fd.append('file', { uri, name, type });
      }
      const up = await api.post('/uploads/media-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const filename = up.data?.filename;
      if (!filename) throw new Error('Upload returned no filename');
      if (target.kind === 'iopa' && typeof target.idx === 'number') updateImplant(target.idx, 'iopa_url', filename);
      else setOpgUrl(filename);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || e?.message || 'Could not upload the file.');
    } finally {
      setUploadingIdx(null);
    }
  };

  // iter-222: Entry points queue the pending action then close the chooser
  // Modal. The internal launchers fire via onDismiss (iOS) or setTimeout
  // fallback (Android / web), guaranteeing the Modal has fully animated out
  // before the system picker is invoked.
  const pickFromLibrary = (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    setPendingPick({ source: 'library', target });
    setPicker(null);
  };
  const takePhoto = (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    setPendingPick({ source: 'camera', target });
    setPicker(null);
  };
  const pickPdf = (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    setPendingPick({ source: 'pdf', target });
    setPicker(null);
  };

  const pickFromLibraryInternal = async (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Please grant photo library access.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      await uploadBlob(a.uri, a.fileName || `${target.kind}-${Date.now()}.jpg`, a.mimeType || 'image/jpeg', target);
    } catch (e: any) {
      Alert.alert('Could not pick image', e?.message || 'Please try again.');
    }
  };

  const takePhotoInternal = async (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Please grant camera access.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      await uploadBlob(a.uri, a.fileName || `${target.kind}-${Date.now()}.jpg`, a.mimeType || 'image/jpeg', target);
    } catch (e: any) {
      Alert.alert('Could not take photo', e?.message || 'Please try again.');
    }
  };

  const pickPdfInternal = async (target: { kind: 'iopa' | 'opg'; idx?: number }) => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      await uploadBlob(a.uri, a.name || `${target.kind}-${Date.now()}.pdf`, a.mimeType || 'application/pdf', target);
    } catch (e: any) {
      Alert.alert('Could not pick PDF', e?.message || 'Please try again.');
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
      // iter-220: existing-implant cases are historical — surgery happened in
      // the past, so there's no "appointment" to schedule. Backend still wants
      // procedure_date/procedure_time, so default to today's date + 09:00 if
      // the operator hasn't already entered them in the patient form.
      const today = new Date().toISOString().slice(0, 10);
      const todayDate = patient.procedure_date || today;
      const todayTime = patient.procedure_time || '09:00';
      const payload: any = {
        // iter-222: when resuming a draft, ship the existing procedure_id so
        // the backend can update in place instead of creating a duplicate.
        procedure_id: draft?.id || undefined,
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
        procedure_date: todayDate,
        procedure_time: todayTime,
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
            const diaOpts = diametersForSystem(row.brand, row.system);
            const lenOpts = lengthsForSystem(row.brand, row.system);
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

                {/* Per-implant IOPA / CBCT — non-full-arch only */}
                {!isFullArchDone && (
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>IOPA Radiograph / CBCT</Text>
                    <TouchableOpacity style={styles.uploadBtn} onPress={() => setPicker({ kind: 'iopa', idx })}
                      disabled={uploadingIdx === idx}
                      testID={`ei-iopa-${idx}`}>
                      {uploadingIdx === idx
                        ? <ActivityIndicator size="small" color="#1565C0" />
                        : <><Ionicons name="cloud-upload-outline" size={18} color="#1565C0" /><Text style={styles.uploadText}>{row.iopa_url ? 'Re-upload' : 'Upload'}</Text></>}
                    </TouchableOpacity>
                    {row.iopa_url ? <RadiographThumb filename={row.iopa_url} testID={`ei-iopa-thumb-${idx}`} /> : null}
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
              onPress={() => { setHadProsthesis(false); setProsthesisStage(''); setProsthesisType(''); setProsthesisMaterial(''); setManualProsthesisType(false); }}
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
                    setManualProsthesisType(false);
                    const count = isFullArchDone ? implants.length : missingTeeth.length;
                    const def = getProsthesisDefaults(originalProcedure, 'temporary', count);
                    setProsthesisType(def.type);
                  }} testID="ei-stage-temp" />
                <Chip label="Final" active={prosthesisStage === 'final'}
                  onPress={() => {
                    setProsthesisStage('final');
                    setManualProsthesisType(false);
                    const count = isFullArchDone ? implants.length : missingTeeth.length;
                    const def = getProsthesisDefaults(originalProcedure, 'final', count);
                    setProsthesisType(def.type);
                  }} testID="ei-stage-final" />
              </View>
              {prosthesisStage ? (
                <View style={{ marginTop: 16 }}>
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>Type</Text>
                    {manualProsthesisType ? (
                      <View style={{ gap: 6 }}>
                        <TextInput style={styles.input} value={prosthesisType}
                          onChangeText={setProsthesisType}
                          placeholder="Type prosthesis name"
                          testID="ei-pros-type-manual" />
                        <TouchableOpacity
                          onPress={() => {
                            setManualProsthesisType(false);
                            const count = isFullArchDone ? implants.length : missingTeeth.length;
                            const def = getProsthesisDefaults(originalProcedure, prosthesisStage, count);
                            setProsthesisType(def.type);
                          }}
                          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          testID="ei-pros-type-back"
                        >
                          <Ionicons name="chevron-back" size={14} color="#1565C0" />
                          <Text style={{ fontSize: 12, color: '#1565C0', fontWeight: '600' }}>Back to options list</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <DropDown
                        value={prosthesisType}
                        options={getProsthesisTypeOptions(originalProcedure, prosthesisStage, isFullArchDone ? implants.length : missingTeeth.length)}
                        onPick={(v) => {
                          if (v === PROSTHESIS_TYPE_OTHER) {
                            setManualProsthesisType(true);
                            setProsthesisType('');
                          } else {
                            setProsthesisType(v);
                          }
                        }}
                        placeholder="Select prosthesis type"
                        testID="ei-pros-type" />
                    )}
                    <Text style={styles.helperHint}>Pre-filled based on the original procedure type & number of implants. Edit if needed.</Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* ─── OPG / CBCT (full-arch only) ─── */}
      {originalProcedure && isFullArchDone && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Radiograph (OPG / CBCT)</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={() => setPicker({ kind: 'opg' })}
            disabled={uploadingIdx === 'opg'}
            testID="ei-opg-upload">
            {uploadingIdx === 'opg'
              ? <ActivityIndicator size="small" color="#1565C0" />
              : <><Ionicons name="cloud-upload-outline" size={18} color="#1565C0" /><Text style={styles.uploadText}>{opgUrl ? 'Re-upload' : 'Upload'}</Text></>}
          </TouchableOpacity>
          {opgUrl ? <RadiographThumb filename={opgUrl} testID="ei-opg-thumb" /> : null}
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
              : <><Ionicons name="arrow-forward-circle" size={20} color="#FFF" /><Text style={styles.actionBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{labelPhase4}</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, submitting && { opacity: 0.6 }]}
            onPress={() => submit('phase3')}
            disabled={submitting}
            testID="ei-move-phase3"
          >
            <Ionicons name="arrow-forward-circle" size={20} color="#FFF" />
            <Text style={styles.actionBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{labelPhase3}</Text>
          </TouchableOpacity>
          {!isDraftResume && (
            <TouchableOpacity
              style={[styles.actionBtnDraft, submitting && { opacity: 0.6 }]}
              onPress={() => submit('draft')}
              disabled={submitting}
              testID="ei-save-btn"
            >
              <Ionicons name="save-outline" size={20} color="#37474F" />
              <Text style={styles.actionBtnDraftText}>Save Draft</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* iter-220: Upload-source chooser sheet (Image library / Camera / PDF) */}
      <Modal
        transparent
        visible={picker !== null}
        animationType="fade"
        onRequestClose={() => { setPicker(null); setPendingPick(null); }}
        onDismiss={() => {
          // iter-222: iOS-only — fires AFTER the dismiss animation completes,
          // so the system picker can safely launch without the Modal-stacking
          // race we saw in iter-220/221.
          runPendingPick();
        }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Upload Radiograph</Text>
            <TouchableOpacity
              style={styles.chooserRow}
              onPress={() => picker && pickFromLibrary(picker)}
              testID="ei-upload-image"
            >
              <Ionicons name="image-outline" size={22} color="#1565C0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.chooserTitle}>Choose Image from Library</Text>
                <Text style={styles.chooserHint}>JPG / PNG / HEIC from your photo library</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#90A4AE" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chooserRow}
              onPress={() => picker && takePhoto(picker)}
              testID="ei-upload-camera"
            >
              <Ionicons name="camera-outline" size={22} color="#1565C0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.chooserTitle}>Take Photo</Text>
                <Text style={styles.chooserHint}>Capture a fresh photo with the camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#90A4AE" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chooserRow, { borderBottomWidth: 0 }]}
              onPress={() => picker && pickPdf(picker)}
              testID="ei-upload-pdf"
            >
              <Ionicons name="document-outline" size={22} color="#1565C0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.chooserTitle}>Upload PDF</Text>
                <Text style={styles.chooserHint}>Select a PDF radiograph report</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#90A4AE" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPicker(null)} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 8 }}>
              <Text style={{ color: '#90A4AE', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

// iter-225: tiny thumbnail + view-action helper for an uploaded radiograph.
// Async-resolves the auth URL, shows an image preview (or PDF doc icon) +
// "View" link that opens in browser on web / shares on native.
function RadiographThumb({ filename, testID }: { filename: string; testID?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAuthFileUrl(filename).then(u => { if (!cancelled) setUri(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [filename]);
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    if (!uri) return;
    if (Platform.OS === 'web') window.open(uri, '_blank');
    else {
      // RN doesn't have a built-in viewer; rely on Linking
      try {
        const { Linking } = await import('react-native');
        await Linking.openURL(uri);
      } catch { /* noop */ }
    }
  };
  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 10, backgroundColor: '#F1F8E9', borderRadius: 10, borderWidth: 1, borderColor: '#C5E1A5' }}
      testID={testID}
      /* @ts-ignore */ data-testid={testID}
    >
      {isPdf || !uri ? (
        <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#A5D6A7', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isPdf ? 'document-text' : 'image-outline'} size={28} color="#2E7D32" />
        </View>
      ) : (
        <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#FFF' }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B5E20' }} numberOfLines={1}>✓ Uploaded</Text>
        <Text style={{ fontSize: 11, color: '#558B2F' }} numberOfLines={1}>{filename}</Text>
        <Text style={{ fontSize: 11, color: '#1565C0', fontWeight: '700', marginTop: 2 }}>Tap to view</Text>
      </View>
      <Ionicons name="open-outline" size={20} color="#1565C0" />
    </TouchableOpacity>
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
  // iter-229: bumped min-height + textAlign:center so longer labels like
  // "Send for Approval and Move to Phase 4 Step 1" wrap to 2 lines cleanly
  // without breaking the button's vertical rhythm. text-shrink (flexShrink:1)
  // keeps the label inside the icon → text → spacer flex layout.
  actionBtnPrimary: { flexDirection: 'row', backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  actionBtnSecondary: { flexDirection: 'row', backgroundColor: '#43A047', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#43A047', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.20, shadowRadius: 8, elevation: 4 },
  actionBtnDraft: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#CFD8DC' },
  actionBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center', flexShrink: 1 },
  actionBtnDraftText: { color: '#37474F', fontSize: 15, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center', flexShrink: 1 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0D47A1', marginBottom: 12, letterSpacing: 0.3 },

  // Upload-source chooser (iter-220)
  chooserRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  chooserTitle: { fontSize: 15, fontWeight: '700', color: '#0D47A1' },
  chooserHint: { fontSize: 12, color: '#78909C', marginTop: 2 },
  modalRow: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalRowActive: { backgroundColor: '#E3F2FD' },
  modalRowText: { fontSize: 15, color: '#333' },
  modalRowTextActive: { color: '#1565C0', fontWeight: '700' },
  modalEmpty: { padding: 16, color: '#90A4AE', fontStyle: 'italic', textAlign: 'center' },
});
