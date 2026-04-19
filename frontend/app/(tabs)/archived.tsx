import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

export default function ArchivedScreen() {
  const { user } = useAuth();
  const [procedures, setProcedures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useFocusEffect(useCallback(() => {
    loadArchived();
  }, []));

  const loadArchived = async () => {
    setLoading(true);
    try {
      const res = await api.get('/procedures/archived');
      setProcedures(res.data);
    } catch { } finally { setLoading(false); }
  };

  const handleUnarchive = async (id: string) => {
    Alert.alert('Unarchive', 'Move this case back to active cases?', [
      { text: 'Cancel' },
      { text: 'Unarchive', onPress: async () => {
        try {
          await api.post(`/procedures/${id}/unarchive`);
          setProcedures(prev => prev.filter(p => (p.id || p._id) !== id));
          Alert.alert('Done', 'Case has been unarchived');
        } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }}
    ]);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete', 'Permanently delete this case? This cannot be undone.', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/procedures/${id}`);
          setProcedures(prev => prev.filter(p => (p.id || p._id) !== id));
          Alert.alert('Done', 'Case deleted');
        } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }}
    ]);
  };

  const filtered = procedures.filter(p => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (p.patient_name || '').toLowerCase().includes(s) || (p.registration_number || '').toLowerCase().includes(s);
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={s.card} data-testid={`archived-card-${item.id}`}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.patientName}>{item.patient_name}</Text>
          <Text style={s.regNum}>#{item.registration_number}</Text>
        </View>
        <View style={s.badge}>
          <Text style={s.badgeText}>Archived</Text>
        </View>
      </View>
      <View style={s.cardInfo}>
        {item.student_name ? <Text style={s.infoText}>Student: {item.student_name}</Text> : null}
        {item.supervisor_name ? <Text style={s.infoText}>Supervisor: {item.supervisor_name}</Text> : null}
        <Text style={s.infoText}>Status: {(item.status || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
      </View>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => handleUnarchive(item.id || item._id)} data-testid={`unarchive-btn-${item.id}`}>
          <Ionicons name="arrow-undo-outline" size={18} color="#1565C0" />
          <Text style={s.actionText}>Unarchive</Text>
        </TouchableOpacity>
        {user?.role === 'implant_incharge' && (
          <TouchableOpacity style={[s.actionBtn, { borderColor: '#F44336' }]} onPress={() => handleDelete(item.id || item._id)} data-testid={`delete-archived-btn-${item.id}`}>
            <Ionicons name="trash-outline" size={18} color="#F44336" />
            <Text style={[s.actionText, { color: '#F44336' }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <TextInput
        style={s.searchBar}
        placeholder="Search archived cases..."
        placeholderTextColor="#999"
        value={search}
        onChangeText={setSearch}
        data-testid="archived-search-input"
      />
      {loading ? (
        <ActivityIndicator size="large" color="#1A73E8" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="archive-outline" size={48} color="#CCC" />
          <Text style={s.emptyText}>No archived cases</Text>
        </View>
      ) : (
        <FlatList data={filtered} renderItem={renderItem} keyExtractor={item => item.id || item._id || Math.random().toString()} contentContainerStyle={{ padding: 16 }} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  searchBar: { backgroundColor: '#FFF', margin: 16, marginBottom: 0, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#E0E7EE' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E7EE' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  patientName: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  regNum: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { backgroundColor: '#78909C', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  cardInfo: { marginBottom: 10 },
  infoText: { fontSize: 13, color: '#666', marginBottom: 2 },
  cardActions: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#F0F4F8', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: '#999', marginTop: 10 },
});
