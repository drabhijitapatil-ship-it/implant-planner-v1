/**
 * iter-388/389 — Phase 5: Follow-up & Maintenance appointment form.
 * 10 sections per user spec; starts with the Implant Survival Review
 * (Phase-2 style: All Survived? gate → per-implant Survived/Failed with
 * reason dropdown). Soft tissue + implant mobility captured PER IMPLANT.
 * Radiograph section embeds the 3-way comparison (Phase 2 → Phase 4 → now).
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import { showUploadPicker } from '../../../utils/uploadPicker';
import DoneDatePicker, { todayIso } from '../../../components/DoneDatePicker';
import RadiographCompare from '../../../components/RadiographCompare';

const FULL_ARCH_TYPES = new Set(['All on 4', 'All on 6', 'All on X']);
type Upload = { filename: string; original_name: string; content_type: string };

const FAILURE_REASONS = [
  'Early failure', 'Lack of Osseointegration', 'Infection', 'Peri-implantitis',
  'Mobility', 'Implant fracture', 'Unknown', 'Removed elsewhere', 'Other',
];
const MOBILITY_OPTIONS = [
  'Absence of mobility',
  'Minimum clinically visible mobility',
  'Horizontal mobility up to 0.5 mm',
  'Horizontal mobility more than 0.5 mm',
  '0.5 mm or more horizontal mobility along with vertical mobility',
];
const PROBING_FIELDS: [string, string][] = [
  ['kgw', 'Keratinized gingiva width'],
  ['vestibular', 'Vestibular probing depth'],
  ['distal', 'Distal probing depth'],
  ['mesial', 'Mesial probing depth'],
  ['lingual', 'Lingual/Palatal probing depth'],
];
const SOFT_TISSUE_PARAMS: [string, string][] = [
  ['bleeding_on_probing', 'Bleeding on probing'],
  ['soft_tissue_inflammation', 'Soft tissue inflammation'],
  ['ulceration', 'Ulceration'],
  ['swelling', 'Swelling'],
];

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

const Chips = ({ options, value, onChange, testID }: any) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {options.map((opt: string) => (
      <TouchableOpacity key={opt}
        style={[s.chip, value === opt && s.chipActive]}
        onPress={() => onChange(opt)}
        testID={testID ? `${testID}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined}
      >
        <Text style={[s.chipText, value === opt && s.chipTextActive]}>{opt}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

const Field = ({ label, required, children, info }: any) => (
  <View style={{ marginBottom: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: '#DC3545' }}> *</Text> : null}</Text>
      {info ? (
        <TouchableOpacity onPress={() => Alert.alert(label, info)}>
          <Ionicons name="information-circle-outline" size={17} color="#1565C0" />
        </TouchableOpacity>
      ) : null}
    </View>
    {children}
  </View>
);

type SurvivalEntry = { status: string; reason: string; reason_other_text: string; details: string };
const emptySurvival = (): SurvivalEntry => ({ status: '', reason: '', reason_other_text: '', details: '' });

export default function FollowUpForm() {
  const { id, n } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const num = parseInt(String(n || '1'), 10) || 1;

  const [procedure, setProcedure] = useState<any>(null);
  const [loadingProc, setLoadingProc] = useState(true);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [date, setDate] = useState<string>(todayIso());
  const [allSurvived, setAllSurvived] = useState<'yes' | 'no' | null>(null);
  const [survival, setSurvival] = useState<Record<string, SurvivalEntry>>({});
  const [reasonModalFor, setReasonModalFor] = useState<string | null>(null);
  const [preexisting, setPreexisting] = useState({ status: '', details: '' });
  const [newCondition, setNewCondition] = useState({ answer: '', details: '' });
  const [general, setGeneral] = useState<any>({ comfort: '', comfort_details: '', pain: '', pain_details: '', chewing_ability: '', speech: '', esthetics: '' });
  const [hygiene, setHygiene] = useState<any>({ plaque_index: '', hygiene_prosthesis: '', hygiene_components: '', access_cleaning: '' });
  const [probing, setProbing] = useState<Record<string, Record<string, string>>>({});
  const [iopaUploads, setIopaUploads] = useState<Record<string, Upload>>({});
  const [opgUpload, setOpgUpload] = useState<Upload | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // iter-389: per-implant soft tissue — { tooth: { param: { status, details } } }
  const [softTissue, setSoftTissue] = useState<Record<string, Record<string, { status: string; details: string }>>>({});
  // iter-389: per-implant mobility — { tooth: option }
  const [implantMobility, setImplantMobility] = useState<Record<string, string>>({});
  const [mobilityModalFor, setMobilityModalFor] = useState<string | null>(null);
  const [prosthesis, setProsthesis] = useState<any>({ prosthesis_stability: '', prosthesis_stability_details: '', prosthesis_integrity: '', component_integrity: '', occlusion: '' });
  const [overdenture, setOverdenture] = useState<any>({ pressure_areas: '', occlusion_balanced: '', attachment_integrity: '', denture_hygiene: '' });
  const [feedback, setFeedback] = useState('');
  // iter-390: full probing history modal — { pos, key, label } of the tapped site.
  const [historyFor, setHistoryFor] = useState<{ pos: string; key: string; label: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}`);
        setProcedure(res.data);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load case');
      } finally { setLoadingProc(false); }
    })();
  }, [id]);

  const label = procedure?.followups?.length >= num
    ? procedure.followups[num - 1]?.label
    : `${['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][num - 1] || `${num}th`} Follow up Appointment`;

  const effectiveProcType = procedure?.case_origin === 'existing_implants' && procedure?.original_procedure_type
    ? procedure.original_procedure_type : procedure?.implant_procedure_type;
  const isFullArch = procedure && FULL_ARCH_TYPES.has(effectiveProcType);
  const implantPositions: string[] = (() => {
    const fromPlans = (procedure?.implant_plans || []).map((p: any) => String(p.position || '')).filter(Boolean);
    return fromPlans.length > 0
      ? fromPlans
      : (procedure?.existing_implants || []).map((r: any) => String(r.tooth || '')).filter(Boolean);
  })();

  const ma = procedure?.medical_assessment || {};
  const anyRisk = (ma.diabetes && ma.diabetes !== 'No')
    || (ma.smoking && ma.smoking !== 'No')
    || ma.anticoagulant === 'Yes' || ma.osteoporosis === 'Yes' || ma.radiation === 'Yes';

  const isOverdenture = String(procedure?.prosthetic_plan || '').includes('Overdenture with Attachment');
  const baseline = procedure?.baseline_probing_depths || {};

  // iter-390: longitudinal probing comparison — all prior non-rejected follow-ups.
  const priorFollowups: any[] = (procedure?.followups || [])
    .filter((f: any) => f.number < num && f.status !== 'rejected');
  const prevFU = priorFollowups.length ? priorFollowups[priorFollowups.length - 1] : null;
  const ordShort = (n: number) => `${['1st', '2nd', '3rd'][n - 1] || `${n}th`} FU`;

  // iter-389: Phase 4 radiographs for the 3-way comparison.
  const phase4ByTooth: Record<string, string> = {};
  Object.entries((procedure?.phase4_step2_iopa_uploads || {}) as Record<string, any>).forEach(([t, u]) => {
    if (u?.filename) phase4ByTooth[t] = String(u.filename);
  });
  const phase4Opg: string | null = procedure?.phase4_step2_opg_upload?.filename || null;

  const setSurvivalField = (pos: string, patch: Partial<SurvivalEntry>) =>
    setSurvival(prev => ({ ...prev, [pos]: { ...(prev[pos] || emptySurvival()), ...patch } }));

  const pickAllSurvived = (v: 'yes' | 'no') => {
    setAllSurvived(v);
    if (v === 'yes') {
      const all: Record<string, SurvivalEntry> = {};
      implantPositions.forEach(p => { all[p] = { ...emptySurvival(), status: 'Surviving' }; });
      setSurvival(all);
    } else {
      setSurvival({});
    }
  };

  const setSoftTissueField = (pos: string, param: string, patch: Partial<{ status: string; details: string }>) =>
    setSoftTissue(prev => {
      const existing = prev[pos]?.[param] || { status: '', details: '' };
      return { ...prev, [pos]: { ...(prev[pos] || {}), [param]: { ...existing, ...patch } } };
    });

  const uploadFile = async (): Promise<Upload | null> => {
    const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
    if (!picked) return null;
    const fp = new FormData();
    const filename = picked.name || 'upload.jpg';
    const mime = picked.type || 'application/octet-stream';
    if (Platform.OS === 'web') {
      const blob = await fetch(picked.uri).then(r => r.blob());
      fp.append('file', blob, filename);
    } else {
      fp.append('file', { uri: picked.uri, name: filename, type: mime } as any);
    }
    const res = await api.post('/uploads/media-temp', fp, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data as Upload;
  };

  const pickIopa = async (pos: string) => {
    setUploadingFor(pos);
    try {
      const up = await uploadFile();
      if (up) {
        if (pos === '__opg__') setOpgUpload(up);
        else setIopaUploads(prev => ({ ...prev, [pos]: up }));
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.detail || 'Could not upload radiograph');
    } finally { setUploadingFor(null); }
  };

  const probingDelta = (pos: string, key: string): { txt: string; up: boolean } | null => {
    const cur = parseFloat(probing[pos]?.[key] || '');
    const base = parseFloat((baseline[pos] || baseline['case'] || {})[key] || '');
    if (isNaN(cur) || isNaN(base)) return null;
    const d = +(cur - base).toFixed(1);
    if (d === 0) return { txt: '= baseline', up: false };
    return { txt: `${d > 0 ? '+' : ''}${d} mm vs baseline`, up: d > 0 };
  };

  // iter-390: delta vs the immediately previous follow-up.
  const probingDeltaPrev = (pos: string, key: string): { txt: string; up: boolean } | null => {
    if (!prevFU) return null;
    const cur = parseFloat(probing[pos]?.[key] || '');
    const prev = parseFloat(String(prevFU.probing_depths?.[pos]?.[key] ?? ''));
    if (isNaN(cur) || isNaN(prev)) return null;
    const d = +(cur - prev).toFixed(1);
    if (d === 0) return { txt: `= ${ordShort(prevFU.number)}`, up: false };
    return { txt: `${d > 0 ? '+' : ''}${d} mm vs ${ordShort(prevFU.number)}`, up: d > 0 };
  };

  const handleSubmit = async () => {
    const missing: string[] = [];
    if (!allSurvived) missing.push(`Implant Survival Review — answer "${implantPositions.length === 1 ? 'Implant Survived' : 'All Implants Survived'}?"`);
    if (allSurvived === 'no') {
      const survMissing = implantPositions.filter(p => !survival[p]?.status);
      if (survMissing.length) missing.push(`Survived / Failed status for tooth ${survMissing.join(', ')}`);
      for (const pos of implantPositions) {
        const e = survival[pos];
        if (e?.status === 'Failed') {
          if (!e.reason) missing.push(`Reason for failure — tooth ${pos}`);
          else if (e.reason === 'Other') {
            if (!e.reason_other_text.trim()) missing.push(`Failure description — tooth ${pos}`);
            else if (wordCount(e.reason_other_text) > 100) missing.push(`Failure description over 100 words — tooth ${pos}`);
          }
        }
      }
    }
    if (anyRisk && !preexisting.status) missing.push('Review of Pre-existing systemic condition');
    if (anyRisk && preexisting.status === 'Not controlled' && !preexisting.details.trim()) missing.push('Pre-existing condition details');
    if (!anyRisk && !newCondition.answer) missing.push('New systemic condition');
    if (!anyRisk && newCondition.answer === 'Yes' && !newCondition.details.trim()) missing.push('New systemic condition details');
    if (!general.comfort) missing.push('Comfort');
    if (general.comfort === 'No' && !general.comfort_details.trim()) missing.push('Comfort details');
    if (!general.pain) missing.push('Pain');
    if (general.pain === 'Yes' && !general.pain_details.trim()) missing.push('Pain details');
    if (!general.chewing_ability) missing.push('Chewing ability');
    if (!general.speech) missing.push('Speech');
    if (!general.esthetics) missing.push('Esthetics');
    if (!hygiene.plaque_index) missing.push('Lindquist Plaque index');
    if (!hygiene.hygiene_prosthesis) missing.push('Hygiene around the prosthesis');
    if (!hygiene.hygiene_components) missing.push('Hygiene around implant components');
    if (!hygiene.access_cleaning) missing.push('Access for cleaning');
    for (const pos of implantPositions) {
      if (PROBING_FIELDS.some(([k]) => !(probing[pos]?.[k] || '').trim())) { missing.push(`Probing depths for tooth ${pos}`); break; }
    }
    if (isFullArch) { if (!opgUpload) missing.push('OPG radiograph'); }
    else {
      const radMissing = implantPositions.filter(p => !iopaUploads[p]);
      if (radMissing.length) missing.push(`IOPA for tooth ${radMissing.join(', ')}`);
    }
    for (const pos of implantPositions) {
      for (const [k, lbl] of SOFT_TISSUE_PARAMS) {
        const e = softTissue[pos]?.[k];
        if (!e?.status) missing.push(`${lbl} — tooth ${pos}`);
        else if (e.status === 'Present' && !e.details.trim()) missing.push(`${lbl} details — tooth ${pos}`);
      }
    }
    const mobMissing = implantPositions.filter(p => !implantMobility[p]);
    if (mobMissing.length) missing.push(`Implant mobility for tooth ${mobMissing.join(', ')}`);
    if (!prosthesis.prosthesis_stability) missing.push('Prosthesis stability');
    if (prosthesis.prosthesis_stability === 'Mobile' && !prosthesis.prosthesis_stability_details.trim()) missing.push('Prosthesis stability details');
    if (!prosthesis.prosthesis_integrity) missing.push('Prosthesis integrity');
    if (!prosthesis.component_integrity) missing.push('Implant component integrity');
    if (!prosthesis.occlusion) missing.push('Occlusion in centric and eccentric movements');
    if (isOverdenture) {
      if (!overdenture.pressure_areas) missing.push('Pressure areas under the base');
      if (!overdenture.occlusion_balanced) missing.push('Occlusion and balanced contact');
      if (!overdenture.attachment_integrity) missing.push('Attachment integrity');
      if (!overdenture.denture_hygiene) missing.push('Denture hygiene condition');
    }
    if (missing.length) {
      Alert.alert('Incomplete', `Please complete:\n• ${missing.slice(0, 8).join('\n• ')}${missing.length > 8 ? `\n…and ${missing.length - 8} more` : ''}`);
      return;
    }
    setLoading(true);
    try {
      await api.post(`/procedures/${id}/followups`, {
        date,
        survival_review: survival,
        preexisting_condition_review: anyRisk ? preexisting : null,
        new_systemic_condition: anyRisk ? null : newCondition,
        general,
        oral_hygiene: hygiene,
        probing_depths: probing,
        iopa_uploads: isFullArch ? null : iopaUploads,
        opg_upload: isFullArch ? opgUpload : null,
        soft_tissue: softTissue,
        prosthesis_occlusion: { ...prosthesis, implant_mobility: implantMobility },
        overdenture: isOverdenture ? overdenture : null,
        patient_feedback: feedback,
      });
      setCompleted(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit follow-up');
    } finally { setLoading(false); }
  };

  if (completed) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <PhaseHeader title="Phase 5 - Follow-up & Maintenance" subtitle={label} />
        <View style={s.successWrap}>
          <Ionicons name="checkmark-circle" size={64} color="#1B5E20" />
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1B5E20', marginTop: 10 }}>Submitted for Approval</Text>
          <TouchableOpacity onPress={() => router.replace(`/procedures/${id}`)} style={{ marginTop: 14 }} testID="followup-view-case-link">
            <Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' }}>View Case</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (loadingProc) {
    return (
      <SafeAreaView style={s.container}>
        <PhaseHeader title="Phase 5 - Follow-up & Maintenance" subtitle={label} />
        <View style={s.successWrap}><ActivityIndicator size="large" color="#1565C0" /></View>
      </SafeAreaView>
    );
  }

  const survivalGateLabel = implantPositions.length === 1 ? 'Implant Survived' : 'All Implants Survived';

  // Implant Survival Review must be completed before the rest of the
  // follow-up workflow unlocks — it "activates" first per spec, not just
  // gates final submission.
  const isrComplete = allSurvived === 'yes' || (
    allSurvived === 'no' && implantPositions.every(pos => {
      const e = survival[pos];
      if (!e?.status) return false;
      if (e.status === 'Failed') {
        if (!e.reason) return false;
        if (e.reason === 'Other' && (!e.reason_other_text.trim() || wordCount(e.reason_other_text) > 100)) return false;
      }
      return true;
    })
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader title="Phase 5 - Follow-up & Maintenance" subtitle={label} testID="followup-header" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>

          {/* ── Implant Survival Review (always first — Phase 2 style) ── */}
          <View style={s.section} testID="followup-survival-section">
            <View style={s.sectionHeader}>
              <Ionicons name="pulse" size={20} color="#B71C1C" />
              <Text style={s.sectionTitle}>Implant Survival Review</Text>
            </View>
            <Text style={s.helperText}>Record the current status of every implant before the maintenance review.</Text>

            <Text style={s.gateQ}>{survivalGateLabel}?</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 4 }}>
              <TouchableOpacity style={[s.gatePill, allSurvived === 'yes' && s.gatePillOn]} onPress={() => pickAllSurvived('yes')} testID="followup-survival-all-yes">
                <Text style={[s.gatePillT, allSurvived === 'yes' && s.gatePillTOn]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.gatePill, allSurvived === 'no' && s.gatePillOn]} onPress={() => pickAllSurvived('no')} testID="followup-survival-all-no">
                <Text style={[s.gatePillT, allSurvived === 'no' && s.gatePillTOn]}>No</Text>
              </TouchableOpacity>
            </View>

            {allSurvived === 'no' && implantPositions.map(pos => {
              const e = survival[pos];
              const failed = e?.status === 'Failed';
              return (
                <View key={pos} style={s.survCard} testID={`survival-card-${pos}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#37474F', flex: 1 }}>Tooth {pos}</Text>
                    <TouchableOpacity style={[s.pillSm, e?.status === 'Surviving' && s.pillSmOn]} onPress={() => setSurvivalField(pos, { status: 'Surviving', reason: '', reason_other_text: '' })} testID={`survival-${pos}-surviving`}>
                      <Text style={[s.pillSmT, e?.status === 'Surviving' && s.pillSmTOn]}>Survived</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.pillSm, failed && s.pillSmOnR]} onPress={() => setSurvivalField(pos, { status: 'Failed' })} testID={`survival-${pos}-failed`}>
                      <Text style={[s.pillSmT, failed && s.pillSmTOn]}>Failed</Text>
                    </TouchableOpacity>
                  </View>
                  {failed && (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Text style={s.label}>Reason for failure <Text style={{ color: '#DC3545' }}>*</Text></Text>
                      <TouchableOpacity style={s.dropdown} onPress={() => setReasonModalFor(pos)} testID={`survival-${pos}-reason`}>
                        <Text style={[s.dropdownText, !e?.reason && { color: '#999' }]}>{e?.reason || 'Select a reason'}</Text>
                        <Ionicons name="chevron-down" size={18} color="#666" />
                      </TouchableOpacity>
                      {e?.reason === 'Other' && (
                        <View>
                          <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Describe the reason (max 100 words)"
                            value={e.reason_other_text} onChangeText={v => setSurvivalField(pos, { reason_other_text: v })}
                            testID={`survival-${pos}-reason-other`} />
                          <Text style={[s.helperText, { marginTop: 4 }, wordCount(e.reason_other_text) > 100 && { color: '#C62828' }]}>
                            {wordCount(e.reason_other_text)} / 100 words
                          </Text>
                        </View>
                      )}
                      <TextInput style={[s.input, { minHeight: 52 }]} multiline placeholder="Clinical notes (mobility, pain, peri-implantitis…) — optional"
                        value={e?.details || ''} onChangeText={v => setSurvivalField(pos, { details: v })}
                        testID={`survival-details-${pos}`} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {!isrComplete ? (
            <View style={s.section} testID="followup-locked-notice">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="lock-closed" size={18} color="#78909C" />
                <Text style={{ fontSize: 13, color: '#607D8B', flex: 1 }}>
                  Complete the Implant Survival Review above to unlock the rest of the follow-up workflow.
                </Text>
              </View>
            </View>
          ) : (
          <>
          {/* ── Date ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="calendar" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Date</Text>
            </View>
            <DoneDatePicker label="Follow-up Appointment Date" value={date} onChange={setDate} testID="followup-date" />
          </View>

          {/* ── Systemic conditions ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="medkit" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Systemic Condition Review</Text>
            </View>
            {anyRisk && (
              <Field label="Review of Pre-existing systemic condition" required>
                <Chips options={['Controlled', 'Not controlled']} value={preexisting.status}
                  onChange={(v: string) => setPreexisting(p => ({ ...p, status: v }))} testID="preexisting" />
                {preexisting.status === 'Not controlled' && (
                  <TextInput style={[s.input, { minHeight: 60, marginTop: 8 }]} multiline placeholder="Details of uncontrolled condition..."
                    value={preexisting.details} onChangeText={v => setPreexisting(p => ({ ...p, details: v }))} testID="preexisting-details" />
                )}
              </Field>
            )}
            {!anyRisk && (
              <Field label="New systemic condition" required
                info="If the patient has developed any new systemic condition like Sjogren's syndrome (Xerostomia), Diabetes, Bone-related disorder etc.">
                <Chips options={['Yes', 'No']} value={newCondition.answer}
                  onChange={(v: string) => setNewCondition(p => ({ ...p, answer: v }))} testID="new-condition" />
                {newCondition.answer === 'Yes' && (
                  <TextInput style={[s.input, { minHeight: 60, marginTop: 8 }]} multiline placeholder="Details of the new systemic condition..."
                    value={newCondition.details} onChangeText={v => setNewCondition(p => ({ ...p, details: v }))} testID="new-condition-details" />
                )}
              </Field>
            )}
          </View>

          {/* ── General ── */}
          <View style={s.section} testID="followup-general-section">
            <View style={s.sectionHeader}>
              <Ionicons name="happy-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>General</Text>
            </View>
            <Field label="Comfort" required>
              <Chips options={['Yes', 'No']} value={general.comfort} onChange={(v: string) => setGeneral((p: any) => ({ ...p, comfort: v }))} testID="comfort" />
              {general.comfort === 'No' && <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Describe discomfort..." value={general.comfort_details} onChangeText={v => setGeneral((p: any) => ({ ...p, comfort_details: v }))} />}
            </Field>
            <Field label="Pain" required>
              <Chips options={['Yes', 'No']} value={general.pain} onChange={(v: string) => setGeneral((p: any) => ({ ...p, pain: v }))} testID="pain" />
              {general.pain === 'Yes' && <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Describe pain (site, trigger, severity)..." value={general.pain_details} onChangeText={v => setGeneral((p: any) => ({ ...p, pain_details: v }))} />}
            </Field>
            <Field label="Chewing ability" required>
              <Chips options={['Efficient', 'Moderately efficient', 'Not Efficient']} value={general.chewing_ability} onChange={(v: string) => setGeneral((p: any) => ({ ...p, chewing_ability: v }))} testID="chewing" />
            </Field>
            <Field label="Speech" required>
              <Chips options={['Normal', 'Impaired']} value={general.speech} onChange={(v: string) => setGeneral((p: any) => ({ ...p, speech: v }))} testID="speech" />
            </Field>
            <Field label="Esthetics" required>
              <Chips options={['Satisfactory', 'Non-satisfactory']} value={general.esthetics} onChange={(v: string) => setGeneral((p: any) => ({ ...p, esthetics: v }))} testID="esthetics" />
            </Field>
          </View>

          {/* ── Oral Hygiene and Maintenance ── */}
          <View style={s.section} testID="followup-hygiene-section">
            <View style={s.sectionHeader}>
              <Ionicons name="water-outline" size={20} color="#0277BD" />
              <Text style={s.sectionTitle}>Oral Hygiene and Maintenance</Text>
            </View>
            <Field label="Lindquist Plaque index" required>
              <Chips options={['0 – No visible plaque', '1 – Local plaque accumulation', '2 – General plaque accumulation']} value={hygiene.plaque_index} onChange={(v: string) => setHygiene((p: any) => ({ ...p, plaque_index: v }))} testID="plaque-index" />
            </Field>
            <Field label="Hygiene around the prosthesis" required>
              <Chips options={['Good', 'Fair', 'Poor']} value={hygiene.hygiene_prosthesis} onChange={(v: string) => setHygiene((p: any) => ({ ...p, hygiene_prosthesis: v }))} testID="hygiene-prosthesis" />
            </Field>
            <Field label="Hygiene around implant components" required>
              <Chips options={['Good', 'Fair', 'Poor']} value={hygiene.hygiene_components} onChange={(v: string) => setHygiene((p: any) => ({ ...p, hygiene_components: v }))} testID="hygiene-components" />
            </Field>
            <Field label="Access for cleaning" required>
              <Chips options={['Favourable', 'Not favourable']} value={hygiene.access_cleaning} onChange={(v: string) => setHygiene((p: any) => ({ ...p, access_cleaning: v }))} testID="access-cleaning" />
            </Field>
          </View>

          {/* ── Probing Depth ── */}
          <View style={s.section} testID="followup-probing-section">
            <View style={s.sectionHeader}>
              <Ionicons name="analytics-outline" size={20} color="#0D47A1" />
              <Text style={s.sectionTitle}>Probing Depth of Peri-implant Soft Tissue</Text>
            </View>
            <Text style={s.helperText}>
              {prevFU
                ? `Values are compared with the Phase 4 Step 2 baseline AND the ${ordShort(prevFU.number).replace(' FU', ' Follow up')} values. Tap the clock icon for the full history of a site.`
                : 'Values are compared with the Baseline Probing Depth recorded during Phase 4 Step 2.'}
            </Text>
            {implantPositions.map(pos => (
              <View key={pos} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#37474F' }}>Implant site {pos}</Text>
                </View>
                {PROBING_FIELDS.map(([key, lbl]) => {
                  const delta = probingDelta(pos, key);
                  const deltaPrev = probingDeltaPrev(pos, key);
                  return (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ flex: 1, fontSize: 13, color: '#555' }}>{lbl}</Text>
                      {(delta || deltaPrev) && (
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          {delta && (
                            <View style={[s.deltaChip, { backgroundColor: delta.up ? '#FFF3E0' : '#E8F5E9' }]}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: delta.up ? '#E65100' : '#1B5E20' }}>{delta.txt}</Text>
                            </View>
                          )}
                          {deltaPrev && (
                            <View style={[s.deltaChip, { backgroundColor: deltaPrev.up ? '#FFF3E0' : '#E3F2FD' }]}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: deltaPrev.up ? '#E65100' : '#0D47A1' }}>{deltaPrev.txt}</Text>
                            </View>
                          )}
                        </View>
                      )}
                      {priorFollowups.length > 0 && (
                        <TouchableOpacity onPress={() => setHistoryFor({ pos, key, label: lbl })} style={{ padding: 2 }} testID={`probing-history-${pos}-${key}`}>
                          <Ionicons name="time-outline" size={19} color="#1565C0" />
                        </TouchableOpacity>
                      )}
                      <TextInput style={[s.input, { width: 74, textAlign: 'center' }]}
                        value={probing[pos]?.[key] || ''}
                        onChangeText={v => setProbing(prev => ({ ...prev, [pos]: { ...(prev[pos] || {}), [key]: v.replace(/[^0-9.]/g, '') } }))}
                        keyboardType="decimal-pad" placeholder="mm"
                        testID={`probing-${pos}-${key}`} />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* ── Radiograph + 3-way comparison ── */}
          <View style={s.section} testID="followup-radiograph-section">
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#4527A0" />
              <Text style={s.sectionTitle}>Radiograph</Text>
            </View>
            <Text style={s.helperText}>Compare with the Phase 2 and Phase 4 IOPA as the baseline for crestal bone loss.</Text>
            {isFullArch ? (
              <View style={s.uploadRow}>
                <TouchableOpacity style={s.uploadBtn} onPress={() => pickIopa('__opg__')} disabled={uploadingFor === '__opg__'} testID="followup-opg-upload">
                  {uploadingFor === '__opg__' ? <ActivityIndicator size="small" color="#0D47A1" /> : <Ionicons name={opgUpload ? 'checkmark-circle' : 'cloud-upload-outline'} size={16} color="#0D47A1" />}
                  <Text style={s.uploadBtnText}>{opgUpload ? 'OPG uploaded — replace' : 'Upload OPG'}</Text>
                </TouchableOpacity>
              </View>
            ) : implantPositions.map(pos => (
              <View key={pos} style={[s.uploadRow, { marginBottom: 8 }]}>
                <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                <TouchableOpacity style={[s.uploadBtn, { flex: 1 }]} onPress={() => pickIopa(pos)} disabled={uploadingFor === pos} testID={`followup-iopa-${pos}`}>
                  {uploadingFor === pos ? <ActivityIndicator size="small" color="#0D47A1" /> : <Ionicons name={iopaUploads[pos] ? 'checkmark-circle' : 'cloud-upload-outline'} size={16} color={iopaUploads[pos] ? '#1B5E20' : '#0D47A1'} />}
                  <Text style={s.uploadBtnText}>{iopaUploads[pos] ? 'IOPA uploaded — replace' : `Upload IOPA (tooth ${pos})`}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* iter-389: 3-way radiograph comparison — Phase 2 baseline → Phase 4 → this follow-up */}
          {procedure && (
            <View style={{ marginBottom: 16, marginTop: -16 }}>
              <RadiographCompare
                procedure={procedure}
                iopaUploads={iopaUploads}
                opgUpload={opgUpload}
                followupMode={{ phase4ByTooth, phase4Opg, currentLabel: `Current — ${label}` }}
              />
            </View>
          )}

          {/* ── Peri-implant Soft Tissue Assessment — per implant (iter-389) ── */}
          <View style={s.section} testID="followup-soft-tissue-section">
            <View style={s.sectionHeader}>
              <Ionicons name="leaf-outline" size={20} color="#C62828" />
              <Text style={s.sectionTitle}>Peri-implant Soft Tissue Assessment</Text>
            </View>
            <Text style={s.helperText}>Assess each parameter around every implant individually.</Text>
            {implantPositions.map(pos => (
              <View key={pos} style={s.survCard} testID={`soft-tissue-card-${pos}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#37474F' }}>Implant site {pos}</Text>
                </View>
                {SOFT_TISSUE_PARAMS.map(([k, lbl]) => {
                  const e = softTissue[pos]?.[k];
                  return (
                    <Field key={k} label={lbl} required>
                      <Chips options={['Present', 'Absent']} value={e?.status}
                        onChange={(v: string) => setSoftTissueField(pos, k, { status: v })} testID={`${k.replace(/_/g, '-')}-${pos}`} />
                      {e?.status === 'Present' && (
                        <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Details (site, severity)..."
                          value={e?.details || ''} onChangeText={v => setSoftTissueField(pos, k, { details: v })}
                          testID={`${k.replace(/_/g, '-')}-details-${pos}`} />
                      )}
                    </Field>
                  );
                })}
              </View>
            ))}
          </View>

          {/* ── Prosthesis and Occlusion ── */}
          <View style={s.section} testID="followup-prosthesis-section">
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={20} color="#37474F" />
              <Text style={s.sectionTitle}>Prosthesis and Occlusion</Text>
            </View>
            <Field label="Implant mobility (per implant)" required>
              {implantPositions.map(pos => (
                <View key={pos} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <View style={s.toothBadge}><Text style={s.toothBadgeText}>{pos}</Text></View>
                  <TouchableOpacity style={[s.dropdown, { flex: 1 }]} onPress={() => setMobilityModalFor(pos)} testID={`implant-mobility-dropdown-${pos}`}>
                    <Text style={[s.dropdownText, !implantMobility[pos] && { color: '#999' }]} numberOfLines={1}>
                      {implantMobility[pos] || 'Select implant mobility'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#666" />
                  </TouchableOpacity>
                </View>
              ))}
            </Field>
            <Field label="Prosthesis stability" required>
              <Chips options={['Stable', 'Mobile']} value={prosthesis.prosthesis_stability} onChange={(v: string) => setProsthesis((p: any) => ({ ...p, prosthesis_stability: v }))} testID="prosthesis-stability" />
              {prosthesis.prosthesis_stability === 'Mobile' && (
                <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Describe mobility (screw loosening, cement failure...)"
                  value={prosthesis.prosthesis_stability_details} onChangeText={v => setProsthesis((p: any) => ({ ...p, prosthesis_stability_details: v }))} />
              )}
            </Field>
            <Field label="Prosthesis integrity" required>
              <Chips options={['No wear and tear or fracture detected', 'Wear and tear or chipping of the prosthesis', 'Fractured prosthesis']} value={prosthesis.prosthesis_integrity} onChange={(v: string) => setProsthesis((p: any) => ({ ...p, prosthesis_integrity: v }))} testID="prosthesis-integrity" />
            </Field>
            <Field label="Implant component integrity" required>
              <Chips options={['All components are intact', 'Mobile abutment']} value={prosthesis.component_integrity} onChange={(v: string) => setProsthesis((p: any) => ({ ...p, component_integrity: v }))} testID="component-integrity" />
            </Field>
            <Field label="Occlusion in centric and eccentric movements" required>
              <Chips options={['Stable occlusal contacts', 'Heavy occlusal contacts', 'No contacts']} value={prosthesis.occlusion} onChange={(v: string) => setProsthesis((p: any) => ({ ...p, occlusion: v }))} testID="occlusion" />
            </Field>
          </View>

          {/* ── Overdenture (conditional) ── */}
          {isOverdenture && (
            <View style={s.section} testID="followup-overdenture-section">
              <View style={s.sectionHeader}>
                <Ionicons name="albums-outline" size={20} color="#AD1457" />
                <Text style={s.sectionTitle}>Overdenture Assessment</Text>
              </View>
              <Field label="Pressure areas under the base and border extensions" required>
                <Chips options={['Present', 'Absent']} value={overdenture.pressure_areas} onChange={(v: string) => setOverdenture((p: any) => ({ ...p, pressure_areas: v }))} testID="pressure-areas" />
              </Field>
              <Field label="Occlusion and balanced contact" required>
                <Chips options={['Stable occlusal contacts', 'Heavy contacts', 'No contacts']} value={overdenture.occlusion_balanced} onChange={(v: string) => setOverdenture((p: any) => ({ ...p, occlusion_balanced: v }))} testID="occlusion-balanced" />
              </Field>
              <Field label="Attachment integrity" required>
                <Chips options={['Retentive', 'Compromised retention', 'No retention']} value={overdenture.attachment_integrity} onChange={(v: string) => setOverdenture((p: any) => ({ ...p, attachment_integrity: v }))} testID="attachment-integrity" />
              </Field>
              <Field label="Denture hygiene condition" required>
                <Chips options={['Good', 'Fair', 'Poor']} value={overdenture.denture_hygiene} onChange={(v: string) => setOverdenture((p: any) => ({ ...p, denture_hygiene: v }))} testID="denture-hygiene" />
              </Field>
            </View>
          )}

          {/* ── Patient feedback ── */}
          <View style={s.section} testID="followup-feedback-section">
            <View style={s.sectionHeader}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Patient Feedback</Text>
            </View>
            <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline
              placeholder="Any patient complaints or remarks..." value={feedback} onChangeText={setFeedback} testID="patient-feedback" />
          </View>

          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading} testID="followup-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark-done" size={22} color="#FFF" /><Text style={s.submitText}>Submit for Approval</Text></>
              )}
            </TouchableOpacity>
          </View>
          </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Failure reason dropdown modal */}
      <Modal visible={reasonModalFor !== null} transparent animationType="fade" onRequestClose={() => setReasonModalFor(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setReasonModalFor(null)}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E', marginBottom: 10 }}>Reason for failure — Tooth {reasonModalFor}</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {FAILURE_REASONS.map(opt => (
                <TouchableOpacity key={opt} style={s.modalOption}
                  onPress={() => { if (reasonModalFor) setSurvivalField(reasonModalFor, { reason: opt }); setReasonModalFor(null); }}
                  testID={`failure-reason-option-${opt.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                  <Ionicons name={reasonModalFor && survival[reasonModalFor]?.reason === opt ? 'radio-button-on' : 'radio-button-off'} size={18} color="#1565C0" />
                  <Text style={{ flex: 1, fontSize: 13, color: '#333' }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* iter-390: probing site history modal — full chain Baseline → FUs → current */}
      <Modal visible={historyFor !== null} transparent animationType="fade" onRequestClose={() => setHistoryFor(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setHistoryFor(null)}>
          <View style={s.modalCard}>
            {historyFor && (() => {
              const { pos, key, label: siteLbl } = historyFor;
              const baseVal = parseFloat(String((baseline[pos] || baseline['case'] || {})[key] ?? ''));
              const rows: { label: string; date?: string; value: number | null }[] = [
                { label: 'Baseline — Phase 4 Step 2', value: isNaN(baseVal) ? null : baseVal },
                ...priorFollowups.map((f: any) => {
                  const v = parseFloat(String(f.probing_depths?.[pos]?.[key] ?? ''));
                  return { label: f.label, date: f.date, value: isNaN(v) ? null : v };
                }),
              ];
              const cur = parseFloat(probing[pos]?.[key] || '');
              rows.push({ label: 'Current — this appointment', value: isNaN(cur) ? null : cur });
              const base = rows[0].value;
              return (
                <>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E' }}>{siteLbl}</Text>
                  <Text style={{ fontSize: 12, color: '#78909C', marginBottom: 12 }}>Tooth {pos} — history across appointments</Text>
                  {rows.map((r, i) => {
                    const d = r.value != null && base != null && i > 0 ? +(r.value - base).toFixed(1) : null;
                    return (
                      <View key={i} style={s.histRow} testID={`probing-history-row-${i}`}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#37474F' }}>{r.label}</Text>
                          {r.date ? <Text style={{ fontSize: 10.5, color: '#90A4AE' }}>{r.date}</Text> : null}
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0D47A1', minWidth: 56, textAlign: 'right' }}>
                          {r.value != null ? `${r.value} mm` : '—'}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', minWidth: 92, textAlign: 'right', color: d == null ? '#B0BEC5' : d > 0 ? '#E65100' : '#1B5E20' }}>
                          {d == null ? (i === 0 ? 'baseline' : '—') : d === 0 ? '= baseline' : `${d > 0 ? '+' : ''}${d} vs baseline`}
                        </Text>
                      </View>
                    );
                  })}
                  <TouchableOpacity style={[s.submitBtn, { marginTop: 14, padding: 12 }]} onPress={() => setHistoryFor(null)} testID="probing-history-close">
                    <Text style={s.submitText}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Implant mobility dropdown modal (per implant) */}
      <Modal visible={mobilityModalFor !== null} transparent animationType="fade" onRequestClose={() => setMobilityModalFor(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setMobilityModalFor(null)}>
          <View style={s.modalCard}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E', marginBottom: 10 }}>Implant Mobility — Tooth {mobilityModalFor}</Text>
            {MOBILITY_OPTIONS.map(opt => (
              <TouchableOpacity key={opt} style={s.modalOption}
                onPress={() => { if (mobilityModalFor) setImplantMobility(prev => ({ ...prev, [mobilityModalFor]: opt })); setMobilityModalFor(null); }}
                testID={`mobility-option-${MOBILITY_OPTIONS.indexOf(opt)}`}>
                <Ionicons name={mobilityModalFor && implantMobility[mobilityModalFor] === opt ? 'radio-button-on' : 'radio-button-off'} size={18} color="#1565C0" />
                <Text style={{ flex: 1, fontSize: 13, color: '#333' }}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingBottom: 32, paddingTop: 8 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#555' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#FAFAFA', minHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  chipText: { fontSize: 12.5, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  toothBadge: { backgroundColor: '#0D47A1', borderRadius: 6, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toothBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#90CAF9' },
  uploadBtnText: { fontSize: 12, fontWeight: '700', color: '#0D47A1' },
  deltaChip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 13, color: '#333', flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0F4F7' },
  // iter-389 — Phase-2-style survival review pills + per-implant cards
  gateQ: { fontSize: 15, fontWeight: '800', color: '#1A1A2E' },
  gatePill: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#CFD8DC', backgroundColor: '#F8FAFC', alignItems: 'center' },
  gatePillOn: { borderColor: '#1565C0', backgroundColor: '#1565C0' },
  gatePillT: { fontSize: 14, fontWeight: '800', color: '#546E7A' },
  gatePillTOn: { color: '#FFF' },
  survCard: { borderWidth: 1, borderColor: '#E0E7EE', borderRadius: 10, padding: 12, marginTop: 10, backgroundColor: '#FAFCFD' },
  pillSm: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', backgroundColor: '#F8FAFC' },
  pillSmOn: { borderColor: '#2E7D32', backgroundColor: '#2E7D32' },
  pillSmOnR: { borderColor: '#C62828', backgroundColor: '#C62828' },
  pillSmT: { fontSize: 12, fontWeight: '800', color: '#546E7A' },
  pillSmTOn: { color: '#FFF' },
});
