/**
 * Case-details Staff row for Supervisor / Implant In-Charge with a "Change"
 * dropdown of everyone eligible in the organization (same list as the New
 * Case form). Saves through PATCH /procedures/{id}/staff.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type Slot = 'supervisor_id' | 'implant_incharge_id';

// Clinic orgs store their own role names; map them like the backend does.
const ROLE_MAP: Record<string, string> = { chief_dentist: 'implant_incharge', dentist: 'supervisor' };
const ELIGIBLE: Record<Slot, string[]> = {
  supervisor_id: ['supervisor', 'implant_incharge'],
  implant_incharge_id: ['implant_incharge'],
};

export default function StaffPickerRow({
  procedureId, slot, label, icon, name, currentId, canChange, onChanged,
}: {
  procedureId: string;
  slot: Slot;
  label: string;
  icon: string;
  name?: string | null;
  currentId?: string | null;
  canChange: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && people === null) {
      try {
        const res = await api.get('/users');
        const all = Array.isArray(res.data) ? res.data : res.data?.users || [];
        setPeople(
          all
            .filter((u: any) => !u.disabled && ELIGIBLE[slot].includes(ROLE_MAP[u.role] || u.role))
            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')),
        );
      } catch {
        setPeople([]);
      }
    }
  };

  const pick = async (u: any) => {
    const uid = u._id || u.id;
    if (uid === currentId) { setOpen(false); return; }
    setSaving(true);
    try {
      await api.patch(`/procedures/${procedureId}/staff`, { [slot]: uid });
      setOpen(false);
      onChanged();
    } catch (e: any) {
      Alert.alert('Could not change', e.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.row}>
        <Ionicons name={icon as any} size={20} color="#666" />
        <View style={styles.content}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{name || 'Not assigned'}</Text>
        </View>
        {canChange && (
          <TouchableOpacity onPress={toggle} style={styles.changeBtn} testID={`staff-change-${slot}`}>
            {saving ? <ActivityIndicator size="small" color="#1565C0" /> : (
              <>
                <Text style={styles.changeTxt}>Change</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#1565C0" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
      {open && (
        <View style={styles.list}>
          {people === null ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color="#1565C0" />
          ) : people.length === 0 ? (
            <Text style={styles.empty}>No eligible staff found.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {people.map((u) => {
                const uid = u._id || u.id;
                const selected = uid === currentId;
                return (
                  <TouchableOpacity key={uid} style={[styles.item, selected && styles.itemSel]} onPress={() => pick(u)} disabled={saving}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, selected && { color: '#1565C0' }]}>{u.name}</Text>
                      {!!u.email && <Text style={styles.itemSub}>{u.email}</Text>}
                    </View>
                    {selected && <Ionicons name="checkmark" size={18} color="#1565C0" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  content: { marginLeft: 12, flex: 1 },
  label: { fontSize: 12, color: '#1565C0', marginBottom: 4, fontWeight: '500', letterSpacing: 0.2 },
  value: { fontSize: 14, color: '#1A1A2E', fontWeight: '500' },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#E3F2FD' },
  changeTxt: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  list: { borderWidth: 1, borderColor: '#E3EAF2', borderRadius: 10, marginTop: 6, marginBottom: 8, backgroundColor: '#FAFBFD' },
  empty: { padding: 12, fontSize: 12, color: '#78909C' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  itemSel: { backgroundColor: '#E3F2FD' },
  itemName: { fontSize: 14, color: '#263238', fontWeight: '600' },
  itemSub: { fontSize: 11, color: '#78909C', marginTop: 1 },
});
