import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import ChecklistForm from '../../components/ChecklistForm';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import CasePhotoAlbum from '../../components/CasePhotoAlbum';
import BackToDashboard from '../../components/BackToDashboard';
import { useRouter } from 'expo-router';
import { format, addDays } from 'date-fns';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import {
  PROCEDURE_TIME_SLOTS,
  PROCEDURE_TYPES,
  LOADING_TYPES,
  getProstheticOptions,
} from '../../constants/checklist';

export default function NewProcedureScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const isStudent = user?.role === 'student';
  const isSupervisor = user?.role === 'supervisor';
  const isIncharge = user?.role === 'implant_incharge' || user?.role === 'administrator';
  const isFaculty = isSupervisor || isIncharge;

  const [loading, setLoading] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [implantIncharges, setImplantIncharges] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showInstructorDropdown, setShowInstructorDropdown] = useState(false);
  const [showInchargeDropdown, setShowInchargeDropdown] = useState(false);
  const [showProcedureTypeDropdown, setShowProcedureTypeDropdown] = useState(false);
  const [showProstheticDropdown, setShowProstheticDropdown] = useState(false);

  // Step 2: Implant Planning after procedure creation
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [newProcedureId, setNewProcedureId] = useState<string | null>(null);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const minDate = isStudent ? format(addDays(new Date(), 1), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

  const [formData, setFormData] = useState({
    patient_name: '',
    registration_number: '',
    supervisor_id: '',
    supervisor_name: '',
    implant_incharge_id: '',
    implant_incharge_name: '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: minDate,
    procedure_time: '10:00',
    implant_procedure_type: '',
    loading_type: [] as string[],
    prosthetic_plan: '',
    bone_graft_specifications: '',
  });

  const [checklist, setChecklist] = useState({});
  const [fieldErrors, setFieldErrors] = useState<{[key: string]: boolean}>({});

  // Compute prosthetic options based on current selections
  const prostheticOptions = useMemo(() => {
    return getProstheticOptions(formData.implant_procedure_type, formData.loading_type);
  }, [formData.implant_procedure_type, formData.loading_type]);

  useEffect(() => {
    if (user) {
      loadUsers();
      // Auto-fill supervisor/incharge fields for faculty
      if (isSupervisor && user.id) {
        setFormData(prev => ({
          ...prev,
          supervisor_id: user.id,
          supervisor_name: user.name || user.full_name || '',
        }));
      }
      if (isIncharge && user.id) {
        setFormData(prev => ({
          ...prev,
          implant_incharge_id: user.id,
          implant_incharge_name: user.name || user.full_name || '',
        }));
      }
    }
  }, [user]);

  // Clear prosthetic_plan when options change and current selection is no longer valid
  useEffect(() => {
    if (formData.prosthetic_plan && !prostheticOptions.includes(formData.prosthetic_plan)) {
      setFormData((prev) => ({ ...prev, prosthetic_plan: '' }));
    }
  }, [prostheticOptions]);

  const loadUsers = async () => {
    try {
      const usersRes = await api.get('/users');
      const allUsers = usersRes.data;
      const supervisorList = allUsers.filter((u: any) =>
        u.role === 'supervisor' || u.role === 'administrator' || u.role === 'implant_incharge'
      );
      const inchargeList = allUsers.filter((u: any) =>
        u.role === 'implant_incharge' || u.role === 'administrator'
      );
      setInstructors(supervisorList);
      setImplantIncharges(inchargeList);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (value) setFieldErrors((prev) => ({ ...prev, [field]: false }));
  };

  const handleInstructorChange = (supervisorId: string) => {
    const supervisor = instructors.find((i: any) => i.id === supervisorId);
    setFormData((prev) => ({
      ...prev,
      supervisor_id: supervisorId,
      supervisor_name: supervisor ? (supervisor as any).name : '',
    }));
    if (supervisorId) setFieldErrors((prev) => ({ ...prev, supervisor_id: false }));
  };

  const handleImplantInchargeChange = (inchargeId: string) => {
    const incharge = implantIncharges.find((i: any) => i.id === inchargeId);
    setFormData((prev) => ({
      ...prev,
      implant_incharge_id: inchargeId,
      implant_incharge_name: incharge ? (incharge as any).name : '',
    }));
    if (inchargeId) setFieldErrors((prev) => ({ ...prev, implant_incharge_id: false }));
  };

  const handleDateSelect = (day: any) => {
    const selectedDate = new Date(day.dateString);
    if (selectedDate.getUTCDay() === 0) {
      Alert.alert('Not Available', 'No scheduling is available on Sundays.');
      return;
    }
    if (selectedDate.getUTCDay() === 6) {
      setFormData((prev) => ({ ...prev, procedure_date: day.dateString, procedure_time: '10:00' }));
    } else {
      setFormData((prev) => ({ ...prev, procedure_date: day.dateString }));
    }
    setShowCalendar(false);
  };

  const isSaturday = () => {
    try {
      const d = new Date(formData.procedure_date);
      return d.getUTCDay() === 6;
    } catch { return false; }
  };

  const getAvailableTimeSlots = () => {
    const dayName = (() => {
      try {
        const d = new Date(formData.procedure_date);
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      } catch { return 'Mon'; }
    })();
    return PROCEDURE_TIME_SLOTS.filter(s => s.days.includes(dayName));
  };

  const toggleLoadingType = (lt: string) => {
    setFormData((prev) => {
      const current = prev.loading_type;
      const updated = current.includes(lt)
        ? current.filter(t => t !== lt)
        : [...current, lt];
      return { ...prev, loading_type: updated };
    });
  };

  const formatDisplayDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'EEEE, MMMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const validateForm = () => {
    const requiredFields = [
      { field: 'patient_name', label: 'Patient Name' },
      { field: 'registration_number', label: 'Registration Number' },
      { field: 'supervisor_id', label: 'Supervisor' },
      { field: 'implant_incharge_id', label: 'Implant Incharge' },
      { field: 'receipt_number', label: 'Receipt Number' },
      { field: 'amount_paid', label: 'Amount Paid' },
      { field: 'procedure_date', label: 'Procedure Date' },
      { field: 'procedure_time', label: 'Procedure Time' },
      { field: 'implant_procedure_type', label: 'Type of Implant Procedure' },
    ];

    const errors: {[key: string]: boolean} = {};
    const missingFields: string[] = [];

    for (const { field, label } of requiredFields) {
      const val = formData[field as keyof typeof formData];
      if (!val || (typeof val === 'string' && !val.trim())) {
        errors[field] = true;
        missingFields.push(label);
      }
    }

    if (formData.loading_type.length === 0) {
      errors['loading_type'] = true;
      missingFields.push('Type of Loading');
    }

    setFieldErrors(errors);

    if (missingFields.length > 0) {
      Alert.alert(
        'Required Fields Missing',
        `Please fill in the following fields:\n\n${missingFields.map(f => `- ${f}`).join('\n')}`
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const payload = {
        student_name: isStudent ? (user?.name || user?.full_name || '') : '',
        patient_name: formData.patient_name,
        registration_number: formData.registration_number,
        supervisor_id: formData.supervisor_id,
        supervisor_name: formData.supervisor_name,
        implant_incharge_id: formData.implant_incharge_id,
        implant_incharge_name: formData.implant_incharge_name,
        receipt_number: formData.receipt_number,
        amount_paid: parseFloat(formData.amount_paid) || 0,
        procedure_date: formData.procedure_date,
        procedure_time: formData.procedure_time,
        implant_procedure_type: formData.implant_procedure_type,
        loading_type: formData.loading_type,
        prosthetic_plan: formData.prosthetic_plan,
        bone_graft_specifications: formData.bone_graft_specifications,
        checklist,
      };

      const response = await api.post('/procedures', payload);
      const procedureId = response.data?.id || response.data?._id;
      const createdStatus = response.data?.status;

      if (isIncharge && createdStatus === 'completed') {
        // Implant In-Charge: auto-completed, go to detail
        Alert.alert('Case Created', 'Case has been created and auto-approved. All phases are complete.', [
          { text: 'View Case', onPress: () => router.push(`/procedures/${procedureId}`) },
          { text: 'OK', onPress: () => router.push('/(tabs)/procedures') },
        ]);
      } else if (procedureId) {
        setNewProcedureId(procedureId);
        setWizardStep(2);
      } else {
        Alert.alert('Success', 'Procedure submitted successfully!', [
          { text: 'OK', onPress: () => router.push('/(tabs)/procedures') },
        ]);
      }
    } catch (error: any) {
      console.error('Submit error:', error.response?.data);
      let errorMessage = 'Failed to submit procedure';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map((e: any) => e.msg || e.message || JSON.stringify(e))
            .join('\n');
        } else {
          errorMessage = String(error.response.data.detail);
        }
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render Helper: Dropdown Modal ─────────────────────
  const renderDropdownModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    data: any[],
    selectedId: string,
    onSelect: (item: any) => void,
    showRole = true
  ) => (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.dropdownModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(item: any) => item.id || item}
            renderItem={({ item }: any) => {
              const id = typeof item === 'string' ? item : item.id;
              const label = typeof item === 'string' ? item : item.name;
              const isSelected = selectedId === id;
              return (
                <TouchableOpacity
                  style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                  onPress={() => { onSelect(item); onClose(); }}
                >
                  <View style={styles.dropdownItemContent}>
                    {typeof item !== 'string' && (
                      <Ionicons name="person-circle" size={32} color={isSelected ? '#007AFF' : '#666'} />
                    )}
                    <View>
                      <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                        {label}
                      </Text>
                      {showRole && typeof item !== 'string' && item.role && (
                        <Text style={styles.dropdownItemRole}>{item.role}</Text>
                      )}
                    </View>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <BackToDashboard />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* ── Step Indicator ─── */}
          <View style={styles.stepIndicatorBar}>
            <View style={[styles.stepPill, styles.stepPillActive]}>
              <Text style={styles.stepPillText}>1</Text>
              <Text style={styles.stepPillLabel}>Case Details</Text>
            </View>
            <View style={[styles.stepConnector, wizardStep === 2 && styles.stepConnectorDone]} />
            <View style={[styles.stepPill, wizardStep === 2 && styles.stepPillActive]}>
              <Text style={[styles.stepPillText, wizardStep < 2 && { color: '#999' }]}>2</Text>
              <Text style={[styles.stepPillLabel, wizardStep < 2 && { color: '#999' }]}>Implant Selection</Text>
            </View>
          </View>

          {/* ══════════════ STEP 1: Case Form ══════════════ */}
          {wizardStep === 1 && (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>New Procedure</Text>
                <Text style={styles.subtitle}>
                  {isStudent ? 'Fill in all required information' :
                   isSupervisor ? 'Schedule a new case (Implant In-Charge approval required)' :
                   'Schedule a new case (Auto-approved on creation)'}
                </Text>
              </View>

              {isFaculty && (
                <View style={{ backgroundColor: isSupervisor ? '#E3F2FD' : '#E8F5E9', padding: 12, marginHorizontal: 16, borderRadius: 10, marginBottom: 8 }} data-testid="faculty-create-banner">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={isSupervisor ? 'school' : 'shield-checkmark'} size={18} color={isSupervisor ? '#1565C0' : '#2E7D32'} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isSupervisor ? '#1565C0' : '#2E7D32' }}>
                      {isSupervisor ? 'Creating as Supervisor' : 'Creating as Implant In-Charge'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    {isSupervisor
                      ? 'Your approval is implicit. Only Implant In-Charge needs to approve each phase.'
                      : 'All phases will be auto-approved upon creation.'}
                  </Text>
                </View>
              )}

              <View style={styles.form}>
                {/* ── Patient Information ─── */}
                <Text style={styles.sectionTitle}>Patient Information</Text>

                <Text style={styles.label}>Patient Name *</Text>
                <TextInput
                  style={[styles.input, fieldErrors.patient_name && styles.inputError]}
                  value={formData.patient_name}
                  onChangeText={(v) => handleInputChange('patient_name', v)}
                  placeholder="Enter patient name"
                  data-testid="input-patient-name"
                />

                <Text style={styles.label}>Registration Number *</Text>
                <TextInput
                  style={[styles.input, fieldErrors.registration_number && styles.inputError]}
                  value={formData.registration_number}
                  onChangeText={(v) => handleInputChange('registration_number', v)}
                  placeholder="Enter registration number"
                  data-testid="input-registration-number"
                />

                {/* ── Faculty ─── */}
                <Text style={styles.sectionTitle}>Faculty</Text>

                {/* Supervisor Selection - shown for students, auto-filled & locked for supervisors */}
                <Text style={styles.label}>Supervising Faculty *</Text>
                {isSupervisor ? (
                  <View style={[styles.dropdownButton, { backgroundColor: '#F0F0F0' }]}>
                    <Text style={styles.dropdownText}>{formData.supervisor_name} (You)</Text>
                    <Ionicons name="lock-closed" size={16} color="#999" />
                  </View>
                ) : (
                <TouchableOpacity
                  style={[styles.dropdownButton, fieldErrors.supervisor_id && styles.inputError]}
                  onPress={() => setShowInstructorDropdown(true)}
                  data-testid="select-supervisor"
                >
                  <Text style={formData.supervisor_name ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {formData.supervisor_name || 'Select Supervising Faculty'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                )}

                <Text style={styles.label}>Implant Incharge *</Text>
                {isIncharge ? (
                  <View style={[styles.dropdownButton, { backgroundColor: '#F0F0F0' }]}>
                    <Text style={styles.dropdownText}>{formData.implant_incharge_name} (You)</Text>
                    <Ionicons name="lock-closed" size={16} color="#999" />
                  </View>
                ) : (
                <TouchableOpacity
                  style={[styles.dropdownButton, fieldErrors.implant_incharge_id && styles.inputError]}
                  onPress={() => setShowInchargeDropdown(true)}
                  data-testid="select-incharge"
                >
                  <Text style={formData.implant_incharge_name ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {formData.implant_incharge_name || 'Select Implant Incharge'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                )}

                {/* ── Payment Details ─── */}
                <Text style={styles.sectionTitle}>Payment Details</Text>

                <Text style={styles.label}>Receipt Number *</Text>
                <TextInput
                  style={[styles.input, fieldErrors.receipt_number && styles.inputError]}
                  value={formData.receipt_number}
                  onChangeText={(v) => handleInputChange('receipt_number', v)}
                  placeholder="Enter receipt number"
                  data-testid="input-receipt-number"
                />

                <Text style={styles.label}>Amount Paid (INR) *</Text>
                <TextInput
                  style={[styles.input, fieldErrors.amount_paid && styles.inputError]}
                  value={formData.amount_paid}
                  onChangeText={(v) => handleInputChange('amount_paid', v)}
                  placeholder="Enter amount"
                  keyboardType="numeric"
                  data-testid="input-amount-paid"
                />

                {/* ── Schedule ─── */}
                <Text style={styles.sectionTitle}>Schedule</Text>

                <Text style={styles.label}>Procedure Date *</Text>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowCalendar(true)} data-testid="select-date">
                  <Ionicons name="calendar" size={20} color="#007AFF" />
                  <Text style={styles.datePickerText}>{formatDisplayDate(formData.procedure_date)}</Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>
                <Text style={styles.helperText}>
                  Mon-Fri: 10:00 AM &amp; 2:00 PM | Saturday: 10:00 AM only | No Sundays
                </Text>

                <Text style={styles.label}>Procedure Time *</Text>
                <View style={styles.timeSlotContainer}>
                  {getAvailableTimeSlots().map((slot) => (
                    <TouchableOpacity
                      key={slot.value}
                      style={[styles.timeSlotButton, formData.procedure_time === slot.value && styles.timeSlotButtonActive]}
                      onPress={() => handleInputChange('procedure_time', slot.value)}
                      data-testid={`time-slot-${slot.value}`}
                    >
                      <Ionicons name="time" size={18} color={formData.procedure_time === slot.value ? '#FFF' : '#007AFF'} />
                      <Text style={[styles.timeSlotText, formData.procedure_time === slot.value && styles.timeSlotTextActive]}>
                        {slot.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Procedure Details ─── */}
                <Text style={styles.sectionTitle}>Procedure Details</Text>

                <Text style={styles.label}>Type of Implant Procedure *</Text>
                <TouchableOpacity
                  style={[styles.dropdownButton, fieldErrors.implant_procedure_type && styles.inputError]}
                  onPress={() => setShowProcedureTypeDropdown(true)}
                  data-testid="select-procedure-type"
                >
                  <Text style={formData.implant_procedure_type ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {formData.implant_procedure_type || 'Select Procedure Type'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </TouchableOpacity>

                <Text style={styles.label}>Type of Loading *</Text>
                <View style={[styles.loadingTypeContainer, fieldErrors.loading_type && styles.inputError]}>
                  {LOADING_TYPES.map((lt) => {
                    const isSelected = formData.loading_type.includes(lt);
                    return (
                      <TouchableOpacity
                        key={lt}
                        style={[styles.loadingTypeChip, isSelected && styles.loadingTypeChipActive]}
                        onPress={() => toggleLoadingType(lt)}
                        data-testid={`loading-type-${lt.replace(/\s/g, '-').toLowerCase()}`}
                      >
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={isSelected ? '#007AFF' : '#999'}
                        />
                        <Text style={[styles.loadingTypeText, isSelected && styles.loadingTypeTextActive]}>
                          {lt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.helperText}>Select one or both loading types</Text>

                {prostheticOptions.length > 0 && (
                  <>
                    <Text style={styles.label}>Prosthetic Treatment Plan</Text>
                    <TouchableOpacity
                      style={styles.dropdownButton}
                      onPress={() => setShowProstheticDropdown(true)}
                      data-testid="select-prosthetic-plan"
                    >
                      <Text style={formData.prosthetic_plan ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {formData.prosthetic_plan || 'Select Prosthetic Plan'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#666" />
                    </TouchableOpacity>
                  </>
                )}

                <Text style={styles.label}>Bone Graft/Membrane Specifications (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.bone_graft_specifications}
                  onChangeText={(v) => handleInputChange('bone_graft_specifications', v)}
                  placeholder="Enter bone graft/membrane specifications"
                  multiline
                  numberOfLines={3}
                  data-testid="input-bone-graft"
                />

                {/* ── Phase 1 Checklist ─── */}
                <ChecklistForm
                  checklist={checklist}
                  onChecklistChange={setChecklist}
                  phase={1}
                />

                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                  data-testid="submit-procedure-btn"
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.submitButtonText}>Submit & Continue to Implant Selection</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 6 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ══════════════ STEP 2: Implant Selection ══════════════ */}
          {wizardStep === 2 && newProcedureId && (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Implant Selection</Text>
                <Text style={styles.subtitle}>
                  Case for {formData.patient_name} created as draft. Plan your implants, then send for approval.
                </Text>
              </View>

              <View style={styles.successBanner} data-testid="case-created-banner">
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <Text style={styles.successBannerText}>Case saved as draft</Text>
              </View>

              <CaseImplantPlanning
                procedureId={newProcedureId}
                isOwner={true}
                userRole="student"
              />

              {/* Phase-wise Photo Upload */}
              <View style={styles.photoSection}>
                <Text style={styles.photoSectionTitle}>Clinical Photo Upload</Text>
                <Text style={styles.photoSectionSubtitle}>
                  Upload phase-wise photographs from camera or library
                </Text>
              </View>
              <CasePhotoAlbum
                procedureId={newProcedureId}
                isOwner={true}
                userRole="student"
              />

              <View style={styles.step2Actions}>
                <TouchableOpacity
                  style={[styles.approvalBtn, submittingApproval && styles.buttonDisabled]}
                  onPress={async () => {
                    setSubmittingApproval(true);
                    try {
                      await api.post(`/procedures/${newProcedureId}/request-phase1-approval`);
                      Alert.alert(
                        'Approval Requested',
                        'Your case has been sent for Phase 1 approval to the Supervisor and Implant Incharge.',
                        [{ text: 'OK', onPress: () => router.push('/(tabs)/procedures') }]
                      );
                    } catch (err: any) {
                      const msg = err.response?.data?.detail || 'Failed to request approval';
                      Alert.alert('Error', String(msg));
                    } finally {
                      setSubmittingApproval(false);
                    }
                  }}
                  disabled={submittingApproval}
                  data-testid="send-phase1-approval-btn"
                >
                  {submittingApproval ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="send" size={20} color="#FFF" />
                      <Text style={styles.approvalBtnText}>Send for Phase 1 Approval</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.step2SkipBtn}
                  onPress={() => router.push('/(tabs)/procedures')}
                  data-testid="save-draft-btn"
                >
                  <Text style={styles.step2SkipBtnText}>Save as Draft</Text>
                  <Ionicons name="bookmark-outline" size={16} color="#666" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar Modal */}
      <Modal visible={showCalendar} animationType="slide" transparent onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Calendar
              minDate={minDate}
              onDayPress={handleDateSelect}
              markedDates={{ [formData.procedure_date]: { selected: true, selectedColor: '#007AFF' } }}
              theme={{ todayTextColor: '#007AFF', selectedDayBackgroundColor: '#007AFF', arrowColor: '#007AFF' }}
            />
          </View>
        </View>
      </Modal>

      {/* Supervisor Dropdown */}
      {renderDropdownModal(
        showInstructorDropdown,
        () => setShowInstructorDropdown(false),
        'Select Supervising Faculty',
        instructors,
        formData.supervisor_id,
        (item: any) => handleInstructorChange(item.id)
      )}

      {/* Implant Incharge Dropdown */}
      {renderDropdownModal(
        showInchargeDropdown,
        () => setShowInchargeDropdown(false),
        'Select Implant Incharge',
        implantIncharges,
        formData.implant_incharge_id,
        (item: any) => handleImplantInchargeChange(item.id)
      )}

      {/* Procedure Type Dropdown */}
      <Modal visible={showProcedureTypeDropdown} animationType="slide" transparent onRequestClose={() => setShowProcedureTypeDropdown(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Procedure Type</Text>
              <TouchableOpacity onPress={() => setShowProcedureTypeDropdown(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={PROCEDURE_TYPES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = formData.implant_procedure_type === item;
                return (
                  <TouchableOpacity
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                    onPress={() => {
                      handleInputChange('implant_procedure_type', item);
                      setShowProcedureTypeDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                      {item}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Prosthetic Plan Dropdown */}
      <Modal visible={showProstheticDropdown} animationType="slide" transparent onRequestClose={() => setShowProstheticDropdown(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Prosthetic Treatment Plan</Text>
              <TouchableOpacity onPress={() => setShowProstheticDropdown(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={prostheticOptions}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = formData.prosthetic_plan === item;
                return (
                  <TouchableOpacity
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                    onPress={() => {
                      handleInputChange('prosthetic_plan', item);
                      setShowProstheticDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                      {item}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={24} color="#007AFF" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  form: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 8,
  },
  label: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  inputError: { borderColor: '#DC3545', borderWidth: 2, backgroundColor: '#FFF5F5' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#FAFAFA',
  },
  dropdownText: { fontSize: 16, color: '#333', flex: 1 },
  dropdownPlaceholder: { fontSize: 16, color: '#999', flex: 1 },
  dropdownModal: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemSelected: { backgroundColor: '#F0F8FF' },
  dropdownItemContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  dropdownItemText: { fontSize: 16, color: '#333', fontWeight: '500' },
  dropdownItemTextSelected: { color: '#007AFF' },
  dropdownItemRole: { fontSize: 12, color: '#888', marginTop: 2 },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FAFAFA',
    gap: 8,
  },
  datePickerText: { flex: 1, fontSize: 16, color: '#333' },
  helperText: { fontSize: 12, color: '#888', marginTop: 4, fontStyle: 'italic' },
  timeSlotContainer: { flexDirection: 'row', gap: 12 },
  timeSlotButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: '#FFF',
  },
  timeSlotButtonActive: { backgroundColor: '#007AFF' },
  timeSlotText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  timeSlotTextActive: { color: '#FFF' },
  loadingTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#C5CDD5',
    backgroundColor: '#F4F6F8',
  },
  loadingTypeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#FFF',
  },
  loadingTypeChipActive: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  loadingTypeText: { fontSize: 14, fontWeight: '500', color: '#666' },
  loadingTypeTextActive: { color: '#007AFF' },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  calendarModal: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  // Wizard step indicator
  stepIndicatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  stepPillActive: {
    backgroundColor: '#E3F2FD',
  },
  stepPillText: {
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: '#007AFF',
    color: '#FFF',
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepPillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  stepConnector: {
    width: 30,
    height: 2,
    backgroundColor: '#DDD',
    marginHorizontal: 6,
  },
  stepConnectorDone: {
    backgroundColor: '#007AFF',
  },
  // Success banner for Step 2
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  successBannerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
  },
  // Step 2 action buttons
  step2Actions: {
    marginTop: 20,
    gap: 12,
    paddingBottom: 32,
  },
  approvalBtn: {
    backgroundColor: '#34A853',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  photoSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  photoSectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  approvalBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  step2SkipBtn: {
    borderWidth: 1.5,
    borderColor: '#CCC',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  step2SkipBtnText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
});
