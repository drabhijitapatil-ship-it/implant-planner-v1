import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import api from '../utils/api';

type ConsentCase = {
  id: string;
  patient_name: string;
  patient_id: string;
  student_name: string;
  implant_procedure_type: string;
  status: string;
  procedure_date: string;
  procedure_time: string;
  consent_uploaded: boolean;
};

type NurseFilter = 'pending' | 'completed' | 'all';

/** Format "10:00" / "14:00" / "10:00 AM" → "10:00 AM" / "2:00 PM". */
function fmtTime(t: string): string {
  if (!t) return '';
  if (/am|pm/i.test(t)) return t.toUpperCase().replace(/\s+/g, ' ');
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = parseInt(m[1], 10);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

export default function NurseCasesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ nurseFilter?: string }>();
  const initialFilter: NurseFilter =
    params.nurseFilter === 'completed' || params.nurseFilter === 'all' ? (params.nurseFilter as NurseFilter) : 'pending';

  const [filter, setFilter] = useState<NurseFilter>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [cases, setCases] = useState<ConsentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procedures/nurse/consent-cases');
      setCases(res.data.cases || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep in sync when nurseFilter query param changes (e.g. navigated from Home tile).
  useEffect(() => {
    if (
      params.nurseFilter === 'pending' ||
      params.nurseFilter === 'completed' ||
      params.nurseFilter === 'all'
    ) {
      setFilter(params.nurseFilter as NurseFilter);
    }
  }, [params.nurseFilter]);

  const filtered = useMemo(() => {
    const base =
      filter === 'pending'
        ? cases.filter((c) => !c.consent_uploaded)
        : filter === 'completed'
          ? cases.filter((c) => c.consent_uploaded)
          : cases;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      (c.patient_name || '').toLowerCase().includes(q) ||
      (c.student_name || '').toLowerCase().includes(q) ||
      (c.implant_procedure_type || '').toLowerCase().includes(q) ||
      (c.patient_id || '').toLowerCase().includes(q),
    );
  }, [cases, filter, searchQuery]);

  const counts = useMemo(
    () => ({
      pending: cases.filter((c) => !c.consent_uploaded).length,
      completed: cases.filter((c) => c.consent_uploaded).length,
      all: cases.length,
    }),
    [cases],
  );

  const renderCard = ({ item }: { item: ConsentCase }) => {
    const uploaded = item.consent_uploaded;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/procedures/${item.id}`)}
        activeOpacity={0.85}
        testID={`nurse-case-card-${item.id}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.patientName} numberOfLines={1}>{item.patient_name || 'Patient'}</Text>
          {item.implant_procedure_type ? (
            <Text style={styles.meta} numberOfLines={1}>{item.implant_procedure_type}</Text>
          ) : null}
          <Text style={styles.metaStudent} numberOfLines={1}>
            <Ionicons name="person-outline" size={10} color="#546E7A" /> {item.student_name || 'Operator'}
          </Text>
          {item.procedure_date ? (
            <Text style={styles.metaDate} numberOfLines={1}>
              <Ionicons name="calendar-outline" size={10} color="#1565C0" />{' '}
              {format(new Date(item.procedure_date), 'EEE, MMM dd')}
              {item.procedure_time ? ` · ${fmtTime(item.procedure_time)}` : ''}
            </Text>
          ) : null}
          <View style={[styles.pill, uploaded ? styles.pillOk : styles.pillWarn]}>
            <Ionicons
              name={uploaded ? 'checkmark-circle' : 'alert-circle'}
              size={12}
              color="#FFF"
            />
            <Text style={styles.pillText}>
              {uploaded ? 'Consent form uploaded' : 'Consent form pending'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#B0BEC5" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cases</Text>
      </View>

      {/* Filter chips */}
      <View style={styles.chipsRow}>
        {(['pending', 'completed', 'all'] as NurseFilter[]).map((key) => {
          const active = filter === key;
          const label = key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1);
          return (
            <TouchableOpacity
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(key)}
              activeOpacity={0.8}
              testID={`nurse-filter-${key}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {label}
                <Text style={[styles.chipCount, active && styles.chipCountActive]}> ({counts[key]})</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#90A4AE" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient / student / procedure"
          placeholderTextColor="#90A4AE"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="nurse-search-input"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="close-circle" size={18} color="#90A4AE" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#1565C0" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={36} color="#B0BEC5" />
              <Text style={styles.emptyText}>
                {filter === 'pending'
                  ? 'No cases pending consent upload'
                  : filter === 'completed'
                    ? 'No cases with uploaded consent yet'
                    : 'No cases found'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0D47A1' },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#455A64' },
  chipTextActive: { color: '#FFF' },
  chipCount: { fontSize: 11, fontWeight: '600', color: '#90A4AE' },
  chipCountActive: { color: '#FFF' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7EC',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#263238',
    paddingVertical: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  patientName: { fontSize: 15, fontWeight: '700', color: '#0D47A1' },
  meta: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  metaStudent: { fontSize: 11, color: '#546E7A', marginTop: 2 },
  metaDate: { fontSize: 11, color: '#1565C0', marginTop: 2, fontWeight: '600' },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  pillOk: { backgroundColor: '#2E7D32' },
  pillWarn: { backgroundColor: '#C62828' },
  pillText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 13, color: '#78909C' },
});
