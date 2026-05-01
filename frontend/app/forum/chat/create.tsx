import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert, Modal, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../../../utils/api';

interface UserItem { id: string; name: string; role: string; profile_photo?: string; }

export default function CreateGroupScreen() {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selected, setSelected] = useState<Record<string, UserItem>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await api.get('/chat/users', { params: pickerQ ? { q: pickerQ } : {} }); setUsers(r.data?.items || []); } catch {}
    })();
  }, [pickerQ]);

  const toggle = (u: UserItem) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  /**
   * Bulk-select helpers for the quick-filter chip row.
   * `addAllByRole` merges users of a given role into the current selection
   * (idempotent — re-tapping is a no-op). `clearAll` wipes every picked user.
   */
  const addAllByRole = (role: string) => {
    setSelected(prev => {
      const next = { ...prev };
      for (const u of users) {
        if (u.role === role) next[u.id] = u;
      }
      return next;
    });
  };
  const clearAll = () => setSelected({});

  const create = async () => {
    if (!name.trim()) { Alert.alert('Group name required'); return; }
    setBusy(true);
    try {
      const res = await api.post('/chat/groups', {
        name: name.trim(), description: desc.trim() || null,
        type: isPublic ? 'public' : 'private',
        member_ids: Object.keys(selected),
      });
      const gid = res.data?.id;
      if (gid) router.replace(`/forum/chat/${gid}` as any);
    } catch (e: any) {
      Alert.alert('Failed to create group', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{top:12,bottom:12,left:12,right:12}}>
          <Ionicons name="close" size={26} color="#37474F" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Group</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={s.photoRow}>
          <TouchableOpacity style={s.photoCircle}>
            <Ionicons name="camera" size={28} color="#78909C" />
          </TouchableOpacity>
          <Text style={s.photoHelp}>Add group photo (optional)</Text>
        </View>

        <Text style={s.label}>Group Name *</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Enter group name" maxLength={80} testID="group-name-input" accessibilityLabel="group-name-input" /* @ts-ignore */ data-testid="group-name-input" />

        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Group Type: {isPublic ? 'Public' : 'Private'}</Text>
            <Text style={s.toggleHelp}>{isPublic ? 'Anyone can find and join this group' : 'Only invited members can join'}</Text>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ false: '#CFD8DC', true: '#90CAF9' }} thumbColor={isPublic ? '#1565C0' : '#ECEFF1'} />
        </View>

        <Text style={s.label}>Group Description</Text>
        <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} placeholder="What's this group about?" maxLength={300} multiline />

        <TouchableOpacity style={s.addMembersBtn} onPress={() => setShowPicker(true)} testID="add-members-btn" accessibilityLabel="add-members-btn" /* @ts-ignore */ data-testid="add-members-btn">
          <Ionicons name="person-add" size={18} color="#1565C0" />
          <Text style={s.addMembersTxt}>Add Members {Object.keys(selected).length > 0 ? `(${Object.keys(selected).length})` : ''}</Text>
          <Ionicons name="chevron-forward" size={18} color="#90A4AE" />
        </TouchableOpacity>
        {Object.values(selected).length > 0 && (
          <View style={s.selectedRow}>
            {Object.values(selected).map(u => (
              <View key={u.id} style={s.selChip}>
                <Text style={s.selChipTxt}>{u.name}</Text>
                <TouchableOpacity onPress={() => toggle(u)}><Ionicons name="close" size={14} color="#546E7A" /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={s.footerWrap}>
        <TouchableOpacity style={[s.createBtn, (!name.trim() || busy) && { opacity: 0.5 }]} onPress={create} disabled={!name.trim() || busy} testID="create-group-submit" accessibilityLabel="create-group-submit" /* @ts-ignore */ data-testid="create-group-submit">
          {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.createBtnTxt}>Create Group</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={showPicker} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }} edges={['top', 'bottom']}>
          <View style={s.pickerHeader}>
            <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={{top:16,bottom:16,left:16,right:16}} testID="member-modal-close" accessibilityLabel="member-modal-close" /* @ts-ignore */ data-testid="member-modal-close">
              <Ionicons name="close" size={26} color="#37474F" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Add Members</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={{top:16,bottom:16,left:16,right:16}} testID="member-modal-done" accessibilityLabel="member-modal-done" /* @ts-ignore */ data-testid="member-modal-done">
              <Text style={{ color: '#1565C0', fontWeight: '700', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={s.searchBar}>
            <Ionicons name="search" size={18} color="#90A4AE" />
            <TextInput style={{ flex: 1, fontSize: 14, outlineWidth: 0 as any }} placeholder="Search users..." value={pickerQ} onChangeText={setPickerQ} />
          </View>
          {/* Quick-filter chip row: one tap to select every user of a given role.
              Counts reflect the fetched user list (respects current search query). */}
          <View style={s.chipRow}>
            {(() => {
              const c = users.reduce<Record<string, number>>((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});
              const chips: { key: string; label: string; role?: string; count?: number }[] = [];
              if (c.supervisor) chips.push({ key: 'sup', label: 'All Supervisors', role: 'supervisor', count: c.supervisor });
              if (c.student) chips.push({ key: 'stu', label: 'All Students', role: 'student', count: c.student });
              if (c.implant_incharge) chips.push({ key: 'inc', label: 'All In-Charges', role: 'implant_incharge', count: c.implant_incharge });
              return (
                <>
                  {chips.map(ch => (
                    <TouchableOpacity
                      key={ch.key}
                      style={s.chip}
                      onPress={() => addAllByRole(ch.role!)}
                      testID={`quickfilter-${ch.role}`}
                      accessibilityLabel={`quickfilter-${ch.role}`}
                      // @ts-ignore
                      data-testid={`quickfilter-${ch.role}`}
                    >
                      <Ionicons name="people" size={14} color="#1565C0" />
                      <Text style={s.chipTxt}>{ch.label}</Text>
                      <View style={s.chipCount}><Text style={s.chipCountTxt}>{ch.count}</Text></View>
                    </TouchableOpacity>
                  ))}
                  {Object.keys(selected).length > 0 && (
                    <TouchableOpacity
                      style={[s.chip, s.chipClear]}
                      onPress={clearAll}
                      testID="quickfilter-clear"
                      accessibilityLabel="quickfilter-clear"
                      // @ts-ignore
                      data-testid="quickfilter-clear"
                    >
                      <Ionicons name="close-circle" size={14} color="#B71C1C" />
                      <Text style={s.chipClearTxt}>Clear all</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => {
              const on = !!selected[item.id];
              return (
                <TouchableOpacity style={s.userRow} onPress={() => toggle(item)}>
                  <View style={s.userAvatar}><Text style={s.userAvatarTxt}>{item.name?.[0]?.toUpperCase() || '?'}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.userName}>{item.name}</Text>
                    <Text style={s.userRole}>{item.role}</Text>
                  </View>
                  <View style={[s.checkBox, on && s.checkBoxOn]}>{on && <Ionicons name="checkmark" size={16} color="#FFF" />}</View>
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  // Picker modal header — extra top padding so the close/Done row sits visibly
  // below the device status bar / notch on iOS and avoids the compressed look
  // that made the ✕ unreachable on some devices.
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1', minHeight: 56 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  photoRow: { alignItems: 'center', marginBottom: 20 },
  photoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CFD8DC', borderStyle: 'dashed' },
  photoHelp: { fontSize: 12, color: '#78909C', marginTop: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#37474F', marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#37474F', marginBottom: 14, outlineWidth: 0 as any },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', marginBottom: 14 },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  toggleHelp: { fontSize: 12, color: '#78909C', marginTop: 2 },
  addMembersBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F2FD', padding: 14, borderRadius: 10, marginTop: 6 },
  addMembersTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1565C0' },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  selChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECEFF1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  selChipTxt: { fontSize: 12, color: '#37474F' },
  footerWrap: { padding: 14, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  createBtn: { backgroundColor: '#1565C0', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  createBtnTxt: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, backgroundColor: '#F5F5F5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#BBDEFB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  chipTxt: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  chipCount: { backgroundColor: '#1565C0', minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chipCountTxt: { fontSize: 10, color: '#FFF', fontWeight: '700' },
  chipClear: { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' },
  chipClearTxt: { fontSize: 12, fontWeight: '700', color: '#B71C1C' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  userAvatarTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  userName: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  userRole: { fontSize: 12, color: '#78909C' },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B0BEC5', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
});
