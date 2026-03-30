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
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import CaseCompletionBadge from '../../components/CaseCompletionBadge';
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
  const [rejectionType, setRejectionType] = useState<'permanent' | 'reconsider' | null>(null);
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
    if (!rejectionType) {
      Alert.alert('Error', 'Please select a rejection type');
      return;
    }

    setActionLoading(true);
    try {
      await api.post(getApproveEndpoint(), {
        action: 'reject',
        rejection_reason: rejectionReason,
        rejection_type: rejectionType,
      });
      const typeLabel = rejectionType === 'permanent' ? 'permanently rejected' : 'rejected with consideration';
      Alert.alert('Success', `Procedure ${typeLabel}`);
      setShowRejectDialog(false);
      setRejectionReason('');
      setRejectionType(null);
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
    const isInchargeSelfCreated = procedure.created_by_role === 'implant_incharge' && user?.id === procedure.created_by_id;
    
    if (procedure.status === 'pending_phase1') {
      if (isInchargeSelfCreated) return true;
      if (isSupervisor && !procedure.supervisor_phase1_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase1_approved) return true;
    }
    
    if (procedure.status === 'pending_phase2') {
      if (isInchargeSelfCreated) return true;
      if (isSupervisor && !procedure.supervisor_phase2_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_phase2_approved) return true;
    }

    if (procedure.status === 'pending_stage2_surgical') {
      if (isInchargeSelfCreated) return true;
      if (isSupervisor && !procedure.supervisor_stage2_surgical_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_stage2_surgical_approved) return true;
    }

    if (procedure.status === 'pending_stage2_prosthetic') {
      if (isInchargeSelfCreated) return true;
      if (isSupervisor && !procedure.supervisor_stage2_prosthetic_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_stage2_prosthetic_approved) return true;
    }

    if (procedure.status === 'pending_final_delivery') {
      if (isInchargeSelfCreated) return true;
      if (isSupervisor && !procedure.supervisor_final_delivery_approved) return true;
      if (isImplantIncharge && !procedure.implant_incharge_final_delivery_approved) return true;
    }
    
    return false;
  };
  
  const canSubmitPhase2 = () => {
    if (!procedure) return false;
    const isOwner = user?.id === procedure.student_id || user?.id === procedure.created_by_id;
    return isOwner && procedure.status === 'phase1_approved';
  };

  const canSubmitStage2Surgical = () => {
    if (!procedure) return false;
    const isOwner = user?.id === procedure.student_id || user?.id === procedure.created_by_id;
    return isOwner && procedure.status === 'phase2_approved';
  };

  const canSubmitStage2Prosthetic = () => {
    if (!procedure) return false;
    const isOwner = user?.id === procedure.student_id || user?.id === procedure.created_by_id;
    return isOwner && procedure.status === 'stage2_surgical_approved';
  };

  const canSubmitPhase4Step2 = () => {
    if (!procedure) return false;
    const isOwner = user?.id === procedure.student_id || user?.id === procedure.created_by_id;
    return isOwner && procedure.status === 'stage2_prosthetic_step1_approved';
  };

  const getApproveEndpoint = () => {
    if (procedure?.status === 'pending_stage2_surgical') return `/procedures/${id}/stage2/surgical/approve`;
    if (procedure?.status === 'pending_stage2_prosthetic') return `/procedures/${id}/stage2/prosthetic/approve`;
    if (procedure?.status === 'pending_final_delivery') return `/procedures/${id}/stage2/prosthetic/step2/approve`;
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
    // Allow PDF export from pending_phase1 onwards (all non-draft statuses)
    return procedure.status !== 'draft';
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
        
        {/* Permanently Rejected Banner */}
        {procedure.status === 'permanently_rejected' && (
          <View style={{ margin: 16, padding: 16, backgroundColor: '#FFEBEE', borderRadius: 12, borderWidth: 2, borderColor: '#D32F2F' }} data-testid="permanent-rejection-banner">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="ban" size={22} color="#D32F2F" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#B71C1C' }}>Permanently Rejected</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#C62828', marginBottom: 6 }}>
              Phase {procedure.rejected_phase?.replace('phase', '') || '?'} was permanently rejected by {procedure.rejected_by || procedure.phase2_rejected_by || procedure.stage2_surgical_rejected_by || procedure.stage2_prosthetic_rejected_by || 'reviewer'}.
            </Text>
            <View style={{ backgroundColor: '#FFF', padding: 10, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: '#666', fontWeight: '600' }}>Reason:</Text>
              <Text style={{ fontSize: 13, color: '#333', marginTop: 2 }}>
                {procedure.rejection_reason || procedure.phase2_rejection_reason || procedure.stage2_surgical_rejection_reason || procedure.stage2_prosthetic_rejection_reason || 'No reason provided'}
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: '#999', marginTop: 8, fontStyle: 'italic' }}>This case cannot proceed further.</Text>
          </View>
        )}

        {/* Rejected with Consideration Banner */}
        {procedure.rejected_phase && procedure.status !== 'permanently_rejected' && (
          (() => {
            const phase = procedure.rejected_phase;
            const isReconsider =
              (phase === 'phase1' && procedure.rejection_type === 'reconsider') ||
              (phase === 'phase2' && procedure.phase2_rejection_type === 'reconsider') ||
              (phase === 'phase3' && procedure.stage2_surgical_rejection_type === 'reconsider') ||
              (phase === 'phase4' && procedure.stage2_prosthetic_rejection_type === 'reconsider');
            const reason = phase === 'phase1' ? procedure.rejection_reason :
              phase === 'phase2' ? procedure.phase2_rejection_reason :
              phase === 'phase3' ? procedure.stage2_surgical_rejection_reason :
              procedure.stage2_prosthetic_rejection_reason;
            const rejBy = phase === 'phase1' ? procedure.rejected_by :
              phase === 'phase2' ? procedure.phase2_rejected_by :
              phase === 'phase3' ? procedure.stage2_surgical_rejected_by :
              procedure.stage2_prosthetic_rejected_by;

            if (!isReconsider) return null;
            return (
              <View style={{ margin: 16, padding: 16, backgroundColor: '#FFF3E0', borderRadius: 12, borderWidth: 2, borderColor: '#F57C00' }} data-testid="reconsider-rejection-banner">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="refresh" size={22} color="#E65100" />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#E65100' }}>Revision Requested</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#BF360C', marginBottom: 6 }}>
                  Phase {phase.replace('phase', '')} was sent back for revision by {rejBy || 'reviewer'}.
                </Text>
                <View style={{ backgroundColor: '#FFF', padding: 10, borderRadius: 8 }}>
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: '600' }}>Feedback:</Text>
                  <Text style={{ fontSize: 13, color: '#333', marginTop: 2 }}>{reason || 'No reason provided'}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Please make the required changes and resubmit this phase for approval.</Text>
              </View>
            );
          })()
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
              style={[styles.phase2Button, { backgroundColor: '#6A1B9A' }]}
              onPress={() => router.push(`/procedures/submit-stage2-prosthetic/${id}`)}
              data-testid="stage2-prosthetic-btn"
            >
              <Ionicons name="construct" size={24} color="#FFF" />
              <View style={styles.phase2ButtonTextContainer}>
                <Text style={styles.phase2ButtonTitle}>PHASE 3 APPROVED</Text>
                <Text style={styles.phase2ButtonSubtitle}>Tap to start Phase 4 Step 1 - Final Prosthesis & Impressions</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Phase 4 Step 2 Button */}
        {canSubmitPhase4Step2() && (
          <View style={styles.phase2ButtonContainer}>
            <TouchableOpacity
              style={[styles.phase2Button, { backgroundColor: '#1B5E20' }]}
              onPress={() => router.push(`/procedures/submit-phase4-step2/${id}`)}
              data-testid="phase4-step2-btn"
            >
              <Ionicons name="trophy" size={24} color="#FFF" />
              <View style={styles.phase2ButtonTextContainer}>
                <Text style={styles.phase2ButtonTitle}>PHASE 4 STEP 1 APPROVED</Text>
                <Text style={styles.phase2ButtonSubtitle}>Tap to complete Step 2 - Trial & Prosthesis Delivery</Text>
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

        {/* Procedure Type & Plan */}
        {procedure.implant_procedure_type && (
          <View style={styles.section} data-testid="procedure-type-section">
            <Text style={styles.sectionTitle}>Procedure Details</Text>
            <InfoRow icon="construct" label="Procedure Type" value={procedure.implant_procedure_type} />
            {procedure.loading_type?.length > 0 && (
              <InfoRow icon="flash" label="Loading Type" value={procedure.loading_type.join(', ')} />
            )}
            {procedure.prosthetic_plan && (
              <InfoRow icon="build" label="Prosthetic Plan" value={procedure.prosthetic_plan} />
            )}
            {procedure.prosthetic_plan_other && (
              <InfoRow icon="create" label="Prosthetic Plan (Other)" value={procedure.prosthetic_plan_other} />
            )}
          </View>
        )}

        {/* Clinical Examination */}
        {(procedure.edentulous_sites?.length > 0 || procedure.edentulous_site || procedure.arch_condition || procedure.ridge_contour || procedure.soft_tissue_thickness || procedure.keratinized_mucosa) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#1E88E5' }]} data-testid="clinical-examination-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="search" size={20} color="#1E88E5" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#1565C0' }]}>Clinical Examination</Text>
            </View>
            {procedure.edentulous_sites?.length > 0 && (
              <InfoRow icon="grid" label="Edentulous Sites" value={procedure.edentulous_sites.join(', ')} />
            )}
            {procedure.edentulous_site && !procedure.edentulous_sites?.length && (
              <InfoRow icon="grid" label="Edentulous Site" value={procedure.edentulous_site} />
            )}
            {procedure.arch_condition && (
              <InfoRow icon="ellipse" label="Arch Condition" value={procedure.arch_condition} />
            )}
            {procedure.ridge_contour && (
              <InfoRow icon="analytics" label="Ridge Contour" value={procedure.ridge_contour} />
            )}
            {procedure.soft_tissue_thickness && (
              <InfoRow icon="layers" label="Soft Tissue Thickness" value={procedure.soft_tissue_thickness} />
            )}
            {procedure.keratinized_mucosa && (
              <InfoRow icon="resize" label="Keratinized Mucosa" value={procedure.keratinized_mucosa} />
            )}
          </View>
        )}

        {/* Occlusal Analysis */}
        {(procedure.occlusal_scheme || procedure.parafunction_habit || procedure.vertical_dimension || procedure.opposing_dentition || procedure.vertical_dimension_mm || procedure.tmj) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#7B1FA2' }]} data-testid="occlusal-analysis-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="fitness" size={20} color="#7B1FA2" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#6A1B9A' }]}>Occlusal Analysis</Text>
            </View>
            {procedure.occlusal_scheme && (
              <InfoRow icon="swap-horizontal" label="Occlusal Scheme" value={procedure.occlusal_scheme} />
            )}
            {procedure.parafunction_habit && (
              <InfoRow icon="alert-circle" label="Parafunctional Habits" value={procedure.parafunction_habit} />
            )}
            {procedure.vertical_dimension && (
              <InfoRow icon="arrow-up" label="Vertical Dimension" value={procedure.vertical_dimension} />
            )}
            {procedure.vertical_dimension_mm && (
              <InfoRow icon="arrow-up" label="Vertical Dimension (mm)" value={procedure.vertical_dimension_mm} />
            )}
            {procedure.opposing_dentition && (
              <InfoRow icon="git-compare" label="Opposing Dentition" value={procedure.opposing_dentition} />
            )}
            {procedure.tmj && (
              <InfoRow icon="pulse" label="TMJ Assessment" value={procedure.tmj} />
            )}
          </View>
        )}

        {/* Aesthetic Risk Assessment */}
        {(procedure.smile_line || procedure.gingival_biotype) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#E91E63' }]} data-testid="aesthetic-risk-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="happy" size={20} color="#E91E63" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#C2185B' }]}>Aesthetic Risk Assessment</Text>
            </View>
            {procedure.smile_line && (
              <InfoRow icon="eye" label="Smile Line" value={procedure.smile_line} />
            )}
            {procedure.gingival_biotype && (
              <InfoRow icon="leaf" label="Gingival Biotype" value={procedure.gingival_biotype} />
            )}
          </View>
        )}

        {/* Medical Assessment */}
        {procedure.medical_assessment && Object.keys(procedure.medical_assessment).length > 0 && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#D32F2F' }]} data-testid="medical-assessment-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="heart" size={20} color="#D32F2F" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#B71C1C' }]}>Medical Assessment</Text>
              {procedure.medical_risk_level && (
                <View style={{
                  backgroundColor: procedure.medical_risk_level === 'Low Risk' ? '#E8F5E9' : procedure.medical_risk_level === 'Moderate Risk' ? '#FFF3E0' : '#FFEBEE',
                  borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '700',
                    color: procedure.medical_risk_level === 'Low Risk' ? '#4CAF50' : procedure.medical_risk_level === 'Moderate Risk' ? '#FF9800' : '#F44336',
                  }}>{procedure.medical_risk_level}</Text>
                </View>
              )}
            </View>
            {Object.entries(procedure.medical_assessment).map(([key, value]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Ionicons
                  name={(value as string) === 'Yes' ? 'alert-circle' : 'checkmark-circle'}
                  size={20}
                  color={(value as string) === 'Yes' ? '#F44336' : '#4CAF50'}
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Text>
                  <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '500' }}>{value as string}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

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

        {/* Final Prosthetic Plan - always visible to everyone when set */}
        {procedure.final_prosthetic_plan && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#FF9800' }]} data-testid="final-prosthetic-plan-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="construct" size={20} color="#FF9800" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#E65100' }]}>Final Prosthetic Plan</Text>
            </View>
            <View style={{ backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>{procedure.final_prosthetic_plan}</Text>
            </View>
          </View>
        )}

        {/* Torque Values Achieved - visible to supervisors during approval and to students after approval */}
        {procedure.torque_values && procedure.torque_values.length > 0 && (
          <View style={styles.section} data-testid="torque-values-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="speedometer" size={20} color="#FF6D00" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#E65100' }]}>Torque Values Achieved</Text>
            </View>
            {procedure.torque_values.map((tv: number, idx: number) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < procedure.torque_values.length - 1 ? 1 : 0, borderBottomColor: '#F0F0F0' }}>
                <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#BF360C' }}>Implant {idx + 1}</Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#E65100' }}>{tv}</Text>
                <Text style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>Ncm</Text>
              </View>
            ))}
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

        {/* Phase 1 Pre-Surgical Checklist — shown right after Phase 1 data */}
        {procedure.checklist?.pre_surgical && (
          <>
            {renderChecklistSection('pre_surgical', 'Phase 1: Pre-Surgical Protocol')}
          </>
        )}

        {/* ═══════════ PHASE 2: SURGICAL PROTOCOLS - Full Data Display ═══════════ */}
        {procedure.phase2_data && Object.keys(procedure.phase2_data).length > 0 && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#0D47A1' }]} data-testid="phase2-full-data-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="medkit" size={22} color="#0D47A1" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#0D47A1', fontSize: 17 }]}>Phase 2 — Surgical Protocols</Text>
            </View>

            {/* Pre-Surgery Checklist */}
            {procedure.phase2_data.pre_surgery_checklist && Object.keys(procedure.phase2_data.pre_surgery_checklist).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 8 }}>Pre-Surgery Checklist</Text>
                {Object.entries(procedure.phase2_data.pre_surgery_checklist).map(([key, val]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                    <Ionicons name={val ? 'checkbox' : 'square-outline'} size={20} color={val ? '#4CAF50' : '#999'} />
                    <Text style={{ marginLeft: 10, fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Surgical Procedure Details */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 8 }}>Surgical Procedure</Text>
              {procedure.phase2_data.anesthesia_adequate && (
                <InfoRow icon="water" label="Anaesthesia Adequate" value={procedure.phase2_data.anesthesia_adequate} />
              )}
              {procedure.phase2_data.anesthesia_details && (
                <InfoRow icon="alert" label="Anaesthesia Notes" value={procedure.phase2_data.anesthesia_details} />
              )}
              {procedure.phase2_data.flap_design && (
                <InfoRow icon="cut" label="Incision / Flap Design" value={procedure.phase2_data.flap_design} />
              )}
              {procedure.phase2_data.drilling_type && (
                <InfoRow icon="hardware-chip" label="Drilling Type" value={procedure.phase2_data.drilling_type} />
              )}
              {procedure.phase2_data.implant_seated_correctly !== undefined && (
                <InfoRow icon="checkmark-done" label="Implant Seated Correctly" value={procedure.phase2_data.implant_seated_correctly ? 'Yes' : 'No'} />
              )}
              {procedure.phase2_data.implant_seated_comment && (
                <InfoRow icon="chatbox" label="Implant Seating Notes" value={procedure.phase2_data.implant_seated_comment} />
              )}
              {procedure.phase2_data.torque_values && procedure.phase2_data.torque_values.length > 0 && (
                <View style={{ marginVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Torque Values</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {procedure.phase2_data.torque_values.map((tv: number, idx: number) => (
                      <View key={idx} style={{ backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#E65100' }}>Implant {idx + 1}: {tv} Ncm</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {procedure.phase2_data.implant_other_notes && (
                <InfoRow icon="document-text" label="Other Implant Notes" value={procedure.phase2_data.implant_other_notes} />
              )}
              {procedure.phase2_data.prosthetic_component && (
                <InfoRow icon="cube" label="Prosthetic Component" value={procedure.phase2_data.prosthetic_component} />
              )}
              {procedure.phase2_data.healing_abutment_cuff_height && (
                <InfoRow icon="resize" label="Healing Abutment Cuff Height" value={`${procedure.phase2_data.healing_abutment_cuff_height} mm`} />
              )}
              {procedure.phase2_data.sutures_placed !== undefined && (
                <InfoRow icon="bandage" label="Sutures Placed" value={procedure.phase2_data.sutures_placed ? 'Yes' : 'No'} />
              )}
              {procedure.phase2_data.hemostasis_achieved !== undefined && (
                <InfoRow icon="water" label="Hemostasis Achieved" value={procedure.phase2_data.hemostasis_achieved ? 'Yes' : 'No'} />
              )}
            </View>

            {/* Post-Operative Checklist */}
            {procedure.phase2_data.post_op_checklist && Object.keys(procedure.phase2_data.post_op_checklist).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 8 }}>Post-Operative Checklist</Text>
                {Object.entries(procedure.phase2_data.post_op_checklist).map(([key, val]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                    <Ionicons name={val ? 'checkbox' : 'square-outline'} size={20} color={val ? '#4CAF50' : '#999'} />
                    <Text style={{ marginLeft: 10, fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Notes & Remarks */}
            {(procedure.phase2_student_notes || procedure.phase2_remark) && (
              <View style={{ marginBottom: 8, backgroundColor: '#F5F9FF', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 8 }}>Post-Surgical Notes</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase2_student_notes || procedure.phase2_remark}</Text>
              </View>
            )}
            {procedure.phase2_supervisor_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Remarks by Supervising Faculty</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase2_supervisor_notes}</Text>
              </View>
            )}
            {procedure.phase2_incharge_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>Remarks by Implant In-Charge</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase2_incharge_notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* Legacy Phase 2 remark (for older procedures without phase2_data) */}
        {!procedure.phase2_data && procedure.phase2_remark && (
          <View style={styles.section} data-testid="phase2-remark-section">
            <Text style={styles.sectionTitle}>Phase 2 - Post-Surgical Notes</Text>
            <Text style={styles.specText}>{procedure.phase2_remark}</Text>
          </View>
        )}

        {/* ═══════════ PHASE 3: SECOND STAGE SURGICAL - Full Data Display ═══════════ */}
        {(procedure.phase3_data || procedure.stage2_surgical_remark || procedure.phase3_student_notes) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#2E7D32' }]} data-testid="phase3-full-data-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="git-branch" size={22} color="#2E7D32" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#2E7D32', fontSize: 17 }]}>Phase 3 — Second Stage Surgical</Text>
            </View>

            {/* Phase 3 Checklist Items */}
            {procedure.phase3_data?.checklist_items && Object.keys(procedure.phase3_data.checklist_items).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#388E3C', marginBottom: 8 }}>Checklist</Text>
                {Object.entries(procedure.phase3_data.checklist_items).map(([key, val]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                    <Ionicons name={val ? 'checkbox' : 'square-outline'} size={20} color={val ? '#4CAF50' : '#999'} />
                    <Text style={{ marginLeft: 10, fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ISQ & Healing Abutment */}
            {(procedure.phase3_data?.isq_value || procedure.phase3_data?.healing_abutment_height) && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#388E3C', marginBottom: 8 }}>Measurements</Text>
                {procedure.phase3_data.isq_value && (
                  <InfoRow icon="speedometer" label="ISQ Value" value={procedure.phase3_data.isq_value} />
                )}
                {procedure.phase3_data.healing_abutment_height && (
                  <InfoRow icon="resize" label="Healing Abutment Height" value={`${procedure.phase3_data.healing_abutment_height} mm`} />
                )}
              </View>
            )}

            {/* Notes & Remarks */}
            {(procedure.phase3_student_notes || procedure.stage2_surgical_remark) && (
              <View style={{ marginBottom: 8, backgroundColor: '#F1F8E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#33691E', marginBottom: 8 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase3_student_notes || procedure.stage2_surgical_remark}</Text>
              </View>
            )}
            {procedure.phase3_supervisor_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Remarks by Supervising Faculty</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase3_supervisor_notes}</Text>
              </View>
            )}
            {procedure.phase3_incharge_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>Remarks by Implant In-Charge</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase3_incharge_notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════ PHASE 4 STEP 1: PROSTHETIC PROTOCOL - Full Data Display ═══════════ */}
        {(procedure.phase4_step1_data || procedure.stage2_prosthetic_remark || procedure.phase4_step1_student_notes) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#FF6F00' }]} data-testid="phase4-step1-full-data-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="construct" size={22} color="#FF6F00" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#E65100', fontSize: 17 }]}>Phase 4 — Prosthetic Protocol (Step 1)</Text>
            </View>

            {/* Prosthetic Plan Details */}
            {procedure.phase4_step1_data && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF6C00', marginBottom: 8 }}>Prosthetic Plan</Text>
                {procedure.phase4_step1_data.final_prosthetic_plan && (
                  <InfoRow icon="build" label="Final Prosthetic Plan" value={procedure.phase4_step1_data.final_prosthetic_plan} />
                )}
                {procedure.phase4_step1_data.prosthetic_material && (
                  <InfoRow icon="diamond" label="Prosthetic Material" value={procedure.phase4_step1_data.prosthetic_material} />
                )}
                {procedure.phase4_step1_data.custom_abutment && (
                  <InfoRow icon="settings" label="Custom Abutment" value={procedure.phase4_step1_data.custom_abutment} />
                )}
                {procedure.phase4_step1_data.overdenture_attachment && (
                  <InfoRow icon="link" label="Overdenture Attachment" value={procedure.phase4_step1_data.overdenture_attachment} />
                )}
                {procedure.phase4_step1_data.impression_type && (
                  <InfoRow icon="scan" label="Impression Type" value={procedure.phase4_step1_data.impression_type === 'intraoral_scans' ? 'Intraoral Scans' : 'Conventional Impressions'} />
                )}
                {procedure.phase4_step1_data.payment_complete !== undefined && (
                  <InfoRow icon="card" label="Payment Complete" value={procedure.phase4_step1_data.payment_complete ? 'Yes' : 'No'} />
                )}
                {procedure.phase4_step1_data.components_available !== undefined && (
                  <InfoRow icon="cube" label="Components Available" value={procedure.phase4_step1_data.components_available ? 'Yes' : 'No'} />
                )}
              </View>
            )}

            {/* Notes & Remarks */}
            {(procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark) && (
              <View style={{ marginBottom: 8, backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#E65100', marginBottom: 8 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark}</Text>
              </View>
            )}
            {procedure.stage2_prosthetic_faculty_remark && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Remarks by Supervising Faculty</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.stage2_prosthetic_faculty_remark}</Text>
              </View>
            )}
            {procedure.stage2_prosthetic_incharge_remark && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>Remarks by Implant In-Charge</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.stage2_prosthetic_incharge_remark}</Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════ PHASE 4 STEP 2: TRIAL & DELIVERY - Full Data Display ═══════════ */}
        {(procedure.phase4_step2_data || procedure.phase4_step2_student_notes) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#AD1457' }]} data-testid="phase4-step2-full-data-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="ribbon" size={22} color="#AD1457" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#AD1457', fontSize: 17 }]}>Phase 4 — Trial & Delivery (Step 2)</Text>
            </View>

            {/* Trial Checklist */}
            {procedure.phase4_step2_data?.trial_checklist && Object.keys(procedure.phase4_step2_data.trial_checklist).length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#C2185B', marginBottom: 8 }}>Trial Checklist</Text>
                {Object.entries(procedure.phase4_step2_data.trial_checklist).map(([key, val]) => (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                    <Ionicons name={val ? 'checkbox' : 'square-outline'} size={20} color={val ? '#4CAF50' : '#999'} />
                    <Text style={{ marginLeft: 10, fontSize: 13, color: '#333', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Confirmation Statement */}
            {procedure.phase4_step2_data?.confirmation_statement !== undefined && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 10, backgroundColor: procedure.phase4_step2_data.confirmation_statement ? '#E8F5E9' : '#FFEBEE', borderRadius: 8 }}>
                <Ionicons
                  name={procedure.phase4_step2_data.confirmation_statement ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={procedure.phase4_step2_data.confirmation_statement ? '#4CAF50' : '#F44336'}
                />
                <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: '600', color: '#333' }}>
                  Confirmation: {procedure.phase4_step2_data.confirmation_statement ? 'Treatment Confirmed Complete' : 'Not Confirmed'}
                </Text>
              </View>
            )}

            {/* Notes & Remarks */}
            {procedure.phase4_step2_student_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#FCE4EC', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#880E4F', marginBottom: 8 }}>Notes</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step2_student_notes}</Text>
              </View>
            )}
            {procedure.phase4_step2_supervisor_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Remarks by Supervising Faculty</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step2_supervisor_notes}</Text>
              </View>
            )}
            {procedure.phase4_step2_incharge_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>Remarks by Implant In-Charge</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step2_incharge_notes}</Text>
              </View>
            )}
          </View>
        )}

        {procedure.stage2_surgical_remark && !procedure.phase3_data && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Phase 3 Surgical Remarks</Text>
            <Text style={styles.specText}>{procedure.stage2_surgical_remark}</Text>
          </View>
        )}

        {procedure.stage2_prosthetic_remark && !procedure.phase4_step1_data && (
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
            {renderChecklistSection('surgical', 'Phase 2: Surgical Protocol')}
            {renderChecklistSection('second_stage', 'Phase 3: Second Stage Surgical Protocol')}
            {renderChecklistSection('prosthetic_phase', 'Phase 4: Prosthetic Protocol')}
          </>
        )}

        {/* Case Completion Badge & Report */}
        <CaseCompletionBadge
          procedureId={id as string}
          status={procedure.status}
        />

        {/* Implant Planning - Part of Phase 1 Workflow */}
        {procedure.status === 'pending_phase1' && (
          <View style={{ marginTop: 4 }}>
            <View style={{ backgroundColor: '#E3F2FD', padding: 12, marginBottom: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', textAlign: 'center' }}>
                Phase 1 Required: Complete Implant Planning Below
              </Text>
            </View>
            <CaseImplantPlanning
              procedureId={id as string}
              isOwner={user?.id === procedure.student_id || user?.id === procedure.created_by_id}
              userRole={user?.role || ''}
              torqueValues={procedure.torque_values}
              procedureStatus={procedure.status}
            />
          </View>
        )}

        {/* Implant Planning - Standalone Section (always visible) */}
        {procedure.status !== 'pending_phase1' && (
          <CaseImplantPlanning
            procedureId={id as string}
            isOwner={user?.id === procedure.student_id}
            userRole={user?.role || ''}
            torqueValues={procedure.torque_values}
            procedureStatus={procedure.status}
          />
        )}

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
            {!rejectionType ? (
              <>
                <Text style={styles.dialogTitle}>Select Rejection Type</Text>
                <TouchableOpacity
                  style={styles.rejectPermanentBtn}
                  onPress={() => setRejectionType('permanent')}
                  data-testid="reject-permanently-btn"
                >
                  <Ionicons name="ban" size={20} color="#FFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rejectTypeBtnText}>Reject Permanently</Text>
                    <Text style={styles.rejectTypeDesc}>Case will be stopped. No further phases can proceed.</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectReconsiderBtn}
                  onPress={() => setRejectionType('reconsider')}
                  data-testid="reject-reconsider-btn"
                >
                  <Ionicons name="refresh" size={20} color="#FFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rejectTypeBtnText}>Reject with Consideration</Text>
                    <Text style={styles.rejectTypeDesc}>Student can edit the rejected phase and resubmit.</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogCancelButton}
                  onPress={() => { setShowRejectDialog(false); setRejectionType(null); }}
                >
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Ionicons
                    name={rejectionType === 'permanent' ? 'ban' : 'refresh'}
                    size={20}
                    color={rejectionType === 'permanent' ? '#D32F2F' : '#F57C00'}
                  />
                  <Text style={styles.dialogTitle}>
                    {rejectionType === 'permanent' ? 'Reject Permanently' : 'Reject with Consideration'}
                  </Text>
                </View>
                <View style={{ backgroundColor: rejectionType === 'permanent' ? '#FFEBEE' : '#FFF3E0', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: rejectionType === 'permanent' ? '#C62828' : '#E65100' }}>
                    {rejectionType === 'permanent'
                      ? 'This action is final. The case cannot be moved forward after permanent rejection.'
                      : 'The student will be notified and can edit this phase based on your feedback, then resubmit for approval.'}
                  </Text>
                </View>
                <TextInput
                  style={styles.dialogInput}
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                  placeholder={rejectionType === 'permanent' ? 'Enter reason for permanent rejection' : 'Enter reason for reconsideration'}
                  multiline
                  numberOfLines={4}
                  data-testid="rejection-reason-input"
                />
                <View style={styles.dialogButtons}>
                  <TouchableOpacity
                    style={styles.dialogCancelButton}
                    onPress={() => { setRejectionType(null); setRejectionReason(''); }}
                  >
                    <Text style={styles.dialogCancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      rejectionType === 'permanent' ? styles.dialogConfirmButton : styles.dialogReconsiderConfirmBtn,
                      actionLoading && styles.buttonDisabled
                    ]}
                    onPress={handleReject}
                    disabled={actionLoading}
                    data-testid="confirm-rejection-btn"
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.dialogConfirmText}>
                        {rejectionType === 'permanent' ? 'Reject Permanently' : 'Reject & Request Revision'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    backgroundColor: '#D32F2F',
    alignItems: 'center',
  },
  dialogReconsiderConfirmBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F57C00',
    alignItems: 'center',
  },
  rejectPermanentBtn: {
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  rejectReconsiderBtn: {
    backgroundColor: '#F57C00',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  rejectTypeBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rejectTypeDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 2,
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
