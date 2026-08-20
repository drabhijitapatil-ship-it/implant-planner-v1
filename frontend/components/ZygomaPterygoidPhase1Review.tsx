/**
 * ZygomaPterygoidPhase1Review.tsx — iter-Jun-2026 (v9, Chunk 2)
 *
 * Read-only display of every Phase 1 data point captured for Zygoma /
 * Pterygoid cases. Rendered inside the Case Details view (right after
 * "Patient Information" section) for Student, Supervisor, In-Charge and
 * Administrator roles so everyone has the SAME source of truth when
 * reviewing an advanced case.
 *
 * Data source: `procedure.zygoma_pterygoid_data.phase1` (nested dict, see
 * frontend/components/ZygomaPterygoidPhase1Form.tsx for the full type).
 * Also uses `procedure.zygoma_pterygoid_configuration` at the top level.
 *
 * Design: matches the standard patient-info card look (`section` + `InfoRow`
 * from procedures/[id].tsx) so it feels native to the review page. All
 * fields are guarded — an entirely-empty phase1 object yields a subtle
 * "Not captured yet" hint instead of an empty card.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The nested Phase 1 data type. Kept loose (any) so this component doesn't
// couple to the strict form-editor's schema.
type Phase1 = Record<string, any>;

interface Props {
  procedure: any;                    // full procedure document from GET /api/procedures/{id}
  testIdPrefix?: string;
}

const isZygCase = (proc: any) => {
  const pt = String(proc?.implant_procedure_type || '');
  return /zygoma|pterygoid/i.test(pt);
};

const clean = (v: any): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object') return '';
  return String(v);
};

const bi = (obj: any): string => {
  // Render bilateral values `{right: X, left: Y}` as "R: X | L: Y"
  if (!obj || typeof obj !== 'object') return '';
  const r = clean(obj.right);
  const l = clean(obj.left);
  if (!r && !l) return '';
  return `R: ${r || '—'}  |  L: ${l || '—'}`;
};

const Row: React.FC<{ label: string; value: string; icon?: any }> = ({ label, value, icon }) => {
  if (!value) return null;
  return (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={14} color="#5E35B1" style={{ marginRight: 6 }} /> : null}
      <Text style={styles.rowLabel}>{label}:</Text>
      <Text style={styles.rowValue} numberOfLines={0}>{value}</Text>
    </View>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => {
  // Only render the group when at least one Row child has a non-empty value.
  // React.Children.toArray keeps *elements* (not rendered output), so we peek
  // into each child's props.value to decide.
  const kids = React.Children.toArray(children);
  const hasVisible = kids.some((c: any) => {
    if (!c || typeof c !== 'object') return false;
    const v = c?.props?.value;
    return typeof v === 'string' && v.length > 0;
  });
  if (!hasVisible) return null;
  return (
    <View style={styles.group} testID={testID}>
      <Text style={styles.groupTitle}>{title}</Text>
      {kids}
    </View>
  );
};

const ZygomaPterygoidPhase1Review: React.FC<Props> = ({ procedure, testIdPrefix = 'zyg-p1-review' }) => {
  const [expanded, setExpanded] = useState(true);

  if (!procedure || !isZygCase(procedure)) return null;

  const config = clean(procedure.zygoma_pterygoid_configuration);
  const p1: Phase1 = (procedure.zygoma_pterygoid_data && procedure.zygoma_pterygoid_data.phase1) || procedure.zygoma_pterygoid_data || {};
  const convLocs: string[] = Array.isArray(procedure.conventional_implant_locations) ? procedure.conventional_implant_locations : [];

  const ma = p1.medical_assessment || {};
  const pre = p1.pre_surgical || {};
  const ext = p1.extraoral || {};
  const intra = p1.intraoral || {};
  const prosPrev = p1.existing_prosthesis || {};
  const rad = p1.radiographic || {};
  const zr = p1.zygomatic_region || {};
  const pt = p1.pterygomaxillary_region || {};
  const bz = p1.bedrossian_zones || {};
  const ds = p1.diagnostic_summary || {};
  const pp = p1.prosthetic_planning || {};
  const dc = p1.design_checks || {};
  const team = p1.team_composition || {};

  const hasAny = !!(
    config
    || (p1 && Object.keys(p1).length > 0)
    || convLocs.length
  );

  return (
    <View style={styles.section} testID={testIdPrefix} data-testid={testIdPrefix}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="body-outline" size={16} color="#FFF" />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Zygoma / Pterygoid — Phase 1</Text>
            <Text style={styles.sectionSubtitle}>Diagnosis & Treatment Planning</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#5E35B1" />
      </TouchableOpacity>

      {!expanded ? null : !hasAny ? (
        <Text style={styles.emptyHint} data-testid={`${testIdPrefix}-empty`}>Phase 1 Zygoma/Pterygoid data has not been captured yet.</Text>
      ) : (
        <>
          {/* Header pills — configuration + conventional sites */}
          <View style={styles.pillRow}>
            {!!config && (
              <View style={[styles.pill, { backgroundColor: '#EDE7F6', borderColor: '#5E35B1' }]} testID={`${testIdPrefix}-config-pill`}>
                <Ionicons name="options-outline" size={11} color="#4527A0" />
                <Text style={[styles.pillText, { color: '#4527A0' }]}>{config}</Text>
              </View>
            )}
            {convLocs.length > 0 && (
              <View style={[styles.pill, { backgroundColor: '#FFFDE7', borderColor: '#FBC02D' }]} testID={`${testIdPrefix}-conv-pill`}>
                <Ionicons name="ellipse-outline" size={11} color="#F57F17" />
                <Text style={[styles.pillText, { color: '#F57F17' }]}>Conventional FDI: {convLocs.join(', ')}</Text>
              </View>
            )}
          </View>

          <Group title="Diagnostic Summary" testID={`${testIdPrefix}-group-ds`}>
            <Row label="Cawood-Howell" value={clean(ds.cawood_howell)} />
            <Row label="Bedrossian" value={clean(ds.bedrossian)} />
            <Row label="ZAGA Right" value={clean(ds.zaga_right) || clean(p1.zaga?.right)} />
            <Row label="ZAGA Left" value={clean(ds.zaga_left) || clean(p1.zaga?.left)} />
          </Group>

          <Group title="Medical Assessment" testID={`${testIdPrefix}-group-ma`}>
            <Row label="Immunosuppression" value={clean(ma.immunosuppression)} />
            <Row label="Anticoagulants" value={clean(ma.anticoagulants)} />
            <Row label="Psychological Suitability" value={clean(ma.psychological_suitability)} />
            <Row label="GA Fitness (ASA)" value={clean(ma.ga_fitness_asa_grade)} />
            <Row label="ASA Grade" value={clean(ma.asa_grade)} />
          </Group>

          <Group title="Anaesthesia Plan" testID={`${testIdPrefix}-group-an`}>
            <Row label="Plan" value={clean(p1.anaesthesia_plan)} />
          </Group>

          <Group title="Pre-Surgical Assessment" testID={`${testIdPrefix}-group-pre`}>
            <Row label="Interincisal Opening" value={pre.interincisal_opening_mm ? `${pre.interincisal_opening_mm} mm` : ''} />
            <Row label="Sinus Health" value={clean(pre.sinus_health)} />
            <Row label="OMC Patent" value={bi(pre.omc_patent)} />
            <Row label="Interarch Space @ VDO" value={pre.interarch_space_at_vdo_mm ? `${pre.interarch_space_at_vdo_mm} mm` : ''} />
            <Row label="Caution Notes" value={clean(pre.caution_notes)} />
          </Group>

          <Group title="Extraoral" testID={`${testIdPrefix}-group-ext`}>
            <Row label="Facial Profile" value={clean(ext.facial_profile)} />
            <Row label="Lip Support" value={clean(ext.lip_support)} />
            <Row label="Facial Asymmetry" value={clean(ext.facial_asymmetry)} />
            <Row label="Zygomatic Prominence" value={bi(ext.zygomatic_prominence)} />
            <Row label="Notes" value={clean(ext.notes)} />
          </Group>

          <Group title="Intraoral" testID={`${testIdPrefix}-group-intra`}>
            <Row label="Residual Ridge Form" value={clean(intra.residual_ridge_form)} />
            <Row label="Keratinised Mucosa Width" value={bi(intra.keratinised_mucosa_width_mm)} />
            <Row label="Tuberosity Height" value={bi(intra.tuberosity_height_mm)} />
            <Row label="Tuberosity Form" value={bi(intra.tuberosity_form)} />
            <Row label="Palatal Vault Depth" value={bi(intra.palatal_vault_depth_mm)} />
            <Row label="Teeth to be Extracted" value={Array.isArray(intra.teeth_to_be_extracted) ? intra.teeth_to_be_extracted.join(', ') : ''} />
          </Group>

          <Group title="Existing Prosthesis" testID={`${testIdPrefix}-group-pr`}>
            <Row label="Currently Using" value={clean(prosPrev.using)} />
            <Row label="Type" value={clean(prosPrev.type)} />
            <Row label="Fit" value={clean(prosPrev.fit)} />
            <Row label="Phonetics" value={clean(prosPrev.phonetics)} />
            <Row label="Esthetics" value={clean(prosPrev.esthetics)} />
            <Row label="Patient Satisfaction" value={clean(prosPrev.patient_satisfaction)} />
          </Group>

          <Group title="Radiographic" testID={`${testIdPrefix}-group-rad`}>
            <Row label="Imaging Obtained" value={Array.isArray(rad.imaging_obtained) ? rad.imaging_obtained.join(', ') : ''} />
            <Row label="Field of View" value={clean(rad.field_of_view)} />
          </Group>

          <Group title="Zygomatic Region" testID={`${testIdPrefix}-group-zr`}>
            <Row label="Body Height" value={bi(zr.body_height_mm)} />
            <Row label="Cortical Thickness (Apex)" value={bi(zr.cortical_thickness_apex_mm)} />
            <Row label="Anterior Max Wall Concavity" value={bi(zr.anterior_max_wall_concavity)} />
            <Row label="Sinus Membrane Thickening" value={bi(zr.sinus_membrane_thickening_mm)} />
            <Row label="Sinus Septa Present" value={bi(zr.sinus_septa_present)} />
            <Row label="Ostium / OMC Patency" value={clean(zr.ostium_omc_patency)} />
            <Row label="Orbital Floor Distance" value={bi(zr.orbital_floor_distance_mm)} />
          </Group>

          <Group title="Pterygomaxillary Region" testID={`${testIdPrefix}-group-pt`}>
            <Row label="Tuberosity Height" value={bi(pt.tuberosity_height_mm)} />
            <Row label="Tuberosity Bone Density" value={bi(pt.tuberosity_bone_density)} />
            <Row label="Pyramidal Process Volume" value={bi(pt.pyramidal_process_volume)} />
            <Row label="Pterygoid Plate Thickness" value={bi(pt.pterygoid_plate_thickness_mm)} />
            <Row label="Planned Path Length" value={bi(pt.planned_path_length_mm)} />
            <Row label="Greater Palatine Canal Position" value={bi(pt.greater_palatine_canal_position)} />
            <Row label="Maxillary Artery / Pterygoid Plexus" value={bi(pt.maxillary_artery_pterygoid_plexus)} />
          </Group>

          <Group title="Bedrossian Zones (Available Bone)" testID={`${testIdPrefix}-group-bz`}>
            <Row label="Zone 1 — Premaxilla" value={bi(bz.zone1_premaxilla_mm)} />
            <Row label="Zone 1 — Premolar" value={bi(bz.zone1_premolar_mm)} />
            <Row label="Zone 1 — Molar" value={bi(bz.zone1_molar_mm)} />
          </Group>

          <Group title="Prosthetic Planning" testID={`${testIdPrefix}-group-pp`}>
            <Row label="Diagnostic Steps" value={Array.isArray(pp.diagnostic_steps) ? pp.diagnostic_steps.join(', ') : ''} />
            <Row label="Flange Required" value={clean(pp.flange_required)} />
            <Row label="Occlusal Scheme" value={clean(pp.occlusal_scheme)} />
          </Group>

          <Group title="Design Checks" testID={`${testIdPrefix}-group-dc`}>
            <Row label="Apices Distance" value={clean(dc.apices_distance)} />
            <Row label="Heads Within Prosthetic Envelope" value={clean(dc.heads_within_prosthetic_envelope)} />
            <Row label="AP Spread Adequate" value={clean(dc.ap_spread_adequate)} />
            <Row label="Cantilever Eliminated" value={clean(dc.cantilever_eliminated)} />
          </Group>

          <Group title="Team Composition" testID={`${testIdPrefix}-group-team`}>
            <Row label="Primary Surgeon" value={clean(team.primary_surgeon)} />
            <Row label="Assistant Surgeon" value={clean(team.assistant_surgeon)} />
            <Row label="Anaesthetist" value={clean(team.anaesthetist)} />
            <Row label="Prosthodontist" value={clean(team.prosthodontist)} />
            <Row label="Nurse" value={clean(team.nurse)} />
          </Group>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#5E35B1',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#5E35B1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#37474F' },
  sectionSubtitle: { fontSize: 11, color: '#78909C', marginTop: 1 },
  emptyHint: { fontSize: 12, color: '#78909C', fontStyle: 'italic', marginTop: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
    maxWidth: '100%',
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  group: { marginTop: 10 },
  groupTitle: {
    fontSize: 12, fontWeight: '800', color: '#5E35B1',
    letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start',
    paddingVertical: 3, gap: 4,
  },
  rowLabel: { fontSize: 12, color: '#546E7A', fontWeight: '600', minWidth: 140 },
  rowValue: { fontSize: 12, color: '#37474F', flexShrink: 1, flex: 1 },
});

export default ZygomaPterygoidPhase1Review;
