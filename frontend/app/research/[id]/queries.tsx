/**
 * Research Module — study data-query inbox (S17).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import api from '../../../utils/api';
import { Empty, Loading, ScreenHeader, Segmented, errText, u } from '../../../components/research/ResearchUI';
import { QueryThread } from '../../../components/research/QueryThread';

export default function StudyQueries() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [study, setStudy] = useState<any | null>(null);
  const [queries, setQueries] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'answered' | 'closed' | 'all'>('open');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, q] = await Promise.all([api.get(`/research/studies/${id}`), api.get(`/research/studies/${id}/queries`)]);
      setStudy(s.data); setQueries(q.data);
    } catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!study || !queries) return <Loading />;
  const roles: string[] = study.my_roles;
  const canReopen = ['pi', 'admin', 'guide', 'statistician'].some(r => roles.includes(r));
  const list = queries.filter(q => filter === 'all' || q.status === filter);
  const count = (st: string) => queries.filter(q => q.status === st).length;

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Data queries" subtitle={`${study.code} · ${count('open')} open · ${count('answered')} answered`} testID="queries-title" />
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <Segmented value={filter} onChange={setFilter} testID="queries-filter" options={[{ key: 'open', label: `Open ${count('open')}` }, { key: 'answered', label: `Answered ${count('answered')}` }, { key: 'closed', label: `Closed ${count('closed')}` }, { key: 'all', label: 'All' }]} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {list.length === 0 ? <Empty icon="flag-outline" title="No queries" body="Guides, statisticians and the PI can flag a value from any form; data collectors answer here or on the form." /> :
          list.map(q => <QueryThread key={q.id} q={q} compact canClose={roles.includes('pi') || roles.includes('admin') || q.raised_by_id === study.pi_user_id} canReopen={canReopen}
            onChanged={nq => setQueries(qs => qs!.map(x => (x.id === nq.id ? nq : x)))} />)}
      </ScrollView>
    </SafeAreaView>
  );
}
