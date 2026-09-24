import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import api from '../utils/api';

/**
 * iter-Jun-2026: Dashboard strip for Postgraduate Students — "Assisting soon".
 * Lists cases where the signed-in user is the named assistant and the
 * procedure is scheduled today or within the next 7 days. Auto-hides when
 * empty. Tapping a row opens the read-only case view.
 */
export default function AssistingTodayStrip() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const res = await api.get('/procedures', { params: { scope: 'assisted' } });
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const horizon = new Date(today); horizon.setDate(horizon.getDate() + 7);
          const upcoming = (Array.isArray(res.data) ? res.data : [])
            .filter((p: any) => {
              if (!p.procedure_date || p.status === 'completed' || String(p.status).startsWith('rejected')) return false;
              const d = new Date(`${p.procedure_date}T00:00:00`);
              return !isNaN(d.getTime()) && d >= today && d <= horizon;
            })
            .sort((a: any, b: any) => String(a.procedure_date).localeCompare(String(b.procedure_date)));
          if (alive) setItems(upcoming);
        } catch {
          if (alive) setItems([]);
        }
      })();
      return () => { alive = false; };
    }, [])
  );

  if (items.length === 0) return null;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <View style={styles.wrap} testID="assisting-strip" data-testid="assisting-strip">
      <View style={styles.header}>
        <Ionicons name="people" size={18} color="#4527A0" />
        <Text style={styles.title}>Assisting soon</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/procedures?filter=assisted')} testID="assisting-see-all">
          <Text style={styles.link}>See all</Text>
        </TouchableOpacity>
      </View>
      {items.slice(0, 3).map((p) => {
        const isToday = p.procedure_date === todayStr;
        return (
          <TouchableOpacity
            key={p.id}
            style={styles.row}
            onPress={() => router.push(`/procedures/${p.id}`)}
            testID={`assisting-row-${p.id}`}
            data-testid={`assisting-row-${p.id}`}
          >
            <View style={[styles.dateChip, isToday && styles.dateChipToday]}>
              <Text style={[styles.dateTxt, isToday && { color: '#FFF' }]}>
                {isToday ? 'Today' : format(new Date(`${p.procedure_date}T00:00:00`), 'EEE d MMM')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patient} numberOfLines={1}>{p.patient_name}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {p.procedure_time || '—'} · {p.implant_procedure_type || 'Implant case'} · with {p.student_name || p.created_by_name || 'colleague'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14,
    backgroundColor: '#EDE7F6', borderWidth: 1, borderColor: '#D1C4E9',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#4527A0' },
  link: { fontSize: 13, fontWeight: '600', color: '#5E35B1' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginTop: 6, minHeight: 52,
  },
  dateChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F3E5F5', minWidth: 62, alignItems: 'center' },
  dateChipToday: { backgroundColor: '#5E35B1' },
  dateTxt: { fontSize: 11, fontWeight: '700', color: '#4527A0' },
  patient: { fontSize: 14, fontWeight: '600', color: '#222' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
});
