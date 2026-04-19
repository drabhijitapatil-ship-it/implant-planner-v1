import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, format } from 'date-fns';
import api from '../utils/api';

type ActivityEntry = {
  procedure_id: string;
  patient_name?: string;
  patient_id?: string;
  implant_procedure_type?: string;
  field: string;
  old_value: any;
  new_value: any;
  edited_by: string;
  edited_by_role?: string;
  edited_at: string;
};

function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ') || '—';
  if (typeof v === 'object') return '(updated)';
  return String(v);
}

function prettyField(field: string): string {
  return field
    .replace(/^phase2_data\./, 'Phase 2 · ')
    .replace(/^phase3_data\./, 'Phase 3 · ')
    .replace(/^phase4_step1_data\./, 'Phase 4 · ')
    .replace(/^medical_assessment\./, 'Medical · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RecentActivityWidget({ router, limit = 5 }: { router: any; limit?: number }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActivityEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/procedures/recent-activity?limit=${limit}`);
      // Hide bulk "wrote whole dict" entries — only show granular ones
      const filtered = (res.data.activities || []).filter(
        (a: ActivityEntry) => typeof a.new_value !== 'object' || a.new_value === null,
      );
      setItems(filtered.slice(0, limit));
    } catch (e) {
      // Silently hide widget on auth/permission errors
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.section} data-testid="recent-activity-widget">
      <View style={styles.header}>
        <Ionicons name="pulse" size={16} color="#1565C0" />
        <Text style={styles.title}>Recent Activity</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={load} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} data-testid="recent-activity-refresh">
          <Ionicons name="refresh" size={16} color="#78909C" />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="small" color="#1565C0" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={28} color="#CFD8DC" />
            <Text style={styles.emptyText}>No recent edits yet.</Text>
            <Text style={styles.emptySubtext}>When you or your team edit any case, recent changes will appear here.</Text>
          </View>
        ) : (
          items.map((a, idx) => {
            const who = a.edited_by;
            const roleShort = a.edited_by_role === 'implant_incharge' ? 'In-Charge'
              : a.edited_by_role === 'supervisor' ? 'Supervisor'
              : a.edited_by_role === 'student' ? 'Student' : '';
            let when = '';
            try { when = formatDistanceToNow(new Date(a.edited_at), { addSuffix: true }); }
            catch { when = format(new Date(a.edited_at), 'MMM dd, hh:mm a'); }
            const patient = a.patient_name || a.patient_id || 'Case';
            return (
              <TouchableOpacity
                key={`${a.procedure_id}-${idx}`}
                style={[styles.row, idx === items.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/procedures/${a.procedure_id}`)}
                activeOpacity={0.7}
                data-testid={`recent-activity-row-${idx}`}
              >
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {prettyField(a.field)}
                    <Text style={styles.rowPatient}>  ·  {patient}</Text>
                  </Text>
                  <View style={styles.diffRow}>
                    <Text style={styles.oldVal} numberOfLines={1}>{fmt(a.old_value)}</Text>
                    <Ionicons name="arrow-forward" size={10} color="#546E7A" />
                    <Text style={styles.newVal} numberOfLines={1}>{fmt(a.new_value)}</Text>
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {who}{roleShort ? ` · ${roleShort}` : ''}  ·  {when}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B0BEC5" />
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#37474F' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyState: { alignItems: 'center', paddingVertical: 22, gap: 4 },
  emptyText: { fontSize: 13, color: '#78909C', fontWeight: '600', marginTop: 4 },
  emptySubtext: { fontSize: 11, color: '#B0BEC5', textAlign: 'center', paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1565C0', marginTop: 4 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#0D47A1' },
  rowPatient: { fontSize: 12, fontWeight: '500', color: '#78909C' },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  oldVal: { fontSize: 11, color: '#B0BEC5', textDecorationLine: 'line-through', maxWidth: '42%' },
  newVal: { fontSize: 11, color: '#2E7D32', fontWeight: '600', maxWidth: '42%' },
  rowMeta: { fontSize: 10, color: '#90A4AE', marginTop: 2 },
});
