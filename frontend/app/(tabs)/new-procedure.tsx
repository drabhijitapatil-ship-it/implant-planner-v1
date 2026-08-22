import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Platform, AppState, Linking, Image, Animated, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { getAuthFileUrl, getToken } from '../../utils/api';
import { showUploadPicker } from '../../utils/uploadPicker';
import { useAuth } from '../../contexts/AuthContext';
import BackButton from '../../components/BackButton';
import CaseImplantPlanning from '../../components/CaseImplantPlanning';
import { AtrophyClassificationChip } from '../../components/AtrophyClassificationChip';
import ExistingImplantSection from '../../components/ExistingImplantSection';
import FdiAnatomicalChart from '../../components/FdiAnatomicalChart';
import PredictiveRiskCard from '../../components/PredictiveRiskCard';
import ExistingPatientBanner from '../../components/ExistingPatientBanner';
import PatientNameMatchBanner from '../../components/PatientNameMatchBanner';
import ZygomaPterygoidPhase1Form, { ZygomaPterygoidPhase1Data } from '../../components/ZygomaPterygoidPhase1Form';
import GroupedDescDropdown from '../../components/GroupedDescDropdown';
import { validateImplantSelection, findMissingRuns, clusterLeader } from '../../utils/implantValidation';
import {
  PROCEDURE_TYPES,  LOADING_TYPES,
  PROCEDURES_WITH_NUM_IMPLANTS_QUESTION,
  SURGERY_APPROACH_TYPES, GUIDED_SURGERY_TYPES, STATIC_GUIDE_TYPES, SLEEVE_TYPES, DYNAMIC_NAV_SYSTEMS,
  normalizeSurgeryApproach, isGuidedApproach,
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
  isZygomaPterygoidProcedure,
  isZygomaFullArchProcedure,
  needsConventionalImplantLocation,
  PHASE1_ATTACHMENT_TYPE_OPTIONS,
} from '../../constants/checklist';

import { BACKEND_URL } from '../../utils/config';
import {
  PROVISIONAL_GROUPED_OPTIONS,
  SC_ABUTMENT_TYPE_OPTIONS,
  SC_RETENTION_TYPE_OPTIONS,
  SC_CROWN_MATERIAL_OPTIONS,
} from '../../constants/singleConventional';
import {
  GROUP_A_PROVISIONAL_OPTIONS,
  GROUP_A_PROSTHESIS_TYPE_OPTIONS,
  GROUP_A_ABUTMENT_TYPE_OPTIONS,
  GROUP_A_RETENTION_OPTIONS,
  GROUP_A_CROWN_MATERIAL_OPTIONS,
  GROUP_B_PROVISIONAL_OPTIONS,
  GROUP_B_PROSTHETIC_PLAN_OPTIONS,
  GROUP_C_PROVISIONAL_OPTIONS,
  GROUP_C_PROSTHETIC_PLAN_OPTIONS,
  getWorkflowGroup,
} from '../../constants/prosthesisWorkflows';

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
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(!open)} testID="calendar-trigger" data-testid="calendar-trigger">
        <Text style={[styles.dropdownText, !value && { color: '#999' }]}>
          {value || 'Select Date'}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#666" />
      </TouchableOpacity>
      {open && (
        <View style={calStyles.container}>
          <View style={calStyles.header}>
            <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn} testID="cal-prev">
              <Ionicons name="chevron-back" size={20} color="#1A73E8" />
            </TouchableOpacity>
            <Text style={calStyles.monthYear} testID="cal-header-title">{monthNames[viewMonth]} {viewYear}</Text>
            <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn} testID="cal-next">
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
                testID={day ? `cal-day-${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : undefined}
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
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ draftId?: string; augResumeId?: string }>();
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
    // iter-397: multi-implant episodes — id of this patient's latest prior case
    linked_parent_case_id: '',
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
    // iter-387: surgical-approach cascade (hidden for Existing Implant)
    procedure_surgery_type: '',
    guided_surgery_type: '',
    static_guide_type: '',
    sleeve_type: '',
    dynamic_nav_system: '',
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
    // iter-Feb-2026: Single-Conventional-Implant workflow fields.
    // Only used when implant_procedure_type === 'Single Conventional Implant'.
    // • type_of_provisional — required when Immediate Loading is picked.
    // • sc_abutment_type / sc_retention_type / sc_crown_material — replace
    //   the legacy Prosthetic Plan dropdown for this procedure type.
    type_of_provisional: '',
    type_of_provisional_other: '',
    sc_abutment_type: '',
    sc_retention_type: '',
    sc_crown_material: '',
    // iter-Feb-2026-B — Multiple / Full-Arch / Zygoma workflow.
    // Group A (Multi Conv + Pterygoid+Conv): 4 fields
    // Group B (All-on-X): fa_prosthetic_plan
    // Group C (Quad Zygoma + Zygo variants): zp_prosthetic_plan
    ma_prosthesis_type: '', ma_prosthesis_type_other: '',
    ma_abutment_type: '', ma_abutment_type_other: '',
    ma_retention_type: '', ma_retention_type_other: '',
    ma_crown_material: '', ma_crown_material_other: '',
    fa_prosthetic_plan: '', fa_prosthetic_plan_other: '',
    zp_prosthetic_plan: '', zp_prosthetic_plan_other: '',
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
    // iter-Feb-2026: Zygoma & Pterygoid workflow data.
    zygoma_pterygoid_data: {} as ZygomaPterygoidPhase1Data,
    zygoma_pterygoid_configuration: '',
    // iter-Feb-2026 (v3): Conventional implant placement sites for mixed
    // advanced+conventional cases (Pterygoid+Conv, Zygoma+Conv, all-3).
    conventional_implant_locations: [] as string[],
  });

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  // iter-251: Phase 1 Checklist info-popover — clinical protocol reminders
  // attached to each checklist item. Tap ℹ️ → modal shows the tooltip.
  const [activeTooltip, setActiveTooltip] = useState<{ label: string; tooltip: string } | null>(null);
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [showInchargePicker, setShowInchargePicker] = useState(false);

  // iter-231: for Existing Implant cases use the *original* procedure type
  // captured inside ExistingImplantSection so the Clinical Examination + Medical
  // Assessment blocks fire with the same gates (cluster, non-cluster, full-arch,
  // overdenture-as-full-arch) as routine cases.
  const isExistingImplantCase = formData.implant_procedure_type === 'Existing Implant';
  // iter-393: Pre-Implant Augmentation — when Yes, the implant-specific
  // sections are deferred and the case is created via a minimal endpoint.
  const [augmentationRequired, setAugmentationRequired] = useState<'' | 'Yes' | 'No'>('');
  const [submittingAug, setSubmittingAug] = useState(false);
  // iter-393: set when resuming Phase 1 after an approved augmentation
  // ("Proceed to Phase 2"). The augmentation question is hidden and the final
  // submit PUTs onto the existing case instead of creating a new one.
  const [augResumeId, setAugResumeId] = useState<string | null>(null);
  const isAugCase = augmentationRequired === 'Yes' && !isExistingImplantCase;

  // iter-397: existing-patient detection by registration number (hybrid
  // multi-implant mechanism). Debounced lookup → banner + auto-fill + link.
  const [patientLookup, setPatientLookup] = useState<any | null>(null);
  const [lookupDismissed, setLookupDismissed] = useState(false);
  const [lookupAutofilled, setLookupAutofilled] = useState(false);
  const lookupTimer = useRef<any>(null);
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const reg = formData.registration_number?.trim();
    // Skip while resuming a draft / augmentation case — the reg number there
    // belongs to the case being edited, not a new episode.
    if (!reg || reg.length < 2 || isDraftResume || !!params.draftId || !!augResumeId || !!createdProcedureId) {
      setPatientLookup(null);
      setLookupAutofilled(false);
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/procedures/patient-lookup?registration_number=${encodeURIComponent(reg)}`);
        if (res.data?.found) {
          setPatientLookup(res.data);
          setLookupDismissed(false);
          setFormData(prev => ({ ...prev, linked_parent_case_id: res.data.latest_case_id || '' }));
        } else {
          setPatientLookup(null);
          setLookupAutofilled(false);
          setFormData(prev => (prev.linked_parent_case_id ? { ...prev, linked_parent_case_id: '' } : prev));
        }
      } catch { setPatientLookup(null); }
    }, 600);
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); };
  }, [formData.registration_number, isDraftResume, params.draftId, augResumeId, createdProcedureId]);

  const applyPatientAutofill = () => {
    const p = patientLookup?.patient;
    if (!p) return;
    setFormData(prev => ({
      ...prev,
      patient_name: p.patient_name || prev.patient_name,
      age: p.age || prev.age,
      sex: p.sex || prev.sex,
      profession: p.profession || prev.profession,
      mobile_number: p.mobile_number || prev.mobile_number,
      patient_email: p.patient_email || prev.patient_email,
      medical_assessment: (p.medical_assessment && Object.keys(p.medical_assessment).length
        ? p.medical_assessment : prev.medical_assessment) as Record<string, string>,
      medical_risk_level: p.medical_risk_level || prev.medical_risk_level,
    }));
    setLookupAutofilled(true);
  };

  // iter-398: exact-name match detection ("same name → maybe same patient").
  // Never auto-links — the clinician confirms via auto-fill or hits Cancel.
  const [nameLookup, setNameLookup] = useState<any | null>(null);
  const [nameCancelledFor, setNameCancelledFor] = useState('');
  const nameTimer = useRef<any>(null);
  useEffect(() => {
    if (nameTimer.current) clearTimeout(nameTimer.current);
    const nm = formData.patient_name?.trim();
    if (!nm || nm.length < 3 || isDraftResume || !!params.draftId || !!augResumeId || !!createdProcedureId
        || !!patientLookup?.found || nameCancelledFor.toLowerCase() === nm.toLowerCase()) {
      setNameLookup(null);
      return;
    }
    nameTimer.current = setTimeout(async () => {
      try {
        const res = await api.get(`/procedures/patient-name-lookup?patient_name=${encodeURIComponent(nm)}`);
        setNameLookup(res.data?.found ? res.data : null);
      } catch { setNameLookup(null); }
    }, 600);
    return () => { if (nameTimer.current) clearTimeout(nameTimer.current); };
  }, [formData.patient_name, isDraftResume, params.draftId, augResumeId, createdProcedureId, patientLookup?.found, nameCancelledFor]);

  const applyNameMatchAutofill = (entry: any) => {
    const p = entry?.patient;
    if (!p) return;
    setFormData(prev => ({
      ...prev,
      patient_name: p.patient_name || prev.patient_name,
      age: p.age || prev.age,
      sex: p.sex || prev.sex,
      profession: p.profession || prev.profession,
      mobile_number: p.mobile_number || prev.mobile_number,
      patient_email: p.patient_email || prev.patient_email,
      registration_number: entry.registration_number || prev.registration_number,
      linked_parent_case_id: entry.latest_case_id || '',
      medical_assessment: (p.medical_assessment && Object.keys(p.medical_assessment).length
        ? p.medical_assessment : prev.medical_assessment) as Record<string, string>,
      medical_risk_level: p.medical_risk_level || prev.medical_risk_level,
    }));
    // Filling registration_number hands over to the reg-number lookup, whose
    // banner now renders in the already-auto-filled state.
    setLookupAutofilled(true);
    setNameLookup(null);
  };

  const cancelNameMatch = () => {
    setNameCancelledFor(formData.patient_name?.trim() || '');
    setNameLookup(null);
    setFormData(prev => (prev.linked_parent_case_id ? { ...prev, linked_parent_case_id: '' } : prev));
  };

  const submitAugmentationCase = async () => {
    const missing: string[] = [];
    if (!formData.patient_name?.trim()) missing.push('Patient Name');
    if (!formData.registration_number?.trim()) missing.push('Registration Number');
    if (!formData.supervisor_id) missing.push('Supervisor');
    if (!formData.implant_incharge_id) missing.push('Implant In-Charge');
    if (!formData.receipt_number?.trim()) missing.push('Receipt Number');
    if (!formData.amount_paid) missing.push('Amount Paid');
    if (!formData.procedure_date) missing.push('Augmentation Surgery Date');
    if (!formData.procedure_time) missing.push('Time Slot');
    if (missing.length) {
      Alert.alert('Incomplete', `Please complete:\n• ${missing.join('\n• ')}`);
      return;
    }
    setSubmittingAug(true);
    try {
      const res = await api.post('/procedures/augmentation-case', {
        student_name: (formData as any).student_name || user?.name || '',
        patient_name: formData.patient_name,
        age: formData.age, sex: formData.sex, profession: formData.profession,
        mobile_number: formData.mobile_number, patient_email: (formData as any).patient_email || '',
        registration_number: formData.registration_number,
        linked_parent_case_id: (formData as any).linked_parent_case_id || '',
        chief_complaint: formData.chief_complaint,
        supervisor_id: formData.supervisor_id, supervisor_name: formData.supervisor_name,
        implant_incharge_id: formData.implant_incharge_id, implant_incharge_name: formData.implant_incharge_name,
        receipt_number: formData.receipt_number,
        amount_paid: parseFloat(String(formData.amount_paid)) || 0,
        procedure_date: formData.procedure_date, procedure_time: formData.procedure_time,
        remark: (formData as any).remark || '',
      });
      const newId = res.data?.id;
      Alert.alert('Case Created', 'Pre-Implant Augmentation case created. Fill Step 1 — Pre-procedure Details from the case screen.');
      router.replace(`/procedures/${newId}`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to create case');
    } finally { setSubmittingAug(false); }
  };

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

  // iter-Feb-2026 (v3): Zygoma cases are anatomically maxillary-only. When
  // any of the 4 Zygoma procedure types is selected, auto-force the Arch
  // to "Maxillary" (both on initial selection and if the procedure type is
  // switched from a mandibular All-on-X to a Zygoma type).
  useEffect(() => {
    if (isZygomaFullArchProcedure(formData.implant_procedure_type) && formData.arch !== 'Maxillary') {
      setFormData(prev => ({ ...prev, arch: 'Maxillary' }));
    }
  }, [formData.implant_procedure_type, formData.arch]);


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
                procedure_surgery_type: normalizeSurgeryApproach(proc.procedure_surgery_type) || '',
                guided_surgery_type: proc.guided_surgery_type || '',
                static_guide_type: proc.static_guide_type || '',
                sleeve_type: proc.sleeve_type || '',
                dynamic_nav_system: proc.dynamic_nav_system || '',
                teeth_present: Array.isArray(proc.teeth_present) ? proc.teeth_present : [],
                missing_teeth: Array.isArray(proc.missing_teeth) ? proc.missing_teeth : [],
                edentulous_site_measurements: (proc.edentulous_site_measurements && typeof proc.edentulous_site_measurements === 'object') ? proc.edentulous_site_measurements : {},
                arch: proc.arch || '',
                loading_type: Array.isArray(proc.loading_type) ? proc.loading_type : [],
                prosthetic_plan: proc.prosthetic_plan || '',
                prosthetic_plan_other: proc.prosthetic_plan_other || '',
                attachment_type: proc.attachment_type || '',
                attachment_type_other: proc.attachment_type_other || '',
                // iter-Feb-2026: Single-Conventional-Implant workflow fields
                type_of_provisional: proc.type_of_provisional || '',
                type_of_provisional_other: proc.type_of_provisional_other || '',
                sc_abutment_type: proc.sc_abutment_type || '',
                sc_retention_type: proc.sc_retention_type || '',
                sc_crown_material: proc.sc_crown_material || '',
                ma_prosthesis_type: proc.ma_prosthesis_type || '',
                ma_prosthesis_type_other: proc.ma_prosthesis_type_other || '',
                ma_abutment_type: proc.ma_abutment_type || '',
                ma_abutment_type_other: proc.ma_abutment_type_other || '',
                ma_retention_type: proc.ma_retention_type || '',
                ma_retention_type_other: proc.ma_retention_type_other || '',
                ma_crown_material: proc.ma_crown_material || '',
                ma_crown_material_other: proc.ma_crown_material_other || '',
                fa_prosthetic_plan: proc.fa_prosthetic_plan || '',
                fa_prosthetic_plan_other: proc.fa_prosthetic_plan_other || '',
                zp_prosthetic_plan: proc.zp_prosthetic_plan || '',
                zp_prosthetic_plan_other: proc.zp_prosthetic_plan_other || '',
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
              // iter-356: hydrate intra-oral photographs on draft resume.
              if (Array.isArray(proc.intraoral_photos) && proc.intraoral_photos.length > 0) {
                const restored: (null | { filename: string; original_name: string; content_type: string; label: string })[] = [null, null];
                proc.intraoral_photos.forEach((f: any, i: number) => {
                  const rec = {
                    filename: f.filename,
                    original_name: f.original_name || f.filename,
                    content_type: f.content_type || '',
                    label: f.label || (i < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[i] : `Photo ${i + 1}`),
                  };
                  if (i < 2) restored[i] = rec;
                  else restored.push(rec);
                });
                setIntraoralPhotos(restored);
                if (proc.intraoral_photos.length > 2) setExtraIntraoralCount(proc.intraoral_photos.length - 2);
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
      } else if (params.augResumeId) {
        // iter-393: resume Phase 1 after approved augmentation Step 3 Review.
        const loadAugResume = async () => {
          try {
            const res = await api.get(`/procedures/${params.augResumeId}`);
            const proc = res.data;
            if (proc.augmentation_outcome !== 'proceed_phase2') return;
            setAugResumeId(params.augResumeId!);
            setAugmentationRequired('No');
            setCreatedProcedureId(null);
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
              receipt_number: '', amount_paid: '', procedure_date: '', procedure_time: '',
            }));
            setStep('details');
          } catch { /* ignore */ }
        };
        loadAugResume();
      } else {
        // iter-229: No draftId in route → start a fresh case. (Previously this
        // branch was gated on `!createdProcedureId` and `createdProcedureId`
        // sat in the dep array which caused useFocusEffect to re-fire the
        // moment loadDraft set the id — racing against `setExistingImplantDraft`
        // and clearing it before ExistingImplantSection saw the data.)
        setExistingImplantDraft(null);
        setFormData({
          patient_name: '', age: '', sex: '', profession: '', mobile_number: '', patient_email: '',
          registration_number: '', linked_parent_case_id: '', chief_complaint: '', student_name: user?.name || '',
          supervisor_id: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.id || '') : '',
          supervisor_name: (user?.role === 'supervisor' || user?.role === 'implant_incharge') ? (user?.name || '') : '',
          implant_incharge_id: user?.role === 'implant_incharge' ? (user?.id || '') : '',
          implant_incharge_name: user?.role === 'implant_incharge' ? (user?.name || '') : '',
          receipt_number: '', amount_paid: '', procedure_date: '', procedure_time: '',
          implant_procedure_type: '', num_implants: '', teeth_present: [] as string[], arch: '', loading_type: [] as string[],
          prosthetic_plan: '', prosthetic_plan_other: '', attachment_type: '', attachment_type_other: '', bone_graft_specifications: '',
          type_of_provisional: '', type_of_provisional_other: '',
          sc_abutment_type: '', sc_retention_type: '', sc_crown_material: '',
          ma_prosthesis_type: '', ma_prosthesis_type_other: '',
          ma_abutment_type: '', ma_abutment_type_other: '',
          ma_retention_type: '', ma_retention_type_other: '',
          ma_crown_material: '', ma_crown_material_other: '',
          fa_prosthetic_plan: '', fa_prosthetic_plan_other: '',
          zp_prosthetic_plan: '', zp_prosthetic_plan_other: '',
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
        setIntraoralPhotos([null, null]);
        setExtraIntraoralCount(0);
        setCreatedProcedureId(null);
        setIsDraftResume(false);
        setAugResumeId(null);
        setAugmentationRequired('');
        setStep('details');
        AsyncStorage.removeItem(FORM_STORAGE_KEY).catch(() => {});
      }
    }, [params.draftId, params.augResumeId, user?.name])
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
  const [cbctFiles, setCbctFiles] = useState<(null | { filename: string; original_name: string; content_type: string })[]>([null, null]);
  const [cbctUploadingIdx, setCbctUploadingIdx] = useState<number | null>(null);
  const [extraCbctCount, setExtraCbctCount] = useState(0);
  // iter-356: Patient Intra-oral Photograph section — same UI/interaction as
  // CBCT, but 2 fixed labelled slots ("Occlusal View", "Lateral view/Frontal
  // view") and extras get a free-text label input. Skipped for Existing
  // Implant cases (consistent with CBCT).
  const INTRAORAL_LABELS = ['Occlusal View', 'Lateral view/Frontal view'];
  const [intraoralPhotos, setIntraoralPhotos] = useState<(null | { filename: string; original_name: string; content_type: string; label: string })[]>([null, null]);
  const [intraoralUploadingIdx, setIntraoralUploadingIdx] = useState<number | null>(null);
  const [extraIntraoralCount, setExtraIntraoralCount] = useState(0);
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

  // iter-356: Patient Intra-oral Photograph helpers.
  // Slots 0 + 1 use the fixed labels above (mandatory). Extras (idx >= 2)
  // start with an empty custom label input.
  const pickIntraoralAtIndex = async (idx: number) => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/heic', 'image/heif']);
      if (!picked) return;
      setIntraoralUploadingIdx(idx);
      const formPayload = new FormData();
      formPayload.append('file', {
        uri: picked.uri,
        name: picked.name || 'intraoral.jpg',
        type: picked.type || 'image/jpeg',
      } as any);
      const res = await api.post('/uploads/cbct-temp', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = [...intraoralPhotos];
      while (updated.length <= idx) updated.push(null);
      const priorLabel = updated[idx]?.label
        || (idx < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[idx] : '');
      updated[idx] = {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        content_type: res.data.cbct_content_type,
        label: priorLabel,
      };
      setIntraoralPhotos(updated);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || 'Could not upload intra-oral photograph');
    } finally {
      setIntraoralUploadingIdx(null);
    }
  };

  const addExtraIntraoral = () => {
    setExtraIntraoralCount(prev => prev + 1);
    setIntraoralPhotos(prev => [...prev, null]);
  };
  const removeExtraIntraoral = (idx: number) => {
    const updated = [...intraoralPhotos];
    updated.splice(idx, 1);
    setIntraoralPhotos(updated);
    setExtraIntraoralCount(prev => Math.max(0, prev - 1));
  };
  const updateIntraoralLabel = (idx: number, next: string) => {
    setIntraoralPhotos(prev => {
      const u = [...prev];
      if (u[idx]) u[idx] = { ...u[idx]!, label: next };
      return u;
    });
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
    // iter-387: surgical-approach cascade validation (not for Existing Implant)
    if (!isExistingImplantCase) {
      if (!sanitized.procedure_surgery_type) {
        Alert.alert('Missing Field', 'Please select the Procedure Type (Free Hand / Combination / Guided Surgery).');
        return;
      }
      if (isGuidedApproach(sanitized.procedure_surgery_type)) {
        if (!sanitized.guided_surgery_type) {
          Alert.alert('Missing Field', 'Please select the Type of Guided Surgery.');
          return;
        }
        if (sanitized.guided_surgery_type === 'Static Guide') {
          if (!sanitized.static_guide_type) {
            Alert.alert('Missing Field', 'Please select the Type of Static Guide.');
            return;
          }
          if (!sanitized.sleeve_type) {
            Alert.alert('Missing Field', 'Please select the Type of Sleeve.');
            return;
          }
        }
        if (sanitized.guided_surgery_type === 'Dynamic Navigation' && !sanitized.dynamic_nav_system) {
          Alert.alert('Missing Field', 'Please select the Dynamic Navigation Surgery System.');
          return;
        }
      }
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
    // iter-Feb-2026 — Single-Conventional-Implant new workflow validation.
    if (sanitized.implant_procedure_type === 'Single Conventional Implant') {
      if (sanitized.loading_type.includes('Immediate Loading') && !sanitized.type_of_provisional) {
        Alert.alert('Missing Field', 'Please select the Type of Provisional for Immediate Loading.');
        return;
      }
      if (!sanitized.sc_abutment_type) {
        Alert.alert('Missing Field', 'Please select the Abutment Type.');
        return;
      }
      if (!sanitized.sc_retention_type) {
        Alert.alert('Missing Field', 'Please select the Type of Retention.');
        return;
      }
      if (!sanitized.sc_crown_material) {
        Alert.alert('Missing Field', 'Please select the Crown Material.');
        return;
      }
    }
    // iter-Feb-2026-B — Multiple / Full-Arch / Zygoma workflow validation.
    {
      const g = getWorkflowGroup(sanitized.implant_procedure_type);
      const otherFilled = (v: string, o: string) => v !== 'Other' || (o && o.trim().length > 0);
      if (g && sanitized.loading_type.includes('Immediate Loading')) {
        if (!sanitized.type_of_provisional) {
          Alert.alert('Missing Field', 'Please select the Type of Provisional.'); return;
        }
        if (!otherFilled(sanitized.type_of_provisional, sanitized.type_of_provisional_other)) {
          Alert.alert('Missing Field', 'Please describe the custom Type of Provisional.'); return;
        }
      }
      if (g === 'A') {
        const rows: [string, string, string, string][] = [
          ['Prosthesis Type', sanitized.ma_prosthesis_type, sanitized.ma_prosthesis_type_other, 'ma_prosthesis_type'],
          ['Abutment Type', sanitized.ma_abutment_type, sanitized.ma_abutment_type_other, 'ma_abutment_type'],
          ['Type of Retention', sanitized.ma_retention_type, sanitized.ma_retention_type_other, 'ma_retention_type'],
          ['Crown/Bridge Material', sanitized.ma_crown_material, sanitized.ma_crown_material_other, 'ma_crown_material'],
        ];
        for (const [label, val, other] of rows) {
          if (!val) { Alert.alert('Missing Field', `Please select ${label}.`); return; }
          if (!otherFilled(val, other)) { Alert.alert('Missing Field', `Please describe the custom ${label}.`); return; }
        }
      } else if (g === 'B') {
        if (!sanitized.fa_prosthetic_plan) { Alert.alert('Missing Field', 'Please select the Prosthetic Plan.'); return; }
        if (!otherFilled(sanitized.fa_prosthetic_plan, sanitized.fa_prosthetic_plan_other)) {
          Alert.alert('Missing Field', 'Please describe the custom Prosthetic Plan.'); return;
        }
      } else if (g === 'C') {
        if (!sanitized.zp_prosthetic_plan) { Alert.alert('Missing Field', 'Please select the Prosthetic Plan.'); return; }
        if (!otherFilled(sanitized.zp_prosthetic_plan, sanitized.zp_prosthetic_plan_other)) {
          Alert.alert('Missing Field', 'Please describe the custom Prosthetic Plan.'); return;
        }
      }
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
        // iter-356: Patient Intra-oral Photograph payload — includes the fixed
        // labels for slots 0 + 1 and the user-entered labels for extras.
        ...(intraoralPhotos.filter(f => f !== null).length > 0 ? {
          intraoral_photos: intraoralPhotos.filter(f => f !== null).map((f, i) => ({
            filename: f!.filename,
            original_name: f!.original_name,
            content_type: f!.content_type,
            label: f!.label || (i < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[i] : `Photo ${i + 1}`),
          })),
        } : {}),
        // iter-Feb-2026: Zygoma & Pterygoid workflow payload — only send
        // when procedure type is one of the advanced maxillary types.
        ...(isZygomaPterygoidProcedure(sanitized.implant_procedure_type) ? {
          zygoma_pterygoid_data: { phase1: sanitized.zygoma_pterygoid_data || {} },
          zygoma_pterygoid_configuration: sanitized.zygoma_pterygoid_configuration || '',
        } : {}),
        // iter-Feb-2026 (v3): Conventional implant sites for mixed cases.
        ...(needsConventionalImplantLocation(sanitized.implant_procedure_type) ? {
          conventional_implant_locations: sanitized.conventional_implant_locations || [],
        } : {}),
        // iter-Feb-2026 — Single-Conventional-Implant new workflow payload.
        // Only send these fields for the pure Single Conventional Implant
        // procedure type. Blank strings ⇒ backend stores null.
        ...(sanitized.implant_procedure_type === 'Single Conventional Implant' ? {
          type_of_provisional: sanitized.loading_type.includes('Immediate Loading')
            ? (sanitized.type_of_provisional || '')
            : '',
          sc_abutment_type: sanitized.sc_abutment_type || '',
          sc_retention_type: sanitized.sc_retention_type || '',
          sc_crown_material: sanitized.sc_crown_material || '',
        } : {}),
        // iter-Feb-2026-B — Multiple/Full-Arch/Zygoma workflow payload.
        ...(() => {
          const g = getWorkflowGroup(sanitized.implant_procedure_type);
          if (!g) return {};
          const provIL = sanitized.loading_type.includes('Immediate Loading');
          const base: Record<string, any> = {
            type_of_provisional: provIL ? (sanitized.type_of_provisional || '') : '',
            type_of_provisional_other: provIL && sanitized.type_of_provisional === 'Other'
              ? (sanitized.type_of_provisional_other || '') : '',
          };
          if (g === 'A') {
            base.ma_prosthesis_type = sanitized.ma_prosthesis_type || '';
            base.ma_prosthesis_type_other = sanitized.ma_prosthesis_type === 'Other' ? (sanitized.ma_prosthesis_type_other || '') : '';
            base.ma_abutment_type = sanitized.ma_abutment_type || '';
            base.ma_abutment_type_other = sanitized.ma_abutment_type === 'Other' ? (sanitized.ma_abutment_type_other || '') : '';
            base.ma_retention_type = sanitized.ma_retention_type || '';
            base.ma_retention_type_other = sanitized.ma_retention_type === 'Other' ? (sanitized.ma_retention_type_other || '') : '';
            base.ma_crown_material = sanitized.ma_crown_material || '';
            base.ma_crown_material_other = sanitized.ma_crown_material === 'Other' ? (sanitized.ma_crown_material_other || '') : '';
          } else if (g === 'B') {
            base.fa_prosthetic_plan = sanitized.fa_prosthetic_plan || '';
            base.fa_prosthetic_plan_other = sanitized.fa_prosthetic_plan === 'Other' ? (sanitized.fa_prosthetic_plan_other || '') : '';
          } else if (g === 'C') {
            base.zp_prosthetic_plan = sanitized.zp_prosthetic_plan || '';
            base.zp_prosthetic_plan_other = sanitized.zp_prosthetic_plan === 'Other' ? (sanitized.zp_prosthetic_plan_other || '') : '';
          }
          return base;
        })(),
      };

      let res;
      if (augResumeId) {
        // iter-393: post-augmentation — merge Phase 1 details onto the existing case.
        res = await api.put(`/procedures/${augResumeId}/augmentation/complete-phase1`, payload);
      } else {
        res = await api.post('/procedures', payload);
      }

      const procId = res.data.id || res.data._id || augResumeId;

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
          <PredictiveRiskCard
            procedureType={formData.implant_procedure_type}
            boneType={null}
            toothRegion={null}
          />
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
      if (!formData.prosthetic_plan
          && formData.implant_procedure_type !== 'Single Conventional Implant'
          && getWorkflowGroup(formData.implant_procedure_type) === null) {
        missImplantDetails.push('Prosthetic Plan');
      }
      // iter-Feb-2026 — new Single-Conventional-Implant plan (3 sub-fields).
      if (formData.implant_procedure_type === 'Single Conventional Implant') {
        if (!formData.sc_abutment_type) missImplantDetails.push('Abutment Type');
        if (!formData.sc_retention_type) missImplantDetails.push('Type of Retention');
        if (!formData.sc_crown_material) missImplantDetails.push('Crown Material');
      }
      // iter-Feb-2026-B — Group A/B/C plan validation for review pill.
      {
        const g = getWorkflowGroup(formData.implant_procedure_type);
        if (g === 'A') {
          if (!formData.ma_prosthesis_type) missImplantDetails.push('Prosthesis Type');
          if (!formData.ma_abutment_type) missImplantDetails.push('Abutment Type');
          if (!formData.ma_retention_type) missImplantDetails.push('Type of Retention');
          if (!formData.ma_crown_material) missImplantDetails.push('Crown/Bridge Material');
        } else if (g === 'B') {
          if (!formData.fa_prosthetic_plan) missImplantDetails.push('Prosthetic Plan');
        } else if (g === 'C') {
          if (!formData.zp_prosthetic_plan) missImplantDetails.push('Prosthetic Plan');
        }
      }
      // iter-387: surgical-approach cascade requirements
      if (!formData.procedure_surgery_type) missImplantDetails.push('Procedure Type');
      else if (isGuidedApproach(formData.procedure_surgery_type)) {
        if (!formData.guided_surgery_type) missImplantDetails.push('Type of Guided Surgery');
        else if (formData.guided_surgery_type === 'Static Guide') {
          if (!formData.static_guide_type) missImplantDetails.push('Type of Static Guide');
          else if (!formData.sleeve_type) missImplantDetails.push('Type of Sleeve');
        } else if (formData.guided_surgery_type === 'Dynamic Navigation' && !formData.dynamic_nav_system) {
          missImplantDetails.push('Dynamic Navigation Surgery System');
        }
      }
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
      if (!intraoralPhotos[0] || !intraoralPhotos[1]) missMedicalOrChecklist.push('Both Patient Intra-oral Photographs');
      if (!formData.loading_type || formData.loading_type.length === 0) missMedicalOrChecklist.push('Type of Loading');
      // iter-Feb-2026 / -B — Type of Provisional (SC + Group A/B/C when Immediate Loading picked)
      if ((formData.implant_procedure_type === 'Single Conventional Implant'
            || getWorkflowGroup(formData.implant_procedure_type) !== null)
          && (formData.loading_type || []).includes('Immediate Loading')
          && !formData.type_of_provisional) {
        missMedicalOrChecklist.push('Type of Provisional');
      }
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
            autoCorrect={false} autoCapitalize="none" testID="patient-name-input" data-testid="patient-name-input" />
        </View>
        {!!nameLookup?.found && !patientLookup?.found && (
          <PatientNameMatchBanner
            key={(nameLookup.patients || []).map((p: any) => p.registration_number).join('|')}
            lookup={nameLookup}
            name={formData.patient_name?.trim() || ''}
            onConfirmAutofill={applyNameMatchAutofill}
            onCancel={cancelNameMatch}
          />
        )}
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
            onChangeText={v => updateForm('registration_number', v)} placeholder="Enter registration number" testID="registration-number-input" data-testid="registration-number-input" />
        </View>
        {!!patientLookup?.found && !lookupDismissed && (
          <ExistingPatientBanner
            lookup={patientLookup}
            autofilled={lookupAutofilled}
            onAutofill={applyPatientAutofill}
            onDismiss={() => setLookupDismissed(true)}
          />
        )}
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

      {!isAugCase && (<>
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
            // iter-387: Tooth Supported Guide is not offered for full-arch
            // procedures; Existing Implant hides the whole approach cascade.
            if (['All on 4', 'All on 6', 'All on X'].includes(v) && formData.static_guide_type === 'Tooth Supported Guide') {
              updateForm('static_guide_type', '');
              updateForm('sleeve_type', '');
            }
            if (v === 'Existing Implant') {
              updateForm('procedure_surgery_type', '');
              updateForm('guided_surgery_type', '');
              updateForm('static_guide_type', '');
              updateForm('sleeve_type', '');
              updateForm('dynamic_nav_system', '');
            }
          }} required />

        {/* iter-387: Surgical-approach cascade — Procedure Type → Type of
            Guided Surgery → (Static Guide path | Dynamic Navigation path).
            Hidden for Existing Implant (no new surgery planned). */}
        {!!formData.implant_procedure_type && formData.implant_procedure_type !== 'Existing Implant' && (
          <Dropdown
            label="Procedure Type"
            value={formData.procedure_surgery_type}
            options={SURGERY_APPROACH_TYPES}
            onChange={v => {
              updateForm('procedure_surgery_type', v);
              updateForm('guided_surgery_type', '');
              updateForm('static_guide_type', '');
              updateForm('sleeve_type', '');
              updateForm('dynamic_nav_system', '');
            }}
            required
            data-testid="procedure-surgery-type-dropdown"
          />
        )}
        {isGuidedApproach(formData.procedure_surgery_type) &&
          formData.implant_procedure_type !== 'Existing Implant' && (
          <Dropdown
            label="Type of Guided Surgery"
            value={formData.guided_surgery_type}
            options={GUIDED_SURGERY_TYPES}
            onChange={v => {
              updateForm('guided_surgery_type', v);
              updateForm('static_guide_type', '');
              updateForm('sleeve_type', '');
              updateForm('dynamic_nav_system', '');
            }}
            required
            data-testid="guided-surgery-type-dropdown"
          />
        )}
        {formData.guided_surgery_type === 'Static Guide' &&
          isGuidedApproach(formData.procedure_surgery_type) && (
          <Dropdown
            label="Type of Static Guide"
            value={formData.static_guide_type}
            options={['All on 4', 'All on 6', 'All on X'].includes(formData.implant_procedure_type)
              ? STATIC_GUIDE_TYPES.filter(o => o !== 'Tooth Supported Guide')
              : STATIC_GUIDE_TYPES}
            onChange={v => {
              updateForm('static_guide_type', v);
              updateForm('sleeve_type', '');
            }}
            required
            data-testid="static-guide-type-dropdown"
          />
        )}
        {formData.guided_surgery_type === 'Static Guide' && !!formData.static_guide_type && (
          <Dropdown
            label="Type of Sleeve"
            value={formData.sleeve_type}
            options={SLEEVE_TYPES}
            onChange={v => updateForm('sleeve_type', v)}
            required
            data-testid="sleeve-type-dropdown"
          />
        )}
        {formData.guided_surgery_type === 'Dynamic Navigation' &&
          isGuidedApproach(formData.procedure_surgery_type) && (
          <Dropdown
            label="Dynamic Navigation Surgery System"
            value={formData.dynamic_nav_system}
            options={DYNAMIC_NAV_SYSTEMS}
            onChange={v => updateForm('dynamic_nav_system', v)}
            required
            data-testid="dynamic-nav-system-dropdown"
          />
        )}

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
        {/* iter-Feb-2026: Zygoma & Pterygoid Advanced Workflow — surfaces
            when one of the 4 advanced maxillary procedure types is selected.
            Renders as a self-contained extended Phase 1 form and persists
            data under formData.zygoma_pterygoid_data (nested dict). */}
        {isZygomaPterygoidProcedure(formData.implant_procedure_type) && (
          <View style={{ marginTop: 8 }}>
            <ZygomaPterygoidPhase1Form
              procedureType={formData.implant_procedure_type}
              value={{
                ...(formData.zygoma_pterygoid_data || {}),
                configuration: formData.zygoma_pterygoid_configuration || (formData.zygoma_pterygoid_data as any)?.configuration,
              }}
              onChange={(next: ZygomaPterygoidPhase1Data) => {
                updateForm('zygoma_pterygoid_data', next);
                // Also mirror the top-level configuration for validation.
                if (next.configuration !== undefined) {
                  updateForm('zygoma_pterygoid_configuration', next.configuration);
                }
              }}
            />
          </View>
        )}

        {/* iter-235: hide the Arch dropdown for Existing Implant — it lives
            inside the ExistingImplantSection between Type of Implant Procedure
            Done and Implant Selection instead. */}
        {isFullArch && !isExistingImplantCase && (
          isZygomaFullArchProcedure(formData.implant_procedure_type) ? (
            // iter-Feb-2026 (v3): Zygoma implants are anatomically maxillary-
            // only. Lock the Arch to "Maxillary" (read-only chip) and skip
            // the Mandibular option entirely.
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Arch <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <View style={s_zyg_arch.lockedChip} testID="arch-locked-maxillary">
                <Ionicons name="lock-closed" size={14} color="#5E35B1" />
                <Text style={s_zyg_arch.lockedText}>Maxillary (locked — Zygoma cases are maxillary-only)</Text>
              </View>
            </View>
          ) : (
            <Dropdown label="Arch" value={formData.arch}
              options={['Maxillary', 'Mandibular']} onChange={v => updateForm('arch', v)} required data-testid="arch-dropdown" />
          )
        )}
      </View>

      </>)}

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

      {/* ─── iter-393: Pre-Implant Augmentation gate (after Payment Details) ─── */}
      {!!augResumeId && (
        <View style={[styles.section, { backgroundColor: '#F1F8F2', borderColor: '#A5D6A7', borderWidth: 1 }]} testID="aug-resume-banner" data-testid="aug-resume-banner">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#1B5E20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-done" size={21} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1B5E20', fontWeight: '800', fontSize: 14.5 }}>Pre-Implant Augmentation Approved</Text>
              <Text style={{ color: '#33691E', fontSize: 12.5, marginTop: 3, lineHeight: 18 }}>
                The bone graft has healed and been signed off. Complete the Phase 1 implant details below to proceed to Phase 2.
              </Text>
            </View>
          </View>
        </View>
      )}
      {!isExistingImplantCase && !augResumeId && (
        <View style={styles.section} testID="augmentation-question-section" data-testid="augmentation-question-section">
          <Text style={styles.sectionTitle}>Is Bone Augmentation Required Before Implant Placement? <Text style={{ color: '#DC3545' }}>*</Text></Text>
          <View style={styles.chipRow}>
            {['Yes', 'No'].map(o => (
              <TouchableOpacity key={o}
                style={[styles.chip, augmentationRequired === o && styles.chipActive]}
                onPress={() => setAugmentationRequired(o as any)}
                testID={`aug-required-${o.toLowerCase()}`} data-testid={`aug-required-${o.toLowerCase()}`}>
                <Text style={[styles.chipText, augmentationRequired === o && styles.chipTextActive]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isAugCase && (
            <View style={[styles.riskBadge, { backgroundColor: '#EFEBE9', marginTop: 10 }]}>
              <Text style={{ color: '#5D4037', fontSize: 12.5 }}>
                Bone grafting will be completed and reviewed first. The implant-specific sections (Procedure Type, CBCT, Implant Selection…) are deferred until the graft heals and is approved — then the regular Phase 1 workflow resumes.
              </Text>
            </View>
          )}
        </View>
      )}

      {isAugCase && (
        <>
          <View style={styles.section} testID="aug-schedule-section" data-testid="aug-schedule-section">
            <Text style={styles.sectionTitle}>Schedule Pre-Implant Augmentation Surgery</Text>
            <CalendarPicker
              label="Augmentation Surgery Date"
              value={formData.procedure_date}
              onChange={(date) => {
                updateForm('procedure_date', date);
                updateForm('procedure_time', '');
              }}
              required
            />
            {formData.procedure_date && (() => {
              const d = new Date(formData.procedure_date + 'T00:00:00');
              const dayOfWeek = d.getDay();
              if (dayOfWeek === 0) {
                return (
                  <View style={[styles.riskBadge, { backgroundColor: '#FFF3E0' }]}>
                    <Text style={{ color: '#E65100', fontWeight: '600', fontSize: 13 }}>No procedure slots available on Sundays</Text>
                  </View>
                );
              }
              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const dayName = dayNames[dayOfWeek];
              const availableSlots = PROCEDURE_TIME_SLOTS.filter(sl => sl.days.includes(dayName));
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
                            testID={`aug-slot-${slot.value}`} data-testid={`aug-slot-${slot.value}`}>
                            <Text style={[styles.chipText, isSelected && styles.chipTextActive, isBooked && styles.chipBookedText]}>{slot.label}</Text>
                            {isBooked && <Ionicons name="lock-closed" size={12} color="#999" style={{ marginLeft: 4 }} />}
                          </TouchableOpacity>
                          {isBooked && (
                            <Text style={styles.bookedInfo} numberOfLines={1}>{booked.patient_name} ({booked.scheduled_by})</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 28 }}>
            <TouchableOpacity style={[styles.submitBtn, submittingAug && { opacity: 0.6 }]}
              onPress={submitAugmentationCase} disabled={submittingAug} testID="aug-create-case-btn" data-testid="aug-create-case-btn">
              {submittingAug ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="bandage" size={18} color="#FFF" /><Text style={styles.submitBtnText}>Create Case — Pre-Implant Augmentation</Text></>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {formData.implant_procedure_type !== 'Existing Implant' && !isAugCase && (<>

      {/* ─── Prosthetic Treatment Plan ─── (moved here per iter-134; now appears
            BEFORE the FDI chart so that an Overdenture-with-Attachment choice
            can flip the case into a full-arch protocol and skip teeth selection.)

            iter-Feb-2026 — For pure Single Conventional Implant cases the
            legacy single dropdown is replaced by a 3-part flow (Abutment /
            Retention / Crown Material). All other procedure types keep the
            existing single Prosthetic-Plan dropdown. */}
      {(formData.implant_procedure_type === 'Single Conventional Implant') ? (
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(1) : undefined}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <GroupedDescDropdown
            label="1. Abutment Type"
            required
            value={formData.sc_abutment_type}
            onChange={v => updateForm('sc_abutment_type', v)}
            options={SC_ABUTMENT_TYPE_OPTIONS}
            testID="sc-abutment-type-dropdown"
          />
          <GroupedDescDropdown
            label="2. Type of Retention"
            required
            value={formData.sc_retention_type}
            onChange={v => updateForm('sc_retention_type', v)}
            options={SC_RETENTION_TYPE_OPTIONS}
            testID="sc-retention-type-dropdown"
          />
          <GroupedDescDropdown
            label="3. Crown Material"
            required
            value={formData.sc_crown_material}
            onChange={v => updateForm('sc_crown_material', v)}
            options={SC_CROWN_MATERIAL_OPTIONS}
            testID="sc-crown-material-dropdown"
          />
        </View>
      ) : getWorkflowGroup(formData.implant_procedure_type) === 'A' ? (
        // iter-Feb-2026-B — Group A: Multiple Conv / Pterygoid + Conv → 4-part flow.
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(1) : undefined}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <GroupedDescDropdown label="1. Prosthesis Type" required
            value={formData.ma_prosthesis_type}
            onChange={v => { updateForm('ma_prosthesis_type', v); if (v !== 'Other') updateForm('ma_prosthesis_type_other', ''); }}
            options={GROUP_A_PROSTHESIS_TYPE_OPTIONS}
            testID="ma-prosthesis-type-dropdown" />
          {formData.ma_prosthesis_type === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthesis Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.ma_prosthesis_type_other}
                onChangeText={v => updateForm('ma_prosthesis_type_other', v)}
                placeholder="Enter custom prosthesis type" multiline
                data-testid="ma-prosthesis-type-other-input" />
            </View>
          )}
          <GroupedDescDropdown label="2. Abutment Type" required
            value={formData.ma_abutment_type}
            onChange={v => { updateForm('ma_abutment_type', v); if (v !== 'Other') updateForm('ma_abutment_type_other', ''); }}
            options={GROUP_A_ABUTMENT_TYPE_OPTIONS}
            testID="ma-abutment-type-dropdown" />
          {formData.ma_abutment_type === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Abutment Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.ma_abutment_type_other}
                onChangeText={v => updateForm('ma_abutment_type_other', v)}
                placeholder="Enter custom abutment type" multiline
                data-testid="ma-abutment-type-other-input" />
            </View>
          )}
          <GroupedDescDropdown label="3. Type of Retention" required
            value={formData.ma_retention_type}
            onChange={v => { updateForm('ma_retention_type', v); if (v !== 'Other') updateForm('ma_retention_type_other', ''); }}
            options={GROUP_A_RETENTION_OPTIONS}
            testID="ma-retention-type-dropdown" />
          {formData.ma_retention_type === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Retention Type <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.ma_retention_type_other}
                onChangeText={v => updateForm('ma_retention_type_other', v)}
                placeholder="Enter custom retention type" multiline
                data-testid="ma-retention-type-other-input" />
            </View>
          )}
          <GroupedDescDropdown label="4. Crown/Bridge Material" required
            value={formData.ma_crown_material}
            onChange={v => { updateForm('ma_crown_material', v); if (v !== 'Other') updateForm('ma_crown_material_other', ''); }}
            options={GROUP_A_CROWN_MATERIAL_OPTIONS}
            testID="ma-crown-material-dropdown" />
          {formData.ma_crown_material === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Crown/Bridge Material <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.ma_crown_material_other}
                onChangeText={v => updateForm('ma_crown_material_other', v)}
                placeholder="Enter custom material" multiline
                data-testid="ma-crown-material-other-input" />
            </View>
          )}
        </View>
      ) : getWorkflowGroup(formData.implant_procedure_type) === 'B' ? (
        // iter-Feb-2026-B — Group B: All on 4/6/X → single grouped plan.
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(1) : undefined}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <GroupedDescDropdown label="Prosthetic Plan" required
            value={formData.fa_prosthetic_plan}
            onChange={v => { updateForm('fa_prosthetic_plan', v); if (v !== 'Other') updateForm('fa_prosthetic_plan_other', ''); }}
            groups={GROUP_B_PROSTHETIC_PLAN_OPTIONS}
            testID="fa-prosthetic-plan-dropdown" />
          {formData.fa_prosthetic_plan === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthetic Plan <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.fa_prosthetic_plan_other}
                onChangeText={v => updateForm('fa_prosthetic_plan_other', v)}
                placeholder="Enter custom prosthetic plan" multiline
                data-testid="fa-prosthetic-plan-other-input" />
            </View>
          )}
        </View>
      ) : getWorkflowGroup(formData.implant_procedure_type) === 'C' ? (
        // iter-Feb-2026-B — Group C: Quad Zygoma + Zygo variants → 6-option plan.
        <View style={styles.section} onLayout={showFlowStrip ? onExistingStepLayout(1) : undefined}>
          <Text style={styles.sectionTitle}>Prosthetic Treatment Plan</Text>
          <GroupedDescDropdown label="Prosthetic Plan" required
            value={formData.zp_prosthetic_plan}
            onChange={v => { updateForm('zp_prosthetic_plan', v); if (v !== 'Other') updateForm('zp_prosthetic_plan_other', ''); }}
            options={GROUP_C_PROSTHETIC_PLAN_OPTIONS}
            testID="zp-prosthetic-plan-dropdown" />
          {formData.zp_prosthetic_plan === 'Other' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Specify Prosthetic Plan <Text style={{ color: '#DC3545' }}>*</Text></Text>
              <TextInput style={styles.input} value={formData.zp_prosthetic_plan_other}
                onChangeText={v => updateForm('zp_prosthetic_plan_other', v)}
                placeholder="Enter custom prosthetic plan" multiline
                data-testid="zp-prosthetic-plan-other-input" />
            </View>
          )}
        </View>
      ) : prostheticOptions.length > 0 && (
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

      {/* iter-Feb-2026 (v3): Conventional Implant Location FDI chart.
          Appears for the 3 mixed advanced+conventional procedure types
          (Pterygoid+Conventional, Zygoma+Conventional, and
          Zygoma,Pterygoid+Conventional). Same anatomical chart as
          "Missing Teeth" but drives a separate field
          `conventional_implant_locations`. Red for selected sites, no
          blue for unselected — the operator picks the FDI positions
          where conventional implants will be placed. These positions
          are later used during Implant Selection. */}
      {needsConventionalImplantLocation(formData.implant_procedure_type) && (() => {
        const locs = formData.conventional_implant_locations || [];
        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conventional Implant Location</Text>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              Select the location where conventional implant/implants need to be placed
            </Text>
            <FdiAnatomicalChart
              mode="multi"
              value={locs}
              onChange={(next) => updateForm('conventional_implant_locations', next as string[])}
              selectedColor="#E53935"
              presentColor="#FAFAFA"
              presentBorderColor="#B0BEC5"
              selectedLabel="Implant Location"
              hidePresentLegend
              testIDPrefix="fdi-conv-implant-loc"
            />
            {locs.length > 0 ? (
              <Text style={{ fontSize: 12, color: '#B71C1C', fontWeight: '700', marginTop: 8, textAlign: 'center' }}>
                {locs.length} {locs.length === 1 ? 'site' : 'sites'} marked — {locs.slice().sort().join(', ')}
              </Text>
            ) : null}
          </View>
        );
      })()}

      </>)}

      {!isAugCase && (<>
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
              {/* iter-Feb-2026 (v3): also hide for Zygoma cases — the extended
                  Zygoma Phase 1 form already captures Cawood-Howell class,
                  Bedrossian zones, ZAGA classification and detailed zygomatic/
                  pterygomaxillary bone assessments; a generic atrophy chip
                  would duplicate that data and mis-classify severe atrophy. */}
              {!isExistingImplantCase && !isZygomaFullArchProcedure(formData.implant_procedure_type) && (<>
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
      </>)}
      {!isExistingImplantCase && !isAugCase && (<>

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

      {/* iter-Feb-2026 — Type of Provisional
            Single-Conventional-Implant (immediate loading) uses the original
            single-tooth catalogue.

            iter-Feb-2026-B — All other Groups (A/B/C) also render a
            provisional dropdown here when Immediate Loading is picked.
            Precedence: C > B > A > SC. Each group has its own catalogue. */}
      {formData.implant_procedure_type === 'Single Conventional Implant'
        && formData.loading_type.includes('Immediate Loading') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Type of Provisional <Text style={{ color: '#DC3545' }}>*</Text>
          </Text>
          <GroupedDescDropdown
            value={formData.type_of_provisional}
            onChange={v => {
              updateForm('type_of_provisional', v);
              if (v !== 'Other') updateForm('type_of_provisional_other', '');
            }}
            groups={PROVISIONAL_GROUPED_OPTIONS}
            placeholder="Select a provisional…"
            testID="type-of-provisional-dropdown"
          />
        </View>
      )}
      {getWorkflowGroup(formData.implant_procedure_type) !== null
        && formData.loading_type.includes('Immediate Loading') && (() => {
          const g = getWorkflowGroup(formData.implant_procedure_type);
          const groupsOptions =
            g === 'A' ? GROUP_A_PROVISIONAL_OPTIONS
            : g === 'B' ? GROUP_B_PROVISIONAL_OPTIONS
            : GROUP_C_PROVISIONAL_OPTIONS;
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Type of Provisional <Text style={{ color: '#DC3545' }}>*</Text>
              </Text>
              <GroupedDescDropdown
                value={formData.type_of_provisional}
                onChange={v => {
                  updateForm('type_of_provisional', v);
                  if (v !== 'Other') updateForm('type_of_provisional_other', '');
                }}
                groups={groupsOptions}
                placeholder="Select a provisional…"
                testID="type-of-provisional-dropdown"
              />
              {formData.type_of_provisional === 'Other' && (
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>
                    Specify Provisional <Text style={{ color: '#DC3545' }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={formData.type_of_provisional_other}
                    onChangeText={v => updateForm('type_of_provisional_other', v)}
                    placeholder="Enter custom provisional description"
                    multiline
                    data-testid="type-of-provisional-other-input"
                  />
                </View>
              )}
            </View>
          );
        })()}

      {/* Prosthetic Treatment Plan was moved up to immediately follow Procedure
          Information (iter-134). Empty placeholder retained intentionally. */}

      {/* ─── CBCT Report Upload (Mandatory: 2 minimum) ─── */}
      {/* iter-231: skipped for Existing Implant cases — intake CBCT is
          captured directly on the implant cards instead. */}
      {!isExistingImplantCase && !isAugCase && (
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

      {/* ─── iter-356: Patient Intra-oral Photograph (Mandatory: 2 minimum) ─── */}
      {/* Skipped for Existing Implant cases (consistent with CBCT). Same
          slot-based UX as CBCT but slots 0+1 have fixed labels ("Occlusal
          View" / "Lateral view/Frontal view"). Extras get an editable custom
          label. */}
      {!isExistingImplantCase && !isAugCase && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Patient Intra-oral Photograph <Text style={{ color: '#DC3545' }}>*</Text></Text>
        {intraoralPhotos.map((file, idx) => {
          const isExtra = idx >= 2;
          const baseUrl = api.defaults.baseURL || '';
          const fixedLabel = idx < INTRAORAL_LABELS.length ? INTRAORAL_LABELS[idx] : '';
          return (
            <View key={idx} style={{ marginBottom: 12 }} data-testid={`intraoral-slot-${idx}`}>
              {/* Slot label (fixed for 0/1, editable text input for extras) */}
              {isExtra ? (
                <TextInput
                  style={{
                    fontSize: 13, fontWeight: '700', color: '#1565C0',
                    marginBottom: 6, paddingVertical: 6, paddingHorizontal: 10,
                    borderWidth: 1, borderColor: '#B3D4FC', borderRadius: 8,
                    backgroundColor: '#F5FAFF',
                  }}
                  value={file?.label || ''}
                  onChangeText={(t) => updateIntraoralLabel(idx, t)}
                  placeholder="e.g., Right buccal view"
                  placeholderTextColor="#90A4AE"
                  editable={!!file}
                  data-testid={`intraoral-label-${idx}`}
                />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1565C0', marginBottom: 6, letterSpacing: 0.3 }}>
                  Tab {idx + 1} — {fixedLabel}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  {file ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Image
                        source={{ uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}`, headers: { Authorization: `Bearer ${authToken}` } }}
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        style={styles.cbctViewBtn}
                        onPress={() => Linking.openURL(`${baseUrl}/uploads/${file.filename}?token=${authToken}`).catch(() => Alert.alert('Error', 'Could not open file'))}
                        data-testid={`view-intraoral-${idx}`}
                      >
                        <Text style={styles.cbctViewBtnText} numberOfLines={1}>View Photograph</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { const u = [...intraoralPhotos]; u[idx] = null; setIntraoralPhotos(u); }}
                        data-testid={`remove-intraoral-${idx}`}
                      >
                        <Ionicons name="close-circle" size={22} color="#E53935" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.cbctUploadBtn}
                      onPress={() => pickIntraoralAtIndex(idx)}
                      disabled={intraoralUploadingIdx === idx}
                      data-testid={`upload-intraoral-${idx}`}
                    >
                      {intraoralUploadingIdx === idx ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload" size={18} color="#FFF" />
                          <Text style={styles.cbctUploadBtnText}>Upload Photograph</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {isExtra && (
                  <TouchableOpacity onPress={() => removeExtraIntraoral(idx)} data-testid={`remove-extra-intraoral-${idx}`}>
                    <Ionicons name="remove-circle" size={26} color="#E53935" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
          onPress={addExtraIntraoral}
          data-testid="add-extra-intraoral-btn"
        >
          <Ionicons name="add-circle" size={26} color="#4CAF50" />
          <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 14 }}>Add Photograph</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          Minimum 2 Photographs required. Accepted: PNG, JPEG, HEIC (Max 20 MB each)
        </Text>
      </View>
      )}

      {/* ─── Phase 1 Checklist ─── */}
      {/* iter-231: routine flow only. Existing Implant cases render a
          standalone Medical Assessment block below instead (no pre-surgical
          checklist items because no surgery is performed). */}
      {!isExistingImplantCase && !isAugCase && (
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
                {incompleteCount} section{incompleteCount > 1 ? 's' : ''} still incomplete — press Continue to see the full list
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
      {!isExistingImplantCase && !isAugCase && (<>

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
      {!isExistingImplantCase && !isAugCase && (() => {
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
                {incompleteCount} section{incompleteCount > 1 ? 's' : ''} still incomplete — press Continue to see the full list
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

// iter-Feb-2026 (v3): Local styles for Zygoma-specific UI additions
// (locked Arch chip + Conventional Implant Location section header).
const s_zyg_arch = StyleSheet.create({
  lockedChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EDE7F6', borderColor: '#B39DDB',
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 4,
  },
  lockedText: {
    marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#4527A0', flex: 1,
  },
});

const styles = StyleSheet.create({
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
});
