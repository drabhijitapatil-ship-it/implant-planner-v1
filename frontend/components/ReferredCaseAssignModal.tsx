import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

interface StudentItem {
  id: string;
  name: string;
}

interface SupervisorItem {
  id: string;
  name: string;
  role?: string;
}

interface Props {
  visible: boolean;
  procedureId: string;
  patientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReferredCaseAssignModal({
  visible,
  procedureId,
  patientName,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (visible && procedureId) {
      fetchAssignees();
    } else {
      setSelectedStudentId('');
      setSelectedSupervisorId('');
      setErrorMsg('');
    }
  }, [visible, procedureId]);

  const fetchAssignees = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(`/procedures/${procedureId}/referral/eligible-assignees`);
      const stuList = res.data?.students || [];
      const supList = res.data?.supervisors || [];
      setStudents(stuList);
      setSupervisors(supList);
      if (stuList.length > 0) setSelectedStudentId(stuList[0].id);
      if (supList.length > 0) setSelectedSupervisorId(supList[0].id);
    } catch (err: any) {
      console.error('Failed to fetch eligible assignees', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to load department members');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedStudentId) {
      setErrorMsg('Please select a student');
      return;
    }
    if (!selectedSupervisorId) {
      setErrorMsg('Please select a supervisor');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.post(`/procedures/${procedureId}/referral-assign`, {
        student_id: selectedStudentId,
        supervisor_id: selectedSupervisorId,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to assign referred case', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to assign case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="swap-horizontal" size={22} color="#1565C0" />
              <Text style={styles.title}>Assign / Transfer Case</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#546E7A" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Patient: <Text style={styles.patientBold}>{patientName}</Text>
          </Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#1565C0" />
              <Text style={styles.loadingTxt}>Loading department members...</Text>
            </View>
          ) : (
            <ScrollView style={styles.formContent} keyboardShouldPersistTaps="handled">
              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#C62828" />
                  <Text style={styles.errorTxt}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Student Selector */}
              <Text style={styles.sectionLabel}>Select Student to Treat Case</Text>
              {students.length === 0 ? (
                <Text style={styles.emptyTxt}>No students found in your department.</Text>
              ) : (
                <View style={styles.pickerContainer}>
                  {students.map((stu) => (
                    <TouchableOpacity
                      key={stu.id}
                      style={[
                        styles.optionChip,
                        selectedStudentId === stu.id && styles.optionChipSelected,
                      ]}
                      onPress={() => setSelectedStudentId(stu.id)}
                    >
                      <Ionicons
                        name={selectedStudentId === stu.id ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={selectedStudentId === stu.id ? '#1565C0' : '#78909C'}
                      />
                      <Text
                        style={[
                          styles.optionTxt,
                          selectedStudentId === stu.id && styles.optionTxtSelected,
                        ]}
                      >
                        {stu.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Supervisor Selector */}
              <Text style={styles.sectionLabel}>Select Supervisor (or Self)</Text>
              {supervisors.length === 0 ? (
                <Text style={styles.emptyTxt}>No supervisors found in your department.</Text>
              ) : (
                <View style={styles.pickerContainer}>
                  {supervisors.map((sup) => (
                    <TouchableOpacity
                      key={sup.id}
                      style={[
                        styles.optionChip,
                        selectedSupervisorId === sup.id && styles.optionChipSelected,
                      ]}
                      onPress={() => setSelectedSupervisorId(sup.id)}
                    >
                      <Ionicons
                        name={selectedSupervisorId === sup.id ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={selectedSupervisorId === sup.id ? '#1565C0' : '#78909C'}
                      />
                      <Text
                        style={[
                          styles.optionTxt,
                          selectedSupervisorId === sup.id && styles.optionTxtSelected,
                        ]}
                      >
                        {sup.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleAssign}
              disabled={submitting || loading}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.submitTxt}>Assign Case</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A237E',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#546E7A',
    marginVertical: 12,
  },
  patientBold: {
    fontWeight: '700',
    color: '#263238',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  loadingTxt: {
    fontSize: 14,
    color: '#546E7A',
  },
  formContent: {
    maxHeight: 380,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  errorTxt: {
    fontSize: 13,
    color: '#C62828',
    flex: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#37474F',
    marginTop: 10,
    marginBottom: 8,
  },
  pickerContainer: {
    gap: 6,
    marginBottom: 10,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    backgroundColor: '#FAFAFA',
  },
  optionChipSelected: {
    borderColor: '#1565C0',
    backgroundColor: '#E3F2FD',
  },
  optionTxt: {
    fontSize: 14,
    color: '#37474F',
  },
  optionTxtSelected: {
    fontWeight: '600',
    color: '#0D47A1',
  },
  emptyTxt: {
    fontSize: 13,
    color: '#90A4AE',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECEFF1',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelTxt: {
    fontSize: 14,
    color: '#546E7A',
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1565C0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitTxt: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
  },
});
