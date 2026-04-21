import React, { useState, useEffect, createContext, useContext as useReactContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getAuthFileUrl, getToken } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { showUploadPicker } from '../../utils/uploadPicker';
import { downloadConsentTemplate, printConsentTemplate } from '../../utils/consentPdf';
import {
  STATUS_COLORS, STATUS_LABELS, CHECKLIST_DATA,
  PROCEDURE_TYPES, LOADING_TYPES,
  ARCH_CONDITION_OPTIONS, RIDGE_CONTOUR_OPTIONS, SOFT_TISSUE_OPTIONS, KERATINIZED_MUCOSA_OPTIONS,
  OCCLUSAL_SCHEME_OPTIONS, PARAFUNCTION_HABIT_OPTIONS, VERTICAL_DIMENSION_OPTIONS, TMJ_OPTIONS,
  SMILE_LINE_OPTIONS, GINGIVAL_BIOTYPE_OPTIONS,
  FLAP_DESIGN_OPTIONS, DRILLING_TYPE_OPTIONS, PROSTHETIC_COMPONENT_OPTIONS,
  FP_MATERIAL_OPTIONS, OVERDENTURE_ATTACHMENT_OPTIONS, CUSTOM_ABUTMENT_OPTIONS,
  MEDICAL_RISK_FACTORS, calculateMedicalRisk,
  getProstheticOptions,
} from '../../constants/checklist';
import { format } from 'date-fns';
import { generateProcedurePDF } from '../../utils/pdfGenerator';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import CaseCompletionBadge from '../../components/CaseCompletionBadge';
import ExportPrintMenu from '../../components/ExportPrintMenu';
import * as Linking from 'expo-linking';

// Edit mode context for passing edit state to InfoRow
const EditContext = createContext<{
  isEditMode: boolean;
  editingField: string | null;
  editValues: Record<string, any>;
  saving: boolean;
  procedure: any;
  startEdit: (key: string, val: any) => void;
  saveField: (key: string) => void;
  cancelEdit: () => void;
  setEditValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
} | null>(null);

// ─── Field Options Map ───────────────────────────────────
// Maps fieldKey → picker config. When editing a field present here,
// InfoRow renders a Dropdown/Chip picker constrained to these options
// (instead of a free-text TextInput).
type FieldOptionsConfig = {
  options: string[] | { value: string; label: string }[];
  multi?: boolean;   // multi-select array (e.g. loading_type)
  bool?: boolean;    // Yes/No → store true/false
};

const FIELD_OPTIONS: Record<string, FieldOptionsConfig> = {
  // Patient / Demographics
  sex: { options: ['Male', 'Female'] },
  periodontal_status: { options: ['Good', 'Fair', 'Poor'] },

  // Procedure Details
  implant_procedure_type: { options: PROCEDURE_TYPES },
  arch: { options: ['Maxillary', 'Mandibular'] },
  loading_type: { options: LOADING_TYPES, multi: true },

  // Clinical Examination
  arch_condition: { options: ARCH_CONDITION_OPTIONS },
  ridge_contour: { options: RIDGE_CONTOUR_OPTIONS },
  soft_tissue_thickness: { options: SOFT_TISSUE_OPTIONS },
  keratinized_mucosa: { options: KERATINIZED_MUCOSA_OPTIONS },

  // Occlusal Analysis
  occlusal_scheme: { options: OCCLUSAL_SCHEME_OPTIONS },
  parafunction_habit: { options: PARAFUNCTION_HABIT_OPTIONS },
  vertical_dimension: { options: VERTICAL_DIMENSION_OPTIONS },
  opposing_dentition: { options: ['Natural Dentition', 'Fixed Partial Denture', 'Fixed Implant Prosthesis', 'Removable Prosthesis', 'Edentulous'] },
  opposing_arch: { options: ['Natural Dentition', 'Fixed Partial Denture', 'Fixed Implant Prosthesis', 'Removable Prosthesis', 'Edentulous'] },
  tmj: { options: TMJ_OPTIONS },

  // Aesthetic Risk
  smile_line: { options: SMILE_LINE_OPTIONS },
  gingival_biotype: { options: GINGIVAL_BIOTYPE_OPTIONS },

  // Medical Assessment (nested) — handled per-field
  'medical_assessment.diabetes': { options: ['No', 'Controlled', 'Uncontrolled'] },
  'medical_assessment.smoking': { options: ['No', 'Light (<10/day)', 'Heavy (>10/day)'] },
  'medical_assessment.anticoagulant': { options: ['No', 'Yes'] },
  'medical_assessment.osteoporosis': { options: ['No', 'Yes'] },
  'medical_assessment.radiation': { options: ['No', 'Yes'] },

  // Phase 2 — Surgical
  'phase2_data.anesthesia_adequate': { options: ['Yes', 'No'] },
  'phase2_data.flap_design': { options: FLAP_DESIGN_OPTIONS },
  'phase2_data.drilling_type': { options: DRILLING_TYPE_OPTIONS },
  'phase2_data.implant_seated_correctly': { options: ['Yes', 'No'], bool: true },
  'phase2_data.bone_graft_used': { options: ['Yes', 'No'], bool: true },
  'phase2_data.prosthetic_component': { options: PROSTHETIC_COMPONENT_OPTIONS },
  'phase2_data.sutures_placed': { options: ['Yes', 'No'], bool: true },
  'phase2_data.hemostasis_achieved': { options: ['Yes', 'No'], bool: true },

  // Phase 4 Step 1 — Prosthetic
  'phase4_step1_data.prosthetic_material': { options: FP_MATERIAL_OPTIONS },
  'phase4_step1_data.overdenture_attachment': { options: OVERDENTURE_ATTACHMENT_OPTIONS },
  'phase4_step1_data.custom_abutment': { options: CUSTOM_ABUTMENT_OPTIONS },
  'phase4_step1_data.impression_type': {
    options: [
      { value: 'intraoral_scans', label: 'Intraoral Scans' },
      { value: 'conventional_impressions', label: 'Conventional Impressions' },
    ],
  },
  'phase4_step1_data.payment_complete': { options: ['Yes', 'No'], bool: true },
  'phase4_step1_data.components_available': { options: ['Yes', 'No'], bool: true },
};

// Resolve options at runtime for fields whose options depend on other fields
function resolveFieldOptions(fieldKey: string, procedure: any): FieldOptionsConfig | null {
  // Dynamic: Prosthetic Plan depends on procedure_type + loading_type
  if (fieldKey === 'prosthetic_plan' && procedure?.implant_procedure_type) {
    const opts = getProstheticOptions(procedure.implant_procedure_type, procedure.loading_type || []);
    return opts.length > 0 ? { options: opts } : null;
  }
  if (fieldKey === 'final_prosthetic_plan' || fieldKey === 'phase4_step1_data.final_prosthetic_plan') {
    if (procedure?.implant_procedure_type) {
      const opts = getProstheticOptions(procedure.implant_procedure_type, procedure.loading_type || []);
      return opts.length > 0 ? { options: opts } : null;
    }
    return null;
  }
  return FIELD_OPTIONS[fieldKey] || null;
}

export default function ProcedureDetailScreen() {
  const { id, edit } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  
  const [procedure, setProcedure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionType, setRejectionType] = useState<'permanent' | 'reconsider' | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [smartPlannerReport, setSmartPlannerReport] = useState<any>(null);
  const [smartPlannerLoading, setSmartPlannerLoading] = useState(false);
  const [showSmartPlanner, setShowSmartPlanner] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatSending, setAiChatSending] = useState(false);
  
  // Edit mode state
  const isEditMode = edit === 'true' && (user?.role === 'implant_incharge' || user?.role === 'supervisor');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [uploadingConsent, setUploadingConsent] = useState(false);

  const uploadConsentForProcedure = async () => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setUploadingConsent(true);
      const payload = new FormData();
      payload.append('file', {
        uri: picked.uri,
        name: picked.name || 'consent_form.pdf',
        type: picked.type || 'application/pdf',
      } as any);
      const res = await api.post(`/procedures/${id}/upload-consent`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProcedure(res.data);
      Alert.alert('Uploaded', 'Patient consent form uploaded. Phase 2 is now unlocked.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload consent form');
    } finally {
      setUploadingConsent(false);
    }
  };

  const canEditField = () => {
    if (!isEditMode) return false;
    if (procedure?.status === 'completed') return false;
    return true;
  };

  const startEdit = (fieldKey: string, currentValue: any) => {
    setEditingField(fieldKey);
    setEditValues(prev => ({ ...prev, [fieldKey]: currentValue }));
  };

  const saveField = async (fieldKey: string) => {
    setSaving(true);
    try {
      // Resolve raw input value, converting Yes/No → bool where configured
      const cfg = resolveFieldOptions(fieldKey, procedure);
      let rawValue = editValues[fieldKey];
      if (cfg?.bool) {
        if (rawValue === 'Yes') rawValue = true;
        else if (rawValue === 'No') rawValue = false;
      }
      const fields: any = {};
      // Support nested field paths like "phase2_data.torque_values"
      if (fieldKey.includes('.')) {
        const [parent, child] = fieldKey.split('.');
        const current = procedure[parent] || {};
        fields[parent] = { ...current, [child]: rawValue };
      } else {
        fields[fieldKey] = rawValue;
      }
      const res = await api.patch(`/procedures/${id}/edit-fields`, { fields });
      setProcedure(res.data);
      setEditingField(null);
      Alert.alert('Saved', 'Field updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const cancelEdit = () => { setEditingField(null); };

  // EditableInfoRow uses context-aware InfoRow (no longer needed as separate wrapper)
  // All InfoRow components automatically show pencil icons in edit mode via EditContext

  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);

  useEffect(() => {
    loadProcedure();
  }, [id]);

  const loadProcedure = async () => {
    try {
      const response = await api.get(`/procedures/${id}`);
      setProcedure(response.data);
      // Auto-load existing Smart Planner report if available
      if (response.data?.smart_planner_report) {
        setSmartPlannerReport(response.data.smart_planner_report);
        setShowSmartPlanner(true);
      }
      // AI case summary is loaded on-demand only (via AI SUMMARY button)
      if (response.data?.ai_chat_history) {
        setAiChatHistory(response.data.ai_chat_history);
      }
    } catch (error) {
      console.error('Failed to load procedure:', error);
      Alert.alert('Error', 'Failed to load procedure details');
    } finally {
      setLoading(false);
    }
  };

  const generateSmartPlanner = async () => {
    try {
      setSmartPlannerLoading(true);
      const res = await api.post(`/procedures/${id}/smart-planner`);
      setSmartPlannerReport(res.data);
      setShowSmartPlanner(true);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to generate Smart Planner report');
    } finally {
      setSmartPlannerLoading(false);
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
              await api.post(getApproveEndpoint(), { action: 'approve', comment: approvalComment.trim() || null });
              Alert.alert('Success', 'Procedure approved successfully');
              setApprovalComment('');
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
    // Nurses only see Phase 1 info; the case report PDF contains all phases, so hide it.
    if (user?.role === 'nurse') return false;
    // Allow PDF export from pending_phase1 onwards (all non-draft statuses)
    return procedure.status !== 'draft';
  };

  const canViewAiSummary = () => {
    if (!procedure || procedure.status === 'draft') return false;
    // Students: always see AI Summary for their own cases
    if (user?.role === 'student') return true;
    // Supervisors: see AI Summary for their own cases AND student cases under them
    if (user?.role === 'supervisor') return true;
    // Implant In-Charge: see AI Summary for ALL cases
    if (user?.role === 'implant_incharge') return true;
    return false;
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
    <EditContext.Provider value={canEditField() ? { isEditMode, editingField, editValues, saving, procedure, startEdit, saveField, cancelEdit, setEditValues } : null}>
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Edit Mode Banner */}
        {isEditMode && (
          <View style={{ backgroundColor: '#E3F2FD', borderBottomWidth: 2, borderBottomColor: '#1565C0', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }} data-testid="edit-mode-banner">
            <Ionicons name="create" size={20} color="#1565C0" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', flex: 1 }}>Edit Mode — Tap pencil icon to edit</Text>
            <TouchableOpacity
              style={{ backgroundColor: '#F9A825', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}
              onPress={() => router.push('/(tabs)/dashboard')}
              data-testid="edit-done-btn"
            >
              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {/* Consent form action row — between Treatment Progress and below blocks.
            Available to users who can upload consent (nurse, student owner, supervisor, in-charge, admin).
            Blue "Upload / Replace" button + grey Export/Print popover button. */}
        {(() => {
          const canUpload = user?.role === 'nurse'
            || user?.role === 'implant_incharge'
            || user?.role === 'administrator'
            || user?.role === 'supervisor'
            || user?.id === procedure.student_id;
          if (!canUpload) return null;
          const consentUploaded = !!procedure.patient_consent_form;
          return (
            <View style={styles.consentActionRow} testID="consent-action-row">
              <TouchableOpacity
                style={[styles.consentActionBtn, styles.consentActionBtnPrimary, uploadingConsent && styles.buttonDisabled]}
                onPress={uploadConsentForProcedure}
                disabled={uploadingConsent}
                activeOpacity={0.85}
                testID="consent-upload-btn"
              >
                {uploadingConsent ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name={consentUploaded ? 'refresh' : 'cloud-upload-outline'} size={16} color="#FFF" />
                    <Text style={styles.consentActionBtnText}>
                      {consentUploaded ? 'Replace consent form' : 'Upload consent form'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <ExportPrintMenu
                label="Export / Print consent form"
                buttonStyle={[styles.consentActionBtn, styles.consentActionBtnSecondary]}
                textStyle={styles.consentActionBtnTextSecondary}
                triggerIcon="share-outline"
                triggerIconSize={14}
                testID="consent-export-print-action"
                popoverTitle="Patient Consent Form"
                printLabel="Print consent form"
                exportLabel="Download PDF"
                onPrint={() => printConsentTemplate(id as string)}
                onExport={() => downloadConsentTemplate(id as string)}
              />
            </View>
          );
        })()}
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

        {/* Submit Phase 2 Button — gated by Patient Consent Form */}
        {canSubmitPhase2() && (
          <View style={styles.phase2ButtonContainer}>
            {procedure.patient_consent_form ? (
              <>
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
                <TouchableOpacity
                  onPress={() => downloadConsentTemplate(id as string)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 6 }}
                  data-testid="reprint-consent-btn"
                >
                  <Ionicons name="download-outline" size={14} color="#1565C0" />
                  <Text style={{ fontSize: 12, color: '#1565C0', fontWeight: '600' }}>Reprint blank consent template</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.phase2Button, { backgroundColor: uploadingConsent ? '#90CAF9' : '#1565C0' }]}
                  onPress={uploadConsentForProcedure}
                  disabled={uploadingConsent}
                  data-testid="upload-consent-phase2-btn"
                >
                  {uploadingConsent ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="cloud-upload" size={24} color="#FFF" />
                  )}
                  <View style={styles.phase2ButtonTextContainer}>
                    <Text style={styles.phase2ButtonTitle}>UPLOAD PATIENT CONSENT FORM</Text>
                    <Text style={styles.phase2ButtonSubtitle}>Phase 2 will unlock once the signed consent is uploaded</Text>
                  </View>
                  {!uploadingConsent && <Ionicons name="chevron-forward" size={24} color="#FFF" />}
                </TouchableOpacity>
                <View style={{ marginTop: 8 }}>
                  <ExportPrintMenu
                    label="Export / Print consent form"
                    buttonStyle={{ backgroundColor: '#37474F', paddingVertical: 12, borderRadius: 8 }}
                    textStyle={{ fontSize: 13, color: '#FFF', fontWeight: '700', letterSpacing: 0.3 }}
                    triggerIcon="share-outline"
                    triggerIconSize={16}
                    testID="consent-export-print-btn"
                    popoverTitle="Patient Consent Form"
                    printLabel="Print consent form"
                    exportLabel="Download PDF"
                    onPrint={() => printConsentTemplate(id as string)}
                    onExport={() => downloadConsentTemplate(id as string)}
                  />
                </View>
                <Text style={{ fontSize: 11, color: '#78909C', textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
                  Template is pre-filled with patient & procedure details. Print, get the patient to sign, then tap Upload above.
                </Text>
              </>
            )}
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

        {/* Instruments Autoclaved Badge — visible to non-nurse roles once a nurse has marked. */}
        {user?.role !== 'nurse' && procedure.instruments_autoclaved?.marked && (
          <View style={styles.autoclaveBadge} testID="instruments-autoclaved-badge">
            <View style={styles.autoclaveBadgeIcon}>
              <Ionicons name="shield-checkmark" size={16} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoclaveBadgeTitle}>Nurse has prepped instruments ✓</Text>
              <Text style={styles.autoclaveBadgeSub} numberOfLines={1}>
                Autoclaved
                {procedure.instruments_autoclaved?.marked_by_name ? ` by ${procedure.instruments_autoclaved.marked_by_name}` : ''}
                {procedure.instruments_autoclaved?.marked_at ? ` · ${format(new Date(procedure.instruments_autoclaved.marked_at), 'MMM dd · hh:mm a')}` : ''}
              </Text>
            </View>
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
          {procedure.student_name ? (
            <InfoRow icon="school" label="Student" value={procedure.student_name} />
          ) : procedure.created_by_name && procedure.created_by_role !== 'student' ? (
            <InfoRow icon="person" label={procedure.created_by_role === 'supervisor' ? 'Operator (Supervisor)' : procedure.created_by_role === 'implant_incharge' ? 'Operator (Implant Incharge)' : 'Operator'} value={procedure.created_by_name} />
          ) : null}
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
            <InfoRow icon="construct" label="Procedure Type" value={procedure.implant_procedure_type} fieldKey="implant_procedure_type" />
            {procedure.arch && (
              <InfoRow icon="tablet-landscape" label="Arch" value={procedure.arch} fieldKey="arch" />
            )}
            {procedure.loading_type?.length > 0 && (
              <InfoRow icon="flash" label="Loading Type" value={procedure.loading_type.join(', ')} fieldKey="loading_type" />
            )}
            {procedure.prosthetic_plan && (
              <InfoRow icon="build" label="Prosthetic Plan" value={procedure.prosthetic_plan} fieldKey="prosthetic_plan" />
            )}
            {procedure.prosthetic_plan_other && (
              <InfoRow icon="create" label="Prosthetic Plan (Other)" value={procedure.prosthetic_plan_other} fieldKey="prosthetic_plan_other" />
            )}
          </View>
        )}

        {/* Clinical Examination */}
        {(procedure.occlusocervical_height || procedure.mesiodistal_space || procedure.edentulous_sites?.length > 0 || procedure.edentulous_site || procedure.arch_condition || procedure.ridge_contour || procedure.soft_tissue_thickness || procedure.keratinized_mucosa) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#1E88E5' }]} data-testid="clinical-examination-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="search" size={20} color="#1E88E5" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#1565C0' }]}>Clinical Examination</Text>
            </View>
            {(procedure.occlusocervical_height || procedure.mesiodistal_space) && (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 4 }}>Edentulous Site</Text>
                {procedure.occlusocervical_height && (
                  <InfoRow icon="resize" label="Occlusocervical Height" value={`${procedure.occlusocervical_height} mm`} />
                )}
                {procedure.mesiodistal_space && (
                  <InfoRow icon="resize" label="Mesiodistal Space" value={`${procedure.mesiodistal_space} mm`} />
                )}
              </View>
            )}
            {procedure.edentulous_sites?.length > 0 && (
              <InfoRow icon="grid" label="Edentulous Sites" value={procedure.edentulous_sites.join(', ')} fieldKey="edentulous_sites" />
            )}
            {procedure.edentulous_site && !procedure.edentulous_sites?.length && (
              <InfoRow icon="grid" label="Edentulous Site" value={procedure.edentulous_site} fieldKey="edentulous_site" />
            )}
            {procedure.arch_condition && (
              <InfoRow icon="ellipse" label={procedure.arch === 'Maxillary' ? 'Maxillary Arch Condition' : procedure.arch === 'Mandibular' ? 'Mandibular Arch Condition' : 'Arch Condition'} value={procedure.arch_condition} fieldKey="arch_condition" />
            )}
            {procedure.ridge_contour && (
              <InfoRow icon="analytics" label="Ridge Contour" value={procedure.ridge_contour} fieldKey="ridge_contour" />
            )}
            {procedure.soft_tissue_thickness && (
              <InfoRow icon="layers" label="Soft Tissue Thickness" value={procedure.soft_tissue_thickness} fieldKey="soft_tissue_thickness" />
            )}
            {procedure.keratinized_mucosa && (
              <InfoRow icon="resize" label="Keratinized Mucosa" value={procedure.keratinized_mucosa} fieldKey="keratinized_mucosa" />
            )}
          </View>
        )}

        {/* Occlusal Analysis */}
        {(procedure.occlusal_scheme || procedure.parafunction_habit || procedure.vertical_dimension || procedure.opposing_dentition || procedure.vertical_dimension_mm || procedure.available_interarch_space || procedure.opposing_arch || procedure.tmj) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#7B1FA2' }]} data-testid="occlusal-analysis-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="fitness" size={20} color="#7B1FA2" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#6A1B9A' }]}>Occlusal Analysis</Text>
            </View>
            {procedure.available_interarch_space && (
              <InfoRow icon="resize" label={procedure.arch === 'Maxillary' ? 'Maxillary Restorative Space' : procedure.arch === 'Mandibular' ? 'Mandibular Restorative Space' : 'Restorative Space'} value={`${procedure.available_interarch_space} mm`} />
            )}
            {procedure.opposing_arch && (
              <InfoRow icon="people" label="Opposing Arch" value={procedure.opposing_arch} fieldKey="opposing_arch" />
            )}
            {procedure.occlusal_scheme && (
              <InfoRow icon="swap-horizontal" label="Occlusal Scheme" value={procedure.occlusal_scheme} fieldKey="occlusal_scheme" />
            )}
            {procedure.parafunction_habit && (
              <InfoRow icon="alert-circle" label="Parafunctional Habits" value={procedure.parafunction_habit} fieldKey="parafunction_habit" />
            )}
            {procedure.vertical_dimension && (
              <InfoRow icon="arrow-up" label="Vertical Dimension" value={procedure.vertical_dimension} fieldKey="vertical_dimension" />
            )}
            {procedure.vertical_dimension_mm && (
              <InfoRow icon="arrow-up" label="Vertical Dimension (mm)" value={procedure.vertical_dimension_mm} fieldKey="vertical_dimension_mm" />
            )}
            {procedure.opposing_dentition && (
              <InfoRow icon="git-compare" label="Opposing Dentition" value={procedure.opposing_dentition} fieldKey="opposing_dentition" />
            )}
            {procedure.tmj && (
              <InfoRow icon="pulse" label="TMJ Assessment" value={procedure.tmj} fieldKey="tmj" />
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
              <InfoRow icon="eye" label="Smile Line" value={procedure.smile_line} fieldKey="smile_line" />
            )}
            {procedure.gingival_biotype && (
              <InfoRow icon="leaf" label="Gingival Biotype" value={procedure.gingival_biotype} fieldKey="gingival_biotype" />
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
            {Object.entries(procedure.medical_assessment).map(([key, value]) => {
              const isNoRisk = (value as string) === 'No';
              const isHighRisk = ['Uncontrolled', 'Heavy (>10/day)'].some(h => (value as string).includes?.(h)) || 
                (['osteoporosis', 'radiation'].includes(key) && (value as string) === 'Yes');
              const iconName = isNoRisk ? 'checkmark-circle' : isHighRisk ? 'warning' : 'alert-circle';
              const iconColor = isNoRisk ? '#4CAF50' : isHighRisk ? '#F44336' : '#FF9800';
              const factor = MEDICAL_RISK_FACTORS.find(f => f.id === key);
              const factorLabel = factor?.label || key.replace(/_/g, ' ');
              const medFieldKey = `medical_assessment.${key}`;
              const rowEditing = editingField === medFieldKey;
              const rowEditValue = editValues[medFieldKey] ?? value;

              const handleStartRowEdit = () => {
                if (!factor) return;
                startEdit(medFieldKey, value);
              };
              const handleSaveRow = async () => {
                const updatedMedical = { ...procedure.medical_assessment, [key]: rowEditValue };
                const riskInfo = calculateMedicalRisk(updatedMedical);
                setSaving(true);
                try {
                  const res = await api.patch(`/procedures/${id}/edit-fields`, {
                    fields: { medical_assessment: updatedMedical, medical_risk_level: riskInfo.level },
                  });
                  setProcedure(res.data);
                  setEditingField(null);
                  Alert.alert('Saved', 'Medical assessment updated');
                } catch (e: any) {
                  Alert.alert('Error', e.response?.data?.detail || 'Failed to save');
                } finally { setSaving(false); }
              };

              return (
                <View key={key} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name={iconName} size={20} color={iconColor} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>{factorLabel}</Text>
                      <Text style={{ fontSize: 14, color: '#1A1A1A', fontWeight: '500' }}>{value as string}</Text>
                    </View>
                    {!isNoRisk && !rowEditing && (
                      <View style={{ backgroundColor: isHighRisk ? '#FFEBEE' : '#FFF3E0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: isHighRisk ? '#F44336' : '#FF9800' }}>
                          {isHighRisk ? 'HIGH' : 'MODERATE'}
                        </Text>
                      </View>
                    )}
                    {canEditField() && !rowEditing && factor && (
                      <TouchableOpacity onPress={handleStartRowEdit} style={{ padding: 4 }} data-testid={`edit-medical-${key}`}>
                        <Ionicons name="pencil" size={14} color="#1565C0" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {rowEditing && factor && (
                    <View style={{ marginTop: 8, marginLeft: 32 }}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {factor.options.map(opt => {
                          const selected = rowEditValue === opt;
                          return (
                            <TouchableOpacity
                              key={opt}
                              onPress={() => setEditValues(prev => ({ ...prev, [medFieldKey]: opt }))}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1,
                                borderColor: selected ? '#1565C0' : '#CFD8DC',
                                backgroundColor: selected ? '#1565C0' : '#FFF',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#FFF' : '#37474F' }}>{opt}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <TouchableOpacity onPress={handleSaveRow} disabled={saving} style={{ backgroundColor: '#4CAF50', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark" size={14} color="#FFF" />}
                          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={cancelEdit} style={{ backgroundColor: '#F44336', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="close" size={14} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
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
                  const fileUrl = `${baseUrl}/uploads/${procedure.ios_file}?token=${authToken}`;
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

        {/* CBCT Reports - Thumbnails */}
        {(procedure.cbct_files?.length > 0 || procedure.cbct_file) && (
          <View style={styles.section} data-testid="cbct-file-section">
            <Text style={styles.sectionTitle}>CBCT Reports</Text>
            {procedure.cbct_files?.length > 0 ? (
              procedure.cbct_files.map((f: any, idx: number) => {
                const baseUrl = api.defaults.baseURL || '';
                const fileUrl = `${baseUrl}/uploads/${f.filename}?token=${authToken}`;
                const isImage = f.filename?.match(/\.(png|jpg|jpeg)$/i);
                return (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10, backgroundColor: '#E3F2FD', padding: 8, borderRadius: 10 }} data-testid={`cbct-thumb-${idx}`}>
                    {isImage ? (
                      <Image source={{ uri: fileUrl }} style={{ width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#90CAF9' }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 50, height: 50, borderRadius: 8, backgroundColor: '#BBDEFB', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="document-attach" size={24} color="#1565C0" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>CBCT Report {idx + 1}</Text>
                      <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{f.original_name}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      onPress={() => Linking.openURL(fileUrl).catch(() => Alert.alert('Error', 'Could not open file'))}
                      data-testid={`view-cbct-detail-${idx}`}
                    >
                      <Ionicons name="open-outline" size={14} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>View</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4CAF50', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 20 }}
                onPress={async () => {
                  try {
                    const baseUrl = api.defaults.baseURL || '';
                    const fileUrl = `${baseUrl}/uploads/${procedure.cbct_file}?token=${authToken}`;
                    await Linking.openURL(fileUrl);
                  } catch (e) {
                    Alert.alert('Error', 'Could not open file');
                  }
                }}
                data-testid="cbct-file-download"
              >
                <Ionicons name="document-attach" size={20} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1 }}>View CBCT Report</Text>
                <Ionicons name="open-outline" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
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
        {user?.role !== 'nurse' && procedure.phase2_data && Object.keys(procedure.phase2_data).length > 0 && (
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
                <InfoRow icon="water" label="Anaesthesia Adequate" value={procedure.phase2_data.anesthesia_adequate} fieldKey="phase2_data.anesthesia_adequate" />
              )}
              {procedure.phase2_data.anesthesia_details && (
                <InfoRow icon="alert" label="Anaesthesia Notes" value={procedure.phase2_data.anesthesia_details} fieldKey="phase2_data.anesthesia_details" />
              )}
              {procedure.phase2_data.flap_design && (
                <InfoRow icon="cut" label="Incision / Flap Design" value={procedure.phase2_data.flap_design} fieldKey="phase2_data.flap_design" />
              )}
              {procedure.phase2_data.drilling_type && (
                <InfoRow icon="hardware-chip" label="Drilling Type" value={procedure.phase2_data.drilling_type} fieldKey="phase2_data.drilling_type" />
              )}
              {procedure.phase2_data.implant_seated_correctly !== undefined && (
                <InfoRow icon="checkmark-done" label="Implant Seated Correctly" value={procedure.phase2_data.implant_seated_correctly ? 'Yes' : 'No'} fieldKey="phase2_data.implant_seated_correctly" />
              )}
              {procedure.phase2_data.implant_seated_comment && (
                <InfoRow icon="chatbox" label="Implant Seating Notes" value={procedure.phase2_data.implant_seated_comment} fieldKey="phase2_data.implant_seated_comment" />
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
              {procedure.phase2_data.bone_graft_used !== undefined && (
                <InfoRow icon="fitness" label="Bone Graft & Membrane" value={procedure.phase2_data.bone_graft_used ? 'Yes' : 'No'} />
              )}
              {procedure.phase2_data.bone_graft_used && procedure.phase2_data.bone_graft_details && (
                <InfoRow icon="document-text" label="Bone Graft Details" value={procedure.phase2_data.bone_graft_details} />
              )}
              {procedure.phase2_data.implant_other_notes && (
                <InfoRow icon="document-text" label="Other Implant Notes" value={procedure.phase2_data.implant_other_notes} />
              )}
              {procedure.phase2_data.prosthetic_component && (
                <InfoRow icon="cube" label="Prosthetic Component" value={procedure.phase2_data.prosthetic_component} />
              )}
              {procedure.phase2_data.healing_abutment_cuff_height && (
                Array.isArray(procedure.phase2_data.healing_abutment_cuff_height)
                  ? procedure.phase2_data.healing_abutment_cuff_height.map((val: string, idx: number) => (
                    <InfoRow key={idx} icon="resize" label={`Healing Abutment Cuff Height (Implant ${idx + 1})`} value={`${val} mm`} />
                  ))
                  : <InfoRow icon="resize" label="Healing Abutment Cuff Height" value={`${procedure.phase2_data.healing_abutment_cuff_height} mm`} />
              )}
              {procedure.phase2_data.sutures_placed !== undefined && (
                <InfoRow icon="bandage" label="Sutures Placed" value={procedure.phase2_data.sutures_placed ? 'Yes' : 'No'} fieldKey="phase2_data.sutures_placed" />
              )}
              {procedure.phase2_data.hemostasis_achieved !== undefined && (
                <InfoRow icon="water" label="Hemostasis Achieved" value={procedure.phase2_data.hemostasis_achieved ? 'Yes' : 'No'} fieldKey="phase2_data.hemostasis_achieved" />
              )}

              {/* Post Surgical Radiographs - IOPA Thumbnails */}
              {procedure.phase2_data.iopa_files && procedure.phase2_data.iopa_files.length > 0 && (
                <View style={{ marginTop: 12, marginBottom: 8 }} data-testid="iopa-files-section">
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 10 }}>
                    {procedure.phase2_data.iopa_files.length === 1 ? 'Post Surgical Radiograph' : 'Post Surgical Radiographs'} - IOPA
                  </Text>
                  {procedure.phase2_data.iopa_files.map((f: any, idx: number) => {
                    const baseUrl = api.defaults.baseURL || '';
                    const fileUrl = `${baseUrl}/uploads/${f.filename}?token=${authToken}`;
                    const isImage = f.filename?.match(/\.(png|jpg|jpeg)$/i);
                    return (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10, backgroundColor: '#E3F2FD', padding: 8, borderRadius: 10 }} data-testid={`iopa-thumb-${idx}`}>
                        {isImage ? (
                          <Image source={{ uri: fileUrl }} style={{ width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: '#90CAF9' }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#BBDEFB', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="document-attach" size={28} color="#1565C0" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>{f.tooth_label || `Implant ${idx + 1}`}</Text>
                          <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{f.original_name}</Text>
                        </View>
                        <TouchableOpacity
                          style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={() => Linking.openURL(fileUrl).catch(() => Alert.alert('Error', 'Could not open file'))}
                          data-testid={`view-iopa-detail-${idx}`}
                        >
                          <Ionicons name="open-outline" size={14} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>View</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* OPG Thumbnail */}
              {procedure.phase2_data.opg_file && procedure.phase2_data.opg_file.filename && (
                <View style={{ marginTop: 8, marginBottom: 8 }} data-testid="opg-file-section">
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 10 }}>OPG Radiograph</Text>
                  {(() => {
                    const baseUrl = api.defaults.baseURL || '';
                    const fileUrl = `${baseUrl}/uploads/${procedure.phase2_data.opg_file.filename}?token=${authToken}`;
                    const isImage = procedure.phase2_data.opg_file.filename?.match(/\.(png|jpg|jpeg)$/i);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E3F2FD', padding: 10, borderRadius: 10 }} data-testid="opg-thumb">
                        {isImage ? (
                          <Image source={{ uri: fileUrl }} style={{ width: 70, height: 70, borderRadius: 8, borderWidth: 1, borderColor: '#90CAF9' }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: 70, height: 70, borderRadius: 8, backgroundColor: '#BBDEFB', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="document-attach" size={32} color="#1565C0" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>OPG</Text>
                          <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{procedure.phase2_data.opg_file.original_name}</Text>
                        </View>
                        <TouchableOpacity
                          style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={() => Linking.openURL(fileUrl).catch(() => Alert.alert('Error', 'Could not open file'))}
                          data-testid="view-opg-detail"
                        >
                          <Ionicons name="open-outline" size={14} color="#FFF" />
                          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>View</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
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
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 8 }}>
                  {procedure.created_by_role === 'student' ? "Student's Notes" : "Operator's Notes"}
                </Text>
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

        {/* AI Surgical Summary — persists after Phase 2 approval */}
        {procedure.ai_surgical_notes && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#3F51B5' }]} data-testid="ai-surgical-summary-section">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="sparkles" size={20} color="#3F51B5" />
              <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#3F51B5', fontSize: 17 }]}>AI Surgical Summary</Text>
            </View>
            <View style={{ backgroundColor: '#E8EAF6', borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 13, color: '#37474F', lineHeight: 20 }}>{procedure.ai_surgical_notes}</Text>
            </View>
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
        {user?.role !== 'nurse' && (procedure.phase3_data || procedure.stage2_surgical_remark || procedure.phase3_student_notes) && (
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
                  Array.isArray(procedure.phase3_data.isq_value)
                    ? (
                      <View style={{ backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#A5D6A7' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#2E7D32', marginBottom: 6 }}>ISQ Values</Text>
                        {procedure.phase3_data.isq_value.map((val: string, idx: number) => {
                          const toothLabel = procedure.implant_plans?.[idx]?.position
                            ? `Tooth #${procedure.implant_plans[idx].position}`
                            : `Implant ${idx + 1}`;
                          return (
                            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1B5E20', flex: 1 }}>{toothLabel}</Text>
                              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2E7D32' }}>{val || '—'}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )
                    : <InfoRow icon="speedometer" label="ISQ Value" value={procedure.phase3_data.isq_value} />
                )}
                {procedure.phase3_data.healing_abutment_height && (
                  Array.isArray(procedure.phase3_data.healing_abutment_height)
                    ? procedure.phase3_data.healing_abutment_height.map((val: string, idx: number) => (
                      <InfoRow key={idx} icon="resize" label={`Healing Abutment Height (Implant ${idx + 1})`} value={`${val} mm`} />
                    ))
                    : <InfoRow icon="resize" label="Healing Abutment Height" value={`${procedure.phase3_data.healing_abutment_height} mm`} />
                )}
              </View>
            )}

            {/* Phase 3 IOPA Radiograph Thumbnails */}
            {procedure.phase3_data?.iopa_files && procedure.phase3_data.iopa_files.length > 0 && (
              <View style={{ marginBottom: 16 }} data-testid="phase3-iopa-section">
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 10 }}>IOPA Radiographs</Text>
                {procedure.phase3_data.iopa_files.map((f: any, idx: number) => {
                  const baseUrl = api.defaults.baseURL || '';
                  const fileUrl = `${baseUrl}/uploads/${f.filename}?token=${authToken}`;
                  const isImage = f.filename?.match(/\.(png|jpg|jpeg)$/i);
                  return (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10, backgroundColor: '#E3F2FD', padding: 8, borderRadius: 10 }} data-testid={`p3-iopa-thumb-${idx}`}>
                      {isImage ? (
                        <Image source={{ uri: fileUrl }} style={{ width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: '#90CAF9' }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: '#BBDEFB', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="document-attach" size={28} color="#1565C0" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>{f.tooth_label || `Implant ${idx + 1}`}</Text>
                        <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{f.original_name}</Text>
                      </View>
                      <TouchableOpacity
                        style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        onPress={() => Linking.openURL(fileUrl).catch(() => Alert.alert('Error', 'Could not open file'))}
                        data-testid={`p3-view-iopa-detail-${idx}`}
                      >
                        <Ionicons name="open-outline" size={14} color="#FFF" />
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>View</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Notes & Remarks */}
            {(procedure.phase3_student_notes || procedure.stage2_surgical_remark) && (
              <View style={{ marginBottom: 8, backgroundColor: '#F1F8E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#33691E', marginBottom: 8 }}>
                  {procedure.created_by_role === 'student' ? "Student's Notes" : "Operator's Notes"}
                </Text>
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

        {/* ═══════════ SMART PROSTHETIC PLANNER ═══════════ */}
        {['stage2_surgical_approved', 'pending_stage2_prosthetic', 'completed'].includes(procedure.status) && (
          <View style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#0D47A1' }]} data-testid="smart-planner-section">
            <TouchableOpacity
              onPress={() => {
                if (smartPlannerReport) {
                  setShowSmartPlanner(!showSmartPlanner);
                } else {
                  generateSmartPlanner();
                }
              }}
              disabled={smartPlannerLoading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              data-testid="smart-planner-toggle"
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bulb" size={22} color="#0D47A1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0D47A1', letterSpacing: 0.3 }}>Smart Prosthetic Planner</Text>
                <Text style={{ fontSize: 12, color: '#5C6BC0', marginTop: 2 }}>Pre-Prosthetic Insights</Text>
              </View>
              {smartPlannerLoading ? (
                <ActivityIndicator size="small" color="#1565C0" />
              ) : (
                <Ionicons name={showSmartPlanner ? 'chevron-up' : 'chevron-down'} size={22} color="#1565C0" />
              )}
            </TouchableOpacity>

            {showSmartPlanner && smartPlannerReport && (
              <View style={{ marginTop: 16 }}>
                {/* Case Type Badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View style={{ backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1565C0' }}>
                      {smartPlannerReport.case_type === 'full_arch' ? 'Full Arch' : 'Dentulous'} Case
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#90A4AE' }}>
                    {new Date(smartPlannerReport.generated_at).toLocaleDateString()}
                  </Text>
                </View>

                {/* Modules */}
                {smartPlannerReport.modules?.map((mod: any, idx: number) => (
                  <View key={mod.id || idx} style={{ marginBottom: 14, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E7EE' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Ionicons name={mod.icon || 'information-circle'} size={18} color="#1565C0" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0D47A1' }}>{mod.title}</Text>
                    </View>

                    {/* Space Analysis flags */}
                    {mod.id === 'space_analysis' && mod.data?.flags?.map((f: any, fi: number) => (
                      <View key={fi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8, paddingLeft: 4 }}>
                        <Ionicons name={f.status === 'CRITICAL' ? 'alert-circle' : (f.status === 'WARNING' ? 'warning' : 'checkmark-circle')}
                          size={16} color={f.status === 'CRITICAL' ? '#D32F2F' : (f.status === 'WARNING' ? '#F57C00' : '#388E3C')} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>{f.param}: {f.value}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2, lineHeight: 18 }}>{f.note}</Text>
                        </View>
                      </View>
                    ))}

                    {/* Interarch Space */}
                    {mod.id === 'interarch_space' && (
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Text style={{ fontSize: 24, fontWeight: '700', color: mod.severity === 'SEVERE' ? '#D32F2F' : (mod.severity === 'MODERATE' ? '#F57C00' : '#388E3C') }}>
                            {mod.data.space_mm} mm
                          </Text>
                          <View style={{ backgroundColor: mod.severity === 'SEVERE' ? '#FFEBEE' : (mod.severity === 'MODERATE' ? '#FFF3E0' : '#E8F5E9'), paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: mod.severity === 'SEVERE' ? '#D32F2F' : (mod.severity === 'MODERATE' ? '#F57C00' : '#388E3C') }}>{mod.severity}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>{mod.data.interpretation}</Text>
                        {mod.data.implications?.map((imp: string, ii: number) => (
                          <View key={ii} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                            <Text style={{ fontSize: 12, color: '#1565C0', marginTop: 1 }}>•</Text>
                            <Text style={{ fontSize: 12, color: '#555', flex: 1, lineHeight: 18 }}>{imp}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Material Compatibility */}
                    {mod.id === 'material_compatibility' && (
                      <View>
                        {mod.data.suitable?.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#388E3C', marginBottom: 4 }}>Feasible</Text>
                            {mod.data.suitable.map((s: string, si: number) => (
                              <View key={si} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Ionicons name="checkmark-circle" size={14} color="#388E3C" />
                                <Text style={{ fontSize: 12, color: '#555' }}>{s}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {mod.data.limited?.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#F57C00', marginBottom: 4 }}>Marginal</Text>
                            {mod.data.limited.map((l: string, li: number) => (
                              <View key={li} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Ionicons name="warning" size={14} color="#F57C00" />
                                <Text style={{ fontSize: 12, color: '#555' }}>{l}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {mod.data.not_feasible?.length > 0 && (
                          <View>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#D32F2F', marginBottom: 4 }}>Not Feasible</Text>
                            {mod.data.not_feasible.map((n: string, ni: number) => (
                              <View key={ni} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Ionicons name="close-circle" size={14} color="#D32F2F" />
                                <Text style={{ fontSize: 12, color: '#555' }}>{n}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Esthetic Zone */}
                    {mod.id === 'esthetic_zone' && (
                      <View>
                        <Text style={{ fontSize: 12, color: '#1565C0', marginBottom: 6 }}>Teeth: {mod.data.teeth?.join(', ')}</Text>
                        {mod.data.alerts?.map((a: string, ai: number) => (
                          <View key={ai} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                            <Ionicons name="flower" size={13} color="#AD1457" style={{ marginTop: 2 }} />
                            <Text style={{ fontSize: 12, color: '#555', flex: 1, lineHeight: 18 }}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Retention Guidance */}
                    {mod.id === 'retention_guidance' && (
                      <View>
                        <View style={{ backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2E7D32', marginBottom: 2 }}>Preferred</Text>
                          <Text style={{ fontSize: 12, color: '#555' }}>{mod.data.preferred}</Text>
                        </View>
                        <View style={{ backgroundColor: '#FFF3E0', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#E65100', marginBottom: 2 }}>Alternative</Text>
                          <Text style={{ fontSize: 12, color: '#555' }}>{mod.data.alternative}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFFDE7', borderRadius: 10, padding: 10 }}>
                          <Ionicons name="information-circle" size={16} color="#F57F17" style={{ marginTop: 1 }} />
                          <Text style={{ fontSize: 12, color: '#555', flex: 1, lineHeight: 18 }}>{mod.data.advisory}</Text>
                        </View>
                      </View>
                    )}

                    {/* Generic notes/warnings/recommendations lists */}
                    {(mod.id === 'occlusion' || mod.id === 'biomechanics' || mod.id === 'hygiene') && (
                      <View>
                        {(mod.data.notes || mod.data.warnings || mod.data.recommendations)?.map((n: string, ni: number) => (
                          <View key={ni} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: '#1565C0', marginTop: 1 }}>•</Text>
                            <Text style={{ fontSize: 12, color: '#555', flex: 1, lineHeight: 18 }}>{n}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Opposing Arch */}
                    {mod.id === 'opposing_arch' && (
                      <View>
                        <View style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1565C0' }}>{mod.data.opposing_type}</Text>
                        </View>
                        {mod.data.notes?.map((n: string, ni: number) => (
                          <View key={ni} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                            <Text style={{ fontSize: 12, color: '#1565C0', marginTop: 1 }}>•</Text>
                            <Text style={{ fontSize: 12, color: '#555', flex: 1, lineHeight: 18 }}>{n}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Stability Alert */}
                    {mod.id === 'stability_alert' && (
                      <View>
                        {mod.data.low_isq_implants?.map((imp: any, ii: number) => (
                          <View key={ii} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Ionicons name="alert-circle" size={14} color="#D32F2F" />
                            <Text style={{ fontSize: 12, color: '#D32F2F', fontWeight: '600' }}>Implant {imp.implant}: ISQ {imp.value}</Text>
                          </View>
                        ))}
                        <Text style={{ fontSize: 12, color: '#555', marginTop: 4, lineHeight: 18 }}>{mod.data.recommendation}</Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* Alerts */}
                {smartPlannerReport.alerts?.length > 0 && (
                  <View style={{ backgroundColor: '#FFF3E0', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FFE082' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ionicons name="warning" size={16} color="#E65100" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#E65100' }}>Clinical Alerts</Text>
                    </View>
                    {smartPlannerReport.alerts.map((a: string, ai: number) => (
                      <View key={ai} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                        <Text style={{ fontSize: 12, color: '#E65100', marginTop: 1 }}>•</Text>
                        <Text style={{ fontSize: 12, color: '#BF360C', flex: 1, lineHeight: 18 }}>{a}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Regenerate button */}
                <TouchableOpacity
                  onPress={generateSmartPlanner}
                  disabled={smartPlannerLoading}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, backgroundColor: '#E3F2FD', borderRadius: 12 }}
                  data-testid="smart-planner-regenerate"
                >
                  <Ionicons name="refresh" size={16} color="#1565C0" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#1565C0' }}>Regenerate Report</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ═══════════ PHASE 4 STEP 1: PROSTHETIC PROTOCOL - Full Data Display ═══════════ */}
        {user?.role !== 'nurse' && (procedure.phase4_step1_data || procedure.stage2_prosthetic_remark || procedure.phase4_step1_student_notes) && (
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
                  <InfoRow icon="build" label="Final Prosthetic Plan" value={procedure.phase4_step1_data.final_prosthetic_plan} fieldKey="phase4_step1_data.final_prosthetic_plan" />
                )}
                {procedure.phase4_step1_data.prosthetic_material && (
                  <InfoRow icon="diamond" label="Prosthetic Material" value={procedure.phase4_step1_data.prosthetic_material} fieldKey="phase4_step1_data.prosthetic_material" />
                )}
                {procedure.phase4_step1_data.custom_abutment && (
                  <InfoRow icon="settings" label="Custom Abutment" value={procedure.phase4_step1_data.custom_abutment} fieldKey="phase4_step1_data.custom_abutment" />
                )}
                {procedure.phase4_step1_data.overdenture_attachment && (
                  <InfoRow icon="link" label="Overdenture Attachment" value={procedure.phase4_step1_data.overdenture_attachment} fieldKey="phase4_step1_data.overdenture_attachment" />
                )}
                {procedure.phase4_step1_data.impression_type && (
                  <InfoRow icon="scan" label="Impression Type" value={procedure.phase4_step1_data.impression_type === 'intraoral_scans' ? 'Intraoral Scans' : 'Conventional Impressions'} fieldKey="phase4_step1_data.impression_type" />
                )}
                {procedure.phase4_step1_data.payment_complete !== undefined && (
                  <InfoRow icon="card" label="Payment Complete" value={procedure.phase4_step1_data.payment_complete ? 'Yes' : 'No'} fieldKey="phase4_step1_data.payment_complete" />
                )}
                {procedure.phase4_step1_data.components_available !== undefined && (
                  <InfoRow icon="cube" label="Components Available" value={procedure.phase4_step1_data.components_available ? 'Yes' : 'No'} fieldKey="phase4_step1_data.components_available" />
                )}
              </View>
            )}

            {/* Notes & Remarks */}
            {(procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark) && (
              <View style={{ marginBottom: 8, backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#E65100', marginBottom: 8 }}>
                  {procedure.created_by_role === 'student' ? "Student's Notes" : "Operator's Notes"}
                </Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step1_student_notes || procedure.stage2_prosthetic_remark}</Text>
              </View>
            )}
            {(procedure.stage2_prosthetic_faculty_remark || procedure.phase4_step1_supervisor_notes) && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Supervisor Comment</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step1_supervisor_notes || procedure.stage2_prosthetic_faculty_remark}</Text>
              </View>
            )}
            {(procedure.stage2_prosthetic_incharge_remark || procedure.phase4_step1_incharge_notes) && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>Remarks by Implant In-Charge</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.stage2_prosthetic_incharge_remark}</Text>
              </View>
            )}
          </View>
        )}

        {/* ═══════════ PHASE 4 STEP 2: TRIAL & DELIVERY - Full Data Display ═══════════ */}
        {user?.role !== 'nurse' && (procedure.phase4_step2_data || procedure.phase4_step2_student_notes) && (
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 10, backgroundColor: procedure.phase4_step2_data.confirmation_statement ? '#E8F5E9' : '#FFEBEE', borderRadius: 8, flexWrap: 'wrap' }}>
                <Ionicons
                  name={procedure.phase4_step2_data.confirmation_statement ? 'checkmark-circle' : 'close-circle'}
                  size={22}
                  color={procedure.phase4_step2_data.confirmation_statement ? '#4CAF50' : '#F44336'}
                />
                <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: '600', color: '#333', flexShrink: 1 }}>
                  Confirmation: {procedure.phase4_step2_data.confirmation_statement ? 'Treatment Confirmed Complete' : 'Not Confirmed'}
                </Text>
              </View>
            )}

            {/* Notes & Remarks */}
            {procedure.phase4_step2_student_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#FCE4EC', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#880E4F', marginBottom: 8 }}>
                  {procedure.created_by_role === 'student' ? "Student's Notes" : "Operator's Notes"}
                </Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step2_student_notes}</Text>
              </View>
            )}
            {procedure.phase4_step2_supervisor_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#F3E5F5', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#6A1B9A', marginBottom: 8 }}>Supervisor Comment</Text>
                <Text style={{ fontSize: 14, color: '#333', lineHeight: 20 }}>{procedure.phase4_step2_supervisor_notes}</Text>
              </View>
            )}
            {procedure.phase4_step2_incharge_notes && (
              <View style={{ marginBottom: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 8 }}>In-Charge Comment</Text>
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
              procedureType={procedure.implant_procedure_type}
            />
          </View>
        )}

        {/* ── APPROVAL COMMENT BOX (Phase 2-4 only) ── */}
        {canApprove() && !showRejectDialog && procedure?.status !== 'pending_phase1' && (
          <View style={{ marginTop: 16, marginHorizontal: 16, backgroundColor: '#F0F4FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#C5CAE9' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#283593', marginBottom: 6 }}>
              Your Remarks (optional)
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#C5CAE9', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#FFF', minHeight: 60, textAlignVertical: 'top' }}
              value={approvalComment}
              onChangeText={setApprovalComment}
              placeholder="Write your remarks for the postgraduate student..."
              multiline
              data-testid="approval-comment-input"
            />
            <Text style={{ fontSize: 11, color: '#7986CB', marginTop: 4, fontStyle: 'italic' }}>
              This comment will be visible to the student and included in the PDF.
            </Text>
          </View>
        )}

        {/* ── APPROVAL SECTION ── */}
        {canApprove() && !showRejectDialog && (
          <View style={{ marginTop: 20, marginHorizontal: 16, flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
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

        {/* Implant Planning - Standalone Section */}
        {procedure.status !== 'pending_phase1' && (
          <CaseImplantPlanning
            procedureId={id as string}
            isOwner={user?.id === procedure.student_id}
            userRole={user?.role || ''}
            torqueValues={procedure.torque_values}
            procedureStatus={procedure.status}
            procedureType={procedure.implant_procedure_type}
          />
        )}

        {/* AI Case Summary Card — inside ScrollView for scrollability */}
        {aiSummary ? (
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#E8EAF6', borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: '#3F51B5' }} data-testid="ai-summary-card">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={16} color="#3F51B5" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#3F51B5' }}>AI Clinical Summary</Text>
              </View>
              <TouchableOpacity
                onPress={() => setAiSummary('')}
                style={{ padding: 4 }}
                data-testid="ai-summary-close"
              >
                <Ionicons name="close-circle" size={24} color="#7986CB" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#37474F', lineHeight: 20 }}>{aiSummary}</Text>
          </View>
        ) : null}

        {/* Edit History Footer — tappable, opens full timeline modal. Visible to all viewers including students. */}
        {procedure.last_edited_by && procedure.last_edited_at && (
          <TouchableOpacity
            style={styles.editHistoryFooter}
            onPress={() => setShowEditHistory(true)}
            activeOpacity={0.7}
            data-testid="edit-history-footer"
          >
            <Ionicons name="create-outline" size={14} color="#78909C" />
            <Text style={styles.editHistoryText}>
              Last edited by <Text style={styles.editHistoryName}>{procedure.last_edited_by}</Text>
              {' on '}
              <Text style={styles.editHistoryDate}>
                {format(new Date(procedure.last_edited_at), 'MMM dd, yyyy • hh:mm a')}
              </Text>
            </Text>
            {(procedure.edit_log?.length || 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, color: '#1565C0', fontWeight: '700' }}>View history</Text>
                <Ionicons name="chevron-forward" size={12} color="#1565C0" />
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Extra bottom spacing for the fixed buttons */}
        <View style={{ height: (canExportPDF() || canViewAiSummary()) ? 70 : 10 }} />
      </ScrollView>

      {/* Edit History Timeline Modal */}
      <Modal visible={showEditHistory} animationType="slide" transparent onRequestClose={() => setShowEditHistory(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingBottom: 20 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time-outline" size={22} color="#1565C0" />
                <Text style={{ fontSize: 17, fontWeight: '700', color: '#0D47A1' }}>Edit History</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditHistory(false)} style={{ padding: 4 }} data-testid="close-edit-history">
                <Ionicons name="close-circle" size={28} color="#78909C" />
              </TouchableOpacity>
            </View>
            {/* Timeline */}
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {(procedure.edit_log?.length || 0) === 0 ? (
                <View style={{ alignItems: 'center', padding: 30 }}>
                  <Ionicons name="document-outline" size={40} color="#B0BEC5" />
                  <Text style={{ fontSize: 14, color: '#78909C', marginTop: 10, textAlign: 'center' }}>
                    No detailed edit history yet. Future edits will be logged here.
                  </Text>
                </View>
              ) : (
                [...procedure.edit_log].reverse().map((entry: any, idx: number) => {
                  const fmt = (v: any): string => {
                    if (v === null || v === undefined || v === '') return '—';
                    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
                    if (Array.isArray(v)) return v.join(', ') || '—';
                    if (typeof v === 'object') return JSON.stringify(v);
                    return String(v);
                  };
                  const fieldLabel = entry.field
                    .replace(/^phase2_data\./, 'Phase 2 · ')
                    .replace(/^phase3_data\./, 'Phase 3 · ')
                    .replace(/^phase4_step1_data\./, 'Phase 4 · ')
                    .replace(/^medical_assessment\./, 'Medical · ')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
                  const roleLabel = entry.edited_by_role === 'implant_incharge' ? 'Implant In-Charge'
                    : entry.edited_by_role === 'supervisor' ? 'Supervisor'
                    : entry.edited_by_role === 'student' ? 'Student' : '';
                  return (
                    <View key={idx} style={{ flexDirection: 'row', marginBottom: 14 }} data-testid={`edit-log-entry-${idx}`}>
                      {/* Timeline dot + line */}
                      <View style={{ alignItems: 'center', marginRight: 12 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1565C0', marginTop: 6 }} />
                        {idx < procedure.edit_log.length - 1 && (
                          <View style={{ width: 2, flex: 1, backgroundColor: '#CFD8DC', marginTop: 2 }} />
                        )}
                      </View>
                      {/* Entry card */}
                      <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#1565C0' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0D47A1', marginBottom: 4 }}>{fieldLabel}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          <Text style={{ fontSize: 12, color: '#B0BEC5', textDecorationLine: 'line-through', maxWidth: '45%' }} numberOfLines={2}>
                            {fmt(entry.old_value)}
                          </Text>
                          <Ionicons name="arrow-forward" size={12} color="#546E7A" />
                          <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: '600', maxWidth: '45%' }} numberOfLines={2}>
                            {fmt(entry.new_value)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="person-circle-outline" size={13} color="#78909C" />
                          <Text style={{ fontSize: 11, color: '#546E7A' }}>
                            {entry.edited_by}{roleLabel ? ` · ${roleLabel}` : ''}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#90A4AE' }}>·</Text>
                          <Text style={{ fontSize: 11, color: '#90A4AE' }}>
                            {entry.edited_at ? format(new Date(entry.edited_at), 'MMM dd, hh:mm a') : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            {/* Close button */}
            <TouchableOpacity
              onPress={() => setShowEditHistory(false)}
              style={{ marginHorizontal: 20, marginTop: 8, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
              data-testid="close-edit-history-btn"
            >
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fixed bottom bar — compact centered action buttons */}
      {(canExportPDF() || canViewAiSummary()) && (
        <View style={styles.bottomBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 30 }}>
            {canExportPDF() && (
              <ExportPrintMenu
                label="EXPORT / PRINT"
                buttonStyle={[styles.barButtonCompact, { backgroundColor: '#1565C0', flex: 1 }]}
                textStyle={styles.barButtonTextCompact}
                triggerIconSize={14}
                loading={pdfLoading}
                disabled={pdfLoading}
                testID="case-report-export-print-btn"
                popoverTitle="Case Report"
                printLabel="Print Case Report"
                exportLabel="Export Case Report PDF"
                onPrint={async () => {
                  setPdfLoading(true);
                  try {
                    const { printProcedurePDF } = await import('../../utils/pdfGenerator');
                    await printProcedurePDF(procedure);
                  } finally { setPdfLoading(false); }
                }}
                onExport={handleExportPDF}
              />
            )}
            {canViewAiSummary() && (
              <TouchableOpacity
                style={[styles.barButtonCompact, { backgroundColor: '#0D47A1' }, aiSummaryLoading && styles.buttonDisabled]}
                onPress={async () => {
                  setAiSummaryLoading(true);
                  try {
                    const res = await api.post('/ai/case-summary', { procedure_id: procedure.id || procedure._id });
                    setAiSummary(res.data.summary);
                  } catch (e: any) {
                    Alert.alert('Error', e.response?.data?.detail || 'Failed to generate summary');
                  } finally { setAiSummaryLoading(false); }
                }}
                disabled={aiSummaryLoading}
                data-testid="ai-summary-btn"
              >
                {aiSummaryLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={14} color="#FFF" />
                    <Text style={styles.barButtonTextCompact}>AI SUMMARY</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Floating AI Chat Button */}
      {procedure.status !== 'draft' && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0D47A1', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8, zIndex: 999 }}
          onPress={() => setAiChatVisible(true)}
          data-testid="ai-chat-fab"
        >
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* AI Chat Modal */}
      <Modal visible={aiChatVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ maxHeight: '80%', minHeight: '50%', backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}
          >
            {/* Chat Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#0D47A1' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="sparkles" size={20} color="#FFF" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>Ask Implanr AI</Text>
              </View>
              <TouchableOpacity onPress={() => setAiChatVisible(false)} data-testid="ai-chat-close">
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Chat Messages */}
            <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}>
              {aiChatHistory.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color="#B0BEC5" />
                  <Text style={{ fontSize: 14, color: '#78909C', marginTop: 10, textAlign: 'center' }}>Ask me anything about this case.{'\n'}e.g. "Can I immediately load?" or "Is grafting needed?"</Text>
                </View>
              )}
              {aiChatHistory.map((msg: any, idx: number) => (
                <View key={idx} style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                  <View style={{ maxWidth: '85%', backgroundColor: msg.role === 'user' ? '#1565C0' : '#E8EAF6', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderBottomRightRadius: msg.role === 'user' ? 4 : 14, borderBottomLeftRadius: msg.role === 'user' ? 14 : 4 }}>
                    <Text style={{ fontSize: 13, color: msg.role === 'user' ? '#FFF' : '#37474F', lineHeight: 19 }}>{msg.content}</Text>
                  </View>
                </View>
              ))}
              {aiChatSending && (
                <View style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                  <View style={{ backgroundColor: '#E8EAF6', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <ActivityIndicator color="#3F51B5" size="small" />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Chat Input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth: 1, borderTopColor: '#E0E0E0', backgroundColor: '#FAFAFA' }}>
              <TextInput
                style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E0E0E0', maxHeight: 80 }}
                value={aiChatInput}
                onChangeText={setAiChatInput}
                placeholder="Ask about this case..."
                placeholderTextColor="#B0BEC5"
                multiline
                data-testid="ai-chat-input"
              />
              <TouchableOpacity
                style={{ marginLeft: 8, width: 42, height: 42, borderRadius: 21, backgroundColor: aiChatSending || !aiChatInput.trim() ? '#B0BEC5' : '#0D47A1', justifyContent: 'center', alignItems: 'center' }}
                disabled={aiChatSending || !aiChatInput.trim()}
                onPress={async () => {
                  const msg = aiChatInput.trim();
                  if (!msg) return;
                  setAiChatSending(true);
                  setAiChatInput('');
                  setAiChatHistory(prev => [...prev, { role: 'user', content: msg }]);
                  try {
                    const res = await api.post('/ai/chat', { procedure_id: procedure.id || procedure._id, message: msg });
                    setAiChatHistory(res.data.history);
                  } catch (e: any) {
                    setAiChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
                  } finally { setAiChatSending(false); }
                }}
                data-testid="ai-chat-send"
              >
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
    </EditContext.Provider>
  );
}

function InfoRow({ icon, label, value, fieldKey, onEdit, isEditing: isEditingProp, editValue: editValueProp, onEditChange: onEditChangeProp, onSave: onSaveProp, onCancel: onCancelProp, saving: savingProp }: {
  icon: string; label: string; value: string;
  fieldKey?: string; onEdit?: (key: string, val: string) => void;
  isEditing?: boolean; editValue?: string; onEditChange?: (v: string) => void;
  onSave?: () => void; onCancel?: () => void; saving?: boolean;
}) {
  const editCtx = useReactContext(EditContext);
  
  // Auto-derive fieldKey from label if not provided
  const key = fieldKey || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  
  // Use context-based editing if available and no explicit props passed
  const useCtx = editCtx && !onEdit;
  const isEditing = isEditingProp || (useCtx && editCtx.editingField === key);
  const editValue = editValueProp ?? (useCtx ? (editCtx.editValues[key] ?? '') : '');
  const saving = savingProp || (useCtx && editCtx.saving);

  const handleStartEdit = () => {
    if (onEdit && fieldKey) { onEdit(fieldKey, value); return; }
    if (useCtx) {
      // Seed edit value from the raw procedure field (not the formatted display text),
      // so dropdown pickers match the stored value correctly.
      const cfg = resolveFieldOptions(key, editCtx.procedure);
      let seed: any;
      if (cfg) {
        if (key.includes('.')) {
          const [p, c] = key.split('.');
          seed = editCtx.procedure?.[p]?.[c];
        } else {
          seed = editCtx.procedure?.[key];
        }
        if (cfg.bool) seed = seed === true ? 'Yes' : seed === false ? 'No' : '';
        else if (cfg.multi) seed = Array.isArray(seed) ? seed : [];
        else seed = seed == null ? '' : String(seed);
      } else {
        seed = value || '';
      }
      editCtx.startEdit(key, seed);
    }
  };
  const handleSave = () => {
    if (onSaveProp) { onSaveProp(); return; }
    if (useCtx) editCtx.saveField(key);
  };
  const handleCancel = () => {
    if (onCancelProp) { onCancelProp(); return; }
    if (useCtx) editCtx.cancelEdit();
  };
  const handleChange = (v: any) => {
    if (onEditChangeProp) { onEditChangeProp(v); return; }
    if (useCtx) editCtx.setEditValues(prev => ({ ...prev, [key]: v }));
  };

  const showPencil = (editCtx?.isEditMode || !!onEdit) && !isEditing;

  // Resolve picker config if the field has predefined options
  const pickerCfg = useCtx && isEditing ? resolveFieldOptions(key, editCtx.procedure) : null;

  // Normalize options to {value, label}[]
  const normOptions = pickerCfg
    ? (pickerCfg.options as any[]).map(o => typeof o === 'string' ? { value: o, label: o } : o)
    : [];

  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={20} color="#666" />
      <View style={[styles.infoContent, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        {isEditing ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>{label}</Text>
            {pickerCfg ? (
              // ── Dropdown / Chip Picker ────────────────────────
              <View style={{ marginTop: 6 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {normOptions.map(opt => {
                    const selected = pickerCfg.multi
                      ? Array.isArray(editValue) && editValue.includes(opt.value)
                      : editValue === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => {
                          if (pickerCfg.multi) {
                            const curr = Array.isArray(editValue) ? editValue : [];
                            const next = curr.includes(opt.value)
                              ? curr.filter((v: string) => v !== opt.value)
                              : [...curr, opt.value];
                            handleChange(next);
                          } else {
                            handleChange(opt.value);
                          }
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: selected ? '#1565C0' : '#CFD8DC',
                          backgroundColor: selected ? '#1565C0' : '#FFF',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#FFF' : '#37474F' }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#4CAF50', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }} disabled={!!saving}>
                    {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark" size={14} color="#FFF" />}
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCancel} style={{ backgroundColor: '#F44336', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="close" size={14} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // ── Plain Text Input ─────────────────────────────
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: '#1565C0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, backgroundColor: '#F0F7FF' }}
                  value={String(editValue ?? '')}
                  onChangeText={handleChange}
                  autoFocus
                />
                <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#4CAF50', borderRadius: 6, padding: 6 }} disabled={!!saving}>
                  {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="checkmark" size={16} color="#FFF" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancel} style={{ backgroundColor: '#F44336', borderRadius: 6, padding: 6 }}>
                  <Ionicons name="close" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
          </View>
        )}
        {showPencil && (
          <TouchableOpacity onPress={handleStartEdit} style={{ padding: 4 }} data-testid={`edit-field-${key}`}>
            <Ionicons name="pencil" size={14} color="#1565C0" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
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
    color: '#90A4AE',
  },
  statusCard: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 18,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#1565C0',
    marginBottom: 4,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  infoValue: {
    fontSize: 14,
    color: '#1A1A2E',
    fontWeight: '500',
  },
  specText: {
    fontSize: 14,
    color: '#1A1A2E',
    lineHeight: 20,
  },
  cbctFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#BBDEFB',
  },
  cbctFileName: {
    flex: 1,
    fontSize: 14,
    color: '#1565C0',
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565C0',
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
    color: '#1A1A2E',
    flex: 1,
  },
  additionalFields: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F8',
  },
  additionalField: {
    marginBottom: 8,
  },
  additionalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 4,
  },
  additionalFieldValue: {
    fontSize: 14,
    color: '#1A1A2E',
  },
  approvalSection: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 18,
    borderRadius: 16,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
  approvalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 12,
    letterSpacing: 0.3,
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
    backgroundColor: '#43A047',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#43A047',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E7EE',
    gap: 6,
  },
  editHistoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#ECEFF1',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#78909C',
  },
  editHistoryText: {
    fontSize: 11,
    color: '#546E7A',
    fontStyle: 'italic',
    flexShrink: 1,
    textAlign: 'center',
  },
  editHistoryName: {
    fontWeight: '700',
    color: '#37474F',
    fontStyle: 'normal',
  },
  editHistoryDate: {
    fontWeight: '600',
    color: '#455A64',
    fontStyle: 'normal',
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  barButton: {
    flexDirection: 'row',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    minWidth: 140,
  },
  barButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  barButtonCompact: {
    flexDirection: 'row',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  barButtonTextCompact: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pdfButton: {
    flexDirection: 'row',
    backgroundColor: '#DC3545',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#DC3545',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
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
  autoclaveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  autoclaveBadgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoclaveBadgeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
  },
  autoclaveBadgeSub: {
    fontSize: 11,
    color: '#388E3C',
    marginTop: 1,
  },
  consentActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  consentActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    minHeight: 42,
  },
  consentActionBtnPrimary: { backgroundColor: '#1565C0' },
  consentActionBtnSecondary: { backgroundColor: '#607D8B' },
  consentActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  consentActionBtnTextSecondary: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
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
