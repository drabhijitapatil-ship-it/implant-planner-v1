import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, AppState, Linking, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getAuthFileUrl, getToken } from '../../utils/api';
import { showUploadPicker } from '../../utils/uploadPicker';
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
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const [step, setStep] = useState<'details' | 'implants'>('details');
  const [loading, setLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [incharges, setIncharges] = useState<any[]>([]);
  const [createdProcedureId, setCreatedProcedureId] = useState<string | null>(null);
  const [isDraftResume, setIsDraftResume] = useState(false);

  // ── Form State ──
  const [formData, setFormData] = useState({
    patient_name: '',
    age: '',
    sex: '',
    profession: '',
    mobile_number: '',
    patient_email: '',
    registration_number: '',
    chief_complaint: '',
    student_name: user?.name || '',
    supervisor_id: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.id || '') : '',
    supervisor_name: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.name || '') : '',
    implant_incharge_id: user?.role === 'implant_incharge' ? (user?.id || '') : '',
    implant_incharge_name: user?.role === 'implant_incharge' ? (user?.name || '') : '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: '',
    procedure_time: '',
    implant_procedure_type: '',
    arch: '',
    loading_type: [] as string[],
    prosthetic_plan: '',
    prosthetic_plan_other: '',
    bone_graft_specifications: '',
    // Clinical Examination
    occlusocervical_height: '',
    mesiodistal_space: '',
    arch_condition: '',
    ridge_contour: '',
    soft_tissue_thickness: '',
    keratinized_mucosa: '',
    periodontal_status: '',
    // Occlusal Analysis (non-full-arch)
    occlusal_scheme: '',
    parafunction_habit: '',
    vertical_dimension: '',
    opposing_dentition: '',
    // Occlusal Analysis (full-arch)
    vertical_dimension_mm: '',
    available_interarch_space: '',
    opposing_arch: '',
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
  // If draftId param is present, load that draft and jump to Step 2
  useFocusEffect(
    useCallback(() => {
      if (params.draftId) {
        // Resuming a draft — load ALL data and jump to implant selection
        const loadDraft = async () => {
          try {
            const res = await api.get(`/procedures/${params.draftId}`);
            const proc = res.data;
            if (proc.status === 'draft') {
              setCreatedProcedureId(params.draftId!);
              setIsDraftResume(true);
              setFormData(prev => ({
                ...prev,
                patient_name: proc.patient_name || '',
                age: proc.age || '',
                sex: proc.sex || '',
                profession: proc.profession || '',
                mobile_number: proc.mobile_number || '',
                patient_email: proc.patient_email || '',
                registration_number: proc.registration_number || '',
                chief_complaint: proc.chief_complaint || '',
                student_name: proc.student_name || prev.student_name || '',
                supervisor_id: proc.supervisor_id || '',
                supervisor_name: proc.supervisor_name || '',
                implant_incharge_id: proc.implant_incharge_id || '',
                implant_incharge_name: proc.implant_incharge_name || '',
                receipt_number: proc.receipt_number || '',
                amount_paid: proc.amount_paid != null ? String(proc.amount_paid) : '',
                procedure_date: proc.procedure_date || '',
                procedure_time: proc.procedure_time || '',
                implant_procedure_type: proc.implant_procedure_type || '',
                arch: proc.arch || '',
                loading_type: Array.isArray(proc.loading_type) ? proc.loading_type : [],
                prosthetic_plan: proc.prosthetic_plan || '',
                prosthetic_plan_other: proc.prosthetic_plan_other || '',
                bone_graft_specifications: proc.bone_graft_specifications || '',
                // Clinical Examination
                occlusocervical_height: proc.occlusocervical_height || '',
                mesiodistal_space: proc.mesiodistal_space || '',
                arch_condition: proc.arch_condition || '',
                ridge_contour: proc.ridge_contour || '',
                soft_tissue_thickness: proc.soft_tissue_thickness || '',
                keratinized_mucosa: proc.keratinized_mucosa || '',
                periodontal_status: proc.periodontal_status || '',
                // Occlusal Analysis (non-full-arch)
                occlusal_scheme: proc.occlusal_scheme || '',
                parafunction_habit: proc.parafunction_habit || '',
                vertical_dimension: proc.vertical_dimension || '',
                opposing_dentition: proc.opposing_dentition || '',
                // Occlusal Analysis (full-arch)
                vertical_dimension_mm: proc.vertical_dimension_mm || '',
                available_interarch_space: proc.available_interarch_space || '',
                opposing_arch: proc.opposing_arch || '',
                tmj: proc.tmj || '',
                // Aesthetic Risk Assessment
                smile_line: proc.smile_line || '',
                gingival_biotype: proc.gingival_biotype || '',
                // Medical Assessment
                medical_assessment: proc.medical_assessment || prev.medical_assessment,
                medical_risk_level: proc.medical_risk_level || '',
              }));
              // Restore checklist items if saved
              if (proc.checklist?.pre_surgical?.items) {
                const restored: Record<string, boolean> = {};
                proc.checklist.pre_surgical.items.forEach((item: any) => {
                  if (item.id && item.value) restored[item.id] = true;
                });
                setChecklistItems(restored);
              }
              setStep('implants');
            }
          } catch { /* ignore — draft may have been deleted */ }
        };
        loadDraft();
      } else if (!createdProcedureId) {
        setFormData({
          patient_name: '', age: '', sex: '', profession: '', mobile_number: '', patient_email: '',
          registration_number: '', chief_complaint: '', student_name: user?.name || '',
          supervisor_id: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.id || '') : '',
          supervisor_name: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.name || '') : '',
          implant_incharge_id: user?.role === 'implant_incharge' ? (user?.id || '') : '',
          implant_incharge_name: user?.role === 'implant_incharge' ? (user?.name || '') : '',
          receipt_number: '', amount_paid: '', procedure_date: '', procedure_time: '',
          implant_procedure_type: '', arch: '', loading_type: [] as string[],
          prosthetic_plan: '', prosthetic_plan_other: '', bone_graft_specifications: '',
          edentulous_sites: [] as string[], occlusocervical_height: '', mesiodistal_space: '',
          arch_condition: '', ridge_contour: '',
          soft_tissue_thickness: '', keratinized_mucosa: '', periodontal_status: '', occlusal_scheme: '',
          parafunction_habit: '', vertical_dimension: '', opposing_dentition: '',
          vertical_dimension_mm: '', available_interarch_space: '', opposing_arch: '', tmj: '', smile_line: '', gingival_biotype: '',
          medical_assessment: {} as Record<string, string>, medical_risk_level: '',
        });
        setChecklistItems({});
        setCbctFiles([null, null]);
        setExtraCbctCount(0);
        setStep('details');
        AsyncStorage.removeItem(FORM_STORAGE_KEY).catch(() => {});
      }
    }, [params.draftId, createdProcedureId, user?.name])
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
  const [bookedSlots, setBookedSlots] = useState<Record<string, { patient_name: string; scheduled_by: string }>>({});
  const [cbctFiles, setCbctFiles] = useState<(null | { filename: string; original_name: string; content_type: string })[]>([null, null]);
  const [cbctUploadingIdx, setCbctUploadingIdx] = useState<number | null>(null);
  const [extraCbctCount, setExtraCbctCount] = useState(0);
  const [authToken, setAuthToken] = useState('');

  useEffect(() => { getToken('access_token').then(t => setAuthToken(t || '')); }, []);

  useEffect(() => {
    const loadFaculty = async () => {
      try {
        const res = await api.get('/users');
        const users = res.data || [];
        setSupervisors(users.filter((u: any) => u.role === 'supervisor' || u.role === 'implant_incharge'));
        setIncharges(users.filter((u: any) => u.role === 'implant_incharge'));
      } catch (e) { /* ignore */ }
    };
    loadFaculty();
  }, []);

  // Fetch booked slots when procedure_date changes
  useEffect(() => {
    if (!formData.procedure_date) { setBookedSlots({}); return; }
    const fetchSlots = async () => {
      try {
        const res = await api.get(`/procedures/slots/${formData.procedure_date}`);
        setBookedSlots(res.data?.booked_slots || {});
      } catch { setBookedSlots({}); }
    };
    fetchSlots();
  }, [formData.procedure_date]);

  // Update medical risk and auto-mark checklist when factors change
  useEffect(() => {
    if (Object.keys(formData.medical_assessment).length > 0) {
      const risk = calculateMedicalRisk(formData.medical_assessment);
      setFormData(prev => ({ ...prev, medical_risk_level: risk.level }));
      setChecklistItems(prev => ({ ...prev, medical_assessment: true }));
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

  // ── CBCT File Picker & Upload (Multiple) ──
  const totalCbctSlots = 2 + extraCbctCount;

  const pickCbctFileAtIndex = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setCbctUploadingIdx(idx);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri,
        name: picked.name || 'cbct_report.pdf',
        type: picked.type || 'application/pdf',
      } as any);
      const res = await api.post('/uploads/cbct-temp', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = [...cbctFiles];
      while (updated.length <= idx) updated.push(null);
      updated[idx] = {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        content_type: res.data.cbct_content_type,
      };
      setCbctFiles(updated);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload CBCT file');
    } finally {
      setCbctUploadingIdx(null);
    }
  };

  const addExtraCbct = () => {
    setExtraCbctCount(prev => prev + 1);
    setCbctFiles(prev => [...prev, null]);
  };
  const removeExtraCbct = (idx: number) => {
    const updated = [...cbctFiles];
    updated.splice(idx, 1);
    setCbctFiles(updated);
    setExtraCbctCount(prev => Math.max(0, prev - 1));
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
    const required = ['patient_name', 'age', 'sex', 'profession', 'mobile_number', 'chief_complaint',
      'registration_number', 'supervisor_id', 'implant_incharge_id',
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
    if (!sanitized.periodontal_status && (
      sanitized.implant_procedure_type === 'Single Conventional Implant' ||
      sanitized.implant_procedure_type === 'Multiple Conventional Implants' ||
      sanitized.implant_procedure_type === 'Immediate Implant' ||
      sanitized.implant_procedure_type === 'Partial Extraction Therapy' ||
      sanitized.implant_procedure_type === 'Implant Placement with Guided Bone Regeneration' ||
      sanitized.implant_procedure_type === 'Guided Surgery'
    )) {
      Alert.alert('Missing Field', 'Please select Periodontal Status.');
      return;
    }
    if (!cbctFiles[0] || !cbctFiles[1]) {
      Alert.alert('Missing Field', 'Please upload both mandatory CBCT Reports before continuing.');
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
        ...(cbctFiles.filter(f => f !== null).length > 0 ? {
          cbct_files: cbctFiles.filter(f => f !== null).map(f => ({
            filename: f!.filename,
            original_name: f!.original_name,
            content_type: f!.content_type,
          })),
          cbct_file: cbctFiles[0]?.filename || '',
          cbct_original_name: cbctFiles[0]?.original_name || '',
          cbct_content_type: cbctFiles[0]?.content_type || '',
        } : {}),
      };

      const res = await api.post('/procedures', payload);

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
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }} data-testid="step2-implant-selection-view">
        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={() => { setStep('details'); setIsDraftResume(false); }} style={styles.backBtn} data-testid="step2-back-btn">
            <Ionicons name="arrow-back" size={22} color="#1A73E8" />
          </TouchableOpacity>
          <Text style={styles.stepTitle}>Step 2: Implant Selection</Text>
          <TouchableOpacity
            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 4 }}
            onPress={() => {
              Alert.alert('Delete Draft', 'Are you sure you want to delete this draft case?', [
                { text: 'Cancel' },
                {
                  text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                      await api.delete(`/procedures/${createdProcedureId}`);
                      setCreatedProcedureId(null);
                      setIsDraftResume(false);
                      setStep('details');
                      router.replace('/(tabs)/dashboard');
                    } catch (e: any) {
                      Alert.alert('Error', e.response?.data?.detail || 'Failed to delete');
                    }
                  }
                },
              ]);
            }}
            data-testid="delete-draft-btn"
          >
            <Ionicons name="trash-outline" size={16} color="#D32F2F" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#D32F2F' }}>Delete</Text>
          </TouchableOpacity>
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
                      await api.put(`/procedures/${createdProcedureId}`,
                        { status: 'pending_phase1' }
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
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={[styles.fieldContainer, { flex: 1 }]}>
            <Text style={styles.label}>Age (years) <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <TextInput style={styles.input} value={formData.age}
              onChangeText={v => updateForm('age', v.replace(/[^0-9]/g, ''))} placeholder="e.g. 45"
              keyboardType="numeric" maxLength={3} data-testid="age-input" />
          </View>
          <View style={[styles.fieldContainer, { flex: 1 }]}>
            <Text style={styles.label}>Sex <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {['Male', 'Female'].map(opt => (
                <TouchableOpacity key={opt}
                  style={[styles.dropdown, { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: formData.sex === opt ? '#1A73E8' : '#FFF' }]}
                  onPress={() => updateForm('sex', opt)} data-testid={`sex-${opt.toLowerCase()}-btn`}>
                  <Text style={{ color: formData.sex === opt ? '#FFF' : '#333', fontWeight: formData.sex === opt ? '700' : '400', fontSize: 13 }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Profession <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.profession}
            onChangeText={v => updateForm('profession', v)} placeholder="Enter profession"
            data-testid="profession-input" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Mobile Number <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput style={styles.input} value={formData.mobile_number}
            onChangeText={v => updateForm('mobile_number', v.replace(/[^0-9+\-\s]/g, ''))} placeholder="Enter mobile number"
            keyboardType="phone-pad" maxLength={15} data-testid="mobile-number-input" />
        </View>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={formData.patient_email}
            onChangeText={v => updateForm('patient_email', v)} placeholder="Enter email address"
            keyboardType="email-address" autoCapitalize="none" data-testid="patient-email-input" />
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

      {/* ─── Chief Complaint ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Chief Complaint</Text>
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Chief Complaint <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 10 }]}
            value={formData.chief_complaint}
            onChangeText={v => {
              const words = v.trim().split(/\s+/).filter(Boolean);
              if (words.length <= 100) updateForm('chief_complaint', v);
            }}
            placeholder="Describe the patient's chief complaint (50-100 words)"
            multiline numberOfLines={4} maxLength={700}
            data-testid="chief-complaint-input"
          />
          <Text style={{ fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' }}>
            {formData.chief_complaint.trim().split(/\s+/).filter(Boolean).length}/100 words
          </Text>
        </View>
      </View>

      {/* ─── Faculty Selection ─── */}
      {user?.role === 'implant_incharge' ? null : (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Faculty Assignment</Text>
        {user?.role === 'student' && (
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
        )}
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
      )}

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
          options={PROCEDURE_TYPES} onChange={v => { updateForm('implant_procedure_type', v); updateForm('arch', ''); }} required />
        {isFullArch && (
          <Dropdown label="Arch" value={formData.arch}
            options={['Maxillary', 'Mandibular']} onChange={v => updateForm('arch', v)} required data-testid="arch-dropdown" />
        )}
      </View>

      {/* ─── Clinical Examination ─── */}
      {formData.implant_procedure_type && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinical Examination</Text>

          {/* Intraoral Examination – Non-Full-Arch (Single, Multiple, GBR, Guided Surgery) */}
          {isClinicalExamGroup && (
            <>
              <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
              <Text style={[styles.subSectionTitle, { fontSize: 14, color: '#1565C0', marginTop: 4 }]}>Edentulous Site</Text>
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 4 }}>Occlusocervical Height (mm) <Text style={{ color: '#DC3545' }}>*</Text></Text>
                <TextInput
                  style={[styles.input, { borderColor: '#1565C0' }]}
                  placeholder="e.g. 12"
                  keyboardType="decimal-pad"
                  maxLength={5}
                  value={formData.occlusocervical_height}
                  onChangeText={v => updateForm('occlusocervical_height', v)}
                  data-testid="occlusocervical-height-input"
                />
              </View>
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 4 }}>Mesiodistal Space (mm) *</Text>
                <TextInput
                  style={[styles.input, { borderColor: '#1565C0' }]}
                  placeholder="e.g. 15"
                  keyboardType="decimal-pad"
                  maxLength={5}
                  value={formData.mesiodistal_space}
                  onChangeText={v => updateForm('mesiodistal_space', v)}
                  data-testid="mesiodistal-space-input"
                />
              </View>
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
              <Dropdown label={formData.arch === 'Maxillary' ? 'Maxillary Arch Condition' : formData.arch === 'Mandibular' ? 'Mandibular Arch Condition' : 'Arch Condition'}
                value={formData.arch_condition}
                options={ARCH_CONDITION_OPTIONS} onChange={v => updateForm('arch_condition', v)} />
              <Dropdown label="Ridge Contour" value={formData.ridge_contour}
                options={RIDGE_CONTOUR_OPTIONS} onChange={v => updateForm('ridge_contour', v)} />
              <Dropdown label="Soft Tissue Thickness" value={formData.soft_tissue_thickness}
                options={SOFT_TISSUE_OPTIONS} onChange={v => updateForm('soft_tissue_thickness', v)} />
              <Dropdown label="Keratinized Mucosa" value={formData.keratinized_mucosa}
                options={KERATINIZED_MUCOSA_OPTIONS} onChange={v => updateForm('keratinized_mucosa', v)} />
            </>
          )}

          {/* Periodontal Status – shown for specific procedure types */}
          {(formData.implant_procedure_type === 'Single Conventional Implant' ||
            formData.implant_procedure_type === 'Multiple Conventional Implants' ||
            formData.implant_procedure_type === 'Immediate Implant' ||
            formData.implant_procedure_type === 'Partial Extraction Therapy' ||
            formData.implant_procedure_type === 'Implant Placement with Guided Bone Regeneration' ||
            formData.implant_procedure_type === 'Guided Surgery') && (
          <>
          <Text style={[styles.subSectionTitle, { fontSize: 14, color: '#1565C0', marginTop: 8 }]}>Periodontal Status</Text>
          <View style={styles.fieldContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1565C0' }}>Select Status <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Periodontal Status Assessment',
                  'Check for the following factors:\n\n' +
                  '\u2022 History of untreated periodontal conditions\n' +
                  '\u2022 Pocket probing depth around remaining natural teeth\n' +
                  '\u2022 Bleeding on probing\n' +
                  '\u2022 Plaque control and oral hygiene status\n' +
                  '\u2022 Tooth mobility\n' +
                  '\u2022 Furcation involvement in molars'
                )}
                data-testid="periodontal-status-info-btn"
              >
                <Ionicons name="information-circle" size={20} color="#1565C0" />
              </TouchableOpacity>
            </View>
            <Dropdown label="" value={formData.periodontal_status}
              options={['Good', 'Fair', 'Poor']} onChange={v => updateForm('periodontal_status', v)}
              placeholder="Select periodontal status" />
          </View>
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
              <Dropdown label="Opposing Dentition" value={formData.opposing_dentition}
                options={['Natural Dentition', 'Fixed Partial Denture', 'Fixed Implant Prosthesis', 'Removable Prosthesis', 'Edentulous']}
                onChange={v => updateForm('opposing_dentition', v)} />
            </>
          )}

          {/* Occlusal Analysis – Full Arch */}
          {isFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Occlusal Analysis</Text>
              <View style={styles.fieldContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={styles.label}>
                    {formData.arch === 'Maxillary' ? 'Maxillary Restorative Space (mm)' : formData.arch === 'Mandibular' ? 'Mandibular Restorative Space (mm)' : 'Restorative Space (mm)'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Info', 'Residual alveolar ridge to opposing occlusal table')}
                    data-testid="restorative-space-info-btn"
                  >
                    <Ionicons name="information-circle" size={20} color="#1565C0" />
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.input} value={formData.available_interarch_space} keyboardType="decimal-pad"
                  onChangeText={v => updateForm('available_interarch_space', v)} placeholder="Enter in mm" data-testid="restorative-space-input" />
              </View>
              <Dropdown label="Opposing Arch" value={formData.opposing_arch}
                options={['Natural Dentition', 'Fixed Partial Denture', 'Fixed Implant Prosthesis', 'Removable Prosthesis', 'Edentulous']}
                onChange={v => updateForm('opposing_arch', v)} />
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
                {availableSlots.map(slot => {
                  const booked = bookedSlots[slot.value];
                  const isBooked = !!booked;
                  const isSelected = formData.procedure_time === slot.value;
                  return (
                    <View key={slot.value}>
                      <TouchableOpacity
                        style={[styles.chip, isSelected && styles.chipActive, isBooked && styles.chipBooked]}
                        onPress={() => !isBooked && updateForm('procedure_time', slot.value)}
                        disabled={isBooked}
                        data-testid={`slot-${slot.value}`}>
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive, isBooked && styles.chipBookedText]}>
                          {slot.label}
                        </Text>
                        {isBooked && <Ionicons name="lock-closed" size={12} color="#999" style={{ marginLeft: 4 }} />}
                      </TouchableOpacity>
                      {isBooked && (
                        <Text style={styles.bookedInfo} numberOfLines={1}>
                          {booked.patient_name} ({booked.scheduled_by})
                        </Text>
                      )}
                    </View>
                  );
                })}
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

      {/* ─── CBCT Report Upload (Mandatory: 2 minimum) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CBCT Report <Text style={{ color: '#DC3545' }}>*</Text></Text>
        {cbctFiles.map((file, idx) => {
          const isExtra = idx >= 2;
          const baseUrl = api.defaults.baseURL || '';
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} data-testid={`cbct-slot-${idx}`}>
              <View style={{ width: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#555' }}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {file ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                      <Image source={{ uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}`, headers: { Authorization: `Bearer ${authToken}` } }}
                        style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="cover" />
                    ) : (
                      <Ionicons name="document-attach" size={22} color="#4CAF50" />
                    )}
                    <TouchableOpacity
                      style={styles.cbctViewBtn}
                      onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                      data-testid={`view-cbct-${idx}`}
                    >
                      <Text style={styles.cbctViewBtnText} numberOfLines={1}>View CBCT Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { const u = [...cbctFiles]; u[idx] = null; setCbctFiles(u); }}
                      data-testid={`remove-cbct-${idx}`}>
                      <Ionicons name="close-circle" size={22} color="#E53935" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.cbctUploadBtn}
                    onPress={() => pickCbctFileAtIndex(idx)} disabled={cbctUploadingIdx === idx}
                    data-testid={`upload-cbct-${idx}`}
                  >
                    {cbctUploadingIdx === idx ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={18} color="#FFF" />
                        <Text style={styles.cbctUploadBtnText}>Upload CBCT Report</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {isExtra && (
                <TouchableOpacity onPress={() => removeExtraCbct(idx)} data-testid={`remove-extra-cbct-${idx}`}>
                  <Ionicons name="remove-circle" size={26} color="#E53935" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
          onPress={addExtraCbct} data-testid="add-extra-cbct-btn">
          <Ionicons name="add-circle" size={26} color="#4CAF50" />
          <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add CBCT Report</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          Minimum 2 CBCT Reports required. Accepted: PDF, PNG, JPG, HEIC (Max 25MB each)
        </Text>
      </View>

      {/* ─── Phase 1 Checklist ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Phase 1 Checklist</Text>
        {CHECKLIST_DATA.pre_surgical.items.filter(item => item.id !== 'medical_assessment').filter(item => !(isFullArch && item.id === 'oral_prophylaxis')).map(item => (
          <View key={item.id} style={styles.checklistRow}>
            <Text style={[styles.checklistLabel, { flex: 1 }]}>{item.label} <Text style={{ color: '#DC3545' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['Yes', 'No'].map(opt => (
                <TouchableOpacity key={opt}
                  style={[styles.yesNoBtn, checklistItems[item.id] === true && opt === 'Yes' && styles.yesActive, checklistItems[item.id] === false && opt === 'No' && styles.noActive]}
                  onPress={() => setChecklistItems(prev => ({ ...prev, [item.id]: opt === 'Yes' }))}>
                  <Text style={[styles.yesNoText, (checklistItems[item.id] === true && opt === 'Yes') || (checklistItems[item.id] === false && opt === 'No') ? styles.yesNoTextActive : {}]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* ─── Medical Assessment Sub-section ─── */}
        <View style={styles.medicalSection}>
          <Text style={styles.subSectionTitle}>Medical Assessment</Text>
          {MEDICAL_RISK_FACTORS.map(factor => (
            <View key={factor.id} style={styles.medicalRow}>
              <Text style={styles.medicalLabel}>{factor.label}</Text>
              <View style={styles.yesNoRow}>
                {factor.options.map(opt => (
                  <TouchableOpacity key={opt}
                    style={[styles.yesNoBtn, formData.medical_assessment[factor.id] === opt && (opt === 'No' ? styles.noActive : styles.yesActive)]}
                    onPress={() => updateMedical(factor.id, opt)}>
                    <Text style={[styles.yesNoText, formData.medical_assessment[factor.id] === opt && styles.yesNoTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Auto Risk Classification with warnings */}
          {Object.keys(formData.medical_assessment).length > 0 && (() => {
            const risk = calculateMedicalRisk(formData.medical_assessment);
            return (
              <View>
                <View style={[styles.riskBadge, { backgroundColor: risk.color + '18' }]}>
                  <Text style={[styles.riskBadgeText, { color: risk.color }]}>
                    Medical Risk: {risk.level} (Score: {risk.score}/15)
                  </Text>
                </View>
                {risk.warnings.length > 0 && (
                  <View style={{ marginTop: 8, padding: 10, backgroundColor: '#FFF3E0', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: risk.color }}>
                    {risk.warnings.map((w, i) => (
                      <Text key={i} style={{ fontSize: 12, color: '#5D4037', marginBottom: i < risk.warnings.length - 1 ? 4 : 0 }}>
                        {'\u26A0'} {w}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
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
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginLeft: 12 },
  backBtn: { padding: 6 },
  stepIndicator: { fontSize: 13, color: '#1565C0', fontWeight: '700', marginLeft: 54, marginBottom: 12, letterSpacing: 0.5 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E7EE' },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#0D47A1', marginLeft: 12 },
  section: { backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 18, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#E8EDF5' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 14, letterSpacing: 0.3 },
  subSectionTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0', marginTop: 14, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: '#E3F2FD' },
  fieldContainer: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#1565C0', marginBottom: 6, letterSpacing: 0.2 },
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#F8FAFC' },
  dropdown: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' },
  dropdownText: { fontSize: 15, color: '#333', flex: 1 },
  dropdownList: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF', maxHeight: 250, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  dropdownItemActive: { backgroundColor: '#E3F2FD' },
  dropdownItemText: { fontSize: 14, color: '#333' },
  dropdownItemTextActive: { color: '#1565C0', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 13, color: '#666' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  chipBooked: { backgroundColor: '#F0F0F0', borderColor: '#DDD', opacity: 0.7 },
  chipBookedText: { color: '#999', textDecorationLine: 'line-through' },
  bookedInfo: { fontSize: 10, color: '#999', marginTop: 2, maxWidth: 120, textAlign: 'center' },
  checklistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  checklistLabel: { fontSize: 14, color: '#333', marginLeft: 0, flex: 1 },
  medicalSection: { marginTop: 16, padding: 14, backgroundColor: '#F0F4F8', borderRadius: 12, borderWidth: 1, borderColor: '#E0E7EE' },
  medicalRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E0E7EE' },
  medicalLabel: { fontSize: 14, color: '#333', fontWeight: '500', marginBottom: 8 },
  yesNoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yesNoBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#FFF' },
  yesActive: { backgroundColor: '#DC3545', borderColor: '#DC3545' },
  noActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  yesNoText: { fontSize: 13, color: '#666', fontWeight: '500' },
  yesNoTextActive: { color: '#FFF' },
  riskBadge: { marginTop: 12, padding: 12, borderRadius: 12, alignItems: 'center' },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },
  cbctUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, borderStyle: 'dashed' as any, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
  cbctUploadBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  cbctViewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#43A047', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, flex: 1 },
  cbctViewBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  continueBtn: { flexDirection: 'row', backgroundColor: '#1565C0', borderRadius: 14, padding: 16, marginHorizontal: 16, marginVertical: 20, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  continueBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  submitContainer: { padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E0E7EE' },
  submitBtn: { flexDirection: 'row', backgroundColor: '#43A047', borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#43A047', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
});
