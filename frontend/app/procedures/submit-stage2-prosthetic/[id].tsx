import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import ChecklistForm from '../../../components/ChecklistForm';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';
import { getProstheticOptions } from '../../../constants/checklist';

export default function Stage2ProstheticSubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<any>({});
  const [studentRemark, setStudentRemark] = useState('');
  const [facultyRemark, setFacultyRemark] = useState('');
  const [inchargeRemark, setInchargeRemark] = useState('');
  const [finalProstheticPlan, setFinalProstheticPlan] = useState('');
  const [procedureType, setProcedureType] = useState('');
  const [loadingTypes, setLoadingTypes] = useState<string[]>([]);
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);

  useEffect(() => {
    loadProcedure();
  }, []);

  const loadProcedure = async () => {
    try {
      const res = await api.get(`/procedures/${id}`);
      const proc = res.data;
      setProcedureType(proc.implant_procedure_type || '');
      setLoadingTypes(proc.loading_type || []);
      setFinalProstheticPlan(proc.prosthetic_plan || '');
    } catch {
      console.error('Failed to load procedure data');
    }
  };

  const prostheticOptions = useMemo(() => {
    return getProstheticOptions(procedureType, loadingTypes);
  }, [procedureType, loadingTypes]);

  const handleSubmit = async () => {
    if (!checklist.prosthetic_phase || !checklist.prosthetic_phase.items || checklist.prosthetic_phase.items.length === 0) {
      Alert.alert('Validation Error', 'Please complete the Prosthetic Phase Protocol checklist');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/prosthetic`, {
        checklist: checklist.prosthetic_phase,
        remark: studentRemark || null,
        faculty_remark: facultyRemark || null,
        incharge_remark: inchargeRemark || null,
        final_prosthetic_plan: finalProstheticPlan || null,
      });

      Alert.alert(
        'Success',
        'Phase 4 - Prosthetic Protocol submitted successfully! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <BackToDashboard />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.pageTitle} data-testid="stage2-prosthetic-title">
              Phase 4 - Prosthetic Protocol
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              Phase 3 has been approved. Complete the Prosthetic Protocol checklist to finalize the treatment.
            </Text>
          </View>

          {/* Final Prosthetic Treatment Plan */}
          {prostheticOptions.length > 0 && (
            <View style={styles.planSection}>
              <Text style={styles.planLabel}>Final Prosthetic Treatment Plan</Text>
              <TouchableOpacity
                style={styles.planDropdown}
                onPress={() => setShowPlanDropdown(true)}
                data-testid="final-prosthetic-plan-dropdown"
              >
                <Text style={finalProstheticPlan ? styles.planText : styles.planPlaceholder}>
                  {finalProstheticPlan || 'Select Final Prosthetic Plan'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          <ChecklistForm
            checklist={checklist}
            onChecklistChange={setChecklist}
            stage2Section="prosthetic_phase"
          />

          <View style={styles.form}>
            <Text style={styles.label}>Student Remark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={studentRemark}
              onChangeText={setStudentRemark}
              placeholder="Student observations, treatment notes..."
              multiline
              numberOfLines={3}
              data-testid="phase4-student-remark"
            />

            <Text style={styles.label}>Faculty Remark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={facultyRemark}
              onChangeText={setFacultyRemark}
              placeholder="Faculty observations and approval notes..."
              multiline
              numberOfLines={3}
              data-testid="phase4-faculty-remark"
            />

            <Text style={styles.label}>Implant Incharge Remark</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={inchargeRemark}
              onChangeText={setInchargeRemark}
              placeholder="Implant incharge final assessment..."
              multiline
              numberOfLines={3}
              data-testid="phase4-incharge-remark"
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              data-testid="stage2-prosthetic-submit-btn"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.submitButtonText}>Submit Phase 4 - Prosthetic Protocol</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Prosthetic Plan Dropdown Modal */}
      <Modal visible={showPlanDropdown} animationType="slide" transparent onRequestClose={() => setShowPlanDropdown(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Final Prosthetic Plan</Text>
              <TouchableOpacity onPress={() => setShowPlanDropdown(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={prostheticOptions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = finalProstheticPlan === item;
                return (
                  <TouchableOpacity
                    style={[styles.ddItem, isSelected && styles.ddItemSelected]}
                    onPress={() => { setFinalProstheticPlan(item); setShowPlanDropdown(false); }}
                  >
                    <Text style={[styles.ddItemText, isSelected && styles.ddItemTextSelected]}>{item}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={22} color="#FF9800" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  keyboardView: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  titleContainer: { padding: 16, paddingBottom: 0 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  infoBox: {
    flexDirection: 'row', backgroundColor: '#FFF3E0', margin: 16, padding: 16,
    borderRadius: 12, gap: 12,
  },
  infoText: { flex: 1, fontSize: 14, color: '#E65100', lineHeight: 20 },
  planSection: { paddingHorizontal: 16, marginBottom: 8 },
  planLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  planDropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#FF9800', borderRadius: 10, padding: 14, backgroundColor: '#FFF',
  },
  planText: { fontSize: 15, color: '#333', flex: 1 },
  planPlaceholder: { fontSize: 15, color: '#999', flex: 1 },
  form: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: '#FFF',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  buttonContainer: { padding: 16 },
  submitButton: {
    flexDirection: 'row', backgroundColor: '#FF9800', borderRadius: 12, padding: 16,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  dropdownModal: { backgroundColor: '#FFF', borderRadius: 16, maxHeight: '70%', overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  ddItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  ddItemSelected: { backgroundColor: '#FFF8E1' },
  ddItemText: { fontSize: 15, color: '#333', flex: 1 },
  ddItemTextSelected: { color: '#FF9800', fontWeight: '600' },
});
