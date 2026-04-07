import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch, Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';
import {
  CHECKLIST_DATA,
  FLAP_DESIGN_OPTIONS,
  DRILLING_TYPE_OPTIONS,
  PROSTHETIC_COMPONENT_OPTIONS,
} from '../../../constants/checklist';

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
  const [healingAbutmentCuffHeight, setHealingAbutmentCuffHeight] = useState<string[]>(['']);
  const [suturesPlaced, setSuturesPlaced] = useState(true);
  const [hemostasisAchieved, setHemostasisAchieved] = useState(true);

  // Post-Operative Checklist
  const [postOpChecklist, setPostOpChecklist] = useState<Record<string, boolean>>({});

  // Post Surgical Radiograph uploads
  const [procedureType, setProcedureType] = useState('');
  const [iopaFiles, setIopaFiles] = useState<(null | { filename: string; original_name: string; tooth_label: string })[]>([]);
  const [opgFile, setOpgFile] = useState<null | { filename: string; original_name: string }>(null);
  const [extraIopaCount, setExtraIopaCount] = useState(0);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [opgUploading, setOpgUploading] = useState(false);

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

      const pType = procRes.data.implant_procedure_type || '';
      setProcedureType(pType);

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

  const togglePostOp = (itemId: string) => {
    setPostOpChecklist(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // ── IOPA / OPG Upload helpers ──
  const getIopaLabel = (idx: number): string => {
    if (isFullArch) return `Implant ${idx + 1}`;
    return implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : `Implant ${idx + 1}`;
  };

  const totalIopaSlots = iopaFiles.length + extraIopaCount;

  const pickIopaFile = async (idx: number) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploadingIdx(idx);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: asset.uri, name: asset.name || 'iopa.jpg', type: asset.mimeType || 'image/jpeg',
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
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setOpgUploading(true);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: asset.uri, name: asset.name || 'opg.jpg', type: asset.mimeType || 'image/jpeg',
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
        healing_abutment_cuff_height: prostheticComponent === 'Healing Abutment Placed' ? healingAbutmentCuffHeight : null,
        sutures_placed: suturesPlaced,
        hemostasis_achieved: hemostasisAchieved,
        iopa_files: [...iopaFiles, ...new Array(extraIopaCount).fill(null)]
          .filter(f => f !== null)
          .map((f, idx) => ({ filename: f.filename, original_name: f.original_name, tooth_label: f.tooth_label || `Extra ${idx + 1}` })),
        opg_file: opgFile ? { filename: opgFile.filename, original_name: opgFile.original_name } : null,
        post_op_checklist: postOpChecklist,
        student_notes: studentNotes || null,
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
      <BackToDashboard />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <Text style={s.pageTitle}>Phase 2 - Surgical Protocols</Text>

          {/* ── Pre-Surgery Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Pre-Surgery Checklist</Text>
            </View>
            {CHECKLIST_DATA.surgical.items.map(item => (
              <TouchableOpacity key={item.id} style={s.checkRow} onPress={() => togglePreSurgery(item.id)}>
                <Ionicons name={preSurgeryChecklist[item.id] ? 'checkbox' : 'square-outline'}
                  size={22} color={preSurgeryChecklist[item.id] ? '#4CAF50' : '#999'} />
                <Text style={s.checkLabel}>{item.label}</Text>
              </TouchableOpacity>
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

            {/* Healing Abutment Cuff Height - per implant */}
            {prostheticComponent === 'Healing Abutment Placed' && (
              <View style={s.torqueSection}>
                <Text style={s.torqueTitle}>Healing Abutment Cuff Height (mm)</Text>
                {healingAbutmentCuffHeight.map((val, idx) => (
                  <View key={idx} style={s.torqueRow}>
                    <View style={s.torqueLabel}>
                      <Text style={s.torqueLabelText}>
                        Implant {idx + 1}{implantPositions[idx] ? ` (#${implantPositions[idx]})` : ''}
                      </Text>
                    </View>
                    <TextInput style={s.torqueInput} value={val}
                      onChangeText={v => { const u = [...healingAbutmentCuffHeight]; u[idx] = v; setHealingAbutmentCuffHeight(u); }}
                      keyboardType="decimal-pad" placeholder="mm" maxLength={5}
                      data-testid={`healing-abutment-cuff-${idx}`} />
                    <Text style={s.torqueUnit}>mm</Text>
                  </View>
                ))}
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
              <Ionicons name="images-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>
                {isSingleImplant ? 'Post Surgical Radiograph' : 'Post Surgical Radiographs'}
              </Text>
            </View>

            {/* IOPA upload slots */}
            <View style={s.torqueSection}>
              <Text style={s.torqueTitle}>Upload IOPA Radiograph</Text>
              {Array.from({ length: totalIopaSlots }).map((_, idx) => {
                const baseCount = iopaFiles.length;
                const isExtra = idx >= baseCount;
                const file = isExtra ? null : iopaFiles[idx];
                const label = getIopaLabel(idx);
                const baseUrl = api.defaults.baseURL || '';
                return (
                  <View key={idx} style={s.torqueRow} data-testid={`iopa-slot-${idx}`}>
                    <View style={[s.torqueLabel, { flex: 1.5 }]}>
                      <Text style={s.torqueLabelText}>{label}</Text>
                    </View>
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {file ? (
                        <>
                          {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                            <Image
                              source={{ uri: `${baseUrl}/uploads/${file.filename}` }}
                              style={{ width: 40, height: 40, borderRadius: 6 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <Ionicons name="document-attach" size={24} color="#4CAF50" />
                          )}
                          <TouchableOpacity
                            style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
                            onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}`).catch(() => Alert.alert('Error', 'Could not open file'))}
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
              <View style={[s.torqueSection, { marginTop: 12 }]}>
                <Text style={s.torqueTitle}>Upload OPG</Text>
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  {opgFile ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {opgFile.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                        <Image
                          source={{ uri: `${(api.defaults.baseURL || '')}/uploads/${opgFile.filename}` }}
                          style={{ width: 50, height: 50, borderRadius: 8 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="document-attach" size={28} color="#4CAF50" />
                      )}
                      <TouchableOpacity
                        style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
                        onPress={() => Linking.openURL(`${(api.defaults.baseURL || '')}/uploads/${opgFile.filename}`).catch(() => Alert.alert('Error', 'Could not open file'))}
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
              <Text style={s.sectionTitle}>Post-Operative Checklist</Text>
            </View>
            {[
              { id: 'post_op_radiograph', label: 'Post-operative Radiograph Made' },
              { id: 'post_op_instructions', label: 'Post-operative Instructions Given to Patient' },
              { id: 'medications_prescribed', label: 'Medications Prescribed' },
            ].map(item => (
              <TouchableOpacity key={item.id} style={s.checkRow} onPress={() => togglePostOp(item.id)}>
                <Ionicons name={postOpChecklist[item.id] ? 'checkbox' : 'square-outline'}
                  size={22} color={postOpChecklist[item.id] ? '#4CAF50' : '#999'} />
                <Text style={s.checkLabel}>{item.label}</Text>
              </TouchableOpacity>
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
            <Text style={s.helperText}>
              Supervisor and In-Charge remarks will be added during approval.
            </Text>
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
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { paddingBottom: 32 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', paddingVertical: 16 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 44 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switchLabel: { fontSize: 14, color: '#333' },
  chip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#DDD', backgroundColor: '#FAFAFA' },
  chipActive: { borderColor: '#1A73E8', backgroundColor: '#E8F0FE' },
  chipText: { fontSize: 14, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#1A73E8' },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 14, color: '#333', flex: 1 },
  ddList: { maxHeight: 200, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, marginTop: 4, backgroundColor: '#FFF' },
  ddItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddItemActive: { backgroundColor: '#E8F0FE' },
  ddItemText: { fontSize: 14, color: '#333' },
  torqueSection: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#FFE082' },
  torqueTitle: { fontSize: 15, fontWeight: '700', color: '#E65100', marginBottom: 10 },
  torqueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  torqueLabel: { flex: 1, backgroundColor: '#FFF3E0', padding: 10, borderRadius: 8 },
  torqueLabelText: { fontSize: 13, fontWeight: '600', color: '#BF360C' },
  torqueInput: { width: 80, borderWidth: 2, borderColor: '#FF6D00', borderRadius: 10, padding: 10, fontSize: 18, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' },
  torqueUnit: { fontSize: 13, fontWeight: '600', color: '#888' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  toggleBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#DDD', backgroundColor: '#FAFAFA' },
  toggleBtnActive: { borderColor: '#1A73E8', backgroundColor: '#E8F0FE' },
  toggleBtnText: { fontSize: 14, color: '#666', fontWeight: '600' },
  toggleBtnTextActive: { color: '#1A73E8' },
});
