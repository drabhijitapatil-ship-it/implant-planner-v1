import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView,
  FlatList, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

type ActiveUser = {
  id: string; name: string; email: string; role: string;
  sub_role?: string; mobile?: string; disabled?: boolean; created_at?: string;
};
type PendingInvite = {
  id: string; name: string; email: string; role: string;
  sub_role?: string; token: string; expires_at: string;
};

const ROLE_META = [
  { value: 'implant_incharge', label: 'Implant In-Charge', subRoles: [] },
  { value: 'supervisor', label: 'Supervisor', subRoles: [] },
  {
    value: 'student', label: 'Student', subRoles: [
      { value: 'pg_student', label: 'Postgraduate Student' },
      { value: 'ug_student', label: 'Undergraduate Student' },
      { value: 'fellow', label: 'Fellow' },
    ]
  },
  {
    value: 'nurse', label: 'Auxiliary Staff', subRoles: [
      { value: 'hygienist', label: 'Dental Hygienist' },
      { value: 'nurse', label: 'Nurse' },
    ]
  },
  { value: 'administrator', label: 'Administrator', subRoles: [] },
];

const ROLE_COLOR: Record<string, string> = {
  implant_incharge: '#FF6F00',
  supervisor: '#1565C0',
  student: '#2E7D32',
  nurse: '#AD1457',
  administrator: '#6A1B9A',
};

const roleLabel = (role: string, sub?: string) => {
  const r = ROLE_META.find(x => x.value === role);
  const base = r?.label ?? role.replace(/_/g, ' ');
  if (!sub) return base;
  const s = r?.subRoles.find((x: any) => x.value === sub);
  return s ? `${s.label}` : base;
};

type Section = 'active' | 'pending' | 'disabled';

export default function UserManagementScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'implant_incharge' || user?.role === 'administrator';

  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>('active');

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', mobile: '', role: '', sub_role: '' });
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showSubRolePicker, setShowSubRolePicker] = useState(false);

  const selectedRoleMeta = ROLE_META.find(r => r.value === inviteForm.role);
  const hasSubRoles = (selectedRoleMeta?.subRoles.length ?? 0) > 0;

  const loadMembers = useCallback(async () => {
    try {
      const res = await api.get('/organizations/members');
      setActiveUsers(res.data.active_users ?? []);
      setPendingInvites(res.data.pending_invites ?? []);
    } catch {
      // Non-admin gets 403 — show empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const onRefresh = () => { setRefreshing(true); loadMembers(); };

  const validateInvite = () => {
    const e: Record<string, string> = {};
    if (!inviteForm.name.trim()) e.name = 'Name is required';
    if (!inviteForm.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) e.email = 'Invalid email';
    if (!inviteForm.role) e.role = 'Role is required';
    if (hasSubRoles && !inviteForm.sub_role) e.sub_role = 'Sub-role is required';
    setInviteErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSendInvite = async () => {
    if (!validateInvite()) return;
    setInviting(true);
    try {
      await api.post('/organizations/invite', {
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim().toLowerCase(),
        mobile: inviteForm.mobile.trim() || undefined,
        role: inviteForm.role,
        sub_role: hasSubRoles ? inviteForm.sub_role : undefined,
      });
      setShowInviteModal(false);
      setInviteForm({ name: '', email: '', mobile: '', role: '', sub_role: '' });
      await loadMembers();
      Alert.alert('Invite Sent', 'The invitation email has been sent.');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert('Failed', typeof detail === 'string' ? detail : 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = (invite: PendingInvite) => {
    Alert.alert(
      'Revoke Invite',
      `Revoke the invite sent to ${invite.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/organizations/invites/${invite.id}`);
              await loadMembers();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail ?? 'Failed to revoke invite.');
            }
          }
        }
      ]
    );
  };

  const handleResend = async (invite: PendingInvite) => {
    try {
      await api.post(`/organizations/invites/${invite.id}/resend`);
      Alert.alert('Resent', `Invite resent to ${invite.email}.`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail ?? 'Failed to resend invite.');
    }
  };

  const handleDisable = (u: ActiveUser) => {
    Alert.alert(
      'Disable Account',
      `Disable ${u.name}'s account? They won't be able to sign in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable', style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/organizations/users/${u.id}/disable`);
              await loadMembers();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail ?? 'Failed to disable user.');
            }
          },
        },
      ]
    );
  };

  const handleEnable = async (u: ActiveUser) => {
    try {
      await api.put(`/organizations/users/${u.id}/enable`);
      await loadMembers();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail ?? 'Failed to enable user.');
    }
  };

  const displayedActiveUsers = activeUsers.filter(u => !u.disabled);
  const displayedDisabledUsers = activeUsers.filter(u => u.disabled);

  const sectionCount = {
    active: displayedActiveUsers.length,
    pending: pendingInvites.length,
    disabled: displayedDisabledUsers.length,
  };

  if (loading) {
    return (
      <SafeAreaView style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F8FD' }}>
      {/* Header */}
      <LinearGradient colors={['#1565C0', '#1976D2']} style={s.header}>
        <Text style={s.headerTitle}>Team Members</Text>
        {isAdmin && (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowInviteModal(true)}>
            <Ionicons name="person-add" size={18} color="#FFF" />
            <Text style={s.addBtnTxt}>Add User</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Section Tabs */}
      <View style={s.tabRow}>
        {(['active', 'pending', 'disabled'] as Section[]).map(sec => (
          <TouchableOpacity
            key={sec}
            style={[s.tabBtn, section === sec && s.tabBtnActive]}
            onPress={() => setSection(sec)}
          >
            <Text style={[s.tabTxt, section === sec && s.tabTxtActive]}>
              {sec === 'active' ? 'Active' : sec === 'pending' ? 'Pending' : 'Disabled'}
              {sectionCount[sec] > 0 ? ` (${sectionCount[sec]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1565C0" />}
      >
        {section === 'active' && (
          displayedActiveUsers.length === 0
            ? <EmptyState icon="people-outline" text="No active members yet. Invite your team!" />
            : displayedActiveUsers.map(u => (
              <ActiveUserCard key={u.id} user={u} isAdmin={isAdmin} onDisable={handleDisable} />
            ))
        )}
        {section === 'pending' && (
          !isAdmin
            ? <EmptyState icon="lock-closed-outline" text="Only admins can view pending invites." />
            : pendingInvites.length === 0
              ? <EmptyState icon="mail-outline" text="No pending invites." />
              : pendingInvites.map(inv => (
                <PendingCard key={inv.id} invite={inv} onRevoke={handleRevoke} onResend={handleResend} />
              ))
        )}
        {section === 'disabled' && (
          displayedDisabledUsers.length === 0
            ? <EmptyState icon="person-remove-outline" text="No disabled accounts." />
            : displayedDisabledUsers.map(u => (
              <ActiveUserCard key={u.id} user={u} dimmed isAdmin={isAdmin} onEnable={handleEnable} />
            ))
        )}
      </ScrollView>

      {/* Invite Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Invite Team Member</Text>
              <TouchableOpacity onPress={() => { setShowInviteModal(false); setInviteErrors({}); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">

              <Text style={s.fl}>Full Name *</Text>
              <TextInput
                style={[s.fi, inviteErrors.name && s.fiErr]}
                placeholder="e.g. Dr. Priya Sharma"
                value={inviteForm.name}
                onChangeText={v => setInviteForm(f => ({ ...f, name: v }))}
                autoCapitalize="words"
              />
              {inviteErrors.name ? <Text style={s.fe}>{inviteErrors.name}</Text> : null}

              <Text style={s.fl}>Email *</Text>
              <TextInput
                style={[s.fi, inviteErrors.email && s.fiErr]}
                placeholder="user@dental.edu"
                value={inviteForm.email}
                onChangeText={v => setInviteForm(f => ({ ...f, email: v }))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inviteErrors.email ? <Text style={s.fe}>{inviteErrors.email}</Text> : null}

              <Text style={s.fl}>Mobile Number <Text style={s.optional}>(optional)</Text></Text>
              <TextInput
                style={s.fi}
                placeholder="+91 98765 43210"
                value={inviteForm.mobile}
                onChangeText={v => setInviteForm(f => ({ ...f, mobile: v }))}
                keyboardType="phone-pad"
              />

              <Text style={s.fl}>Role *</Text>
              <TouchableOpacity
                style={[s.fpicker, inviteErrors.role && s.fiErr]}
                onPress={() => setShowRolePicker(true)}
              >
                <Text style={inviteForm.role ? s.fpickerVal : s.fpickerPH}>
                  {selectedRoleMeta?.label ?? 'Select role'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#666" />
              </TouchableOpacity>
              {inviteErrors.role ? <Text style={s.fe}>{inviteErrors.role}</Text> : null}

              {hasSubRoles && (
                <>
                  <Text style={s.fl}>Sub-role *</Text>
                  <TouchableOpacity
                    style={[s.fpicker, inviteErrors.sub_role && s.fiErr]}
                    onPress={() => setShowSubRolePicker(true)}
                  >
                    <Text style={inviteForm.sub_role ? s.fpickerVal : s.fpickerPH}>
                      {selectedRoleMeta?.subRoles.find((x: any) => x.value === inviteForm.sub_role)?.label ?? 'Select sub-role'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#666" />
                  </TouchableOpacity>
                  {inviteErrors.sub_role ? <Text style={s.fe}>{inviteErrors.sub_role}</Text> : null}
                </>
              )}

              <TouchableOpacity
                style={[s.sendBtn, inviting && s.btnDisabled]}
                onPress={handleSendInvite}
                disabled={inviting}
              >
                {inviting
                  ? <ActivityIndicator color="#FFF" />
                  : <>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={s.sendBtnTxt}>Send Invite</Text>
                  </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Role Picker */}
      <Modal visible={showRolePicker} animationType="fade" transparent>
        <Pressable style={s.centeredOverlay} onPress={() => setShowRolePicker(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerSheetTitle}>Select Role</Text>
            {ROLE_META.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[s.pickerItem, inviteForm.role === r.value && s.pickerItemSel]}
                onPress={() => {
                  setInviteForm(f => ({ ...f, role: r.value, sub_role: '' }));
                  setShowRolePicker(false);
                }}
              >
                <Text style={[s.pickerItemTxt, inviteForm.role === r.value && s.pickerItemTxtSel]}>{r.label}</Text>
                {inviteForm.role === r.value && <Ionicons name="checkmark" size={16} color="#1565C0" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Sub-role Picker */}
      <Modal visible={showSubRolePicker} animationType="fade" transparent>
        <Pressable style={s.centeredOverlay} onPress={() => setShowSubRolePicker(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerSheetTitle}>Select Sub-role</Text>
            {(selectedRoleMeta?.subRoles ?? []).map((r: any) => (
              <TouchableOpacity
                key={r.value}
                style={[s.pickerItem, inviteForm.sub_role === r.value && s.pickerItemSel]}
                onPress={() => {
                  setInviteForm(f => ({ ...f, sub_role: r.value }));
                  setShowSubRolePicker(false);
                }}
              >
                <Text style={[s.pickerItemTxt, inviteForm.sub_role === r.value && s.pickerItemTxtSel]}>{r.label}</Text>
                {inviteForm.sub_role === r.value && <Ionicons name="checkmark" size={16} color="#1565C0" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ActiveUserCard({ user, dimmed, isAdmin, onDisable, onEnable }: {
  user: ActiveUser; dimmed?: boolean; isAdmin?: boolean;
  onDisable?: (u: ActiveUser) => void; onEnable?: (u: ActiveUser) => void;
}) {
  const color = ROLE_COLOR[user.role] ?? '#607D8B';
  return (
    <View style={[cs.card, dimmed && cs.cardDimmed]}>
      <View style={[cs.avatar, { backgroundColor: color + '22' }]}>
        <Text style={[cs.avatarTxt, { color }]}>{user.name?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cs.name}>{user.name}</Text>
        <Text style={cs.email}>{user.email}</Text>
        {user.mobile ? <Text style={cs.meta}>{user.mobile}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[cs.roleBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[cs.roleTxt, { color }]}>{roleLabel(user.role, user.sub_role)}</Text>
        </View>
        {isAdmin && !dimmed && onDisable && (
          <TouchableOpacity style={cs.disableBtn} onPress={() => onDisable(user)}>
            <Text style={cs.disableTxt}>Disable</Text>
          </TouchableOpacity>
        )}
        {isAdmin && dimmed && onEnable && (
          <TouchableOpacity style={cs.enableBtn} onPress={() => onEnable(user)}>
            <Text style={cs.enableTxt}>Enable</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function PendingCard({ invite, onRevoke, onResend }: {
  invite: PendingInvite;
  onRevoke: (inv: PendingInvite) => void;
  onResend: (inv: PendingInvite) => void;
}) {
  const expiry = new Date(invite.expires_at);
  const daysLeft = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
  const color = ROLE_COLOR[invite.role] ?? '#607D8B';
  return (
    <View style={cs.card}>
      <View style={[cs.avatar, { backgroundColor: '#FFF3E0' }]}>
        <Ionicons name="mail-outline" size={20} color="#FF8F00" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cs.name}>{invite.name}</Text>
        <Text style={cs.email}>{invite.email}</Text>
        <Text style={cs.meta}>Expires in {daysLeft}d</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[cs.roleBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[cs.roleTxt, { color }]}>{roleLabel(invite.role, invite.sub_role)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={cs.resendBtn} onPress={() => onResend(invite)}>
            <Text style={cs.resendTxt}>Resend</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.revokeBtn} onPress={() => onRevoke(invite)}>
            <Text style={cs.revokeTxt}>Revoke</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={es.wrap}>
      <Ionicons name={icon} size={44} color="#B0BEC5" />
      <Text style={es.txt}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8FD' },
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnTxt: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  tabRow: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#1565C0' },
  tabTxt: { fontSize: 13, color: '#78909C', fontWeight: '500' },
  tabTxtActive: { color: '#1565C0', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  modalBody: { padding: 20, paddingBottom: 36 },
  fl: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6, marginTop: 14 },
  optional: { fontWeight: '400', color: '#90A4AE' },
  fi: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFAFA' },
  fiErr: { borderColor: '#FF3B30' },
  fe: { fontSize: 12, color: '#FF3B30', marginTop: 3 },
  fpicker: { borderWidth: 1.5, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' },
  fpickerVal: { fontSize: 15, color: '#1A1A2E' },
  fpickerPH: { fontSize: 15, color: '#94A3B8' },
  sendBtn: { backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 24, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  btnDisabled: { opacity: 0.6 },
  sendBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  pickerSheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 8, minWidth: 240, maxWidth: 320 },
  pickerSheetTitle: { fontSize: 14, fontWeight: '700', color: '#546E7A', paddingHorizontal: 16, paddingVertical: 10 },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  pickerItemSel: { backgroundColor: '#E3F2FD' },
  pickerItemTxt: { fontSize: 15, color: '#37474F' },
  pickerItemTxtSel: { color: '#1565C0', fontWeight: '700' },
});

const cs = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardDimmed: { opacity: 0.6, backgroundColor: '#F5F5F5' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 17, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  email: { fontSize: 13, color: '#546E7A', marginTop: 1 },
  meta: { fontSize: 12, color: '#90A4AE', marginTop: 2 },
  roleBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  roleTxt: { fontSize: 11, fontWeight: '700' },
  resendBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#E3F2FD' },
  resendTxt: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  revokeBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFEBEE' },
  revokeTxt: { fontSize: 12, color: '#C62828', fontWeight: '600' },
  disableBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#FFF3E0' },
  disableTxt: { fontSize: 12, color: '#E65100', fontWeight: '600' },
  enableBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#E8F5E9' },
  enableTxt: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
});

const es = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48 },
  txt: { marginTop: 12, fontSize: 14, color: '#90A4AE', textAlign: 'center' },
});
