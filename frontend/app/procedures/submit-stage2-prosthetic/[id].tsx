import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';
import {
  PHASE4_SINGLE_MULTIPLE_OPTIONS,
  PHASE4_FULL_ARCH_OPTIONS,
  CUSTOM_ABUTMENT_OPTIONS,
  FP_MATERIAL_OPTIONS,
  OVERDENTURE_ATTACHMENT_OPTIONS,
  FULL_ARCH_GROUP,
  SINGLE_GROUP,
  MULTIPLE_GROUP,
} from '../../../constants/checklist';

export default function Phase4Step1Screen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [procedure, setProcedure] = useState<any>(null);

  // Form state
  const [finalProsthesis, setFinalProsthesis] = useState('');
  const [prosthesisOpen, setProsthesisOpen] = useState(false);
  const [prostheticMaterial, setProstheticMaterial] = useState('');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [customAbutment, setCustomAbutment] = useState('');
  const [abutmentOpen, setAbutmentOpen] = useState(false);
  const [overdentureAttachment, setOverdentureAttachment] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [componentsAvailable, setComponentsAvailable] = useState(false);
  const [impressionType, setImpressionType] = useState('');
  const [studentNotes, setStudentNotes] = useState('');

  useEffect(() => { loadProcedure(); }, []);

  const loadProcedure = async () => {
    try {
      const res = await api.get(`/procedures/${id}`);
      setProcedure(res.data);
    } catch {}
  };

  const getOptions = () => {
    if (!procedure) return [];
    const procType = procedure.implant_procedure_type || '';
    if (SINGLE_GROUP.has(procType) || MULTIPLE_GROUP.has(procType)) return PHASE4_SINGLE_MULTIPLE_OPTIONS;
    if (FULL_ARCH_GROUP.has(procType)) return PHASE4_FULL_ARCH_OPTIONS;
    return [...PHASE4_SINGLE_MULTIPLE_OPTIONS, ...PHASE4_FULL_ARCH_OPTIONS];
  };

  const showMaterial = finalProsthesis && (finalProsthesis.includes('FP1') || finalProsthesis.includes('FP2') || finalProsthesis.includes('FP3'));
  const showOverdenture = finalProsthesis && finalProsthesis.includes('Overdenture');

  const handleSubmit = async () => {
    if (!finalProsthesis) { Alert.alert('Missing', 'Please select Final Prosthesis'); return; }
    if (!paymentComplete) { Alert.alert('Missing', 'Please confirm payment is complete'); return; }
    if (!componentsAvailable) { Alert.alert('Missing', 'Please confirm all components are available'); return; }
    if (!impressionType) { Alert.alert('Missing', 'Please select impression type'); return; }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/prosthetic`, {
        final_prosthetic_plan: finalProsthesis + (prostheticMaterial ? ` - ${prostheticMaterial}` : ''),
        prosthetic_material: prostheticMaterial || null,
        custom_abutment: customAbutment || null,
        overdenture_attachment: overdentureAttachment || null,
        payment_complete: paymentComplete,
        components_available: componentsAvailable,
        impression_type: impressionType,
        student_notes: studentNotes || null,
      });
      Alert.alert('Success', 'Phase 4 Step 1 submitted! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const renderDropdown = (label: string, value: string, options: string[],
    open: boolean, setOpen: (v: boolean) => void, onSelect: (v: string) => void, required = true) => (
    <View style={s.field}>
      <Text style={s.label}>{label} {required && <Text style={{ color: '#DC3545' }}>*</Text>}</Text>
      <TouchableOpacity style={s.dropdown} onPress={() => setOpen(!open)}>
        <Text style={[s.dropdownText, !value && { color: '#999' }]}>{value || `Select...`}</Text>
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
          <Text style={s.pageTitle}>Phase 4 Step 1 - Final Prosthesis & Impressions</Text>

          {/* ── Final Prosthesis Selection ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={20} color="#6A1B9A" />
              <Text style={s.sectionTitle}>Final Prosthesis Selection</Text>
            </View>
            {procedure && <Text style={s.helperText}>Procedure Type: {procedure.implant_procedure_type}</Text>}
            {renderDropdown('Final Prosthesis Type', finalProsthesis, getOptions(),
              prosthesisOpen, setProsthesisOpen, (v) => { setFinalProsthesis(v); setProstheticMaterial(''); setOverdentureAttachment(''); })}

            {showMaterial && renderDropdown('Prosthetic Material', prostheticMaterial, FP_MATERIAL_OPTIONS,
              materialOpen, setMaterialOpen, setProstheticMaterial)}

            {showOverdenture && renderDropdown('Overdenture Attachment', overdentureAttachment, OVERDENTURE_ATTACHMENT_OPTIONS,
              attachmentOpen, setAttachmentOpen, setOverdentureAttachment)}

            {renderDropdown('Custom Abutment (optional)', customAbutment, CUSTOM_ABUTMENT_OPTIONS,
              abutmentOpen, setAbutmentOpen, setCustomAbutment, false)}
          </View>

          {/* ── Payment & Components ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="card-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Payment & Components</Text>
            </View>
            <TouchableOpacity style={s.checkRow} onPress={() => setPaymentComplete(!paymentComplete)}>
              <Ionicons name={paymentComplete ? 'checkbox' : 'square-outline'} size={22} color={paymentComplete ? '#4CAF50' : '#999'} />
              <Text style={s.checkLabel}>Complete Payment Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.checkRow} onPress={() => setComponentsAvailable(!componentsAvailable)}>
              <Ionicons name={componentsAvailable ? 'checkbox' : 'square-outline'} size={22} color={componentsAvailable ? '#4CAF50' : '#999'} />
              <Text style={s.checkLabel}>All Prosthetic Components Available</Text>
            </TouchableOpacity>
          </View>

          {/* ── Impressions ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="scan-outline" size={20} color="#E65100" />
              <Text style={s.sectionTitle}>Impressions</Text>
            </View>
            <Text style={s.label}>Select Impression Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ gap: 10 }}>
              {[
                { id: 'intraoral_scans', label: 'Intra-Oral Scans Made', icon: 'phone-portrait-outline' },
                { id: 'conventional', label: 'Conventional Impressions Made', icon: 'hand-left-outline' },
              ].map(opt => (
                <TouchableOpacity key={opt.id} style={[s.impressionCard, impressionType === opt.id && s.impressionCardActive]}
                  onPress={() => setImpressionType(opt.id)}>
                  <Ionicons name={opt.icon as any} size={24} color={impressionType === opt.id ? '#1A73E8' : '#999'} />
                  <Text style={[s.impressionLabel, impressionType === opt.id && { color: '#1A73E8', fontWeight: '700' }]}>{opt.label}</Text>
                  {impressionType === opt.id && <Ionicons name="checkmark-circle" size={22} color="#1A73E8" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Notes</Text>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Student Notes</Text>
              <TextInput style={[s.input, s.textArea]} value={studentNotes} onChangeText={setStudentNotes}
                placeholder="Treatment planning notes, special considerations..." multiline numberOfLines={3}
                data-testid="phase4-step1-notes" />
            </View>
            <Text style={s.helperText}>Supervisor and In-Charge remarks added during approval.</Text>
          </View>

          {/* ── Submit ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}
              data-testid="phase4-step1-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={s.submitText}>Submit Step 1 for Approval</Text></>
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
  pageTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', paddingVertical: 16 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 44 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 14, color: '#333', flex: 1 },
  ddList: { maxHeight: 250, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, marginTop: 4, backgroundColor: '#FFF' },
  ddItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ddItemActive: { backgroundColor: '#E8F0FE' },
  ddItemText: { fontSize: 14, color: '#333' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333' },
  impressionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: '#DDD', borderRadius: 10, backgroundColor: '#FAFAFA' },
  impressionCardActive: { borderColor: '#1A73E8', backgroundColor: '#E8F0FE' },
  impressionLabel: { flex: 1, fontSize: 14, color: '#555' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#6A1B9A', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
