import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api, { getAuthFileUrl, getToken } from '../../../utils/api';
import { showUploadPicker } from '../../../utils/uploadPicker';
import { useAuth } from '../../../contexts/AuthContext';
import BackToDashboard from '../../../components/BackToDashboard';
import { PhaseHeader } from '../../../components/PhaseHeader';
import { Ionicons } from '@expo/vector-icons';
import {
  CHECKLIST_DATA,
  FLAP_DESIGN_OPTIONS,
  DRILLING_TYPE_OPTIONS,
  PROSTHETIC_COMPONENT_OPTIONS,
} from '../../../constants/checklist';
import { getCuffHeightsFor } from '../../../constants/attachmentCuffCatalogue';

export default function Phase2SubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge';
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);

  // Pre-Surgery Checklist
  const [preSurgeryChecklist, setPreSurgeryChecklist] = useState<Record<string, boolean>>({});

  // Surgical Procedure
  const [anesthesiaAdequate, setAnesthesiaAdequate] = useState('Yes');
  const [anesthesiaDetails, setAnesthesiaDetails] = useState('');
  const [flapDesign, setFlapDesign] = useState('');
  const [flapOpen, setFlapOpen] = useState(false);
  const [drillingType, setDrillingType] = useState('');
  const [drillingOpen, setDrillingOpen] = useState(false);
  const [implantSeated, setImplantSeated] = useState(true);
  const [implantSeatedComment, setImplantSeatedComment] = useState('');
  const [torqueValues, setTorqueValues] = useState<string[]>([]);
  const [implantPositions, setImplantPositions] = useState<string[]>([]);
  const [boneGraftUsed, setBoneGraftUsed] = useState(false);
  const [boneGraftDetails, setBoneGraftDetails] = useState('');
  const [implantOtherNotes, setImplantOtherNotes] = useState('');
  const [prostheticComponent, setProstheticComponent] = useState('');
  const [prostheticOpen, setProstheticOpen] = useState(false);
  // Immediate Loading prosthesis type (visible only when Prosthetic Component === 'Immediate Loading Done').
  // Option set depends on Phase 1 procedure_type + teeth count per user spec.
  const [prosthesisType, setProsthesisType] = useState('');
  const [prosthesisTypeOpen, setProsthesisTypeOpen] = useState(false);
  const [prosthesisTypeOther, setProsthesisTypeOther] = useState('');
  const [teethCount, setTeethCount] = useState(0);
  const [healingAbutmentCuffHeight, setHealingAbutmentCuffHeight] = useState<string[]>(['']);
  const [accessChannelOpenings, setAccessChannelOpenings] = useState<string[]>([]);
  const [suturesPlaced, setSuturesPlaced] = useState(true);
  const [hemostasisAchieved, setHemostasisAchieved] = useState(true);

  // Post-Operative Checklist
  const [postOpChecklist, setPostOpChecklist] = useState<Record<string, boolean>>({});

  // Post Surgical Radiograph uploads
  const [procedureType, setProcedureType] = useState('');
  // iter-138: Phase-1 "Type of Attachment" (if any) so Phase 2 can auto-suggest
  // the manufacturer-recommended cuff-height variants instead of free text.
  const [attachmentType, setAttachmentType] = useState('');
  const [openCuffPicker, setOpenCuffPicker] = useState<number | null>(null);
  // iter-139: Phase-1 loading_type so Phase 2 can show the Multi-unit Abutment
  // flow only for full-arch Immediate Loading cases.
  // Phase-1 stores loading_type as a multi-select string[] (e.g. ['Immediate Loading']).
  // We keep the state as an array and gate the MUA UI via Array.includes below.
  const [loadingType, setLoadingType] = useState<string[]>([]);
  // '' = not yet chosen (forces explicit pick), 'yes' | 'no' once user picks.
  const [multiUnitPlaced, setMultiUnitPlaced] = useState<'' | 'yes' | 'no'>('');
  // Per-implant angulation (°) and cuff-height (mm) — same length as
  // implantPositions. Populated only when multiUnitPlaced === 'yes'.
  const [muaAngulation, setMuaAngulation] = useState<string[]>([]);
  const [muaCuffHeight, setMuaCuffHeight] = useState<string[]>([]);
  const [iopaFiles, setIopaFiles] = useState<(null | { filename: string; original_name: string; tooth_label: string })[]>([]);
  const [opgFile, setOpgFile] = useState<null | { filename: string; original_name: string }>(null);
  const [extraIopaCount, setExtraIopaCount] = useState(0);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [opgUploading, setOpgUploading] = useState(false);
  const [authToken, setAuthToken] = useState('');

  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);

  const FULL_ARCH_SET = new Set(['All on 4', 'All on 6', 'All on X']);
  const isFullArch = FULL_ARCH_SET.has(procedureType);
  const isSingleImplant = procedureType === 'Single Conventional Implant';

  // Notes
  const [studentNotes, setStudentNotes] = useState('');

  useEffect(() => { loadImplantPlan(); }, []);

  const loadImplantPlan = async () => {
    try {
      // Fetch implant plan and procedure data in parallel
      const [planRes, procRes] = await Promise.all([
        api.get(`/procedures/${id}/implant-plan`),
        api.get(`/procedures/${id}`),
      ]);
      const count = planRes.data.number_of_implants || 1;
      const positions = (planRes.data.implant_plans || []).map((p: any) => p.position);
      setImplantPositions(positions);
      setTorqueValues(new Array(count).fill(''));
      setHealingAbutmentCuffHeight(new Array(count).fill(''));
      setAccessChannelOpenings(new Array(count).fill(''));
      // iter-139: seed MUA arrays to match implant count. Resets on every load.
      setMuaAngulation(new Array(count).fill(''));
      setMuaCuffHeight(new Array(count).fill(''));

      const pType = procRes.data.implant_procedure_type || '';
      setProcedureType(pType);
      // Load the Phase-1 attachment choice so the cuff-height field below can
      // render a catalogue-constrained dropdown instead of free text.
      setAttachmentType(procRes.data.attachment_type || '');
      setLoadingType(Array.isArray(procRes.data.loading_type) ? procRes.data.loading_type : (procRes.data.loading_type ? [procRes.data.loading_type] : []));
      // teeth_present drives the Group A (single) vs Group B (multiple) split
      // for Prosthesis Type options when one of the 4 overlapping procedure
      // types (Immediate Implant, PET, GBR, Guided Surgery) is chosen.
      const teeth = Array.isArray(procRes.data.teeth_present) ? procRes.data.teeth_present : [];
      setTeethCount(teeth.length);

      // Determine IOPA slot count
      let iopaCount: number;
      if (pType === 'All on 4') iopaCount = 4;
      else if (pType === 'All on 6') iopaCount = 6;
      else if (pType === 'All on X') iopaCount = 5;
      else iopaCount = count;
      setIopaFiles(new Array(iopaCount).fill(null));
    } catch {
      setTorqueValues(['']);
      setHealingAbutmentCuffHeight(['']);
      setIopaFiles([null]);
    }
  };

  const togglePreSurgery = (itemId: string) => {
    setPreSurgeryChecklist(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const togglePostOp = (itemId: string, val?: boolean) => {
    setPostOpChecklist(prev => ({ ...prev, [itemId]: val !== undefined ? val : !prev[itemId] }));
  };

  // ── IOPA / OPG Upload helpers ──
  const getIopaLabel = (idx: number): string => {
    if (isFullArch) return `Implant ${idx + 1}`;
    return implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : `Implant ${idx + 1}`;
  };

  const totalIopaSlots = iopaFiles.length + extraIopaCount;

  const pickIopaFile = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
      if (!picked) return;
      setUploadingIdx(idx);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri, name: picked.name || 'iopa.jpg', type: picked.type || 'image/jpeg',
      } as any);
      const res = await api.post('/uploads/cbct-temp', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const allFiles = [...iopaFiles];
      // Expand if extra slot
      while (allFiles.length <= idx) allFiles.push(null);
      allFiles[idx] = {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        tooth_label: getIopaLabel(idx),
      };
      setIopaFiles(allFiles);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload IOPA');
    } finally {
      setUploadingIdx(null);
    }
  };

  const pickOpgFile = async () => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']);
      if (!picked) return;
      setOpgUploading(true);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri, name: picked.name || 'opg.jpg', type: picked.type || 'image/jpeg',
      } as any);
      const res = await api.post('/uploads/cbct-temp', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setOpgFile({ filename: res.data.cbct_file, original_name: res.data.cbct_original_name });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload OPG');
    } finally {
      setOpgUploading(false);
    }
  };

  const addExtraIopa = () => setExtraIopaCount(prev => prev + 1);
  const removeExtraIopa = (idx: number) => {
    // Remove the file at position idx (which is base + extra offset)
    const allFiles = [...iopaFiles];
    if (idx < allFiles.length) allFiles.splice(idx, 1);
    setIopaFiles(allFiles);
    setExtraIopaCount(prev => Math.max(0, prev - 1));
  };

  // iter-139: inline validators for Multi-unit Abutment. User chose
  // non-blocking submit with inline red warnings; ranges are 0-45° and
  // 0-10mm per latest product spec (range is NOT shown to the user).
  const muaAngleError = (v: string) => {
    if (!v || !v.trim()) return 'Required';
    const n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 45) return 'Invalid';
    return '';
  };
  const muaCuffError = (v: string) => {
    if (!v || !v.trim()) return 'Required';
    const n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 10) return 'Invalid';
    return '';
  };

  const handleSubmit = async () => {
    // Validate pre-surgery checklist
    const preItems = CHECKLIST_DATA.surgical.items;
    const uncheckedPre = preItems.filter(i => !preSurgeryChecklist[i.id]);
    if (uncheckedPre.length > 0) {
      Alert.alert('Pre-Surgery Checklist', `Please complete: ${uncheckedPre[0].label}`);
      return;
    }
    if (!flapDesign) { Alert.alert('Missing', 'Please select Flap Design'); return; }
    if (!drillingType) { Alert.alert('Missing', 'Please select Drilling Type'); return; }
    for (let i = 0; i < torqueValues.length; i++) {
      const val = parseFloat(torqueValues[i]);
      if (isNaN(val) || val < 10 || val > 90) {
        Alert.alert('Validation', `Torque for implant ${i + 1} must be 10-90 Ncm`);
        return;
      }
    }
    if (!prostheticComponent) { Alert.alert('Missing', 'Please select Prosthetic Component'); return; }
    if (prostheticComponent === 'Immediate Loading Done') {
      if (!prosthesisType) { Alert.alert('Missing', 'Please select a Prosthesis Type'); return; }
      if (prosthesisType === 'Other' && !prosthesisTypeOther.trim()) {
        Alert.alert('Missing', 'Please describe the prosthesis type in the text box'); return;
      }
    }

    // Validate mandatory IOPA uploads
    const allIopaSlots = [...iopaFiles, ...new Array(extraIopaCount).fill(null)];
    const baseIopaCount = iopaFiles.length;
    const missingIopa = allIopaSlots.slice(0, baseIopaCount).filter(f => f === null);
    if (missingIopa.length > 0) {
      Alert.alert('Missing IOPA', `Please upload all ${baseIopaCount} IOPA Radiographs before submitting.`);
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/submit-phase2`, {
        pre_surgery_checklist: preSurgeryChecklist,
        anesthesia_adequate: anesthesiaAdequate,
        anesthesia_details: anesthesiaAdequate === 'No' ? anesthesiaDetails : null,
        flap_design: flapDesign,
        drilling_type: drillingType,
        implant_seated_correctly: implantSeated,
        implant_seated_comment: implantSeatedComment || null,
        torque_values: torqueValues.map(v => parseFloat(v)),
        bone_graft_used: boneGraftUsed,
        bone_graft_details: boneGraftUsed ? boneGraftDetails || null : null,
        implant_other_notes: implantOtherNotes || null,
        prosthetic_component: prostheticComponent,
        prosthesis_type: prostheticComponent === 'Immediate Loading Done' ? prosthesisType : null,
        prosthesis_type_other: (prostheticComponent === 'Immediate Loading Done' && prosthesisType === 'Other')
          ? prosthesisTypeOther.trim() : null,
        healing_abutment_cuff_height: prostheticComponent === 'Healing Abutment Placed' ? healingAbutmentCuffHeight : null,
        access_channel_openings: prostheticComponent === 'Immediate Loading Done' ? accessChannelOpenings : null,
        sutures_placed: suturesPlaced,
        hemostasis_achieved: hemostasisAchieved,
        iopa_files: [...iopaFiles, ...new Array(extraIopaCount).fill(null)]
          .filter(f => f !== null)
          .map((f, idx) => ({ filename: f.filename, original_name: f.original_name, tooth_label: f.tooth_label || `Extra ${idx + 1}` })),
        opg_file: opgFile ? { filename: opgFile.filename, original_name: opgFile.original_name } : null,
        post_op_checklist: postOpChecklist,
        student_notes: studentNotes || null,
        // iter-139: Multi-unit Abutment capture (full-arch Immediate Loading only).
        // Sent regardless of validity — user opted for non-blocking submit so
        // partial data is persisted; warnings are shown inline in the UI.
        multi_unit_abutment_placed:
          (prostheticComponent === 'Immediate Loading Done'
            && ['All on 4','All on 6','All on X'].includes(procedureType)
            && (Array.isArray(loadingType) ? loadingType.includes('Immediate Loading') : loadingType === 'Immediate Loading'))
            ? (multiUnitPlaced || null)
            : null,
        multi_unit_abutment_details:
          (prostheticComponent === 'Immediate Loading Done'
            && ['All on 4','All on 6','All on X'].includes(procedureType)
            && (Array.isArray(loadingType) ? loadingType.includes('Immediate Loading') : loadingType === 'Immediate Loading')
            && multiUnitPlaced === 'yes')
            ? implantPositions.map((pos, idx) => ({
                tooth: pos,
                angulation: muaAngulation[idx] || '',
                cuff_height: muaCuffHeight[idx] || '',
              }))
            : null,
      });
      Alert.alert('Success', 'Phase 2 submitted successfully! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit Phase 2');
    } finally {
      setLoading(false);
    }
  };

  const renderDropdown = (label: string, value: string, options: string[],
    open: boolean, setOpen: (v: boolean) => void, onSelect: (v: string) => void) => (
    <View style={s.field}>
      <Text style={s.label}>{label} <Text style={{ color: '#DC3545' }}>*</Text></Text>
      <TouchableOpacity style={s.dropdown} onPress={() => setOpen(!open)}>
        <Text style={[s.dropdownText, !value && { color: '#999' }]}>{value || `Select ${label}`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={s.ddList} nestedScrollEnabled>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[s.ddItem, value === opt && s.ddItemActive]}
              onPress={() => { onSelect(opt); setOpen(false); }}>
              <Text style={[s.ddItemText, value === opt && { color: '#1A73E8', fontWeight: '700' }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <PhaseHeader
        title="Phase 2 - Implant Surgery"
        subtitle="Surgical Checklist"
        testID="phase2-submit-header"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>

          {/* ── Pre-Surgery Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Pre-Surgery Checklist <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            {CHECKLIST_DATA.surgical.items.map(item => (
              <View key={item.id} style={s.checkRow}>
                <Text style={[s.checkLabel, { flex: 1 }]}>{item.label}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Yes', 'No'].map(opt => (
                    <TouchableOpacity key={opt}
                      style={[s.ynBtn, preSurgeryChecklist[item.id] === true && opt === 'Yes' && s.ynYes, preSurgeryChecklist[item.id] === false && opt === 'No' && s.ynNo]}
                      onPress={() => setPreSurgeryChecklist(prev => ({ ...prev, [item.id]: opt === 'Yes' }))}>
                      <Text style={[s.ynText, (preSurgeryChecklist[item.id] === true && opt === 'Yes') || (preSurgeryChecklist[item.id] === false && opt === 'No') ? s.ynTextActive : {}]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* ── Surgical Procedure ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="medkit-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>Surgical Procedure</Text>
            </View>

            {/* Anesthesia */}
            <View style={s.field}>
              <Text style={s.label}>Adequate Anesthesia Achieved</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[s.chip, anesthesiaAdequate === opt && s.chipActive]}
                    onPress={() => setAnesthesiaAdequate(opt)}>
                    <Text style={[s.chipText, anesthesiaAdequate === opt && s.chipTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {anesthesiaAdequate === 'No' && (
                <TextInput style={[s.input, { marginTop: 8 }]} value={anesthesiaDetails}
                  onChangeText={setAnesthesiaDetails} placeholder="Describe anesthesia issue..."
                  multiline data-testid="anesthesia-details" />
              )}
            </View>

            {/* Flap Design */}
            {renderDropdown('Incision - Flap Design', flapDesign, FLAP_DESIGN_OPTIONS,
              flapOpen, setFlapOpen, setFlapDesign)}

            {/* Drilling Type */}
            {renderDropdown('Drilling Type', drillingType, DRILLING_TYPE_OPTIONS,
              drillingOpen, setDrillingOpen, setDrillingType)}

            {/* Implant Insertion */}
            <View style={s.field}>
              <Text style={[s.label, { fontSize: 15, fontWeight: '700', color: '#1A1A2E' }]}>Implant Insertion</Text>
              <View style={s.switchRow}>
                <Text style={s.switchLabel}>Implant Seated Correctly</Text>
                <Switch value={implantSeated} onValueChange={setImplantSeated}
                  trackColor={{ false: '#DDD', true: '#81C784' }} thumbColor={implantSeated ? '#4CAF50' : '#f4f3f4'} />
              </View>
              {!implantSeated && (
                <TextInput style={s.input} value={implantSeatedComment}
                  onChangeText={setImplantSeatedComment} placeholder="Comment on seating issue..." data-testid="seated-comment" />
              )}
            </View>

            {/* Torque Values */}
            <View style={s.torqueSection}>
              <Text style={s.torqueTitle}>Torque Achieved (Ncm)</Text>
              {torqueValues.map((val, idx) => (
                <View key={idx} style={s.torqueRow}>
                  <View style={s.torqueLabel}>
                    <Text style={s.torqueLabelText}>
                      Implant {idx + 1}{implantPositions[idx] ? ` (#${implantPositions[idx]})` : ''}
                    </Text>
                  </View>
                  <TextInput style={s.torqueInput} value={val}
                    onChangeText={v => { const u = [...torqueValues]; u[idx] = v; setTorqueValues(u); }}
                    keyboardType="decimal-pad" placeholder="Ncm" maxLength={4} data-testid={`torque-${idx}`} />
                  <Text style={s.torqueUnit}>Ncm</Text>
                </View>
              ))}
            </View>

            {/* Bone Graft and Membrane */}
            <View style={s.field}>
              <Text style={s.label}>Bone Graft and Membrane</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                <TouchableOpacity
                  style={[s.toggleBtn, boneGraftUsed && s.toggleBtnActive]}
                  onPress={() => setBoneGraftUsed(true)}
                  data-testid="bone-graft-yes"
                >
                  <Text style={[s.toggleBtnText, boneGraftUsed && s.toggleBtnTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, !boneGraftUsed && s.toggleBtnActive]}
                  onPress={() => { setBoneGraftUsed(false); setBoneGraftDetails(''); }}
                  data-testid="bone-graft-no"
                >
                  <Text style={[s.toggleBtnText, !boneGraftUsed && s.toggleBtnTextActive]}>No</Text>
                </TouchableOpacity>
              </View>
              {boneGraftUsed && (
                <TextInput
                  style={[s.input, { marginTop: 8 }]}
                  value={boneGraftDetails}
                  onChangeText={setBoneGraftDetails}
                  placeholder="Type of bone graft and membrane used..."
                  multiline
                  data-testid="bone-graft-details"
                />
              )}
            </View>

            {/* Other Notes */}
            <View style={s.field}>
              <Text style={s.label}>Other Notes (optional)</Text>
              <TextInput style={s.input} value={implantOtherNotes} onChangeText={setImplantOtherNotes}
                placeholder="Additional surgical observations..." multiline data-testid="implant-other-notes" />
            </View>

            {/* Prosthetic Component */}
            {renderDropdown('Prosthetic Component', prostheticComponent, PROSTHETIC_COMPONENT_OPTIONS,
              prostheticOpen, setProstheticOpen, setProstheticComponent)}

            {/* Healing Abutment Cuff Height - per implant
                iter-138: when the Phase-1 attachment has a known manufacturer
                catalogue (e.g. Locator R-Tx ships 1-6 mm), we swap the free
                TextInput for a dropdown constrained to stocked SKUs. When no
                catalogue applies (bar-type, Other, missing), we fall back to
                the legacy numeric TextInput so bespoke cases still work. */}
            {prostheticComponent === 'Healing Abutment Placed' && (() => {
              const catalogue = getCuffHeightsFor(attachmentType);
              return (
              <View style={s.torqueSection}>
                <Text style={s.torqueTitle}>Healing Abutment Cuff Height (mm)</Text>
                {catalogue && (
                  <Text style={[s.torqueTitle, { fontSize: 11, fontWeight: '600', color: '#1565C0', marginTop: -4, marginBottom: 8 }]}>
                    Catalogue: {attachmentType} · {catalogue.length} SKU{catalogue.length === 1 ? '' : 's'}
                  </Text>
                )}
                {healingAbutmentCuffHeight.map((val, idx) => (
                  <View key={idx} style={[s.torqueRow, { flexWrap: 'wrap' }]}>
                    <View style={s.torqueLabel}>
                      <Text style={s.torqueLabelText}>
                        Implant {idx + 1}{implantPositions[idx] ? ` (#${implantPositions[idx]})` : ''}
                      </Text>
                    </View>
                    {catalogue ? (
                      <View style={{ flex: 1, minWidth: 160 }}>
                        <TouchableOpacity
                          style={[s.torqueInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }]}
                          onPress={() => setOpenCuffPicker(openCuffPicker === idx ? null : idx)}
                          testID={`healing-abutment-cuff-picker-${idx}`}
                          /* @ts-ignore */ data-testid={`healing-abutment-cuff-picker-${idx}`}
                        >
                          <Text style={{ color: val ? '#1A2332' : '#999' }}>{val || 'Select mm'}</Text>
                          <Ionicons name={openCuffPicker === idx ? 'chevron-up' : 'chevron-down'} size={16} color="#666" />
                        </TouchableOpacity>
                        {openCuffPicker === idx && (
                          <View style={{ borderWidth: 1, borderColor: '#B3D4FC', borderRadius: 6, marginTop: 4, backgroundColor: '#FFF', maxHeight: 220 }}>
                            <ScrollView nestedScrollEnabled>
                              {catalogue.map(opt => (
                                <TouchableOpacity
                                  key={opt}
                                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1', backgroundColor: val === opt ? '#E3F2FD' : '#FFF' }}
                                  onPress={() => {
                                    const u = [...healingAbutmentCuffHeight]; u[idx] = opt; setHealingAbutmentCuffHeight(u);
                                    setOpenCuffPicker(null);
                                  }}
                                  testID={`healing-abutment-cuff-${idx}-option-${opt}`}
                                  /* @ts-ignore */ data-testid={`healing-abutment-cuff-${idx}-option-${opt}`}
                                >
                                  <Text style={{ fontWeight: val === opt ? '700' : '500', color: '#1A2332' }}>{opt} mm</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    ) : (
                      <TextInput style={s.torqueInput} value={val}
                        onChangeText={v => { const u = [...healingAbutmentCuffHeight]; u[idx] = v; setHealingAbutmentCuffHeight(u); }}
                        keyboardType="decimal-pad" placeholder="mm" maxLength={5}
                        data-testid={`healing-abutment-cuff-${idx}`} />
                    )}
                    <Text style={s.torqueUnit}>mm</Text>
                  </View>
                ))}
              </View>
            );})()}

            {/* ─── iter-139: Multi-unit Abutment question + details ───────
                Only for full-arch + Immediate Loading Phase-1 cases, when
                Prosthetic Component = Immediate Loading Done. Yes/No is unset
                by default (user must pick) and, when Yes, renders a blue-themed
                per-implant details section with Angulation (°) + Cuff Ht (mm)
                inputs. Prosthesis Type below renders after this section. */}
            {prostheticComponent === 'Immediate Loading Done'
             && (['All on 4','All on 6','All on X'].includes(procedureType))
             && (Array.isArray(loadingType) ? loadingType.includes('Immediate Loading') : loadingType === 'Immediate Loading') && (
              <View style={s.muaSection}>
                <Text style={s.muaTitle}>Multi-unit Abutment Placed</Text>
                <View style={s.muaPillRow}>
                  <TouchableOpacity
                    style={[s.muaPill, multiUnitPlaced === 'yes' && s.muaPillActive]}
                    onPress={() => setMultiUnitPlaced('yes')}
                    testID="mua-placed-yes"
                    /* @ts-ignore */ data-testid="mua-placed-yes"
                  >
                    <Text style={[s.muaPillText, multiUnitPlaced === 'yes' && s.muaPillTextActive]}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.muaPill, multiUnitPlaced === 'no' && s.muaPillActive]}
                    onPress={() => {
                      setMultiUnitPlaced('no');
                      // clear any data the user entered before flipping to No
                      setMuaAngulation(new Array(implantPositions.length || 1).fill(''));
                      setMuaCuffHeight(new Array(implantPositions.length || 1).fill(''));
                    }}
                    testID="mua-placed-no"
                    /* @ts-ignore */ data-testid="mua-placed-no"
                  >
                    <Text style={[s.muaPillText, multiUnitPlaced === 'no' && s.muaPillTextActive]}>No</Text>
                  </TouchableOpacity>
                </View>
                {multiUnitPlaced === 'yes' && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={s.muaSubTitle}>Multi-unit Abutment Details</Text>
                    {implantPositions.map((pos, idx) => (
                      <View key={idx} style={s.muaToothCard}>
                        <Text style={s.muaToothHeader}>Implant {idx + 1} (#{pos})</Text>
                        <View style={s.muaParamRow}>
                          <View style={s.muaParamLabelPill}>
                            <Text style={s.muaParamLabelText}>Angulation</Text>
                          </View>
                          <TextInput
                            style={s.muaInput}
                            value={muaAngulation[idx] || ''}
                            onChangeText={v => { const u = [...muaAngulation]; u[idx] = v; setMuaAngulation(u); }}
                            keyboardType="decimal-pad" placeholder="°" maxLength={2}
                            testID={`mua-angulation-${idx}`}
                            /* @ts-ignore */ data-testid={`mua-angulation-${idx}`}
                          />
                          <Text style={s.muaUnit}>°</Text>
                        </View>
                        <View style={s.muaParamRow}>
                          <View style={s.muaParamLabelPill}>
                            <Text style={s.muaParamLabelText}>Cuff Height</Text>
                          </View>
                          <TextInput
                            style={s.muaInput}
                            value={muaCuffHeight[idx] || ''}
                            onChangeText={v => { const u = [...muaCuffHeight]; u[idx] = v; setMuaCuffHeight(u); }}
                            keyboardType="decimal-pad" placeholder="mm" maxLength={2}
                            testID={`mua-cuff-${idx}`}
                            /* @ts-ignore */ data-testid={`mua-cuff-${idx}`}
                          />
                          <Text style={s.muaUnit}>mm</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Prosthesis Type — only when Prosthetic Component === Immediate Loading Done.
                Options depend on Phase 1 procedure_type + teeth count per product spec. */}
            {prostheticComponent === 'Immediate Loading Done' && (() => {
              // Overlapping modifier procedure types — Group A/B decided by teeth count.
              const OVERLAP = new Set(['Immediate Implant','Partial Extraction Therapy','Implant Placement with Guided Bone Regeneration','Guided Surgery']);
              const FULL_ARCH = new Set(['All on 4','All on 6','All on X']);
              let options: string[] = [];
              if (FULL_ARCH.has(procedureType)) {
                options = [
                  'Full Arch Temporary Prosthesis with Multiunit Abutments and Temporary Cylinders',
                  'Temporary PMMA CAD Prosthesis with Multiunit Abutments and Temporary Cylinders',
                  'Temporary PMMA CAD Prosthesis on Ti-Base',
                ];
              } else {
                // single vs multi driven by procedureType OR teethCount for overlaps
                const isSingle = procedureType === 'Single Conventional Implant'
                  || (OVERLAP.has(procedureType) && teethCount <= 1);
                if (isSingle) {
                  options = ['PMMA Crown with Temporary Abutment', 'PMMA Crown with Ti-Base', 'Other'];
                } else {
                  options = ['PMMA Crowns with Temporary Abutment', 'PMMA Crowns with Ti-Base', 'PMMA Bridge with Temporary Abutment', 'Other'];
                }
              }
              return (
                <View style={s.section}>
                  <Text style={s.torqueTitle}>Prosthesis Type</Text>
                  {renderDropdown('Select prosthesis type', prosthesisType, options,
                    prosthesisTypeOpen, setProsthesisTypeOpen, setProsthesisType)}
                  {prosthesisType === 'Other' && (
                    <TextInput
                      style={[s.textArea, { marginTop: 8 }]}
                      value={prosthesisTypeOther}
                      onChangeText={setProsthesisTypeOther}
                      placeholder="Describe the prosthesis type..."
                      multiline
                      data-testid="prosthesis-type-other-input"
                    />
                  )}
                </View>
              );
            })()}

            {/* Access Channel Opening - shown when Immediate Loading Done */}
            {prostheticComponent === 'Immediate Loading Done' && implantPositions.length > 0 && (
              <View style={s.torqueSection}>
                <Text style={s.torqueTitle}>Access Channel Opening</Text>
                {implantPositions.map((pos, idx) => {
                  const toothNum = parseInt(pos, 10) || 0;
                  const anteriorTeeth = new Set([11,12,13,21,22,23,31,32,33,41,42,43]);
                  const upperPosterior = new Set([14,15,16,17,24,25,26,27]);
                  const lowerPosterior = new Set([34,35,36,37,44,45,46,47]);
                  const options: string[] = ['Facial'];
                  if (upperPosterior.has(toothNum) || lowerPosterior.has(toothNum)) options.push('Occlusal');
                  if (anteriorTeeth.has(toothNum)) options.push('Incisal/Cingulum');
                  if (lowerPosterior.has(toothNum)) options.push('Lingual');
                  if (upperPosterior.has(toothNum)) options.push('Palatal');
                  const selected = accessChannelOpenings[idx] || '';
                  return (
                    <View key={idx} style={{ marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#BF360C', marginBottom: 6 }}>
                        Implant {idx + 1}{pos ? ` (#${pos})` : ''} <Text style={{ color: '#DC3545' }}>*</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {options.map(opt => (
                          <TouchableOpacity key={opt}
                            style={[s.chip, selected === opt && s.chipActive]}
                            onPress={() => {
                              const updated = [...accessChannelOpenings];
                              updated[idx] = opt;
                              setAccessChannelOpenings(updated);
                            }}>
                            <Text style={[s.chipText, selected === opt && s.chipTextActive]}>{opt}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Suturing */}
            <View style={s.field}>
              <Text style={[s.label, { fontSize: 15, fontWeight: '700', color: '#1A1A2E' }]}>Suturing</Text>
              <View style={s.switchRow}>
                <Text style={s.switchLabel}>Sutures Placed</Text>
                <Switch value={suturesPlaced} onValueChange={setSuturesPlaced}
                  trackColor={{ false: '#DDD', true: '#81C784' }} thumbColor={suturesPlaced ? '#4CAF50' : '#f4f3f4'} />
              </View>
              <View style={[s.switchRow, { marginTop: 8 }]}>
                <Text style={s.switchLabel}>Hemostasis Achieved</Text>
                <Switch value={hemostasisAchieved} onValueChange={setHemostasisAchieved}
                  trackColor={{ false: '#DDD', true: '#81C784' }} thumbColor={hemostasisAchieved ? '#4CAF50' : '#f4f3f4'} />
              </View>
            </View>
          </View>

          {/* ── Post Surgical Radiograph(s) ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="images-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>
                {isSingleImplant ? 'Post Surgical Radiograph' : 'Post Surgical Radiographs'}
              </Text>
            </View>

            {/* IOPA upload slots */}
            <View style={s.uploadSection}>
              <Text style={s.uploadTitle}>Upload IOPA Radiograph</Text>
              {Array.from({ length: totalIopaSlots }).map((_, idx) => {
                const baseCount = iopaFiles.length;
                const isExtra = idx >= baseCount;
                const file = isExtra ? null : iopaFiles[idx];
                const label = getIopaLabel(idx);
                const baseUrl = api.defaults.baseURL || '';
                return (
                  <View key={idx} style={s.torqueRow} data-testid={`iopa-slot-${idx}`}>
                    <View style={[s.uploadLabel, { flex: 1.5 }]}>
                      <Text style={s.uploadLabelText}>{label}</Text>
                    </View>
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {file ? (
                        <>
                          {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                            <Image
                              source={{ uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}` }}
                              style={{ width: 40, height: 40, borderRadius: 6 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons name="document-attach" size={24} color="#4CAF50" />
                          )}
                          <TouchableOpacity
                            style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
                            onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                            data-testid={`view-iopa-${idx}`}
                          >
                            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>View IOPA</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { const u = [...iopaFiles]; u[idx] = null; setIopaFiles(u); }} data-testid={`remove-iopa-${idx}`}>
                            <Ionicons name="close-circle" size={22} color="#E53935" />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          style={{ backgroundColor: '#1A73E8', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' }}
                          onPress={() => pickIopaFile(idx)} disabled={uploadingIdx === idx}
                          data-testid={`upload-iopa-${idx}`}
                        >
                          {uploadingIdx === idx ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <>
                              <Ionicons name="cloud-upload" size={16} color="#FFF" />
                              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Upload IOPA</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                      {/* +/- buttons for extra rows (All on X) */}
                      {isExtra && (
                        <TouchableOpacity onPress={() => removeExtraIopa(idx)} data-testid={`remove-extra-iopa-${idx}`}>
                          <Ionicons name="remove-circle" size={26} color="#E53935" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
              {/* Add extra IOPA button for All on X */}
              {procedureType === 'All on X' && (
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
                  onPress={addExtraIopa} data-testid="add-extra-iopa-btn">
                  <Ionicons name="add-circle" size={26} color="#4CAF50" />
                  <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add IOPA Radiograph</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* OPG upload for Full Arch cases */}
            {isFullArch && (
              <View style={[s.uploadSection, { marginTop: 12 }]}>
                <Text style={s.uploadTitle}>Upload OPG</Text>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  {opgFile ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {opgFile.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                        <Image
                          source={{ uri: `${(api.defaults.baseURL || '')}/uploads/${opgFile.filename}?token=${authToken}` }}
                          style={{ width: 50, height: 50, borderRadius: 8 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="document-attach" size={28} color="#4CAF50" />
                      )}
                      <TouchableOpacity
                        style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                        onPress={() => Linking.openURL(`${(api.defaults.baseURL || '')}/uploads/${opgFile.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                        data-testid="view-opg-btn"
                      >
                        <Ionicons name="document-attach" size={18} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>View OPG</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setOpgFile(null)} data-testid="remove-opg-btn">
                        <Ionicons name="close-circle" size={24} color="#E53935" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{ backgroundColor: '#1A73E8', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      onPress={pickOpgFile} disabled={opgUploading}
                      data-testid="upload-opg-btn"
                    >
                      {opgUploading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload" size={18} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Upload OPG</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* ── Post-Operative Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="bandage-outline" size={20} color="#7B1FA2" />
              <Text style={s.sectionTitle}>Post-Operative Checklist <Text style={{ color: '#DC3545' }}>*</Text></Text>
            </View>
            {[
              { id: 'post_op_radiograph', label: 'Post-operative Radiograph Made' },
              { id: 'post_op_instructions', label: 'Post-operative Instructions Given to Patient' },
              { id: 'medications_prescribed', label: 'Medications Prescribed' },
            ].map(item => (
              <View key={item.id} style={s.checkRow}>
                <Text style={[s.checkLabel, { flex: 1 }]}>{item.label}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Yes', 'No'].map(opt => (
                    <TouchableOpacity key={opt}
                      style={[s.ynBtn, postOpChecklist[item.id] === true && opt === 'Yes' && s.ynYes, postOpChecklist[item.id] === false && opt === 'No' && s.ynNo]}
                      onPress={() => togglePostOp(item.id, opt === 'Yes')}>
                      <Text style={[s.ynText, (postOpChecklist[item.id] === true && opt === 'Yes') || (postOpChecklist[item.id] === false && opt === 'No') ? s.ynTextActive : {}]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* ── Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Notes</Text>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Post-surgical Notes by {notesLabel}</Text>
              <TextInput style={[s.input, s.textArea]} value={studentNotes} onChangeText={setStudentNotes}
                placeholder="Observations, complications, post-surgical notes..." multiline numberOfLines={4}
                data-testid="phase2-student-notes" />
            </View>
            {user?.role !== 'implant_incharge' && (
              <Text style={s.helperText} data-testid="phase2-approval-helper">
                {user?.role === 'supervisor'
                  ? 'Implant In-Charge remark will be added during approval.'
                  : 'Supervisor and In-Charge remarks will be added during approval.'}
              </Text>
            )}
          </View>

          {/* ── Submit Button ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit} disabled={loading} data-testid="phase2-submit-btn">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                  <Text style={s.submitText}>Submit Phase 2 for Approval</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  scroll: { paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#0D47A1', textAlign: 'center', paddingVertical: 16, letterSpacing: 0.3 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E0E7EE', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', letterSpacing: 0.3 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6, letterSpacing: 0.2 },
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', minHeight: 44 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#90A4AE', fontStyle: 'italic', marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switchLabel: { fontSize: 14, color: '#333' },
  chip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  chipText: { fontSize: 14, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#1565C0' },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, backgroundColor: '#F8FAFC' },
  dropdownText: { fontSize: 14, color: '#333', flex: 1 },
  ddList: { maxHeight: 200, borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  ddItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  ddItemActive: { backgroundColor: '#E3F2FD' },
  ddItemText: { fontSize: 14, color: '#333' },
  torqueSection: { backgroundColor: '#FFF8E1', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#FFE082', shadowColor: '#FF8F00', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  torqueTitle: { fontSize: 15, fontWeight: '700', color: '#E65100', marginBottom: 12, letterSpacing: 0.3 },
  torqueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  torqueLabel: { flex: 1, backgroundColor: '#FFF3E0', padding: 10, borderRadius: 10 },
  torqueLabelText: { fontSize: 13, fontWeight: '600', color: '#BF360C' },
  torqueInput: { width: 80, borderWidth: 2, borderColor: '#FF6D00', borderRadius: 12, padding: 10, fontSize: 18, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' },
  torqueUnit: { fontSize: 13, fontWeight: '600', color: '#888' },
  uploadSection: { backgroundColor: '#E3F2FD', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#90CAF9', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  uploadTitle: { fontSize: 15, fontWeight: '700', color: '#1565C0', marginBottom: 12, letterSpacing: 0.3 },
  uploadLabel: { flex: 1, backgroundColor: '#BBDEFB', padding: 10, borderRadius: 10 },
  uploadLabelText: { fontSize: 13, fontWeight: '600', color: '#0D47A1' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#43A047', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#43A047', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  toggleBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  toggleBtnActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  toggleBtnText: { fontSize: 14, color: '#666', fontWeight: '600' },
  toggleBtnTextActive: { color: '#1565C0' },
  ynBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' },
  ynYes: { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
  ynNo: { borderColor: '#F44336', backgroundColor: '#F44336' },
  ynText: { fontSize: 13, color: '#666', fontWeight: '600' },
  ynTextActive: { color: '#FFF' },
  // iter-141: Multi-unit Abutment (blue theme — redesigned for clean alignment)
  muaSection: { backgroundColor: '#E1F5FE', borderColor: '#B3E5FC', borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 14, shadowColor: '#0277BD', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  muaTitle: { fontSize: 15, fontWeight: '700', color: '#0277BD', marginBottom: 12, letterSpacing: 0.3 },
  muaSubTitle: { fontSize: 13, fontWeight: '700', color: '#01579B', marginBottom: 10, letterSpacing: 0.2 },
  muaPillRow: { flexDirection: 'row', gap: 10 },
  muaPill: { flex: 1, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderColor: '#81D4FA', backgroundColor: '#FFF', alignItems: 'center' },
  muaPillActive: { borderColor: '#0277BD', backgroundColor: '#0277BD' },
  muaPillText: { fontSize: 14, fontWeight: '700', color: '#0277BD', letterSpacing: 0.3 },
  muaPillTextActive: { color: '#FFF' },
  // Per-tooth card: white card holding "Implant N (#pos)" header + 2 stacked
  // param rows. Mirrors the Torque section structure (label-pill left, input right).
  muaToothCard: { backgroundColor: '#FFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10 },
  muaToothHeader: { fontSize: 14, fontWeight: '700', color: '#01579B', marginBottom: 8, letterSpacing: 0.3 },
  muaParamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  muaParamLabelPill: { flex: 1, backgroundColor: '#E1F5FE', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  muaParamLabelText: { fontSize: 13, fontWeight: '600', color: '#01579B' },
  muaInput: { width: 80, borderWidth: 2, borderColor: '#0277BD', borderRadius: 12, padding: 10, fontSize: 18, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF', color: '#01579B' },
  muaUnit: { fontSize: 13, fontWeight: '600', color: '#888', minWidth: 30 },
});
