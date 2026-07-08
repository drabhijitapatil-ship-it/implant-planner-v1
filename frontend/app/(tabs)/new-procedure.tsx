import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, AppState, Linking, Image, Animated, Modal, useWindowDimensions,
  Pressable
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import api, { getAuthFileUrl, getToken } from '../../utils/api';
import { showUploadPicker } from '../../utils/uploadPicker';
import { useAuth } from '../../contexts/AuthContext';
import BackButton from '../../components/BackButton';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import { AtrophyClassificationChip } from '../../components/AtrophyClassificationChip';
import ExistingImplantSection from '../../components/ExistingImplantSection';
import FdiAnatomicalChart from '../../components/FdiAnatomicalChart';
import { validateImplantSelection, findMissingRuns, clusterLeader } from '../../utils/implantValidation';
import {
  PROCEDURE_TYPES,  LOADING_TYPES,
  PROCEDURES_WITH_NUM_IMPLANTS_QUESTION,
  getInvalidSinusLiftTeeth,
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
  PHASE1_ATTACHMENT_TYPE_OPTIONS,
} from '../../constants/checklist';

import { BACKEND_URL } from '../../utils/config';

// "HH:MM" (24h) -> "10:00 AM" — used by the open-scheduling-mode picker to
// show existing bookings in a readable form.
const formatTimeLabelLocal = (t: string): string => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${suffix}`;
};

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
function Dropdown({ label, value, options, onChange, placeholder, required, testID, ...rest }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; testID?: string;
  // Allow callers to pass a raw `data-testid` (e.g. from JSX literal in maps).
  // Either takes precedence over the auto-generated label-based one.
  [key: string]: any;
}) {
  const [open, setOpen] = useState(false);
  const customTestId = testID || rest['data-testid'];
  const triggerTestId = customTestId || `dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: '#DC3545' }}> *</Text>}</Text>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setOpen(!open)}
        testID={triggerTestId}
        // RN-Web only converts `testID` → `data-testid`. Set both so Playwright
        // queries that use either selector form succeed.
        // @ts-ignore RN-Web mapping
        data-testid={triggerTestId}
      >
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>
          {value || placeholder || `Select ${label}`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.dropdownList} nestedScrollEnabled={true}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.dropdownItem, value === opt && styles.dropdownItemActive]}
              onPress={() => { onChange(opt); setOpen(false); }}
              testID={`${triggerTestId}-option-${opt.toLowerCase().replace(/\s+/g, '-')}`}
              // @ts-ignore
              data-testid={`${triggerTestId}-option-${opt.toLowerCase().replace(/\s+/g, '-')}`}
            >
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
                style={calStyles.cell}
                disabled={!day || isDisabled(day)}
                onPress={() => day && selectDate(day)}
              >
                {/* iter-241: inner 30×30 circle holds the today-outline /
                    selected-fill so the day numeral sits dead-centre instead
                    of toward the bottom of the parent cell. */}
                <View style={[
                  calStyles.cellInner,
                  day && isSelected(day) && calStyles.cellSelected,
                  day && isToday(day) && !isSelected(day) && calStyles.cellToday,
                ]}>
                  <Text style={[
                    calStyles.cellText,
                    day && isDisabled(day) && calStyles.cellDisabled,
                    day && isSelected(day) && calStyles.cellSelectedText,
                    day && isToday(day) && !isSelected(day) && calStyles.cellTodayText,
                  ]}>
                    {day || ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const calStyles = StyleSheet.create({
  // iter-241: tighter padding so the calendar doesn't leave dead white space
  // below the last week of days.
  container: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, marginTop: 4, backgroundColor: '#FFF', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  navBtn: { padding: 6 },
  monthYear: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  dayNamesRow: { flexDirection: 'row', marginBottom: 2 },
  dayName: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#999' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // iter-241: hard-set cell to a square 38×38 (overrides the aspect-ratio
  // fallback that was rendering inconsistent heights on web and pushing the
  // "today" numeral toward the bottom of its blue outline).
  cell: { width: `${100/7}%`, height: 38, justifyContent: 'center', alignItems: 'center' },
  cellInner: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 14, color: '#333', textAlign: 'center', lineHeight: 30 },
  cellDisabled: { color: '#CCC' },
  cellSelected: { backgroundColor: '#1A73E8' },
  cellSelectedText: { color: '#FFF', fontWeight: '700' },
  cellToday: { borderWidth: 1.5, borderColor: '#1A73E8' },
  cellTodayText: { color: '#1A73E8', fontWeight: '600' },
});

// ─── Main Component ────────────────────────────────────
export default function NewProcedureScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const [step, setStep] = useState<'details' | 'implants'>('details');
  const [loading, setLoading] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [incharges, setIncharges] = useState<any[]>([]);
  const [createdProcedureId, setCreatedProcedureId] = useState<string | null>(null);
  const [phase1Done, setPhase1Done] = useState(false);
  const [isDraftResume, setIsDraftResume] = useState(false);
  // iter-222: full procedure record when resuming an existing-implant draft.
  // ExistingImplantSection hydrates its internal state from this snapshot.
  const [existingImplantDraft, setExistingImplantDraft] = useState<any | null>(null);
  // iter-231: surfaced from ExistingImplantSection so the parent's Clinical
  // Examination + Medical Assessment gates can fire using the original
  // procedure type and the lifted implant tooth-positions.
  const [existingOrigProcedure, setExistingOrigProcedure] = useState<string>('');
  const [existingImplantTeeth, setExistingImplantTeeth] = useState<string[]>([]);
  // iter-232: handle exposed by ExistingImplantSection so the parent can
  // render the action buttons at the very bottom of the form (after
  // Clinical Examination + Medical Assessment).
  const [existingSubmitApi, setExistingSubmitApi] = useState<null | {
    submit: (phase: 'phase3' | 'phase4_step1' | 'draft') => Promise<void>;
    submitting: boolean;
    isDraftResume: boolean;
    canSubmit: boolean;
    needsApproval: boolean;
    labels: { phase3: string; phase4: string };
  }>(null);

  // iter-236: sticky progress indicator for the long Existing Implant form.
  // We track 5 milestone sections via onLayout-captured Y positions and bump
  // `currentExistingStep` on scroll. The 5 milestones map to the natural
  // sub-flows users tackle one after another:
  //   0 → Case Details (patient / chief complaint / faculty / procedure / payment)
  //   1 → Implant Details (Type of Implant Procedure Done + Arch + FDI + Implant Selection + Prosthetic History)
  //   2 → Clinical Examination
  //   3 → Medical Assessment
  //   4 → Submit
  // iter-238: renamed "Implant Inventory" → "Implant Details" per user request.
  const EXISTING_STEP_LABELS = ['Case Details', 'Implant Details', 'Clinical Examination', 'Medical Assessment', 'Submit'];
  const existingStepYs = useRef<number[]>([0, 0, 0, 0, 0]);
  const [currentExistingStep, setCurrentExistingStep] = useState(0);
  // iter-238 hotfix: `scrollRef` MUST be declared before the early return at
  // `if (step === 'implants' && createdProcedureId)` further down — otherwise
  // the hook-count differs between the two render paths and React crashes
  // with "Rendered fewer hooks than expected" when a draft is resumed and
  // step transitions to 'implants'.
  const scrollRef = useRef<ScrollView | null>(null);
  const onExistingStepLayout = (idx: number) => (e: any) => {
    const y = e?.nativeEvent?.layout?.y ?? 0;
    existingStepYs.current[idx] = y;
  };
  const onScrollExisting = (e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    // pick the largest index whose recorded Y is below current scroll + 120px peek
    let idx = 0;
    for (let i = 0; i < existingStepYs.current.length; i++) {
      if (existingStepYs.current[i] && existingStepYs.current[i] <= y + 120) idx = i;
    }
    if (idx !== currentExistingStep) setCurrentExistingStep(idx);
  };
  const jumpToExistingStep = (idx: number) => {
    const y = existingStepYs.current[idx] || 0;
    // small upward offset so the section title isn't hidden under the sticky strip
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    // iter-237: optimistically set the active pill so the strip gives
    // immediate feedback — the onScroll handler will reconcile if the
    // section's actual Y resolves differently.
    setCurrentExistingStep(idx);
  };

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
    student_name: user?.role === 'student' ? (user?.name || '') : '',
    supervisor_id: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.id || '') : '',
    supervisor_name: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.name || '') : '',
    implant_incharge_id: user?.role === 'implant_incharge' ? (user?.id || '') : '',
    implant_incharge_name: user?.role === 'implant_incharge' ? (user?.name || '') : '',
    receipt_number: '',
    amount_paid: '',
    procedure_date: '',
    procedure_time: '',
    implant_procedure_type: '',
    // iter-307: New "Number of Implants" sub-question — only used for
    // Immediate / PET / GBR / Guided Surgery / Sinus Lift procedure
    // types.  Empty for every other type.
    num_implants: '',
    // iter-328: Sinus Lift specific sub-fields, only used when
    // implant_procedure_type === 'Sinus Lift'. The first two are
    // dropdowns; the third is a multiline note (≤150 char soft limit).
    sinus_lift_type: '',
    bone_graft_material_details: '',
    teeth_present: [] as string[],
    missing_teeth: [] as string[],
    edentulous_site_measurements: {} as Record<string, { oc?: string; md?: string }>,
    arch: '',
    loading_type: [] as string[],
    prosthetic_plan: '',
    prosthetic_plan_other: '',
    // iter-137: Type of Attachment — shown when Prosthetic Plan is
    // "Overdenture with Attachment". "Other" opens the free-text field below.
    attachment_type: '',
    attachment_type_other: '',
    bone_graft_specifications: '',
    // Clinical Examination
    occlusocervical_height: '',
    mesiodistal_space: '',
    arch_condition: '',
    ridge_contour: '',
    soft_tissue_thickness: '',
    keratinized_mucosa: '',
    // Per-cluster intraoral findings (non-full-arch, ≥2 missing teeth, ≠ Single
    // Conventional Implant). Keyed by the leader-tooth of each missing run so
    // an adjacent cluster shares one set of values, while non-adjacent gaps
    // each get their own card. Falls back to the legacy single fields above
    // for older cases / single-tooth flows.
    clinical_exam_per_site: {} as Record<string, { ridge_contour?: string; soft_tissue_thickness?: string; keratinized_mucosa?: string }>,
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
    // Full-Arch atrophy assessment (anterior/posterior bone height + width per arch, mm)
    atrophy_max_ant_h: '',
    atrophy_max_post_h: '',
    atrophy_max_ant_w: '',
    atrophy_max_post_w: '',
    atrophy_man_ant_h: '',
    atrophy_man_post_h: '',
    atrophy_man_ant_w: '',
    atrophy_man_post_w: '',
    // Medical Assessment
    medical_assessment: {} as Record<string, string>,
    medical_risk_level: '',
  });

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  // iter-251: Phase 1 Checklist info-popover — clinical protocol reminders
  // attached to each checklist item. Tap ℹ️ → modal shows the tooltip.
  const [activeTooltip, setActiveTooltip] = useState<{ label: string; tooltip: string } | null>(null);
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [showInchargePicker, setShowInchargePicker] = useState(false);

  // Dynamic responsive styles to prevent stretching on iPad
  const styles = useMemo(() => ({
    ...staticStyles,
    headerBar: [staticStyles.headerBar, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%' }],
    existingProgressBar: [staticStyles.existingProgressBar, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%' }],
    section: [staticStyles.section, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%', marginHorizontal: 'auto' }],
    continueBtn: [staticStyles.continueBtn, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%', marginHorizontal: 'auto' }],
    stepHeader: [staticStyles.stepHeader, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%' }],
    submitContainer: [staticStyles.submitContainer, isTablet && { maxWidth: 800, alignSelf: 'center', width: '100%' }],
  }), [isTablet]);

  // iter-231: for Existing Implant cases use the *original* procedure type
  // captured inside ExistingImplantSection so the Clinical Examination + Medical
  // Assessment blocks fire with the same gates (cluster, non-cluster, full-arch,
  // overdenture-as-full-arch) as routine cases.
  const isExistingImplantCase = formData.implant_procedure_type === 'Existing Implant';
  const effectiveProcType = isExistingImplantCase ? existingOrigProcedure : formData.implant_procedure_type;
  const isFullArch = FULL_ARCH_GROUP.has(effectiveProcType);
  const isNonFullArch = NON_FULL_ARCH_TYPES.has(effectiveProcType);
  const isClinicalExamGroup = CLINICAL_EXAM_GROUP.has(effectiveProcType);
  const prostheticOptions = getProstheticOptions(formData.implant_procedure_type, formData.loading_type, formData.num_implants);
  // When a non-full-arch procedure is paired with an Overdenture-with-Attachment
  // prosthetic plan, the case is biomechanically full-arch (the attachment
  // splints the entire arch). We therefore SKIP the FDI missing-teeth chart and
  // render the Clinical Examination as a full-arch layout.
  // iter-232 fix: re-added (the iter-231 refactor accidentally removed this
  // declaration while keeping 4 usages → ReferenceError → blank screen).
  const isOverdentureNonFullArch = isNonFullArch && formData.prosthetic_plan === 'Overdenture with Attachment';

  // iter-231: sync the lifted existing-implant tooth positions into the
  // form's `missing_teeth` so the Clinical Examination's cluster utilities
  // (findMissingRuns, clusterLeader, edentulous_site_measurements) work
  // identically to routine cases. Only runs while we're in Existing Implant
  // mode.
  useEffect(() => {
    if (!isExistingImplantCase) return;
    const fresh = existingImplantTeeth.filter(Boolean).sort();
    setFormData(prev => {
      const cur = (prev.missing_teeth || []).slice().sort();
      if (cur.length === fresh.length && cur.every((t, i) => t === fresh[i])) return prev;
      return { ...prev, missing_teeth: fresh };
    });
  }, [isExistingImplantCase, existingImplantTeeth]);


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
                num_implants: proc.num_implants || '',
                sinus_lift_type: proc.sinus_lift_type || '',
                bone_graft_material_details: proc.bone_graft_material_details || '',
                teeth_present: Array.isArray(proc.teeth_present) ? proc.teeth_present : [],
                missing_teeth: Array.isArray(proc.missing_teeth) ? proc.missing_teeth : [],
                edentulous_site_measurements: (proc.edentulous_site_measurements && typeof proc.edentulous_site_measurements === 'object') ? proc.edentulous_site_measurements : {},
                arch: proc.arch || '',
                loading_type: Array.isArray(proc.loading_type) ? proc.loading_type : [],
                prosthetic_plan: proc.prosthetic_plan || '',
                prosthetic_plan_other: proc.prosthetic_plan_other || '',
                attachment_type: proc.attachment_type || '',
                attachment_type_other: proc.attachment_type_other || '',
                bone_graft_specifications: proc.bone_graft_specifications || '',
                // Clinical Examination
                occlusocervical_height: proc.occlusocervical_height || '',
                mesiodistal_space: proc.mesiodistal_space || '',
                arch_condition: proc.arch_condition || '',
                ridge_contour: proc.ridge_contour || '',
                soft_tissue_thickness: proc.soft_tissue_thickness || '',
                keratinized_mucosa: proc.keratinized_mucosa || '',
                clinical_exam_per_site: (proc.clinical_exam_per_site && typeof proc.clinical_exam_per_site === 'object') ? proc.clinical_exam_per_site : {},
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
              // iter-296b: restore items with EITHER true OR false values. The
              // previous logic (`if (item.id && item.value)`) silently dropped
              // every "No" answer, leaving its `checklistItems[id]` undefined.
              // That made the iter-296 strict validation reject draft resumes
              // and locked the Continue button even though Phase 1 was complete.
              if (proc.checklist?.pre_surgical?.items) {
                const restored: Record<string, boolean> = {};
                proc.checklist.pre_surgical.items.forEach((item: any) => {
                  if (item.id && typeof item.value === 'boolean') restored[item.id] = item.value;
                });
                setChecklistItems(restored);
              }
              // iter-296b: restore CBCT file slots from the backend so the
              // validation in `missMedicalOrChecklist` recognises the saved
              // uploads (otherwise `cbctFiles` was perpetually `[null, null]`
              // on draft resume and the "Both CBCT Reports" guard would
              // wrongly block the user when navigating Step 2 → Step 1).
              if (Array.isArray(proc.cbct_files) && proc.cbct_files.length > 0) {
                const restoredCbct: (null | { filename: string; original_name: string; content_type: string })[] = [null, null];
                proc.cbct_files.slice(0, 2).forEach((f: any, i: number) => {
                  if (f?.filename) restoredCbct[i] = {
                    filename: f.filename,
                    original_name: f.original_name || f.filename,
                    content_type: f.content_type || '',
                  };
                });
                // If only `cbct_file` (legacy single-file) was stored, lift
                // it into slot 0 so at least one slot is populated.
                if (!restoredCbct[0] && proc.cbct_file) {
                  restoredCbct[0] = {
                    filename: proc.cbct_file,
                    original_name: proc.cbct_original_name || proc.cbct_file,
                    content_type: proc.cbct_content_type || '',
                  };
                }
                setCbctFiles(restoredCbct);
                if (proc.cbct_files.length > 2) setExtraCbctCount(proc.cbct_files.length - 2);
              } else if (proc.cbct_file) {
                // Legacy drafts only stored `cbct_file` (singular) — hydrate slot 0.
                setCbctFiles([
                  { filename: proc.cbct_file, original_name: proc.cbct_original_name || proc.cbct_file, content_type: proc.cbct_content_type || '' },
                  null,
                ]);
              }
              // iter-222/224: For existing-implant drafts, the backend stored
              // `implant_procedure_type` as the underlying procedure label
              // ("Single Conventional Implant" etc.) so legacy widgets keep
              // working. On resume we need the ExistingImplant branch to
              // render, so override the type back to 'Existing Implant' and
              // stash the full proc object as the hydration source.
              //
              // iter-224: detect via three signals so legacy drafts (created
              // before `case_origin` was added) also resume correctly:
              //   1. proc.case_origin === 'existing_implants' (canonical)
              //   2. proc.existing_implants is a non-empty array
              //   3. proc.original_procedure_type is set (only this endpoint sets it)
              const isExistingImplantDraft = (
                proc.case_origin === 'existing_implants'
                || (Array.isArray(proc.existing_implants) && proc.existing_implants.length > 0)
                || !!proc.original_procedure_type
              );
              if (isExistingImplantDraft) {
                setExistingImplantDraft(proc);
                setFormData(prev => ({ ...prev, implant_procedure_type: 'Existing Implant' }));
                setStep('details');
              } else {
                setStep('implants');
              }
            }
          } catch { /* ignore — draft may have been deleted */ }
        };
        loadDraft();
      } else {
        // iter-229: No draftId in route → start a fresh case. (Previously this
        // branch was gated on `!createdProcedureId` and `createdProcedureId`
        // sat in the dep array which caused useFocusEffect to re-fire the
        // moment loadDraft set the id — racing against `setExistingImplantDraft`
        // and clearing it before ExistingImplantSection saw the data.)
        setExistingImplantDraft(null);
        setFormData({
          patient_name: '', age: '', sex: '', profession: '', mobile_number: '', patient_email: '',
          registration_number: '', chief_complaint: '', student_name: user?.name || '',
          supervisor_id: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.id || '') : '',
          supervisor_name: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.name || '') : '',
          implant_incharge_id: user?.role === 'implant_incharge' ? (user?.id || '') : '',
          implant_incharge_name: user?.role === 'implant_incharge' ? (user?.name || '') : '',
          receipt_number: '', amount_paid: '', procedure_date: '', procedure_time: '',
          implant_procedure_type: '', num_implants: '', teeth_present: [] as string[], arch: '', loading_type: [] as string[],
          prosthetic_plan: '', prosthetic_plan_other: '', attachment_type: '', attachment_type_other: '', bone_graft_specifications: '',
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
        setCreatedProcedureId(null);
        setIsDraftResume(false);
        setStep('details');
        AsyncStorage.removeItem(FORM_STORAGE_KEY).catch(() => {});
      }
    }, [params.draftId, user?.name])
  );

  // iter-223: defensive — whenever an existing-implant draft is hydrated,
  // ensure we never accidentally render the Step 2 (implant selection) UI.
  // Belt-and-suspenders for issue (a) where users reported the draft resume
  // still routing to routine Phase 1 Step 2 / risk assessment.
  useEffect(() => {
    if (existingImplantDraft) {
      setStep('details');
      setFormData(prev => prev.implant_procedure_type === 'Existing Implant' ? prev : ({ ...prev, implant_procedure_type: 'Existing Implant' }));
    }
  }, [existingImplantDraft]);

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
  // Org scheduling mode (default/custom/open) + mode-specific config, both
  // returned alongside booked_slots by GET /procedures/slots/{date} — see
  // the fetch effect below. "default" reproduces the original fixed-slot
  // behaviour exactly, so orgs that never touch Scheduling Settings see zero
  // change.
  const [schedMode, setSchedMode] = useState<'default' | 'custom' | 'open'>('default');
  const [daySlots, setDaySlots] = useState<{ time: string; label: string; days: string[] }[]>([]);
  const [openWindowHours, setOpenWindowHours] = useState<number>(2);
  // Open-mode manual time entry (hour 1-12 + minute + AM/PM), composed into
  // formData.procedure_time as 24h "HH:MM" on change.
  const [openHour, setOpenHour] = useState<number | null>(null);
  const [openMinute, setOpenMinute] = useState<number>(0);
  const [openMeridiem, setOpenMeridiem] = useState<'AM' | 'PM'>('AM');
  const [showOpenTimePicker, setShowOpenTimePicker] = useState(false);
  const [tempHour, setTempHour] = useState('07');
  const [tempMinute, setTempMinute] = useState('00');
  const [tempMeridiem, setTempMeridiem] = useState<'AM' | 'PM'>('AM');
  const [activeInput, setActiveInput] = useState<'hour' | 'minute'>('hour');
  const [showDialMode, setShowDialMode] = useState(true);
  const [cbctFiles, setCbctFiles] = useState<(null | { filename: string; original_name: string; content_type: string })[]>([null, null]);
  const [cbctUploadingIdx, setCbctUploadingIdx] = useState<number | null>(null);
  const [extraCbctCount, setExtraCbctCount] = useState(0);
  const [authToken, setAuthToken] = useState('');
  const [consentFile, setConsentFile] = useState<null | { filename: string; original_name: string; content_type: string }>(null);
  const [consentUploading, setConsentUploading] = useState(false);

  const pickConsentForm = async () => {
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setConsentUploading(true);
      const payload = new FormData();
      payload.append('file', {
        uri: picked.uri,
        name: picked.name || 'consent_form.pdf',
        type: picked.type || 'application/pdf',
      } as any);
      const res = await api.post('/uploads/consent-temp', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConsentFile({
        filename: res.data.filename,
        original_name: res.data.original_name,
        content_type: res.data.content_type,
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload consent form');
    } finally {
      setConsentUploading(false);
    }
  };

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
    setOpenHour(null); setOpenMinute(0); setOpenMeridiem('AM'); // reset open-mode picker on date change
    const fetchSlots = async () => {
      try {
        const res = await api.get(`/procedures/slots/${formData.procedure_date}`);
        setBookedSlots(res.data?.booked_slots || {});
        setSchedMode(res.data?.mode || 'default');
        setDaySlots(res.data?.day_slots || []);
        if (res.data?.open_window_hours) setOpenWindowHours(res.data.open_window_hours);
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

  // iter-242 / iter-296-fix: gentle auto-pulse on the "Case Details" pill
  // until the user types the very first field. MOVED here from below the
  // step-2 early return — the previous position caused a "Rendered fewer
  // hooks than expected" crash whenever the user advanced to step==='implants'
  // (the early return at line ~963 skipped these hooks, so the next render
  // ran fewer hooks and React aborted with a white screen).
  const isCompletelyBlank = !formData.patient_name && !formData.registration_number && !formData.chief_complaint;
  const pillPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isCompletelyBlank) {
      pillPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pillPulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
      Animated.timing(pillPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isCompletelyBlank, pillPulse]);

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

  // ── Haematology Examination fields ─────────────────────────────────
  // Optional pre-surgical lab values captured in Phase 1. Stored flat
  // under `medical_assessment.{hb,tlc,bleeding_time,clotting_time,
  // prothrombin_time,inr}` so they live alongside other Medical
  // Assessment keys and don't disturb `calculateMedicalRisk`.
  const HAEMATOLOGY_FIELDS: { id: string; label: string; placeholder: string; hint?: string }[] = [
    { id: 'hb', label: 'Haemoglobin (Hb)', placeholder: 'e.g. 13.5', hint: 'g/dL' },
    { id: 'tlc', label: 'Total Leucocyte Count', placeholder: 'e.g. 7500', hint: 'Normal 4,000 – 10,000 /cumm' },
    { id: 'bleeding_time', label: 'Bleeding Time', placeholder: 'e.g. 2.5', hint: 'minutes' },
    { id: 'clotting_time', label: 'Clotting Time', placeholder: 'e.g. 5.0', hint: 'minutes' },
    { id: 'prothrombin_time', label: 'Prothrombin Time', placeholder: 'e.g. 13', hint: 'Normal 11 – 16 seconds' },
    { id: 'inr', label: 'International Normalised Ratio (INR)', placeholder: 'e.g. 1.1', hint: 'ratio' },
  ];

  const renderHaematologySection = (testidSuffix: string) => (
    <View style={styles.haematologyWrap} testID={`haematology-${testidSuffix}`} data-testid={`haematology-${testidSuffix}`}>
      <Text style={styles.haematologyHeading}>Haematology Examination <Text style={styles.haematologyOptional}>(all optional)</Text></Text>
      {HAEMATOLOGY_FIELDS.map(f => (
        <View key={f.id} style={styles.haematologyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.haematologyLabel}>{f.label}</Text>
            {f.hint ? <Text style={styles.haematologyHint}>{f.hint}</Text> : null}
          </View>
          <TextInput
            style={styles.haematologyInput}
            value={formData.medical_assessment[f.id] || ''}
            onChangeText={(t) => updateMedical(f.id, t)}
            placeholder={f.placeholder}
            placeholderTextColor="#90A4AE"
            keyboardType="decimal-pad"
            inputMode="decimal"
            testID={`haematology-input-${f.id}-${testidSuffix}`}
            data-testid={`haematology-input-${f.id}-${testidSuffix}`}
          />
        </View>
      ))}
    </View>
  );

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
    // iter-260: holistic pre-flight using the per-section completion
    // logic that drives the sticky progress strip. Surfaces ALL missing
    // sections at once so the user doesn't have to dismiss 4 popups in
    // a row. Field-level Alerts below remain as the authoritative
    // messages for the last missing piece.
    const requiredIdx = [0, 1, 2, 3];
    // iter-330b: enrich the popup so each incomplete section also lists
    // the EXACT field names that are outstanding. The previous popup
    // only named the section ("Treatment Plan") which left users
    // hunting for the missing field — especially painful when a
    // dropdown was reset by a cascading change.
    const sectionDetail: Array<{label: string; fields: string[]}> = requiredIdx
      .filter(i => !existingStepDone[i])
      .map(i => ({ label: FLOW_STEP_LABELS[i], fields: flowStepMissing[i] }));
    if (sectionDetail.length > 0) {
      const body = sectionDetail
        .map(s => `• ${s.label}${s.fields.length ? `\n   - ${s.fields.join('\n   - ')}` : ''}`)
        .join('\n\n');
      Alert.alert(
        'Incomplete sections',
        `Please complete the following before continuing to Implant Selection:\n\n${body}`,
        [{ text: 'OK' }]
      );
      return;
    }

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
      sanitized.implant_procedure_type === 'Guided Surgery' ||
      sanitized.implant_procedure_type === 'Sinus Lift'
    )) {
      Alert.alert('Missing Field', 'Please select Periodontal Status.');
      return;
    }
    // iter-307: when the procedure type requires the Number-of-Implants
    // sub-question, block submission until it's answered and enforce the
    // expected tooth-count on the FDI chart for the chosen sub-option.
    if (PROCEDURES_WITH_NUM_IMPLANTS_QUESTION.has(sanitized.implant_procedure_type)) {
      if (!sanitized.num_implants) {
        Alert.alert('Missing Field', 'Please pick "Single Implant" or "Multiple Implants" under Number of Implants.');
        return;
      }
      const missingCount = (sanitized.missing_teeth || []).length;
      if (sanitized.num_implants === 'Single Implant' && missingCount > 1) {
        Alert.alert(
          'Tooth Count Mismatch',
          `You selected "Single Implant" but ${missingCount} teeth are marked on the FDI chart. ` +
          'Please reduce the marked teeth to 1 or switch the sub-question to "Multiple Implants".'
        );
        return;
      }
      if (sanitized.num_implants === 'Multiple Implants' && missingCount < 2) {
        Alert.alert(
          'Tooth Count Mismatch',
          `"Multiple Implants" requires at least 2 teeth on the FDI chart, but ${missingCount} ${missingCount === 1 ? 'is' : 'are'} marked. ` +
          'Please mark the remaining teeth or switch the sub-question to "Single Implant".'
        );
        return;
      }
    }
    // iter-328: Sinus Lift gates — Type of Sinus Lift + bone graft
    // material details are both required when Sinus Lift is selected,
    // and every marked tooth must be in the maxillary posterior set
    // (14-17 / 24-27).
    if (sanitized.implant_procedure_type === 'Sinus Lift') {
      if (!sanitized.sinus_lift_type) {
        Alert.alert('Missing Field', 'Please select Type of Sinus Lift (Direct or Indirect).');
        return;
      }
      if (!sanitized.bone_graft_material_details?.trim()) {
        Alert.alert('Missing Field', 'Please enter Details of Bone Graft Material.');
        return;
      }
      const invalid = getInvalidSinusLiftTeeth(sanitized.missing_teeth || []);
      if (invalid.length > 0) {
        Alert.alert(
          'Sinus Lift procedure selected, choose appropriate tooth/teeth',
          `Sinus Lift is only applicable to the maxillary posterior teeth (14, 15, 16, 17, 24, 25, 26, 27). ` +
          `These selected teeth are not eligible: ${invalid.join(', ')}.`
        );
        return;
      }
    }
    if (!cbctFiles[0] || !cbctFiles[1]) {
      Alert.alert('Missing Field', 'Please upload both mandatory CBCT Reports before continuing.');
      return;
    }
    // iter-137: Type of Attachment is required when Prosthetic Plan is Overdenture-with-Attachment.
    if (sanitized.prosthetic_plan === 'Overdenture with Attachment') {
      if (!sanitized.attachment_type) {
        Alert.alert('Missing Field', 'Please select the Type of Attachment for the Overdenture.');
        return;
      }
      if (sanitized.attachment_type === 'Other' && !sanitized.attachment_type_other?.trim()) {
        Alert.alert('Missing Field', 'Please specify the custom Attachment Type.');
        return;
      }
    }

    setLoading(true);
    try {
      // Per-cluster intraoral findings → flatten the FIRST run's values into the
      // legacy single fields so the existing case-detail / PDF renderers keep
      // working without changes. Only fires when we actually rendered the
      // per-cluster cards (≥2 missing teeth, non-Single Conventional Implant,
      // not Overdenture-with-Attachment).
      const usingPerSite =
        (sanitized.missing_teeth || []).length >= 2 &&
        sanitized.implant_procedure_type !== 'Single Conventional Implant' &&
        !(NON_FULL_ARCH_TYPES.has(sanitized.implant_procedure_type) && sanitized.prosthetic_plan === 'Overdenture with Attachment');
      let legacyRidge = sanitized.ridge_contour;
      let legacySoft = sanitized.soft_tissue_thickness;
      let legacyKera = sanitized.keratinized_mucosa;
      if (usingPerSite) {
        const runs = findMissingRuns(sanitized.missing_teeth || []);
        const firstLeader = runs.length > 0 ? (clusterLeader(runs[0].positions) || runs[0].positions[0]) : '';
        const firstSite = (sanitized.clinical_exam_per_site || {})[firstLeader] || {};
        legacyRidge = firstSite.ridge_contour || '';
        legacySoft = firstSite.soft_tissue_thickness || '';
        legacyKera = firstSite.keratinized_mucosa || '';
      }
      const payload = {
        ...sanitized,
        ridge_contour: legacyRidge,
        soft_tissue_thickness: legacySoft,
        keratinized_mucosa: legacyKera,
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
        // Preserve the Type of Attachment selection on the payload so the
        // backend stores it alongside the plan (iter-137).
        attachment_type: sanitized.prosthetic_plan === 'Overdenture with Attachment'
          ? (sanitized.attachment_type === 'Other'
              ? `Other: ${sanitizeString(sanitized.attachment_type_other)}`
              : sanitized.attachment_type)
          : '',
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

      // ── Persist Atrophy Assessment for Full-Arch cases (silent guidance) ──
      if (isFullArch && procId) {
        const atrophyPayload: any = {};
        const fnum = (s: string) => {
          const v = parseFloat(s); return Number.isFinite(v) ? v : null;
        };
        if (formData.arch === 'Maxillary' || formData.arch === 'Both') {
          const ah = fnum(formData.atrophy_max_ant_h);
          const ph = fnum(formData.atrophy_max_post_h);
          if (ah !== null && ph !== null) {
            atrophyPayload.maxilla = {
              anterior_height: ah,
              posterior_height: ph,
              anterior_width: fnum(formData.atrophy_max_ant_w),
              posterior_width: fnum(formData.atrophy_max_post_w),
            };
          }
        }
        if (formData.arch === 'Mandibular' || formData.arch === 'Both') {
          const ah = fnum(formData.atrophy_man_ant_h);
          const ph = fnum(formData.atrophy_man_post_h);
          if (ah !== null && ph !== null) {
            atrophyPayload.mandible = {
              anterior_height: ah,
              posterior_height: ph,
              anterior_width: fnum(formData.atrophy_man_ant_w),
              posterior_width: fnum(formData.atrophy_man_post_w),
            };
          }
        }
        if (Object.keys(atrophyPayload).length > 0) {
          try { await api.put(`/procedures/${procId}/atrophy-assessment`, atrophyPayload); }
          catch { /* best effort — don't block case creation */ }
        }
      }

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
          <BackButton onPress={() => { setStep('details'); setIsDraftResume(false); }} testID="step2-back-btn" />
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
            teethPresent={formData.teeth_present}
            missingTeeth={formData.missing_teeth}
            edentulousSiteMeasurements={formData.edentulous_site_measurements}
            defaultOcclusocervical={formData.occlusocervical_height}
            defaultMesiodistal={formData.mesiodistal_space}
            onBridgeConfirmed={async (info) => {
              // Persist the default prosthesis on the procedure so Phase 2 can pre-fill it.
              // Student edits draft procedures via PUT (edit-fields is reviewer-only).
              try {
                await api.put(`/procedures/${createdProcedureId}`, {
                  bridge_design: info.design,
                  bridge_material: info.material,
                  bridge_pontics: info.pontics,
                  bridge_implants: info.implants,
                });
              } catch (err) {
                // Non-fatal — UI Alert already shown; reviewer can re-enter in Phase 2.
                console.warn('bridge_design save failed', err);
              }
            }}
          />
        </ScrollView>
        <View style={styles.submitContainer}>
          {phase1Done ? (
            <View style={{ alignItems: 'center', paddingVertical: 8 }} testID="phase1-done-success">
              <View style={{ paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: '#E8F5E9', borderWidth: 1.5, borderColor: '#43A047', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1B5E20', letterSpacing: 0.5 }}>Approved</Text>
              </View>
              <TouchableOpacity onPress={() => router.replace(`/procedures/${createdProcedureId}`)} style={{ marginTop: 14 }} testID="phase1-view-case-link">
                <Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' }}>View Case</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <TouchableOpacity style={styles.submitBtn} data-testid="submit-for-approval"
            onPress={async () => {
              // Final clinical-correlation summary before submission (Q2=c — also done live).
              try {
                const planRes = await api.get(`/procedures/${createdProcedureId}/implant-plan`);
                const positions: string[] = (planRes.data?.implant_plans || []).map((p: any) => p.position);
                const finalCheck = validateImplantSelection(formData.implant_procedure_type, formData.teeth_present, positions);
                if (finalCheck.block) {
                  Alert.alert('Cannot submit', finalCheck.block);
                  return;
                }
                if (finalCheck.bridgeCandidates.length > 0) {
                  const lines = finalCheck.bridgeCandidates.map(c =>
                    `• ${c.implants.join(', ')} → ${c.pontics.join(', ')} as pontic`,
                  ).join('\n');
                  // Non-blocking — already prompted live, just remind on submit.
                  Alert.alert(
                    'Bridge prosthesis indicated',
                    `Implant-supported bridge configurations detected:\n\n${lines}\n\nThe student / supervisor will confirm the final prosthesis in Phase 2.`,
                  );
                }
                if (finalCheck.cantileverCandidates.length > 0) {
                  const lines = finalCheck.cantileverCandidates.map(c =>
                    `• Tooth ${c.pontic} (anchored on implant ${c.implant})`,
                  ).join('\n');
                  Alert.alert(
                    'Cantilever pontic warning',
                    `Cantilever pontics detected — review crown-to-implant ratio and occlusal load before proceeding:\n\n${lines}`,
                  );
                }
              } catch {
                // Plan endpoint failed — don't block submission, but log.
              }

              const isInchargeUser = user?.role === 'implant_incharge';
              Alert.alert(isInchargeUser ? 'Mark Case Done' : 'Submit for Approval',
                isInchargeUser ? 'Submit this case and auto-approve Phase 1?' : 'Are you sure you want to submit this case?', [
                { text: 'Cancel' },
                {
                  text: isInchargeUser ? 'Done' : 'Submit', onPress: async () => {
                    try {
                      await api.put(`/procedures/${createdProcedureId}`,
                        { status: 'pending_phase1' }
                      );
                      if (isInchargeUser) {
                        try { await api.post(`/procedures/${createdProcedureId}/approve`, { action: 'approve', comment: '' }); } catch {}
                        setPhase1Done(true);
                      } else {
                        Alert.alert('Success', 'Case submitted for approval.');
                        router.replace('/(tabs)/dashboard');
                      }
                    } catch (e: any) {
                      Alert.alert('Error', e.response?.data?.detail || 'Failed to submit');
                    }
                  }
                },
              ]);
            }}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>{user?.role === 'implant_incharge' ? 'Done' : 'Submit for Approval'}</Text>
          </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Render Step: Case Details ──
  // iter-238: compute per-step completion so each pill can show a small
  // green ✓ once that section's required fields are filled. Submit (idx 4)
  // is treated as complete only when the previous 4 milestones are all
  // green (a "ready to submit" cue). Declared AFTER all state hooks but
  // BEFORE the JSX to avoid the TDZ trap that hit iter-238 first attempt.
  // iter-239: same strip now also renders for routine (non-Existing) cases
  // — milestone labels + completion logic switch on `isExistingImplantCase`.
  // iter-240: per-step *missing-fields* list — drives the tap-to-validate
  // popup so users see exactly what's outstanding before they jump.
  const FLOW_STEP_LABELS = isExistingImplantCase
    ? ['Case Details', 'Implant Details', 'Clinical Examination', 'Medical Assessment', 'Submit']
    : ['Case Details', 'Treatment Plan', 'Clinical Examination', 'Phase 1 Checklist', 'Submit'];

  const missCaseDetails: string[] = [];
  const missImplantDetails: string[] = [];
  const missClinical: string[] = [];
  const missMedicalOrChecklist: string[] = [];

  // iter-296b: For drafts RESUMED from the backend (createdProcedureId set
  // OR isDraftResume true), skip ALL strict Phase 1 validation. The draft
  // already exists on the server, so the user must be free to navigate
  // Step 1 ↔ Step 2 without being re-blocked by validations that may not
  // match the legacy save schema. Strict validation is still enforced for
  // FRESH cases below and on the final Submit for Approval action at the
  // end of Step 2.
  const skipStrictPhase1 = isDraftResume || !!createdProcedureId;

  if (!skipStrictPhase1) {
    if (!formData.patient_name?.trim()) missCaseDetails.push('Patient name');
    if (!formData.registration_number?.trim()) missCaseDetails.push('Registration number');
    if (!formData.chief_complaint?.trim()) missCaseDetails.push('Chief complaint');
    if (!formData.supervisor_id) missCaseDetails.push('Supervising faculty');
    if (!formData.implant_incharge_id) missCaseDetails.push('Implant in-charge');
    if (!formData.receipt_number?.trim()) missCaseDetails.push('Receipt number');
    if (!formData.amount_paid) missCaseDetails.push('Amount paid');

    if (isExistingImplantCase) {
      if (!existingOrigProcedure) missImplantDetails.push('Type of Implant Procedure Done');
      // iter-307: surface the new sub-question in the missing-fields panel
      // so it's visible alongside the other Phase-1 requirements.
      if (
        PROCEDURES_WITH_NUM_IMPLANTS_QUESTION.has(formData.implant_procedure_type) &&
        !formData.num_implants
      ) {
        missImplantDetails.push('Number of Implants');
      }
      else if (FULL_ARCH_GROUP.has(existingOrigProcedure) && !formData.arch) missImplantDetails.push('Arch');
      if ((existingImplantTeeth || []).length === 0) missImplantDetails.push('At least one tooth marked on FDI chart');
    } else {
      // iter-330b: Sinus Lift / Immediate / PET / GBR / Guided Surgery all
      // surface a Number-of-Implants sub-question in the Treatment Plan
      // section. It was being validated only for the Existing Implant
      // branch — which meant that for a fresh Sinus Lift case the user
      // could leave the dropdown empty, see no error, but still be
      // gated by the prosthetic-plan dropdown that won't render until
      // num_implants is picked. Add it here so the missing-fields panel
      // calls it out explicitly.
      if (
        PROCEDURES_WITH_NUM_IMPLANTS_QUESTION.has(formData.implant_procedure_type) &&
        !formData.num_implants
      ) {
        missImplantDetails.push('Number of Implants');
      }
      if (!formData.prosthetic_plan) missImplantDetails.push('Prosthetic Plan');
      if (isFullArch && !formData.arch) missImplantDetails.push('Arch');
      if (!isFullArch && (formData.missing_teeth || []).length === 0) missImplantDetails.push('At least one missing tooth on FDI chart');
      // iter-328: Sinus Lift extras surfaced in the missing-fields panel
      if (formData.implant_procedure_type === 'Sinus Lift') {
        if (!formData.sinus_lift_type) missImplantDetails.push('Type of Sinus Lift');
        if (!formData.bone_graft_material_details?.trim()) missImplantDetails.push('Details of Bone Graft Material');
        const invalid = getInvalidSinusLiftTeeth(formData.missing_teeth || []);
        if (invalid.length > 0) missImplantDetails.push(`Sinus Lift requires maxillary posterior teeth (invalid: ${invalid.join(', ')})`);
      }
    }

    // iter-316: Clinical Examination validation now mirrors the UI's
    // dual-path rendering. When the user is in the per-tooth cluster mode
    // (≥ 2 missing teeth, not Single Conventional Implant, not full-arch),
    // values are stored under `edentulous_site_measurements[tooth].{oc,md}`
    // and `clinical_exam_per_site[leader].ridge_contour` — NOT in the flat
    // legacy keys. Previously the validator only checked the flat keys, so
    // cluster-mode cases were stuck on "Clinical Examination has missing
    // fields" forever.
    const missingTeeth = formData.missing_teeth || [];
    const isClusterMode =
      isClinicalExamGroup &&
      !isOverdentureNonFullArch &&
      missingTeeth.length >= 2 &&
      formData.implant_procedure_type !== 'Single Conventional Implant';

    if (isClusterMode) {
      const runs = findMissingRuns(missingTeeth);
      const measurements = formData.edentulous_site_measurements || {};
      const perSite = formData.clinical_exam_per_site || {};
      const ridgeRequired = formData.implant_procedure_type !== 'Single Conventional Implant';
      for (const run of runs) {
        const positions = run.positions;
        const isCluster = positions.length >= 2;
        const leader = clusterLeader(positions) || positions[0];
        if (isCluster) {
          // Shared mesiodistal span on the leader; per-tooth oc on every tooth.
          if (!measurements[leader]?.md) { missClinical.push(`Mesiodistal span (FDI ${leader})`); }
          for (const t of positions) {
            if (!measurements[t]?.oc) missClinical.push(`Occlusocervical height (FDI ${t})`);
          }
          if (ridgeRequired && !perSite[leader]?.ridge_contour) missClinical.push(`Ridge contour (FDI ${leader})`);
        } else {
          // Singleton — both oc + md on the tooth; ridge per-site (if required).
          const t = positions[0];
          if (!measurements[t]?.oc) missClinical.push(`Occlusocervical height (FDI ${t})`);
          if (!measurements[t]?.md) missClinical.push(`Mesiodistal space (FDI ${t})`);
          if (ridgeRequired && !perSite[t]?.ridge_contour) missClinical.push(`Ridge contour (FDI ${t})`);
        }
      }
    } else if (!isFullArch && !isOverdentureNonFullArch) {
      if (!formData.occlusocervical_height) missClinical.push('Occlusocervical height');
      if (!formData.mesiodistal_space) missClinical.push('Mesiodistal space');
      if (!formData.ridge_contour) missClinical.push('Ridge contour');
    }

    if (isExistingImplantCase) {
      const ma = formData.medical_assessment || {};
      if (!ma.diabetes) missMedicalOrChecklist.push('Diabetes');
      if (!ma.smoking) missMedicalOrChecklist.push('Smoking status');
      if (!ma.anticoagulant) missMedicalOrChecklist.push('Anticoagulant therapy');
      if (!ma.osteoporosis) missMedicalOrChecklist.push('Osteoporosis medication');
      if (!ma.radiation) missMedicalOrChecklist.push('Radiation therapy');
    } else {
      if (!cbctFiles[0] || !cbctFiles[1]) missMedicalOrChecklist.push('Both CBCT Reports');
      if (!formData.loading_type || formData.loading_type.length === 0) missMedicalOrChecklist.push('Type of Loading');
      const ma = formData.medical_assessment || {};
      if (!ma.diabetes) missMedicalOrChecklist.push('Diabetes (medical assessment)');
      if (!ma.smoking) missMedicalOrChecklist.push('Smoking status (medical assessment)');
      if (!ma.anticoagulant) missMedicalOrChecklist.push('Anticoagulant therapy (medical assessment)');
      if (!ma.osteoporosis) missMedicalOrChecklist.push('Osteoporosis medication (medical assessment)');
      if (!ma.radiation) missMedicalOrChecklist.push('Radiation therapy (medical assessment)');
      const mandatoryItems = CHECKLIST_DATA.pre_surgical.items
        .filter(it => it.id !== 'medical_assessment')
        .filter(it => !(isFullArch && it.id === 'oral_prophylaxis'));
      for (const it of mandatoryItems) {
        if (typeof checklistItems[it.id] !== 'boolean') {
          missMedicalOrChecklist.push(`${it.label} (Yes/No required)`);
        }
      }
    }
  }

  const flowStepMissing: string[][] = [missCaseDetails, missImplantDetails, missClinical, missMedicalOrChecklist, []];
  // Submit pill (idx 4) is "missing" if any of the prior 4 are not green —
  // its missing list is the union of upstream blockers so the user gets a
  // single roll-up summary when they tap it.
  flowStepMissing[4] = [
    ...(missCaseDetails.length ? ['Case Details has missing fields'] : []),
    ...(missImplantDetails.length ? [isExistingImplantCase ? 'Implant Details has missing fields' : 'Treatment Plan has missing fields'] : []),
    ...(missClinical.length ? ['Clinical Examination has missing fields'] : []),
    ...(missMedicalOrChecklist.length ? [isExistingImplantCase ? 'Medical Assessment has missing fields' : 'Phase 1 Checklist has missing fields'] : []),
  ];

  const existingStepDone = flowStepMissing.map(arr => arr.length === 0);
  // iter-241: progress strip now renders immediately on landing on New Case
  // (was gated on procedure-type being picked). Pre-selection it shows the
  // routine flow's first 5 labels; once the user picks "Existing Implant"
  // the labels swap automatically via `FLOW_STEP_LABELS`.
  const showFlowStrip = true;

  // iter-296-fix: `isCompletelyBlank`, `pillPulse` (useRef) and the pulse-loop
  // useEffect were MOVED to the top of the component (right after `updateForm`)
  // so they run on every render — including when the early-return for
  // step==='implants' fires. The previous position caused the React error
  // "Rendered fewer hooks than expected" → blank white screen.

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      stickyHeaderIndices={showFlowStrip ? [1] : undefined}
      onScroll={showFlowStrip ? onScrollExisting : undefined}
      scrollEventThrottle={64}
    >
      <View style={styles.headerBar}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {formData.implant_procedure_type === 'Existing Implant'
              ? 'Phase 1 Examination and Case Details'
              : 'Phase 1 - Diagnosis and Treatment Planning'}
          </Text>
          {formData.implant_procedure_type !== 'Existing Implant' && (
            <Text style={styles.stepIndicator}>Step 1 of 2: Case Details</Text>
          )}
        </View>
      </View>

      {/* iter-236: sticky progress strip — shows the user where they are
          in the 5-milestone form. A render-cycle-only empty View is mounted
          for cases without a procedure type yet so the JSX tree shape stays
          stable. iter-239: now renders for both routine and Existing
          Implant flows with different milestone labels. */}
      {showFlowStrip ? (
        <View style={styles.existingProgressBar} testID="existing-progress-strip">
          {/* iter-256: percentage and fill width are driven by how many
              steps are actually COMPLETE (existingStepDone), not by the
              current scroll index. A brand-new empty form starts at 0%,
              and each filled section bumps the bar by 20%. */}
          {(() => {
            const doneCount = existingStepDone.filter(Boolean).length;
            const pct = Math.round((doneCount / FLOW_STEP_LABELS.length) * 100);
            return (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.existingProgressLabel} numberOfLines={1}>
                    Step {currentExistingStep + 1} of {FLOW_STEP_LABELS.length} — {FLOW_STEP_LABELS[currentExistingStep]}
                  </Text>
                  <Text style={styles.existingProgressCount}>{pct}%</Text>
                </View>
                <View style={styles.existingProgressTrack}>
                  <View style={[styles.existingProgressFill, { width: `${pct}%` }]} />
                </View>
              </>
            );
          })()}
          {/* iter-237/238/239: tappable step pills — uniform width, green ✓ when section is complete. */}
          <View style={styles.existingStepPillRow}>
            {FLOW_STEP_LABELS.map((label, idx) => {
              const active = idx === currentExistingStep;
              const done = existingStepDone[idx];
              const PillWrap: any = idx === 0 ? Animated.View : View;
              const pillWrapProps = idx === 0 ? { style: { transform: [{ scale: pillPulse }], flexGrow: 1, flexBasis: 0 } } : { style: { flexGrow: 1, flexBasis: 0 } };
              return (
                <PillWrap key={label} {...pillWrapProps}>
                <TouchableOpacity
                  key={label}
                  onPress={() => {
                    // iter-240: tap pill to validate & jump. Already-green
                    // pills just scroll; incomplete pills first show a brief
                    // popup listing the missing fields, then scroll on
                    // confirm. Submit pill rolls up upstream blockers.
                    const missing = flowStepMissing[idx] || [];
                    if (missing.length === 0) {
                      jumpToExistingStep(idx);
                      return;
                    }
                    const list = missing.slice(0, 8).map(m => `• ${m}`).join('\n');
                    const more = missing.length > 8 ? `\n…and ${missing.length - 8} more` : '';
                    const body = `Please complete the following before this section is marked done:\n\n${list}${more}`;
                    // React Native Web's Alert.alert only renders the message
                    // (buttons are no-ops). Fall back to window.confirm on web
                    // so users still get a Stay/Go choice.
                    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
                      if (window.confirm(`Missing: ${label}\n\n${body}\n\nTap OK to jump there, Cancel to stay here.`)) {
                        jumpToExistingStep(idx);
                      }
                      return;
                    }
                    Alert.alert(
                      `Missing: ${label}`,
                      body,
                      [
                        { text: 'Stay here', style: 'cancel' },
                        { text: 'Take me there', onPress: () => jumpToExistingStep(idx) },
                      ]
                    );
                  }}
                  style={[styles.existingStepPill, active && styles.existingStepPillActive, done && !active && styles.existingStepPillDone]}
                  testID={`existing-step-pill-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Jump to ${label}${done ? ', complete' : ''}`}
                >
                  {done ? (
                    <Ionicons name="checkmark-circle" size={12} color={active ? '#FFF' : '#2E7D32'} style={{ marginRight: 3 }} />
                  ) : (
                    <Text style={[styles.existingStepPillNum, active && styles.existingStepPillTextActive]}>{idx + 1}.</Text>
                  )}
                  <Text style={[styles.existingStepPillText, active && styles.existingStepPillTextActive, done && !active && styles.existingStepPillTextDone]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
                </PillWrap>
              );
            })}
          </View>
        </View>
      ) : <View />}

      {/* ─── Patient Info ─── */}
      <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(0) : undefined}>
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

      {/* ─── Procedure Type ─── */}
      {/* iter-213: Procedure Information now precedes Payment Details so the
          operator picks the procedure type (which may be "Existing Implant"
          and morph the rest of the form) before entering payment info. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Procedure Information</Text>
        <Dropdown label="Type of Implant Procedure" value={formData.implant_procedure_type}
          options={PROCEDURE_TYPES} onChange={v => {
            updateForm('implant_procedure_type', v);
            updateForm('arch', '');
            // iter-307: reset the Number-of-Implants sub-question and
            // any previously-picked Prosthetic Plan when the procedure
            // type changes, since both depend on the new type.
            updateForm('num_implants', '');
            updateForm('prosthetic_plan', '');
            updateForm('prosthetic_plan_other', '');
            // iter-328: also reset Sinus Lift sub-fields whenever the
            // top-level procedure type changes so leftover values don't
            // persist into a non-sinus-lift case.
            updateForm('sinus_lift_type', '');
            updateForm('bone_graft_material_details', '');
          }} required />

        {/* iter-328: Sinus Lift cascade — Type of Sinus Lift dropdown
            renders directly under the procedure-type picker and only
            when Sinus Lift is the chosen type. Required. */}
        {formData.implant_procedure_type === 'Sinus Lift' && (
          <Dropdown
            label="Type of Sinus Lift"
            value={formData.sinus_lift_type}
            options={['Direct Sinus Lift', 'Indirect Sinus Lift']}
            onChange={v => updateForm('sinus_lift_type', v)}
            required
            data-testid="sinus-lift-type-dropdown"
          />
        )}

        {/* iter-307: "Number of Implants" sub-question — only shown for
            Immediate / PET / GBR / Guided Surgery / Sinus Lift procedure
            types. The answer drives the Prosthetic Plan dropdown below. */}
        {PROCEDURES_WITH_NUM_IMPLANTS_QUESTION.has(formData.implant_procedure_type) && (
          <Dropdown
            label="Number of Implants"
            value={formData.num_implants}
            options={['Single Implant', 'Multiple Implants']}
            onChange={v => {
              updateForm('num_implants', v);
              // Prosthetic Plan must reset because its option set
              // changes between Single and Multiple.
              updateForm('prosthetic_plan', '');
              updateForm('prosthetic_plan_other', '');
            }}
            required
          />
        )}

        {/* iter-328: Bone graft material details — multiline note
            (≤150 char soft limit) collected on every Sinus Lift case.
            Required. Counter sits beneath the input for clear UX. */}
        {formData.implant_procedure_type === 'Sinus Lift' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>
              Details of Bone Graft Material <Text style={{ color: '#DC3545' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={formData.bone_graft_material_details}
              onChangeText={v => updateForm('bone_graft_material_details', v.slice(0, 150))}
              placeholder="e.g. Bio-Oss xenograft 0.5 g + autogenous bone shavings, covered with collagen membrane"
              multiline
              numberOfLines={3}
              maxLength={150}
              data-testid="bone-graft-material-details-input"
            />
            <Text style={{ fontSize: 11, color: '#78909C', marginTop: 4, textAlign: 'right' }}>
              {(formData.bone_graft_material_details || '').length} / 150
            </Text>
          </View>
        )}
        {/* iter-235: hide the Arch dropdown for Existing Implant — it lives
            inside the ExistingImplantSection between Type of Implant Procedure
            Done and Implant Selection instead. */}
        {isFullArch && !isExistingImplantCase && (
          <Dropdown label="Arch" value={formData.arch}
            options={['Maxillary', 'Mandibular']} onChange={v => updateForm('arch', v)} required data-testid="arch-dropdown" />
        )}
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

      {/* iter-213: when "Existing Implant" is the procedure type, swap the
          rest of the surgical-prep form for the existing-implant wizard
          (FDI inventory, present prosthetic component, prosthetic history,
          radiograph, save + phase routing). Skips clinical exam / implant
          planning / loading / scheduling collected by the regular flow. */}
      {formData.implant_procedure_type === 'Existing Implant' && (
        <View onLayout={onExistingStepLayout(1)}>
        <ExistingImplantSection
          patient={{
            student_name: (formData as any).student_name || '',
            patient_name: formData.patient_name,
            age: formData.age || '',
            sex: formData.sex || '',
            profession: formData.profession || '',
            mobile_number: formData.mobile_number || '',
            patient_email: formData.patient_email || '',
            registration_number: formData.registration_number,
            chief_complaint: formData.chief_complaint || '',
            supervisor_id: formData.supervisor_id,
            supervisor_name: formData.supervisor_name || '',
            implant_incharge_id: formData.implant_incharge_id,
            implant_incharge_name: formData.implant_incharge_name || '',
            receipt_number: formData.receipt_number,
            amount_paid: String(formData.amount_paid || ''),
            procedure_date: formData.procedure_date || '',
            procedure_time: formData.procedure_time || '',
            remark: (formData as any).remark || '',
          }}
          validatePatient={() => {
            if (!formData.patient_name?.trim()) return 'Patient name is required.';
            if (!formData.registration_number?.trim()) return 'MR / Registration number is required.';
            if (!formData.supervisor_id) return 'Please select a supervisor.';
            if (!formData.implant_incharge_id) return 'Please select an implant in-charge.';
            if (!formData.receipt_number?.trim()) return 'Receipt number is required.';
            if (!formData.amount_paid) return 'Amount paid is required.';
            // iter-220: appointment date/time are irrelevant for historical
            // (existing-implant) cases — the surgery already happened. Backend
            // payload auto-fills today's date inside ExistingImplantSection.
            return null;
          }}
          draft={existingImplantDraft}
          onOriginalProcedureChange={setExistingOrigProcedure}
          onImplantTeethChange={setExistingImplantTeeth}
          arch={formData.arch}
          onArchChange={v => updateForm('arch', v)}
          extraSubmitFields={{
            medical_assessment: formData.medical_assessment,
            medical_risk_level: formData.medical_risk_level,
            // Clinical Examination fields captured by the parent.
            edentulous_sites: formData.edentulous_sites,
            occlusocervical_height: formData.occlusocervical_height,
            mesiodistal_space: formData.mesiodistal_space,
            arch_condition: formData.arch_condition,
            ridge_contour: formData.ridge_contour,
            soft_tissue_thickness: formData.soft_tissue_thickness,
            keratinized_mucosa: formData.keratinized_mucosa,
            periodontal_status: formData.periodontal_status,
            occlusal_scheme: formData.occlusal_scheme,
            parafunction_habit: formData.parafunction_habit,
            vertical_dimension: formData.vertical_dimension,
            opposing_dentition: formData.opposing_dentition,
            vertical_dimension_mm: formData.vertical_dimension_mm,
            available_interarch_space: formData.available_interarch_space,
            opposing_arch: formData.opposing_arch,
            tmj: formData.tmj,
            smile_line: formData.smile_line,
            gingival_biotype: formData.gingival_biotype,
          }}
          hideActionButtons
          onReady={setExistingSubmitApi}
        />
        </View>
      )}

      {formData.implant_procedure_type !== 'Existing Implant' && (<>

      {/* ─── Prosthetic Treatment Plan ─── (moved here per iter-134; now appears
            BEFORE the FDI chart so that an Overdenture-with-Attachment choice
            can flip the case into a full-arch protocol and skip teeth selection.) */}
      {prostheticOptions.length > 0 && (
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(1) : undefined}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <Dropdown label="Prosthetic Plan" value={formData.prosthetic_plan}
            options={prostheticOptions} onChange={v => {
              updateForm('prosthetic_plan', v);
              // Flip into Overdenture-with-Attachment full-arch protocol → wipe
              // any previously-chosen missing teeth (FDI chart will be hidden).
              if (v === 'Overdenture with Attachment' && isNonFullArch) {
                updateForm('missing_teeth', []);
                updateForm('edentulous_site_measurements', {});
                updateForm('clinical_exam_per_site', {});
              }
              // Leaving Overdenture → clear the attachment-type sub-selection.
              if (v !== 'Overdenture with Attachment') {
                updateForm('attachment_type', '');
                updateForm('attachment_type_other', '');
              }
            }} />
          {formData.prosthetic_plan === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthetic Plan</Text>
              <TextInput style={styles.input} value={formData.prosthetic_plan_other}
                onChangeText={v => updateForm('prosthetic_plan_other', v)}
                placeholder="Enter custom prosthetic plan" multiline />
            </View>
          )}
          {/* Type of Attachment (iter-137) — sub-question that appears only
              when Overdenture-with-Attachment is the chosen plan. Free-text
              input appears when "Other" is picked. */}
          {formData.prosthetic_plan === 'Overdenture with Attachment' && (
            <>
              <Dropdown
                label="Type of Attachment"
                value={formData.attachment_type}
                options={PHASE1_ATTACHMENT_TYPE_OPTIONS}
                onChange={v => {
                  updateForm('attachment_type', v);
                  if (v !== 'Other') updateForm('attachment_type_other', '');
                }}
                required
                testID="attachment-type-dropdown"
              />
              {formData.attachment_type === 'Other' && (
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Specify Attachment Type<Text style={{ color: '#DC3545' }}> *</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={formData.attachment_type_other}
                    onChangeText={v => updateForm('attachment_type_other', v)}
                    placeholder="Enter custom attachment type"
                    data-testid="attachment-type-other-input"
                  />
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* ─── FDI Chart (Non-Full-Arch Only) — Missing Teeth selector ─── */}
      {/* iter-231: hide on Existing Implant — `ExistingImplantSection` ships
          its own FDI chart driven by the implant tooth-positions. */}
      {formData.implant_procedure_type && !isFullArch && !isOverdentureNonFullArch && !isExistingImplantCase && (() => {
        const ptype = formData.implant_procedure_type;
        const EXTRACT_SET = new Set(['Immediate Implant', 'Partial Extraction Therapy']);
        const isExtractFlow = EXTRACT_SET.has(ptype);
        const sectionTitle = isExtractFlow ? 'Select teeth' : 'Missing Teeth';
        const subLabel = isExtractFlow
          ? (ptype === 'Immediate Implant'
              ? 'Mark tooth/teeth for Immediate Implant'
              : 'Mark tooth/teeth for Partial Extraction Therapy')
          : 'Select missing tooth/teeth';
        const missing = formData.missing_teeth || [];
        // Client-side count validation (matched server-side)
        let countError: string | null = null;
        if (ptype === 'Conventional Single Implant' && missing.length !== 1 && missing.length > 0) {
          countError = 'Conventional Single Implant requires exactly 1 tooth.';
        } else if (ptype === 'Multiple Conventional Implants' && missing.length === 1) {
          countError = 'Multiple Conventional Implants requires at least 2 teeth.';
        }
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{subLabel}</Text>
            <FdiAnatomicalChart
              mode="multi"
              value={missing}
              onChange={(next) => updateForm('missing_teeth', next as string[])}
              selectedLabel={isExtractFlow ? 'Selected for extraction' : 'Missing'}
              testIDPrefix="fdi"
            />
            {missing.length > 0 && (
              <Text style={{ fontSize: 12, color: '#B71C1C', fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
                {missing.length} {missing.length === 1 ? 'tooth' : 'teeth'} marked — {missing.sort().join(', ')}
              </Text>
            )}
            {countError && (
              <Text style={{ fontSize: 11, color: '#B71C1C', marginTop: 6, textAlign: 'center', fontWeight: '600' }}>{countError}</Text>
            )}
          </View>
        );
      })()}

      </>)}

      {/* ─── Clinical Examination ─── */}
      {/* iter-233: rendered for BOTH routine cases AND Existing Implant cases.
          For Existing Implant the gate is `effectiveProcType` (= the inner
          "Type of Implant Procedure Done") so the section only appears once
          the user picks an original procedure type inside the section. The
          parent's iter-231 useEffect syncs the lifted implant tooth-positions
          into `formData.missing_teeth` so cluster utilities work identically. */}
      {effectiveProcType && (
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(2) : undefined}>
          <Text style={styles.sectionTitle}>Clinical Examination</Text>

          {/* Intraoral Examination – Non-Full-Arch (Single, Multiple, GBR, Guided Surgery)
              Skipped when Overdenture-with-Attachment is selected — that case
              uses the full-arch block below. */}
          {isClinicalExamGroup && !isOverdentureNonFullArch && (
            <>
              <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
              <Text style={[styles.subSectionTitle, { fontSize: 14, color: '#1565C0', marginTop: 4 }]}>Edentulous Site</Text>
              {(formData.missing_teeth || []).length >= 2 ? (
                // Cluster-aware per-tooth rows. Adjacent missing teeth in the
                // same arch share a single Mesiodistal Space (the contiguous
                // edentulous span), but each tooth keeps its own per-tooth
                // Occlusocervical Height. Singletons render with both fields.
                (() => {
                  const runs = findMissingRuns(formData.missing_teeth || []);
                  const setOc = (tooth: string, v: string) => {
                    const next = { ...(formData.edentulous_site_measurements || {}) };
                    next[tooth] = { ...(next[tooth] || {}), oc: v };
                    updateForm('edentulous_site_measurements', next);
                  };
                  const setMd = (tooth: string, v: string) => {
                    const next = { ...(formData.edentulous_site_measurements || {}) };
                    next[tooth] = { ...(next[tooth] || {}), md: v };
                    updateForm('edentulous_site_measurements', next);
                  };
                  // Per-cluster intraoral findings setter — keyed by the leader
                  // tooth of each missing run so adjacent teeth share one set.
                  const setSite = (key: string, field: 'ridge_contour' | 'soft_tissue_thickness' | 'keratinized_mucosa', v: string) => {
                    const next = { ...(formData.clinical_exam_per_site || {}) };
                    next[key] = { ...(next[key] || {}), [field]: v };
                    updateForm('clinical_exam_per_site', next);
                  };
                  return (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: '#546E7A', marginBottom: 8 }}>
                        Enter the measurements for each tooth marked on the FDI chart. Adjacent missing teeth share one mesiodistal span.
                      </Text>
                      {runs.map((run) => {
                        const archLabel = run.arch === 'maxillary' ? 'Maxillary' : 'Mandibular';
                        const positions = run.positions; // already arch-sorted
                        const isCluster = positions.length >= 2;
                        const leader = clusterLeader(positions) || positions[0];
                        const leaderRow = (formData.edentulous_site_measurements || {})[leader] || {};
                        if (!isCluster) {
                          // Singleton tooth (Scenario 1) — both oc + md per tooth
                          const tooth = positions[0];
                          const row = (formData.edentulous_site_measurements || {})[tooth] || {};
                          return (
                            <View key={`ed-single-${tooth}`} style={{ backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <View style={{ backgroundColor: '#E53935', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF' }}>FDI {tooth}</Text>
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#37474F' }}>Measurements (mm)</Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1565C0', marginBottom: 4 }} numberOfLines={1}>Occlusocervical Height *</Text>
                                  <TextInput
                                    style={[styles.input, { borderColor: '#1565C0' }]}
                                    placeholder="e.g. 12"
                                    keyboardType="decimal-pad"
                                    maxLength={5}
                                    value={row.oc || ''}
                                    onChangeText={(v) => setOc(tooth, v)}
                                    data-testid={`oc-height-${tooth}`}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1565C0', marginBottom: 4 }} numberOfLines={1}>Mesiodistal Space *</Text>
                                  <TextInput
                                    style={[styles.input, { borderColor: '#1565C0' }]}
                                    placeholder="e.g. 15"
                                    keyboardType="decimal-pad"
                                    maxLength={5}
                                    value={row.md || ''}
                                    onChangeText={(v) => setMd(tooth, v)}
                                    data-testid={`md-space-${tooth}`}
                                  />
                                </View>
                              </View>
                              {/* Per-site intraoral findings (this isolated tooth = its own site) */}
                              {formData.implant_procedure_type !== 'Single Conventional Implant' && (() => {
                                const site = (formData.clinical_exam_per_site || {})[tooth] || {};
                                return (
                                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ECEFF1' }}>
                                    <Dropdown label="Ridge Contour" value={site.ridge_contour || ''}
                                      options={RIDGE_CONTOUR_OPTIONS} onChange={(v) => setSite(tooth, 'ridge_contour', v)} data-testid={`ridge-contour-${tooth}`} />
                                    <Dropdown label="Soft Tissue Thickness" value={site.soft_tissue_thickness || ''}
                                      options={SOFT_TISSUE_OPTIONS} onChange={(v) => setSite(tooth, 'soft_tissue_thickness', v)} data-testid={`soft-tissue-${tooth}`} />
                                    <Dropdown label="Keratinized Mucosa" value={site.keratinized_mucosa || ''}
                                      options={KERATINIZED_MUCOSA_OPTIONS} onChange={(v) => setSite(tooth, 'keratinized_mucosa', v)} data-testid={`keratinized-${tooth}`} />
                                  </View>
                                );
                              })()}
                            </View>
                          );
                        }
                        // Cluster (Scenario 2) — one shared mesiodistal span, per-tooth oc rows
                        return (
                          <View key={`ed-cluster-${run.arch}-${leader}`} style={{ backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#37474F' }}>Adjacent Missing Cluster ({archLabel})</Text>
                              {positions.map((t) => (
                                <View key={`pill-${t}`} style={{ backgroundColor: '#E53935', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF' }}>FDI {t}</Text>
                                </View>
                              ))}
                            </View>
                            <View style={{ marginBottom: 10 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1565C0', marginBottom: 4 }} numberOfLines={1}>Mesiodistal Space — total cluster span (mm) *</Text>
                              <TextInput
                                style={[styles.input, { borderColor: '#1565C0' }]}
                                placeholder="e.g. 24"
                                keyboardType="decimal-pad"
                                maxLength={5}
                                value={leaderRow.md || ''}
                                onChangeText={(v) => setMd(leader, v)}
                                data-testid={`md-cluster-${leader}`}
                              />
                              <Text style={{ fontSize: 11, color: '#78909C', marginTop: 4, fontStyle: 'italic' }}>
                                Measure between the two natural teeth bordering this missing cluster.
                              </Text>
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1565C0', marginBottom: 6 }}>Occlusocervical Height per tooth (mm) *</Text>
                            {positions.map((tooth) => {
                              const row = (formData.edentulous_site_measurements || {})[tooth] || {};
                              return (
                                <View key={`ed-cluster-row-${tooth}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <View style={{ backgroundColor: '#E53935', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 56, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFF' }}>FDI {tooth}</Text>
                                  </View>
                                  <TextInput
                                    style={[styles.input, { borderColor: '#1565C0', flex: 1, marginBottom: 0 }]}
                                    placeholder="e.g. 12"
                                    keyboardType="decimal-pad"
                                    maxLength={5}
                                    value={row.oc || ''}
                                    onChangeText={(v) => setOc(tooth, v)}
                                    data-testid={`oc-height-${tooth}`}
                                  />
                                </View>
                              );
                            })}
                            {/* Per-cluster intraoral findings — adjacent missing
                                teeth share ONE set of dropdowns (continuous
                                edentulous span = one site). Singletons render
                                their own set above. */}
                            {(() => {
                              const site = (formData.clinical_exam_per_site || {})[leader] || {};
                              return (
                                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ECEFF1' }}>
                                  <Dropdown label="Ridge Contour" value={site.ridge_contour || ''}
                                    options={RIDGE_CONTOUR_OPTIONS} onChange={(v) => setSite(leader, 'ridge_contour', v)} data-testid={`ridge-contour-${leader}`} />
                                  <Dropdown label="Soft Tissue Thickness" value={site.soft_tissue_thickness || ''}
                                    options={SOFT_TISSUE_OPTIONS} onChange={(v) => setSite(leader, 'soft_tissue_thickness', v)} data-testid={`soft-tissue-${leader}`} />
                                  <Dropdown label="Keratinized Mucosa" value={site.keratinized_mucosa || ''}
                                    options={KERATINIZED_MUCOSA_OPTIONS} onChange={(v) => setSite(leader, 'keratinized_mucosa', v)} data-testid={`keratinized-${leader}`} />
                                </View>
                              );
                            })()}
                          </View>
                        );
                      })}
                    </View>
                  );
                })()
              ) : (
                // Single-tooth (or nothing marked yet) — current fields unchanged
                <>
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
                </>
              )}
              {/* Single-site (or empty) dropdowns. When ≥2 missing teeth are
                  selected and the procedure is NOT Single Conventional Implant,
                  we instead render Ridge Contour / Soft Tissue / Keratinized
                  per-cluster INSIDE each cluster card above. */}
              {((formData.missing_teeth || []).length < 2 || formData.implant_procedure_type === 'Single Conventional Implant') && (
                <>
                  <Dropdown label="Ridge Contour" value={formData.ridge_contour}
                    options={RIDGE_CONTOUR_OPTIONS} onChange={v => updateForm('ridge_contour', v)} />
                  <Dropdown label="Soft Tissue Thickness" value={formData.soft_tissue_thickness}
                    options={SOFT_TISSUE_OPTIONS} onChange={v => updateForm('soft_tissue_thickness', v)} />
                  <Dropdown label="Keratinized Mucosa" value={formData.keratinized_mucosa}
                    options={KERATINIZED_MUCOSA_OPTIONS} onChange={v => updateForm('keratinized_mucosa', v)} />
                </>
              )}
            </>
          )}

          {/* Intraoral Examination – Full-Arch (All on 4/6/X) OR
              Non-Full-Arch + Overdenture-with-Attachment (treated as full-arch) */}
          {(isFullArch || isOverdentureNonFullArch) && (
            <>
              <Text style={styles.subSectionTitle}>Intraoral Examination</Text>
              {/* Non-full-arch + Overdenture flow doesn't otherwise collect Arch
                  in Procedure Information, so surface it here. */}
              {isOverdentureNonFullArch && (
                <Dropdown label="Arch" value={formData.arch}
                  options={['Maxillary', 'Mandibular']} onChange={v => updateForm('arch', v)} required data-testid="overdenture-arch-dropdown" />
              )}
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
            formData.implant_procedure_type === 'Guided Surgery' ||
            // iter-330c: Sinus Lift also requires Periodontal Status — the
            // submit validator demanded it but the render gate was missing
            // it, leaving the user stuck at a "Please select Periodontal
            // Status" popup with no dropdown visible to fill.
            formData.implant_procedure_type === 'Sinus Lift') && (
          <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1565C0' }}>Periodontal Status <Text style={{ color: '#DC3545' }}>*</Text></Text>
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

              {/* ── Atrophy Assessment (Full-Arch only) ── */}
              {/* iter-235: hide Atrophy Assessment for Existing Implant full-arch
                  cases — the implants are already placed so an atrophy class /
                  therapeutic-option recommendation is not actionable. */}
              {!isExistingImplantCase && (<>
              <Text style={[styles.subSectionTitle, { marginTop: 18 }]}>Atrophy Assessment</Text>
              <Text style={{ fontSize: 12, color: '#5C6BC0', marginBottom: 10, fontStyle: 'italic' }}>
                Enter average bone height and width in the anterior and posterior regions for each treated arch. The class and recommended therapeutic options are computed automatically.
              </Text>

              {(formData.arch === 'Maxillary' || formData.arch === 'Both') && (
                <View style={{ marginBottom: 12, padding: 12, backgroundColor: '#F3F8FF', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#1565C0' }} testID="atrophy-maxilla-block">
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0D47A1', marginBottom: 8 }}>Maxilla</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Anterior Height (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 14"
                        value={formData.atrophy_max_ant_h} onChangeText={v => updateForm('atrophy_max_ant_h', v)} testID="atrophy-max-ant-h" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Posterior Height (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 6"
                        value={formData.atrophy_max_post_h} onChangeText={v => updateForm('atrophy_max_post_h', v)} testID="atrophy-max-post-h" />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Anterior Width (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 7"
                        value={formData.atrophy_max_ant_w} onChangeText={v => updateForm('atrophy_max_ant_w', v)} testID="atrophy-max-ant-w" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Posterior Width (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 7"
                        value={formData.atrophy_max_post_w} onChangeText={v => updateForm('atrophy_max_post_w', v)} testID="atrophy-max-post-w" />
                    </View>
                  </View>
                  <AtrophyClassificationChip
                    arch="maxilla"
                    anterior_height={formData.atrophy_max_ant_h}
                    posterior_height={formData.atrophy_max_post_h}
                    anterior_width={formData.atrophy_max_ant_w}
                    posterior_width={formData.atrophy_max_post_w}
                    opposing_arch={formData.opposing_arch}
                    smoking={formData.medical_assessment?.smoking}
                    hba1c={formData.medical_assessment?.hba1c}
                  />
                </View>
              )}

              {(formData.arch === 'Mandibular' || formData.arch === 'Both') && (
                <View style={{ marginBottom: 12, padding: 12, backgroundColor: '#F3F8FF', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#1565C0' }} testID="atrophy-mandible-block">
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0D47A1', marginBottom: 8 }}>Mandible</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Anterior Height (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 18"
                        value={formData.atrophy_man_ant_h} onChangeText={v => updateForm('atrophy_man_ant_h', v)} testID="atrophy-man-ant-h" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Posterior Height (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 9"
                        value={formData.atrophy_man_post_h} onChangeText={v => updateForm('atrophy_man_post_h', v)} testID="atrophy-man-post-h" />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Anterior Width (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 7"
                        value={formData.atrophy_man_ant_w} onChangeText={v => updateForm('atrophy_man_ant_w', v)} testID="atrophy-man-ant-w" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Posterior Width (mm)</Text>
                      <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="e.g. 7"
                        value={formData.atrophy_man_post_w} onChangeText={v => updateForm('atrophy_man_post_w', v)} testID="atrophy-man-post-w" />
                    </View>
                  </View>
                  <AtrophyClassificationChip
                    arch="mandible"
                    anterior_height={formData.atrophy_man_ant_h}
                    posterior_height={formData.atrophy_man_post_h}
                    anterior_width={formData.atrophy_man_ant_w}
                    posterior_width={formData.atrophy_man_post_w}
                    opposing_arch={formData.opposing_arch}
                    smoking={formData.medical_assessment?.smoking}
                    hba1c={formData.medical_assessment?.hba1c}
                  />
                </View>
              )}
              </>)}
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

      {/* iter-233: resume the non-Existing-Implant gated section. Everything
          below (Schedule, Loading Type, CBCT upload, Phase 1 Checklist, Bone
          Graft, Continue button) belongs only to the routine flow; Existing
          Implant cases skip straight to the Medical Assessment + lifted
          submit buttons rendered further down. */}
      {!isExistingImplantCase && (<>

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
        {formData.procedure_date && schedMode === 'default' && (() => {
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

        {/* Custom mode — org-defined named slots for this weekday. */}
        {formData.procedure_date && schedMode === 'custom' && (
          daySlots.length === 0 ? (
            <View style={[styles.riskBadge, { backgroundColor: '#FFF3E0' }]}>
              <Text style={{ color: '#E65100', fontWeight: '600', fontSize: 13 }}>
                No procedure slots are configured for this day.
              </Text>
            </View>
          ) : (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Time Slot <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <View style={styles.chipRow}>
                {daySlots.map(slot => {
                  const booked = bookedSlots[slot.time];
                  const isBooked = !!booked;
                  const isSelected = formData.procedure_time === slot.time;
                  return (
                    <View key={slot.time}>
                      <TouchableOpacity
                        style={[styles.chip, isSelected && styles.chipActive, isBooked && styles.chipBooked]}
                        onPress={() => !isBooked && updateForm('procedure_time', slot.time)}
                        disabled={isBooked}
                        data-testid={`slot-${slot.time}`}>
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
          )
        )}

        {/* Open-window mode — pick any start time; it auto-occupies the
            org-configured duration (e.g. 10:00 AM + 2h -> blocks to 12:00 PM). */}
        {formData.procedure_date && schedMode === 'open' && (() => {
          const commitTime = (h: number | null, m: number, mer: 'AM' | 'PM') => {
            if (h == null) { updateForm('procedure_time', ''); return; }
            let h24 = h % 12;
            if (mer === 'PM') h24 += 12;
            updateForm('procedure_time', `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
          };
          const endTimeLabel = (() => {
            if (openHour == null) return null;
            let h24 = openHour % 12; if (openMeridiem === 'PM') h24 += 12;
            const startMin = h24 * 60 + openMinute;
            const endMin = startMin + Math.round(openWindowHours * 60);
            const eh = Math.floor((endMin / 60) % 24);
            const em = endMin % 60;
            const suffix = eh >= 12 ? 'PM' : 'AM';
            const eh12 = eh % 12 || 12;
            return `${eh12}:${String(em).padStart(2, '0')} ${suffix}`;
          })();
          const existingBookings = Object.entries(bookedSlots);

          const handleOpenPicker = () => {
            setTempHour(openHour ? String(openHour).padStart(2, '0') : '07');
            setTempMinute(String(openMinute).padStart(2, '0'));
            setTempMeridiem(openMeridiem);
            setActiveInput('hour');
            setShowOpenTimePicker(true);
          };

          return (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Time Slot <Text style={{ color: '#DC3545' }}>*</Text></Text>
              
              <TouchableOpacity
                style={styles.dropdown}
                onPress={handleOpenPicker}
                data-testid="open-mode-time-picker-btn"
              >
                <Text style={[styles.dropdownText, openHour == null && { color: '#90A4AE' }]}>
                  {openHour != null
                    ? `${String(openHour).padStart(2, '0')}:${String(openMinute).padStart(2, '0')} ${openMeridiem}`
                    : 'Select Time'}
                </Text>
                <Ionicons name="time-outline" size={20} color="#1565C0" />
              </TouchableOpacity>

              {/* Open-window time picker dialog modal (Material 3 style with Clock Face) */}
              <Modal
                visible={showOpenTimePicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowOpenTimePicker(false)}
              >
                <Pressable style={styles.timeModalOverlay} onPress={() => setShowOpenTimePicker(false)}>
                  <Pressable style={styles.timeModalContainer} onPress={() => {}}>
                    <Text style={styles.timeModalTitle}>Select time</Text>
                    
                    <View style={styles.timeModalInputRow}>
                      {/* Hour Box */}
                      <View style={{ alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[styles.timeModalBox, activeInput === 'hour' && styles.timeModalBoxActive]}
                          onPress={() => setActiveInput('hour')}
                        >
                          <TextInput
                            style={styles.timeModalInput}
                            value={tempHour}
                            onChangeText={(v) => {
                              const clean = v.replace(/[^0-9]/g, '');
                              setTempHour(clean);
                              if (clean.length === 2) {
                                setActiveInput('minute');
                              }
                            }}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="00"
                            placeholderTextColor="#90A4AE"
                            onFocus={() => setActiveInput('hour')}
                            selectTextOnFocus={true}
                          />
                        </TouchableOpacity>
                        <Text style={styles.timeModalSubLabel}>Hour</Text>
                      </View>

                      {/* Colon */}
                      <Text style={styles.timeModalColon}>:</Text>

                      {/* Minute Box */}
                      <View style={{ alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[styles.timeModalBox, activeInput === 'minute' && styles.timeModalBoxActive]}
                          onPress={() => setActiveInput('minute')}
                        >
                          <TextInput
                            style={styles.timeModalInput}
                            value={tempMinute}
                            onChangeText={(v) => {
                              const clean = v.replace(/[^0-9]/g, '');
                              setTempMinute(clean);
                            }}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="00"
                            placeholderTextColor="#90A4AE"
                            onFocus={() => setActiveInput('minute')}
                            selectTextOnFocus={true}
                          />
                        </TouchableOpacity>
                        <Text style={styles.timeModalSubLabel}>Minute</Text>
                      </View>

                      {/* AM/PM Toggle */}
                      <View style={styles.timeModalMeridiemContainer}>
                        <TouchableOpacity
                          style={[styles.timeModalMeridiemBtn, tempMeridiem === 'AM' && styles.timeModalMeridiemBtnActive, { borderBottomWidth: 0.5, borderBottomColor: '#CFD8DC' }]}
                          onPress={() => setTempMeridiem('AM')}
                        >
                          <Text style={[styles.timeModalMeridiemText, tempMeridiem === 'AM' && styles.timeModalMeridiemTextActive]}>AM</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.timeModalMeridiemBtn, tempMeridiem === 'PM' && styles.timeModalMeridiemBtnActive, { borderTopWidth: 0.5, borderTopColor: '#CFD8DC' }]}
                          onPress={() => setTempMeridiem('PM')}
                        >
                          <Text style={[styles.timeModalMeridiemText, tempMeridiem === 'PM' && styles.timeModalMeridiemTextActive]}>PM</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Clock Dial Face */}
                    {showDialMode && (() => {
                      const dialSize = 220;
                      const center = dialSize / 2;
                      const handLength = 70;
                      
                      const angle = (() => {
                        if (activeInput === 'hour') {
                          const val = parseInt(tempHour, 10) || 12;
                          return (val * 30 - 90) * (Math.PI / 180);
                        } else {
                          const val = parseInt(tempMinute, 10) || 0;
                          return (val * 6 - 90) * (Math.PI / 180);
                        }
                      })();

                      const targetX = center + handLength * Math.cos(angle);
                      const targetY = center + handLength * Math.sin(angle);

                      return (
                        <View style={styles.clockDial}>
                          <Svg height={dialSize} width={dialSize} style={StyleSheet.absoluteFill}>
                            {/* Line connecting pivot to number */}
                            <Line
                              x1={center}
                              y1={center}
                              x2={targetX}
                              y2={targetY}
                              stroke="#1565C0"
                              strokeWidth="2.5"
                            />
                            {/* Inner circle pivot */}
                            <Circle cx={center} cy={center} r="4" fill="#1565C0" />
                          </Svg>

                          {/* Hours 1-12 or Minutes 0-55 */}
                          {activeInput === 'hour' ? (
                            [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => {
                              const theta = (h * 30 - 90) * (Math.PI / 180);
                              const numX = center + handLength * Math.cos(theta) - 16;
                              const numY = center + handLength * Math.sin(theta) - 16;
                              const isSelected = parseInt(tempHour, 10) === h || (h === 12 && parseInt(tempHour, 10) === 0);
                              return (
                                <TouchableOpacity
                                  key={h}
                                  style={[
                                    styles.clockNumberBox,
                                    { left: numX, top: numY },
                                    isSelected && styles.clockNumberBoxSelected
                                  ]}
                                  onPress={() => {
                                    setTempHour(String(h).padStart(2, '0'));
                                    setActiveInput('minute');
                                  }}
                                >
                                  <Text style={[styles.clockNumberText, isSelected && styles.clockNumberTextSelected]}>
                                    {h}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => {
                              const theta = ((m / 5) * 30 - 90) * (Math.PI / 180);
                              const numX = center + handLength * Math.cos(theta) - 16;
                              const numY = center + handLength * Math.sin(theta) - 16;
                              const isSelected = parseInt(tempMinute, 10) === m;
                              return (
                                <TouchableOpacity
                                  key={m}
                                  style={[
                                    styles.clockNumberBox,
                                    { left: numX, top: numY },
                                    isSelected && styles.clockNumberBoxSelected
                                  ]}
                                  onPress={() => {
                                    setTempMinute(String(m).padStart(2, '0'));
                                  }}
                                >
                                  <Text style={[styles.clockNumberText, isSelected && styles.clockNumberTextSelected]}>
                                    {m === 0 ? '00' : m}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      );
                    })()}

                    {/* Bottom Action buttons */}
                    <View style={[styles.timeModalFooter, { marginTop: showDialMode ? 24 : 12 }]}>
                      <TouchableOpacity onPress={() => setShowDialMode(prev => !prev)} style={{ padding: 4 }}>
                        <MaterialCommunityIcons 
                          name={showDialMode ? "keyboard-outline" : "clock-outline"} 
                          size={24} 
                          color="#546E7A" 
                        />
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', gap: 20 }}>
                        <TouchableOpacity onPress={() => setShowOpenTimePicker(false)}>
                          <Text style={styles.timeModalFooterText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                          const h = parseInt(tempHour, 10);
                          const m = parseInt(tempMinute, 10);
                          if (isNaN(h) || h < 1 || h > 12) {
                            Alert.alert('Invalid Hour', 'Please enter a valid hour (1-12).');
                            return;
                          }
                          if (isNaN(m) || m < 0 || m > 59) {
                            Alert.alert('Invalid Minute', 'Please enter a valid minute (0-59).');
                            return;
                          }
                          setOpenHour(h);
                          setOpenMinute(m);
                          setOpenMeridiem(tempMeridiem);
                          commitTime(h, m, tempMeridiem);
                          setShowOpenTimePicker(false);
                        }}>
                          <Text style={styles.timeModalFooterText}>OK</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              {endTimeLabel && (
                <Text style={[styles.bookedInfo, { textAlign: 'left', marginTop: 8, maxWidth: '100%' }]}>
                  Occupies until {endTimeLabel} ({openWindowHours}h slot)
                </Text>
              )}
              {existingBookings.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#78909C', marginBottom: 4 }}>Already booked today:</Text>
                  {existingBookings.map(([t, info]) => (
                    <Text key={t} style={[styles.bookedInfo, { textAlign: 'left', maxWidth: '100%' }]} numberOfLines={1}>
                      {formatTimeLabelLocal(t)} — {info.patient_name} ({info.scheduled_by})
                    </Text>
                  ))}
                </View>
              )}
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

      {/* Prosthetic Treatment Plan was moved up to immediately follow Procedure
          Information (iter-134). Empty placeholder retained intentionally. */}

      {/* ─── CBCT Report Upload (Mandatory: 2 minimum) ─── */}
      {/* iter-231: skipped for Existing Implant cases — intake CBCT is
          captured directly on the implant cards instead. */}
      {!isExistingImplantCase && (
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
      )}

      {/* ─── Phase 1 Checklist ─── */}
      {/* iter-231: routine flow only. Existing Implant cases render a
          standalone Medical Assessment block below instead (no pre-surgical
          checklist items because no surgery is performed). */}
      {!isExistingImplantCase && (
      <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(3) : undefined}>
        <Text style={styles.sectionTitle}>Phase 1 Checklist <Text style={{ color: '#DC3545' }}>*</Text></Text>
        {CHECKLIST_DATA.pre_surgical.items.filter(item => item.id !== 'medical_assessment').filter(item => !(isFullArch && item.id === 'oral_prophylaxis')).map(item => (
          <View key={item.id} style={styles.checklistRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.checklistLabel, { flex: 1 }]}>{item.label}</Text>
              {/* iter-251: ℹ️ info popover with clinical protocol reminder */}
              {(item as any).tooltip && (
                <TouchableOpacity
                  onPress={() => setActiveTooltip({ label: item.label, tooltip: (item as any).tooltip })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID={`checklist-info-${item.id}`}
                  accessibilityLabel={`More information about ${item.label}`}
                  accessibilityRole="button"
                >
                  <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['Yes', 'No'].map(opt => (
                <TouchableOpacity key={opt}
                  style={[styles.yesNoBtn, checklistItems[item.id] === true && opt === 'Yes' && { backgroundColor: '#4CAF50', borderColor: '#4CAF50' }, checklistItems[item.id] === false && opt === 'No' && { backgroundColor: '#F44336', borderColor: '#F44336' }]}
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
            <View key={factor.id}>
              <View style={styles.medicalRow}>
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
              {factor.id === 'diabetes' && (formData.medical_assessment.diabetes === 'Controlled' || formData.medical_assessment.diabetes === 'Uncontrolled') && (
                <View style={styles.hba1cRow} testID="hba1c-row-routine" data-testid="hba1c-row-routine">
                  <Text style={styles.hba1cLabel}>HbA1c Value <Text style={styles.hba1cOptional}>(optional, %)</Text></Text>
                  <TextInput
                    style={styles.hba1cInput}
                    value={formData.medical_assessment.hba1c || ''}
                    onChangeText={(t) => updateMedical('hba1c', t)}
                    placeholder="e.g. 7.2"
                    placeholderTextColor="#90A4AE"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    testID="hba1c-input-routine"
                    data-testid="hba1c-input-routine"
                  />
                </View>
              )}
            </View>
          ))}
          {renderHaematologySection('routine')}
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
      )}

      </>)}

      {/* iter-231: Standalone Medical Assessment block for Existing Implant
          cases — mirrors the routine flow's sub-section but without the
          surrounding pre-surgical checklist items. */}
      {isExistingImplantCase && (
        <View style={styles.section} onLayout={onExistingStepLayout(3)}>
          <Text style={styles.sectionTitle}>Medical Assessment <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <View style={styles.medicalSection}>
            {MEDICAL_RISK_FACTORS.map(factor => (
              <View key={factor.id}>
                <View style={styles.medicalRow}>
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
                {factor.id === 'diabetes' && (formData.medical_assessment.diabetes === 'Controlled' || formData.medical_assessment.diabetes === 'Uncontrolled') && (
                  <View style={styles.hba1cRow} testID="hba1c-row-existing" data-testid="hba1c-row-existing">
                    <Text style={styles.hba1cLabel}>HbA1c Value <Text style={styles.hba1cOptional}>(optional, %)</Text></Text>
                    <TextInput
                      style={styles.hba1cInput}
                      value={formData.medical_assessment.hba1c || ''}
                      onChangeText={(t) => updateMedical('hba1c', t)}
                      placeholder="e.g. 7.2"
                      placeholderTextColor="#90A4AE"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      testID="hba1c-input-existing"
                      data-testid="hba1c-input-existing"
                    />
                  </View>
                )}
              </View>
            ))}
            {renderHaematologySection('existing')}
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
      )}

      {/* iter-232: Lifted submit buttons for Existing Implant — rendered
          at the bottom of the form so the user fills everything top-to-
          bottom and submits as the natural last action. Buttons stay
          inside ExistingImplantSection for non-existing flows.
          iter-235: order is Phase 3 → Phase 4 Step 1 → Save Draft, with a
          tighter 6px vertical gap (per user request). */}
      {isExistingImplantCase && existingSubmitApi?.canSubmit && (() => {
        // iter-261: same disable + holistic-guard pattern as routine Continue.
        const canSubmit = [0, 1, 2, 3].every(i => existingStepDone[i]);
        const incompleteCount = [0, 1, 2, 3].filter(i => !existingStepDone[i]).length;
        const guard = (run: () => void) => {
          if (!canSubmit) {
            const labels = [0, 1, 2, 3].filter(i => !existingStepDone[i]).map(i => FLOW_STEP_LABELS[i]);
            Alert.alert(
              'Incomplete sections',
              `Please complete the following before submitting:\n\n${labels.map(l => `• ${l}`).join('\n')}`,
              [{ text: 'OK' }]
            );
            return;
          }
          run();
        };
        return (
          <View style={[styles.section, { gap: 6 }]} testID="existing-impl-action-buttons" onLayout={onExistingStepLayout(4)}>
            <TouchableOpacity
              style={[styles.continueBtn, { backgroundColor: canSubmit ? '#43A047' : '#B0BEC5', marginVertical: 0, marginHorizontal: 0 }, existingSubmitApi.submitting && { opacity: 0.6 }]}
              onPress={() => guard(() => existingSubmitApi.submit('phase3'))}
              disabled={existingSubmitApi.submitting}
              data-testid="ei-move-phase3-bottom"
            >
              <Ionicons name={canSubmit ? 'arrow-forward-circle' : 'lock-closed'} size={20} color="#FFF" />
              <Text style={styles.continueBtnText} numberOfLines={2}>{existingSubmitApi.labels.phase3}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.continueBtn, { backgroundColor: canSubmit ? '#1565C0' : '#B0BEC5', marginVertical: 0, marginHorizontal: 0 }, existingSubmitApi.submitting && { opacity: 0.6 }]}
              onPress={() => guard(() => existingSubmitApi.submit('phase4_step1'))}
              disabled={existingSubmitApi.submitting}
              data-testid="ei-move-phase4-bottom"
            >
              {existingSubmitApi.submitting
                ? <ActivityIndicator color="#FFF" />
                : <><Ionicons name={canSubmit ? 'arrow-forward-circle' : 'lock-closed'} size={20} color="#FFF" /><Text style={styles.continueBtnText} numberOfLines={2}>{existingSubmitApi.labels.phase4}</Text></>}
            </TouchableOpacity>
            {!canSubmit && !existingSubmitApi.submitting && (
              <Text style={{ marginTop: 2, textAlign: 'center', color: '#90A4AE', fontSize: 12, fontWeight: '600' }}>
                {incompleteCount} section{incompleteCount > 1 ? 's' : ''} still incomplete — tap to see what's missing
              </Text>
            )}
            {!existingSubmitApi.isDraftResume && (
              <TouchableOpacity
                style={[styles.continueBtn, { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#CFD8DC', marginVertical: 0, marginHorizontal: 0 }, existingSubmitApi.submitting && { opacity: 0.6 }]}
                onPress={() => existingSubmitApi.submit('draft')}
                disabled={existingSubmitApi.submitting}
                data-testid="ei-save-draft-bottom"
              >
                <Ionicons name="save-outline" size={20} color="#37474F" />
                <Text style={[styles.continueBtnText, { color: '#37474F' }]}>Save Draft</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* iter-233: resume the routine-only block for Bone Graft + Continue. */}
      {!isExistingImplantCase && (<>

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
      {/* iter-231: hide for Existing Implant — that flow has its own
          "Submit for Approval and Move to …" buttons inside
          ExistingImplantSection.
          iter-260: visually disabled (greyed + lock icon + helper text)
          until all 4 sections are complete. Tap still works to surface
          the holistic Alert listing what's missing. */}
      {!isExistingImplantCase && (() => {
        const canContinue = [0, 1, 2, 3].every(i => existingStepDone[i]);
        const incompleteCount = [0, 1, 2, 3].filter(i => !existingStepDone[i]).length;
        return (
          <View onLayout={showFlowStrip ? onExistingStepLayout(4) : undefined}>
            <TouchableOpacity
              style={[styles.continueBtn, !canContinue && { backgroundColor: '#B0BEC5' }]}
              onPress={handleContinueToImplants}
              disabled={loading}
              data-testid="continue-to-implants"
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  {!canContinue && <Ionicons name="lock-closed" size={18} color="#FFF" />}
                  <Text style={styles.continueBtnText}>Continue to Implant Selection</Text>
                  {canContinue && <Ionicons name="arrow-forward" size={20} color="#FFF" />}
                </>
              )}
            </TouchableOpacity>
            {!canContinue && !loading && (
              <Text style={{ marginTop: 8, textAlign: 'center', color: '#90A4AE', fontSize: 12, fontWeight: '600' }}>
                {incompleteCount} section{incompleteCount > 1 ? 's' : ''} still incomplete — tap to see what's missing
              </Text>
            )}
          </View>
        );
      })()}
      </>)}
    </ScrollView>

    {/* iter-251: clinical-protocol info popover for Phase 1 Checklist items */}
    <Modal
      visible={!!activeTooltip}
      transparent
      animationType="fade"
      onRequestClose={() => setActiveTooltip(null)}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
        onPress={() => setActiveTooltip(null)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => { /* swallow taps on card */ }}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, maxWidth: 480, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 }}
          testID="checklist-info-modal"
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <Ionicons name="information-circle" size={22} color="#1565C0" style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: '#0D47A1', lineHeight: 22 }}>
              {activeTooltip?.label}
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: '#37474F', lineHeight: 21 }}>
            {activeTooltip?.tooltip}
          </Text>
          <TouchableOpacity
            onPress={() => setActiveTooltip(null)}
            style={{ marginTop: 16, alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#1565C0', borderRadius: 8 }}
            testID="checklist-info-close"
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Got it</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────
const staticStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0D47A1', marginLeft: 12, lineHeight: 22 },
  backBtn: { padding: 6 },
  stepIndicator: { fontSize: 13, color: '#1565C0', fontWeight: '700', marginLeft: 12, marginTop: 2, marginBottom: 12, letterSpacing: 0.3 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E7EE' },
  stepTitle: { fontSize: 18, fontWeight: '700', color: '#0D47A1', marginLeft: 12 },
  section: { backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 18, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#E8EDF5' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 14, letterSpacing: 0.3 },
  // iter-236: sticky progress strip for the Existing Implant workflow.
  existingProgressBar: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E3F2FD', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  existingProgressLabel: { fontSize: 13, fontWeight: '700', color: '#0F2740', letterSpacing: 0.2, flex: 1 },
  existingProgressCount: { fontSize: 12, fontWeight: '700', color: '#1565C0', marginLeft: 8 },
  existingProgressTrack: { marginTop: 8, height: 6, backgroundColor: '#E3F2FD', borderRadius: 999, overflow: 'hidden' },
  existingProgressFill: { height: 6, backgroundColor: '#1565C0', borderRadius: 999 },
  // iter-237: tappable step pills under the progress strip.
  // iter-238: pills now flex to fill the row evenly + render number/✓ icon
  // separately so they line up on a single tidy row.
  // iter-239: tightened paddings so the leading "2." / "3." numerals stay
  // fully inside the pill (they were clipping on narrow viewports).
  existingStepPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  existingStepPill: { flexGrow: 1, flexBasis: 0, minWidth: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#F8FAFC' },
  existingStepPillActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  existingStepPillDone: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  existingStepPillNum: { fontSize: 10, fontWeight: '700', color: '#37474F', marginRight: 4, lineHeight: 13 },
  existingStepPillText: { fontSize: 10, fontWeight: '600', color: '#37474F', letterSpacing: 0.1, lineHeight: 13, flexShrink: 1 },
  existingStepPillTextActive: { color: '#FFFFFF' },
  existingStepPillTextDone: { color: '#2E7D32' },
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
  hba1cRow: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E0E7EE', backgroundColor: '#FAFBFD' },
  hba1cLabel: { fontSize: 13, color: '#37474F', fontWeight: '600', marginBottom: 6 },
  hba1cOptional: { fontSize: 11, color: '#78909C', fontWeight: '400' },
  hba1cInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#263238', backgroundColor: '#FFF', maxWidth: 180 },
  haematologyWrap: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#CFD8DC' },
  haematologyHeading: { fontSize: 14, fontWeight: '700', color: '#1E3A5F', marginBottom: 10 },
  haematologyOptional: { fontSize: 11, fontWeight: '400', color: '#78909C' },
  haematologyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', gap: 12 },
  haematologyLabel: { fontSize: 13, color: '#263238', fontWeight: '600' },
  haematologyHint: { fontSize: 11, color: '#78909C', marginTop: 2 },
  haematologyInput: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#263238', backgroundColor: '#FFF', minWidth: 110, textAlign: 'right' },
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
  timeChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  timeChipCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  timeChipCircleActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  timeChipCircleText: { fontSize: 13, fontWeight: '700', color: '#666' },
  timeChipCircleTextActive: { color: '#FFF' },
  timeChipCapsule: { paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#D0DCE8', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  timeChipCapsuleActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  timeChipCapsuleText: { fontSize: 13, fontWeight: '700', color: '#666' },
  timeChipCapsuleTextActive: { color: '#FFF' },
  timeChipBadge: { position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#1565C0', borderWidth: 1, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  timeModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  timeModalContainer: { backgroundColor: '#F8FAFC', borderRadius: 28, padding: 24, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: '#CFD8DC', shadowColor: '#1565C0', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 },
  timeModalTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', alignSelf: 'flex-start', marginBottom: 20, letterSpacing: 0.3 },
  timeModalInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  timeModalBox: { width: 80, height: 72, borderRadius: 8, backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  timeModalBoxActive: { backgroundColor: '#E3F2FD', borderColor: '#1565C0' },
  timeModalInput: { fontSize: 44, fontWeight: '700', color: '#1E3A5F', width: 80, height: 60, textAlign: 'center', padding: 0, margin: 0, includeFontPadding: false, textAlignVertical: 'center' },
  timeModalColon: { fontSize: 44, fontWeight: '700', color: '#1E3A5F', marginHorizontal: 4, transform: [{ translateY: -4 }] },
  timeModalSubLabel: { fontSize: 11, color: '#546E7A', marginTop: 6, fontWeight: '500' },
  timeModalMeridiemContainer: { width: 52, height: 72, borderRadius: 8, borderWidth: 1.5, borderColor: '#CFD8DC', overflow: 'hidden', backgroundColor: '#F8FAFC' },
  timeModalMeridiemBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  timeModalMeridiemBtnActive: { backgroundColor: '#E3F2FD' },
  timeModalMeridiemText: { fontSize: 13, fontWeight: '700', color: '#546E7A' },
  timeModalMeridiemTextActive: { color: '#1565C0', fontWeight: '800' },
  timeModalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  timeModalFooterText: { color: '#1565C0', fontSize: 14, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4 },
  clockDial: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#ECEFF1', alignSelf: 'center', position: 'relative', overflow: 'hidden' },
  clockNumberBox: { position: 'absolute', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clockNumberBoxSelected: { backgroundColor: '#1565C0' },
  clockNumberText: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  clockNumberTextSelected: { color: '#FFFFFF', fontWeight: '800' },
});

const styles = staticStyles;
