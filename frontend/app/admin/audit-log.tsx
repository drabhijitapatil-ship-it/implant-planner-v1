import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert,
  RefreshControl, ScrollView, Modal, TextInput, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getToken } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { router } from 'expo-router';

/**
 * HIPAA compliance review screen — Implant In-Charge + Administrator only.
 * Lists every audit row (login / procedure_view / pdf_export / audit_export),
 * with filters for user, action, outcome, and date range, and a CSV export
 * that runs through the protected /api/admin/access-logs/export-csv endpoint.
 *
 * Screen is role-gated on mount: non-privileged users get bounced to Profile.
 */

const ACTIONS = ['login', 'procedure_view', 'pdf_export', 'audit_export'];
const OUTCOMES = ['success', 'failure', 'denied'];
const PAGE = 50;

type LogRow = {
  created_at: string;
  action: string;
  outcome: string;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  resource_type?: string;
  resource_id?: string;
  ip?: string;
  user_agent?: string;
  extra?: Record<string, any>;
};

type UserOption = { id: string; name: string; role: string };

export default function AuditLogScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);

  // Filters — applied via the gear icon modal
  const [fAction, setFAction] = useState<string>('');
  const [fOutcome, setFOutcome] = useState<string>('');
  const [fUserId, setFUserId] = useState<string>('');
  const [fStart, setFStart] = useState<string>(''); // YYYY-MM-DD
  const [fEnd, setFEnd] = useState<string>('');

  // Role gate — defensive, backend already enforces
  useEffect(() => {
    if (user && user.role !== 'implant_incharge' && user.role !== 'administrator') {
      Alert.alert('Access denied', 'Only Implant In-Charge or Administrator roles can view the audit log.');
      router.back();
    }
  }, [user]);

  const buildParams = useCallback((extra: Record<string, any> = {}) => {
    const p: Record<string, any> = { limit: PAGE, ...extra };
    if (fAction) p.action = fAction;
    if (fOutcome) p.outcome = fOutcome;
    if (fUserId) p.user_id = fUserId;
    if (fStart) p.start_date = `${fStart}T00:00:00Z`;
    if (fEnd) {
      // end_date is exclusive upper bound on backend → add a day so the picked
      // date is included in the result set.
      const d = new Date(fEnd + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      p.end_date = d.toISOString();
    }
    return p;
  }, [fAction, fOutcome, fUserId, fStart, fEnd]);

  const load = useCallback(async (reset: boolean) => {
    try {
      if (reset) setLoading(true);
      const params = buildParams({ skip: reset ? 0 : skip });
      const res = await api.get('/admin/access-logs', { params });
      const items: LogRow[] = res.data?.items || [];
      setTotal(res.data?.total || 0);
      setRows(prev => (reset ? items : [...prev, ...items]));
      setSkip(reset ? items.length : skip + items.length);
    } catch (err: any) {
      if (err?.response?.status !== 403) {
        Alert.alert('Load failed', err?.response?.data?.detail || 'Could not load audit log');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [buildParams, skip]);

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Load users for the filter dropdown (once)
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/users');
        const list: UserOption[] = (res.data || []).map((u: any) => ({ id: u.id || u._id, name: u.name, role: u.role }));
        setUsers(list);
      } catch {
        // Non-critical
      }
    })();
  }, []);

  const applyFilters = () => {
    setFilterOpen(false);
    setSkip(0);
    load(true);
  };

  const resetFilters = () => {
    setFAction(''); setFOutcome(''); setFUserId(''); setFStart(''); setFEnd('');
  };

  const loadMore = () => {
    if (loadingMore || loading || rows.length >= total) return;
    setLoadingMore(true);
    load(false);
  };

  const exportCsv = async () => {
    setExportBusy(true);
    try {
      const backendURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const qs = new URLSearchParams();
      if (fAction) qs.append('action', fAction);
      if (fOutcome) qs.append('outcome', fOutcome);
      if (fUserId) qs.append('user_id', fUserId);
      if (fStart) qs.append('start_date', `${fStart}T00:00:00Z`);
      if (fEnd) {
        const d = new Date(fEnd + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        qs.append('end_date', d.toISOString());
      }
      const url = `${backendURL}/api/admin/access-logs/export-csv?${qs.toString()}`;
      const token = (await getToken('access_token')) || '';

      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `access_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      } else {
        const dest = `${FileSystem.cacheDirectory}access_logs_${Date.now()}.csv`;
        const r = await FileSystem.downloadAsync(url, dest, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status !== 200) throw new Error('Export failed');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(r.uri, { mimeType: 'text/csv', dialogTitle: 'Save audit log CSV' });
        } else {
          await Share.share({ url: r.uri });
        }
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Could not export CSV');
    } finally {
      setExportBusy(false);
    }
  };

  const activeFilterCount = [fAction, fOutcome, fUserId, fStart, fEnd].filter(Boolean).length;

  const renderRow = ({ item }: { item: LogRow }) => {
    const d = new Date(item.created_at);
    const when = d.toLocaleString();
    const actionColor = item.outcome === 'failure' ? '#D32F2F' : item.outcome === 'denied' ? '#E65100' : '#2E7D32';
    const actionIcon: any = {
      login: 'log-in-outline',
      procedure_view: 'eye-outline',
      pdf_export: 'document-text-outline',
      audit_export: 'cloud-download-outline',
    }[item.action] || 'ellipse-outline';

    return (
      <View style={styles.row} testID={`audit-row-${item.action}`}>
        <View style={[styles.iconPill, { backgroundColor: actionColor + '1A' }]}>
          <Ionicons name={actionIcon} size={18} color={actionColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowAction}>{item.action.replace(/_/g, ' ')}</Text>
            <View style={[styles.outcomePill, { backgroundColor: actionColor + '22', borderColor: actionColor + '55' }]}>
              <Text style={[styles.outcomeText, { color: actionColor }]}>{item.outcome}</Text>
            </View>
          </View>
          <Text style={styles.rowSub}>
            {item.user_name || '—'}
            {item.user_role ? ` · ${item.user_role}` : ''}
          </Text>
          {item.resource_type ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {item.resource_type}
              {item.resource_id ? ` · ${item.resource_id.slice(-8)}` : ''}
              {item.extra?.patient_name ? ` · ${item.extra.patient_name}` : ''}
            </Text>
          ) : null}
          <Text style={styles.rowWhen}>
            {when}{item.ip ? ` · ${item.ip}` : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Audit Log</Text>
          <Text style={styles.subtitle}>
            {loading ? 'Loading…' : `${total.toLocaleString()} records · retained 180 days`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setFilterOpen(true)}
          testID="audit-filter-btn"
        >
          <Ionicons name="options-outline" size={22} color="#1565C0" />
          {activeFilterCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{activeFilterCount}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { marginLeft: 8 }]}
          onPress={exportCsv}
          disabled={exportBusy}
          testID="audit-export-btn"
        >
          {exportBusy ? <ActivityIndicator color="#1565C0" /> : <Ionicons name="cloud-download-outline" size={22} color="#1565C0" />}
        </TouchableOpacity>
      </View>

      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersBar}>
          <Ionicons name="funnel" size={14} color="#1565C0" />
          <Text style={styles.activeFiltersText}>
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
          </Text>
          <TouchableOpacity onPress={() => { resetFilters(); setSkip(0); load(true); }}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && rows.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="file-tray-outline" size={42} color="#B0BEC5" />
          <Text style={styles.emptyText}>No audit records match these filters.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it, idx) => `${it.created_at}-${idx}`}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 14 }} color="#1565C0" /> : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setSkip(0); load(true); }} />
          }
        />
      )}

      {/* Filter modal */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter audit log</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} testID="audit-filter-close">
                <Ionicons name="close" size={22} color="#607D8B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.fLabel}>Action</Text>
              <View style={styles.pillRow}>
                {ACTIONS.map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.pill, fAction === a && styles.pillActive]}
                    onPress={() => setFAction(fAction === a ? '' : a)}
                    testID={`audit-filter-action-${a}`}
                  >
                    <Text style={[styles.pillText, fAction === a && styles.pillTextActive]}>{a.replace(/_/g, ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fLabel}>Outcome</Text>
              <View style={styles.pillRow}>
                {OUTCOMES.map(o => (
                  <TouchableOpacity
                    key={o}
                    style={[styles.pill, fOutcome === o && styles.pillActive]}
                    onPress={() => setFOutcome(fOutcome === o ? '' : o)}
                    testID={`audit-filter-outcome-${o}`}
                  >
                    <Text style={[styles.pillText, fOutcome === o && styles.pillTextActive]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fLabel}>User</Text>
              <View style={styles.userList}>
                <TouchableOpacity
                  style={[styles.userRow, !fUserId && styles.userRowActive]}
                  onPress={() => setFUserId('')}
                >
                  <Text style={[styles.userRowText, !fUserId && styles.userRowTextActive]}>All users</Text>
                </TouchableOpacity>
                {users.map(u => (
                  <TouchableOpacity
                    key={u.id}
                    style={[styles.userRow, fUserId === u.id && styles.userRowActive]}
                    onPress={() => setFUserId(u.id)}
                    testID={`audit-filter-user-${u.id}`}
                  >
                    <Text style={[styles.userRowText, fUserId === u.id && styles.userRowTextActive]} numberOfLines={1}>
                      {u.name}
                      <Text style={styles.userRoleText}> · {u.role}</Text>
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fLabel}>Date range (YYYY-MM-DD)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={fStart}
                  onChangeText={setFStart}
                  placeholder="From"
                  placeholderTextColor="#B0BEC5"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="audit-filter-start"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={fEnd}
                  onChangeText={setFEnd}
                  placeholder="To"
                  placeholderTextColor="#B0BEC5"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="audit-filter-end"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalBtn, styles.btnNeutral]} onPress={() => { resetFilters(); }}>
                <Text style={styles.btnNeutralText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.btnPrimary]} onPress={applyFilters} testID="audit-filter-apply">
                <Text style={styles.btnPrimaryText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F8FC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E7EE' },
  title: { fontSize: 20, fontWeight: '800', color: '#0D47A1' },
  subtitle: { fontSize: 12, color: '#607D8B', marginTop: 2 },
  iconBtn: { padding: 10, borderRadius: 10, backgroundColor: '#E3F2FD' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#E65100', borderRadius: 999, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  activeFiltersBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E3F2FD' },
  activeFiltersText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#1565C0' },
  clearText: { fontSize: 12.5, fontWeight: '700', color: '#E65100' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  emptyText: { fontSize: 13, color: '#78909C', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8EEF5' },
  iconPill: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  rowAction: { fontSize: 13.5, fontWeight: '800', color: '#0D47A1', textTransform: 'capitalize', flex: 1 },
  outcomePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  outcomeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  rowSub: { fontSize: 12.5, color: '#37474F', fontWeight: '600' },
  rowMeta: { fontSize: 11.5, color: '#546E7A', marginTop: 2 },
  rowWhen: { fontSize: 11, color: '#90A4AE', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,71,161,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0D47A1' },
  fLabel: { fontSize: 12, fontWeight: '800', color: '#1565C0', marginTop: 12, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  pillActive: { borderColor: '#1565C0', backgroundColor: '#E3F2FD' },
  pillText: { fontSize: 12.5, fontWeight: '600', color: '#546E7A', textTransform: 'capitalize' },
  pillTextActive: { color: '#0D47A1' },
  userList: { borderWidth: 1, borderColor: '#E0E7EE', borderRadius: 10, maxHeight: 220, overflow: 'hidden' },
  userRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  userRowActive: { backgroundColor: '#E3F2FD' },
  userRowText: { fontSize: 13, color: '#37474F', fontWeight: '600' },
  userRowTextActive: { color: '#0D47A1' },
  userRoleText: { fontSize: 11, color: '#78909C', fontWeight: '500' },
  input: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', marginTop: 4 },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnNeutral: { backgroundColor: '#ECEFF1' },
  btnNeutralText: { fontSize: 14, fontWeight: '700', color: '#546E7A' },
  btnPrimary: { backgroundColor: '#1565C0' },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
