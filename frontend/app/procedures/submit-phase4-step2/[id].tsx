import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import BackToDashboard from '../../../components/BackToDashboard';
import { Ionicons } from '@expo/vector-icons';
import { CHECKLIST_DATA } from '../../../constants/checklist';

const TRIAL_ITEMS = CHECKLIST_DATA.prosthetic_phase.step2.items;

export default function Phase4Step2Screen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty = user?.role === 'supervisor' || user?.role === 'implant_incharge';
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);

  // Trial checklist
  const [trialChecklist, setTrialChecklist] = useState<Record<string, boolean>>({});
  // Notes
  const [studentNotes, setStudentNotes] = useState('');
  // Confirmation
  const [confirmed, setConfirmed] = useState(false);

  const toggleTrial = (itemId: string) => {
    setTrialChecklist(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleSubmit = async () => {
    const unchecked = TRIAL_ITEMS.filter(i => !trialChecklist[i.id]);
    if (unchecked.length > 0) {
      Alert.alert('Checklist Incomplete', `Please complete: ${unchecked[0].label}`);
      return;
    }
    if (!confirmed) {
      Alert.alert('Confirmation Required', 'Please confirm the prosthesis delivery statement.');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/procedures/${id}/stage2/prosthetic/step2`, {
        trial_checklist: trialChecklist,
        student_notes: studentNotes || null,
        confirmation_statement: confirmed,
      });
      Alert.alert('Success',
        'Phase 4 Step 2 submitted! Once approved, treatment will be marked complete.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <BackToDashboard />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <Text style={s.pageTitle}>Phase 4 Step 2 - Trial & Prosthesis Delivery</Text>

          <View style={s.infoBox}>
            <Ionicons name="star" size={22} color="#FF6F00" />
            <Text style={s.infoText}>
              This is the final step. Complete the trial and delivery checklist to finalize the treatment.
            </Text>
          </View>

          {/* ── Trial Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="flask-outline" size={20} color="#D84315" />
              <Text style={s.sectionTitle}>Trial and Delivery Checklist</Text>
            </View>
            {TRIAL_ITEMS.map(item => (
              <View key={item.id} style={s.checkRow}>
                <Text style={[s.checkLabel, { flex: 1 }]}>{item.label} <Text style={{ color: '#DC3545' }}>*</Text></Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Yes', 'No'].map(opt => (
                    <TouchableOpacity key={opt}
                      style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                        trialChecklist[item.id] === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                        trialChecklist[item.id] === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                      onPress={() => setTrialChecklist(prev => ({ ...prev, [item.id]: opt === 'Yes' }))}>
                      <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                        (trialChecklist[item.id] === true && opt === 'Yes') || (trialChecklist[item.id] === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
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
              <Text style={s.label}>{notesLabel}</Text>
              <TextInput style={[s.input, s.textArea]} value={studentNotes} onChangeText={setStudentNotes}
                placeholder="Final observations, occlusion notes, delivery notes..."
                multiline numberOfLines={4} data-testid="phase4-step2-notes" />
            </View>
            <Text style={s.helperText}>Supervisor and In-Charge remarks added during approval.</Text>
          </View>

          {/* ── Confirmation Statement ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#1B5E20" />
              <Text style={s.sectionTitle}>Confirmation</Text>
            </View>
            <Text style={[s.confirmText, { marginBottom: 12 }]}>
              I hereby confirm that the prosthesis has been delivered to the patient, all trial procedures have been completed satisfactorily, and the treatment is ready for final sign-off.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', flex: 1 }}>Treatment Confirmed Complete <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', minWidth: 50, alignItems: 'center' as const },
                      confirmed === true && opt === 'Yes' && { borderColor: '#4CAF50', backgroundColor: '#4CAF50' },
                      confirmed === false && opt === 'No' && { borderColor: '#F44336', backgroundColor: '#F44336' }]}
                    onPress={() => setConfirmed(opt === 'Yes')}>
                    <Text style={[{ fontSize: 13, color: '#666', fontWeight: '600' as const },
                      (confirmed === true && opt === 'Yes') || (confirmed === false && opt === 'No') ? { color: '#FFF' } : {}]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* ── Submit ── */}
          <View style={{ padding: 16, paddingBottom: 32 }}>
            <TouchableOpacity style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit}
              disabled={loading} data-testid="phase4-step2-submit">
              {loading ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="trophy" size={22} color="#FFF" />
                <Text style={s.submitText}>Submit for Final Approval</Text></>
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
  infoBox: { flexDirection: 'row', backgroundColor: '#FFF3E0', margin: 16, padding: 14, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: '#FFE0B2' },
  infoText: { flex: 1, fontSize: 13, color: '#E65100', lineHeight: 20 },
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA', minHeight: 44 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkLabel: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  confirmText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 20 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#1B5E20', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
