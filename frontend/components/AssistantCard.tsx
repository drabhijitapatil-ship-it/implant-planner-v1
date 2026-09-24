import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert, ActivityIndicator, Platform } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import AssistantPicker from './AssistantPicker';

/**
 * iter-Jun-2026: Case Assistant card on the case-detail screen.
 * • Everyone involved in the case sees who the assistant is.
 * • Case owner / creator, the case supervisor and Implant In-Charge /
 *   Administrator can Change or Remove the assistant (PATCH /assistant).
 * • The assistant themself sees a read-only "You are assisting" hint.
 */
export default function AssistantCard({ procedure, onChanged }: { procedure: any; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickId, setPickId] = useState<string>(procedure?.assistant_id || '');
  const [pickName, setPickName] = useState<string>(procedure?.assistant_name || '');

  if (!procedure) return null;
  const role = user?.role;
  const uid = user?.id || (user as any)?._id;
  const isOwner = procedure.student_id === uid || procedure.created_by_id === uid;
  const isCaseSupervisor = role === 'supervisor' && procedure.supervisor_id === uid;
  const isFaculty = role === 'implant_incharge' || role === 'administrator';
  const canManage = (isOwner || isCaseSupervisor || isFaculty) && procedure.status !== 'completed' && !procedure.viewer_is_assistant;
  const hasAssistant = !!procedure.assistant_id;
  const isMe = hasAssistant && procedure.assistant_id === uid;

  const save = async (assistantId: string) => {
    setSaving(true);
    try {
      await api.patch(`/procedures/${procedure.id || procedure._id}/assistant`, { assistant_id: assistantId });
      setOpen(false);
      onChanged();
    } catch (e: any) {
      Alert.alert('Could not update assistant', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = () => {
    const go = () => save('');
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if ((globalThis as any).confirm?.(`Remove ${procedure.assistant_name} as assistant?`)) go();
      return;
    }
    Alert.alert('Remove assistant', `Remove ${procedure.assistant_name} as assistant for this case?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={styles.section} testID="assistant-card" data-testid="assistant-card">
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Assistant</Text>
        {canManage ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.pill}
              onPress={() => { setPickId(procedure.assistant_id || ''); setPickName(procedure.assistant_name || ''); setOpen(true); }}
              testID="assistant-change-btn"
              data-testid="assistant-change-btn"
            >
              <Ionicons name={hasAssistant ? 'swap-horizontal-outline' : 'person-add-outline'} size={14} color="#1565C0" />
              <Text style={styles.pillTxt}>{hasAssistant ? 'Change' : 'Add'}</Text>
            </TouchableOpacity>
            {hasAssistant ? (
              <TouchableOpacity
                style={[styles.pill, styles.pillDanger]}
                onPress={confirmRemove}
                disabled={saving}
                testID="assistant-remove-btn"
                data-testid="assistant-remove-btn"
              >
                <Ionicons name="person-remove-outline" size={14} color="#C62828" />
                <Text style={[styles.pillTxt, { color: '#C62828' }]}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.row}>
        <Ionicons name="people" size={18} color={hasAssistant ? '#1565C0' : '#999'} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.value, !hasAssistant && { color: '#999' }]} testID="assistant-name" data-testid="assistant-name">
            {hasAssistant ? procedure.assistant_name : 'No assistant added'}
          </Text>
          {hasAssistant ? (
            <Text style={styles.sub}>
              {isMe
                ? 'You are assisting this case · read-only access to Phase 1-4'
                : `Postgraduate Student · read-only reviewer${procedure.assistant_notified_at ? ' · notified' : ' · notified once Phase 1 is approved'}`}
            </Text>
          ) : null}
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.sheetTitle}>{hasAssistant ? 'Change assistant' : 'Add assistant'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 6 }} testID="assistant-modal-close">
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            <AssistantPicker
              valueId={pickId}
              valueName={pickName}
              onChange={(id, name) => { setPickId(id); setPickName(name); }}
              excludeIds={[procedure.student_id, procedure.created_by_id]}
              helper="Only Postgraduate Students can be assistants. The selected student is notified once Phase 1 is approved."
            />
            <TouchableOpacity
              style={[styles.saveBtn, (saving || pickId === (procedure.assistant_id || '')) && { opacity: 0.5 }]}
              disabled={saving || pickId === (procedure.assistant_id || '')}
              onPress={() => save(pickId)}
              testID="assistant-save-btn"
              data-testid="assistant-save-btn"
            >
              {saving ? <ActivityIndicator color="#FFF" /> : (
                <Text style={styles.saveTxt}>{pickId ? 'Save assistant' : 'Remove assistant'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EAF6',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, minHeight: 32, borderRadius: 16,
    backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#BBDEFB',
  },
  pillDanger: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' },
  pillTxt: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { fontSize: 15, fontWeight: '600', color: '#222' },
  sub: { fontSize: 12, color: '#777', marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  saveBtn: {
    marginTop: 16, backgroundColor: '#1565C0', borderRadius: 12,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  saveTxt: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
