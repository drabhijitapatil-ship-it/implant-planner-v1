/**
 * Research Module — study audit trail.
 * Every change made by any user (protocol, team & approvals, data, queries, exports)
 * newest first, with before→after values where recorded. CSV download for IEC records.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps as IonProps } from 'react';
type IoniconsIconName = IonProps<typeof Ionicons>['name'];
import api from '../../../utils/api';
import { downloadAuthenticated } from '../../../utils/csvDownload';
import { RC, Chip, Empty, Loading, PrimaryButton, ScreenHeader, errText, u } from '../../../components/research/ResearchUI';

type Entry = { id: string | number; action: string; detail: string; reason: string; by_name: string; by_role: string; at: string; group: string; changes_text: string[] };
type Data = { study_code: string; total: number; counts: Record<string, number>; entries: Entry[] };

const GROUPS: { key: string; label: string; icon: IoniconsIconName; color: string; bg: string }[] = [
  { key: 'protocol', label: 'Protocol', icon: 'document-text-outline', color: RC.primary, bg: RC.primarySoft },
  { key: 'team', label: 'Team & approval', icon: 'people-outline', color: RC.purple, bg: RC.purpleSoft },
  { key: 'data', label: 'Data', icon: 'clipboard-outline', color: RC.green, bg: RC.greenSoft },
  { key: 'queries', label: 'Queries', icon: 'flag-outline', color: RC.amber, bg: RC.amberSoft },
  { key: 'exports', label: 'Exports', icon: 'download-outline', color: RC.sub, bg: RC.greySoft },
];

const ACTION_LABEL: Record<string, string> = {
  created: 'Study created', protocol_updated: 'Protocol edited', study_updated: 'Study details edited', status_changed: 'Status changed',
  members_updated: 'Team updated', submitted_to_guide: 'Submitted to guide', guide_approve: 'Guide approved protocol', guide_request_changes: 'Guide requested changes',
  iec_letter_uploaded: 'IEC letter uploaded', iec_letter_removed: 'IEC letter removed',
  enrolled: 'Case enrolled', enrolment_status: 'Enrolment status changed', form_saved: 'Visit form saved', form_completed: 'Visit form completed', form_locked: 'Form locked',
  form_unlocked: 'Form unlocked', image_uploaded: 'Radiograph uploaded', image_measured: 'Radiograph measured', image_measured_blinded: 'Radiograph measured (blinded)',
  query_raised: 'Query raised', query_reply: 'Query reply', query_closed: 'Query closed', query_reopened: 'Query reopened', query_close: 'Query closed', query_reopen: 'Query reopened', exported: 'Dataset exported', synopsis_exported: 'Synopsis exported',
  synopsis_updated: 'Synopsis edited', amendment_published: 'Amendment published', audit_exported: 'Audit trail exported',
};
const label = (a: string) => ACTION_LABEL[a] || a.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

export default function AuditTrail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get(`/research/studies/${id}/audit${group ? `?group=${group}` : ''}`); setData(r.data); }
    catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [id, group]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try { await downloadAuthenticated(`${api.defaults.baseURL}/research/studies/${id}/audit?format=csv`, `${data.study_code}_audit_trail.csv`, 'text/csv'); }
    catch { /* handled */ } finally { setExporting(false); load(); }
  };

  if (!data) return <Loading />;
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Audit trail" subtitle={`${data.study_code} · ${total} recorded change${total === 1 ? '' : 's'}`} testID="audit-title"
        onBack={() => (router.canGoBack() ? router.back() : router.replace(`/research/${id}`))}
        right={<PrimaryButton label="CSV" variant="outline" icon="download-outline" onPress={exportCsv} loading={exporting} testID="audit-export" style={{ paddingVertical: 8, minHeight: 36 }} />} />
      <FlatList
        data={data.entries}
        keyExtractor={e => String(e.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={(
          <View style={s.filters}>
            <TouchableOpacity onPress={() => setGroup(null)} style={[u.pill, !group && { backgroundColor: RC.primary, borderColor: RC.primary }]} testID="audit-filter-all">
              <Text style={[u.pillTxt, !group && { color: '#FFF' }]}>All ({total})</Text>
            </TouchableOpacity>
            {GROUPS.map(g => (
              <TouchableOpacity key={g.key} onPress={() => setGroup(group === g.key ? null : g.key)} style={[u.pill, group === g.key && { backgroundColor: g.color, borderColor: g.color }]} testID={`audit-filter-${g.key}`}>
                <Text style={[u.pillTxt, group === g.key && { color: '#FFF' }]}>{g.label} ({data.counts[g.key] || 0})</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        renderItem={({ item }) => {
          const g = GROUPS.find(x => x.key === item.group) || GROUPS[0];
          const expanded = open === item.id;
          const hasMore = item.changes_text.length > 0 || !!item.reason;
          return (
            <TouchableOpacity style={s.row} activeOpacity={hasMore ? 0.8 : 1} onPress={() => hasMore && setOpen(expanded ? null : item.id)} testID={`audit-entry-${item.id}`}>
              <View style={[s.iconWrap, { backgroundColor: g.bg }]}><Ionicons name={g.icon} size={16} color={g.color} /></View>
              <View style={{ flex: 1 }}>
                <View style={u.row}>
                  <Text style={u.strong}>{label(item.action)}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={s.when}>{String(item.at || '').slice(0, 16).replace('T', ' ')}</Text>
                </View>
                {!!item.detail && <Text style={u.kv}>{item.detail}</Text>}
                <View style={[u.row, { marginTop: 4, flexWrap: 'wrap', gap: 6 }]}>
                  <Chip label={item.by_name || 'system'} color={RC.text} bg={RC.greySoft} small />
                  {!!item.by_role && <Chip label={item.by_role.replace(/_/g, ' ')} color={RC.sub} bg={RC.greySoft} small />}
                  {item.changes_text.length > 0 && <Chip label={`${item.changes_text.length} change${item.changes_text.length === 1 ? '' : 's'}`} color={g.color} bg={g.bg} small />}
                  {hasMore && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={RC.muted} />}
                </View>
                {expanded && (
                  <View style={s.changes}>
                    {!!item.reason && <Text style={s.reason}>Reason: {item.reason}</Text>}
                    {item.changes_text.map((c, i) => <Text key={i} style={s.changeTxt}>• {c}</Text>)}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty icon="receipt-outline" title="No entries" body={group ? 'Nothing recorded in this category yet.' : 'Changes to this study will be listed here.'} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 14, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 8, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: RC.border },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  when: { fontSize: 11, color: RC.muted, fontWeight: '600' },
  changes: { marginTop: 8, backgroundColor: RC.bg, borderRadius: 8, padding: 8 },
  reason: { fontSize: 12, color: RC.text, fontStyle: 'italic', marginBottom: 4 },
  changeTxt: { fontSize: 12, color: RC.text, lineHeight: 17 },
});
