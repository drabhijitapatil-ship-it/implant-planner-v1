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
import { generateProcedurePDF } from '../../utils/pdfGenerator';
import BackToDashboard from '../../components/BackToDashboard';
import CasePhotoAlbum from '../../components/CasePhotoAlbum';
import * as Linking from 'expo-linking';

export default function ProcedureDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  
  const [procedure, setProcedure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

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
              await api.post(getApproveEndpoint(), { action: 'approve' });
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
      await api.post(getApproveEndpoint(), {
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
    if (user?.role === 'nurse' || user?.role === 'student') return false;
    
    // Assignment-based check: anyone assigned as supervisor or incharge can approve
    const isSupervisor = user?.id === procedure.supervisor_id;
    const isImplantIncharge = user?.id === procedure.implant_incharge_id;
    
    if (procedure.status === 'pending_phase1') {
      if (isSupervisor && !procedure.supervisor_phase1_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase1_approved) return true;
    }
    
    if (procedure.status === 'pending_phase2') {
      if (isSupervisor && !procedure.supervisor_phase2_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase2_approved) return true;
    }

    if (procedure.status === 'pending_stage2_surgical') {
      if (isSupervisor && !procedure.supervisor_stage2_surgical_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_stage2_surgical_approved) return true;
    }

    if (procedure.status === 'pending_stage2_prosthetic') {
      if (isSupervisor && !procedure.supervisor_stage2_prosthetic_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_stage2_prosthetic_approved) return true;
    }
    
    return false;
  };
  
  const canSubmitPhase2 = () => {
    if (!procedure) return false;
    return user?.role === 'student' && 
           user?.id === procedure.student_id && 
           procedure.status === 'phase1_approved';
  };

  const canSubmitStage2Surgical = () => {
    if (!procedure) return false;
    return user?.role === 'student' && 
           user?.id === procedure.student_id && 
           procedure.status === 'phase2_approved';
  };

  const canSubmitStage2Prosthetic = () => {
    if (!procedure) return false;
    return user?.role === 'student' && 
           user?.id === procedure.student_id && 
           procedure.status === 'stage2_surgical_approved';
  };

  const getApproveEndpoint = () => {
    if (procedure?.status === 'pending_stage2_surgical') return `/procedures/${id}/stage2/surgical/approve`;
    if (procedure?.status === 'pending_stage2_prosthetic') return `/procedures/${id}/stage2/prosthetic/approve`;
    return `/procedures/${id}/approve`;
  };

  const canEdit = () => {
    if (!procedure) return false;
    if (user?.role === 'nurse') return false;
    if (user?.role === 'implant_incharge') return true;
    if (user?.role === 'supervisor' && user?.id === procedure.supervisor_id) return true;
    if (user?.role === 'student' && user?.id === procedure.student_id && procedure.status === 'pending_phase1') {
      return true;
    }
    return false;
  };
  
  const canExportPDF = () => {
    if (!procedure) return false;
    return procedure.status === 'completed' || procedure.status === 'phase2_approved';
  };
  
  const handleExportPDF = async () => {
    if (!procedure) return;
    setPdfLoading(true);
    try {
      await generateProcedurePDF(procedure);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDeleteProcedure = () => {
    if (!procedure) return;
    Alert.alert(
      'Delete Patient Record',
      `Are you sure you want to permanently delete the record for ${procedure.patient_name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/procedures/${procedure.id || procedure._id}`);
              Alert.alert('Deleted', 'Patient record has been deleted.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete record');
            }
          },
        },
      ]
    );
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
          const itemDef = checklistDef?.items.find((i: any) => i.id === item.id);
          return (
            <View key={item.id} style={styles.checklistItem}>
              <Ionicons
                name={item.value ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={item.value ? '#4CAF50' : '#F44336'}
              />
              <Text style={styles.checklistLabel}>{itemDef?.label || item.label || item.id}</Text>
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        {/* Treatment Timeline / Progress Tracker */}
        <View style={styles.timelineContainer} data-testid="treatment-timeline">
          <Text style={styles.timelineTitle}>Treatment Progress</Text>
          <View style={styles.timelineSteps}>
            {[
              { key: 'phase1', label: 'Phase 1', subtitle: 'Pre-surgical', 
                done: ['phase1_approved','pending_phase2','phase2_approved','pending_stage2_surgical','stage2_surgical_approved','pending_stage2_prosthetic','completed'].includes(procedure.status),
                active: procedure.status === 'pending_phase1',
                timestamp: procedure.phase1_completed_at },
              { key: 'phase2', label: 'Phase 2', subtitle: 'Surgical',
                done: ['phase2_approved','pending_stage2_surgical','stage2_surgical_approved','pending_stage2_prosthetic','completed'].includes(procedure.status),
                active: ['phase1_approved','pending_phase2'].includes(procedure.status),
                timestamp: procedure.phase2_completed_at },
              { key: 'stage2s', label: 'Phase 3', subtitle: 'Second Stage Surgical',
                done: ['stage2_surgical_approved','pending_stage2_prosthetic','completed'].includes(procedure.status),
                active: ['phase2_approved','pending_stage2_surgical'].includes(procedure.status),
                timestamp: procedure.stage2_surgical_completed_at },
              { key: 'stage2p', label: 'Phase 4', subtitle: 'Prosthetic Protocol',
                done: procedure.status === 'completed',
                active: ['stage2_surgical_approved','pending_stage2_prosthetic'].includes(procedure.status),
                timestamp: procedure.stage2_prosthetic_completed_at },
              { key: 'complete', label: 'Complete', subtitle: 'Treatment Done',
                done: procedure.status === 'completed',
                active: false,
                timestamp: procedure.treatment_completed_at },
            ].map((step, index, arr) => (
              <View key={step.key} style={styles.timelineStep}>
                <View style={styles.timelineNodeCol}>
                  <View style={[
                    styles.timelineNode,
                    step.done && styles.timelineNodeDone,
                    step.active && styles.timelineNodeActive,
                  ]}>
                    {step.done ? (
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    ) : step.active ? (
                      <View style={styles.timelinePulse} />
                    ) : (
                      <View style={styles.timelineDot} />
                    )}
                  </View>
                  {index < arr.length - 1 && (
                    <View style={[
                      styles.timelineLine,
                      step.done && styles.timelineLineDone,
                    ]} />
                  )}
                </View>
                <View style={styles.timelineLabelCol}>
                  <Text style={[
                    styles.timelineLabel,
                    step.done && styles.timelineLabelDone,
                    step.active && styles.timelineLabelActive,
                  ]}>{step.label}</Text>
                  <Text style={styles.timelineSubtitle}>{step.subtitle}</Text>
                  {step.timestamp && (
                    <Text style={styles.timelineTimestamp}>
                      {format(new Date(step.timestamp), 'MMM dd, HH:mm')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Phase Indicator and Approval Status */}
        {(procedure.status === 'pending_phase1' || procedure.status === 'pending_phase2' ||
          procedure.status === 'pending_stage2_surgical' || procedure.status === 'pending_stage2_prosthetic') && (
          <View style={styles.approvalSection}>
            <Text style={styles.approvalTitle}>
              {procedure.status === 'pending_phase1' ? 'Phase 1 Approval Status' : 
               procedure.status === 'pending_phase2' ? 'Phase 2 Approval Status' :
               procedure.status === 'pending_stage2_surgical' ? 'Phase 3 Approval Status' :
               'Phase 4 Approval Status'}
            </Text>
            <View style={styles.approvalRow}>
              <Ionicons 
                name={
                  (procedure.status === 'pending_phase1' ? procedure.supervisor_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.supervisor_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.supervisor_stage2_surgical_approved :
                   procedure.supervisor_stage2_prosthetic_approved)
                    ? "checkmark-circle" : "time"
                } 
                size={24} 
                color={
                  (procedure.status === 'pending_phase1' ? procedure.supervisor_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.supervisor_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.supervisor_stage2_surgical_approved :
                   procedure.supervisor_stage2_prosthetic_approved)
                    ? "#4CAF50" : "#FFA500"
                } 
              />
              <Text style={styles.approvalText}>
                Supervisor: {
                  (procedure.status === 'pending_phase1' ? procedure.supervisor_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.supervisor_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.supervisor_stage2_surgical_approved :
                   procedure.supervisor_stage2_prosthetic_approved)
                    ? 'Approved' : 'Pending'
                }
              </Text>
            </View>
            <View style={styles.approvalRow}>
              <Ionicons 
                name={
                  (procedure.status === 'pending_phase1' ? procedure.implant_incharge_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.implant_incharge_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.implant_incharge_stage2_surgical_approved :
                   procedure.implant_incharge_stage2_prosthetic_approved)
                    ? "checkmark-circle" : "time"
                } 
                size={24} 
                color={
                  (procedure.status === 'pending_phase1' ? procedure.implant_incharge_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.implant_incharge_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.implant_incharge_stage2_surgical_approved :
                   procedure.implant_incharge_stage2_prosthetic_approved)
                    ? "#4CAF50" : "#FFA500"
                } 
              />
              <Text style={styles.approvalText}>
                Implant Incharge: {
                  (procedure.status === 'pending_phase1' ? procedure.implant_incharge_phase1_approved : 
                   procedure.status === 'pending_phase2' ? procedure.implant_incharge_phase2_approved :
                   procedure.status === 'pending_stage2_surgical' ? procedure.implant_incharge_stage2_surgical_approved :
                   procedure.implant_incharge_stage2_prosthetic_approved)
                    ? 'Approved' : 'Pending'
                }
              </Text>
            </View>
          </View>
        )}
        
        {/* Submit Phase 2 Button for Students - GREEN COLOR */}
        {canSubmitPhase2() && (
          <View style={styles.phase2ButtonContainer}>
            <TouchableOpacity
              style={styles.phase2Button}
              onPress={() => router.push(`/procedures/submit-phase2/${id}`)}
              data-testid="phase2-submit-btn"
            >
              <Ionicons name="checkmark-circle" size={24} color="#FFF" />
              <View style={styles.phase2ButtonTextContainer}>
                <Text style={styles.phase2ButtonTitle}>PHASE 1 APPROVED</Text>
                <Text style={styles.phase2ButtonSubtitle}>Tap to complete Phase 2 - Surgical Checklist</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Start Stage 2 Surgical Button */}
        {canSubmitStage2Surgical() && (
          <View style={styles.phase2ButtonContainer}>
            <TouchableOpacity
              style={[styles.phase2Button, { backgroundColor: '#2196F3' }]}
              onPress={() => router.push(`/procedures/submit-stage2-surgical/${id}`)}
              data-testid="stage2-surgical-btn"
            >
              <Ionicons name="medkit" size={24} color="#FFF" />
              <View style={styles.phase2ButtonTextContainer}>
                <Text style={styles.phase2ButtonTitle}>PHASE 2 APPROVED</Text>
                <Text style={styles.phase2ButtonSubtitle}>Tap to start Phase 3 - Second Stage Surgical Protocol</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Start Stage 2 Prosthetic Button */}
        {canSubmitStage2Prosthetic() && (
          <View style={styles.phase2ButtonContainer}>
            <TouchableOpacity
              style={[styles.phase2Button, { backgroundColor: '#FF9800' }]}
              onPress={() => router.push(`/procedures/submit-stage2-prosthetic/${id}`)}
              data-testid="stage2-prosthetic-btn"
            >
              <Ionicons name="construct" size={24} color="#FFF" />
              <View style={styles.phase2ButtonTextContainer}>
                <Text style={styles.phase2ButtonTitle}>PHASE 3 APPROVED</Text>
                <Text style={styles.phase2ButtonSubtitle}>Tap to start Phase 4 - Prosthetic Protocol</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Treatment Complete Banner */}
        {procedure.status === 'completed' && (
          <View style={styles.completedBanner}>
            <Ionicons name="trophy" size={28} color="#4CAF50" />
            <Text style={styles.completedText}>Treatment Complete</Text>
            <Text style={styles.completedSubtext}>All protocols have been approved successfully</Text>
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
          <InfoRow icon="school" label="Supervisor" value={procedure.supervisor_name} />
          <InfoRow icon="medkit" label="Implant Incharge" value={procedure.implant_incharge_name} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <InfoRow
            icon="calendar"
            label="Date"
            value={procedure.procedure_date ? format(new Date(procedure.procedure_date), 'MMM dd, yyyy') : 'N/A'}
          />
          <InfoRow icon="time" label="Time" value={procedure.procedure_time} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <InfoRow icon="receipt" label="Receipt Number" value={procedure.receipt_number} />
          <InfoRow icon="cash" label="Amount Paid" value={`₹${procedure.amount_paid}`} />
        </View>

        {(procedure.implant_region || procedure.implant_company) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Implant Details</Text>
            {procedure.implant_region && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Region:</Text>
                <Text style={styles.specText}>{procedure.implant_region}</Text>
              </View>
            )}
            {procedure.implant_company && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Company:</Text>
                <Text style={styles.specText}>{procedure.implant_company}</Text>
              </View>
            )}
          </View>
        )}

        {procedure.bone_graft_specifications && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bone Graft/Membrane</Text>
            <Text style={styles.specText}>{procedure.bone_graft_specifications}</Text>
          </View>
        )}

        {procedure.ios_file && (
          <View style={styles.section} data-testid="ios-file-section">
            <Text style={styles.sectionTitle}>IOS or Intra-oral Photos</Text>
            <TouchableOpacity
              style={styles.cbctFileRow}
              onPress={async () => {
                try {
                  const baseUrl = api.defaults.baseURL || '';
                  const fileUrl = `${baseUrl}/uploads/${procedure.ios_file}`;
                  await Linking.openURL(fileUrl);
                } catch (e) {
                  Alert.alert('Error', 'Could not open file');
                }
              }}
              data-testid="ios-file-download"
            >
              <Ionicons name="camera" size={22} color="#007AFF" />
              <Text style={styles.cbctFileName} numberOfLines={1}>
                {procedure.ios_original_name || 'Intra-oral Photo'}
              </Text>
              <Ionicons name="download-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>
        )}

        {procedure.cbct_file && (
          <View style={styles.section} data-testid="cbct-file-section">
            <Text style={styles.sectionTitle}>CBCT Slides and Report</Text>
            <TouchableOpacity
              style={styles.cbctFileRow}
              onPress={async () => {
                try {
                  const baseUrl = api.defaults.baseURL || '';
                  const fileUrl = `${baseUrl}/uploads/${procedure.cbct_file}`;
                  await Linking.openURL(fileUrl);
                } catch (e) {
                  Alert.alert('Error', 'Could not open file');
                }
              }}
              data-testid="cbct-file-download"
            >
              <Ionicons name="document-attach" size={22} color="#007AFF" />
              <Text style={styles.cbctFileName} numberOfLines={1}>
                {procedure.cbct_original_name || 'CBCT Report'}
              </Text>
              <Ionicons name="download-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
          </View>
        )}

        {procedure.remark && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Phase 1 Remarks</Text>
            <Text style={styles.specText}>{procedure.remark}</Text>
          </View>
        )}

        {procedure.stage2_surgical_remark && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Phase 3 Surgical Remarks</Text>
            <Text style={styles.specText}>{procedure.stage2_surgical_remark}</Text>
          </View>
        )}

        {procedure.stage2_prosthetic_remark && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Phase 4 Prosthetic Remarks</Text>
            <Text style={styles.specText}>{procedure.stage2_prosthetic_remark}</Text>
          </View>
        )}

        {procedure.rejection_reason && (
          <View style={[styles.section, styles.rejectionSection]}>
            <Text style={styles.sectionTitle}>Rejection Reason</Text>
            <Text style={styles.rejectionText}>{procedure.rejection_reason}</Text>
          </View>
        )}

        {procedure.stage2_surgical_rejection_reason && (
          <View style={[styles.section, styles.rejectionSection]}>
            <Text style={styles.sectionTitle}>Phase 3 - Rejection Reason</Text>
            <Text style={styles.rejectionText}>{procedure.stage2_surgical_rejection_reason}</Text>
            {procedure.stage2_surgical_rejected_by && (
              <Text style={[styles.rejectionText, { marginTop: 4, fontStyle: 'italic' }]}>
                Rejected by: {procedure.stage2_surgical_rejected_by}
              </Text>
            )}
          </View>
        )}

        {procedure.stage2_prosthetic_rejection_reason && (
          <View style={[styles.section, styles.rejectionSection]}>
            <Text style={styles.sectionTitle}>Phase 4 - Rejection Reason</Text>
            <Text style={styles.rejectionText}>{procedure.stage2_prosthetic_rejection_reason}</Text>
            {procedure.stage2_prosthetic_rejected_by && (
              <Text style={[styles.rejectionText, { marginTop: 4, fontStyle: 'italic' }]}>
                Rejected by: {procedure.stage2_prosthetic_rejected_by}
              </Text>
            )}
          </View>
        )}

        {procedure.checklist && (
          <>
            {renderChecklistSection('pre_surgical', 'Phase 1: Pre-Surgical Protocol')}
            {renderChecklistSection('surgical', 'Phase 2: Surgical Protocol')}
            {renderChecklistSection('second_stage', 'Phase 3: Second Stage Surgical Protocol')}
            {renderChecklistSection('prosthetic_phase', 'Phase 4: Prosthetic Protocol')}
          </>
        )}

        {/* Clinical Photo Album */}
        <CasePhotoAlbum
          procedureId={id as string}
          isOwner={user?.id === procedure.student_id}
          userRole={user?.role || ''}
        />

        {canApprove() && !showRejectDialog && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.approveButton, actionLoading && styles.buttonDisabled]}
              onPress={handleApprove}
              disabled={actionLoading}
              data-testid="approve-btn"
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
              data-testid="reject-btn"
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

        {/* Extra bottom spacing for the fixed buttons */}
        <View style={{ height: canExportPDF() ? 100 : 80 }} />
      </ScrollView>

      {/* Fixed bottom bar */}
      <View style={styles.bottomBar}>
        <BackToDashboard floating={false} />
        {user?.role === 'implant_incharge' && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteProcedure}
            data-testid="delete-procedure-btn"
          >
            <Ionicons name="trash" size={16} color="#FFF" />
            <Text style={styles.pdfButtonText}>DELETE</Text>
          </TouchableOpacity>
        )}
        {canExportPDF() && (
          <TouchableOpacity
            style={[styles.pdfButton, pdfLoading && styles.buttonDisabled]}
            onPress={handleExportPDF}
            disabled={pdfLoading}
            data-testid="export-pdf-btn"
          >
            {pdfLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="document-text" size={16} color="#FFF" />
                <Text style={styles.pdfButtonText}>EXPORT PDF</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
  scrollContent: {
    paddingBottom: 20,
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
  cbctFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8FF',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#D0E8FF',
  },
  cbctFileName: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    width: 80,
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
  approvalSection: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  approvalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  approvalText: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
  },
  phase2ButtonContainer: {
    padding: 16,
    paddingTop: 8,
  },
  phase2Button: {
    flexDirection: 'row',
    backgroundColor: '#28A745',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#28A745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  phase2ButtonTextContainer: {
    flex: 1,
  },
  phase2ButtonTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  phase2ButtonSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 8,
  },
  pdfButton: {
    flexDirection: 'row',
    backgroundColor: '#DC3545',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#F44336',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pdfButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  completedBanner: {
    margin: 16,
    padding: 20,
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  completedText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
  },
  completedSubtext: {
    fontSize: 14,
    color: '#388E3C',
    textAlign: 'center',
  },
  timelineContainer: {
    margin: 16,
    marginTop: 0,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  timelineSteps: {},
  timelineStep: {
    flexDirection: 'row',
    minHeight: 56,
  },
  timelineNodeCol: {
    width: 32,
    alignItems: 'center',
  },
  timelineNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  timelineNodeDone: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  timelineNodeActive: {
    backgroundColor: '#FFF',
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  timelinePulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CCC',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: '#4CAF50',
  },
  timelineLabelCol: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  timelineLabelDone: {
    color: '#2E7D32',
  },
  timelineLabelActive: {
    color: '#007AFF',
  },
  timelineSubtitle: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 1,
  },
  timelineTimestamp: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 2,
    fontWeight: '500',
  },
});
