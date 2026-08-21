/**
 * PhaseStep2TabbedView.tsx — iter-Jun-2026 (v10, Chunk 3)
 *
 * Drop-in Step-2 component for Phase 2 / 3 / 4 / 5 screens that gives Zygoma
 * / Pterygoid / Conventional implants their own collapsible cards under
 * type-coloured tabs (orange / blue / yellow). Advanced Clinical outcomes
 * (ORIS success code, immediate loading, ZAGA confirmation, supervisor
 * co-sign) are appended inside the Zygoma tab only.
 *
 * Renders NOTHING (returns null) when the case has only one implant type AND
 * that type is 'conventional' — legacy Phase-N forms handle those cases
 * unchanged. For pure Quad Zygoma / Zyg+Pter cases the single applicable tab
 * auto-expands with no tab-bar rendered (see ImplantTypeTabs).
 *
 * Backend contract: PATCH /api/procedures/{id}/tabbed-phase-data/{phase}
 * with `{ per_implant: {POS: {...}}, advanced_clinical: {...} }`.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { calculateOris } from '../src/utils/orisCalculator';

const API = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api`;

// ── Types ────────────────────────────────────────────────────
export type PhaseNum = 2 | 3 | 4 | 5;
export type ImplantType = 'zygoma' | 'pterygoid' | 'conventional';

interface ImplantPlan {
  position: string;
  implant_type?: ImplantType;
  side?: string;
  row_label?: string;
  brand?: string;
  system?: string;
  diameter?: number;
  length?: number;
}

interface PerImplantRecord {
  torque_ncm?: number | string;
  isq?: number | string;               // Conventional only — NEVER stored for zygoma/pterygoid
  insertion_date?: string;
  timing_type?: string;                // immediate | delayed | early
  mua_angulation?: string;             // 0 | 17 | 30 | 45 | Other
  complications?: string;
  notes?: string;
  completed?: boolean;                 // user-flagged when done
}

interface AdvancedClinical {
  zaga_confirmed_right?: string;
  zaga_confirmed_left?: string;
  no_sinus_disease?: boolean;
  no_oro_antral_communication?: boolean;
  screw_retained_confirmed?: boolean;
  passive_fit_verified?: boolean;
  no_radiographic_peri_implant_lesion?: boolean;
  immediate_loading_day0_at?: string;
  immediate_loading_day7_at?: string;
  immediate_loading_day30_at?: string;
  oris_success_code?: number;          // 0..4 (auto-calculated preview + persisted on save)
  supervisor_cosign_notes?: string;
}

interface Props {
  phase: PhaseNum;
  procedureId: string;
  token: string;                       // Bearer token for API auth
  implantPlans: ImplantPlan[];         // usually procedure.implant_plans
  initialPerImplant?: Record<string, PerImplantRecord>;
  initialAdvancedClinical?: AdvancedClinical;
  readOnly?: boolean;
  onSaved?: () => void;
}

const TYPE_COLORS: Record<ImplantType, { bg: string; border: string; fg: string; dot: string }> = {
  zygoma:       { bg: '#FFF3E0', border: '#FB8C00', fg: '#E65100', dot: '#E65100' },
  pterygoid:    { bg: '#E3F2FD', border: '#1E88E5', fg: '#1565C0', dot: '#1565C0' },
  conventional: { bg: '#FFFDE7', border: '#FBC02D', fg: '#F57F17', dot: '#F57F17' },
};
const TYPE_LABELS: Record<ImplantType, string> = { zygoma: 'Zygoma', pterygoid: 'Pterygoid', conventional: 'Conventional' };

// ── Helpers ──────────────────────────────────────────────────
const groupImplantsByType = (plans: ImplantPlan[]): Record<ImplantType, ImplantPlan[]> => {
  const out: Record<ImplantType, ImplantPlan[]> = { zygoma: [], pterygoid: [], conventional: [] };
  for (const p of plans || []) {
    const t = (p.implant_type as ImplantType) || 'conventional';
    if (out[t]) out[t].push(p);
  }
  return out;
};

const isRecordComplete = (r: PerImplantRecord | undefined, type: ImplantType): boolean => {
  if (!r) return false;
  const hasTorque = r.torque_ncm !== undefined && r.torque_ncm !== '' && r.torque_ncm !== null;
  const hasInsertion = !!r.insertion_date;
  // ISQ only required for conventional
  const isqOk = type === 'conventional' ? (r.isq !== undefined && r.isq !== '' && r.isq !== null) : true;
  return hasTorque && hasInsertion && isqOk;
};

const rowTitle = (p: ImplantPlan, idx: number): string => {
  const t = (p.implant_type as ImplantType) || 'conventional';
  if (t === 'zygoma')    return p.row_label || `Zygoma ${p.side || 'TBD'}`;
  if (t === 'pterygoid') return p.row_label || `Pterygoid ${p.side || 'TBD'}`;
  return p.position ? `Implant ${p.position}` : `Implant #${idx + 1}`;
};

// ── Sub-component: ImplantTypeTabs ───────────────────────────
const ImplantTypeTabs: React.FC<{
  groups: Record<ImplantType, ImplantPlan[]>;
  perImplant: Record<string, PerImplantRecord>;
  activeTab: ImplantType;
  onSelect: (t: ImplantType) => void;
}> = ({ groups, perImplant, activeTab, onSelect }) => {
  const availableTypes = (['zygoma', 'pterygoid', 'conventional'] as const).filter(t => groups[t].length > 0);
  if (availableTypes.length <= 1) return null; // single-type → no tab bar
  return (
    <View style={styles.tabBar} testID="implant-type-tabs">
      {availableTypes.map(t => {
        const c = TYPE_COLORS[t];
        const total = groups[t].length;
        const done = groups[t].filter(p => isRecordComplete(perImplant[p.position], t)).length;
        const isActive = t === activeTab;
        return (
          <TouchableOpacity
            key={t}
            style={[
              styles.tab,
              { borderColor: c.border, backgroundColor: isActive ? c.bg : '#FFF' },
              isActive && { borderBottomWidth: 3 },
            ]}
            onPress={() => onSelect(t)}
            testID={`tab-${t}`}
          >
            <Text style={[styles.tabText, { color: c.fg }]}>{TYPE_LABELS[t]}</Text>
            <View style={[styles.tabCount, { backgroundColor: c.dot }]}>
              <Text style={styles.tabCountText}>{done}/{total}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ── Sub-component: PerImplantPhaseCard ───────────────────────
const PerImplantPhaseCard: React.FC<{
  plan: ImplantPlan;
  idx: number;
  type: ImplantType;
  record: PerImplantRecord;
  phase: PhaseNum;
  onChange: (rec: PerImplantRecord) => void;
  onCopyDown?: () => void;
  readOnly?: boolean;
}> = ({ plan, idx, type, record, phase, onChange, onCopyDown, readOnly }) => {
  const [expanded, setExpanded] = useState<boolean>(!isRecordComplete(record, type));
  const c = TYPE_COLORS[type];
  const complete = isRecordComplete(record, type);
  const showIsq = type === 'conventional';

  const upd = (patch: Partial<PerImplantRecord>) => onChange({ ...record, ...patch });

  return (
    <View style={[styles.card, { borderLeftColor: c.dot }]} testID={`per-implant-card-${plan.position}`}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(v => !v)} activeOpacity={0.7}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.badge, { backgroundColor: c.bg }]}>
            <Text style={[styles.badgeText, { color: c.fg }]}>
              {(plan.side || plan.position || '?').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>{rowTitle(plan, idx)}</Text>
            <Text style={styles.cardSub}>{plan.brand || '—'} · {plan.system || '—'}  ·  Ø{plan.diameter}×L{plan.length}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.statusChip, { backgroundColor: complete ? '#2E7D32' : '#FFC107' }]}>
            <Text style={styles.statusChipText}>{complete ? '✓' : '…'}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#5E35B1" />
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.cardBody}>
          {/* Torque + ISQ row */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Insertion Torque (N·cm) *</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={record.torque_ncm != null ? String(record.torque_ncm) : ''}
                onChangeText={v => upd({ torque_ncm: v })}
                editable={!readOnly}
                testID={`torque-${plan.position}`}
                placeholder="e.g. 35"
                placeholderTextColor="#B0BEC5"
              />
            </View>
            {showIsq && (
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>ISQ *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={record.isq != null ? String(record.isq) : ''}
                  onChangeText={v => upd({ isq: v })}
                  editable={!readOnly}
                  testID={`isq-${plan.position}`}
                  placeholder="e.g. 65"
                  placeholderTextColor="#B0BEC5"
                />
              </View>
            )}
          </View>

          {/* Insertion date + timing */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Insertion Date *</Text>
              <TextInput
                style={styles.input}
                value={record.insertion_date || ''}
                onChangeText={v => upd({ insertion_date: v })}
                editable={!readOnly}
                testID={`insertion-date-${plan.position}`}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B0BEC5"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Timing Type</Text>
              <View style={styles.chipRow}>
                {['immediate', 'early', 'delayed'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, record.timing_type === t && { backgroundColor: c.bg, borderColor: c.border }]}
                    onPress={() => !readOnly && upd({ timing_type: t })}
                    testID={`timing-${plan.position}-${t}`}
                  >
                    <Text style={[styles.chipText, record.timing_type === t && { color: c.fg, fontWeight: '800' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* MUA angulation moved to the universal MUA section in Phase 2
              Step 2 (iter-Jun-2026 v11). Field removed here so we have a
              single source of truth. */}

          {/* Complications */}
          <Text style={styles.label}>Complications</Text>
          <TextInput
            style={[styles.input, { minHeight: 40 }]}
            value={record.complications || ''}
            onChangeText={v => upd({ complications: v })}
            editable={!readOnly}
            multiline
            testID={`complications-${plan.position}`}
            placeholder="None / Describe if any"
            placeholderTextColor="#B0BEC5"
          />

          {/* Notes */}
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, { minHeight: 40 }]}
            value={record.notes || ''}
            onChangeText={v => upd({ notes: v })}
            editable={!readOnly}
            multiline
            testID={`notes-${plan.position}`}
            placeholder="Additional notes"
            placeholderTextColor="#B0BEC5"
          />

          {/* Copy-across button */}
          {!readOnly && onCopyDown ? (
            <TouchableOpacity style={styles.copyBtn} onPress={onCopyDown} testID={`copy-down-${plan.position}`}>
              <Ionicons name="copy-outline" size={14} color="#5E35B1" />
              <Text style={styles.copyBtnText}>Copy this row&apos;s values to all {TYPE_LABELS[type]} implants in this tab</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

// ── Sub-component: ZygomaAdvancedClinicalSection ─────────────
const ZygomaAdvancedClinicalSection: React.FC<{
  phase: PhaseNum;
  state: AdvancedClinical;
  perImplant: Record<string, PerImplantRecord>;
  zygPositions: string[];
  onChange: (patch: Partial<AdvancedClinical>) => void;
  readOnly?: boolean;
}> = ({ phase, state, perImplant, zygPositions, onChange, readOnly }) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  // Compute ORIS from current state + minimum torque across zygoma implants
  const minTorque = useMemo(() => {
    const torques = zygPositions
      .map(p => Number(perImplant[p]?.torque_ncm))
      .filter(v => !Number.isNaN(v) && v > 0);
    return torques.length ? Math.min(...torques) : undefined;
  }, [perImplant, zygPositions]);
  const oris = useMemo(() => calculateOris({
    no_sinus_disease: state.no_sinus_disease,
    no_oro_antral_communication: state.no_oro_antral_communication,
    screw_retained_confirmed: state.screw_retained_confirmed,
    passive_fit_verified: state.passive_fit_verified,
    no_radiographic_peri_implant_lesion: state.no_radiographic_peri_implant_lesion,
    insertion_torque_min_ncm: minTorque,
    immediate_loading_day0_completed: !!state.immediate_loading_day0_at,
  }), [state, minTorque]);

  const set = (k: keyof AdvancedClinical, v: any) => onChange({ [k]: v });
  const toggle = (k: keyof AdvancedClinical) => set(k, !state[k]);

  const orisColor = oris.code >= 3 ? '#2E7D32' : oris.code === 2 ? '#F57F17' : '#C62828';

  return (
    <View style={styles.advSection} testID="zyg-advanced-clinical">
      <TouchableOpacity style={styles.advHeader} onPress={() => setExpanded(v => !v)}>
        <View style={styles.advHeaderLeft}>
          <View style={styles.advIcon}><Ionicons name="medkit-outline" size={14} color="#FFF" /></View>
          <View>
            <Text style={styles.advTitle}>Advanced Clinical (Zygoma)</Text>
            <Text style={styles.advSub}>ZAGA · ORIS · Immediate Loading · Co-sign</Text>
          </View>
        </View>
        <View style={styles.advHeaderRight}>
          <View style={[styles.orisPill, { backgroundColor: orisColor }]}>
            <Text style={styles.orisPillText}>ORIS {oris.code}/4 · {oris.label}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#5E35B1" />
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.advBody}>
          {/* ZAGA confirmed */}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>ZAGA Confirmed Right</Text>
              <TextInput style={styles.input} value={state.zaga_confirmed_right || ''}
                onChangeText={v => set('zaga_confirmed_right', v)} editable={!readOnly}
                placeholder="0-4" placeholderTextColor="#B0BEC5"
                testID="adv-zaga-right"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>ZAGA Confirmed Left</Text>
              <TextInput style={styles.input} value={state.zaga_confirmed_left || ''}
                onChangeText={v => set('zaga_confirmed_left', v)} editable={!readOnly}
                placeholder="0-4" placeholderTextColor="#B0BEC5"
                testID="adv-zaga-left"
              />
            </View>
          </View>

          {/* ORIS criteria toggles */}
          <Text style={[styles.label, { marginTop: 10 }]}>ORIS Success Criteria</Text>
          {[
            ['no_sinus_disease', 'D1 · No sinus disease'],
            ['no_oro_antral_communication', 'D1 · No oro-antral communication'],
            ['screw_retained_confirmed', 'D2 · Screw-retained prosthesis'],
            ['passive_fit_verified', 'D2 · Passive fit verified'],
            ['no_radiographic_peri_implant_lesion', 'D3 · No peri-implant lesion (radiograph)'],
          ].map(([k, label]) => (
            <TouchableOpacity key={k} style={styles.toggleRow}
              onPress={() => !readOnly && toggle(k as keyof AdvancedClinical)}
              testID={`adv-toggle-${k}`}>
              <Ionicons name={(state as any)[k] ? 'checkbox' : 'square-outline'} size={20}
                color={(state as any)[k] ? '#2E7D32' : '#78909C'} />
              <Text style={styles.toggleText}>{label}</Text>
            </TouchableOpacity>
          ))}

          {/* Immediate Loading timestamps */}
          <Text style={[styles.label, { marginTop: 10 }]}>Immediate Loading Protocol</Text>
          {[
            ['immediate_loading_day0_at', 'Day 0 loaded at'],
            ['immediate_loading_day7_at', 'Day 7 check at'],
            ['immediate_loading_day30_at', 'Day 30 check at'],
          ].map(([k, label]) => (
            <View key={k} style={{ marginBottom: 6 }}>
              <Text style={styles.subLabel}>{label}</Text>
              <TextInput style={styles.input} value={(state as any)[k] || ''}
                onChangeText={v => set(k as keyof AdvancedClinical, v)} editable={!readOnly}
                placeholder="YYYY-MM-DD" placeholderTextColor="#B0BEC5"
                testID={`adv-${k}`}
              />
            </View>
          ))}

          {/* Supervisor co-sign notes */}
          <Text style={[styles.label, { marginTop: 10 }]}>Supervisor Co-sign Notes</Text>
          <TextInput style={[styles.input, { minHeight: 44 }]}
            value={state.supervisor_cosign_notes || ''}
            onChangeText={v => set('supervisor_cosign_notes', v)}
            editable={!readOnly} multiline
            placeholder="e.g. Approved with recommendation for CBCT at Day 30"
            placeholderTextColor="#B0BEC5"
            testID="adv-cosign-notes"
          />
        </View>
      ) : null}
    </View>
  );
};

// ── Main component ──────────────────────────────────────────
const PhaseStep2TabbedView: React.FC<Props> = ({
  phase, procedureId, token, implantPlans,
  initialPerImplant, initialAdvancedClinical, readOnly, onSaved,
}) => {
  const groups = useMemo(() => groupImplantsByType(implantPlans || []), [implantPlans]);
  const hasZyg = groups.zygoma.length > 0;
  const hasPter = groups.pterygoid.length > 0;
  const availableTypes = (['zygoma', 'pterygoid', 'conventional'] as const).filter(t => groups[t].length > 0);
  const [activeTab, setActiveTab] = useState<ImplantType>(availableTypes[0] || 'zygoma');
  const [perImplant, setPerImplant] = useState<Record<string, PerImplantRecord>>(initialPerImplant || {});
  const [adv, setAdv] = useState<AdvancedClinical>(initialAdvancedClinical || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPerImplant(initialPerImplant || {}); }, [initialPerImplant]);
  useEffect(() => { setAdv(initialAdvancedClinical || {}); }, [initialAdvancedClinical]);

  // Auto-jump to first tab with pending implants (delight #2)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const t of availableTypes) {
      const anyPending = groups[t].some(p => !isRecordComplete(perImplant[p.position], t));
      if (anyPending) { setActiveTab(t); return; }
    }
  }, []);  // run once on mount

  const updateRecord = (pos: string, rec: PerImplantRecord) => {
    setPerImplant(prev => ({ ...prev, [pos]: rec }));
  };
  const copyDown = (fromPos: string) => {
    const src = perImplant[fromPos];
    if (!src) return;
    const type = (implantPlans.find(p => p.position === fromPos)?.implant_type as ImplantType) || 'conventional';
    setPerImplant(prev => {
      const next = { ...prev };
      groups[type].forEach(p => {
        // Preserve the source row; copy the numeric/text fields to others.
        if (p.position === fromPos) return;
        next[p.position] = { ...(next[p.position] || {}), torque_ncm: src.torque_ncm, isq: src.isq, insertion_date: src.insertion_date, timing_type: src.timing_type, mua_angulation: src.mua_angulation };
      });
      return next;
    });
  };

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      // Attach ORIS code snapshot when zygoma present.
      let advToSave: AdvancedClinical = { ...adv };
      if (hasZyg) {
        const minT = groups.zygoma.map(p => Number(perImplant[p.position]?.torque_ncm)).filter(v => !Number.isNaN(v) && v > 0);
        const oris = calculateOris({
          no_sinus_disease: adv.no_sinus_disease,
          no_oro_antral_communication: adv.no_oro_antral_communication,
          screw_retained_confirmed: adv.screw_retained_confirmed,
          passive_fit_verified: adv.passive_fit_verified,
          no_radiographic_peri_implant_lesion: adv.no_radiographic_peri_implant_lesion,
          insertion_torque_min_ncm: minT.length ? Math.min(...minT) : undefined,
          immediate_loading_day0_completed: !!adv.immediate_loading_day0_at,
        });
        advToSave.oris_success_code = oris.code;
      }
      // Strip ISQ from zygoma/pterygoid rows before persisting (defensive).
      const cleaned: Record<string, PerImplantRecord> = {};
      for (const p of implantPlans) {
        const r = perImplant[p.position];
        if (!r) continue;
        const t = (p.implant_type as ImplantType) || 'conventional';
        if (t === 'conventional') cleaned[p.position] = r;
        else { const { isq, ...rest } = r as any; cleaned[p.position] = rest; }
      }
      // iter-Jun-2026 (v13, Chunk B, Ask 3): Advanced Clinical is now saved by
      // the standalone AdvancedClinicalCard component on the Case Details view.
      // Phase 2 tabbed save must NOT include `advanced_clinical` — omitting
      // avoids clobbering approval_status/day dates set by the standalone flow.
      await axios.patch(
        `${API}/procedures/${procedureId}/tabbed-phase-data/${phase}`,
        { per_implant: cleaned },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onSaved && onSaved();
      Alert.alert('Saved', `Phase ${phase} tabbed data saved.`);
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [adv, perImplant, hasZyg, groups.zygoma, implantPlans, phase, procedureId, token, readOnly, onSaved]);

  const currentGroup = groups[activeTab] || [];
  const zygPositions = groups.zygoma.map(p => p.position);

  // Return null when the case has only conventional implants — the legacy
  // phase forms handle those unchanged. (Placed AFTER all hooks per Rules of Hooks.)
  if (!hasZyg && !hasPter) return null;

  return (
    <View style={styles.container} testID={`phase${phase}-tabbed-view`}>
      <ImplantTypeTabs groups={groups} perImplant={perImplant} activeTab={activeTab} onSelect={setActiveTab} />
      {currentGroup.length === 0 ? (
        <Text style={styles.emptyHint}>No {TYPE_LABELS[activeTab]} implants in this case.</Text>
      ) : (
        currentGroup.map((plan, idx) => (
          <PerImplantPhaseCard
            key={plan.position}
            plan={plan}
            idx={idx}
            type={activeTab}
            phase={phase}
            record={perImplant[plan.position] || {}}
            onChange={(rec) => updateRecord(plan.position, rec)}
            onCopyDown={currentGroup.length > 1 ? () => copyDown(plan.position) : undefined}
            readOnly={readOnly}
          />
        ))
      )}

      {/* iter-Jun-2026 (v13, Chunk B, Ask 3): Advanced Clinical (Zygoma) has
          been decoupled from the Phase 2 tabbed submission and now lives as an
          independent card on the Case Details view. See
          /app/frontend/components/AdvancedClinicalCard.tsx. Phase 2 can be
          submitted without Day 0/7/30 loading dates. */}

      {!readOnly ? (
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} testID={`phase${phase}-tabbed-save`}>
          {saving ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name="save-outline" size={16} color="#FFF" />
              <Text style={styles.saveBtnText}>Save Phase {phase} — Per-Implant Data</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 4 },
  tabBar: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '700' },
  tabCount: { minWidth: 30, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, alignItems: 'center' },
  tabCountText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  card: { backgroundColor: '#FFF', borderRadius: 10, borderLeftWidth: 4, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  cardSub: { fontSize: 11, color: '#78909C', marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusChipText: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  cardBody: { marginTop: 10 },
  row2: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#455A64', marginBottom: 4, marginTop: 6 },
  subLabel: { fontSize: 11, color: '#546E7A', marginBottom: 3 },
  input: { backgroundColor: '#F5F7FA', borderRadius: 6, borderWidth: 1, borderColor: '#CFD8DC', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#263238' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  chipText: { fontSize: 11, color: '#546E7A' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#EDE7F6' },
  copyBtnText: { fontSize: 11, color: '#5E35B1', fontWeight: '600', flexShrink: 1 },
  emptyHint: { fontSize: 12, color: '#78909C', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  advSection: { marginTop: 12, backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: '#D1C4E9', padding: 12 },
  advHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  advHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  advHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  advIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#5E35B1', alignItems: 'center', justifyContent: 'center' },
  advTitle: { fontSize: 13, fontWeight: '800', color: '#4527A0' },
  advSub: { fontSize: 11, color: '#7E57C2', marginTop: 1 },
  orisPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  orisPillText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  advBody: { marginTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  toggleText: { fontSize: 12, color: '#37474F' },
  saveBtn: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#5E35B1', paddingVertical: 12, borderRadius: 8 },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});

export default PhaseStep2TabbedView;
