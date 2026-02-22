import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { STATUS_COLORS, STATUS_LABELS, CHECKLIST_DATA } from '../../constants/checklist';
import { format } from 'date-fns';

export default function ProcedureDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  
  const [procedure, setProcedure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    loadProcedure();
  }, [id]);

  const loadProcedure = async () => {
    try {
      const response = await api.get(`/procedures/${id}`);
      setProcedure(response.data);
    } catch (error) {
      console.error('Failed to load procedure:', error);
      Alert.alert('Error', 'Failed to load procedure details');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    Alert.alert(
      'Approve Procedure',
      'Are you sure you want to approve this procedure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.post(`/procedures/${id}/approve`, { action: 'approve' });
              Alert.alert('Success', 'Procedure approved successfully');
              loadProcedure();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to approve procedure');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection');
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/procedures/${id}/approve`, {
        action: 'reject',
        rejection_reason: rejectionReason,
      });
      Alert.alert('Success', 'Procedure rejected');
      setShowRejectDialog(false);
      setRejectionReason('');
      loadProcedure();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to reject procedure');
    } finally {
      setActionLoading(false);
    }
  };

  const canApprove = () => {
    if (!procedure) return false;
    
    const isInstructor = (user?.role === 'instructor' || user?.role === 'administrator') && user?.id === procedure.instructor_id;
    const isImplantIncharge = (user?.role === 'implant_incharge' || user?.role === 'administrator') && user?.id === procedure.implant_incharge_id;
    
    // Phase 1: Can approve if pending_phase1 and haven't approved yet
    if (procedure.status === 'pending_phase1') {
      if (isInstructor && !procedure.instructor_phase1_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase1_approved) return true;
    }
    
    // Phase 2: Can approve if pending_phase2 and haven't approved yet
    if (procedure.status === 'pending_phase2') {
      if (isInstructor && !procedure.instructor_phase2_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase2_approved) return true;
    }
    
    return false;
  };
  
  const canSubmitPhase2 = () => {
    if (!procedure) return false;
    return user?.role === 'student' && 
           user?.id === procedure.student_id && 
           procedure.status === 'phase1_approved';
  };

  const canEdit = () => {
    if (!procedure) return false;
    
    if (user?.role === 'implant_incharge') return true;
    
    if (user?.role === 'instructor' && user?.id === procedure.instructor_id) return true;
    
    if (user?.role === 'student' && user?.id === procedure.student_id && procedure.status === 'pending_instructor') {
      return true;
    }
    
    return false;
  };

  const renderChecklistSection = (sectionKey: string, sectionTitle: string) => {
    const sectionData = procedure.checklist?.[sectionKey];
    if (!sectionData || !sectionData.items || sectionData.items.length === 0) {
      return null;
    }

    const checklistDef = CHECKLIST_DATA[sectionKey as keyof typeof CHECKLIST_DATA];

    return (
      <View key={sectionKey} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        {sectionData.items.map((item: any) => {
          const itemDef = checklistDef.items.find((i: any) => i.id === item.id);
          return (
            <View key={item.id} style={styles.checklistItem}>
              <Ionicons
                name={item.value ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={item.value ? '#4CAF50' : '#F44336'}
              />
              <Text style={styles.checklistLabel}>{itemDef?.label || item.id}</Text>
            </View>
          );
        })}

        {sectionData.additional_fields && Object.keys(sectionData.additional_fields).length > 0 && (
          <View style={styles.additionalFields}>
            {Object.entries(sectionData.additional_fields).map(([key, value]) => (
              <View key={key} style={styles.additionalField}>
                <Text style={styles.additionalFieldLabel}>{key}:</Text>
                <Text style={styles.additionalFieldValue}>{value as string}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!procedure) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Procedure not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Procedure Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView>
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[procedure.status as keyof typeof STATUS_COLORS] },
            ]}
          >
            <Text style={styles.statusText}>
              {STATUS_LABELS[procedure.status as keyof typeof STATUS_LABELS]}
            </Text>
          </View>
        </View>

        {/* Phase Indicator and Approval Status */}
        {(procedure.status === 'pending_phase1' || procedure.status === 'pending_phase2') && (
          <View style={styles.approvalSection}>
            <Text style={styles.approvalTitle}>
              {procedure.status === 'pending_phase1' ? 'Phase 1 Approval Status' : 'Phase 2 Approval Status'}
            </Text>
            <View style={styles.approvalRow}>
              <Ionicons 
                name={procedure.instructor_phase1_approved || procedure.instructor_phase2_approved ? "checkmark-circle" : "time"} 
                size={24} 
                color={procedure.instructor_phase1_approved || procedure.instructor_phase2_approved ? "#4CAF50" : "#FFA500"} 
              />
              <Text style={styles.approvalText}>
                Instructor: {procedure.instructor_phase1_approved || procedure.instructor_phase2_approved ? '✅ Approved' : '⏳ Pending'}
              </Text>
            </View>
            <View style={styles.approvalRow}>
              <Ionicons 
                name={procedure.implant_incharge_phase1_approved || procedure.implant_incharge_phase2_approved ? "checkmark-circle" : "time"} 
                size={24} 
                color={procedure.implant_incharge_phase1_approved || procedure.implant_incharge_phase2_approved ? "#4CAF50" : "#FFA500"} 
              />
              <Text style={styles.approvalText}>
                Implant Incharge: {procedure.implant_incharge_phase1_approved || procedure.implant_incharge_phase2_approved ? '✅ Approved' : '⏳ Pending'}
              </Text>
            </View>
          </View>
        )}
        
        {/* Submit Phase 2 Button for Students */}
        {canSubmitPhase2() && (
          <View style={styles.phase2ButtonContainer}>
            <TouchableOpacity
              style={styles.phase2Button}
              onPress={() => router.push(`/procedures/submit-phase2/${id}`)}
            >
              <Ionicons name="document-text" size={20} color="#FFF" />
              <Text style={styles.phase2ButtonText}>Submit Phase 2 (Surgical Protocols)</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patient Information</Text>
          <InfoRow icon="person" label="Patient Name" value={procedure.patient_name} />
          <InfoRow icon="card" label="Registration Number" value={procedure.registration_number} />
          <InfoRow icon="medical" label="Implant Site" value={procedure.implant_site} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Staff</Text>
          <InfoRow icon="school" label="Student" value={procedure.student_name} />
          <InfoRow icon="school" label="Instructor" value={procedure.instructor_name} />
          <InfoRow icon="medkit" label="Implant Incharge" value={procedure.implant_incharge_name} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <InfoRow
            icon="calendar"
            label="Date"
            value={format(new Date(procedure.procedure_date), 'MMM dd, yyyy')}
          />
          <InfoRow icon="time" label="Time" value={procedure.procedure_time} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow icon="receipt" label="Receipt Number" value={procedure.receipt_number} />
          <InfoRow icon="cash" label="Amount Paid" value={`₹${procedure.amount_paid}`} />
        </View>

        {procedure.implant_specifications && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Implant Specifications</Text>
            <Text style={styles.specText}>{procedure.implant_specifications}</Text>
          </View>
        )}

        {procedure.bone_graft_specifications && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bone Graft/Membrane</Text>
            <Text style={styles.specText}>{procedure.bone_graft_specifications}</Text>
          </View>
        )}

        {procedure.remark && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Remark</Text>
            <Text style={styles.specText}>{procedure.remark}</Text>
          </View>
        )}

        {procedure.rejection_reason && (
          <View style={[styles.section, styles.rejectionSection]}>
            <Text style={styles.sectionTitle}>Rejection Reason</Text>
            <Text style={styles.rejectionText}>{procedure.rejection_reason}</Text>
          </View>
        )}

        {procedure.checklist && (
          <>
            {renderChecklistSection('pre_surgical', 'I. Pre-surgical Protocols')}
            {renderChecklistSection('surgical', 'II. Surgical Protocols')}
            {renderChecklistSection('second_stage', 'III. Second Stage Surgical Protocols')}
            {renderChecklistSection('prosthetic_phase', 'IV. Prosthetic Phase Protocols')}
          </>
        )}

        {canApprove() && !showRejectDialog && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.approveButton, actionLoading && styles.buttonDisabled]}
              onPress={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.buttonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rejectButton, actionLoading && styles.buttonDisabled]}
              onPress={() => setShowRejectDialog(true)}
              disabled={actionLoading}
            >
              <Ionicons name="close-circle" size={20} color="#FFF" />
              <Text style={styles.buttonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        {showRejectDialog && (
          <View style={styles.rejectDialog}>
            <Text style={styles.dialogTitle}>Reason for Rejection</Text>
            <TextInput
              style={styles.dialogInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Enter reason for rejection"
              multiline
              numberOfLines={4}
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogCancelButton}
                onPress={() => {
                  setShowRejectDialog(false);
                  setRejectionReason('');
                }}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmButton, actionLoading && styles.buttonDisabled]}
                onPress={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Confirm Rejection</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={20} color="#666" />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  placeholder: {
    width: 32,
  },
  statusCard: {
    padding: 16,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#FFF',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  specText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
  },
  rejectionSection: {
    backgroundColor: '#FFEBEE',
  },
  rejectionText: {
    fontSize: 14,
    color: '#F44336',
    lineHeight: 20,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  checklistLabel: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
  },
  additionalFields: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  additionalField: {
    marginBottom: 8,
  },
  additionalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  additionalFieldValue: {
    fontSize: 14,
    color: '#1A1A1A',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F44336',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectDialog: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  dialogInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dialogButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  dialogCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  dialogCancelText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  dialogConfirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F44336',
    alignItems: 'center',
  },
  dialogConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
