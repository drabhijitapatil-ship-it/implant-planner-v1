/**
 * ZygomaExtendedWorkflow.tsx — iter-Feb-2026 (v4)
 * ------------------------------------------------------------------------
 * Unified Zygoma & Pterygoid extended-workflow screen embedding Phase 2
 * (surgical execution + co-sign), Phase 3 (immediate loading with 3
 * timepoints Day 0/7/30 + co-sign), Phase 4 (definitive screw-retained
 * hybrid prosthesis), and Phase 5 (Aparicio ORIS Zygoma Success Code).
 *
 * Structure: 4 collapsible sections, one per phase. All data lives under
 * `procedure.zygoma_pterygoid_data.phase{2..5}` and is persisted via the
 * PATCH /api/procedures/{id}/zygoma-workflow endpoint. Co-signs live at
 * `procedure.zygoma_pterygoid_cosigns` and are captured via
 * POST /api/procedures/{id}/zygoma-cosign.
 *
 * Variants:
 *   • Full-arch Zygoma (4 procedure types) — full 4-phase form
 *   • Pterygoid + Conventional (lite) — reduced Phase 2 (5 checklist
 *     items), NO Phase 3 immediate-loading rework, NO ORIS zygoma
 *     success code — only stability + soft-tissue per implant.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Platform, Alert, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

import SignaturePad from './SignaturePad';

// ── Helpers ────────────────────────────────────────────────────────────
const setPath = <T extends object>(obj: T, path: string, value: any): T => {
  const clone: any = { ...(obj as any) };
  const keys = path.split('.');
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
};

// ── Constants ──────────────────────────────────────────────────────────
const YES_NO = ['Yes', 'No'];
const ANGULATION = ['0°', '17°', '30°', '45°', '55°', '60°', 'Other'];
const SURGICAL_APPROACH = ['Intrasinus', 'Extrasinus', 'Extramaxillary', 'Sinus-slot'];
const PROSTHESIS_TYPE_FULL = ['Fixed hybrid PMMA-Ti', 'Zirconia hybrid', 'Metal-acrylic', 'All-zirconia monolithic', 'Provisional acrylic', 'Conversion denture'];
const OCCLUSAL_SCHEMES = ['Canine guided', 'Group Function', 'Mutually protected', 'Lingualized', 'Implant protected'];
const WOUND_STATUS = ['Healed', 'Dehiscence', 'Infection', 'Hematoma'];
const RECALL_TIMEPOINTS = ['1 week', '1 month', '3 months', '6 months', '12 months', 'Annual'];
const SINUS_STATUS = ['Healthy', 'Mucositis', 'Sinusitis'];
const PERI_IMPLANT_SOFT_TISSUE = ['Healthy', 'Marginal inflammation', 'Recession', 'Fistula'];
const HEAD_POSITION = ['Anatomical', 'Palatal', 'Extra-alveolar'];
const SMILE_LINE = ['Low', 'Medium', 'High'];
const FRAMEWORK_TEST = ['Passed', 'Failed', 'Not performed'];

// ── UI primitives (compact, matches Phase 1 form styling) ───────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={s.field}><Text style={s.fieldLabel}>{label}</Text>{children}</View>
);

const TextField: React.FC<{ value?: string; placeholder?: string; onChange: (v: string) => void; keyboardType?: any; multiline?: boolean; readOnly?: boolean; testID?: string }>
  = ({ value, placeholder, onChange, keyboardType, multiline, readOnly, testID }) => (
    <TextInput
      testID={testID}
      style={[s.input, multiline && s.multiline, readOnly && s.readOnly]}
      value={value || ''} placeholder={placeholder} placeholderTextColor="#B0BEC5"
      onChangeText={onChange} editable={!readOnly}
      keyboardType={keyboardType} multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
    />
  );

const Chips: React.FC<{ options: string[]; value?: string; onChange: (v: string) => void; readOnly?: boolean; testID?: string }>
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

const BilateralField: React.FC<{ label: string; suffix?: string; value?: { right?: string; left?: string }; onChange: (v: { right?: string; left?: string }) => void; keyboardType?: any; readOnly?: boolean }>
  = ({ label, suffix, value, onChange, keyboardType, readOnly }) => (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}{suffix ? <Text style={s.suffix}> ({suffix})</Text> : null}</Text>
      <View style={s.bilateralRow}>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Right</Text>
          <TextInput style={[s.input, readOnly && s.readOnly]} value={value?.right || ''}
            placeholder={suffix || ''} placeholderTextColor="#B0BEC5"
            onChangeText={t => onChange({ ...(value || {}), right: t })}
            editable={!readOnly} keyboardType={keyboardType} />
        </View>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Left</Text>
          <TextInput style={[s.input, readOnly && s.readOnly]} value={value?.left || ''}
            placeholder={suffix || ''} placeholderTextColor="#B0BEC5"
            onChangeText={t => onChange({ ...(value || {}), left: t })}
            editable={!readOnly} keyboardType={keyboardType} />
        </View>
      </View>
    </View>
  );

const BilateralChips: React.FC<{ label: string; options: string[]; value?: { right?: string; left?: string }; onChange: (v: { right?: string; left?: string }) => void; readOnly?: boolean }>
  = ({ label, options, value, onChange, readOnly }) => (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.bilateralRow}>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Right</Text>
          <Chips options={options} value={value?.right} onChange={v => onChange({ ...(value || {}), right: v })} readOnly={readOnly} />
        </View>
        <View style={s.bilateralHalf}>
          <Text style={s.sideLabel}>Left</Text>
          <Chips options={options} value={value?.left} onChange={v => onChange({ ...(value || {}), left: v })} readOnly={readOnly} />
        </View>
      </View>
    </View>
  );

// ── Collapsible phase card ──────────────────────────────────────────────
const PhaseCard: React.FC<{ title: string; badge?: string; icon: keyof typeof Ionicons.glyphMap; tint: string; defaultOpen?: boolean; children: React.ReactNode; testID?: string }>
  = ({ title, badge, icon, tint, defaultOpen, children, testID }) => {
    const [open, setOpen] = useState(!!defaultOpen);
    return (
      <View style={[s.phaseCard, { borderLeftColor: tint }]} testID={testID}>
        <TouchableOpacity style={s.phaseHeader} onPress={() => setOpen(!open)} testID={testID ? `${testID}-toggle` : undefined}>
          <Ionicons name={icon} size={22} color={tint} />
          <Text style={[s.phaseTitle, { color: tint }]}>{title}</Text>
          {badge ? <View style={[s.phaseBadge, { backgroundColor: tint }]}><Text style={s.phaseBadgeText}>{badge}</Text></View> : null}
          <View style={{ flex: 1 }} />
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={tint} />
        </TouchableOpacity>
        {open ? <View style={s.phaseBody}>{children}</View> : null}
      </View>
    );
  };

// ─── PHASE 2 SECTION ────────────────────────────────────────────────────
const Phase2Section: React.FC<{ value: any; onChange: (v: any) => void; isPterygoidLite: boolean; readOnly?: boolean }>
  = ({ value, onChange, isPterygoidLite, readOnly }) => {
    const p2 = value || {};
    const set = (path: string, v: any) => onChange(setPath(p2, path, v));

    // Surgical checklist items — subset for pterygoid-only.
    const checklistItems = isPterygoidLite ? [
      { key: 'flap_raised', label: 'Flap raised' },
      { key: 'alveoloplasty', label: 'Alveoloplasty performed' },
      { key: 'pterygoid_cortex_engaged', label: 'Pterygoid cortex engaged' },
      { key: 'tension_free_closure', label: 'Tension-free closure' },
    ] : [
      { key: 'flap_raised', label: 'Flap raised' },
      { key: 'alveoloplasty', label: 'Alveoloplasty performed' },
      { key: 'sinus_window', label: 'Sinus window / slot created' },
      { key: 'sinus_membrane_elevated', label: 'Sinus membrane elevated' },
      { key: 'membrane_perforation', label: 'Membrane perforation occurred' },
      { key: 'zygomatic_border_palpated', label: 'Zygomatic border palpated' },
      { key: 'apical_exit_verified', label: 'Apical exit verified (extra/intra)' },
      { key: 'pterygoid_cortex_engaged', label: 'Pterygoid cortex engaged' },
      { key: 'tension_free_closure', label: 'Tension-free closure' },
    ];

    return (
      <View>
        {/* A — Surgical Checklist */}
        <Text style={s.subheader}>A. Surgical Checklist</Text>
        {checklistItems.map(item => (
          <View key={item.key} style={s.field}>
            <Text style={s.fieldLabel}>{item.label}</Text>
            <Chips options={YES_NO} value={p2?.checklist?.[item.key]} onChange={v => set(`checklist.${item.key}`, v)} readOnly={readOnly} testID={`p2-check-${item.key}`} />
            {item.key === 'membrane_perforation' && p2?.checklist?.membrane_perforation === 'Yes' ? (
              <View style={{ marginTop: 6 }}>
                <TextField value={p2?.checklist?.membrane_perforation_size_mm} placeholder="Size (mm)" onChange={v => set('checklist.membrane_perforation_size_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />
              </View>
            ) : null}
          </View>
        ))}

        {/* B — Implants Placed (actual) */}
        <Text style={s.subheader}>B. Implants Placed (Actual vs Plan)</Text>
        <Text style={s.helper}>Enter actual placement details per implant. Deviations from Phase 1 plan are flagged.</Text>
        {(p2?.implants_placed || [{}]).map((_impl: any, idx: number) => {
          const impl = p2?.implants_placed?.[idx] || {};
          const setImpl = (k: string, v: any) => {
            const list = [...(p2?.implants_placed || [])];
            list[idx] = { ...(list[idx] || {}), [k]: v };
            set('implants_placed', list);
          };
          return (
            <View key={idx} style={s.implantCard} testID={`p2-implant-${idx}`}>
              <View style={s.rowBetween}>
                <Text style={s.implantTitle}>Implant #{idx + 1}</Text>
                {(p2?.implants_placed || []).length > 1 ? (
                  <TouchableOpacity onPress={() => set('implants_placed', (p2?.implants_placed || []).filter((_: any, i: number) => i !== idx))}>
                    <Ionicons name="close-circle" size={22} color="#C62828" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Field label="Side"><Chips options={['Right', 'Left']} value={impl.side} onChange={v => setImpl('side', v)} readOnly={readOnly} /></Field>
              <Field label="FDI Position"><TextField value={impl.fdi} placeholder="e.g., 15, 25" onChange={v => setImpl('fdi', v)} readOnly={readOnly} /></Field>
              <Field label="Implant Type"><Chips options={['Zygoma', 'Pterygoid', 'Conventional']} value={impl.type} onChange={v => setImpl('type', v)} readOnly={readOnly} /></Field>
              <View style={{ flexDirection: 'row', gap: 8 as any }}>
                <View style={{ flex: 1 }}><Field label="Diameter (mm)"><TextField value={impl.diameter} placeholder="Ø mm" onChange={v => setImpl('diameter', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field></View>
                <View style={{ flex: 1 }}><Field label="Length (mm)"><TextField value={impl.length} placeholder="L mm" onChange={v => setImpl('length', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field></View>
              </View>
              <Field label="Actual Angulation"><Chips options={ANGULATION} value={impl.angulation} onChange={v => setImpl('angulation', v)} readOnly={readOnly} /></Field>
              {impl.type === 'Zygoma' ? (
                <Field label="Surgical Approach (ZAGA)"><Chips options={SURGICAL_APPROACH} value={impl.surgical_approach} onChange={v => setImpl('surgical_approach', v)} readOnly={readOnly} /></Field>
              ) : null}
              <Field label="Insertion Torque (Ncm)"><TextField value={impl.torque_ncm} placeholder="35-45" onChange={v => setImpl('torque_ncm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
              <Field label="Primary Stability Achieved"><Chips options={YES_NO} value={impl.primary_stability} onChange={v => setImpl('primary_stability', v)} readOnly={readOnly} /></Field>
              <Field label="Kit SKU used"><TextField value={impl.kit_sku} placeholder="e.g., 11R-TK-XR011" onChange={v => setImpl('kit_sku', v)} readOnly={readOnly} /></Field>
              <Field label="Deviation from Phase 1 plan?"><Chips options={YES_NO} value={impl.deviation} onChange={v => setImpl('deviation', v)} readOnly={readOnly} /></Field>
              {impl.deviation === 'Yes' ? (
                <Field label="Deviation notes"><TextField value={impl.deviation_notes} placeholder="Describe deviation..." onChange={v => setImpl('deviation_notes', v)} multiline readOnly={readOnly} /></Field>
              ) : null}
            </View>
          );
        })}
        {!readOnly ? (
          <TouchableOpacity style={s.addBtn} onPress={() => set('implants_placed', [...(p2?.implants_placed || []), {}])} testID="p2-add-implant">
            <Ionicons name="add-circle-outline" size={18} color="#5E35B1" />
            <Text style={s.addBtnText}>Add Implant</Text>
          </TouchableOpacity>
        ) : null}

        {/* C — Intra-op Complications */}
        <Text style={s.subheader}>C. Intra-Operative Complications</Text>
        {[
          { key: 'bleeding', label: 'Significant bleeding' },
          ...(isPterygoidLite ? [] : [
            { key: 'sinus_perforation', label: 'Sinus perforation' },
            { key: 'orbital_floor_breach', label: 'Orbital floor breach' },
            { key: 'infraorbital_nerve', label: 'Infraorbital nerve injury' },
            { key: 'nasal_cavity_breach', label: 'Nasal cavity breach' },
          ]),
          { key: 'adjacent_tooth', label: 'Adjacent tooth injury' },
        ].map(item => (
          <View key={item.key} style={s.field}>
            <Text style={s.fieldLabel}>{item.label}</Text>
            <Chips options={YES_NO} value={p2?.complications?.[item.key]} onChange={v => set(`complications.${item.key}`, v)} readOnly={readOnly} testID={`p2-comp-${item.key}`} />
            {p2?.complications?.[item.key] === 'Yes' ? (
              <View style={{ marginTop: 6 }}>
                <TextField value={p2?.complications?.[`${item.key}_notes`]} placeholder="Details / size (mm) / management..." onChange={v => set(`complications.${item.key}_notes`, v)} multiline readOnly={readOnly} />
              </View>
            ) : null}
          </View>
        ))}
        <Field label="Other complication (free text)">
          <TextField value={p2?.complications?.other} placeholder="Any other intra-op finding..." onChange={v => set('complications.other', v)} multiline readOnly={readOnly} />
        </Field>
      </View>
    );
  };

// ─── PHASE 3 SECTION (Day 0/7/30) ───────────────────────────────────────
const Phase3Section: React.FC<{ value: any; onChange: (v: any) => void; readOnly?: boolean }>
  = ({ value, onChange, readOnly }) => {
    const p3 = value || {};
    const set = (path: string, v: any) => onChange(setPath(p3, path, v));

    return (
      <View>
        {/* Day 0 — Immediate Prosthesis Delivery */}
        <Text style={s.subheader}>⏱ Day 0 — Immediate Prosthesis Delivery</Text>
        <Field label="Delivery date/time"><TextField value={p3?.day0?.delivered_at} placeholder="YYYY-MM-DD HH:MM" onChange={v => set('day0.delivered_at', v)} readOnly={readOnly} /></Field>
        <Field label="Prosthesis type"><Chips options={PROSTHESIS_TYPE_FULL} value={p3?.day0?.prosthesis_type} onChange={v => set('day0.prosthesis_type', v)} readOnly={readOnly} /></Field>
        <Field label="Angled MUA used (per implant summary)"><TextField value={p3?.day0?.mua_angulations_summary} placeholder="e.g., R-15° 30°, R-16° 30°, L-25° 45°" onChange={v => set('day0.mua_angulations_summary', v)} readOnly={readOnly} /></Field>
        <Field label="MUA torque applied (Ncm)"><TextField value={p3?.day0?.mua_torque} placeholder="15-25" onChange={v => set('day0.mua_torque', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Prosthetic screw torque (Ncm)"><TextField value={p3?.day0?.prosthetic_screw_torque} placeholder="15-25" onChange={v => set('day0.prosthetic_screw_torque', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Post-op OPG / CBCT verified?"><Chips options={YES_NO} value={p3?.day0?.post_op_imaging_verified} onChange={v => set('day0.post_op_imaging_verified', v)} readOnly={readOnly} testID="p3-d0-imaging" /></Field>
        <Field label="Immediate cantilever length (mm)"><TextField value={p3?.day0?.cantilever_mm} placeholder="mm" onChange={v => set('day0.cantilever_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Text style={s.subheader2}>Post-op instructions given (checklist)</Text>
        {[
          { k: 'soft_diet', l: 'Soft diet' },
          { k: 'sinus_precautions', l: 'Sinus precautions' },
          { k: 'no_nose_blowing', l: 'No nose-blowing for 2 weeks' },
          { k: 'head_elevated_sleep', l: 'Sleep with head elevated' },
          { k: 'sinus_rinse', l: 'Sinus rinse protocol' },
          { k: 'oral_hygiene', l: 'Chlorhexidine mouthwash' },
          { k: 'emergency_contact', l: 'Emergency contact given' },
        ].map(x => (
          <View key={x.k} style={s.field}>
            <Text style={s.fieldLabel}>{x.l}</Text>
            <Chips options={YES_NO} value={p3?.day0?.instructions?.[x.k]} onChange={v => set(`day0.instructions.${x.k}`, v)} readOnly={readOnly} testID={`p3-d0-inst-${x.k}`} />
          </View>
        ))}
        <Field label="Medications given (drug/dose/duration)">
          <TextField value={p3?.day0?.medications} placeholder="Antibiotics, corticosteroids, analgesics, nasal decongestant..." onChange={v => set('day0.medications', v)} multiline readOnly={readOnly} />
        </Field>

        {/* Day 7 — Suture removal + early check */}
        <Text style={s.subheader}>⏱ Day 7 — Suture Removal & Early Check</Text>
        <Field label="Attended?"><Chips options={YES_NO} value={p3?.day7?.attended} onChange={v => set('day7.attended', v)} readOnly={readOnly} testID="p3-d7-attended" /></Field>
        <Field label="Sutures removed"><Chips options={YES_NO} value={p3?.day7?.sutures_removed} onChange={v => set('day7.sutures_removed', v)} readOnly={readOnly} /></Field>
        <Field label="Wound status"><Chips options={WOUND_STATUS} value={p3?.day7?.wound_status} onChange={v => set('day7.wound_status', v)} readOnly={readOnly} /></Field>
        <Field label="Pain score (0-10)"><TextField value={p3?.day7?.pain_score} placeholder="0-10" onChange={v => set('day7.pain_score', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Text style={s.subheader2}>Early complications</Text>
        {[
          { k: 'hematoma', l: 'Hematoma' },
          { k: 'epistaxis', l: 'Epistaxis' },
          { k: 'ecchymosis', l: 'Ecchymosis (facial/periorbital)' },
          { k: 'paresthesia', l: 'Infraorbital paresthesia' },
          { k: 'sinus_symptoms', l: 'Sinus symptoms (congestion/discharge/pain)' },
          { k: 'trismus', l: 'Trismus' },
          { k: 'wound_dehiscence', l: 'Wound dehiscence' },
        ].map(x => (
          <View key={x.k} style={s.field}>
            <Text style={s.fieldLabel}>{x.l}</Text>
            <Chips options={YES_NO} value={p3?.day7?.complications?.[x.k]} onChange={v => set(`day7.complications.${x.k}`, v)} readOnly={readOnly} />
          </View>
        ))}
        <Field label="Prosthesis stable at day 7?"><Chips options={YES_NO} value={p3?.day7?.prosthesis_stable} onChange={v => set('day7.prosthesis_stable', v)} readOnly={readOnly} /></Field>

        {/* Day 30 — First follow-up */}
        <Text style={s.subheader}>⏱ Day 30 — First Follow-up</Text>
        <Field label="Attended?"><Chips options={YES_NO} value={p3?.day30?.attended} onChange={v => set('day30.attended', v)} readOnly={readOnly} /></Field>
        <Field label="Prosthesis stable?"><Chips options={YES_NO} value={p3?.day30?.prosthesis_stable} onChange={v => set('day30.prosthesis_stable', v)} readOnly={readOnly} /></Field>
        <Field label="Patient satisfaction (VAS 0-10)"><TextField value={p3?.day30?.satisfaction_vas} placeholder="0-10" onChange={v => set('day30.satisfaction_vas', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Oral hygiene"><Chips options={['Good', 'Fair', 'Poor']} value={p3?.day30?.hygiene} onChange={v => set('day30.hygiene', v)} readOnly={readOnly} /></Field>
        <Field label="Occlusal adjustment needed?"><Chips options={YES_NO} value={p3?.day30?.occlusal_adjustment} onChange={v => set('day30.occlusal_adjustment', v)} readOnly={readOnly} /></Field>
        <BilateralField label="Baseline radiographic bone level (mesial)" suffix="mm" value={p3?.day30?.bone_level_mesial} onChange={v => set('day30.bone_level_mesial', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralField label="Baseline radiographic bone level (distal)" suffix="mm" value={p3?.day30?.bone_level_distal} onChange={v => set('day30.bone_level_distal', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <Field label="Late complications / notes"><TextField value={p3?.day30?.notes} placeholder="Any late complications or observations..." onChange={v => set('day30.notes', v)} multiline readOnly={readOnly} /></Field>
      </View>
    );
  };

// ─── PHASE 4 SECTION ────────────────────────────────────────────────────
const Phase4Section: React.FC<{ value: any; onChange: (v: any) => void; isPterygoidLite: boolean; readOnly?: boolean }>
  = ({ value, onChange, isPterygoidLite, readOnly }) => {
    const p4 = value || {};
    const set = (path: string, v: any) => onChange(setPath(p4, path, v));

    return (
      <View>
        <Text style={s.subheader}>Definitive Prosthesis</Text>
        <View style={s.info}>
          <Ionicons name="lock-closed" size={14} color="#5E35B1" />
          <Text style={s.infoText}>
            {isPterygoidLite ? 'Screw-retained preferred; cement-retained allowed for conventional posterior only.' : 'Screw-retained enforced. Cement-retained is NOT permitted for Zygoma prosthetics.'}
          </Text>
        </View>
        <Field label="Prosthesis Type"><Chips options={PROSTHESIS_TYPE_FULL} value={p4?.prosthesis_type} onChange={v => set('prosthesis_type', v)} readOnly={readOnly} testID="p4-prosthesis-type" /></Field>
        <Field label="Retention Type">
          <Chips options={isPterygoidLite ? ['Screw-retained', 'Cement-retained'] : ['Screw-retained']}
            value={p4?.retention_type || (isPterygoidLite ? '' : 'Screw-retained')}
            onChange={v => set('retention_type', v)} readOnly={readOnly} testID="p4-retention" />
        </Field>
        <Field label="Framework verification (Sheffield / one-screw test)"><Chips options={FRAMEWORK_TEST} value={p4?.framework_test} onChange={v => set('framework_test', v)} readOnly={readOnly} /></Field>

        <Text style={s.subheader}>Torque Log</Text>
        <Field label="MUA torque values (per implant summary)"><TextField value={p4?.torque_log?.mua_summary} placeholder="R15° 25Ncm, R16° 25Ncm..." onChange={v => set('torque_log.mua_summary', v)} multiline readOnly={readOnly} /></Field>
        <Field label="Prosthetic screw torque"><TextField value={p4?.torque_log?.prosthetic_summary} placeholder="15-25 Ncm per implant" onChange={v => set('torque_log.prosthetic_summary', v)} multiline readOnly={readOnly} /></Field>
        <Field label="Access hole sealed (Teflon + composite)?"><Chips options={YES_NO} value={p4?.torque_log?.access_hole_sealed} onChange={v => set('torque_log.access_hole_sealed', v)} readOnly={readOnly} /></Field>

        <Text style={s.subheader}>Occlusion & Phonetics</Text>
        <Field label="Final occlusal scheme"><Chips options={OCCLUSAL_SCHEMES} value={p4?.occlusion?.scheme} onChange={v => set('occlusion.scheme', v)} readOnly={readOnly} /></Field>
        <Field label="Freeway space (mm)"><TextField value={p4?.occlusion?.freeway_mm} placeholder="mm" onChange={v => set('occlusion.freeway_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="VDO measured (mm)"><TextField value={p4?.occlusion?.vdo_mm} placeholder="mm" onChange={v => set('occlusion.vdo_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Anterior guidance"><Chips options={YES_NO} value={p4?.occlusion?.anterior_guidance} onChange={v => set('occlusion.anterior_guidance', v)} readOnly={readOnly} /></Field>
        <Field label="Protrusive guidance"><Chips options={YES_NO} value={p4?.occlusion?.protrusive_guidance} onChange={v => set('occlusion.protrusive_guidance', v)} readOnly={readOnly} /></Field>
        <Field label="Speech clarity self-report (1-10)"><TextField value={p4?.phonetics?.speech_clarity} placeholder="1-10" onChange={v => set('phonetics.speech_clarity', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="S / F-V sounds normal?"><Chips options={YES_NO} value={p4?.phonetics?.sibilants_ok} onChange={v => set('phonetics.sibilants_ok', v)} readOnly={readOnly} /></Field>
        <Field label="Whistling on S?"><Chips options={YES_NO} value={p4?.phonetics?.whistling} onChange={v => set('phonetics.whistling', v)} readOnly={readOnly} /></Field>

        <Text style={s.subheader}>Cantilever & A-P Spread (Actual)</Text>
        <Field label="A-P Spread (mm)"><TextField value={p4?.cantilever?.ap_spread_mm} placeholder="mm" onChange={v => set('cantilever.ap_spread_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Distal cantilever length (mm)"><TextField value={p4?.cantilever?.distal_length_mm} placeholder="mm" onChange={v => set('cantilever.distal_length_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Field label="Ratio within 1:1.5?"><Chips options={YES_NO} value={p4?.cantilever?.ratio_ok} onChange={v => set('cantilever.ratio_ok', v)} readOnly={readOnly} /></Field>

        <Text style={s.subheader}>Esthetics & Handover</Text>
        <Field label="Smile line class"><Chips options={SMILE_LINE} value={p4?.esthetics?.smile_line} onChange={v => set('esthetics.smile_line', v)} readOnly={readOnly} /></Field>
        <Field label="Patient satisfaction (VAS 0-10)"><TextField value={p4?.esthetics?.satisfaction_vas} placeholder="0-10" onChange={v => set('esthetics.satisfaction_vas', v)} keyboardType="decimal-pad" readOnly={readOnly} /></Field>
        <Text style={s.subheader2}>Hygiene & Maintenance Training</Text>
        {[
          { k: 'superfloss', l: 'Superfloss demo' },
          { k: 'waterpik', l: 'Water pik use' },
          { k: 'interproximal', l: 'Interproximal brush' },
          { k: 'chlorhexidine', l: 'Chlorhexidine rinse' },
        ].map(x => (
          <View key={x.k} style={s.field}>
            <Text style={s.fieldLabel}>{x.l}</Text>
            <Chips options={YES_NO} value={p4?.hygiene?.[x.k]} onChange={v => set(`hygiene.${x.k}`, v)} readOnly={readOnly} />
          </View>
        ))}
        <Field label="Recall schedule agreed">
          <Chips options={['3 months', '6 months', '12 months']} value={p4?.hygiene?.recall} onChange={v => set('hygiene.recall', v)} readOnly={readOnly} />
        </Field>
        <Field label="Handover packet given (warranty + care instructions)"><Chips options={YES_NO} value={p4?.handover?.packet_given} onChange={v => set('handover.packet_given', v)} readOnly={readOnly} /></Field>
      </View>
    );
  };

// ─── PHASE 5 SECTION — Aparicio ORIS ────────────────────────────────────
const Phase5Section: React.FC<{ value: any; onChange: (v: any) => void; isPterygoidLite: boolean; readOnly?: boolean }>
  = ({ value, onChange, isPterygoidLite, readOnly }) => {
    const p5 = value || {};
    const set = (path: string, v: any) => onChange(setPath(p5, path, v));

    // Auto-calculate composite success code (Aparicio ORIS)
    // iter-Feb-2026 (v4b): thresholds are scaled to the number of criteria
    // per variant — full-arch Zygoma = 4 criteria × 2 sides = 8 checks;
    // pterygoid-lite = 3 criteria × 2 sides = 6 checks (sinus_status is
    // NOT scored for pterygoid because pterygoid implants don't traverse
    // the sinus).
    const successCode = useMemo(() => {
      const oris = p5?.oris || {};
      const criteriaPerSide = isPterygoidLite ? 3 : 4;
      const maxTotal = criteriaPerSide * 2;
      // Count each side (R/L) — count healthy vs deviation
      const evalSide = (key: 'right' | 'left') => {
        const checks = [
          oris?.implant_stability?.[key] === 'Yes',
          !!oris?.head_position?.[key] && oris?.head_position?.[key] === 'Anatomical',
          oris?.soft_tissue?.[key] === 'Healthy',
        ];
        if (!isPterygoidLite) checks.push(oris?.sinus_status?.[key] === 'Healthy');
        return checks.filter(Boolean).length;
      };
      const anyMobile = oris?.implant_stability?.right === 'No' || oris?.implant_stability?.left === 'No';
      if (anyMobile) return { code: 'Failure', tint: '#C62828', desc: 'Implant not stable — failure per ORIS.' };
      const total = evalSide('right') + evalSide('left');
      // Proportional thresholds scaled to variant.
      if (total >= maxTotal) return { code: 'Success', tint: '#2E7D32', desc: 'All ORIS criteria met bilaterally.' };
      if (total >= Math.ceil(maxTotal * 0.75)) return { code: 'Survival — Compatible with Health', tint: '#F9A825', desc: 'Minor deviation in 1-2 criteria; overall health compatible.' };
      if (total >= Math.ceil(maxTotal * 0.375)) return { code: 'Survival — Incompatible with Health', tint: '#EF6C00', desc: 'Multiple deviations; pathology present — active management required.' };
      return { code: 'Insufficient data', tint: '#78909C', desc: 'Complete ORIS assessment to compute success code.' };
    }, [p5, isPterygoidLite]);

    return (
      <View>
        <Text style={s.subheader}>Recall Timepoint</Text>
        <Field label="Timepoint of this assessment"><Chips options={RECALL_TIMEPOINTS} value={p5?.recall_timepoint} onChange={v => set('recall_timepoint', v)} readOnly={readOnly} testID="p5-recall" /></Field>
        <Field label="Visit date"><TextField value={p5?.visit_date} placeholder="YYYY-MM-DD" onChange={v => set('visit_date', v)} readOnly={readOnly} /></Field>

        <Text style={s.subheader}>Aparicio ORIS — Zygoma Success Code</Text>
        <BilateralChips label="1. Implant Stability (Stable = Yes)" options={YES_NO} value={p5?.oris?.implant_stability} onChange={v => set('oris.implant_stability', v)} readOnly={readOnly} />
        <BilateralChips label="2. Prosthetic Offset — Head Position" options={HEAD_POSITION} value={p5?.oris?.head_position} onChange={v => set('oris.head_position', v)} readOnly={readOnly} />
        {!isPterygoidLite ? (
          <BilateralChips label="3. Sinus Status" options={SINUS_STATUS} value={p5?.oris?.sinus_status} onChange={v => set('oris.sinus_status', v)} readOnly={readOnly} />
        ) : null}
        <BilateralChips label={isPterygoidLite ? '3. Peri-implant Soft Tissue' : '4. Peri-implant Soft Tissue'} options={PERI_IMPLANT_SOFT_TISSUE} value={p5?.oris?.soft_tissue} onChange={v => set('oris.soft_tissue', v)} readOnly={readOnly} />
        <BilateralField label="Bleeding on probing" value={p5?.oris?.bop} onChange={v => set('oris.bop', v)} readOnly={readOnly} />
        <BilateralField label="Probing depth" suffix="mm" value={p5?.oris?.probing_depth_mm} onChange={v => set('oris.probing_depth_mm', v)} keyboardType="decimal-pad" readOnly={readOnly} />

        {/* Composite success badge (auto-calculated, read-only) */}
        <View style={[s.successBadge, { backgroundColor: successCode.tint }]} testID="p5-success-code">
          <Ionicons name="ribbon" size={22} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.successBadgeCode}>{successCode.code}</Text>
            <Text style={s.successBadgeDesc}>{successCode.desc}</Text>
          </View>
        </View>

        <Text style={s.subheader}>Radiographic Bone Level (longitudinal)</Text>
        <BilateralField label="Mesial bone level" suffix="mm" value={p5?.bone_level_mesial} onChange={v => set('bone_level_mesial', v)} keyboardType="decimal-pad" readOnly={readOnly} />
        <BilateralField label="Distal bone level" suffix="mm" value={p5?.bone_level_distal} onChange={v => set('bone_level_distal', v)} keyboardType="decimal-pad" readOnly={readOnly} />

        <Field label="Patient complaints / notes"><TextField value={p5?.notes} placeholder="Complaints, symptoms, other findings..." onChange={v => set('notes', v)} multiline readOnly={readOnly} /></Field>
      </View>
    );
  };

// ─── CO-SIGN MODAL ──────────────────────────────────────────────────────
const CosignModal: React.FC<{
  visible: boolean; onClose: () => void; procedureId: string; stage: 'phase2' | 'phase3_day0';
  onCosignSaved: () => void;
}> = ({ visible, onClose, procedureId, stage, onCosignSaved }) => {
  const [slot, setSlot] = useState<'supervisor' | 'incharge' | 'prosthodontist'>('supervisor');
  const [signerName, setSignerName] = useState('');
  const [comment, setComment] = useState('');
  const [strokes, setStrokes] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const slotOptions: any = stage === 'phase2' ? ['supervisor', 'incharge'] : ['supervisor', 'prosthodontist'];

  const handleSave = async () => {
    if (!strokes.length) {
      Alert.alert('Signature required', 'Please draw the signature before saving.');
      return;
    }
    if (!signerName.trim()) {
      Alert.alert('Name required', 'Please enter the signer name.');
      return;
    }
    setSaving(true);
    try {
      // Serialize strokes to a JSON string for storage (light-weight vector data)
      const signature_data = JSON.stringify(strokes);
      await api.post(`/procedures/${procedureId}/zygoma-cosign`, {
        stage, role_slot: slot, signature_data, signer_name: signerName, comment,
      });
      onCosignSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Co-sign failed', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.rowBetween}>
            <Text style={s.modalTitle}>Co-Sign ({stage === 'phase2' ? 'Phase 2 Surgical' : 'Phase 3 Day-0'})</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#455A64" /></TouchableOpacity>
          </View>
          <Field label="Role Slot"><Chips options={slotOptions} value={slot} onChange={v => setSlot(v as any)} /></Field>
          <Field label="Signer Name"><TextField value={signerName} placeholder="Full name" onChange={setSignerName} /></Field>
          <Field label="Comment (optional)"><TextField value={comment} placeholder="Comment..." onChange={setComment} multiline /></Field>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.fieldLabel}>Signature</Text>
            {strokes.length ? (
              <TouchableOpacity onPress={() => setStrokes([])}>
                <Text style={{ fontSize: 12, color: '#C62828', fontWeight: '600' }}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={s.signPadWrap}>
            <SignaturePad strokes={strokes} onChange={setStrokes} height={160} testID="cosign-signature-pad" />
          </View>
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} testID="cosign-save-btn">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save Co-Sign</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ────────────────────────────────────────────────────────
type Props = {
  procedureId: string;
  procedureType: string;
  isPterygoidLite: boolean;
  initialData?: any;
  cosigns?: any;
  onSaved?: () => void;
  readOnly?: boolean;
};

const ZygomaExtendedWorkflow: React.FC<Props> = ({ procedureId, procedureType, isPterygoidLite, initialData, cosigns: cosignsProp, onSaved, readOnly }) => {
  const [data, setData] = useState<any>(initialData || {});
  const [saving, setSaving] = useState(false);
  const [cosigns, setCosigns] = useState<any>(cosignsProp || {});
  const [cosignOpen, setCosignOpen] = useState<null | 'phase2' | 'phase3_day0'>(null);

  useEffect(() => { if (initialData) setData(initialData); }, [initialData]);
  useEffect(() => { if (cosignsProp) setCosigns(cosignsProp); }, [cosignsProp]);

  const savePhase = useCallback(async (phase: 'phase2' | 'phase3' | 'phase4' | 'phase5') => {
    setSaving(true);
    try {
      await api.patch(`/procedures/${procedureId}/zygoma-workflow`, {
        phase, data: data?.[phase] || {},
      });
      onSaved?.();
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [data, procedureId, onSaved]);

  const refreshCosigns = useCallback(async () => {
    try {
      const res = await api.get(`/procedures/${procedureId}/zygoma-cosigns`);
      setCosigns(res.data);
    } catch { /* ignore */ }
  }, [procedureId]);

  const setPhase = (phase: string, val: any) => setData({ ...data, [phase]: val });

  const p2Cosigns = cosigns?.cosigns?.phase2 || cosigns?.phase2 || {};
  const p3d0Cosigns = cosigns?.cosigns?.phase3_day0 || cosigns?.phase3_day0 || {};
  const p2Ready = !!p2Cosigns?.supervisor && !!p2Cosigns?.incharge;
  const p3d0Ready = !!p3d0Cosigns?.supervisor && !!p3d0Cosigns?.prosthodontist;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 12 }}>
      <View style={s.header}>
        <Ionicons name="medical" size={22} color="#5E35B1" />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={s.headerTitle}>Zygoma / Pterygoid Extended Workflow</Text>
          <Text style={s.headerSub}>{procedureType}{isPterygoidLite ? ' — Lite variant' : ''}</Text>
        </View>
      </View>

      {/* PHASE 2 */}
      <PhaseCard title="Phase 2 — Surgical Execution" icon="cut-outline" tint="#C2185B" defaultOpen testID="phase-2-card">
        <Phase2Section value={data.phase2} onChange={v => setPhase('phase2', v)} isPterygoidLite={isPterygoidLite} readOnly={readOnly} />
        {/* Co-sign gating */}
        <View style={s.cosignBox} testID="phase2-cosign-box">
          <Text style={s.cosignLabel}>Supervisor Co-Sign</Text>
          <View style={s.cosignRow}>
            <Ionicons name={p2Cosigns?.supervisor ? 'checkmark-circle' : 'time-outline'} size={18} color={p2Cosigns?.supervisor ? '#2E7D32' : '#B0BEC5'} />
            <Text style={s.cosignText}>Supervisor: {p2Cosigns?.supervisor?.signer_name || 'Pending'}</Text>
          </View>
          <View style={s.cosignRow}>
            <Ionicons name={p2Cosigns?.incharge ? 'checkmark-circle' : 'time-outline'} size={18} color={p2Cosigns?.incharge ? '#2E7D32' : '#B0BEC5'} />
            <Text style={s.cosignText}>Implant In-Charge: {p2Cosigns?.incharge?.signer_name || 'Pending'}</Text>
          </View>
          {!readOnly ? (
            <TouchableOpacity style={s.cosignBtn} onPress={() => setCosignOpen('phase2')} testID="phase2-cosign-btn">
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={s.cosignBtnText}>Add Co-Sign</Text>
            </TouchableOpacity>
          ) : null}
          {p2Ready ? <Text style={s.readyText}>✅ Both signatures collected — Phase 2 ready to submit</Text> : <Text style={s.pendingText}>⏳ Waiting for both signatures before Phase 2 can be submitted</Text>}
        </View>
        {!readOnly ? (
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={() => savePhase('phase2')} disabled={saving} testID="phase2-save-btn">
            <Text style={s.primaryBtnText}>{saving ? 'Saving…' : 'Save Phase 2'}</Text>
          </TouchableOpacity>
        ) : null}
      </PhaseCard>

      {/* PHASE 3 */}
      <PhaseCard
        title={isPterygoidLite ? 'Phase 3 — Post-Op Monitoring' : 'Phase 3 — Immediate Loading & Post-Op Monitoring'}
        icon="pulse-outline" tint="#1E88E5" testID="phase-3-card"
      >
        <Phase3Section value={data.phase3} onChange={v => setPhase('phase3', v)} readOnly={readOnly} />
        {!isPterygoidLite ? (
          <View style={s.cosignBox} testID="phase3-cosign-box">
            <Text style={s.cosignLabel}>Phase 3 Day-0 Co-Sign</Text>
            <View style={s.cosignRow}>
              <Ionicons name={p3d0Cosigns?.supervisor ? 'checkmark-circle' : 'time-outline'} size={18} color={p3d0Cosigns?.supervisor ? '#2E7D32' : '#B0BEC5'} />
              <Text style={s.cosignText}>Supervisor: {p3d0Cosigns?.supervisor?.signer_name || 'Pending'}</Text>
            </View>
            <View style={s.cosignRow}>
              <Ionicons name={p3d0Cosigns?.prosthodontist ? 'checkmark-circle' : 'time-outline'} size={18} color={p3d0Cosigns?.prosthodontist ? '#2E7D32' : '#B0BEC5'} />
              <Text style={s.cosignText}>Prosthodontist: {p3d0Cosigns?.prosthodontist?.signer_name || 'Pending'}</Text>
            </View>
            {!readOnly ? (
              <TouchableOpacity style={s.cosignBtn} onPress={() => setCosignOpen('phase3_day0')} testID="phase3-cosign-btn">
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={s.cosignBtnText}>Add Co-Sign</Text>
              </TouchableOpacity>
            ) : null}
            {p3d0Ready ? <Text style={s.readyText}>✅ Both signatures collected</Text> : <Text style={s.pendingText}>⏳ Waiting for both Day-0 signatures</Text>}
          </View>
        ) : null}
        {!readOnly ? (
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={() => savePhase('phase3')} disabled={saving} testID="phase3-save-btn">
            <Text style={s.primaryBtnText}>{saving ? 'Saving…' : 'Save Phase 3'}</Text>
          </TouchableOpacity>
        ) : null}
      </PhaseCard>

      {/* PHASE 4 */}
      <PhaseCard title="Phase 4 — Prosthetic Rehabilitation" icon="construct-outline" tint="#00897B" testID="phase-4-card">
        <Phase4Section value={data.phase4} onChange={v => setPhase('phase4', v)} isPterygoidLite={isPterygoidLite} readOnly={readOnly} />
        {!readOnly ? (
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={() => savePhase('phase4')} disabled={saving} testID="phase4-save-btn">
            <Text style={s.primaryBtnText}>{saving ? 'Saving…' : 'Save Phase 4'}</Text>
          </TouchableOpacity>
        ) : null}
      </PhaseCard>

      {/* PHASE 5 */}
      <PhaseCard title="Phase 5 — Follow-up (Aparicio ORIS)" icon="ribbon-outline" tint="#8E24AA" testID="phase-5-card">
        <Phase5Section value={data.phase5} onChange={v => setPhase('phase5', v)} isPterygoidLite={isPterygoidLite} readOnly={readOnly} />
        {!readOnly ? (
          <TouchableOpacity style={[s.primaryBtn, saving && { opacity: 0.6 }]} onPress={() => savePhase('phase5')} disabled={saving} testID="phase5-save-btn">
            <Text style={s.primaryBtnText}>{saving ? 'Saving…' : 'Save Phase 5'}</Text>
          </TouchableOpacity>
        ) : null}
      </PhaseCard>

      {/* Co-sign modal */}
      {cosignOpen ? (
        <CosignModal
          visible
          stage={cosignOpen}
          procedureId={procedureId}
          onClose={() => setCosignOpen(null)}
          onCosignSaved={refreshCosigns}
        />
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE7F6', padding: 12, borderRadius: 10, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#5E35B1' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#4527A0' },
  headerSub: { fontSize: 12, color: '#5D4037' },
  phaseCard: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: '#ECEFF1',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 1 }, web: { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } }),
  },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  phaseTitle: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
  phaseBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  phaseBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  phaseBody: { padding: 12 },
  subheader: { fontSize: 13, fontWeight: '700', color: '#455A64', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  subheader2: { fontSize: 12, fontWeight: '600', color: '#546E7A', marginTop: 8, marginBottom: 6 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  suffix: { fontWeight: '400', color: '#78909C', fontSize: 12 },
  input: { backgroundColor: '#F5F7FA', borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 10 : 6, fontSize: 14, color: '#263238' },
  multiline: { minHeight: 68, textAlignVertical: 'top' },
  readOnly: { backgroundColor: '#ECEFF1', color: '#546E7A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 as any },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  chipSelected: { backgroundColor: '#5E35B1', borderColor: '#5E35B1' },
  chipText: { fontSize: 12, color: '#455A64' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  bilateralRow: { flexDirection: 'row', gap: 8 as any },
  bilateralHalf: { flex: 1 },
  sideLabel: { fontSize: 11, color: '#78909C', marginBottom: 4, fontWeight: '600' },
  helper: { fontSize: 11, color: '#78909C', fontStyle: 'italic', marginBottom: 8 },
  implantCard: { backgroundColor: '#FAFBFC', borderRadius: 8, borderWidth: 1, borderColor: '#E1E7EE', padding: 10, marginBottom: 10 },
  implantTitle: { fontSize: 13, fontWeight: '700', color: '#5E35B1', marginBottom: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDE7F6', paddingVertical: 8, borderRadius: 8, marginTop: 4, marginBottom: 12 },
  addBtnText: { color: '#5E35B1', fontWeight: '700', marginLeft: 6, fontSize: 13 },
  info: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE7F6', borderRadius: 6, padding: 8, marginBottom: 10 },
  infoText: { fontSize: 11, color: '#4527A0', marginLeft: 6, flex: 1, lineHeight: 15 },
  successBadge: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginVertical: 10 },
  successBadgeCode: { color: '#fff', fontSize: 14, fontWeight: '700' },
  successBadgeDesc: { color: '#fff', fontSize: 11, opacity: 0.9, marginTop: 2 },
  cosignBox: { backgroundColor: '#FFF8E1', borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#F9A825' },
  cosignLabel: { fontSize: 12, fontWeight: '700', color: '#5D4037', marginBottom: 6 },
  cosignRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cosignText: { fontSize: 12, color: '#455A64', marginLeft: 6 },
  cosignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9A825', paddingVertical: 8, borderRadius: 6, marginTop: 6 },
  cosignBtnText: { color: '#fff', fontWeight: '700', marginLeft: 6, fontSize: 12 },
  readyText: { fontSize: 11, color: '#2E7D32', fontWeight: '700', marginTop: 4 },
  pendingText: { fontSize: 11, color: '#EF6C00', fontStyle: 'italic', marginTop: 4 },
  primaryBtn: { backgroundColor: '#5E35B1', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#37474F', flex: 1 },
  signPadWrap: { alignItems: 'center', marginVertical: 8, backgroundColor: '#F5F7FA', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#E0E0E0' },
});

export default ZygomaExtendedWorkflow;
