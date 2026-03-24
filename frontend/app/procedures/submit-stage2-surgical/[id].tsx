import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../../../constants/checklist';

const CHECKLIST_ITEMS = CHECKLIST_DATA.second_stage.items;

export default function Stage2SurgicalSubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Checklist state
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  // Text fields embedded in checklist
  const [isqValue, setIsqValue] = useState('');
  const [healingAbutmentHeight, setHealingAbutmentHeight] = useState('');
  // Notes
  const [studentNotes, setStudentNotes] = useState('');

  const toggleChecklist = (itemId: string) => {
    setChecklistState(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleSubmit = async () => {
    // Validate all checklist items checked
    const unchecked = CHECKLIST_ITEMS.filter(i => !checklistState[i.id]);
    if (unchecked.length > 0) {
      Alert.alert('Checklist Incomplete', `Please complete: ${unchecked[0].label}`);
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/surgical`, {
        checklist_items: checklistState,
        isq_value: isqValue || null,
        healing_abutment_height: healingAbutmentHeight || null,
        student_notes: studentNotes || null,
      });
      Alert.alert('Success',
        'Phase 3 submitted successfully! Awaiting approval.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit Phase 3');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <BackToDashboard />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <Text style={s.pageTitle}>Phase 3 - Second Stage Surgical</Text>

          <View style={s.infoBox}>
            <Ionicons name="information-circle" size={22} color="#1565C0" />
            <Text style={s.infoText}>
              Stage 1 Implant Placement is complete. Please complete the second stage surgical checklist for healing and exposure phase assessment.
            </Text>
          </View>

          {/* ── Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>Second Stage Checklist</Text>
            </View>

            {CHECKLIST_ITEMS.map(item => (
              <View key={item.id}>
                <TouchableOpacity style={s.checkRow} onPress={() => toggleChecklist(item.id)}>
                  <Ionicons
                    name={checklistState[item.id] ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={checklistState[item.id] ? '#4CAF50' : '#999'}
                  />
                  <Text style={s.checkLabel}>{item.label}</Text>
                </TouchableOpacity>

                {/* ISQ Value text input */}
                {item.id === 'isq_checked' && checklistState[item.id] && (
                  <View style={s.inlineInput}>
                    <Text style={s.inlineLabel}>ISQ Value (optional)</Text>
                    <TextInput
                      style={s.smallInput}
                      value={isqValue}
                      onChangeText={setIsqValue}
                      placeholder="e.g. 72"
                      keyboardType="decimal-pad"
                      maxLength={5}
                      data-testid="isq-value-input"
                    />
                  </View>
                )}

                {/* Healing Abutment cuff height */}
                {item.id === 'healing_abutment' && checklistState[item.id] && (
                  <View style={s.inlineInput}>
                    <Text style={s.inlineLabel}>Cuff Height (mm)</Text>
                    <TextInput
                      style={s.smallInput}
                      value={healingAbutmentHeight}
                      onChangeText={setHealingAbutmentHeight}
                      placeholder="e.g. 3.5"
                      keyboardType="decimal-pad"
                      maxLength={5}
                      data-testid="cuff-height-input"
                    />
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* ── Clinical / Radiographical Assessment Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#00695C" />
              <Text style={s.sectionTitle}>Clinical / Radiographical Assessment</Text>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Student Notes</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={studentNotes}
                onChangeText={setStudentNotes}
                placeholder="Clinical findings, healing assessment, implant stability observations, soft tissue status..."
                multiline
                numberOfLines={4}
                data-testid="phase3-student-notes"
              />
            </View>

            <Text style={s.helperText}>
              Supervisor and In-Charge remarks will be added during approval.
            </Text>
          </View>

          {/* ── Submit ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
              data-testid="phase3-submit-btn"
            >
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                  <Text style={s.submitText}>Submit Phase 3 for Approval</Text>
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
  infoBox: { flexDirection: 'row', backgroundColor: '#E3F2FD', margin: 16, padding: 14, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: '#BBDEFB' },
  infoText: { flex: 1, fontSize: 13, color: '#1565C0', lineHeight: 20 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 32, paddingVertical: 8, backgroundColor: '#F5F7FA', borderRadius: 8, marginBottom: 4 },
  inlineLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  smallInput: { width: 90, borderWidth: 1.5, borderColor: '#1A73E8', borderRadius: 8, padding: 8, fontSize: 16, fontWeight: '700', textAlign: 'center', backgroundColor: '#FFF' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 44 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#2196F3', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
