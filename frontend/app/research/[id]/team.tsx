/**
 * Research Module — team editor (S8): members + per-study roles.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../../utils/api';
import { RC, Card, Chip, Loading, PillSelect, PrimaryButton, ScreenHeader, MEMBER_ROLE_LABEL, errText, u } from '../../../components/research/ResearchUI';

type Member = { user_id: string; name: string; role: string; user_role?: string };

export default function TeamEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [piId, setPiId] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/research/studies/${id}`), api.get('/research/users')])
      .then(([s, us]) => { setMembers(s.data.members || []); setPiId(s.data.pi_user_id); setUsers(us.data); })
      .catch(e => Alert.alert('Error', errText(e)));
  }, [id]);

  const save = async () => {
    setSaving(true);
    try { await api.post(`/research/studies/${id}/members`, { members }); router.back(); }
    catch (e) { Alert.alert('Could not save', errText(e)); } finally { setSaving(false); }
  };

  if (!members) return <Loading />;
  const list = users.filter(x => !search || x.name.toLowerCase().includes(search.toLowerCase()));
  const roleOpts = Object.entries(MEMBER_ROLE_LABEL).filter(([k]) => k !== 'pi').map(([key, label]) => ({ key, label }));

  return (
    <SafeAreaView style={u.container} edges={['top']}>
      <ScreenHeader title="Study team" subtitle="Per-study roles on top of app roles" testID="team-title"
        right={<PrimaryButton label="Save" onPress={save} loading={saving} testID="save-team" style={{ paddingVertical: 8, minHeight: 36 }} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {members.map((m, i) => (
          <Card key={`${m.user_id}-${i}`}>
            <View style={u.row}>
              <View style={{ flex: 1 }}>
                <Text style={u.strong}>{m.name}</Text>
                <Text style={u.kv}>{m.user_role ? m.user_role.replace('_', ' ') : ''}</Text>
              </View>
              {m.user_id === piId && m.role === 'pi' ? <Chip label="PI" color={RC.primary} bg={RC.primarySoft} /> : (
                <TouchableOpacity onPress={() => setMembers(ms => ms!.filter((_, j) => j !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`member-${i}-remove`}>
                  <Ionicons name="close-circle" size={22} color={RC.red} />
                </TouchableOpacity>
              )}
            </View>
            {!(m.user_id === piId && m.role === 'pi') && (
              <View style={{ marginTop: 10 }}>
                <PillSelect value={m.role} onChange={r => setMembers(ms => ms!.map((x, j) => (j === i ? { ...x, role: r } : x)))} options={roleOpts} testID={`member-${i}-role`} />
              </View>
            )}
          </Card>
        ))}
        <View style={{ marginHorizontal: 14, marginTop: 14 }}>
          <PrimaryButton label="Add member" icon="person-add-outline" variant="outline" onPress={() => { setSearch(''); setPicking(true); }} testID="add-member" />
        </View>
        <Text style={s.help}>Guide: approves dissertation protocols, may export. Co-investigator / data collector: screen, enrol, enter data. Statistician: export only. Nurses cannot be added.</Text>
      </ScrollView>

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={u.container}>
          <ScreenHeader title="Add member" onBack={() => setPicking(false)} />
          <View style={{ padding: 12 }}><TextInput value={search} onChangeText={setSearch} placeholder="Search users…" placeholderTextColor={RC.muted} style={u.input} autoFocus testID="member-search" /></View>
          <FlatList data={list} keyExtractor={x => x.id} renderItem={({ item }) => (
            <TouchableOpacity style={s.userRow} testID={`pick-user-${item.id}`} onPress={() => {
              setMembers(ms => [...ms!, { user_id: item.id, name: item.name, user_role: item.role, role: item.role === 'supervisor' ? 'guide' : 'data_collector' }]);
              setPicking(false);
            }}>
              <View style={{ flex: 1 }}><Text style={u.strong}>{item.name}</Text><Text style={u.kv}>{item.role.replace('_', ' ')}</Text></View>
              <Ionicons name="add-circle-outline" size={22} color={RC.primary} />
            </TouchableOpacity>
          )} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  help: { marginHorizontal: 14, marginTop: 14, fontSize: 11, color: RC.sub, lineHeight: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F3F7', backgroundColor: '#FFF', minHeight: 56 },
});
