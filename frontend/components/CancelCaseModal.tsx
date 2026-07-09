import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

export default function CancelCaseModal({
  visible,
  procedureId,
  patientName,
  onClose,
  onCancelled,
}: {
  visible: boolean;
  procedureId: string;
  patientName?: string;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setReason('');
      setSubmitting(false);
    }
  }, [visible]);

  const canSubmit = reason.trim().length >= 3 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedureId}/cancel`, { reason: reason.trim() });
      Alert.alert('Case cancelled', `${patientName || 'This case'} has been cancelled. The slot is now free.`);
      onCancelled?.();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'Failed to cancel. Please try again.';
      Alert.alert('Could not cancel', String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.backdrop}>
        <View style={s.sheet} testID="cancel-case-modal">
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Cancel this case?</Text>
              {patientName ? <Text style={s.subtitle} numberOfLines={1}>{patientName}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="cancel-case-close">
              <Ionicons name="close" size={22} color="#546E7A" />
            </TouchableOpacity>
          </View>

          <View style={s.warnRow}>
            <Ionicons name="alert-circle-outline" size={16} color="#C62828" />
            <Text style={s.warnTxt}>This frees up the booked slot for other users immediately. This cannot be undone.</Text>
          </View>

          <Text style={s.label}>Reason for cancellation <Text style={s.required}>*</Text></Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Patient unavailable, medical contraindication…"
            placeholderTextColor="#B0BEC5"
            style={[s.input, s.textarea]}
            multiline
            numberOfLines={3}
            data-testid="cancel-case-reason-input"
            testID="cancel-case-reason-input"
          />
          <Text style={s.helper}>Visible on the case audit trail and shared with assigned stakeholders.</Text>

          <View style={s.footer}>
            <TouchableOpacity style={s.backBtn} onPress={onClose} disabled={submitting} testID="cancel-case-back">
              <Text style={s.backTxt}>Go back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
              testID="cancel-case-submit"
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={18} color="#FFF" />
                  <Text style={s.submitTxt}>Confirm cancellation</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,25,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '800', color: '#1A2332' },
  subtitle: { fontSize: 12, color: '#78909C', marginTop: 2 },
  warnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFEBEE', paddingHorizontal: 10, paddingVertical: 10,
    borderRadius: 8, marginBottom: 4,
  },
  warnTxt: { flex: 1, fontSize: 12, color: '#C62828', fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '700', color: '#37474F', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: '#C62828' },
  input: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A2332',
    backgroundColor: '#FAFCFF',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  helper: { fontSize: 11, color: '#90A4AE', marginTop: 6 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
  backBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#CFD8DC' },
  backTxt: { fontSize: 14, fontWeight: '700', color: '#455A64' },
  submitBtn: {
    flex: 1.4, paddingVertical: 12, alignItems: 'center', borderRadius: 10,
    backgroundColor: '#C62828', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  submitBtnDisabled: { backgroundColor: '#E0B4B4' },
  submitTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
