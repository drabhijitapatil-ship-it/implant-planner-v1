/**
 * Research Module — results dashboard (S9 / S15) + export (S16).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { downloadAuthenticated } from '../../../utils/csvDownload';
import { RC, Card, Chip, Loading, PillSelect, ScreenHeader, SectionTitle, FORM_STATUS, errText, u } from '../../../components/research/ResearchUI';

export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [study, setStudy] = useState<any | null>(null);
  const [dash, setDash] = useState<any | null>(null);
  const [groupBy, setGroupBy] = useState<string>('');
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api.get(`/research/studies/${id}`), api.get(`/research/studies/${id}/dashboard`, { params: groupBy ? { group_by: groupBy } : {} })]);
      setStudy(s.data); setDash(d.data);
    } catch (e) { Alert.alert('Error', errText(e)); }
  }, [id, groupBy]);
  useEffect(() => { load(); }, [load]);

  if (!study || !dash) return <Loading />;
  const canExport = ['pi', 'admin', 'guide', 'statistician'].some(r => study.my_roles.includes(r));
  const catVars = study.variables.filter((v: any) => ['single_select', 'boolean', 'text'].includes(v.data_type) && v.source !== 'derived');
  const pct = study.target_n ? Math.min(100, Math.round((dash.flow.enrolled / study.target_n) * 100)) : 0;

  const doExport = async (shape: string) => {
    setExporting(shape);
    try {
      const url = `${api.defaults.baseURL}/research/studies/${id}/export?shape=${shape}`;
      const ext = shape === 'methods' ? 'txt' : 'csv';
      await downloadAuthenticated(url, `${study.code}_${shape}.${ext}`, shape === 'methods' ? 'text/plain' : 'text/csv');
    } catch { /* handled */ } finally { setExporting(null); }
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Results & export" subtitle={`${study.code} · descriptive, de-identified`} testID="results-title" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Card testID="flow-card">
          <SectionTitle title="Recruitment flow" icon="git-merge-outline" />
          <View style={s.progressWrap}><View style={[s.progressBar, { width: `${pct}%` }]} /></View>
          <Text style={[u.kv, { marginTop: 6 }]}>{dash.flow.enrolled} of {study.target_n} enrolled ({pct}%) · {dash.flow.patients} patients</Text>
          <View style={s.flowRow}>
            <FlowBox n={dash.flow.screened_excluded} l="Screen-excluded" />
            <Ionicons name="arrow-forward" size={14} color={RC.muted} />
            <FlowBox n={dash.flow.enrolled} l="Enrolled" c={RC.primary} />
            <Ionicons name="arrow-forward" size={14} color={RC.muted} />
            <FlowBox n={dash.flow.active} l="In follow-up" c={RC.green} />
            <Ionicons name="arrow-forward" size={14} color={RC.muted} />
            <FlowBox n={dash.flow.completed} l="Completed" c={RC.purple} />
          </View>
          <View style={[u.row, { flexWrap: 'wrap', gap: 6, marginTop: 10 }]}>
            {dash.flow.withdrawn > 0 && <Chip label={`${dash.flow.withdrawn} withdrawn`} color={RC.red} bg={RC.redSoft} small />}
            {dash.flow.lost_to_follow_up > 0 && <Chip label={`${dash.flow.lost_to_follow_up} lost to follow-up`} color={RC.amber} bg={RC.amberSoft} small />}
            {dash.flow.excluded_post_enrolment > 0 && <Chip label={`${dash.flow.excluded_post_enrolment} excluded post-enrolment`} color={RC.grey} bg={RC.greySoft} small />}
          </View>
          {dash.clustered_warning && (
            <View style={s.warnBox}>
              <Ionicons name="information-circle" size={16} color={RC.amber} />
              <Text style={s.warnTxt}>Several implants belong to the same patients (clustered data). Use mixed models / GEE on the exported dataset rather than naive tests.</Text>
            </View>
          )}
        </Card>

        <Card testID="compliance-card">
          <SectionTitle title="Follow-up compliance" icon="calendar-outline" />
          {dash.timepoints.map((t: any) => {
            const total = ['not_due', 'in_window', 'overdue', 'missed', 'completed', 'locked', 'not_done'].reduce((a, k) => a + (t[k] || 0), 0);
            const done = (t.completed || 0) + (t.locked || 0);
            return (
              <View key={t.label} style={{ paddingVertical: 6 }}>
                <View style={u.row}>
                  <Text style={u.strong}>{t.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={u.kv}>{done}/{total} done{t.deviations ? ` · ${t.deviations} deviation${t.deviations > 1 ? 's' : ''}` : ''}</Text>
                </View>
                <View style={s.bar}>
                  {(['locked', 'completed', 'in_window', 'overdue', 'missed', 'not_due'] as const).map(k => (t[k] ? <View key={k} style={{ flex: t[k], backgroundColor: FORM_STATUS[k].color }} /> : null))}
                </View>
              </View>
            );
          })}
          <View style={[u.row, { flexWrap: 'wrap', gap: 6, marginTop: 6 }]}>
            {Object.entries(FORM_STATUS).filter(([k]) => k !== 'not_done').map(([k, v]) => <Chip key={k} label={v.label} color={v.color} bg={v.bg} small />)}
          </View>
        </Card>

        <Card testID="results-card">
          <SectionTitle title="Variable summaries" icon="analytics-outline" />
          {catVars.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={u.label}>Group by</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <PillSelect value={groupBy} onChange={setGroupBy} options={[{ key: '', label: 'None' }, ...catVars.map((v: any) => ({ key: v.key, label: v.label }))]} testID="group-by" />
              </ScrollView>
            </View>
          )}
          {dash.completed_forms === 0 && <Text style={u.kv}>No completed forms yet — summaries appear once visits are completed.</Text>}
          {dash.results.filter((r: any) => r.timepoints.some((c: any) => c.n > 0)).map((r: any) => (
            <View key={r.key} style={s.resBlock}>
              <Text style={u.strong}>{r.label}{r.unit ? ` (${r.unit})` : ''} <Text style={{ color: RC.muted, fontWeight: '500', fontSize: 11 }}>{r.key}</Text></Text>
              {r.timepoints.filter((c: any) => c.n > 0).map((c: any) => (
                <View key={c.timepoint_key} style={{ marginTop: 6 }}>
                  <Text style={s.tpLbl}>{c.label} · n = {c.n}</Text>
                  {c.stats ? <StatsLine st={c.stats} /> : <CatLine cats={c.categories} />}
                  {c.by_group && Object.entries(c.by_group).map(([g, v]: any) => (
                    <View key={g} style={{ marginLeft: 12, marginTop: 3 }}>
                      <Text style={[s.tpLbl, { color: RC.purple }]}>{groupBy} = {g}</Text>
                      {Array.isArray(v) ? <CatLine cats={v} /> : <StatsLine st={v} />}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </Card>

        <Card testID="export-card">
          <SectionTitle title="Export (de-identified)" icon="download-outline" />
          <Text style={[u.kv, { marginBottom: 10 }]}>Subject codes replace identities; dates become days-from-anchor; linked values of locked forms use their snapshot. Each export is audit-logged.</Text>
          {!canExport ? <Text style={{ color: RC.amber, fontSize: 12 }}>Export is limited to PI, guide and statistician roles.</Text> : (
            <View style={{ gap: 8 }}>
              <ExportRow icon="grid-outline" title="Wide CSV" sub="One row per implant/site; columns variable__timepoint. SPSS / R ready." onPress={() => doExport('wide')} busy={exporting === 'wide'} testID="export-wide" />
              <ExportRow icon="reorder-four-outline" title="Long CSV" sub="One row per enrolment × timepoint × variable (tidy)." onPress={() => doExport('long')} busy={exporting === 'long'} testID="export-long" />
              <ExportRow icon="book-outline" title="Data dictionary" sub="Key, label, level, source, type, unit, codes, formula, timepoints." onPress={() => doExport('dictionary')} busy={exporting === 'dictionary'} testID="export-dictionary" />
              <ExportRow icon="document-text-outline" title="Methods paragraph" sub="Generated from the protocol for synopsis / dissertation." onPress={() => doExport('methods')} busy={exporting === 'methods'} testID="export-methods" />
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function FlowBox({ n, l, c }: { n: number; l: string; c?: string }) {
  return (
    <View style={s.flowBox}>
      <Text style={[s.flowN, c ? { color: c } : null]}>{n}</Text>
      <Text style={s.flowL}>{l}</Text>
    </View>
  );
}
function StatsLine({ st }: { st: any }) {
  if (!st || !st.n) return <Text style={u.kv}>—</Text>;
  return <Text style={s.stats}>mean {st.mean} ± {st.sd} SD (95% CI ±{st.ci95}) · median {st.median} [IQR {st.q1}–{st.q3}] · range {st.min}–{st.max}</Text>;
}
function CatLine({ cats }: { cats: any[] }) {
  return <Text style={s.stats}>{(cats || []).map(c => `${c.value}: ${c.count} (${c.pct}%)`).join(' · ') || '—'}</Text>;
}
function ExportRow({ icon, title, sub, onPress, busy, testID }: any) {
  return (
    <TouchableOpacity style={s.expRow} onPress={onPress} disabled={busy} testID={testID}>
      <View style={s.expIcon}><Ionicons name={icon} size={18} color={RC.primary} /></View>
      <View style={{ flex: 1 }}><Text style={u.strong}>{title}</Text><Text style={u.kv}>{sub}</Text></View>
      <Ionicons name={busy ? 'hourglass-outline' : 'download-outline'} size={18} color={RC.primary} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  progressWrap: { height: 8, backgroundColor: '#E8EDF3', borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: 8, backgroundColor: RC.primary },
  flowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4 },
  flowBox: { flex: 1, backgroundColor: '#F7F9FC', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  flowN: { fontSize: 16, fontWeight: '800', color: RC.text },
  flowL: { fontSize: 9, color: RC.sub, textTransform: 'uppercase', textAlign: 'center', marginTop: 2 },
  warnBox: { flexDirection: 'row', backgroundColor: RC.amberSoft, borderRadius: 10, padding: 10, marginTop: 10, alignItems: 'flex-start' },
  warnTxt: { flex: 1, marginLeft: 8, fontSize: 12, color: '#7A4100', lineHeight: 17 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E8EDF3', marginTop: 4 },
  resBlock: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F3F7' },
  tpLbl: { fontSize: 11, fontWeight: '700', color: RC.sub },
  stats: { fontSize: 12, color: RC.text, lineHeight: 17 },
  expRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: RC.border, minHeight: 56 },
  expIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
});
