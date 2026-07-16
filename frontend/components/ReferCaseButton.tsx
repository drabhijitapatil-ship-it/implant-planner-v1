import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Header-icon action for referring a case to another department for
 * collaborative treatment (e.g. Prosthodontics → Oral Surgery for implant
 * placement). Implant In-Charge / Administrator only — mirrors the backend's
 * REFERRAL_ROLES gate on POST /procedures/{id}/refer.
 *
 * Self-contained: fetches its own department list, renders nothing if the
 * org has no other department to refer into (fewer than 2 departments, or
 * caller's own case-department is the only one).
 */

type Department = { id: string; name: string };

export default function ReferCaseButton({
  procedureId,
  caseDepartmentId,
}: {
  procedureId: string;
  caseDepartmentId?: string | null;
}) {
  const { user } = useAuth();
  const canRefer = user?.role === 'implant_incharge' || user?.role === 'administrator';

  const [departments, setDepartments] = useState<Department[]>([]);
  useEffect(() => {
    if (!canRefer) return;
    api
      .get('/departments')
      .then((res) => setDepartments(res.data?.departments || []))
      .catch(() => {});
  }, [canRefer]);

  const targetDepartments = departments.filter((d) => d.id !== caseDepartmentId);

  const [showModal, setShowModal] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openModal = () => {
    setSelectedDeptId(null);
    setPermission('read');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedDeptId) {
      Alert.alert('Error', 'Pick a department to refer this case to');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/procedures/${procedureId}/refer`, {
        to_department_id: selectedDeptId,
        permission,
        notes: notes.trim() || undefined,
      });
      setShowModal(false);
      Alert.alert('Referral Sent', 'The receiving department will see this in their Incoming Referrals.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send referral');
    } finally {
      setSubmitting(false);
    }
  };

  const canShow = canRefer && targetDepartments.length > 0;

  return (
    <>
      {/* Fixed 44px slot regardless of visibility — this replaces the header's
          old {width:44} spacer, so the title must stay centered either way. */}
      <View style={styles.iconBtn}>
        {canShow && (
          <TouchableOpacity
            onPress={openModal}
            data-testid="refer-case-btn"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="git-branch-outline" size={20} color="#1565C0" />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet} data-testid="refer-case-modal">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text style={styles.title}>Refer Case</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Refer To Department</Text>
              {targetDepartments.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.deptRow, selectedDeptId === d.id && styles.deptRowActive]}
                  onPress={() => setSelectedDeptId(d.id)}
                  data-testid={`refer-dept-${d.id}`}
                >
                  <Ionicons
                    name={selectedDeptId === d.id ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selectedDeptId === d.id ? '#1A73E8' : '#94A3B8'}
                  />
                  <Text style={styles.deptRowText}>{d.name}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Access Level</Text>
              <View style={styles.permRow}>
                {(['read', 'edit'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.permBtn, permission === p && styles.permBtnActive]}
                    onPress={() => setPermission(p)}
                    data-testid={`refer-permission-${p}`}
                  >
                    <Text style={[styles.permBtnText, permission === p && styles.permBtnTextActive]}>
                      {p === 'read' ? 'Read Only' : 'Collaborate'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. needs implant placement before prosthetic phase"
                placeholderTextColor="#999"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                data-testid="refer-notes-input"
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                data-testid="submit-refer-case"
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Referral</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A202C' },
  label: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 8, marginTop: 4 },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  deptRowActive: { borderColor: '#1A73E8', backgroundColor: '#E3F2FD' },
  deptRowText: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  permRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  permBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  permBtnActive: { borderColor: '#1A73E8', backgroundColor: '#E3F2FD' },
  permBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  permBtnTextActive: { color: '#1A73E8' },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A202C',
    marginBottom: 20,
    textAlignVertical: 'top',
  },
  submitBtn: { backgroundColor: '#1A73E8', borderRadius: 10, padding: 14, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
