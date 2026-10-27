/**
 * Research Module — protocol amendments / versions.
 * Lists published protocol versions (v1.0 at activation, v1.1…), shows pending
 * unpublished changes, and lets the PI publish the next version with a summary + rationale.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import { RC, Card, Chip, Empty, Field, Loading, PrimaryButton, ScreenHeader, SectionTitle, errText, u } from '../../../components/research/ResearchUI';

type Version = { version: string; published_at: string; published_by: string; summary: string; rationale: string; changes: string[]; iec_amendment_ref?: string; enrolments: number };
type Data = { current_version: string; status: string; versions: Version[]; pending_changes: string[]; can_publish: boolean };

export default function Amendments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState('');
  const [rationale, setRationale] = useState('');
  const [iecRef, setIecRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.get(`/research/studies/${id}/amendments`); setData(r.data); }
    catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <Loading />;
  const editable = data.can_publish && !['data_locked', 'archived', 'draft'].includes(data.status);

  const publish = async () => {
    if (!summary.trim() || !rationale.trim()) { Alert.alert('Incomplete', 'Give a one-line summary and the rationale for the amendment.'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/research/studies/${id}/amendments`, { summary, rationale, iec_amendment_ref: iecRef });
      setData(r.data); setSummary(''); setRationale(''); setIecRef('');
      Alert.alert('Published', `Protocol v${r.data.current_version} is now current. Earlier data keeps its original version.`);
    } catch (e) { Alert.alert('Cannot publish', errText(e)); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Protocol amendments" subtitle={`Current protocol v${data.current_version}`} testID="amendments-title"
        onBack={() => (router.canGoBack() ? router.back() : router.replace(`/research/${id}`))}
        right={<Chip label={`v${data.current_version}`} color={RC.primary} bg={RC.primarySoft} testID="current-version-chip" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} keyboardShouldPersistTaps="handled">
        {data.status === 'draft' ? (
          <Card><Text style={u.kv}>Drafts are edited freely. Version 1.0 is recorded when the study is activated; every later change is published as an amendment (v1.1, v1.2 …) with its reason.</Text></Card>
        ) : (
          <Card testID="pending-changes-card">
            <SectionTitle title={`Unpublished changes (${data.pending_changes.length})`} icon="git-compare-outline" />
            {data.pending_changes.length === 0 ? (
              <Text style={u.kv}>The live protocol matches v{data.current_version}. Edit Eligibility, Variables or Schedule from the Protocol tab, then publish the amendment here.</Text>
            ) : data.pending_changes.map((c, i) => (
              <View key={i} style={[u.row, { alignItems: 'flex-start', paddingVertical: 3 }]}>
                <Ionicons name="ellipse" size={6} color={RC.amber} style={{ marginTop: 7, marginRight: 8 }} />
                <Text style={s.changeTxt} testID={`pending-change-${i}`}>{c}</Text>
              </View>
            ))}
            {editable && data.pending_changes.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Field label="Amendment summary (one line)" value={summary} onChangeText={setSummary} placeholder="e.g. Added 24-month timepoint and PES variable" testID="amend-summary" />
                <Field label="Rationale — why is this change needed?" value={rationale} onChangeText={setRationale} multiline placeholder="e.g. Guide recommended extending follow-up to 24 months to capture late remodelling; IEC informed." testID="amend-rationale" />
                <Field label="IEC amendment reference (optional)" value={iecRef} onChangeText={setIecRef} placeholder="e.g. IEC/2026/045-A1" testID="amend-iec" />
                <View style={s.note}>
                  <Ionicons name="information-circle-outline" size={16} color={RC.primary} />
                  <Text style={[u.kv, { flex: 1, marginLeft: 6 }]}>Publishing creates v{nextVersion(data.current_version)}. Enrolments and visit forms already collected keep their original protocol version in exports; the previous version's full snapshot is preserved below.</Text>
                </View>
                <PrimaryButton label={`Publish amendment v${nextVersion(data.current_version)}`} icon="cloud-upload-outline" onPress={publish} loading={busy} style={{ marginTop: 10 }} testID="publish-amendment" />
              </View>
            )}
            {!editable && data.pending_changes.length > 0 && <Text style={[u.hint, { marginTop: 8 }]}>Only the PI publishes amendments{['data_locked', 'archived'].includes(data.status) ? ' (study is locked)' : ''}.</Text>}
          </Card>
        )}

        <Card>
          <SectionTitle title={`Version history (${data.versions.length})`} icon="time-outline" />
          {data.versions.length === 0 ? <Empty icon="document-text-outline" title="No versions yet" body="v1.0 is recorded automatically at activation." /> :
            [...data.versions].reverse().map(v => {
              const on = expanded === v.version;
              return (
                <TouchableOpacity key={v.version} style={s.verRow} onPress={() => setExpanded(on ? null : v.version)} activeOpacity={0.8} testID={`version-${v.version}`}>
                  <View style={u.row}>
                    <Chip label={`v${v.version}`} color={v.version === data.current_version ? RC.green : RC.sub} bg={v.version === data.current_version ? RC.greenSoft : RC.greySoft} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={u.strong} numberOfLines={on ? undefined : 1}>{v.summary}</Text>
                      <Text style={u.kv}>{String(v.published_at).slice(0, 10)} · {v.published_by} · {v.enrolments} enrolment{v.enrolments === 1 ? '' : 's'} under this version</Text>
                    </View>
                    <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={RC.muted} />
                  </View>
                  {on && (
                    <View style={{ marginTop: 8 }}>
                      {!!v.rationale && <Text style={s.rationale}>{v.rationale}</Text>}
                      {!!v.iec_amendment_ref && <Text style={u.kv}>IEC amendment ref: {v.iec_amendment_ref}</Text>}
                      {v.changes.length > 0 && <Text style={[u.label, { marginTop: 8 }]}>Changes from previous version</Text>}
                      {v.changes.map((c, i) => <Text key={i} style={s.changeTxt}>• {c}</Text>)}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function nextVersion(v: string) {
  const [a, b] = (v || '1.0').split('.');
  return `${Number(a) || 1}.${(Number(b) || 0) + 1}`;
}

const s = StyleSheet.create({
  changeTxt: { flex: 1, fontSize: 13, color: RC.text, lineHeight: 18 },
  note: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: RC.primarySoft, borderRadius: 10, padding: 10 },
  verRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F3F7' },
  rationale: { fontSize: 13, color: RC.sub, fontStyle: 'italic', lineHeight: 18 },
});
