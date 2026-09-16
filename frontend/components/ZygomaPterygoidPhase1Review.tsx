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
  // iter-Jun-2026 (v13, Chunk E, Ask 3): Match the Conventional-implant
  // review's InfoRow visual — icon on the left, label above value, thin
  // grey divider below. Same font sizes / spacing / colours as InfoRow
  // in /app/frontend/app/procedures/[id].tsx.
  if (!value) return null;
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        {icon ? <Ionicons name={icon} size={18} color="#1565C0" /> : null}
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
};

const Group: React.FC<{ title: string; icon?: any; children: React.ReactNode; testID?: string }> = ({ title, icon, children, testID }) => {
  // iter-Jun-2026 (v13, Chunk E, Ask 3): Section card matches the
  // Conventional review — white background, subtle blue-tinted shadow,
  // border `#E8EDF5`, section title in blue `#1565C0`. No coloured
  // header bar; keep it clean and uniform across procedure types.
  const kids = React.Children.toArray(children);
  const hasVisible = kids.some((c: any) => {
    if (!c || typeof c !== 'object') return false;
    const v = c?.props?.value;
    return typeof v === 'string' && v.length > 0;
  });
  if (!hasVisible) return null;
  return (
    <View style={styles.sectionCard} testID={testID}>
      <View style={styles.sectionCardHeader}>
        {icon ? <Ionicons name={icon} size={18} color="#1565C0" style={{ marginRight: 6 }} /> : null}
        <Text style={styles.sectionCardTitle}>{title}</Text>
      </View>
      <View style={styles.sectionCardBody}>{kids}</View>
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
    <View testID={testIdPrefix} data-testid={testIdPrefix}>
      {/* Header card — expandable title strip with configuration pills */}
      <View style={styles.headerCard}>
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

        {expanded && hasAny ? (
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
        ) : null}
      </View>

      {!expanded ? null : !hasAny ? (
        <View style={styles.headerCard}>
          <Text style={styles.emptyHint} data-testid={`${testIdPrefix}-empty`}>Phase 1 Zygoma/Pterygoid data has not been captured yet.</Text>
        </View>
      ) : (
        <>
          <Group title="Diagnostic Summary" icon="clipboard-outline" testID={`${testIdPrefix}-group-ds`}>
            <Row label="Cawood-Howell" value={clean(ds.cawood_howell)} />
            <Row label="Bedrossian" value={clean(ds.bedrossian)} />
            <Row label="ZAGA Right" value={clean(ds.zaga_right) || clean(p1.zaga?.right)} />
            <Row label="ZAGA Left" value={clean(ds.zaga_left) || clean(p1.zaga?.left)} />
          </Group>

          <Group title="Medical Assessment" icon="medkit-outline" testID={`${testIdPrefix}-group-ma`}>
            <Row label="Immunosuppression" value={clean(ma.immunosuppression)} />
            <Row label="Anticoagulants" value={clean(ma.anticoagulants)} />
            <Row label="Psychological Suitability" value={clean(ma.psychological_suitability)} />
            <Row label="GA Fitness (ASA)" value={clean(ma.ga_fitness_asa_grade)} />
            <Row label="ASA Grade" value={clean(ma.asa_grade)} />
          </Group>

          <Group title="Anaesthesia Plan" icon="pulse-outline" testID={`${testIdPrefix}-group-an`}>
            <Row label="Plan" value={clean(p1.anaesthesia_plan)} />
          </Group>

          <Group title="Pre-Surgical Assessment" icon="warning-outline" testID={`${testIdPrefix}-group-pre`}>
            <Row label="Interincisal Opening" value={pre.interincisal_opening_mm ? `${pre.interincisal_opening_mm} mm` : ''} />
            <Row label="Sinus Health" value={clean(pre.sinus_health)} />
            <Row label="OMC Patent" value={bi(pre.omc_patent)} />
            <Row label="Interarch Space @ VDO" value={pre.interarch_space_at_vdo_mm ? `${pre.interarch_space_at_vdo_mm} mm` : ''} />
            <Row label="Caution Notes" value={clean(pre.caution_notes)} />
          </Group>

          <Group title="Extraoral" icon="person-outline" testID={`${testIdPrefix}-group-ext`}>
            <Row label="Facial Profile" value={clean(ext.facial_profile)} />
            <Row label="Lip Support" value={clean(ext.lip_support)} />
            <Row label="Facial Asymmetry" value={clean(ext.facial_asymmetry)} />
            <Row label="Zygomatic Prominence" value={bi(ext.zygomatic_prominence)} />
            <Row label="Notes" value={clean(ext.notes)} />
          </Group>

          <Group title="Intraoral" icon="happy-outline" testID={`${testIdPrefix}-group-intra`}>
            <Row label="Residual Ridge Form" value={clean(intra.residual_ridge_form)} />
            <Row label="Keratinised Mucosa Width" value={bi(intra.keratinised_mucosa_width_mm)} />
            <Row label="Tuberosity Height" value={bi(intra.tuberosity_height_mm)} />
            <Row label="Tuberosity Form" value={bi(intra.tuberosity_form)} />
            <Row label="Palatal Vault Depth" value={bi(intra.palatal_vault_depth_mm)} />
            <Row label="Teeth to be Extracted" value={Array.isArray(intra.teeth_to_be_extracted) ? intra.teeth_to_be_extracted.join(', ') : ''} />
          </Group>

          <Group title="Existing Prosthesis" icon="cube-outline" testID={`${testIdPrefix}-group-pr`}>
            <Row label="Currently Using" value={clean(prosPrev.using)} />
            <Row label="Type" value={clean(prosPrev.type)} />
            <Row label="Fit" value={clean(prosPrev.fit)} />
            <Row label="Phonetics" value={clean(prosPrev.phonetics)} />
            <Row label="Esthetics" value={clean(prosPrev.esthetics)} />
            <Row label="Patient Satisfaction" value={clean(prosPrev.patient_satisfaction)} />
          </Group>

          <Group title="Radiographic" icon="image-outline" testID={`${testIdPrefix}-group-rad`}>
            <Row label="Imaging Obtained" value={Array.isArray(rad.imaging_obtained) ? rad.imaging_obtained.join(', ') : ''} />
            <Row label="Field of View" value={clean(rad.field_of_view)} />
          </Group>

          <Group title="Zygomatic Region" icon="body-outline" testID={`${testIdPrefix}-group-zr`}>
            <Row label="Body Height" value={bi(zr.body_height_mm)} />
            <Row label="Cortical Thickness (Apex)" value={bi(zr.cortical_thickness_apex_mm)} />
            <Row label="Anterior Max Wall Concavity" value={bi(zr.anterior_max_wall_concavity)} />
            <Row label="Sinus Membrane Thickening" value={bi(zr.sinus_membrane_thickening_mm)} />
            <Row label="Sinus Septa Present" value={bi(zr.sinus_septa_present)} />
            <Row label="Ostium / OMC Patency" value={clean(zr.ostium_omc_patency)} />
            <Row label="Orbital Floor Distance" value={bi(zr.orbital_floor_distance_mm)} />
          </Group>

          <Group title="Pterygomaxillary Region" icon="triangle-outline" testID={`${testIdPrefix}-group-pt`}>
            <Row label="Tuberosity Height" value={bi(pt.tuberosity_height_mm)} />
            <Row label="Tuberosity Bone Density" value={bi(pt.tuberosity_bone_density)} />
            <Row label="Pyramidal Process Volume" value={bi(pt.pyramidal_process_volume)} />
            <Row label="Pterygoid Plate Thickness" value={bi(pt.pterygoid_plate_thickness_mm)} />
            <Row label="Planned Path Length" value={bi(pt.planned_path_length_mm)} />
            <Row label="Greater Palatine Canal Position" value={bi(pt.greater_palatine_canal_position)} />
            <Row label="Maxillary Artery / Pterygoid Plexus" value={bi(pt.maxillary_artery_pterygoid_plexus)} />
          </Group>

          <Group title="Bedrossian Zones (Available Bone)" icon="grid-outline" testID={`${testIdPrefix}-group-bz`}>
            <Row label="Zone 1 — Premaxilla" value={bi(bz.zone1_premaxilla_mm)} />
            <Row label="Zone 1 — Premolar" value={bi(bz.zone1_premolar_mm)} />
            <Row label="Zone 1 — Molar" value={bi(bz.zone1_molar_mm)} />
          </Group>

          <Group title="Prosthetic Planning" icon="construct-outline" testID={`${testIdPrefix}-group-pp`}>
            <Row label="Diagnostic Steps" value={Array.isArray(pp.diagnostic_steps) ? pp.diagnostic_steps.join(', ') : ''} />
            <Row label="Flange Required" value={clean(pp.flange_required)} />
            <Row label="Occlusal Scheme" value={clean(pp.occlusal_scheme)} />
          </Group>

          <Group title="Design Checks" icon="checkmark-done-outline" testID={`${testIdPrefix}-group-dc`}>
            <Row label="Apices Distance" value={clean(dc.apices_distance)} />
            <Row label="Heads Within Prosthetic Envelope" value={clean(dc.heads_within_prosthetic_envelope)} />
            <Row label="AP Spread Adequate" value={clean(dc.ap_spread_adequate)} />
            <Row label="Cantilever Eliminated" value={clean(dc.cantilever_eliminated)} />
          </Group>

          <Group title="Team Composition" icon="people-outline" testID={`${testIdPrefix}-group-team`}>
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
  // iter-Jun-2026 (v13, Chunk E, Ask 3): Match Conventional-implant Case
  // Details styles verbatim — white cards, blue titles + icons, blue-tinted
  // shadow, `#E8EDF5` borders, InfoRow-style rows with icon + label above
  // value.  Zygoma / Pterygoid Phase 1 now looks identical to Conventional.
  headerCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    shadowColor: '#1565C0',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    shadowColor: '#1565C0',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  // Legacy — no longer rendered; kept for backwards compatibility.
  sectionCardIcon: {
    width: 0, height: 0, overflow: 'hidden',
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
    letterSpacing: 0.3,
  },
  sectionCardBody: {
    // No extra padding — matches Conventional's tight infoRow rhythm.
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDF5',
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
    backgroundColor: '#1565C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', letterSpacing: 0.3 },
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
    fontSize: 12, fontWeight: '800', color: '#1565C0',
    letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase',
  },
  // InfoRow-mirror: icon on the left, label above value, thin bottom divider.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  rowIconWrap: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rowContent: { marginLeft: 12, flex: 1 },
  rowLabel: {
    fontSize: 12,
    color: '#1565C0',
    marginBottom: 4,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  rowValue: {
    fontSize: 14,
    color: '#1A1A2E',
    fontWeight: '500',
  },
});

export default ZygomaPterygoidPhase1Review;
