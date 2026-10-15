/**
 * Research Module — blinded measurement queue.
 * Examiner sees the study's radiographs in a per-examiner shuffled order with
 * no patient, subject-code or timepoint labels; measurements are tagged "blinded".
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Chip, Empty, Loading, ScreenHeader, Variable, errText, u } from '../../../components/research/ResearchUI';
import RadiographMeasure from '../../../components/research/RadiographMeasure';

type Item = {
  enrolment_id: string; timepoint_key: string; slot: string; image: any; variables: Variable[]; locked: boolean;
  pending: string[]; blind_label: string; position: number;
};

export default function BlindQueue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ total: number; pending: number; items: Item[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    try { const r = await api.get(`/research/studies/${id}/blind-queue`); setData(r.data); }
    catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <Loading />;
  const items = filter === 'pending' ? data.items.filter(i => i.pending.length && !i.locked) : data.items;
  const done = data.total - data.pending;

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title="Blinded measurement" subtitle={`${done}/${data.total} images fully measured`} testID="blind-queue-title"
        onBack={() => (router.canGoBack() ? router.back() : router.replace(`/research/${id}`))} />
      <FlatList
        data={items}
        keyExtractor={i => `${i.enrolment_id}-${i.timepoint_key}-${i.slot}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={(
          <>
            <View style={s.intro}>
              <Ionicons name="eye-off-outline" size={18} color={RC.purple} />
              <Text style={s.introTxt}>Images are shuffled in an order unique to you and shown without patient, subject or timepoint labels. Measure each image, save, and move to the next. Your measurements are tagged <Text style={{ fontWeight: '800' }}>blinded</Text> in the audit trail.</Text>
            </View>
            <View style={[u.row, { marginHorizontal: 14, marginTop: 12, gap: 8 }]}>
              {(['pending', 'all'] as const).map(f => (
                <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[u.pill, filter === f && { backgroundColor: RC.primary, borderColor: RC.primary }]} testID={`blind-filter-${f}`}>
                  <Text style={[u.pillTxt, filter === f && { color: '#FFF' }]}>{f === 'pending' ? `Pending (${data.pending})` : `All (${data.total})`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        renderItem={({ item }) => {
          const measured = item.variables.length - item.pending.length;
          return (
            <TouchableOpacity style={s.card} onPress={() => setOpen(item)} activeOpacity={0.85} testID={`blind-item-${item.position}`}>
              <View style={s.thumb}><Ionicons name="scan-outline" size={22} color={RC.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={u.strong}>{item.blind_label}</Text>
                <Text style={u.kv}>{measured}/{item.variables.length} variables measured · grade {item.image.quality_grade}{item.image.source === 'dicom' ? ' · DICOM' : ''}</Text>
              </View>
              {item.locked ? <Chip label="Locked" color={RC.purple} bg={RC.purpleSoft} small />
                : item.pending.length ? <Chip label={`${item.pending.length} pending`} color={RC.amber} bg={RC.amberSoft} small />
                : <Chip label="Done" color={RC.green} bg={RC.greenSoft} small />}
              <Ionicons name="chevron-forward" size={18} color={RC.muted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty icon="images-outline" title={filter === 'pending' ? 'Nothing pending' : 'No radiographs yet'} body={filter === 'pending' ? 'Every uploaded radiograph has all its mm variables measured.' : 'Upload radiographs from the visit forms; they appear here for blinded measurement.'} />}
      />
      {open && (
        <RadiographMeasure visible onClose={() => setOpen(null)} enrolmentId={open.enrolment_id} tpKey={open.timepoint_key} slot={open.slot}
          form={{ images: { [open.slot]: open.image } }} variables={open.variables} implantLength={null} editable={!open.locked}
          blind={{ label: open.blind_label, position: open.position, total: data.total }} onUpdated={() => { load(); }} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 14, marginTop: 12, backgroundColor: RC.purpleSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E1BEE7' },
  introTxt: { flex: 1, marginLeft: 8, fontSize: 12, color: RC.purple, lineHeight: 17 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 10, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: RC.border, minHeight: 64 },
  thumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: RC.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
});
