import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import ChecklistForm from '../../../components/ChecklistForm';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';

export default function Stage2SurgicalSubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<any>({});
  const [remark, setRemark] = useState('');

  const handleSubmit = async () => {
    if (!checklist.second_stage || !checklist.second_stage.items || checklist.second_stage.items.length === 0) {
      Alert.alert('Validation Error', 'Please complete the Second Stage Surgical Protocol checklist');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/surgical`, {
        checklist: checklist.second_stage,
        remark: remark || null,
      });

      Alert.alert(
        'Success',
        'Phase 3 - Second Stage Surgical Protocol submitted successfully! Awaiting approval from supervisor and implant incharge.',
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
            <Text style={styles.pageTitle} data-testid="stage2-surgical-title">
              Phase 3 - Second Stage Surgical Protocol
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              Stage 1 Implant Placement is complete. Please fill the Phase 3 - Second Stage Surgical Protocol checklist for the healing and exposure phase.
            </Text>
          </View>

          <ChecklistForm
            checklist={checklist}
            onChecklistChange={setChecklist}
            stage2Section="second_stage"
            procedureId={id as string}
          />

          <View style={styles.form}>
            <Text style={styles.label}>Student Clinical Assessment</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={remark}
              onChangeText={setRemark}
              placeholder="Clinical assessment findings, healing evaluation, soft tissue status..."
              multiline
              numberOfLines={4}
              data-testid="stage2-surgical-clinical-assessment"
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              data-testid="stage2-surgical-submit-btn"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.submitButtonText}>Submit Phase 3 - Second Stage Surgical Protocol</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexDirection: 'row', backgroundColor: '#E8F5E9', margin: 16, padding: 16,
    borderRadius: 12, gap: 12,
  },
  infoText: { flex: 1, fontSize: 14, color: '#2E7D32', lineHeight: 20 },
  form: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: '#FFF',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  buttonContainer: { padding: 16 },
  submitButton: {
    flexDirection: 'row', backgroundColor: '#2196F3', borderRadius: 12, padding: 16,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
