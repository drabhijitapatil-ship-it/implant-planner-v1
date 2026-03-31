import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, AppState
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import {
  PROCEDURE_TYPES,
  LOADING_TYPES,
  CHECKLIST_DATA,
  PROCEDURE_TIME_SLOTS,
  NON_FULL_ARCH_TYPES,
  FULL_ARCH_GROUP,
  CLINICAL_EXAM_GROUP,
  EDENTULOUS_SITE_OPTIONS,
  ARCH_CONDITION_OPTIONS,
  RIDGE_CONTOUR_OPTIONS,
  SOFT_TISSUE_OPTIONS,
  KERATINIZED_MUCOSA_OPTIONS,
  OCCLUSAL_SCHEME_OPTIONS,
  PARAFUNCTION_HABIT_OPTIONS,
  VERTICAL_DIMENSION_OPTIONS,
  OPPOSING_DENTITION_OPTIONS,
  TMJ_OPTIONS,
  SMILE_LINE_OPTIONS,
  GINGIVAL_BIOTYPE_OPTIONS,
  MEDICAL_RISK_FACTORS,
  calculateMedicalRisk,
  getProstheticOptions,
} from '../../constants/checklist';

import { BACKEND_URL } from '../../utils/config';

const API = BACKEND_URL;

// ─── Multi-Select Dropdown ─────────────────────────────
function MultiSelectDropdown({ label, values, options, onChange, placeholder, required }: {
  label: string; values: string[]; options: string[]; onChange: (v: string[]) => void;
  placeholder?: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggleOption = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter(v => v !== opt));
    else onChange([...values, opt]);
  };
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)}>
        <Text style={[styles.dropdownText, values.length === 0 && { color: '#999' }]} numberOfLines={2}>
          {values.length > 0 ? values.join(', ') : placeholder || `Select ${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[styles.dropdownItem, values.includes(opt) && styles.dropdownItemActive]}
              onPress={() => toggleOption(opt)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={values.includes(opt) ? 'checkbox' : 'square-outline'}
                  size={20} color={values.includes(opt) ? '#1A73E8' : '#999'} />
                <Text style={[styles.dropdownItemText, values.includes(opt) && styles.dropdownItemTextActive]}>{opt}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Reusable Dropdown ─────────────────────────────────
function Dropdown({ label, value, options, onChange, placeholder, required }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)} data-testid={`dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>
          {value || placeholder || `Select ${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[styles.dropdownItem, value === opt && styles.dropdownItemActive]}
              onPress={() => { onChange(opt); setOpen(false); }}>
              <Text style={[styles.dropdownItemText, value === opt && styles.dropdownItemTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Inline Calendar Picker ────────────────────────────
function CalendarPicker({ value, onChange, label, required }: {
  value: string; onChange: (date: string) => void; label: string; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [viewYear, setViewYear] = useState(value ? parseInt(value.split('-')[0]) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? parseInt(value.split('-')[1]) - 1 : today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const selectDate = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  };

  const isDisabled = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayMidnight;
  };

  const isSelected = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return value === `${viewYear}-${m}-${d}`;
  };

  const isToday = (day: number) => {
    return day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)} data-testid="calendar-trigger">
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>
          {value || 'Select Date'}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <View style={calStyles.container}>
          <View style={calStyles.header}>
            <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn}>
              <Ionicons name="chevron-back" size={20} color="#1A73E8" />
            </TouchableOpacity>
            <Text style={calStyles.monthYear}>{monthNames[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color="#1A73E8" />
            </TouchableOpacity>
          </View>
          <View style={calStyles.dayNamesRow}>
            {dayNames.map(dn => (
              <Text key={dn} style={calStyles.dayName}>{dn}</Text>
            ))}
          </View>
          <View style={calStyles.grid}>
            {cells.map((day, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  calStyles.cell,
                  day && isSelected(day) && calStyles.cellSelected,
                  day && isToday(day) && !isSelected(day) && calStyles.cellToday,
                ]}
                disabled={!day || isDisabled(day)}
                onPress={() => day && selectDate(day)}
              >
                <Text style={[
                  calStyles.cellText,
                  day && isDisabled(day) && calStyles.cellDisabled,
                  day && isSelected(day) && calStyles.cellSelectedText,
                  day && isToday(day) && !isSelected(day) && calStyles.cellTodayText,
                ]}>
                  {day || ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  navBtn: { padding: 6 },
  monthYear: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  dayNamesRow: { flexDirection: 'row', marginBottom: 4 },
  dayName: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#999' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  cellText: { fontSize: 14, color: '#333' },
  cellDisabled: { color: '#CCC' },
  cellSelected: { backgroundColor: '#1A73E8' },
  cellSelectedText: { color: '#FFF', fontWeight: '700' },
  cellToday: { borderWidth: 1.5, borderColor: '#1A73E8', borderRadius: 20 },
  cellTodayText: { color: '#1A73E8', fontWeight: '600' },
});

// ─── Main Component ────────────────────────────────────
export default function NewProcedureScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'implants'>('details');
  const [loading, setLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [incharges, setIncharges] = useState<any[]>([]);
  const [createdProcedureId, setCreatedProcedureId] = useState<string | null>(null);

  // ── Form State ──
  const [formData, setFormData] = useState({
    patient_name: '',
    registration_number: '',
    student_name: user?.name || '',
    supervisor_id: '',
    supervisor_name: '',
    implant_incharge_id: '',
    implant_incharge_name: '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: '',
    procedure_time: '',
    implant_procedure_type: '',
    loading_type: [] as string[],
    prosthetic_plan: '',
    prosthetic_plan_other: '',
    bone_graft_specifications: '',
    // Clinical Examination
    edentulous_sites: [] as string[],
    arch_condition: '',
    ridge_contour: '',
    soft_tissue_thickness: '',
    keratinized_mucosa: '',
    // Occlusal Analysis (non-full-arch)
    occlusal_scheme: '',
    parafunction_habit: '',
    vertical_dimension: '',
    opposing_dentition: '',
    // Occlusal Analysis (full-arch)
    vertical_dimension_mm: '',
    tmj: '',
    // Aesthetic Risk Assessment
    smile_line: '',
    gingival_biotype: '',
    // Medical Assessment
    medical_assessment: {} as Record<string, string>,
    medical_risk_level: '',
  });

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [showInchargePicker, setShowInchargePicker] = useState(false);

  const isFullArch = FULL_ARCH_GROUP.has(formData.implant_procedure_type);
  const isNonFullArch = NON_FULL_ARCH_TYPES.has(formData.implant_procedure_type);
  const isClinicalExamGroup = CLINICAL_EXAM_GROUP.has(formData.implant_procedure_type);
  const prostheticOptions = getProstheticOptions(formData.implant_procedure_type, formData.loading_type);

  const FORM_STORAGE_KEY = `new_procedure_form_${user?.id || 'anon'}`;
  const appState = useRef(AppState.currentState);

  // ── Sanitise a string: trim + strip < > ; " ' ──
  const sanitizeString = (val: string) => val.trim().replace(/[<>"';]/g, '');

  // ── Reset form when tab gains focus (prevents stale data) ──
  useFocusEffect(
    useCallback(() => {
      if (!createdProcedureId) {
        setFormData({
          patient_name: '', registration_number: '', student_name: user?.name || '',
          supervisor_id: '', supervisor_name: '', implant_incharge_id: '', implant_incharge_name: '',
          receipt_number: '', amount_paid: '', procedure_date: '', procedure_time: '',
          implant_procedure_type: '', loading_type: [] as string[],
          prosthetic_plan: '', prosthetic_plan_other: '', bone_graft_specifications: '',
          edentulous_sites: [] as string[], arch_condition: '', ridge_contour: '',
          soft_tissue_thickness: '', keratinized_mucosa: '', occlusal_scheme: '',
          parafunction_habit: '', vertical_dimension: '', opposing_dentition: '',
          vertical_dimension_mm: '', tmj: '', smile_line: '', gingival_biotype: '',
          medical_assessment: {} as Record<string, string>, medical_risk_level: '',
        });
        setChecklistItems({});
        setStep('details');
        AsyncStorage.removeItem(FORM_STORAGE_KEY).catch(() => {});
      }
    }, [createdProcedureId, user?.name])
  );

  // ── Restore form ONLY when app returns from background, NOT on mount/focus ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // App came back from background — restore saved form data
        try {
          const saved = await AsyncStorage.getItem(FORM_STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.formData) setFormData(parsed.formData);
            if (parsed.checklistItems) setChecklistItems(parsed.checklistItems);
          }
        } catch { /* ignore */ }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // ── Save form to AsyncStorage when app goes to background ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        try {
          await AsyncStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ formData, checklistItems }));
        } catch { /* ignore */ }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [formData, checklistItems]);
  // ── Clear persisted form after successful submission ──
  const clearPersistedForm = async () => {
    try { await AsyncStorage.removeItem(FORM_STORAGE_KEY); } catch { /* ignore */ }
  };

  // ── Load faculty data ──
  useEffect(() => {
    const loadFaculty = async () => {
      try {
        const res = await axios.get(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
        const users = res.data || [];
        setSupervisors(users.filter((u: any) => u.role === 'supervisor' || u.role === 'implant_incharge'));
        setIncharges(users.filter((u: any) => u.role === 'implant_incharge'));
      } catch (e) { /* ignore */ }
    };
    loadFaculty();
  }, [token]);

  // Update medical risk when factors change
  useEffect(() => {
    if (Object.keys(formData.medical_assessment).length > 0) {
      const risk = calculateMedicalRisk(formData.medical_assessment);
      setFormData(prev => ({ ...prev, medical_risk_level: risk.level }));
    }
  }, [formData.medical_assessment]);

  const updateForm = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const toggleLoading = (val: string) => {
    setFormData(prev => {
      const types = prev.loading_type.includes(val)
        ? prev.loading_type.filter(t => t !== val)
        : [...prev.loading_type, val];
      return { ...prev, loading_type: types };
    });
  };

  const updateMedical = (key: string, val: string) => {
    setFormData(prev => ({
      ...prev,
      medical_assessment: { ...prev.medical_assessment, [key]: val },
    }));
  };

  // ── Continue to Implant Selection ──
  const handleContinueToImplants = async () => {
    // Sanitise all string fields before validation
    const sanitized = { ...formData };
    for (const key of Object.keys(sanitized) as (keyof typeof sanitized)[]) {
      const val = sanitized[key];
      if (typeof val === 'string') {
        (sanitized as any)[key] = sanitizeString(val);
      }
    }
    setFormData(sanitized);

    // Validate required fields
    const required = ['patient_name', 'registration_number', 'supervisor_id', 'implant_incharge_id',
      'receipt_number', 'amount_paid', 'procedure_date', 'procedure_time', 'implant_procedure_type'];
    for (const f of required) {
      if (!(sanitized as any)[f]) {
        Alert.alert('Missing Field', `Please fill in: ${f.replace(/_/g, ' ')}`);
        return;
      }
    }
    if (sanitized.loading_type.length === 0) {
      Alert.alert('Missing Field', 'Please select at least one loading type.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...sanitized,
        patient_name: sanitizeString(sanitized.patient_name),
        registration_number: sanitizeString(sanitized.registration_number),
        receipt_number: sanitizeString(sanitized.receipt_number),
        bone_graft_specifications: sanitizeString(sanitized.bone_graft_specifications),
        amount_paid: parseFloat(sanitized.amount_paid) || 0,
        checklist: {
          pre_surgical: {
            items: CHECKLIST_DATA.pre_surgical.items.map(item => ({
              id: item.id,
              label: item.label,
              value: checklistItems[item.id] || false,
            })),
            additional_fields: {},
          },
        },
        prosthetic_plan: sanitized.prosthetic_plan === 'Other'
          ? `Other: ${sanitizeString(sanitized.prosthetic_plan_other)}`
          : sanitized.prosthetic_plan,
      };

      const res = await axios.post(`${API}/api/procedures`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const procId = res.data.id || res.data._id;
      setCreatedProcedureId(procId);
      setStep('implants');
      await clearPersistedForm();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to create case');
    } finally {
      setLoading(false);
    }
  };

  // ── Render Step: Implant Selection ──
  if (step === 'implants' && createdProcedureId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={() => setStep('details')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1A73E8" />
          </TouchableOpacity>
          <Text style={styles.stepTitle}>Step 2: Implant Selection</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} nestedScrollEnabled={true}>
          <CaseImplantPlanning
            procedureId={createdProcedureId}
            procedureType={formData.implant_procedure_type}
            procedureStatus="draft"
            isOwner={true}
            userRole={user?.role || 'student'}
            readOnly={false}
            medicalAssessment={formData.medical_assessment}
          />
        </ScrollView>
        <View style={styles.submitContainer}>
          <TouchableOpacity style={styles.submitBtn} data-testid="submit-for-approval"
            onPress={() => {
              Alert.alert('Submit for Approval', 'Are you sure you want to submit this case?', [
                { text: 'Cancel' },
                {
                  text: 'Submit', onPress: async () => {
                    try {
                      await axios.put(`${API}/api/procedures/${createdProcedureId}`,
                        { status: 'pending_phase1' },
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      Alert.alert('Success', 'Case submitted for approval.');
                      router.replace('/(tabs)/dashboard');
                    } catch (e: any) {
                      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit');
                    }
                  }
                },
              ]);
            }}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>Submit for Approval</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render Step: Case Details ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1A73E8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Case - Phase 1</Text>
      </View>
      <Text style={styles.stepIndicator}>Step 1 of 2: Case Details</Text>

      {/* ─── Patient Info ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Information</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Patient Name <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.patient_name}
            onChangeText={v => updateForm('patient_name', v)} placeholder="Enter patient name"
            autoCorrect={false} autoCapitalize="none" data-testid="patient-name-input" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Registration Number <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.registration_number}
            onChangeText={v => updateForm('registration_number', v)} placeholder="Enter registration number" data-testid="registration-number-input" />
        </View>
        {user?.role === 'student' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Name of Postgraduate Student</Text>
            <TextInput style={[styles.input, { backgroundColor: '#F0F0F0' }]} value={formData.student_name} editable={false} />
          </View>
        )}
      </View>

      {/* ─── Faculty Selection ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Faculty Assignment</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Supervising Faculty <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowSupervisorPicker(!showSupervisorPicker)}>
            <Text style={[styles.dropdownText, !formData.supervisor_name && { color: '#999' }]}>
              {formData.supervisor_name || 'Select Supervisor'}
            </Text>
            <Ionicons name={showSupervisorPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
          </TouchableOpacity>
          {showSupervisorPicker && (
            <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
              {supervisors.map(s => (
                <TouchableOpacity key={s._id || s.id} style={styles.dropdownItem}
                  onPress={() => {
                    updateForm('supervisor_id', s._id || s.id);
                    updateForm('supervisor_name', s.name);
                    setShowSupervisorPicker(false);
                  }}>
                  <Text style={styles.dropdownItemText}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Implant In-Charge <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowInchargePicker(!showInchargePicker)}>
            <Text style={[styles.dropdownText, !formData.implant_incharge_name && { color: '#999' }]}>
              {formData.implant_incharge_name || 'Select Implant In-Charge'}
            </Text>
            <Ionicons name={showInchargePicker ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
          </TouchableOpacity>
          {showInchargePicker && (
            <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
              {incharges.map(s => (
                <TouchableOpacity key={s._id || s.id} style={styles.dropdownItem}
                  onPress={() => {
                    updateForm('implant_incharge_id', s._id || s.id);
                    updateForm('implant_incharge_name', s.name);
                    setShowInchargePicker(false);
                  }}>
                  <Text style={styles.dropdownItemText}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* ─── Payment Details ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Details</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Receipt Number <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.receipt_number}
            onChangeText={v => updateForm('receipt_number', v)} placeholder="Enter receipt number" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Amount Paid <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.amount_paid} keyboardType="numeric"
            onChangeText={v => updateForm('amount_paid', v)} placeholder="Enter amount" />
        </View>
      </View>

      {/* ─── Procedure Type ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Procedure Information</Text>
        <Dropdown label="Type of Implant Procedure" value={formData.implant_procedure_type}
          options={PROCEDURE_TYPES} onChange={v => updateForm('implant_procedure_type', v)} required />
      </View>

      {/* ─── Clinical Examination ─── */}
      {formData.implant_procedure_type && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinical Examination</Text>

          {/* Intraoral Examination – Non-Full-Arch (Single, Multiple, GBR, Guided Surgery) */}
          {isClinicalExamGroup && (
            <>
              <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
              <MultiSelectDropdown label="Edentulous Site" values={formData.edentulous_sites}
                options={EDENTULOUS_SITE_OPTIONS} onChange={v => updateForm('edentulous_sites', v)} />
              <Dropdown label="Ridge Contour" value={formData.ridge_contour}
                options={RIDGE_CONTOUR_OPTIONS} onChange={v => updateForm('ridge_contour', v)} />
              <Dropdown label="Soft Tissue Thickness" value={formData.soft_tissue_thickness}
                options={SOFT_TISSUE_OPTIONS} onChange={v => updateForm('soft_tissue_thickness', v)} />
              <Dropdown label="Keratinized Mucosa" value={formData.keratinized_mucosa}
                options={KERATINIZED_MUCOSA_OPTIONS} onChange={v => updateForm('keratinized_mucosa', v)} />
            </>
          )}

          {/* Intraoral Examination – Full-Arch (All on 4/6/X) */}
          {isFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
              <Dropdown label="Mandibular/Maxillary Arch Condition" value={formData.arch_condition}
                options={ARCH_CONDITION_OPTIONS} onChange={v => updateForm('arch_condition', v)} />
              <Dropdown label="Ridge Contour" value={formData.ridge_contour}
                options={RIDGE_CONTOUR_OPTIONS} onChange={v => updateForm('ridge_contour', v)} />
              <Dropdown label="Soft Tissue Thickness" value={formData.soft_tissue_thickness}
                options={SOFT_TISSUE_OPTIONS} onChange={v => updateForm('soft_tissue_thickness', v)} />
              <Dropdown label="Keratinized Mucosa" value={formData.keratinized_mucosa}
                options={KERATINIZED_MUCOSA_OPTIONS} onChange={v => updateForm('keratinized_mucosa', v)} />
            </>
          )}

          {/* Occlusal Analysis – Non-Full-Arch */}
          {isNonFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Occlusal Analysis</Text>
              <Dropdown label="Occlusal Scheme" value={formData.occlusal_scheme}
                options={OCCLUSAL_SCHEME_OPTIONS} onChange={v => updateForm('occlusal_scheme', v)} />
              <Dropdown label="Parafunction Habit" value={formData.parafunction_habit}
                options={PARAFUNCTION_HABIT_OPTIONS} onChange={v => updateForm('parafunction_habit', v)} />
              <Dropdown label="Vertical Dimension" value={formData.vertical_dimension}
                options={VERTICAL_DIMENSION_OPTIONS} onChange={v => updateForm('vertical_dimension', v)} />
              <Dropdown label="Opposing Dentition" value={formData.opposing_dentition}
                options={OPPOSING_DENTITION_OPTIONS} onChange={v => updateForm('opposing_dentition', v)} />
            </>
          )}

          {/* Occlusal Analysis – Full Arch */}
          {isFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Occlusal Analysis</Text>
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Vertical Dimension (mm)</Text>
                <TextInput style={styles.input} value={formData.vertical_dimension_mm} keyboardType="numeric"
                  onChangeText={v => updateForm('vertical_dimension_mm', v)} placeholder="Enter in mm" />
              </View>
              <Dropdown label="Temporomandibular Joint" value={formData.tmj}
                options={TMJ_OPTIONS} onChange={v => updateForm('tmj', v)} />
            </>
          )}

          {/* Aesthetic Risk Assessment – Non-Full-Arch */}
          {isNonFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Aesthetic Risk Assessment</Text>
              <Dropdown label="Smile Line" value={formData.smile_line}
                options={SMILE_LINE_OPTIONS} onChange={v => updateForm('smile_line', v)} />
              <Dropdown label="Gingival Biotype" value={formData.gingival_biotype}
                options={GINGIVAL_BIOTYPE_OPTIONS} onChange={v => updateForm('gingival_biotype', v)} />
            </>
          )}
        </View>
      )}

      {/* ─── Schedule ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <CalendarPicker
          label="Procedure Date"
          value={formData.procedure_date}
          onChange={(date) => {
            updateForm('procedure_date', date);
            updateForm('procedure_time', ''); // reset time when date changes
          }}
          required
        />
        {formData.procedure_date && (() => {
          const d = new Date(formData.procedure_date + 'T00:00:00');
          const dayOfWeek = d.getDay(); // 0=Sun
          if (dayOfWeek === 0) {
            return (
              <View style={[styles.riskBadge, { backgroundColor: '#FFF3E0' }]}>
                <Text style={{ color: '#E65100', fontWeight: '600', fontSize: 13 }}>
                  No procedure slots available on Sundays
                </Text>
              </View>
            );
          }
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayName = dayNames[dayOfWeek];
          const availableSlots = PROCEDURE_TIME_SLOTS.filter(s => s.days.includes(dayName));
          return (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Time Slot <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <View style={styles.chipRow}>
                {availableSlots.map(slot => (
                  <TouchableOpacity key={slot.value}
                    style={[styles.chip, formData.procedure_time === slot.value && styles.chipActive]}
                    onPress={() => updateForm('procedure_time', slot.value)}>
                    <Text style={[styles.chipText, formData.procedure_time === slot.value && styles.chipTextActive]}>
                      {slot.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}
      </View>

      {/* ─── Loading Type ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Type of Loading <Text style={{ color: '#DC3545' }}>*</Text></Text>
        <View style={styles.chipRow}>
          {LOADING_TYPES.map(lt => (
            <TouchableOpacity key={lt}
              style={[styles.chip, formData.loading_type.includes(lt) && styles.chipActive]}
              onPress={() => toggleLoading(lt)}>
              <Text style={[styles.chipText, formData.loading_type.includes(lt) && styles.chipTextActive]}>
                {lt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Prosthetic Treatment Plan ─── */}
      {prostheticOptions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <Dropdown label="Prosthetic Plan" value={formData.prosthetic_plan}
            options={prostheticOptions} onChange={v => updateForm('prosthetic_plan', v)} />
          {formData.prosthetic_plan === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthetic Plan</Text>
              <TextInput style={styles.input} value={formData.prosthetic_plan_other}
                onChangeText={v => updateForm('prosthetic_plan_other', v)}
                placeholder="Enter custom prosthetic plan" multiline />
            </View>
          )}
        </View>
      )}

      {/* ─── Phase 1 Checklist ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phase 1 Checklist</Text>
        {CHECKLIST_DATA.pre_surgical.items.filter(item => item.id !== 'medical_assessment').map(item => (
          <TouchableOpacity key={item.id} style={styles.checklistRow}
            onPress={() => setChecklistItems(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>
            <Ionicons name={checklistItems[item.id] ? 'checkbox' : 'square-outline'}
              size={22} color={checklistItems[item.id] ? '#1A73E8' : '#999'} />
            <Text style={styles.checklistLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* ─── Medical Assessment Sub-section ─── */}
        <View style={styles.medicalSection}>
          <Text style={styles.subSectionTitle}>Medical Assessment</Text>
          {MEDICAL_RISK_FACTORS.map(factor => (
            <View key={factor.id} style={styles.medicalRow}>
              <Text style={styles.medicalLabel}>{factor.label}</Text>
              <View style={styles.yesNoRow}>
                {['Yes', 'No'].map(opt => (
                  <TouchableOpacity key={opt}
                    style={[styles.yesNoBtn, formData.medical_assessment[factor.id] === opt && (opt === 'Yes' ? styles.yesActive : styles.noActive)]}
                    onPress={() => updateMedical(factor.id, opt)}>
                    <Text style={[styles.yesNoText, formData.medical_assessment[factor.id] === opt && styles.yesNoTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Auto Risk Classification */}
          {Object.keys(formData.medical_assessment).length > 0 && (
            <View style={[styles.riskBadge, { backgroundColor: calculateMedicalRisk(formData.medical_assessment).color + '18' }]}>
              <Text style={[styles.riskBadgeText, { color: calculateMedicalRisk(formData.medical_assessment).color }]}>
                Medical Risk: {calculateMedicalRisk(formData.medical_assessment).level}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── Bone Graft (if applicable) ─── */}
      {formData.implant_procedure_type.includes('Bone') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bone Graft Specifications</Text>
          <TextInput style={[styles.input, { minHeight: 60 }]} value={formData.bone_graft_specifications}
            onChangeText={v => updateForm('bone_graft_specifications', v)}
            placeholder="Enter bone graft details" multiline />
        </View>
      )}

      {/* ─── Continue Button ─── */}
      <TouchableOpacity style={styles.continueBtn} onPress={handleContinueToImplants}
        disabled={loading} data-testid="continue-to-implants">
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.continueBtnText}>Continue to Implant Selection</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginLeft: 12 },
  backBtn: { padding: 6 },
  stepIndicator: { fontSize: 13, color: '#1A73E8', fontWeight: '600', marginLeft: 54, marginBottom: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginLeft: 12 },
  section: { backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 12 },
  subSectionTitle: { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  fieldContainer: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#FAFAFA' },
  dropdown: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' },
  dropdownText: { fontSize: 15, color: '#333', flex: 1 },
  dropdownList: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, marginTop: 4, backgroundColor: '#FFF', maxHeight: 250, overflow: 'hidden' },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  dropdownItemActive: { backgroundColor: '#E8F0FE' },
  dropdownItemText: { fontSize: 14, color: '#333' },
  dropdownItemTextActive: { color: '#1A73E8', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#FAFAFA' },
  chipActive: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checklistLabel: { fontSize: 14, color: '#333', marginLeft: 10, flex: 1 },
  medicalSection: { marginTop: 16, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 8 },
  medicalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E8E8E8' },
  medicalLabel: { fontSize: 14, color: '#333', flex: 1 },
  yesNoRow: { flexDirection: 'row', gap: 8 },
  yesNoBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#FFF' },
  yesActive: { backgroundColor: '#DC3545', borderColor: '#DC3545' },
  noActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  yesNoText: { fontSize: 13, color: '#666', fontWeight: '500' },
  yesNoTextActive: { color: '#FFF' },
  riskBadge: { marginTop: 12, padding: 10, borderRadius: 8, alignItems: 'center' },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },
  continueBtn: { flexDirection: 'row', backgroundColor: '#1A73E8', borderRadius: 12, padding: 16, marginHorizontal: 16, marginVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  continueBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  submitContainer: { padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
