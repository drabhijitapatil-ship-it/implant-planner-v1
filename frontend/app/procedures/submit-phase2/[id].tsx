import React, { useState, useEffect } from 'react';
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

export default function Phase2SubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState({});
  const [remark, setRemark] = useState('');
  const [numImplants, setNumImplants] = useState(0);
  const [torqueValues, setTorqueValues] = useState<string[]>([]);
  const [implantPositions, setImplantPositions] = useState<string[]>([]);

  useEffect(() => {
    loadImplantPlan();
  }, []);

  const loadImplantPlan = async () => {
    try {
      const res = await api.get(`/procedures/${id}/implant-plan`);
      const count = res.data.number_of_implants || 1;
      const positions = (res.data.implant_plans || []).map((p: any) => p.position);
      setNumImplants(count);
      setImplantPositions(positions);
      setTorqueValues(new Array(count).fill(''));
    } catch {
      setNumImplants(1);
      setTorqueValues(['']);
    }
  };

  const updateTorque = (index: number, value: string) => {
    const updated = [...torqueValues];
    updated[index] = value;
    setTorqueValues(updated);
  };

  const handleSubmit = async () => {
    if (!checklist.surgical || !checklist.surgical.items || checklist.surgical.items.length === 0) {
      Alert.alert('Validation Error', 'Please complete the surgical protocols checklist');
      return;
    }

    // Validate torque values
    for (let i = 0; i < torqueValues.length; i++) {
      const val = parseFloat(torqueValues[i]);
      if (isNaN(val) || val < 10 || val > 90) {
        Alert.alert('Validation Error', `Torque value for implant ${i + 1} must be between 10 and 90 Ncm`);
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        checklist_surgical: checklist.surgical,
        remark: remark || null,
        torque_values: torqueValues.map(v => parseFloat(v)),
      };

      await api.post(`/procedures/${id}/submit-phase2`, payload);

      Alert.alert(
        'Success',
        'Phase 2 (Surgical Protocols) submitted successfully! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit Phase 2');
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
            <Text style={styles.pageTitle}>Submit Phase 2 - Surgical Protocols</Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              Phase 1 (Pre-surgical) has been approved. Complete the Surgical Protocols checklist after performing the implant procedure.
            </Text>
          </View>

          <ChecklistForm
            checklist={checklist}
            onChecklistChange={setChecklist}
            phase={2}
          />

          {/* Torque Values Section */}
          <View style={styles.torqueSection}>
            <Text style={styles.torqueSectionTitle}>
              <Ionicons name="speedometer" size={18} color="#FF6D00" /> Torque Values Achieved (Ncm)
            </Text>
            <Text style={styles.torqueHelper}>
              Enter the insertion torque (10-90 Ncm) for each implant placed.
            </Text>
            {torqueValues.map((val, idx) => (
              <View key={idx} style={styles.torqueRow}>
                <View style={styles.torqueLabel}>
                  <Text style={styles.torqueLabelText}>
                    Implant {idx + 1}
                    {implantPositions[idx] ? ` (Tooth ${implantPositions[idx]})` : ''}
                  </Text>
                </View>
                <TextInput
                  style={styles.torqueInput}
                  value={val}
                  onChangeText={(v) => updateTorque(idx, v)}
                  keyboardType="decimal-pad"
                  placeholder="Ncm"
                  maxLength={4}
                  data-testid={`torque-input-${idx}`}
                />
                <Text style={styles.torqueUnit}>Ncm</Text>
              </View>
            ))}
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Post-Surgical Notes by Student</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={remark}
              onChangeText={setRemark}
              placeholder="Post-surgical notes, observations, complications..."
              multiline
              numberOfLines={4}
              data-testid="phase2-student-notes"
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              data-testid="phase2-submit-btn"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.submitButtonText}>Submit Phase 2</Text>
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
    flexDirection: 'row', backgroundColor: '#E3F2FD', margin: 16, padding: 16,
    borderRadius: 12, gap: 12,
  },
  infoText: { flex: 1, fontSize: 14, color: '#1976D2', lineHeight: 20 },
  torqueSection: {
    backgroundColor: '#FFF', margin: 16, marginTop: 0, padding: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#FFE0B2',
  },
  torqueSectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#E65100', marginBottom: 4,
  },
  torqueHelper: { fontSize: 12, color: '#888', marginBottom: 12 },
  torqueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  torqueLabel: {
    flex: 1, backgroundColor: '#FFF3E0', padding: 10, borderRadius: 8,
  },
  torqueLabelText: { fontSize: 13, fontWeight: '600', color: '#BF360C' },
  torqueInput: {
    width: 80, borderWidth: 2, borderColor: '#FF6D00', borderRadius: 10,
    padding: 10, fontSize: 18, fontWeight: '700', textAlign: 'center',
    backgroundColor: '#FFF',
  },
  torqueUnit: { fontSize: 13, fontWeight: '600', color: '#888' },
  form: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12,
    fontSize: 14, backgroundColor: '#FFF',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  buttonContainer: { padding: 16 },
  submitButton: {
    flexDirection: 'row', backgroundColor: '#4CAF50', borderRadius: 12, padding: 16,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
