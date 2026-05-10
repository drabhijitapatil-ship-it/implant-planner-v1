/**
 * iter-211 — New Case with Existing Implants (Path A: replace prosthesis only)
 *
 * Patients walking in with implants already placed (elsewhere / earlier) who
 * need a fresh prosthetic plan. Skips Phases 1-3; the case lands directly
 * in the Phase 4 Step 1 inbox of the assigned implant in-charge.
 *
 * Captures:
 *   • Patient block (mandatory: name, age, sex, MR#, contact)
 *   • Existing implant inventory (Tooth # mandatory; system fields optional;
 *     `system_unknown` checkbox for transferred / foreign / undocumented cases)
 *   • Prosthesis history (was a prosthesis ever placed? did it fail? why?)
 *   • Failure analysis: structured chips (category / mode / suspected cause)
 *     + free-text narrative + photo/radiograph upload (object-store reuse)
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  StyleSheet, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

// ── Controlled vocabularies (kept short & clinically common) ──
const PROSTHESIS_TYPES = [
  'Single Crown', 'Bridge', 'Bar Overdenture', 'Locator Overdenture',
  'Hybrid', 'All-on-X',
];
const PROSTHESIS_MATERIALS = [
  'PFM', 'Monolithic Zirconia', 'Layered Zirconia', 'Lithium Disilicate',
  'Acrylic + Metal', 'PEEK', 'Composite', 'Other',
];
const FAILURE_CATEGORIES = ['Mechanical', 'Biological', 'Esthetic', 'Functional'];
const FAILURE_MODES = [
  'Porcelain chipping', 'Zirconia fracture', 'Framework fracture',
  'Screw loosening', 'Screw fracture', 'Abutment fracture',
  'Decementation', 'Retention loss', 'Occlusal wear',
  'Peri-implantitis', 'Peri-implant mucositis', 'Implant mobility',
  'Soft-tissue recession', 'Pink-white esthetic failure',
  'Phonetic issue', 'Food impaction',
];
const ROOT_CAUSES = [
  'Occlusal overload', 'Parafunction (bruxism)', 'Design flaw',
  'Material choice', 'Surgical placement angle', 'Hygiene',
  'Cement remnants', 'Infection', 'Lab error', 'Patient compliance',
];

const TIME_SLOTS = ['10:00', '14:00'];

type ImplantRow = {
  tooth: string;
  system_unknown: boolean;
  brand: string;
  system: string;
  connection_type: string;
  platform: string;
  diameter_mm: string;
  length_mm: string;
  gingival_height_mm: string;
  surgery_date: string;
  original_surgeon: string;
  abutment_present: '' | 'yes' | 'no';
  notes: string;
};

const blankImplantRow = (): ImplantRow => ({
  tooth: '',
  system_unknown: false,
  brand: '',
  system: '',
  connection_type: '',
  platform: '',
  diameter_mm: '',
  length_mm: '',
  gingival_height_mm: '',
  surgery_date: '',
  original_surgeon: '',
  abutment_present: '',
  notes: '',
});

export default function NewExistingImplantCase() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ patient_name?: string; mr?: string }>();

  // Patient block
  const [patient_name, setPatientName] = useState(params.patient_name || '');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [profession, setProfession] = useState('');
  const [mobile_number, setMobile] = useState('');
  const [patient_email, setEmail] = useState('');
  const [registration_number, setMR] = useState(params.mr || '');
  const [chief_complaint, setChiefComplaint] = useState('');

  // Faculty block
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [incharges, setIncharges] = useState<any[]>([]);
  const [supervisor_id, setSupervisorId] = useState('');
  const [supervisor_name, setSupervisorName] = useState('');
  const [implant_incharge_id, setInchargeId] = useState('');
  const [implant_incharge_name, setInchargeName] = useState('');

  // Scheduling + admin
  const [receipt_number, setReceipt] = useState('');
  const [amount_paid, setAmount] = useState('');
  const [procedure_date, setDate] = useState('');
  const [procedure_time, setTime] = useState('');

  // Implants + history
  const [implants, setImplants] = useState<ImplantRow[]>([blankImplantRow()]);
  const [had_prosthesis, setHadProsthesis] = useState(false);
  const [prosthesis_type, setProsthesisType] = useState('');
  const [material, setMaterial] = useState('');
  const [placement_date, setPlacementDate] = useState('');
  const [lab_name, setLabName] = useState('');
  const [failed, setFailed] = useState(false);
  const [failure_categories, setFailureCategories] = useState<string[]>([]);
  const [failure_modes, setFailureModes] = useState<string[]>([]);
  const [suspected_root_causes, setSuspectedCauses] = useState<string[]>([]);
  const [failure_narrative, setNarrative] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);

  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Faculty list ──
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/users');
        const users = res.data || [];
        setSupervisors(users.filter((u: any) => u.role === 'supervisor' || u.role === 'implant_incharge'));
        setIncharges(users.filter((u: any) => u.role === 'implant_incharge'));
      } catch (e) { /* silent */ }
    })();
  }, []);

  // ── Helpers ──
  const toggleArr = (arr: string[], setter: (n: string[]) => void, val: string) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };
  const updateImplant = (idx: number, key: keyof ImplantRow, val: any) => {
    setImplants(prev => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  };
  const addImplant = () => setImplants(prev => [...prev, blankImplantRow()]);
  const removeImplant = (idx: number) => {
    if (implants.length === 1) {
      Alert.alert('At least one implant required', 'Add details for the existing implant in this row, or cancel the case if there are none.');
      return;
    }
    setImplants(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Photo / radiograph upload (re-uses existing object-store endpoint) ──
  const pickFailureMedia = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please grant photo library access.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: false,
      });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      const asset = result.assets[0];
      const formData = new FormData();
      // @ts-ignore — RN FormData blob shape
      formData.append('file', { uri: asset.uri, name: asset.fileName || `failure-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' });
      const up = await api.post('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = up.data?.url || up.data?.public_url || up.data?.objectKey;
      if (url) setAttachments(prev => [...prev, url]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || e?.message || 'Could not upload media.');
    } finally {
      setUploading(false);
    }
  };

  // ── Submit ──
  const validate = (): string | null => {
    if (!patient_name.trim()) return 'Patient name is required.';
    if (!registration_number.trim()) return 'MR / Registration number is required.';
    if (!supervisor_id) return 'Please select a supervisor.';
    if (!implant_incharge_id) return 'Please select an implant in-charge.';
    if (!receipt_number.trim()) return 'Receipt number is required.';
    if (!amount_paid || isNaN(parseFloat(amount_paid))) return 'Amount paid must be a number.';
    if (!procedure_date) return 'Pick a prosthodontic appointment date.';
    if (!procedure_time) return 'Pick an appointment time slot.';
    for (let i = 0; i < implants.length; i++) {
      if (!implants[i].tooth.trim()) return `Tooth # is required for Implant #${i + 1}.`;
    }
    if (failed && failure_categories.length === 0) {
      return 'Pick at least one failure category (Mechanical / Biological / Esthetic / Functional).';
    }
    return null;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert('Missing info', err); return; }
    setSubmitting(true);
    try {
      const payload = {
        student_name: user?.role === 'student' ? user?.name || '' : '',
        patient_name: patient_name.trim(),
        age, sex, profession,
        mobile_number, patient_email,
        registration_number: registration_number.trim(),
        chief_complaint,
        supervisor_id, supervisor_name,
        implant_incharge_id, implant_incharge_name,
        receipt_number: receipt_number.trim(),
        amount_paid: parseFloat(amount_paid),
        procedure_date, procedure_time,
        existing_implants: implants.map(r => ({
          tooth: r.tooth.trim(),
          system_unknown: r.system_unknown,
          brand: r.system_unknown ? null : (r.brand.trim() || null),
          system: r.system_unknown ? null : (r.system.trim() || null),
          connection_type: r.system_unknown ? null : (r.connection_type.trim() || null),
          platform: r.system_unknown ? null : (r.platform.trim() || null),
          diameter_mm: r.diameter_mm ? parseFloat(r.diameter_mm) : null,
          length_mm: r.length_mm ? parseFloat(r.length_mm) : null,
          gingival_height_mm: r.gingival_height_mm ? parseFloat(r.gingival_height_mm) : null,
          surgery_date: r.surgery_date.trim() || null,
          original_surgeon: r.original_surgeon.trim() || null,
          abutment_present: r.abutment_present === '' ? null : r.abutment_present === 'yes',
          notes: r.notes.trim() || null,
        })),
        prosthesis_history: {
          had_prosthesis,
          prosthesis_type: prosthesis_type || null,
          material: material || null,
          placement_date: placement_date || null,
          lab_name: lab_name || null,
          failed,
          failure_categories,
          failure_modes,
          suspected_root_causes,
          failure_narrative: failure_narrative.trim() || null,
          attachments,
        },
        remark,
      };
      const res = await api.post('/procedures/with-existing-implants', payload);
      Alert.alert(
        'Case created',
        `Case ${res.data?.case_id ? `(${res.data.case_id}) ` : ''}created. Surgical phases skipped — landing in Phase 4 Step 1 inbox.`,
        [{ text: 'Open case', onPress: () => router.replace(`/procedures/${res.data.id}`) }],
      );
    } catch (e: any) {
      Alert.alert('Could not create case', e?.response?.data?.detail || e?.message || 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Renderable chip helper ──
  const Chip = ({ label, active, onPress, testID }: any) => (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      testID={testID}
      /* @ts-ignore */ data-testid={testID}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#37474F" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Case — Existing Implants</Text>
      </View>

      <View style={s.banner}>
        <Ionicons name="information-circle" size={18} color="#0277BD" />
        <Text style={s.bannerText}>
          For patients with implants already placed who need a fresh prosthesis. Surgical phases (1–3) are skipped — the case lands directly in the Phase 4 Step 1 inbox.
        </Text>
      </View>

      {/* Patient */}
      <Section title="Patient Details" icon="person">
        <Field label="Patient Name *" value={patient_name} onChange={setPatientName} testID="ei-patient-name" />
        <View style={s.twoCol}>
          <Field label="Age" value={age} onChange={setAge} keyboardType="numeric" cellStyle={s.flex1} testID="ei-age" />
          <Field label="Sex" value={sex} onChange={setSex} cellStyle={s.flex1} testID="ei-sex" />
        </View>
        <Field label="Profession" value={profession} onChange={setProfession} testID="ei-profession" />
        <View style={s.twoCol}>
          <Field label="Mobile" value={mobile_number} onChange={setMobile} keyboardType="phone-pad" cellStyle={s.flex1} testID="ei-mobile" />
          <Field label="Email" value={patient_email} onChange={setEmail} keyboardType="email-address" cellStyle={s.flex1} testID="ei-email" />
        </View>
        <Field label="MR / Registration # *" value={registration_number} onChange={setMR} testID="ei-mr" />
        <Field label="Chief Complaint" value={chief_complaint} onChange={setChiefComplaint} multiline testID="ei-cc" />
      </Section>

      {/* Faculty + Scheduling */}
      <Section title="Faculty & Appointment" icon="calendar">
        <Picker
          label="Supervisor *"
          value={supervisor_name}
          options={supervisors.map(u => ({ value: u._id || u.id, label: u.name }))}
          onPick={(opt) => { setSupervisorId(opt.value); setSupervisorName(opt.label); }}
          testID="ei-supervisor"
        />
        <Picker
          label="Implant In-Charge *"
          value={implant_incharge_name}
          options={incharges.map(u => ({ value: u._id || u.id, label: u.name }))}
          onPick={(opt) => { setInchargeId(opt.value); setInchargeName(opt.label); }}
          testID="ei-incharge"
        />
        <View style={s.twoCol}>
          <Field label="Receipt # *" value={receipt_number} onChange={setReceipt} cellStyle={s.flex1} testID="ei-receipt" />
          <Field label="Amount Paid (₹) *" value={amount_paid} onChange={setAmount} keyboardType="numeric" cellStyle={s.flex1} testID="ei-amount" />
        </View>
        <Field label="Appointment Date * (YYYY-MM-DD)" value={procedure_date} onChange={setDate} placeholder="2026-03-15" testID="ei-date" />
        <Text style={s.fieldLabel}>Time Slot *</Text>
        <View style={s.chipsRow}>
          {TIME_SLOTS.map(t => (
            <Chip key={t} label={t === '10:00' ? '10:00 AM' : '2:00 PM'} active={procedure_time === t} onPress={() => setTime(t)} testID={`ei-time-${t}`} />
          ))}
        </View>
      </Section>

      {/* Existing Implants */}
      <Section title={`Existing Implants (${implants.length})`} icon="medical">
        <Text style={s.helper}>Tooth # is mandatory. If the patient genuinely doesn't know the implant system, tick "System Unknown" — the Lab Slip will print "system unknown — verify clinically".</Text>
        {implants.map((row, idx) => (
          <View key={idx} style={s.implantCard} testID={`ei-implant-${idx}`}>
            <View style={s.implantHeader}>
              <Text style={s.implantTitle}>Implant #{idx + 1}</Text>
              <TouchableOpacity onPress={() => removeImplant(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ei-implant-remove-${idx}`}>
                <Ionicons name="trash-outline" size={18} color="#C62828" />
              </TouchableOpacity>
            </View>
            <View style={s.twoCol}>
              <Field label="Tooth # *" value={row.tooth} onChange={(t) => updateImplant(idx, 'tooth', t)} cellStyle={s.flex1} placeholder="e.g. 16" testID={`ei-implant-tooth-${idx}`} />
              <View style={s.flex1}>
                <TouchableOpacity
                  style={[s.unknownChip, row.system_unknown && s.unknownChipActive]}
                  onPress={() => updateImplant(idx, 'system_unknown', !row.system_unknown)}
                  testID={`ei-implant-unknown-${idx}`}
                  /* @ts-ignore */ data-testid={`ei-implant-unknown-${idx}`}
                >
                  <Ionicons name={row.system_unknown ? 'checkbox' : 'square-outline'} size={16} color={row.system_unknown ? '#FFF' : '#0277BD'} />
                  <Text style={[s.unknownText, row.system_unknown && s.unknownTextActive]}>System Unknown</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!row.system_unknown && (
              <>
                <View style={s.twoCol}>
                  <Field label="Brand" value={row.brand} onChange={(t) => updateImplant(idx, 'brand', t)} cellStyle={s.flex1} placeholder="Nobel / Neodent / Alpha Bio…" />
                  <Field label="System" value={row.system} onChange={(t) => updateImplant(idx, 'system', t)} cellStyle={s.flex1} placeholder="SPI / Drive GM / NeO IH" />
                </View>
                <View style={s.twoCol}>
                  <Field label="Connection" value={row.connection_type} onChange={(t) => updateImplant(idx, 'connection_type', t)} cellStyle={s.flex1} placeholder="Conical / Internal Hex" />
                  <Field label="Platform" value={row.platform} onChange={(t) => updateImplant(idx, 'platform', t)} cellStyle={s.flex1} placeholder="NP / RP / WP" />
                </View>
                <View style={s.threeCol}>
                  <Field label="Ø (mm)" value={row.diameter_mm} onChange={(t) => updateImplant(idx, 'diameter_mm', t)} keyboardType="numeric" cellStyle={s.flex1} />
                  <Field label="Length (mm)" value={row.length_mm} onChange={(t) => updateImplant(idx, 'length_mm', t)} keyboardType="numeric" cellStyle={s.flex1} />
                  <Field label="GH (mm)" value={row.gingival_height_mm} onChange={(t) => updateImplant(idx, 'gingival_height_mm', t)} keyboardType="numeric" cellStyle={s.flex1} />
                </View>
              </>
            )}
            <View style={s.twoCol}>
              <Field label="Surgery Date" value={row.surgery_date} onChange={(t) => updateImplant(idx, 'surgery_date', t)} cellStyle={s.flex1} placeholder="2024-08 (approx OK)" />
              <Field label="Original Surgeon" value={row.original_surgeon} onChange={(t) => updateImplant(idx, 'original_surgeon', t)} cellStyle={s.flex1} />
            </View>
            <Text style={s.fieldLabel}>Healing / Final Abutment Present?</Text>
            <View style={s.chipsRow}>
              {[['', 'Unknown'], ['yes', 'Yes'], ['no', 'No']].map(([v, lbl]) => (
                <Chip key={String(v)} label={lbl} active={row.abutment_present === v} onPress={() => updateImplant(idx, 'abutment_present', v)} />
              ))}
            </View>
            <Field label="Notes" value={row.notes} onChange={(t) => updateImplant(idx, 'notes', t)} multiline placeholder="Any clinical observation about this implant" />
          </View>
        ))}
        <TouchableOpacity style={s.addBtn} onPress={addImplant} testID="ei-add-implant">
          <Ionicons name="add-circle-outline" size={18} color="#0277BD" />
          <Text style={s.addBtnText}>Add another implant</Text>
        </TouchableOpacity>
      </Section>

      {/* Prosthesis History */}
      <Section title="Prosthesis History" icon="cube">
        <View style={s.toggleRow}>
          <Text style={s.fieldLabel}>Was a prosthesis ever placed?</Text>
          <TouchableOpacity
            style={[s.toggle, had_prosthesis && s.toggleActive]}
            onPress={() => setHadProsthesis(v => !v)}
            testID="ei-had-prosthesis"
            /* @ts-ignore */ data-testid="ei-had-prosthesis"
          >
            <Text style={[s.toggleText, had_prosthesis && s.toggleTextActive]}>{had_prosthesis ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        </View>
        {had_prosthesis && (
          <>
            <Text style={s.fieldLabel}>Prosthesis Type</Text>
            <View style={s.chipsRow}>
              {PROSTHESIS_TYPES.map(t => (
                <Chip key={t} label={t} active={prosthesis_type === t} onPress={() => setProsthesisType(t)} />
              ))}
            </View>
            <Text style={s.fieldLabel}>Material</Text>
            <View style={s.chipsRow}>
              {PROSTHESIS_MATERIALS.map(m => (
                <Chip key={m} label={m} active={material === m} onPress={() => setMaterial(m)} />
              ))}
            </View>
            <View style={s.twoCol}>
              <Field label="Placement Date" value={placement_date} onChange={setPlacementDate} cellStyle={s.flex1} placeholder="YYYY-MM (approx OK)" />
              <Field label="Lab Name" value={lab_name} onChange={setLabName} cellStyle={s.flex1} />
            </View>

            <View style={s.toggleRow}>
              <Text style={s.fieldLabel}>Did the prosthesis fail?</Text>
              <TouchableOpacity
                style={[s.toggle, failed && s.toggleFailed]}
                onPress={() => setFailed(v => !v)}
                testID="ei-failed-toggle"
                /* @ts-ignore */ data-testid="ei-failed-toggle"
              >
                <Text style={[s.toggleText, failed && { color: '#FFF' }]}>{failed ? 'Yes — Failed' : 'No'}</Text>
              </TouchableOpacity>
            </View>

            {failed && (
              <View style={s.failureBlock}>
                <Text style={s.failureTitle}>Failure Analysis</Text>
                <Text style={s.fieldLabel}>Failure Category *</Text>
                <View style={s.chipsRow}>
                  {FAILURE_CATEGORIES.map(c => (
                    <Chip key={c} label={c} active={failure_categories.includes(c)} onPress={() => toggleArr(failure_categories, setFailureCategories, c)} testID={`ei-fc-${c}`} />
                  ))}
                </View>
                <Text style={s.fieldLabel}>Specific Modes</Text>
                <View style={s.chipsRow}>
                  {FAILURE_MODES.map(m => (
                    <Chip key={m} label={m} active={failure_modes.includes(m)} onPress={() => toggleArr(failure_modes, setFailureModes, m)} />
                  ))}
                </View>
                <Text style={s.fieldLabel}>Suspected Root Cause</Text>
                <View style={s.chipsRow}>
                  {ROOT_CAUSES.map(c => (
                    <Chip key={c} label={c} active={suspected_root_causes.includes(c)} onPress={() => toggleArr(suspected_root_causes, setSuspectedCauses, c)} />
                  ))}
                </View>
                <Field
                  label="Failure Narrative (max 500 chars)"
                  value={failure_narrative}
                  onChange={(t) => t.length <= 500 && setNarrative(t)}
                  multiline
                  testID="ei-narrative"
                />
                <Text style={{ fontSize: 11, color: '#666', alignSelf: 'flex-end', marginBottom: 8 }}>
                  {failure_narrative.length} / 500
                </Text>
                <Text style={s.fieldLabel}>Photo / Radiograph of Failure</Text>
                <View style={s.attachmentsRow}>
                  {attachments.map((url, i) => (
                    <View key={i} style={s.attachmentChip}>
                      <Ionicons name="image" size={14} color="#0277BD" />
                      <Text style={s.attachmentName}>Attachment {i + 1}</Text>
                      <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                        <Ionicons name="close-circle" size={16} color="#C62828" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={s.uploadBtn} onPress={pickFailureMedia} disabled={uploading} testID="ei-upload">
                  {uploading
                    ? <ActivityIndicator size="small" color="#0277BD" />
                    : <><Ionicons name="cloud-upload-outline" size={18} color="#0277BD" /><Text style={s.uploadText}>Upload photo / radiograph</Text></>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </Section>

      <Field label="Operator / Faculty Remarks" value={remark} onChange={setRemark} multiline />

      <TouchableOpacity
        style={[s.submitBtn, submitting && { opacity: 0.6 }]}
        onPress={onSubmit}
        disabled={submitting}
        testID="ei-submit"
      >
        {submitting
          ? <ActivityIndicator color="#FFF" />
          : <><Ionicons name="checkmark-done-circle" size={20} color="#FFF" /><Text style={s.submitText}>Create Case</Text></>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Sub-components (kept inline to avoid file proliferation) ──
const Section: React.FC<{ title: string; icon: any; children: any }> = ({ title, icon, children }) => (
  <View style={s.section}>
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={18} color="#0277BD" />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const Field: React.FC<any> = ({ label, value, onChange, multiline, keyboardType, placeholder, cellStyle, testID }) => (
  <View style={[{ marginBottom: 10 }, cellStyle]}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput
      style={[s.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
      value={value}
      onChangeText={onChange}
      multiline={multiline}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#90A4AE"
      testID={testID}
      /* @ts-ignore */ data-testid={testID}
    />
  </View>
);

const Picker: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onPick: (o: any) => void; testID?: string }> = ({ label, value, options, onPick, testID }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.input} onPress={() => setOpen(true)} testID={testID} /* @ts-ignore */ data-testid={testID}>
        <Text style={{ color: value ? '#1A1A1A' : '#90A4AE' }}>{value || 'Select…'}</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((o, i) => (
                <TouchableOpacity key={i} style={s.modalRow} onPress={() => { onPick(o); setOpen(false); }}>
                  <Text style={s.modalRowText}>{o.label}</Text>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0D3B66' },
  banner: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#E1F5FE', borderRadius: 10, borderWidth: 1, borderColor: '#B3E5FC', marginBottom: 12 },
  bannerText: { fontSize: 12, color: '#01579B', flex: 1, lineHeight: 18 },
  section: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFF1' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0277BD' },
  helper: { fontSize: 12, color: '#607D8B', marginBottom: 8, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#37474F', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A1A1A', backgroundColor: '#FFF' },
  twoCol: { flexDirection: 'row', gap: 8 },
  threeCol: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#01579B' },
  chipTextActive: { color: '#FFF' },
  implantCard: { backgroundColor: '#F8FBFF', borderRadius: 10, borderWidth: 1, borderColor: '#BBDEFB', padding: 10, marginBottom: 10 },
  implantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  implantTitle: { fontSize: 13, fontWeight: '700', color: '#01579B' },
  unknownChip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#0277BD', backgroundColor: '#FFF', marginTop: 18 },
  unknownChipActive: { backgroundColor: '#0277BD' },
  unknownText: { fontSize: 12, fontWeight: '600', color: '#0277BD' },
  unknownTextActive: { color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF', marginTop: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#0277BD' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  toggle: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  toggleActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  toggleFailed: { backgroundColor: '#C62828', borderColor: '#C62828' },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#01579B' },
  toggleTextActive: { color: '#FFF' },
  failureBlock: { borderTopWidth: 1, borderTopColor: '#FFCDD2', paddingTop: 10, marginTop: 8, backgroundColor: '#FFF8F8', borderRadius: 8, padding: 10 },
  failureTitle: { fontSize: 13, fontWeight: '800', color: '#C62828', marginBottom: 8, letterSpacing: 0.3 },
  attachmentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#B3E5FC', backgroundColor: '#E1F5FE' },
  attachmentName: { fontSize: 11, color: '#01579B', fontWeight: '600' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  uploadText: { fontSize: 12, fontWeight: '700', color: '#0277BD' },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#0277BD', paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#0277BD', marginBottom: 8 },
  modalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  modalRowText: { fontSize: 14, color: '#1A1A1A' },
});
