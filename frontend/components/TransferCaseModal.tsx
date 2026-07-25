// iter-385 — Transfer Case modal.
// Student-initiated ownership handoff to a junior student in the same
// department. Popup opens from My Cases 3-dot menu. Flow: pick recipient
// student → mandatory reason → send for supervisor + implant-incharge
// approval → recipient acceptance. See backend
// /procedures/{id}/transfer/request and /transfer/eligible-students.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  FlatList, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Props = {
  procedureId: string;
  onClose: () => void;
  onSubmitted?: () => void;
  // Admin / Department In-Charge initiated — skips Supervisor + In-Charge
  // approval and goes straight to recipient acceptance.
  privileged?: boolean;
};

type Student = { id: string; name: string; username?: string };

export default function TransferCaseModal({ procedureId, onClose, onSubmitted, privileged }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const r = await api.get(`/procedures/${procedureId}/transfer/eligible-students`);
        const list: Student[] = (r.data || []).map((u: any) => ({
          id: u.id, name: u.name, username: u.username,
        }));
        setStudents(list);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Unable to load students.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [procedureId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return students;
    return students.filter(s =>
      (s.name || '').toLowerCase().includes(query) ||
      (s.username || '').toLowerCase().includes(query)
    );
  }, [q, students]);

  const canSubmit = !!selected && reason.trim().length >= 10 && !submitting;

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedureId}/transfer/request`, {
        to_student_id: selected.id, reason: reason.trim(),
      });
      Alert.alert(
        'Transfer Requested',
        privileged
          ? `${selected.name} has been notified and has 48h to accept the case.`
          : `Awaiting Supervisor + Implant In-Charge approval. ${selected.name} will have 48h to accept once both faculty approve.`,
        [{ text: 'OK', onPress: () => { onSubmitted?.(); onClose(); } }],
      );
    } catch (e: any) {
      Alert.alert('Transfer failed', e?.response?.data?.detail || 'Unable to initiate transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <View style={s.card} data-testid="transfer-case-modal">
          <View style={s.headerRow}>
            <Text style={s.title}>Transfer Case</Text>
            <Pressable onPress={onClose} hitSlop={10} data-testid="transfer-close-btn">
              <Ionicons name="close" size={22} color="#37474F" />
            </Pressable>
          </View>
          <Text style={s.help}>
            {privileged
              ? "Choose a student in this case's department. Since you're initiating this, it skips Supervisor + Implant In-Charge approval and goes straight to the recipient, who has 48h to accept. Only age & sex are shared in the AI handoff brief — patient name and other demographics are never disclosed."
              : "Choose a junior student in your department. They'll need Supervisor + Implant In-Charge approval, then must accept within 48h. Only age & sex are shared in the AI handoff brief — patient name and other demographics are never disclosed."}
          </Text>

          <Text style={s.label}>Select student</Text>
          <Pressable
            style={s.dropdown}
            onPress={() => setPickerOpen(o => !o)}
            data-testid="transfer-recipient-dropdown"
          >
            <Text style={selected ? s.dropdownValue : s.dropdownPlaceholder}>
              {selected ? selected.name : loading ? 'Loading students…' : 'Choose a student…'}
            </Text>
            <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#546E7A" />
          </Pressable>

          {pickerOpen && (
            <View style={s.pickerBox}>
              <TextInput
                placeholder="Search student…"
                placeholderTextColor="#90A4AE"
                value={q}
                onChangeText={setQ}
                style={s.searchInput}
                data-testid="transfer-recipient-search"
              />
              {loading ? (
                <ActivityIndicator style={{ padding: 16 }} />
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 220 }}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={s.sep} />}
                  ListEmptyComponent={<Text style={s.empty}>No eligible students in your department.</Text>}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => { setSelected(item); setPickerOpen(false); setQ(''); }}
                      style={s.pickerRow}
                      data-testid={`transfer-recipient-option-${item.id}`}
                    >
                      <Text style={s.pickerName}>{item.name}</Text>
                      {item.username ? <Text style={s.pickerUser}>@{item.username}</Text> : null}
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}

          <Text style={[s.label, { marginTop: 14 }]}>Reason for transfer</Text>
          <TextInput
            style={s.reasonInput}
            placeholder="Explain why this case is being transferred (min 10 characters)…"
            placeholderTextColor="#90A4AE"
            multiline
            value={reason}
            onChangeText={setReason}
            data-testid="transfer-reason-input"
          />

          <Pressable
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit}
            data-testid="transfer-submit-btn"
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitTxt}>Transfer</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 27, 45, 0.55)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: '#0D47A1' },
  help: { fontSize: 12, color: '#546E7A', lineHeight: 17, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#37474F', marginTop: 6, marginBottom: 4 },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
  },
  dropdownValue: { color: '#0D47A1', fontWeight: '600', fontSize: 14 },
  dropdownPlaceholder: { color: '#90A4AE', fontSize: 14 },
  pickerBox: { marginTop: 6, borderWidth: 1, borderColor: '#ECEFF1', borderRadius: 10, backgroundColor: '#F8FAFC' },
  searchInput: { padding: 10, fontSize: 13, color: '#263238' },
  pickerRow: { paddingHorizontal: 14, paddingVertical: 10 },
  pickerName: { color: '#0D47A1', fontWeight: '600', fontSize: 14 },
  pickerUser: { color: '#78909C', fontSize: 11, marginTop: 2 },
  sep: { height: 1, backgroundColor: '#ECEFF1' },
  empty: { textAlign: 'center', color: '#78909C', padding: 14, fontSize: 12 },
  reasonInput: {
    borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, padding: 10,
    fontSize: 13, color: '#263238', minHeight: 84, textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: 14, backgroundColor: '#0D47A1', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#B0BEC5' },
  submitTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
