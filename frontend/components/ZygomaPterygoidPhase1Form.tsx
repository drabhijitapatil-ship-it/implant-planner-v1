/**
 * ZygomaPterygoidPhase1Form.tsx — iter-Feb-2026
 * ------------------------------------------------------------------------
 * Extended Phase 1 data-capture form used ONLY when the case procedure type
 * is one of the four advanced maxillary procedures:
 *   • Quad Zygoma Implants
 *   • Zygoma and Pterygoid Implants
 *   • Pterygoid and Conventional Implants
 *   • Zygoma and Conventional Implants
 *
 * Renders as a self-contained section that hydrates the parent form's
 * `zygoma_pterygoid_data` (Dict) via a single `onChange` callback. Structure
 * matches the clinical workflow specified in the user's brochure/workflow doc.
 *
 * Sections (top-to-bottom):
 *   1. Configuration (5 options)
 *   2. Medical Assessment (bilateral safety flags)
 *   3. Anaesthesia Plan
 *   4. Pre-Surgical Assessment
 *   5. Extraoral Examination
 *   6. Intraoral Examination (Zygoma/Pterygoid supplementary)
 *   7. Existing Prosthesis Assessment
 *   8. Radiographic Assessment
 *   9. Zygomatic Region Assessment (R/L)
 *  10. Pterygomaxillary Region Assessment (R/L)
 *  11. Bedrossian Zone Availability (R/L)
 *  12. ZAGA Classification (Aparicio) — R/L
 *  13. Diagnostic Summary
 *  14. Prosthetic Planning
 *  15. Design Checks
 *  16. Team Composition (medico-legal, iter-Feb-2026)
 *
 * All fields persist under procedure.zygoma_pterygoid_data.phase1.<section>.
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Shared option lists ─────────────────────────────────────────────────
const YES_NO = ['Yes', 'No'];
const CAWOOD_HOWELL = ['Class I', 'Class II', 'Class III', 'Class IV', 'Class V', 'Class VI'];

// iter-Feb-2026 (v2): Cawood-Howell class descriptions shown below the
// chip row whenever a class is selected. Sourced from user brief.
const CAWOOD_HOWELL_DESCRIPTIONS: Record<string, string> = {
  'Class I': 'Dentate ridge with teeth present.',
  'Class II': 'Immediate post-extraction ridge; smooth contour after tooth loss.',
  'Class III': 'Broad and rounded ridge with adequate height and width for conventional prosthetics.',
  'Class IV': 'Knife-edge ridge with sufficient height but inadequate width.',
  'Class V': 'Flat ridge with insufficient height and width.',
  'Class VI': 'Depressed ridge with a concave or cup-shaped surface showing basal bone loss.',
};
const ZAGA_TYPES = ['ZAGA 0', 'ZAGA 1', 'ZAGA 2', 'ZAGA 3', 'ZAGA 4'];
const ANTERIOR_MAX_WALL_CONCAVITY = ['Type 0', 'Type 1', 'Type 2', 'Type 3', 'Type 4'];
const FACIAL_PROFILE = ['Straight', 'Convex', 'Concave'];
const LIP_SUPPORT = ['Adequate', 'Deficient – flange required', 'Excessive'];
const FACIAL_ASYMMETRY = ['None', 'Present'];
const PROSTHESIS_TYPE = [
  'Complete denture', 'Removable Partial Denture', 'Fixed tooth-supported',
  'Implant-supported fixed', 'Implant overdenture', 'Tooth-supported overdenture',
];
const FIT = ['Poor', 'Fair', 'Good'];
const PHONETICS = ['Normal', 'Mildly impaired', 'Markedly impaired'];
const SATISFACTION = ['Satisfactory', 'Non-satisfactory'];
const IMAGING = ['OPG', 'CBCT large FOV', 'Dual-scan with radiographic guide', 'Intraoral scan'];
const ANAESTHESIA = ['General anaesthesia (nasal intubation)', 'IV sedation + LA', 'LA only'];
const OCCLUSAL_SCHEMES = ['Canine guided', 'Group Function', 'Mutually protected', 'Lingualized occlusion', 'Implant protected occlusion'];
const DIAGNOSTIC_STEPS = ['Wax-up', 'Denture duplication', 'Digital smile design', 'Try-in approved by patient'];

// iter-Feb-2026 improvisations (exported for Phase 2/3/5 use)
export const SURGICAL_APPROACH = ['Intrasinus', 'Extrasinus', 'Extramaxillary', 'Sinus-slot'];
export const PLANNED_ANGULATION = ['0°', '17°', '30°', '45°', '55°', '60°', 'Other'];
export const RECALL_TIMEPOINT = ['1 week', '1 month', '3 months', '6 months', '12 months', 'Annual'];

// ── Configuration ──────────────────────────────────────────────────────
const CONFIGURATION_OPTIONS = [
  'Quad zygoma',
  'Quad zygoma + 2 pterygoid',
  '2 zygoma + anterior conventional',
  '4 Pterygoid + conventional',
  'Zygoma + pterygoid + conventional',
];

// ── Types ──────────────────────────────────────────────────────────────
type Bilateral<T = string> = { right?: T; left?: T };

export type ZygomaPterygoidPhase1Data = {
  configuration?: string;
  medical_assessment?: {
    immunosuppression?: string;
    anticoagulants?: string;
    psychological_suitability?: string;
    ga_fitness_asa_grade?: string;
    asa_grade?: string;  // free text (I-IV)
  };
  anaesthesia_plan?: string;
  pre_surgical?: {
    interincisal_opening_mm?: string;
    sinus_health?: string;
    omc_patent?: Bilateral;
    interarch_space_at_vdo_mm?: string;
    caution_notes?: string;
  };
  extraoral?: {
    facial_profile?: string;
    lip_support?: string;
    facial_asymmetry?: string;
    zygomatic_prominence?: Bilateral;
    notes?: string;
  };
  intraoral?: {
    residual_ridge_form?: string;
    keratinised_mucosa_width_mm?: Bilateral;
    tuberosity_height_mm?: Bilateral;
    tuberosity_form?: Bilateral;
    palatal_vault_depth_mm?: Bilateral;
    teeth_to_be_extracted?: string[]; // FDI codes
  };
  existing_prosthesis?: {
    using?: string;
    type?: string;
    fit?: string;
    phonetics?: string;
    esthetics?: string;
    patient_satisfaction?: string;
  };
  radiographic?: {
    imaging_obtained?: string[];
    field_of_view?: string;
  };
  zygomatic_region?: {
    body_height_mm?: Bilateral;
    cortical_thickness_apex_mm?: Bilateral;
    anterior_max_wall_concavity?: Bilateral;
    sinus_membrane_thickening_mm?: Bilateral;
    sinus_septa_present?: Bilateral;
    ostium_omc_patency?: string;
    orbital_floor_distance_mm?: Bilateral;
  };
  pterygomaxillary_region?: {
    tuberosity_height_mm?: Bilateral;
    tuberosity_bone_density?: Bilateral;
    pyramidal_process_volume?: Bilateral;
    pterygoid_plate_thickness_mm?: Bilateral;
    planned_path_length_mm?: Bilateral;
    greater_palatine_canal_position?: Bilateral;
    maxillary_artery_pterygoid_plexus?: Bilateral;
  };
  bedrossian_zones?: {
    zone1_premaxilla_mm?: Bilateral;
    zone1_premolar_mm?: Bilateral;
    zone1_molar_mm?: Bilateral;
  };
  zaga?: Bilateral;  // ZAGA 0-4 per side
  diagnostic_summary?: {
    cawood_howell?: string;
    bedrossian?: string;
    zaga_right?: string;
    zaga_left?: string;
  };
  prosthetic_planning?: {
    diagnostic_steps?: string[];
    flange_required?: string;
    occlusal_scheme?: string;
  };
  design_checks?: {
    apices_distance?: string;
    heads_within_prosthetic_envelope?: string;
    ap_spread_adequate?: string;
    cantilever_eliminated?: string;
  };
  team_composition?: {
    primary_surgeon?: string;
    assistant_surgeon?: string;
    anaesthetist?: string;
    prosthodontist?: string;
    nurse?: string;
  };
};

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  procedureType: string;
  value: ZygomaPterygoidPhase1Data;
  onChange: (data: ZygomaPterygoidPhase1Data) => void;
  readOnly?: boolean;
}

// ── Small helpers ──────────────────────────────────────────────────────
const setPath = <T extends object>(obj: T, path: string, value: any): T => {
  const clone: any = { ...obj };
  const keys = path.split('.');
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
};

const getPath = (obj: any, path: string): any => {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = getPath;

// ── UI Primitives ──────────────────────────────────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
  <View style={s.field}>
    <Text style={s.fieldLabel}>{label}{required ? <Text style={{ color: '#E53935' }}> *</Text> : null}</Text>
    {children}
  </View>
);

const TextField: React.FC<{
  value?: string; placeholder?: string; onChange: (v: string) => void; keyboardType?: any; multiline?: boolean; readOnly?: boolean;
  testID?: string;
}> = ({ value, placeholder, onChange, keyboardType, multiline, readOnly, testID }) => (
  <TextInput
    testID={testID}
    style={[s.input, multiline && s.multiline, readOnly && s.readOnly]}
    value={value || ''}
    placeholder={placeholder}
    placeholderTextColor="#B0BEC5"
    onChangeText={onChange}
    editable={!readOnly}
    keyboardType={keyboardType}
    multiline={multiline}
    numberOfLines={multiline ? 3 : 1}
  />
);

const ChipRow: React.FC<{ options: string[]; value?: string; onChange: (v: string) => void; readOnly?: boolean; testID?: string }>
  = ({ options, value, onChange, readOnly, testID }) => (
    <View style={s.chipRow}>
      {options.map(opt => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            testID={testID ? `${testID}-${opt}` : undefined}
            style={[s.chip, selected && s.chipSelected, readOnly && { opacity: 0.6 }]}
            disabled={readOnly}
            onPress={() => onChange(selected ? '' : opt)}
          >
            <Text style={[s.chipText, selected && s.chipTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

const MultiChipRow: React.FC<{ options: string[]; value?: string[]; onChange: (v: string[]) => void; readOnly?: boolean }>
  = ({ options, value, onChange, readOnly }) => {
    const set = new Set(value || []);
    return (
      <View style={s.chipRow}>
        {options.map(opt => {
          const selected = set.has(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[s.chip, selected && s.chipSelected, readOnly && { opacity: 0.6 }]}
              disabled={readOnly}
              onPress={() => {
                const next = new Set(set);
                if (selected) next.delete(opt); else next.add(opt);
                onChange(Array.from(next));
              }}
            >
              <Text style={[s.chipText, selected && s.chipTextSelected]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

const BilateralPair: React.FC<{
  label: string; suffix?: string; value?: Bilateral; onChange: (v: Bilateral) => void; keyboardType?: any; readOnly?: boolean;
}> = ({ label, suffix, value, onChange, keyboardType, readOnly }) => (
  <View style={s.field}>
    <Text style={s.fieldLabel}>{label}{suffix ? <Text style={s.suffix}> ({suffix})</Text> : null}</Text>
    <View style={s.bilateralRow}>
      <View style={s.bilateralHalf}>
        <Text style={s.sideLabel}>Right</Text>
        <TextInput
          style={[s.input, readOnly && s.readOnly]}
          value={value?.right || ''}
          placeholder={suffix || ''}
          placeholderTextColor="#B0BEC5"
          onChangeText={t => onChange({ ...(value || {}), right: t })}
          editable={!readOnly}
          keyboardType={keyboardType}
        />
      </View>
      <View style={s.bilateralHalf}>
        <Text style={s.sideLabel}>Left</Text>
        <TextInput
          style={[s.input, readOnly && s.readOnly]}
          value={value?.left || ''}
          placeholder={suffix || ''}
          placeholderTextColor="#B0BEC5"
          onChangeText={t => onChange({ ...(value || {}), left: t })}
          editable={!readOnly}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  </View>
);

const BilateralChoice: React.FC<{ label: string; options: string[]; value?: Bilateral; onChange: (v: Bilateral) => void; readOnly?: boolean }>
  = ({ label, options, value, onChange, readOnly }) => (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.bilateralRow}>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Right</Text>
          <ChipRow options={options} value={value?.right} onChange={t => onChange({ ...(value || {}), right: t })} readOnly={readOnly} />
        </View>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Left</Text>
          <ChipRow options={options} value={value?.left} onChange={t => onChange({ ...(value || {}), left: t })} readOnly={readOnly} />
        </View>
      </View>
    </View>
  );

const SectionCard: React.FC<{ title: string; icon: keyof typeof Ionicons.glyphMap; tint?: string; children: React.ReactNode }>
  = ({ title, icon, tint = '#5E35B1', children }) => (
    <View style={s.section}>
      <View style={[s.sectionHeader, { borderLeftColor: tint }]}>
        <Ionicons name={icon} size={18} color={tint} />
        <Text style={[s.sectionTitle, { color: tint }]}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );

// ─── Main Component ─────────────────────────────────────────────────────
const ZygomaPterygoidPhase1Form: React.FC<Props> = ({ procedureType, value, onChange, readOnly }) => {
  const set = useCallback((path: string, v: any) => {
    onChange(setPath(value || {}, path, v));
  }, [value, onChange]);

  // iter-Feb-2026 (v2): "Pterygoid and Conventional Implants" is NOT
  // an advanced maxillary rehab case. Show ONLY Section 6 (Intraoral
  // Examination) and Section 10 (Pterygomaxillary Region). Skip the
  // orange banner and all zygomatic-specific sections.
  const isPterygoidLite = procedureType === 'Pterygoid and Conventional Implants';

  const showSinusCaution = (() => {
    const opening = parseFloat(value?.pre_surgical?.interincisal_opening_mm || '');
    const sinusOK = value?.pre_surgical?.sinus_health;
    const omcR = value?.pre_surgical?.omc_patent?.right;
    const omcL = value?.pre_surgical?.omc_patent?.left;
    if (!Number.isNaN(opening) && opening > 0 && opening < 35) return true;
    if (sinusOK === 'No') return true;
    if (omcR === 'No' || omcL === 'No') return true;
    return false;
  })();

  // Section 6 helper — reused inside both variants (full + lite).
  const renderIntraoralSection = () => (
    <SectionCard title={isPterygoidLite ? 'Intraoral Examination (Pterygoid Supplementary)' : '6. Intraoral Examination (Zygoma/Pterygoid Supplementary)'} icon="scan-outline" tint="#6A1B9A">
      <Field label="Residual Ridge Form (Cawood-Howell)">
        <ChipRow options={CAWOOD_HOWELL} value={value?.intraoral?.residual_ridge_form} onChange={v => set('intraoral.residual_ridge_form', v)} readOnly={readOnly} />
        {/* iter-Feb-2026 (v2): Cawood-Howell class description on selection */}
        {value?.intraoral?.residual_ridge_form && CAWOOD_HOWELL_DESCRIPTIONS[value.intraoral.residual_ridge_form] ? (
          <View style={s.classDescBox} testID="cawood-howell-description">
            <Text style={s.classDescLabel}>{value.intraoral.residual_ridge_form}</Text>
            <Text style={s.classDescText}>{CAWOOD_HOWELL_DESCRIPTIONS[value.intraoral.residual_ridge_form]}</Text>
          </View>
        ) : null}
      </Field>
      <BilateralPair label="Keratinised Mucosa Width" suffix="mm" value={value?.intraoral?.keratinised_mucosa_width_mm} onChange={v => set('intraoral.keratinised_mucosa_width_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <BilateralPair label="Tuberosity Height" suffix="mm" value={value?.intraoral?.tuberosity_height_mm} onChange={v => set('intraoral.tuberosity_height_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <BilateralPair label="Tuberosity Form" value={value?.intraoral?.tuberosity_form} onChange={v => set('intraoral.tuberosity_form', v)} readOnly={readOnly} />
      <BilateralPair label="Palatal Vault Depth" suffix="mm" value={value?.intraoral?.palatal_vault_depth_mm} onChange={v => set('intraoral.palatal_vault_depth_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <Text style={s.helper}>ℹ️ Teeth to be extracted are captured via the FDI chart in the main form.</Text>
    </SectionCard>
  );

  const renderPterygomaxillarySection = () => (
    <SectionCard title={isPterygoidLite ? 'Pterygomaxillary Region Assessment' : '10. Pterygomaxillary Region Assessment'} icon="triangle-outline" tint="#EF6C00">
      <BilateralPair label="Tuberosity Height" suffix="mm" value={value?.pterygomaxillary_region?.tuberosity_height_mm} onChange={v => set('pterygomaxillary_region.tuberosity_height_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <BilateralPair label="Tuberosity Bone Density" value={value?.pterygomaxillary_region?.tuberosity_bone_density} onChange={v => set('pterygomaxillary_region.tuberosity_bone_density', v)} readOnly={readOnly} />
      <BilateralPair label="Pyramidal Process of Palatine — Volume" value={value?.pterygomaxillary_region?.pyramidal_process_volume} onChange={v => set('pterygomaxillary_region.pyramidal_process_volume', v)} readOnly={readOnly} />
      <BilateralPair label="Pterygoid Plate Thickness at Target" suffix="mm" value={value?.pterygomaxillary_region?.pterygoid_plate_thickness_mm} onChange={v => set('pterygomaxillary_region.pterygoid_plate_thickness_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <BilateralPair label="Planned Implant Path Length (to cortex)" suffix="mm" value={value?.pterygomaxillary_region?.planned_path_length_mm} onChange={v => set('pterygomaxillary_region.planned_path_length_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      <BilateralPair label="Greater Palatine Canal Position" value={value?.pterygomaxillary_region?.greater_palatine_canal_position} onChange={v => set('pterygomaxillary_region.greater_palatine_canal_position', v)} readOnly={readOnly} />
      <BilateralPair label="Maxillary Artery / Pterygoid Plexus Proximity" value={value?.pterygomaxillary_region?.maxillary_artery_pterygoid_plexus} onChange={v => set('pterygomaxillary_region.maxillary_artery_pterygoid_plexus', v)} readOnly={readOnly} />
    </SectionCard>
  );

  // ── Pterygoid-lite variant — only 2 supplementary sections ──
  if (isPterygoidLite) {
    return (
      <View style={s.wrapper}>
        <View style={s.liteBanner} testID="pterygoid-lite-banner">
          <Ionicons name="information-circle" size={18} color="#1976D2" />
          <Text style={s.liteBannerText}>
            {procedureType} — pterygoid supplementary data capture only. This is a routine full-arch case with pterygoid anchorage; the extended zygomatic assessment is not required.
          </Text>
        </View>
        {renderIntraoralSection()}
        {renderPterygomaxillarySection()}
      </View>
    );
  }

  return (
    <View style={s.wrapper}>
      {/* Header banner */}
      <View style={s.banner}>
        <Ionicons name="alert-circle" size={20} color="#FF6F00" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.bannerTitle}>Advanced Maxillary Rehabilitation Case</Text>
          <Text style={s.bannerBody}>
            {procedureType} — extended clinical data capture required. Supervisor / Implant In-Charge co-sign will be enforced at Phase 2 submit.
          </Text>
        </View>
      </View>

      {/* 1. Configuration */}
      <SectionCard title="1. Configuration" icon="git-network-outline" tint="#5E35B1">
        <Field label="Configuration" required>
          <ChipRow options={CONFIGURATION_OPTIONS} value={value?.configuration} onChange={v => set('configuration', v)} readOnly={readOnly} testID="zp-config" />
        </Field>
      </SectionCard>

      {/* 2. Medical Assessment */}
      <SectionCard title="2. Medical Assessment (Safety Flags)" icon="medkit-outline" tint="#D81B60">
        <Field label="Immunosuppression">
          <ChipRow options={YES_NO} value={value?.medical_assessment?.immunosuppression} onChange={v => set('medical_assessment.immunosuppression', v)} readOnly={readOnly} />
        </Field>
        <Field label="Anticoagulants / Bleeding disorder">
          <ChipRow options={YES_NO} value={value?.medical_assessment?.anticoagulants} onChange={v => set('medical_assessment.anticoagulants', v)} readOnly={readOnly} />
        </Field>
        <Field label="Psychological suitability concerns">
          <ChipRow options={YES_NO} value={value?.medical_assessment?.psychological_suitability} onChange={v => set('medical_assessment.psychological_suitability', v)} readOnly={readOnly} />
        </Field>
        <Field label="GA fitness / ASA grade">
          <ChipRow options={YES_NO} value={value?.medical_assessment?.ga_fitness_asa_grade} onChange={v => set('medical_assessment.ga_fitness_asa_grade', v)} readOnly={readOnly} />
        </Field>
        <Field label="ASA grade (I / II / III / IV) — optional">
          <TextField value={value?.medical_assessment?.asa_grade} placeholder="e.g., ASA II" onChange={v => set('medical_assessment.asa_grade', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 3. Anaesthesia Plan */}
      <SectionCard title="3. Anaesthesia Plan" icon="pulse-outline" tint="#1E88E5">
        <Field label="Planned Anaesthesia" required>
          <ChipRow options={ANAESTHESIA} value={value?.anaesthesia_plan} onChange={v => set('anaesthesia_plan', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 4. Pre-Surgical Assessment */}
      <SectionCard title="4. Pre-Surgical Assessment" icon="clipboard-outline" tint="#00897B">
        <Field label="Maximum Interincisal Opening" required>
          <TextField value={value?.pre_surgical?.interincisal_opening_mm} placeholder="mm" onChange={v => set('pre_surgical.interincisal_opening_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        </Field>
        <Field label="Sinus Health">
          <ChipRow options={YES_NO} value={value?.pre_surgical?.sinus_health} onChange={v => set('pre_surgical.sinus_health', v)} readOnly={readOnly} />
        </Field>
        <BilateralChoice label="Ostiomeatal Complex Patent" options={YES_NO} value={value?.pre_surgical?.omc_patent} onChange={v => set('pre_surgical.omc_patent', v)} readOnly={readOnly} />
        <Field label="Inter-arch Space at planned VDO">
          <TextField value={value?.pre_surgical?.interarch_space_at_vdo_mm} placeholder="mm" onChange={v => set('pre_surgical.interarch_space_at_vdo_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        </Field>
        {showSinusCaution ? (
          <View style={s.warning}>
            <Ionicons name="warning" size={16} color="#E65100" />
            <Text style={s.warningText}>Caution flag: limited mouth opening / sinus / OMC concern — reassess before proceeding.</Text>
          </View>
        ) : null}
        <Field label="Notes / Cautions">
          <TextField value={value?.pre_surgical?.caution_notes} placeholder="Any pre-surgical concerns..." onChange={v => set('pre_surgical.caution_notes', v)} multiline readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 5. Extraoral Examination */}
      <SectionCard title="5. Extraoral Examination" icon="person-outline" tint="#8E24AA">
        <Field label="Facial Profile">
          <ChipRow options={FACIAL_PROFILE} value={value?.extraoral?.facial_profile} onChange={v => set('extraoral.facial_profile', v)} readOnly={readOnly} />
        </Field>
        <Field label="Lip Support">
          <ChipRow options={LIP_SUPPORT} value={value?.extraoral?.lip_support} onChange={v => set('extraoral.lip_support', v)} readOnly={readOnly} />
        </Field>
        <Field label="Facial Asymmetry">
          <ChipRow options={FACIAL_ASYMMETRY} value={value?.extraoral?.facial_asymmetry} onChange={v => set('extraoral.facial_asymmetry', v)} readOnly={readOnly} />
        </Field>
        <BilateralChoice label="Zygomatic Prominence" options={YES_NO} value={value?.extraoral?.zygomatic_prominence} onChange={v => set('extraoral.zygomatic_prominence', v)} readOnly={readOnly} />
        <Field label="Additional Notes">
          <TextField value={value?.extraoral?.notes} placeholder="Any relevant extraoral observations..." onChange={v => set('extraoral.notes', v)} multiline readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 6. Intraoral Examination */}
      {renderIntraoralSection()}

      {/* 7. Existing Prosthesis */}
      <SectionCard title="7. Existing Prosthesis Assessment" icon="fitness-outline" tint="#F57C00">
        <Field label="Is patient using a prosthesis?">
          <ChipRow options={YES_NO} value={value?.existing_prosthesis?.using} onChange={v => set('existing_prosthesis.using', v)} readOnly={readOnly} />
        </Field>
        {value?.existing_prosthesis?.using === 'Yes' ? (
          <>
            <Field label="Type of Prosthesis">
              <ChipRow options={PROSTHESIS_TYPE} value={value?.existing_prosthesis?.type} onChange={v => set('existing_prosthesis.type', v)} readOnly={readOnly} />
            </Field>
            <Field label="Fit">
              <ChipRow options={FIT} value={value?.existing_prosthesis?.fit} onChange={v => set('existing_prosthesis.fit', v)} readOnly={readOnly} />
            </Field>
            <Field label="Phonetics">
              <ChipRow options={PHONETICS} value={value?.existing_prosthesis?.phonetics} onChange={v => set('existing_prosthesis.phonetics', v)} readOnly={readOnly} />
            </Field>
            <Field label="Esthetics">
              <ChipRow options={SATISFACTION} value={value?.existing_prosthesis?.esthetics} onChange={v => set('existing_prosthesis.esthetics', v)} readOnly={readOnly} />
            </Field>
            <Field label="Patient Satisfaction">
              <ChipRow options={SATISFACTION} value={value?.existing_prosthesis?.patient_satisfaction} onChange={v => set('existing_prosthesis.patient_satisfaction', v)} readOnly={readOnly} />
            </Field>
          </>
        ) : null}
      </SectionCard>

      {/* 8. Radiographic Assessment */}
      <SectionCard title="8. Radiographic Assessment" icon="radio-outline" tint="#0097A7">
        <Field label="Imaging Obtained (select all)">
          <MultiChipRow options={IMAGING} value={value?.radiographic?.imaging_obtained} onChange={v => set('radiographic.imaging_obtained', v)} readOnly={readOnly} />
        </Field>
        <Field label="Field of View">
          <TextField value={value?.radiographic?.field_of_view} placeholder="e.g., 16 × 13 cm" onChange={v => set('radiographic.field_of_view', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 9. Zygomatic Region */}
      <SectionCard title="9. Zygomatic Region Assessment" icon="body-outline" tint="#C62828">
        <BilateralPair label="Zygomatic Body Height" suffix="mm" value={value?.zygomatic_region?.body_height_mm} onChange={v => set('zygomatic_region.body_height_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralPair label="Cortical Thickness at Planned Apex" suffix="mm" value={value?.zygomatic_region?.cortical_thickness_apex_mm} onChange={v => set('zygomatic_region.cortical_thickness_apex_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralChoice label="Anterior Maxillary Wall Concavity" options={ANTERIOR_MAX_WALL_CONCAVITY} value={value?.zygomatic_region?.anterior_max_wall_concavity} onChange={v => set('zygomatic_region.anterior_max_wall_concavity', v)} readOnly={readOnly} />
        <BilateralPair label="Sinus Membrane Thickening" suffix="mm" value={value?.zygomatic_region?.sinus_membrane_thickening_mm} onChange={v => set('zygomatic_region.sinus_membrane_thickening_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralChoice label="Sinus Septa Present" options={YES_NO} value={value?.zygomatic_region?.sinus_septa_present} onChange={v => set('zygomatic_region.sinus_septa_present', v)} readOnly={readOnly} />
        <Field label="Ostium / OMC Patency Notes">
          <TextField value={value?.zygomatic_region?.ostium_omc_patency} placeholder="Details on OMC and ostium status..." onChange={v => set('zygomatic_region.ostium_omc_patency', v)} multiline readOnly={readOnly} />
        </Field>
        <BilateralPair label="Orbital Floor Distance to Planned Path" suffix="mm" value={value?.zygomatic_region?.orbital_floor_distance_mm} onChange={v => set('zygomatic_region.orbital_floor_distance_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      </SectionCard>

      {/* 10. Pterygomaxillary Region */}
      {renderPterygomaxillarySection()}

      {/* 11. Bedrossian Zones */}
      <SectionCard title="11. Bedrossian Zone Availability" icon="grid-outline" tint="#7CB342">
        <BilateralPair label="Zone 1 — Premaxilla" suffix="mm" value={value?.bedrossian_zones?.zone1_premaxilla_mm} onChange={v => set('bedrossian_zones.zone1_premaxilla_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralPair label="Zone 1 — Premolar" suffix="mm" value={value?.bedrossian_zones?.zone1_premolar_mm} onChange={v => set('bedrossian_zones.zone1_premolar_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralPair label="Zone 1 — Molar" suffix="mm" value={value?.bedrossian_zones?.zone1_molar_mm} onChange={v => set('bedrossian_zones.zone1_molar_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
      </SectionCard>

      {/* 12. ZAGA Classification */}
      <SectionCard title="12. ZAGA Classification (Aparicio)" icon="analytics-outline" tint="#00695C">
        <BilateralChoice label="ZAGA Type" options={ZAGA_TYPES} value={value?.zaga} onChange={v => set('zaga', v)} readOnly={readOnly} />
        <Text style={s.helper}>ℹ️ ZAGA guides surgical approach: Type 0/1 → Intrasinus · Type 2 → Sinus-slot · Type 3/4 → Extrasinus / Extramaxillary.</Text>
      </SectionCard>

      {/* 13. Diagnostic Summary */}
      <SectionCard title="13. Diagnostic Summary" icon="document-text-outline" tint="#455A64">
        <Field label="Cawood-Howell Class">
          <ChipRow options={CAWOOD_HOWELL} value={value?.diagnostic_summary?.cawood_howell} onChange={v => set('diagnostic_summary.cawood_howell', v)} readOnly={readOnly} />
          {/* iter-Feb-2026 (v2): Cawood-Howell description also here */}
          {value?.diagnostic_summary?.cawood_howell && CAWOOD_HOWELL_DESCRIPTIONS[value.diagnostic_summary.cawood_howell] ? (
            <View style={s.classDescBox} testID="cawood-howell-description-summary">
              <Text style={s.classDescLabel}>{value.diagnostic_summary.cawood_howell}</Text>
              <Text style={s.classDescText}>{CAWOOD_HOWELL_DESCRIPTIONS[value.diagnostic_summary.cawood_howell]}</Text>
            </View>
          ) : null}
        </Field>
        <Field label="Bedrossian Classification">
          <TextField value={value?.diagnostic_summary?.bedrossian} placeholder="e.g., Class III (posterior)" onChange={v => set('diagnostic_summary.bedrossian', v)} readOnly={readOnly} />
        </Field>
        <Field label="ZAGA Type — Right side">
          <ChipRow options={ZAGA_TYPES} value={value?.diagnostic_summary?.zaga_right} onChange={v => set('diagnostic_summary.zaga_right', v)} readOnly={readOnly} />
        </Field>
        <Field label="ZAGA Type — Left side">
          <ChipRow options={ZAGA_TYPES} value={value?.diagnostic_summary?.zaga_left} onChange={v => set('diagnostic_summary.zaga_left', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 14. Prosthetic Planning */}
      <SectionCard title="14. Prosthetic Planning" icon="construct-outline" tint="#4527A0">
        <Field label="Diagnostic Steps Completed">
          <MultiChipRow options={DIAGNOSTIC_STEPS} value={value?.prosthetic_planning?.diagnostic_steps} onChange={v => set('prosthetic_planning.diagnostic_steps', v)} readOnly={readOnly} />
        </Field>
        <Field label="Flange required for lip support?">
          <ChipRow options={YES_NO} value={value?.prosthetic_planning?.flange_required} onChange={v => set('prosthetic_planning.flange_required', v)} readOnly={readOnly} />
        </Field>
        <Field label="Occlusal Scheme Planned">
          <ChipRow options={OCCLUSAL_SCHEMES} value={value?.prosthetic_planning?.occlusal_scheme} onChange={v => set('prosthetic_planning.occlusal_scheme', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>

      {/* 15. Design Checks */}
      <SectionCard title="15. Design Checks" icon="checkmark-done-outline" tint="#2E7D32">
        <Field label="Apices distance adequate">
          <ChipRow options={YES_NO} value={value?.design_checks?.apices_distance} onChange={v => set('design_checks.apices_distance', v)} readOnly={readOnly} />
          {value?.design_checks?.apices_distance === 'No' ? (
            <View style={s.reasonBox} testID="design-check-reason-apices">
              <Text style={s.reasonLabel}>Reason / Explanation <Text style={s.reasonAsterisk}>*</Text></Text>
              <TextField
                value={value?.design_checks?.apices_distance_reason}
                placeholder="Explain the issue and mitigation plan..."
                onChange={v => set('design_checks.apices_distance_reason', v)}
                multiline readOnly={readOnly}
                testID="design-check-reason-apices-input"
              />
            </View>
          ) : null}
        </Field>
        <Field label="Heads within prosthetic envelope">
          <ChipRow options={YES_NO} value={value?.design_checks?.heads_within_prosthetic_envelope} onChange={v => set('design_checks.heads_within_prosthetic_envelope', v)} readOnly={readOnly} />
          {value?.design_checks?.heads_within_prosthetic_envelope === 'No' ? (
            <View style={s.reasonBox} testID="design-check-reason-envelope">
              <Text style={s.reasonLabel}>Reason / Explanation <Text style={s.reasonAsterisk}>*</Text></Text>
              <TextField
                value={value?.design_checks?.heads_within_prosthetic_envelope_reason}
                placeholder="Explain the issue and mitigation plan..."
                onChange={v => set('design_checks.heads_within_prosthetic_envelope_reason', v)}
                multiline readOnly={readOnly}
                testID="design-check-reason-envelope-input"
              />
            </View>
          ) : null}
        </Field>
        <Field label="A–P Spread adequate">
          <ChipRow options={YES_NO} value={value?.design_checks?.ap_spread_adequate} onChange={v => set('design_checks.ap_spread_adequate', v)} readOnly={readOnly} />
          {value?.design_checks?.ap_spread_adequate === 'No' ? (
            <View style={s.reasonBox} testID="design-check-reason-apspread">
              <Text style={s.reasonLabel}>Reason / Explanation <Text style={s.reasonAsterisk}>*</Text></Text>
              <TextField
                value={value?.design_checks?.ap_spread_adequate_reason}
                placeholder="Explain the issue and mitigation plan..."
                onChange={v => set('design_checks.ap_spread_adequate_reason', v)}
                multiline readOnly={readOnly}
                testID="design-check-reason-apspread-input"
              />
            </View>
          ) : null}
        </Field>
        <Field label="Cantilever eliminated / acceptable">
          <ChipRow options={YES_NO} value={value?.design_checks?.cantilever_eliminated} onChange={v => set('design_checks.cantilever_eliminated', v)} readOnly={readOnly} />
          {value?.design_checks?.cantilever_eliminated === 'No' ? (
            <View style={s.reasonBox} testID="design-check-reason-cantilever">
              <Text style={s.reasonLabel}>Reason / Explanation <Text style={s.reasonAsterisk}>*</Text></Text>
              <TextField
                value={value?.design_checks?.cantilever_eliminated_reason}
                placeholder="Explain the issue and mitigation plan..."
                onChange={v => set('design_checks.cantilever_eliminated_reason', v)}
                multiline readOnly={readOnly}
                testID="design-check-reason-cantilever-input"
              />
            </View>
          ) : null}
        </Field>
      </SectionCard>

      {/* 16. Team Composition (iter-Feb-2026 improvisation) */}
      <SectionCard title="16. Team Composition (Medico-Legal)" icon="people-outline" tint="#5D4037">
        <Field label="Primary Surgeon">
          <TextField value={value?.team_composition?.primary_surgeon} placeholder="Name" onChange={v => set('team_composition.primary_surgeon', v)} readOnly={readOnly} />
        </Field>
        <Field label="Assistant Surgeon">
          <TextField value={value?.team_composition?.assistant_surgeon} placeholder="Name" onChange={v => set('team_composition.assistant_surgeon', v)} readOnly={readOnly} />
        </Field>
        <Field label="Anaesthetist (if GA / IV sedation)">
          <TextField value={value?.team_composition?.anaesthetist} placeholder="Name" onChange={v => set('team_composition.anaesthetist', v)} readOnly={readOnly} />
        </Field>
        <Field label="Prosthodontist">
          <TextField value={value?.team_composition?.prosthodontist} placeholder="Name" onChange={v => set('team_composition.prosthodontist', v)} readOnly={readOnly} />
        </Field>
        <Field label="Circulating Nurse">
          <TextField value={value?.team_composition?.nurse} placeholder="Name" onChange={v => set('team_composition.nurse', v)} readOnly={readOnly} />
        </Field>
      </SectionCard>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrapper: { marginTop: 8, marginBottom: 8 },
  banner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF3E0', borderLeftWidth: 4, borderLeftColor: '#FF6F00',
    padding: 12, borderRadius: 8, marginBottom: 16,
    marginHorizontal: 4,
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#E65100', marginBottom: 2 },
  bannerBody: { fontSize: 12, color: '#5D4037', lineHeight: 16, flexWrap: 'wrap' },
  section: {
    backgroundColor: '#fff', borderRadius: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#ECEFF1',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
    }),
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 10, paddingRight: 12,
    borderBottomWidth: 1, borderBottomColor: '#ECEFF1',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
  sectionBody: { padding: 12 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  suffix: { fontWeight: '400', color: '#78909C', fontSize: 12 },
  input: {
    backgroundColor: '#F5F7FA', borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC',
    paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 14, color: '#263238',
  },
  multiline: { minHeight: 68, textAlignVertical: 'top' },
  readOnly: { backgroundColor: '#ECEFF1', color: '#546E7A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#CFD8DC',
    backgroundColor: '#FFF',
  },
  chipSelected: { backgroundColor: '#5E35B1', borderColor: '#5E35B1' },
  chipText: { fontSize: 12, color: '#455A64' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  bilateralRow: { flexDirection: 'row', gap: 8 as any },
  bilateralHalf: { flex: 1 },
  sideLabel: { fontSize: 11, color: '#78909C', marginBottom: 4, fontWeight: '600' },
  helper: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginTop: 4 },
  warning: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF3E0', borderRadius: 6, padding: 10, marginTop: 8, marginBottom: 8,
    marginHorizontal: 4,
    borderLeftWidth: 3, borderLeftColor: '#FB8C00',
    flexWrap: 'wrap',
  },
  warningText: {
    fontSize: 12, color: '#E65100', marginLeft: 8,
    flex: 1, flexShrink: 1, flexWrap: 'wrap', lineHeight: 17,
  },
  // iter-Feb-2026 (v2): Cawood-Howell class description box (Section 6 + 13)
  classDescBox: {
    marginTop: 8,
    backgroundColor: '#F3E5F5',
    borderLeftWidth: 3, borderLeftColor: '#8E24AA',
    borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  classDescLabel: { fontSize: 12, fontWeight: '700', color: '#4A148C', marginBottom: 2 },
  classDescText: { fontSize: 12, color: '#37474F', lineHeight: 17 },
  // iter-Feb-2026 (v2): Design-check "No" reason textbox (Section 15)
  reasonBox: {
    marginTop: 8,
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 3, borderLeftColor: '#F9A825',
    borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  reasonLabel: { fontSize: 12, fontWeight: '600', color: '#5D4037', marginBottom: 4 },
  reasonAsterisk: { color: '#C62828', fontWeight: '700' },
  // iter-Feb-2026 (v2): Pterygoid-lite variant banner (blue, informational)
  liteBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#E3F2FD', borderLeftWidth: 4, borderLeftColor: '#1976D2',
    padding: 12, borderRadius: 8, marginBottom: 16,
  },
  liteBannerText: {
    fontSize: 12, color: '#0D47A1', marginLeft: 8,
    flex: 1, flexShrink: 1, flexWrap: 'wrap', lineHeight: 17,
  },
});

export default ZygomaPterygoidPhase1Form;
