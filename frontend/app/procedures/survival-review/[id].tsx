/**
 * iter-344 — Implant Survival Review — Phase 2 → Phase 3 gating step
 *
 * Complete UX refresh:
 *   - Reason for failure is a DROPDOWN; Other → free-text (100-word cap).
 *   - New: "Was the Implant Site Changed?" → FDI chart limited to the
 *     same quadrant as the failed tooth (per user spec 1c). Selecting a
 *     new tooth carries forward to Phase 3 / Phase 4 (backend updates
 *     the implant record's tooth_number).
 *   - Replacement implant system is a dropdown of all 71 catalog systems
 *     (`GET /implant-library/systems`), + Other → manual text. When a
 *     catalog system is picked, diameter and length become dropdowns of
 *     the diameters / lengths that system officially sells (per 3b).
 *   - Healing "chips" replaced by a single "Type of Procedure" dropdown
 *     with 3 options:
 *        Single Stage — no extra fields
 *        Two Stage    — Prosthetic Component dropdown: Cover Screw /
 *                        Healing Abutment (with mm value).
 *        Immediate Loading — Prosthesis Type list resolved by the case's
 *                        implant_procedure_type + tooth count. Hidden for
 *                        All-on-4/6/X cases.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PlacementDatePicker from '../../../components/PlacementDatePicker';
import api from '../../../utils/api';
import FDIChart from '../../../components/FDIChart';
import {
  getImmediateLoadingOptions, isFullArchProcedure,
} from '../../../utils/immediateLoadingProsthesis';

const REASONS = [
  'Early failure', 'Lack of Osseointegration', 'Infection', 'Peri-implantitis',
  'Mobility', 'Implant fracture', 'Unknown', 'Removed elsewhere', 'Other',
];

const PROC_TYPES = ['Single Stage', 'Two Stage', 'Immediate Loading'] as const;
type ProcType = typeof PROC_TYPES[number];

const PROSTHETIC_COMPONENTS = ['Cover Screw', 'Healing Abutment'] as const;

type CatalogSystem = {
  brand: string;
  system: string;
  diameters: number[];
  lengths: number[];
};

type FailureEntry = {
  implant_idx: number;
  tooth: string | number;
  reason: string;
  reason_other_text: string;
  removed: boolean;
  site_changed: boolean;
  new_tooth_number: string | null;
  replaced: boolean;
  // iter-348: End Implant Treatment (abandons implant therapy on this site
  // AND terminates the case per user pick Q1-b).
  end_treatment: boolean;
  end_treatment_decision_maker: '' | 'Patient' | 'Operator';
  end_treatment_reason: string;
  replacement: {
    system: string;
    system_is_other: boolean;
    system_other_text: string;
    diameter: string;
    length: string;
    lot_number: string;
    insertion_torque_ncm: string;
    isq: string;
    placement_date: string;
    // iter-344: Type of Procedure
    procedure_type: ProcType | '';
    prosthetic_component: string;                    // Cover Screw | Healing Abutment
    healing_abutment_mm: string;                     // when Healing Abutment
    immediate_loading_prosthesis: string;            // one of the options / 'Other'
    immediate_loading_prosthesis_other: string;      // manual entry when Other
  };
};

function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

// ── Reusable dropdown (Modal-based, works on RN Web + native) ──────────
function Dropdown({
  value, options, placeholder, onChange, testID, disabled,
}: {
  value: string; options: string[]; placeholder: string;
  onChange: (v: string) => void; testID?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[s.select, disabled && { opacity: 0.5 }]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        data-testid={testID}
        testID={testID}
      >
        <Text style={[s.selectT, !value && { color: '#90A4AE' }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#546E7A" />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.mBackdrop} onPress={() => setOpen(false)}>
          <View style={s.mSheet}>
            <Text style={s.mTitle}>{placeholder}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {options.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[s.mItem, value === opt && s.mItemOn]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                  data-testid={testID ? `${testID}-opt-${opt.replace(/\s+/g,'-')}` : undefined}
                  testID={testID ? `${testID}-opt-${opt.replace(/\s+/g,'-')}` : undefined}
                >
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

export default function SurvivalReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [implants, setImplants] = useState<any[]>([]);
  const [procedureMeta, setProcedureMeta] = useState<{ implant_procedure_type?: string; number_of_implants?: number }>({});
  const [catalog, setCatalog] = useState<CatalogSystem[]>([]);
  const [allSurvived, setAllSurvived] = useState<'yes' | 'no' | null>(null);
  const [failures, setFailures] = useState<Record<number, FailureEntry>>({});
  // iter-350: Global End Implant Treatment modal state (Q1-b: entire case).
  const [endModal, setEndModal] = useState<{
    open: boolean;
    reason: string;
    decision_maker: '' | 'Patient' | 'Operator';
    end_reason: string;
    submitting: boolean;
  }>({ open: false, reason: 'Peri-implantitis', decision_maker: '', end_reason: '', submitting: false });

  const [survivalReviewState, setSurvivalReviewState] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [impRes, procRes, catRes] = await Promise.all([
          api.get(`/procedures/${id}/active-implants`),
          api.get(`/procedures/${id}`),
          api.get('/implant-library/systems'),
        ]);
        setImplants(impRes.data?.active || []);
        setProcedureMeta({
          implant_procedure_type: procRes.data?.implant_procedure_type,
          number_of_implants: procRes.data?.number_of_implants
            || (procRes.data?.implant_plans?.length || procRes.data?.implants?.length || procRes.data?.existing_implants?.length || 0),
        });
        setCatalog(Array.isArray(catRes.data) ? catRes.data : (catRes.data?.systems || []));
        // iter-346: load prior review so history + multi-round submission works
        setSurvivalReviewState(procRes.data?.phase2_survival_review || null);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load survival review data');
      } finally { setLoading(false); }
    })();
  }, [id]);

  const catalogSystemLabels = useMemo(
    () => catalog.map(c => `${c.brand} — ${c.system}`).sort((a, b) => a.localeCompare(b)),
    [catalog]
  );
  const systemDropdownOptions = useMemo(
    () => [...catalogSystemLabels, 'Other'],
    [catalogSystemLabels]
  );

  const findSystemByLabel = (label: string): CatalogSystem | undefined => {
    return catalog.find(c => `${c.brand} — ${c.system}` === label);
  };

  const toggleFailure = (idx: number, imp: any, survived: 'yes' | 'no') => {
    if (survived === 'yes') {
      const cp = { ...failures }; delete cp[idx]; setFailures(cp);
    } else {
      setFailures(prev => ({
        ...prev,
        [idx]: prev[idx] || {
          implant_idx: idx,
          tooth: imp.tooth_number || imp.tooth || '',
          reason: '',
          reason_other_text: '',
          removed: true,
          site_changed: false,
          new_tooth_number: null,
          replaced: false,
          end_treatment: false,
          end_treatment_decision_maker: '',
          end_treatment_reason: '',
          replacement: {
            system: '', system_is_other: false, system_other_text: '',
            diameter: '', length: '',
            lot_number: '', insertion_torque_ncm: '', isq: '',
            placement_date: '',
            procedure_type: '',
            prosthetic_component: '',
            healing_abutment_mm: '',
            immediate_loading_prosthesis: '',
            immediate_loading_prosthesis_other: '',
          },
        },
      }));
    }
  };

  const setField = <K extends keyof FailureEntry>(idx: number, key: K, value: FailureEntry[K]) => {
    setFailures(prev => ({ ...prev, [idx]: { ...prev[idx], [key]: value } }));
  };
  const setReplField = (idx: number, patch: Partial<FailureEntry['replacement']>) => {
    setFailures(prev => ({
      ...prev,
      [idx]: { ...prev[idx], replacement: { ...prev[idx].replacement, ...patch } },
    }));
  };

  const handleSystemPick = (idx: number, label: string) => {
    if (label === 'Other') {
      setReplField(idx, { system: 'Other', system_is_other: true, system_other_text: '',
        diameter: '', length: '' });
      return;
    }
    const found = findSystemByLabel(label);
    setReplField(idx, {
      system: label,
      system_is_other: false,
      system_other_text: '',
      diameter: '',
      length: '',
    });
    // Track resolved diameters/lengths via closure — Dropdown will read from selectedSystem() later.
    void found; // keep reference for TS
  };

  const canSubmit = () => {
    if (allSurvived === 'yes') return true;
    if (allSurvived === 'no' && Object.keys(failures).length === 0) return false;
    for (const f of Object.values(failures)) {
      if (!f.reason) return false;
      if (f.reason === 'Other') {
        if (!f.reason_other_text.trim()) return false;
        if (wordCount(f.reason_other_text) > 100) return false;
      }
      if (f.site_changed) {
        if (!f.new_tooth_number) return false;
        if (String(f.new_tooth_number) === String(f.tooth)) return false;
      }
      if (f.replaced) {
        const r = f.replacement;
        // System required
        if (!r.system) return false;
        if (r.system_is_other && !r.system_other_text.trim()) return false;
        // Diameter / length required
        if (!r.diameter || !r.length) return false;
        // iter-348: placement date is compulsory for replacements.
        if (!r.placement_date) return false;
        // Procedure type required + branch validation
        if (!r.procedure_type) return false;
        if (r.procedure_type === 'Two Stage') {
          if (!r.prosthetic_component) return false;
          if (r.prosthetic_component === 'Healing Abutment' && !r.healing_abutment_mm) return false;
        }
        if (r.procedure_type === 'Immediate Loading' && !isFullArchProcedure(procedureMeta.implant_procedure_type)) {
          if (!r.immediate_loading_prosthesis) return false;
          if (r.immediate_loading_prosthesis === 'Other' && !r.immediate_loading_prosthesis_other.trim()) return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async (afterSave: 'phase3' | 'back') => {
    if (allSurvived && !canSubmit()) { Alert.alert('Incomplete', 'Please fill all required fields (reason, site change target, and replacement details).'); return; }
    setSaving(true);
    try {
      const body: any = { all_survived: allSurvived === 'yes', failures: [] };
      if (allSurvived === 'no') {
        body.failures = Object.values(failures).map(f => {
          const r = f.replacement;
          const finalSystem = r.system_is_other ? (r.system_other_text || 'Other') : r.system;
          const finalReason = f.reason === 'Other'
            ? `Other: ${f.reason_other_text.trim()}`
            : f.reason;
          return {
            implant_idx: f.implant_idx,
            tooth: f.tooth,
            reason: finalReason,
            removed: f.removed,
            site_changed: f.site_changed,
            new_tooth_number: f.site_changed ? f.new_tooth_number : null,
            replaced: f.replaced,
            replacement: f.replaced ? {
              system: finalSystem,
              diameter: Number(r.diameter),
              length: Number(r.length),
              lot_number: r.lot_number || null,
              insertion_torque_ncm: r.insertion_torque_ncm ? Number(r.insertion_torque_ncm) : null,
              isq: r.isq ? Number(r.isq) : null,
              placement_date: r.placement_date || null,
              procedure_type: r.procedure_type,
              prosthetic_component: r.procedure_type === 'Two Stage' ? r.prosthetic_component : null,
              healing_abutment_mm: (r.procedure_type === 'Two Stage' && r.prosthetic_component === 'Healing Abutment' && r.healing_abutment_mm)
                ? Number(r.healing_abutment_mm) : null,
              immediate_loading_prosthesis: r.procedure_type === 'Immediate Loading'
                ? (r.immediate_loading_prosthesis === 'Other'
                    ? `Other: ${r.immediate_loading_prosthesis_other.trim()}`
                    : r.immediate_loading_prosthesis)
                : null,
              healing_protocol: r.procedure_type === 'Single Stage'
                ? 'Single Stage'
                : (r.procedure_type === 'Two Stage'
                    ? `Two Stage - ${r.prosthetic_component || ''}`.trim()
                    : (r.procedure_type === 'Immediate Loading' ? 'Immediate Loading' : null)),
            } : null,
          };
        });
      }
      await api.post(`/procedures/${id}/survival-review`, body);
      if (afterSave === 'phase3') {
        router.replace(`/procedures/submit-stage2-surgical/${id}`);
      } else {
        router.replace(`/procedures/${id}`);
      }
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || 'Please try again');
    } finally { setSaving(false); }
  };

  // iter-350: Global "End Implant Treatment" — Q1-b terminates the entire case.
  // Called from the bottom red button + modal. Synthesizes end_treatment=true
  // failures for every implant on the case so the backend flips
  // procedure.status → treatment_ended in one shot.
  const handleEndTreatment = async () => {
    if (endModal.submitting) return;
    if (!endModal.reason) return Alert.alert('Missing field', 'Please pick a failure reason.');
    if (endModal.decision_maker !== 'Patient' && endModal.decision_maker !== 'Operator') {
      return Alert.alert('Missing field', 'Please pick who decided to end treatment.');
    }
    if (!endModal.end_reason.trim()) return Alert.alert('Missing field', 'Please describe the rationale for ending treatment.');
    setEndModal(m => ({ ...m, submitting: true }));
    try {
      const now = new Date().toISOString();
      const impls = implants.length > 0 ? implants : [{ tooth_number: null, tooth: null }];
      const body: any = {
        all_survived: false,
        failures: impls.map((imp: any, i: number) => ({
          implant_idx: i,
          tooth: imp.tooth_number || imp.tooth || null,
          reason: endModal.reason,
          removed: true,
          site_changed: false,
          new_tooth_number: null,
          replaced: false,
          end_treatment: true,
          end_treatment_decision_maker: endModal.decision_maker,
          end_treatment_reason: endModal.end_reason.trim(),
          failure_date: now,
          replacement: null,
        })),
      };
      await api.post(`/procedures/${id}/survival-review`, body);
      setEndModal({ open: false, reason: 'Peri-implantitis', decision_maker: '', end_reason: '', submitting: false });
      // iter-352: The case may be `treatment_ended` (if In-Charge or
      // Supervisor with same-person-both) OR pending approval. Either way
      // we route back to the case detail — it renders the correct banner
      // based on procedure.status.
      router.replace(`/procedures/${id}`);
    } catch (e: any) {
      Alert.alert('End treatment failed', e?.response?.data?.detail || 'Please try again');
      setEndModal(m => ({ ...m, submitting: false }));
    }
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#1565C0" style={{marginTop:60}}/></SafeAreaView>;

  const label = implants.length === 1 ? 'Implant Survived' : 'All Implants Survived';

  return (
    <SafeAreaView style={s.c} edges={['top','bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{padding:8}} data-testid="survival-back" testID="survival-back">
          <Ionicons name="arrow-back" size={22} color="#1565C0"/>
        </TouchableOpacity>
        <View style={{flex:1,marginLeft:8}}>
          <Text style={s.title}>Implant Survival Review</Text>
          <Text style={s.sub}>Between Phase 2 and Phase 3</Text>
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
      <ScrollView
        contentContainerStyle={{padding:16,paddingBottom:120}}
        keyboardShouldPersistTaps="handled"
      >
        {/* iter-346: Prior review history (audit trail) — read-only. */}
        {survivalReviewState?.events && survivalReviewState.events.length > 0 ? (
          <View style={s.histCard} data-testid="survival-history" testID="survival-history">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="time-outline" size={16} color="#0D47A1" />
              <Text style={s.histTitle}>Previous survival reviews ({survivalReviewState.events.length})</Text>
            </View>
            {survivalReviewState.events.map((ev: any, i: number) => (
              <View key={i} style={s.histRow} data-testid={`survival-history-event-${i}`}>
                <Text style={s.histWhen}>{(ev.at || '').slice(0, 10)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.histWho}>{ev.by || 'Reviewer'}</Text>
                  {ev.all_survived && (!ev.failures || ev.failures.length === 0)
                    ? <Text style={s.histBody}>All implants confirmed survived.</Text>
                    : <Text style={s.histBody}>
                        {ev.failures.length} failure{ev.failures.length > 1 ? 's' : ''} reported:
                        {ev.failures.map((f: any, j: number) => (
                          ` #${f.tooth} — ${f.reason}${f.replaced ? ' → replaced' : ''}${f.site_changed ? ` (site → ${f.new_tooth_number})` : ''}${j < ev.failures.length - 1 ? ';' : ''}`
                        )).join('')}
                      </Text>}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.card}>
          <Text style={s.q}>{label}?</Text>
          <View style={{flexDirection:'row',gap:12,marginTop:12}}>
            <TouchableOpacity style={[s.pill, allSurvived === 'yes' && s.pillOn]} onPress={() => setAllSurvived('yes')} data-testid="survival-all-yes" testID="survival-all-yes"><Text style={[s.pillT, allSurvived === 'yes' && s.pillTOn]}>Yes</Text></TouchableOpacity>
            <TouchableOpacity style={[s.pill, allSurvived === 'no' && s.pillOn]} onPress={() => setAllSurvived('no')} data-testid="survival-all-no" testID="survival-all-no"><Text style={[s.pillT, allSurvived === 'no' && s.pillTOn]}>No</Text></TouchableOpacity>
          </View>
        </View>

        {allSurvived === 'no' && implants.map((imp: any, i: number) => {
          const f = failures[i];
          const failed = !!f;
          const failedTooth = String(imp.tooth_number || imp.tooth || '');
          const cat = f?.replacement.system && !f.replacement.system_is_other
            ? findSystemByLabel(f.replacement.system) : undefined;
          const diameters = cat?.diameters?.map(String) || [];
          const lengths = cat?.lengths?.map(String) || [];
          const immOptions = getImmediateLoadingOptions(procedureMeta.implant_procedure_type, procedureMeta.number_of_implants);
          const hideImmediate = isFullArchProcedure(procedureMeta.implant_procedure_type);
          const procTypeOptions = (hideImmediate ? PROC_TYPES.filter(t => t !== 'Immediate Loading') : PROC_TYPES) as unknown as string[];

          return (
            <View key={i} style={s.card}>
              <Text style={s.itH}>Implant {i + 1} · Tooth {failedTooth || '-'}</Text>
              <Text style={s.itSub}>{imp.system || ''}  {imp.diameter}×{imp.length}mm</Text>
              <View style={{flexDirection:'row',gap:12,marginTop:12}}>
                <TouchableOpacity style={[s.pillSm, !failed && s.pillOn]} onPress={() => toggleFailure(i, imp, 'yes')} data-testid={`imp-${i}-survived-yes`} testID={`imp-${i}-survived-yes`}><Text style={[s.pillTSm, !failed && s.pillTOn]}>Survived</Text></TouchableOpacity>
                <TouchableOpacity style={[s.pillSm, failed && s.pillOnR]} onPress={() => toggleFailure(i, imp, 'no')} data-testid={`imp-${i}-survived-no`} testID={`imp-${i}-survived-no`}><Text style={[s.pillTSm, failed && s.pillTOn]}>Failed</Text></TouchableOpacity>
              </View>

              {failed && (
                <View style={{marginTop:14,gap:12}}>
                  {/* Reason dropdown + Other text box */}
                  <View>
                    <Text style={s.lbl}>Reason for failure</Text>
                    <Dropdown
                      value={f.reason}
                      options={REASONS}
                      placeholder="Select a reason"
                      onChange={v => setField(i, 'reason', v)}
                      testID={`imp-${i}-reason-select`}
                    />
                    {f.reason === 'Other' && (
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]}
                          multiline
                          numberOfLines={4}
                          placeholder="Describe the reason (max 100 words)"
                          value={f.reason_other_text}
                          onChangeText={v => setField(i, 'reason_other_text', v)}
                          data-testid={`imp-${i}-reason-other-text`}
                          testID={`imp-${i}-reason-other-text`}
                        />
                        <Text style={[s.helper, wordCount(f.reason_other_text) > 100 && { color: '#C62828' }]}>
                          {wordCount(f.reason_other_text)} / 100 words
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Removed Yes/No */}
                  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
                    <Text style={s.lbl}>Was it removed?</Text>
                    <TouchableOpacity style={[s.pillTiny, f.removed && s.pillOn]} onPress={() => setField(i, 'removed', true)} data-testid={`imp-${i}-removed-yes`} testID={`imp-${i}-removed-yes`}><Text style={[s.pillTT, f.removed && s.pillTOn]}>Yes</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.pillTiny, !f.removed && s.pillOn]} onPress={() => setField(i, 'removed', false)} data-testid={`imp-${i}-removed-no`} testID={`imp-${i}-removed-no`}><Text style={[s.pillTT, !f.removed && s.pillTOn]}>No</Text></TouchableOpacity>
                  </View>

                  {/* Site changed Yes/No + FDI chart */}
                  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
                    <Text style={s.lbl}>Was the Implant Site Changed?</Text>
                    <TouchableOpacity style={[s.pillTiny, f.site_changed && s.pillOn]} onPress={() => setField(i, 'site_changed', true)} data-testid={`imp-${i}-site-yes`} testID={`imp-${i}-site-yes`}><Text style={[s.pillTT, f.site_changed && s.pillTOn]}>Yes</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.pillTiny, !f.site_changed && s.pillOn]} onPress={() => { setField(i, 'site_changed', false); setField(i, 'new_tooth_number', null); }} data-testid={`imp-${i}-site-no`} testID={`imp-${i}-site-no`}><Text style={[s.pillTT, !f.site_changed && s.pillTOn]}>No</Text></TouchableOpacity>
                  </View>
                  {f.site_changed && (
                    <View style={s.fdiBox}>
                      <Text style={s.fdiHelp}>Select a new tooth in the same quadrant as {failedTooth}. The chosen tooth will replace {failedTooth} for Phase 3 and Phase 4.</Text>
                      <FDIChart
                        selectedTooth={f.new_tooth_number}
                        onSelect={(t) => setField(i, 'new_tooth_number', t)}
                        restrictToQuadrantOf={failedTooth}
                        excludeTooth={failedTooth}
                      />
                    </View>
                  )}

                  {/* iter-350: End Implant Treatment moved to a global button
                      at the bottom (below Update / Continue). The per-implant
                      inline entry point was removed to match the user's
                      preferred single-action layout. */}

                  {/* Was it replaced? */}
                  <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
                    <Text style={s.lbl}>Was it replaced?</Text>
                    <TouchableOpacity style={[s.pillTiny, f.replaced && s.pillOn]} onPress={() => setField(i, 'replaced', true)} data-testid={`imp-${i}-replaced-yes`} testID={`imp-${i}-replaced-yes`}><Text style={[s.pillTT, f.replaced && s.pillTOn]}>Yes</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.pillTiny, !f.replaced && s.pillOn]} onPress={() => setField(i, 'replaced', false)} data-testid={`imp-${i}-replaced-no`} testID={`imp-${i}-replaced-no`}><Text style={[s.pillTT, !f.replaced && s.pillTOn]}>No</Text></TouchableOpacity>
                  </View>

                  {f.replaced && (
                    <View style={s.replBox}>
                      <Text style={[s.lbl,{fontWeight:'700',color:'#2E7D32'}]}>Replacement implant (revision)</Text>

                      {/* System dropdown (71 catalog systems + Other) */}
                      <Dropdown
                        value={f.replacement.system}
                        options={systemDropdownOptions}
                        placeholder="Select Implant System"
                        onChange={v => handleSystemPick(i, v)}
                        testID={`imp-${i}-repl-system-select`}
                      />
                      {f.replacement.system_is_other && (
                        <TextInput
                          style={s.input}
                          placeholder="Enter implant system manually"
                          value={f.replacement.system_other_text}
                          onChangeText={v => setReplField(i, { system_other_text: v })}
                          data-testid={`imp-${i}-repl-system-other`}
                          testID={`imp-${i}-repl-system-other`}
                        />
                      )}

                      {/* Diameter / Length — dropdown when catalog picked, else manual */}
                      <View style={{flexDirection:'row',gap:8}}>
                        {diameters.length > 0 ? (
                          <View style={{flex:1}}>
                            <Dropdown
                              value={f.replacement.diameter ? `${f.replacement.diameter} mm` : ''}
                              options={diameters.map(d => `${d} mm`)}
                              placeholder="Diameter (mm)"
                              onChange={v => setReplField(i, { diameter: v.replace(' mm','') })}
                              testID={`imp-${i}-repl-diameter-select`}
                            />
                          </View>
                        ) : (
                          <TextInput style={[s.input,{flex:1}]} placeholder="Diameter (mm)" keyboardType="decimal-pad" value={f.replacement.diameter} onChangeText={v => setReplField(i, { diameter: v })} data-testid={`imp-${i}-repl-diameter`} testID={`imp-${i}-repl-diameter`} />
                        )}
                        {lengths.length > 0 ? (
                          <View style={{flex:1}}>
                            <Dropdown
                              value={f.replacement.length ? `${f.replacement.length} mm` : ''}
                              options={lengths.map(l => `${l} mm`)}
                              placeholder="Length (mm)"
                              onChange={v => setReplField(i, { length: v.replace(' mm','') })}
                              testID={`imp-${i}-repl-length-select`}
                            />
                          </View>
                        ) : (
                          <TextInput style={[s.input,{flex:1}]} placeholder="Length (mm)" keyboardType="decimal-pad" value={f.replacement.length} onChangeText={v => setReplField(i, { length: v })} data-testid={`imp-${i}-repl-length`} testID={`imp-${i}-repl-length`} />
                        )}
                      </View>

                      {/* iter-345: Torque relocated right after Diameter/Length,
                          matching the Phase 2 default input style. */}
                      <TextInput
                        style={s.input}
                        placeholder="Torque (Ncm)"
                        keyboardType="decimal-pad"
                        value={f.replacement.insertion_torque_ncm}
                        onChangeText={v => setReplField(i, { insertion_torque_ncm: v })}
                        data-testid={`imp-${i}-repl-torque`}
                        testID={`imp-${i}-repl-torque`}
                      />

                      <TextInput style={s.input} placeholder="Lot # (optional)" value={f.replacement.lot_number} onChangeText={v => setReplField(i, { lot_number: v })} data-testid={`imp-${i}-repl-lot`} testID={`imp-${i}-repl-lot`} />
                      <TextInput style={s.input} placeholder="ISQ (optional)" keyboardType="decimal-pad" value={f.replacement.isq} onChangeText={v => setReplField(i, { isq: v })} data-testid={`imp-${i}-repl-isq`} testID={`imp-${i}-repl-isq`} />
                      {/* iter-348 → iter-350: Placement date is compulsory and
                          uses the same react-native-calendars picker as
                          Phase 1 Schedule > Procedure date. */}
                      <Text style={[s.lbl, { marginTop: 4, color: '#C62828' }]}>Placement date *</Text>
                      <PlacementDatePicker
                        value={f.replacement.placement_date || ''}
                        onChange={(iso: string) => setReplField(i, { placement_date: iso })}
                        maxDate={new Date().toISOString().slice(0, 10)}
                        placeholder="Tap to select placement date"
                        invalid={!f.replacement.placement_date}
                        testID={`imp-${i}-repl-date`}
                      />

                      {/* Type of Procedure */}
                      <View style={{ marginTop: 6 }}>
                        <Text style={s.lbl}>Type of Procedure</Text>
                        <Dropdown
                          value={f.replacement.procedure_type}
                          options={procTypeOptions}
                          placeholder="Select procedure type"
                          onChange={(v) => setReplField(i, {
                            procedure_type: v as ProcType,
                            prosthetic_component: '',
                            healing_abutment_mm: '',
                            immediate_loading_prosthesis: '',
                            immediate_loading_prosthesis_other: '',
                          })}
                          testID={`imp-${i}-repl-proctype`}
                        />
                      </View>

                      {f.replacement.procedure_type === 'Two Stage' && (
                        <View style={{ gap: 8 }}>
                          <Text style={s.lbl}>Select Prosthetic Component</Text>
                          <Dropdown
                            value={f.replacement.prosthetic_component}
                            options={[...PROSTHETIC_COMPONENTS]}
                            placeholder="Cover Screw / Healing Abutment"
                            onChange={(v) => setReplField(i, { prosthetic_component: v, healing_abutment_mm: '' })}
                            testID={`imp-${i}-repl-prostheticcomp`}
                          />
                          {f.replacement.prosthetic_component === 'Healing Abutment' && (
                            <TextInput
                              style={s.input}
                              placeholder="Healing Abutment height (mm)"
                              keyboardType="decimal-pad"
                              value={f.replacement.healing_abutment_mm}
                              onChangeText={v => setReplField(i, { healing_abutment_mm: v })}
                              data-testid={`imp-${i}-repl-heal-abut-mm`}
                              testID={`imp-${i}-repl-heal-abut-mm`}
                            />
                          )}
                        </View>
                      )}

                      {f.replacement.procedure_type === 'Immediate Loading' && !hideImmediate && (
                        <View style={{ gap: 8 }}>
                          <Text style={s.lbl}>Immediate Loading Prosthesis</Text>
                          <Dropdown
                            value={f.replacement.immediate_loading_prosthesis}
                            options={immOptions}
                            placeholder="Select prosthesis type"
                            onChange={(v) => setReplField(i, { immediate_loading_prosthesis: v, immediate_loading_prosthesis_other: '' })}
                            testID={`imp-${i}-repl-imm-load`}
                          />
                          {f.replacement.immediate_loading_prosthesis === 'Other' && (
                            <TextInput
                              style={s.input}
                              placeholder="Enter prosthesis manually"
                              value={f.replacement.immediate_loading_prosthesis_other}
                              onChangeText={v => setReplField(i, { immediate_loading_prosthesis_other: v })}
                              data-testid={`imp-${i}-repl-imm-load-other`}
                              testID={`imp-${i}-repl-imm-load-other`}
                            />
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {allSurvived && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[s.submitAlt, saving && {opacity:0.5}]}
              disabled={saving}
              onPress={() => handleSubmit('back')}
              data-testid="survival-submit-back"
              testID="survival-submit-back"
            >
              {saving ? <ActivityIndicator color="#1565C0" size="small"/> : <><Ionicons name="save-outline" size={16} color="#1565C0"/><Text style={s.submitAltT}>Update &amp; go back</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submit, { flex: 1 }, (!canSubmit() || saving) && {opacity:0.5}]}
              disabled={!canSubmit() || saving}
              onPress={() => handleSubmit('phase3')}
              data-testid="survival-submit-phase3"
              testID="survival-submit-phase3"
            >
              {saving ? <ActivityIndicator color="#fff"/> : <><Ionicons name="arrow-forward" size={16} color="#fff"/><Text style={s.submitT}>Continue to Phase 3</Text></>}
            </TouchableOpacity>
          </View>
        )}

        {/* iter-350: Global "End Implant Treatment" — repositioned per user
            request. Solid red pill, white text, centered on its own row
            BELOW the Update / Continue action buttons. */}
        <View style={s.endTreatmentGlobalWrap}>
          <TouchableOpacity
            style={s.endTreatmentGlobalBtn}
            onPress={() => setEndModal(m => ({ ...m, open: true }))}
            activeOpacity={0.85}
            data-testid="survival-end-treatment-btn"
            testID="survival-end-treatment-btn"
          >
            <Ionicons name="close-circle" size={18} color="#FFF" />
            <Text style={s.endTreatmentGlobalT}>End Implant Treatment</Text>
          </TouchableOpacity>
          <Text style={s.endTreatmentGlobalHelp}>
            Terminates the entire case. No further replacements or phases can be recorded.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* iter-350: End Implant Treatment modal (global). Collects the
          failure reason, decision maker, and free-text ending rationale
          in one dialog. */}
      <Modal transparent visible={endModal.open} animationType="fade" onRequestClose={() => setEndModal(m => ({ ...m, open: false }))}>
        <Pressable style={s.endModalBackdrop} onPress={() => setEndModal(m => ({ ...m, open: false }))}>
          <Pressable style={s.endModalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.endModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="warning" size={20} color="#C62828" />
                <Text style={s.endModalTitle}>End Implant Treatment</Text>
              </View>
              <TouchableOpacity onPress={() => setEndModal(m => ({ ...m, open: false }))} testID="end-treatment-close">
                <Ionicons name="close" size={22} color="#37474F" />
              </TouchableOpacity>
            </View>
            <Text style={s.endModalWarn}>
              This terminates the entire case. No further replacements or phases can be recorded for this patient.
            </Text>

            <Text style={[s.lbl, { marginTop: 12 }]}>Failure reason *</Text>
            <Dropdown
              value={endModal.reason}
              options={REASONS.filter(r => r !== 'Other')}
              placeholder="Pick a reason"
              onChange={(v) => setEndModal(m => ({ ...m, reason: v }))}
              testID="end-treatment-reason"
            />

            <Text style={[s.lbl, { marginTop: 12 }]}>Whose decision? *</Text>
            <Dropdown
              value={endModal.decision_maker || ''}
              options={['Patient', 'Operator']}
              placeholder="Select decision maker"
              onChange={(v) => setEndModal(m => ({ ...m, decision_maker: v as 'Patient' | 'Operator' }))}
              testID="end-treatment-decision"
            />

            <Text style={[s.lbl, { marginTop: 12 }]}>Reason for ending treatment *</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
              numberOfLines={4}
              placeholder="Describe the clinical / patient-preference rationale"
              value={endModal.end_reason}
              onChangeText={(v) => setEndModal(m => ({ ...m, end_reason: v }))}
              data-testid="end-treatment-reason-text"
              testID="end-treatment-reason-text"
            />

            <TouchableOpacity
              style={[s.endTreatmentGlobalBtn, { marginTop: 16 }, endModal.submitting && { opacity: 0.6 }]}
              onPress={handleEndTreatment}
              disabled={endModal.submitting}
              testID="end-treatment-confirm"
              data-testid="end-treatment-confirm"
            >
              {endModal.submitting ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="close-circle" size={18} color="#FFF" />
                  <Text style={s.endTreatmentGlobalT}>Confirm &amp; End Treatment</Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#F5F7FA' },
  h: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E6EF' },
  title: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  sub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6EF' },
  q: { fontSize: 16, fontWeight: '700', color: '#0D47A1' },
  itH: { fontSize: 14, fontWeight: '800', color: '#1A1A2E' },
  itSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  lbl: { fontSize: 12, fontWeight: '700', color: '#37474F', marginBottom: 4 },
  helper: { fontSize: 11, color: '#78909C', marginTop: 3 },
  pill: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', flex: 1, alignItems: 'center' },
  pillSm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', flex: 1, alignItems: 'center' },
  pillTiny: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC' },
  pillOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  pillOnR: { backgroundColor: '#C62828', borderColor: '#C62828' },
  pillT: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  pillTSm: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  pillTT: { fontSize: 12, fontWeight: '600', color: '#37474F' },
  pillTOn: { color: '#FFF' },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, padding: 10, fontSize: 13, color: '#1e2a44', backgroundColor: '#FFF' },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF' },
  selectT: { fontSize: 13, color: '#1e2a44', flex: 1 },
  replBox: { marginTop: 8, gap: 10, padding: 12, backgroundColor: '#F1F8E9', borderRadius: 10, borderWidth: 1, borderColor: '#C5E1A5' },
  fdiBox: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#B3E5FC', backgroundColor: '#E1F5FE', marginTop: 4 },
  fdiHelp: { fontSize: 11, color: '#0277BD', marginBottom: 8, fontStyle: 'italic' },
  submit: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14 },
  submitT: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  submitAlt: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#FFF' },
  submitAltT: { color: '#1565C0', fontWeight: '800', fontSize: 13 },
  histCard: { backgroundColor: '#F8FAFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#BBDEFB' },
  histTitle: { fontSize: 13, fontWeight: '800', color: '#0D47A1' },
  histRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E3F2FD' },
  histWhen: { fontSize: 11, color: '#546E7A', fontWeight: '700', minWidth: 80 },
  histWho: { fontSize: 12, fontWeight: '700', color: '#1A237E' },
  histBody: { fontSize: 11, color: '#37474F', marginTop: 2 },
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  mSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '70%' },
  mTitle: { fontSize: 14, fontWeight: '800', color: '#0D47A1', marginBottom: 12 },
  mItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#F0F2F5' },
  mItemOn: { backgroundColor: '#E3F2FD', borderRadius: 8 },
  mItemT: { fontSize: 13, color: '#1e2a44' },
  // iter-350: Global End Implant Treatment button (centered, red, below actions)
  endTreatmentGlobalWrap: { marginTop: 16, marginBottom: 24, alignItems: 'center', gap: 6 },
  endTreatmentGlobalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#C62828', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24,
    minWidth: 260, maxWidth: 360,
    shadowColor: '#C62828', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  endTreatmentGlobalT: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  endTreatmentGlobalHelp: { fontSize: 11, color: '#8E1B1B', fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 24 },
  endModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  endModalSheet: {
    width: '100%', maxWidth: 460, backgroundColor: '#FFF',
    borderRadius: 16, padding: 18, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, elevation: 14,
    borderTopWidth: 4, borderTopColor: '#C62828',
  },
  endModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  endModalTitle: { fontSize: 16, fontWeight: '800', color: '#B71C1C', letterSpacing: 0.3 },
  endModalWarn: {
    fontSize: 12, color: '#B71C1C', backgroundColor: '#FFEBEE',
    padding: 10, borderRadius: 8, lineHeight: 17, fontStyle: 'italic',
  },
});
