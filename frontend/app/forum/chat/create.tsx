import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert, Modal, Pressable, FlatList, Image, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import api, { getToken } from '../../../utils/api';
import { BACKEND_URL } from '../../../utils/config';

interface UserItem { id: string; name: string; role: string; profile_photo?: string; }

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selected, setSelected] = useState<Record<string, UserItem>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [busy, setBusy] = useState(false);
  // Photo upload state — `photoUrl` holds the relative server URL returned from
  // /api/chat/upload, `photoPreview` is the full signed URL for the <Image>.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const pickingInProgressRef = useRef(false);
  const waitForSheetClose = () => new Promise<void>(resolve => setTimeout(resolve, 500));

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

  const compressImg = async (uri: string) => {
    try {
      const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 800 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
      return r.uri;
    } catch { return uri; }
  };

  const uploadPhoto = async (uri: string, filename: string, mime: string) => {
    setPhotoUploading(true);
    try {
      const compressed = await compressImg(uri);
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await fetch(compressed).then(r => r.blob());
        form.append('file', blob, filename);
      } else {
        form.append('file', { uri: compressed, name: filename, type: mime } as any);
      }
      const up = await api.post('/chat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = up.data?.url;
      if (url) {
        setPhotoUrl(url);
        const t = await getToken('access_token');
        setPhotoPreview(`${BACKEND_URL}${url}${t ? `?token=${t}` : ''}`);
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setPhotoUploading(false);
    }
  };

  const pickPhotoFromCamera = async () => {
    if (pickingInProgressRef.current) return;
    pickingInProgressRef.current = true;
    setShowPhotoSheet(false);
    await waitForSheetClose();
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled) return;
      const a = res.assets?.[0]; if (!a) return;
      await uploadPhoto(a.uri, a.fileName || `photo_${Date.now()}.jpg`, 'image/jpeg');
    } catch (e: any) {
      console.error(e); Alert.alert('Camera failed', e?.message);
    } finally { pickingInProgressRef.current = false; }
  };

  const pickPhotoFromLibrary = async () => {
    if (pickingInProgressRef.current) return;
    pickingInProgressRef.current = true;
    setShowPhotoSheet(false);
    await waitForSheetClose();
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed'); return; }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled) return;
      const a = res.assets?.[0]; if (!a) return;
      await uploadPhoto(a.uri, a.fileName || `photo_${Date.now()}.jpg`, 'image/jpeg');
    } catch (e: any) {
      console.error(e); Alert.alert('Library failed', e?.message);
    } finally { pickingInProgressRef.current = false; }
  };

  const pickPhotoFromFiles = async () => {
    if (pickingInProgressRef.current) return;
    pickingInProgressRef.current = true;
    setShowPhotoSheet(false);
    await waitForSheetClose();
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['image/*'], multiple: false, copyToCacheDirectory: true });
      if (res.canceled) return;
      const a = res.assets?.[0]; if (!a) return;
      await uploadPhoto(a.uri, a.name || `photo_${Date.now()}.jpg`, 'image/jpeg');
    } catch (e: any) {
      console.error(e);
      const raw = e?.message || '';
      const friendly = raw.includes('Different document picking')
        ? 'A previous picker is still releasing. Please tap again in a moment.'
        : (raw || 'Unknown error');
      Alert.alert('File pick failed', friendly);
    } finally { pickingInProgressRef.current = false; }
  };

  const create = async () => {
    if (!name.trim()) { Alert.alert('Group name required'); return; }
    setBusy(true);
    try {
      const res = await api.post('/chat/groups', {
        name: name.trim(), description: desc.trim() || null,
        type: isPublic ? 'public' : 'private',
        member_ids: Object.keys(selected),
        photo_url: photoUrl || null,
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
          <TouchableOpacity
            style={s.photoCircle}
            onPress={() => setShowPhotoSheet(true)}
            disabled={photoUploading}
            testID="group-photo-btn"
            accessibilityLabel="group-photo-btn"
            // @ts-ignore
            data-testid="group-photo-btn"
          >
            {photoUploading ? (
              <ActivityIndicator size="small" color="#1565C0" />
            ) : photoPreview ? (
              <Image source={{ uri: photoPreview }} style={s.photoImage} />
            ) : (
              <Ionicons name="camera" size={28} color="#78909C" />
            )}
          </TouchableOpacity>
          <Text style={s.photoHelp}>{photoPreview ? 'Tap to change photo' : 'Add group photo (optional)'}</Text>
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

      {/* Photo source action sheet — same 3-option pattern as Discussion Forum */}
      <Modal visible={showPhotoSheet} transparent animationType="fade" onRequestClose={() => setShowPhotoSheet(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowPhotoSheet(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Add group photo</Text>
            <TouchableOpacity style={s.sheetOption} onPress={pickPhotoFromCamera} testID="photo-camera-btn" /* @ts-ignore */ data-testid="photo-camera-btn">
              <Ionicons name="camera" size={22} color="#1565C0" />
              <Text style={s.sheetOptionTxt}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetOption} onPress={pickPhotoFromLibrary} testID="photo-library-btn" /* @ts-ignore */ data-testid="photo-library-btn">
              <Ionicons name="images" size={22} color="#1565C0" />
              <Text style={s.sheetOptionTxt}>Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetOption} onPress={pickPhotoFromFiles} testID="photo-files-btn" /* @ts-ignore */ data-testid="photo-files-btn">
              <Ionicons name="document-attach" size={22} color="#1565C0" />
              <Text style={s.sheetOptionTxt}>Browse Files</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setShowPhotoSheet(false)}>
              <Text style={s.sheetCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showPicker} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={() => setShowPicker(false)}>
        {/* Explicit safe-area padding ensures the close/Done row sits visibly
            below iOS notch/dynamic island instead of being clipped at the top */}
        <View style={{ flex: 1, backgroundColor: '#FFF', paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 16) }}>
          <View style={s.pickerHeader}>
            <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={{top:20,bottom:20,left:20,right:20}} style={s.headerBtn} testID="member-modal-close" accessibilityLabel="member-modal-close" /* @ts-ignore */ data-testid="member-modal-close">
              <Ionicons name="close" size={28} color="#37474F" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Add Members</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={{top:20,bottom:20,left:20,right:20}} style={s.headerBtn} testID="member-modal-done" accessibilityLabel="member-modal-done" /* @ts-ignore */ data-testid="member-modal-done">
              <Text style={{ color: '#1565C0', fontWeight: '700', fontSize: 17 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={s.searchBar}>
            <Ionicons name="search" size={18} color="#90A4AE" />
            <TextInput style={{ flex: 1, fontSize: 14, outlineWidth: 0 as any }} placeholder="Search users..." value={pickerQ} onChangeText={setPickerQ} />
          </View>
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
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
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
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  // Picker modal header — generous vertical padding + min-height + 44pt iOS
  // tap-target ensures the close ✕ and Done buttons remain comfortably
  // reachable below the device notch / dynamic-island region.
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1', minHeight: 60 },
  headerBtn: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  photoRow: { alignItems: 'center', marginBottom: 20 },
  photoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CFD8DC', borderStyle: 'dashed', overflow: 'hidden' },
  photoImage: { width: 100, height: 100, borderRadius: 50 },
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
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: '#78909C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingHorizontal: 4 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  sheetOptionTxt: { fontSize: 16, color: '#37474F', fontWeight: '500' },
  sheetCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  sheetCancelTxt: { fontSize: 15, color: '#78909C', fontWeight: '600' },
});
