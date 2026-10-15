/**
 * Research Module — home (S1): my studies, due forms, new study.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../utils/api';
import { GUIDE_VERSION } from '../../constants/researchGuide';
import { useAuth } from '../../contexts/AuthContext';
import { RC, Chip, ScreenHeader, Empty, Loading, studyStatusStyle, STATUS_LABEL, STUDY_TYPE_LABEL, u } from '../../components/research/ResearchUI';

export default function ResearchHome() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [studies, setStudies] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const autoOpened = React.useRef(false);

  // First visit to Research → open the User guide once (dismissable; the card stays at the top).
  useEffect(() => {
    if (!user || user.role === 'nurse' || autoOpened.current) return;
    const key = `research_guide_seen_${user.id}`;
    AsyncStorage.getItem(key).then(v => {
      if (v) return;
      autoOpened.current = true;
      AsyncStorage.setItem(key, GUIDE_VERSION).catch(() => {});
      router.push('/research/guide');
    }).catch(() => {});
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.get('/research/studies'), api.get('/research/my-tasks')]);
      setStudies(s.data); setTasks(t.data);
    } catch { /* non-fatal */ } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { if (user && user.role !== 'nurse') load(); }, [user, load]));

  if (authLoading || (loading && user?.role !== 'nurse')) return <Loading />;
  if (!user || user.role === 'nurse') {
    return (
      <SafeAreaView style={u.center}>
        <Ionicons name="lock-closed" size={44} color="#B0BEC5" />
        <Text style={{ marginTop: 12, color: RC.sub }}>Research module is not available for your role.</Text>
      </SafeAreaView>
    );
  }

  const overdue = tasks.filter(t => t.status !== 'in_window').length;

  const renderStudy = ({ item }: { item: any }) => {
    const st = studyStatusStyle(item.status);
    const pct = item.target_n ? Math.min(100, Math.round((item.enrolled / item.target_n) * 100)) : 0;
    return (
      <TouchableOpacity style={s.card} onPress={() => router.push(`/research/${item.id}`)} activeOpacity={0.8} testID={`study-card-${item.code}`}>
        <View style={u.row}>
          <Text style={s.code}>{item.code}</Text>
          <View style={{ flex: 1 }} />
          <Chip label={STATUS_LABEL[item.status] || item.status} color={st.color} bg={st.bg} small />
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        <Text style={u.kv} numberOfLines={1}>{STUDY_TYPE_LABEL[item.study_type] || item.study_type} · unit: {item.primary_unit} · PI {item.pi_name}</Text>
        <View style={s.progressWrap}>
          <View style={[s.progressBar, { width: `${pct}%` }]} />
        </View>
        <View style={[u.row, { marginTop: 6 }]}>
          <Text style={s.meta}><Text style={{ fontWeight: '800', color: RC.text }}>{item.enrolled}</Text> / {item.target_n} enrolled</Text>
          <View style={{ flex: 1 }} />
          {item.due_now > 0 && <Chip label={`${item.due_now} due`} color={RC.primary} bg={RC.primarySoft} small />}
          {item.overdue > 0 && <View style={{ marginLeft: 6 }}><Chip label={`${item.overdue} overdue`} color={RC.amber} bg={RC.amberSoft} small /></View>}
          {item.is_dissertation && <View style={{ marginLeft: 6 }}><Chip label="Dissertation" color={RC.purple} bg={RC.purpleSoft} small /></View>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader
        title="Research" subtitle="Studies, enrolment & data capture" testID="research-title"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard'))}
        right={(
          <TouchableOpacity style={s.newBtn} onPress={() => router.push('/research/new')} testID="new-study-btn">
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={s.newBtnTxt}>New study</Text>
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={studies}
        keyExtractor={i => i.id}
        renderItem={renderStudy}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={<>
          <TouchableOpacity style={s.guideCard} onPress={() => router.push('/research/guide')} activeOpacity={0.85} testID="research-guide-card">
            <View style={s.guideIcon}><Ionicons name="book-outline" size={20} color={RC.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.guideTitle}>User guide — how to run a study</Text>
              <Text style={s.guideSub} numberOfLines={2}>New study → eligibility, variables, schedule → team & ethics → screen & enrol → visits, radiographs, queries → results, export, synopsis.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={RC.muted} />
          </TouchableOpacity>
        {tasks.length > 0 ? (
          <View style={s.taskStrip} testID="research-tasks-strip">
            <View style={u.row}>
              <Ionicons name="alarm" size={16} color={overdue ? RC.amber : RC.primary} />
              <Text style={s.taskTitle}>  {tasks.length} research form{tasks.length === 1 ? '' : 's'} due{overdue ? ` · ${overdue} overdue` : ''}</Text>
            </View>
            {tasks.slice(0, 3).map(t => (
              <TouchableOpacity key={`${t.enrolment_id}-${t.timepoint_key}`} style={s.taskRow}
                onPress={() => router.push(`/research/enrolment/${t.enrolment_id}?tp=${t.timepoint_key}`)}>
                <Text style={s.taskTxt} numberOfLines={1}>{t.study_code} · {t.subject_code} · {t.label}</Text>
                <Text style={[s.taskDue, t.status !== 'in_window' && { color: RC.amber }]}>{t.due_date}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}</>}
        ListEmptyComponent={(
          <Empty icon="flask-outline" title="No studies yet"
            body="Create a study to define your research question, eligibility criteria, variables and follow-up schedule. Cases you enrol will be tracked here." />
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  guideCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 12, backgroundColor: RC.primarySoft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#BBDEFB', minHeight: 64 },
  guideIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  guideTitle: { fontSize: 14, fontWeight: '800', color: RC.text },
  guideSub: { fontSize: 11, color: RC.sub, marginTop: 2, lineHeight: 15 },
  newBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: RC.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minHeight: 36 },
  newBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 12, marginLeft: 2 },
  card: { backgroundColor: '#FFF', marginHorizontal: 14, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: RC.border },
  code: { fontSize: 11, fontWeight: '800', color: RC.primary, letterSpacing: 0.6 },
  title: { fontSize: 15, fontWeight: '800', color: RC.text, marginTop: 6 },
  meta: { fontSize: 12, color: RC.sub },
  progressWrap: { height: 6, backgroundColor: '#E8EDF3', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  progressBar: { height: 6, backgroundColor: RC.primary, borderRadius: 3 },
  taskStrip: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: RC.border },
  taskTitle: { fontSize: 13, fontWeight: '800', color: RC.text },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F3F7', marginTop: 6 },
  taskTxt: { flex: 1, fontSize: 12, color: RC.text },
  taskDue: { fontSize: 11, fontWeight: '700', color: RC.primary, marginLeft: 8 },
});
