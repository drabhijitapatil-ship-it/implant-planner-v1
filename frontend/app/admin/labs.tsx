import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import api from '../../utils/api';

const EMPTY = { name: '', email: '', contact_person: '', phone: '', notes: '' };

/** iter-Jun-2026: Lab directory (name + email) maintained by the Implant In-Charge for "Email lab". */
export default function LabDirectoryScreen() {
  const router = useRouter();
  const [labs, setLabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.get('/labs'); setLabs(r.data); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) { Alert.alert('Missing details', 'Lab name and email are required.'); return; }
    setSaving(true);
    try {
      if (editingId) await api.put(`/labs/${editingId}`, form); else await api.post('/labs', form);
      setForm(EMPTY); setEditingId(null); await load();
    } catch (e: any) { Alert.alert('Could not save', e?.response?.data?.detail || 'Please try again.'); }
    finally { setSaving(false); }
  };

  const remove = (lab: any) => {
    const go = async () => { await api.delete(`/labs/${lab.id}`); await load(); };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(`Remove ${lab.name}?`)) go(); return; }
    Alert.alert('Remove lab', `Remove ${lab.name} from the directory?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const FIELDS: { k: string; label: string; placeholder: string; keyboardType?: any }[] = [
    { k: 'name', label: 'Lab name *', placeholder: 'e.g. Precision Dental Lab' },
    { k: 'email', label: 'Email *', placeholder: 'orders@lab.com', keyboardType: 'email-address' },
    { k: 'contact_person', label: 'Contact person', placeholder: 'Technician name' },
    { k: 'phone', label: 'Phone', placeholder: '+91 …', keyboardType: 'phone-pad' },
    { k: 'notes', label: 'Notes', placeholder: 'Turnaround, courier, preferred file format…' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="lab-directory-back"><Ionicons name="arrow-back" size={22} color="#1A1A1A" /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Lab directory</Text>
          <Text style={s.subtitle}>Labs available in “Email lab” on the Lab Slip</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.card} testID="lab-form">
          <Text style={s.cardTitle}>{editingId ? 'Edit lab' : 'Add a lab'}</Text>
          {FIELDS.map((f) => (
            <View key={f.k} style={{ marginTop: 8 }}>
              <Text style={s.lbl}>{f.label}</Text>
              <TextInput
                style={s.input}
                value={form[f.k]}
                onChangeText={(t) => setForm((prev: any) => ({ ...prev, [f.k]: t }))}
                placeholder={f.placeholder}
                placeholderTextColor="#999"
                autoCapitalize={f.k === 'email' ? 'none' : 'words'}
                keyboardType={f.keyboardType}
                testID={`lab-form-${f.k}`}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {editingId ? <TouchableOpacity style={[s.btn, { backgroundColor: '#EEE' }]} onPress={() => { setEditingId(null); setForm(EMPTY); }}><Text style={[s.btnTxt, { color: '#555' }]}>Cancel</Text></TouchableOpacity> : null}
            <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={save} disabled={saving} testID="lab-form-save">
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnTxt}>{editingId ? 'Save changes' : 'Add lab'}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.section}>Labs ({labs.length})</Text>
        {loading ? <ActivityIndicator color="#1565C0" /> : labs.length === 0 ? (
          <View style={s.empty}><Ionicons name="business-outline" size={40} color="#CFD8DC" /><Text style={s.emptyTxt}>No labs yet — add your first lab above.</Text></View>
        ) : labs.map((lab) => (
          <View key={lab.id} style={s.labRow} testID={`lab-row-${lab.id}`}>
            <Ionicons name="business-outline" size={22} color="#1565C0" />
            <View style={{ flex: 1 }}>
              <Text style={s.labName}>{lab.name}</Text>
              <Text style={s.labMeta}>{lab.email}{lab.contact_person ? ` · ${lab.contact_person}` : ''}{lab.phone ? ` · ${lab.phone}` : ''}</Text>
              {lab.notes ? <Text style={s.labMeta}>{lab.notes}</Text> : null}
            </View>
            <TouchableOpacity style={s.iconBtn} onPress={() => { setEditingId(lab.id); setForm({ name: lab.name, email: lab.email, contact_person: lab.contact_person || '', phone: lab.phone || '', notes: lab.notes || '' }); }} testID={`lab-edit-${lab.id}`}><Ionicons name="create-outline" size={20} color="#1565C0" /></TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => remove(lab)} testID={`lab-remove-${lab.id}`}><Ionicons name="trash-outline" size={20} color="#C62828" /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 12, color: '#777', marginTop: 1 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#ECEFF1', marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  lbl: { fontSize: 11, fontWeight: '600', color: '#78909C', marginBottom: 4 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#D0DCE8', borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: '#222', backgroundColor: '#FAFAFA' },
  btn: { minHeight: 46, borderRadius: 10, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  section: { fontSize: 13, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  labRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ECEFF1' },
  labName: { fontSize: 14, fontWeight: '700', color: '#222' },
  labMeta: { fontSize: 12, color: '#777', marginTop: 2 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 32, gap: 8, backgroundColor: '#FFF', borderRadius: 12 },
  emptyTxt: { color: '#777', fontSize: 14 },
});
