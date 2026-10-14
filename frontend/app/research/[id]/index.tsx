/**
 * Research Module — study detail (S8/S9 hub): overview, protocol summary,
 * enrolled cases, team. Deeper editors live on sibling routes.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons, { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import {
  RC, Card, Chip, Empty, Loading, PrimaryButton, ScreenHeader, SectionTitle, Segmented, Study,
  studyStatusStyle, STATUS_LABEL, STUDY_TYPE_LABEL, FORM_STATUS, ANCHOR_LABEL, MEMBER_ROLE_LABEL, errText, u,
} from '../../../components/research/ResearchUI';

type Tab = 'overview' | 'protocol' | 'cases' | 'team';

export default function StudyDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const [study, setStudy] = useState<Study | null>(null);
  const [enrolments, setEnrolments] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || 'overview');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.get(`/research/studies/${id}`), api.get(`/research/studies/${id}/enrolments`)]);
      setStudy(s.data); setEnrolments(e.data);
    } catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!study) return <Loading />;
  const isPI = study.my_roles.includes('pi') || study.my_roles.includes('admin');
  const canEnterData = isPI || study.my_roles.includes('co_investigator') || study.my_roles.includes('data_collector');
  const canExport = isPI || study.my_roles.includes('guide') || study.my_roles.includes('statistician');
  const protocolEditable = isPI && !['data_locked', 'archived'].includes(study.status);
  const st = studyStatusStyle(study.status);

  const setStatus = (status: string, confirmTitle: string, confirmBody: string) => {
    Alert.alert(confirmTitle, confirmBody, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setBusy(true);
        try { const r = await api.post(`/research/studies/${id}/status`, { status }); setStudy(r.data); }
        catch (e) { Alert.alert('Not allowed', errText(e)); } finally { setBusy(false); }
      } },
    ]);
  };

  const deleteDraft = () => Alert.alert('Delete draft study?', 'This removes the draft protocol. Enrolled data cannot exist for drafts.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.delete(`/research/studies/${id}`); router.replace('/research'); } catch (e) { Alert.alert('Error', errText(e)); }
    } },
  ]);

  const guideApprove = async () => {
    try { const r = await api.post(`/research/studies/${id}/guide-approve`); setStudy(r.data); Alert.alert('Approved', 'Protocol approved as guide.'); }
    catch (e) { Alert.alert('Error', errText(e)); }
  };

  const NavRow = ({ icon, label, sub, route, count }: { icon: IoniconsIconName; label: string; sub: string; route: string; count?: number }) => (
    <TouchableOpacity style={s.navRow} onPress={() => router.push(route as any)} testID={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <View style={s.navIcon}><Ionicons name={icon} size={18} color={RC.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={u.strong}>{label}{count !== undefined ? <Text style={{ color: RC.sub, fontWeight: '600' }}>  ·  {count}</Text> : null}</Text>
        <Text style={u.kv} numberOfLines={2}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={RC.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={u.container} edges={['top']}>
      <ScreenHeader title={study.code} subtitle={study.title} testID="study-detail-title"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/research'))}
        right={<Chip label={STATUS_LABEL[study.status] || study.status} color={st.color} bg={st.bg} testID="study-status-chip" />} />
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <Segmented value={tab} onChange={setTab} testID="study-tab"
          options={[{ key: 'overview', label: 'Overview' }, { key: 'protocol', label: 'Protocol' }, { key: 'cases', label: `Cases (${enrolments.length})` }, { key: 'team', label: 'Team' }]} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {tab === 'overview' && (
          <>
            <Card>
              <Text style={s.question}>{study.research_question || 'No research question written yet.'}</Text>
              <View style={[u.row, { flexWrap: 'wrap', gap: 6, marginTop: 10 }]}>
                <Chip label={STUDY_TYPE_LABEL[study.study_type] || study.study_type} color={RC.sub} bg={RC.greySoft} small />
                <Chip label={`Unit: ${study.primary_unit}`} color={RC.sub} bg={RC.greySoft} small />
                <Chip label={`PI: ${study.pi_name}`} color={RC.sub} bg={RC.greySoft} small />
                {study.is_dissertation && <Chip label="Dissertation" color={RC.purple} bg={RC.purpleSoft} small />}
              </View>
              <View style={s.kpiRow}>
                <KPI label="Enrolled" value={`${study.counts?.enrolled ?? 0}/${study.target_n}`} />
                <KPI label="Due now" value={String(study.counts?.in_window ?? 0)} color={RC.primary} />
                <KPI label="Overdue" value={String(study.counts?.overdue ?? 0)} color={study.counts?.overdue ? RC.amber : RC.text} />
                <KPI label="Variables" value={String(study.variables.length)} />
              </View>
            </Card>

            {study.status === 'draft' && (
              <Card testID="activation-checklist">
                <SectionTitle title="Activation checklist" icon="checkmark-done-outline" />
                {study.activation_checklist.map(i => (
                  <View key={i.label} style={[u.row, { paddingVertical: 5 }]}>
                    <Ionicons name={i.ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={i.ok ? RC.green : RC.muted} />
                    <Text style={[s.checkTxt, !i.ok && { color: RC.sub }]}>{i.label}</Text>
                  </View>
                ))}
                {study.protocol_errors.length > 0 && (
                  <View style={s.errBox}>{study.protocol_errors.map((e, i) => <Text key={i} style={s.errTxt}>• {e}</Text>)}</View>
                )}
                {study.is_dissertation && study.my_roles.includes('guide') && !study.guide_approved_at && (
                  <PrimaryButton label="Approve protocol as guide" variant="outline" icon="ribbon-outline" onPress={guideApprove} style={{ marginTop: 10 }} testID="guide-approve-btn" />
                )}
                {isPI && (
                  <PrimaryButton label="Activate study" icon="rocket-outline" loading={busy} style={{ marginTop: 12 }} testID="activate-btn"
                    disabled={!study.activation_checklist.every(i => i.ok)}
                    onPress={() => setStatus('active', 'Activate study?', 'Protocol v1.0 becomes active. Variable and timepoint keys are then locked; you can add but not remove them.')} />
                )}
              </Card>
            )}

            <Card>
              <SectionTitle title="Work on this study" icon="compass-outline" />
              {study.status === 'active' && canEnterData && (
                <NavRow icon="search-outline" label="Screen & enrol cases" sub="Retrospective pull of your cases with per-rule pass / fail / needs-review." route={`/research/${id}/screening`} />
              )}
              <NavRow icon="flag-outline" label="Data queries" sub="Flagged values and their resolution threads." route={`/research/${id}/queries`} />
              <NavRow icon="school-outline" label="Synopsis / dissertation" sub="University-format DOCX & PDF with methods and criteria generated from the protocol." route={`/research/${id}/synopsis`} />
              <NavRow icon="stats-chart-outline" label="Results & export" sub="Recruitment flow, follow-up compliance, descriptive statistics, de-identified CSV." route={`/research/${id}/results`} />
              {isPI && (
                <NavRow icon="shield-checkmark-outline" label="Ethics & consent" sub={study.iec_ref ? `IEC ${study.iec_ref} · consent ${study.consent_form_version || '—'}` : 'IEC reference, approval date, consent form version, CTRI.'} route={`/research/${id}/ethics`} />
              )}
            </Card>

            {isPI && (
              <Card>
                <SectionTitle title="Study status" icon="git-branch-outline" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {study.status === 'active' && <PrimaryButton label="Close recruitment" variant="outline" onPress={() => setStatus('recruitment_closed', 'Close recruitment?', 'No new enrolments; follow-up continues.')} testID="close-recruitment-btn" />}
                  {study.status === 'recruitment_closed' && <PrimaryButton label="Reopen recruitment" variant="outline" onPress={() => setStatus('active', 'Reopen recruitment?', 'Enrolment resumes.')} />}
                  {['active', 'recruitment_closed', 'follow_up_complete'].includes(study.status) && <PrimaryButton label="Lock dataset" variant="outline" icon="lock-closed-outline" onPress={() => setStatus('data_locked', 'Lock dataset?', 'Freezes all data entry. Only reversible by the PI with a reason.')} testID="lock-dataset-btn" />}
                  {study.status === 'data_locked' && <PrimaryButton label="Unlock dataset" variant="outline" onPress={() => setStatus('follow_up_complete', 'Unlock dataset?', 'Data entry resumes. This is audit-logged.')} />}
                  {study.status !== 'archived' && study.status !== 'draft' && <PrimaryButton label="Archive" variant="ghost" onPress={() => setStatus('archived', 'Archive study?', 'Hidden from the active list. Nothing is deleted.')} />}
                  {study.status === 'draft' && <PrimaryButton label="Delete draft" variant="danger" onPress={deleteDraft} testID="delete-draft-btn" />}
                </View>
              </Card>
            )}
          </>
        )}

        {tab === 'protocol' && (
          <>
            {!protocolEditable && <Text style={s.notice}>{isPI ? 'Protocol is locked.' : 'Only the PI edits the protocol — read-only view.'}</Text>}
            {study.status === 'active' && protocolEditable && <Text style={s.notice}>Active protocol: you can add variables/timepoints but not remove or rename them (BR-06).</Text>}
            <Card>
              <SectionTitle title="Eligibility" icon="funnel-outline" right={protocolEditable ? <EditBtn onPress={() => router.push(`/research/${id}/eligibility`)} testID="edit-eligibility" /> : null} />
              {study.eligibility.length === 0 ? <Text style={u.kv}>No rules yet.</Text> : study.eligibility.map((r, i) => (
                <View key={i} style={[u.row, { paddingVertical: 4, alignItems: 'flex-start' }]}>
                  <Chip label={r.kind === 'include' ? 'IN' : 'EX'} color={r.kind === 'include' ? RC.green : RC.red} bg={r.kind === 'include' ? RC.greenSoft : RC.redSoft} small />
                  <Text style={[s.ruleTxt, { flex: 1 }]}>{r.mode === 'checklist' ? `☐ ${r.checklist_text}` : describeQuery(r.query, study)}</Text>
                </View>
              ))}
            </Card>
            <Card>
              <SectionTitle title={`Variables (${study.variables.length})`} icon="list-outline" right={protocolEditable ? <EditBtn onPress={() => router.push(`/research/${id}/variables`)} testID="edit-variables" /> : null} />
              {(['patient', 'implant', 'site'] as const).map(level => {
                const vs = study.variables.filter(v => v.level === level);
                if (!vs.length) return null;
                return (
                  <View key={level} style={{ marginBottom: 8 }}>
                    <Text style={s.levelHdr}>{level.toUpperCase()} LEVEL</Text>
                    {vs.map(v => (
                      <View key={v.key} style={[u.row, { paddingVertical: 3 }]}>
                        <Chip label={v.source} color={sourceColor(v.source).c} bg={sourceColor(v.source).b} small />
                        <Text style={[s.ruleTxt, { flex: 1 }]} numberOfLines={1}>{v.label}{v.unit ? ` (${v.unit})` : ''}{v.required ? ' *' : ''}</Text>
                        <Text style={s.keyTxt}>{v.key}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </Card>
            <Card>
              <SectionTitle title={`Schedule (${study.timepoints.length})`} icon="calendar-outline" right={protocolEditable ? <EditBtn onPress={() => router.push(`/research/${id}/schedule`)} testID="edit-schedule" /> : null} />
              {study.timepoints.map(t => (
                <View key={t.key} style={{ paddingVertical: 5 }}>
                  <View style={u.row}>
                    <Text style={u.strong}>{t.label}</Text>
                    {t.is_baseline && <View style={{ marginLeft: 6 }}><Chip label="Baseline" color={RC.primary} bg={RC.primarySoft} small /></View>}
                  </View>
                  <Text style={u.kv}>{ANCHOR_LABEL[t.anchor_event]}{t.offset_days ? ` + ${t.offset_days} d` : ''} · window −{t.window_before_days}/+{t.window_after_days} d · {t.variables.length} variables</Text>
                </View>
              ))}
            </Card>
            {isPI && study.status === 'draft' && (
              <View style={{ marginHorizontal: 14, marginTop: 12 }}>
                <PrimaryButton label="Clone into a new study" variant="outline" icon="copy-outline" onPress={() => router.push(`/research/new?clone_from=${id}`)} />
              </View>
            )}
          </>
        )}

        {tab === 'cases' && (
          <>
            {study.status === 'active' && canEnterData && (
              <View style={{ marginHorizontal: 14, marginTop: 12 }}>
                <PrimaryButton label="Screen & enrol cases" icon="person-add-outline" onPress={() => router.push(`/research/${id}/screening`)} testID="go-screening-btn" />
              </View>
            )}
            {enrolments.length === 0 ? <Empty icon="people-outline" title="No cases enrolled" body={study.status === 'draft' ? 'Activate the study to start enrolling.' : 'Use Screen & enrol to pull matching cases.'} /> :
              enrolments.map(e => (
                <TouchableOpacity key={e.id} style={s.enrolCard} onPress={() => router.push(`/research/enrolment/${e.id}`)} testID={`enrolment-${e.subject_code}`}>
                  <View style={u.row}>
                    <Text style={s.subjectCode}>{e.subject_code}</Text>
                    <View style={{ flex: 1 }} />
                    <Chip label={e.status.replace(/_/g, ' ')} color={e.status === 'withdrawn' || e.status.startsWith('lost') ? RC.red : RC.green} bg={e.status === 'withdrawn' || e.status.startsWith('lost') ? RC.redSoft : RC.greenSoft} small />
                  </View>
                  <Text style={u.kv}>{e.patient_name ? `${e.patient_name} · ` : ''}Tooth {e.tooth_number} · enrolled {String(e.enrolled_at).slice(0, 10)}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {e.forms.map((f: any) => {
                      const fs = FORM_STATUS[f.status] || FORM_STATUS.not_due;
                      return <Chip key={f.timepoint_key} label={`${f.label}: ${fs.label}`} color={fs.color} bg={fs.bg} small />;
                    })}
                  </View>
                </TouchableOpacity>
              ))}
          </>
        )}

        {tab === 'team' && (
          <Card>
            <SectionTitle title="Study team" icon="people-outline" right={isPI ? <EditBtn onPress={() => router.push(`/research/${id}/team`)} testID="edit-team" /> : null} />
            {study.members.map((m, i) => (
              <View key={`${m.user_id}-${m.role}-${i}`} style={[u.row, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F3F7' }]}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{(m.name || '?').slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={u.strong}>{m.name}</Text>
                  <Text style={u.kv}>{MEMBER_ROLE_LABEL[m.role] || m.role}{m.user_role ? ` · ${m.user_role.replace('_', ' ')}` : ''}</Text>
                </View>
              </View>
            ))}
            <Text style={[u.kv, { marginTop: 10 }]}>PI edits protocol, enrols, enters and locks data. Co-investigators and data collectors enrol and enter data. Guide approves dissertation protocols and may export. Statisticians may export.</Text>
            {canExport && null}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiVal, color ? { color } : null]}>{value}</Text>
      <Text style={s.kpiLbl}>{label}</Text>
    </View>
  );
}
function EditBtn({ onPress, testID }: { onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.editBtn} testID={testID} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons name="create-outline" size={14} color={RC.primary} />
      <Text style={s.editTxt}>Edit</Text>
    </TouchableOpacity>
  );
}
export function sourceColor(src: string) {
  if (src === 'linked') return { c: RC.primary, b: RC.primarySoft };
  if (src === 'derived') return { c: RC.purple, b: RC.purpleSoft };
  return { c: RC.green, b: RC.greenSoft };
}
export function describeQuery(q: any, study?: { variables: any[] }, registry?: Record<string, string>): string {
  if (!q || typeof q !== 'object') return '';
  if (q.all) return '(' + q.all.map((c: any) => describeQuery(c, study, registry)).join(' AND ') + ')';
  if (q.any) return '(' + q.any.map((c: any) => describeQuery(c, study, registry)).join(' OR ') + ')';
  if (q.not) return 'NOT ' + describeQuery(q.not, study, registry);
  const label = registry?.[q.field] || q.field;
  const ops: Record<string, string> = { eq: '=', neq: '≠', in: 'in', not_in: 'not in', gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'between', exists: 'is recorded', not_exists: 'is not recorded', contains: 'contains' };
  const v = Array.isArray(q.value) ? q.value.join(', ') : (q.value ?? '');
  return `${label} ${ops[q.op] || q.op} ${v}`.trim();
}

const s = StyleSheet.create({
  question: { fontSize: 14, color: RC.text, lineHeight: 20, fontStyle: 'italic' },
  kpiRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  kpi: { flex: 1, backgroundColor: '#F7F9FC', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  kpiVal: { fontSize: 16, fontWeight: '800', color: RC.text },
  kpiLbl: { fontSize: 10, color: RC.sub, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  checkTxt: { marginLeft: 8, fontSize: 13, color: RC.text },
  errBox: { backgroundColor: RC.redSoft, borderRadius: 8, padding: 8, marginTop: 8 },
  errTxt: { fontSize: 12, color: RC.red },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F3F7', minHeight: 56 },
  navIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  notice: { marginHorizontal: 14, marginTop: 12, fontSize: 12, color: RC.sub, backgroundColor: '#FFF8E1', padding: 10, borderRadius: 10 },
  ruleTxt: { fontSize: 13, color: RC.text, marginLeft: 8 },
  keyTxt: { fontSize: 10, color: RC.muted, fontFamily: 'monospace' as any, marginLeft: 6 },
  levelHdr: { fontSize: 10, fontWeight: '800', color: RC.muted, letterSpacing: 0.6, marginBottom: 4 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: RC.primary, minHeight: 30 },
  editTxt: { fontSize: 12, fontWeight: '700', color: RC.primary },
  enrolCard: { backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: RC.border },
  subjectCode: { fontSize: 13, fontWeight: '800', color: RC.primary, letterSpacing: 0.4 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '800', color: RC.primary },
});
