import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_OPTIONS, CLINIC_ROLE_OPTIONS } from '../../constants/checklist';

const ROLE_COLORS: Record<string, string> = {
  administrator: '#9C27B0',
  supervisor: '#2196F3',
  implant_incharge: '#FF9800',
  student: '#4CAF50',
  nurse: '#E91E63',
  chief_dentist: '#FF9800',
  dentist: '#2196F3',
  dental_assistant: '#E91E63',
  super_admin: '#212121',
};

const ROLE_DISPLAY: Record<string, string> = {
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  implant_incharge: 'Implant Incharge',
  student: 'PG Student',
  nurse: 'Nurse',
  chief_dentist: 'Chief Dentist / Owner',
  dentist: 'Dentist / Consultant',
  dental_assistant: 'Dental Assistant',
  super_admin: 'Super Admin',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

type BulkRow = { id: string; name: string; email: string; role: string };
type BulkResult = { name: string; email: string; password: string; success: boolean; error?: string; emailSent?: boolean };
type CsvRow = { name: string; email: string; role: string; rawRole: string; valid: boolean; error?: string };

// Minimal CSV parser — handles quoted fields (so names/emails with commas inside
// quotes survive) without pulling in a dependency for a 3-column format.
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

export default function UserManagementScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterRole, setFilterRole] = useState('all');

  const isSuperAdmin = user?.role === 'super_admin';

  // Read-only banner atop the list — shows which org's users these are.
  const [myOrg, setMyOrg] = useState<{
    id: string; name: string; org_type: string; logo?: string | null;
    state?: string; state_of_registration?: string; state_of_practice?: string; registration_number?: string;
  } | null>(null);
  useEffect(() => {
    api.get('/organizations/me').then((res) => setMyOrg(res.data?.organization || null)).catch(() => {});
  }, []);

  // super_admin has no org of its own — every create flow needs an explicit org
  // picked from every organization on the platform.
  const [orgs, setOrgs] = useState<{ id: string; name: string; org_type: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) || null;

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/organizations').then((res) => setOrgs(res.data?.organizations || [])).catch(() => {});
  }, [isSuperAdmin]);

  const effectiveOrgType = isSuperAdmin ? selectedOrg?.org_type : user?.org_type;
  const roleOptions = effectiveOrgType === 'clinic' ? CLINIC_ROLE_OPTIONS : ROLE_OPTIONS;
  const defaultRole = roleOptions[0]?.value || 'student';

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'single' | 'multiple' | 'csv'>('single');
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'student' });

  // Bulk create state
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ id: '1', name: '', email: '', role: 'student' }]);
  const [bulkRolePickerRowId, setBulkRolePickerRowId] = useState<string | null>(null);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);

  // CSV mode state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);

  const openCreateModal = () => {
    setCreateMode('single');
    setSelectedOrgId(null);
    setNewUser({ name: '', email: '', password: '', role: defaultRole });
    setBulkRows([{ id: '1', name: '', email: '', role: defaultRole }]);
    setCsvRows([]);
    setCsvFileName('');
    setShowCreateModal(true);
  };

  const downloadCsvTemplate = async () => {
    const exampleRole = roleOptions[0]?.value || 'student';
    const csv = `name,email,role\nDr. Jane Doe,jane.doe@example.com,${exampleRole}\n`;
    setCsvBusy(true);
    try {
      const uri = `${FileSystem.cacheDirectory}implanr_user_template.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Save Implanr user template' });
      } else {
        Alert.alert('Template ready', `Saved to ${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create the template file');
    } finally {
      setCsvBusy(false);
    }
  };

  const handleUploadCsv = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets?.length) return;
      const asset = r.assets[0];
      setCsvBusy(true);
      const content = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseCsvText(content);
      if (parsed.length === 0) {
        Alert.alert('Empty CSV', 'That file has no rows.');
        setCsvBusy(false);
        return;
      }
      const header = parsed[0].map((h) => h.trim().toLowerCase());
      const hasHeader = header.includes('name') && header.includes('email') && header.includes('role');
      const dataRows = hasHeader ? parsed.slice(1) : parsed;
      const nameIdx = hasHeader ? header.indexOf('name') : 0;
      const emailIdx = hasHeader ? header.indexOf('email') : 1;
      const roleIdx = hasHeader ? header.indexOf('role') : 2;
      const validRoleValues = roleOptions.map((o) => o.value);

      const rows: CsvRow[] = dataRows.map((cols) => {
        const name = (cols[nameIdx] || '').trim();
        const email = (cols[emailIdx] || '').trim();
        const rawRole = (cols[roleIdx] || '').trim();
        const role = rawRole.toLowerCase().replace(/\s+/g, '_');
        let error: string | undefined;
        if (!name) error = 'Missing name';
        else if (!EMAIL_RE.test(email)) error = 'Invalid email';
        else if (!validRoleValues.includes(role)) error = `Role must be one of: ${validRoleValues.join(', ')}`;
        return { name, email, role, rawRole, valid: !error, error };
      });

      setCsvFileName(asset.name || 'uploaded.csv');
      setCsvRows(rows);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not read that CSV file');
    } finally {
      setCsvBusy(false);
    }
  };

  const handleCsvCreate = () => {
    const validRows = csvRows.filter((r) => r.valid).map((r) => ({ id: r.email, name: r.name, email: r.email, role: r.role }));
    if (validRows.length === 0) {
      Alert.alert('No valid rows', 'Fix the errors in your CSV and upload it again.');
      return;
    }
    handleBulkCreate(validRows);
  };

  const addBulkRow = () => {
    setBulkRows((rows) => [...rows, { id: Date.now().toString(), name: '', email: '', role: defaultRole }]);
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  };

  const updateBulkRow = (id: string, patch: Partial<BulkRow>) => {
    setBulkRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleBulkCreate = async (rowsOverride?: BulkRow[]) => {
    const rows = rowsOverride || bulkRows;
    const invalidRow = rows.find((r) => !r.name.trim() || !EMAIL_RE.test(r.email.trim()));
    if (invalidRow) {
      Alert.alert('Error', 'Every row needs a name and a valid email');
      return;
    }
    if (isSuperAdmin && !selectedOrgId) {
      Alert.alert('Error', 'Pick an organization first');
      return;
    }
    setBulkCreating(true);
    const results: BulkResult[] = [];
    for (const row of rows) {
      const password = generatePassword();
      try {
        const payload: any = { name: row.name.trim(), email: row.email.trim(), password, role: row.role };
        if (isSuperAdmin) payload.org_id = selectedOrgId;
        const resp = await api.post('/users', payload);
        results.push({ name: row.name.trim(), email: row.email.trim(), password, success: true, emailSent: !!resp.data?.email_sent });
      } catch (error: any) {
        results.push({
          name: row.name.trim(),
          email: row.email.trim(),
          password: '',
          success: false,
          error: error.response?.data?.detail || 'Failed to create',
        });
      }
    }
    setBulkCreating(false);
    setShowCreateModal(false);
    setBulkResults(results);
    setCsvRows([]);
    setCsvFileName('');
    loadUsers();
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
  };

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', password: '' });
  const [updating, setUpdating] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const params: any = {};
      if (filterRole !== 'all') params.role = filterRole;
      const response = await api.get('/users', { params });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterRole]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Onboarding tracking for the Single/Multiple/CSV Add User flow — those
  // paths set a password immediately, so "onboarded" means "has actually
  // logged in" (first_login_at set by the backend on successful login),
  // not a separate invite/token state.
  const [onboardingFilter, setOnboardingFilter] = useState<'all' | 'pending'>('all');
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResendCredentials = (userId: string, name: string) => {
    Alert.alert('Resend Credentials', `Generate a new password for ${name} and email it to them?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resend',
        onPress: async () => {
          setResendingId(userId);
          try {
            const resp = await api.post(`/users/${userId}/resend-credentials`);
            Alert.alert(
              'Success',
              resp.data?.email_sent
                ? 'New credentials have been emailed.'
                : 'Password reset, but the email could not be sent — share it manually.'
            );
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to resend credentials');
          } finally {
            setResendingId(null);
          }
        },
      },
    ]);
  };

  const onRefresh = () => { setRefreshing(true); loadUsers(); };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (isSuperAdmin && !selectedOrgId) {
      Alert.alert('Error', 'Pick an organization first');
      return;
    }
    setCreating(true);
    try {
      const payload: any = { ...newUser };
      if (isSuperAdmin) payload.org_id = selectedOrgId;
      const resp = await api.post('/users', payload);
      Alert.alert(
        'Success',
        resp.data?.email_sent
          ? 'User created. Login credentials have been emailed to them.'
          : 'User created, but the credentials email could not be sent — share the password manually.'
      );
      setShowCreateModal(false);
      setNewUser({ name: '', email: '', password: '', role: defaultRole });
      loadUsers();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditForm({ name: u.name, role: u.role, password: '' });
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    const payload: any = {};
    if (editForm.name.trim() && editForm.name.trim() !== editingUser.name) {
      payload.name = editForm.name.trim();
    }
    if (editForm.role && editForm.role !== editingUser.role) {
      payload.role = editForm.role;
    }
    if (editForm.password.trim()) {
      payload.password = editForm.password.trim();
    }
    if (Object.keys(payload).length === 0) {
      Alert.alert('No Changes', 'No fields were modified');
      return;
    }
    setUpdating(true);
    try {
      await api.put(`/users/${editingUser.id}`, payload);
      Alert.alert('Success', 'User updated successfully');
      setShowEditModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    Alert.alert('Delete User', `Are you sure you want to delete ${userName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/users/${userId}`);
            Alert.alert('Success', 'User deleted');
            loadUsers();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to delete user');
          }
        },
      },
    ]);
  };

  const isAdmin = user?.role === 'administrator' || user?.role === 'implant_incharge' || user?.role === 'super_admin';

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>Only administrators and implant incharge can manage users</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatRelative = (iso?: string | null) => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const renderUser = ({ item }: any) => {
    const onboarded = !!item.first_login_at;
    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => openEditModal(item)}
        data-testid={`user-card-${item.id}`}
      >
        <View style={styles.userRow}>
          {item.profile_photo ? (
            <Image source={{ uri: item.profile_photo }} style={styles.userAvatarImage} />
          ) : (
            <View style={[styles.userAvatar, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
              <Text style={styles.avatarText}>
                {item.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.name}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
                <Text style={styles.roleText}>{ROLE_DISPLAY[item.role] || item.role}</Text>
              </View>
              <View style={[styles.onboardBadge, onboarded ? styles.onboardBadgeActive : styles.onboardBadgePending]}>
                <View style={[styles.onboardDot, { backgroundColor: onboarded ? '#4CAF50' : '#FF9800' }]} />
                <Text style={[styles.onboardBadgeText, { color: onboarded ? '#2E7D32' : '#E65100' }]}>
                  {onboarded ? `Active · seen ${formatRelative(item.last_login_at)}` : 'Not logged in yet'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.actionBtns}>
            {!onboarded && (
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={(e) => { e.stopPropagation(); handleResendCredentials(item.id, item.name); }}
                disabled={resendingId === item.id}
                data-testid={`resend-credentials-${item.id}`}
              >
                {resendingId === item.id ? (
                  <ActivityIndicator size="small" color="#FF9800" />
                ) : (
                  <Ionicons name="mail-outline" size={20} color="#FF9800" />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openEditModal(item)}
              data-testid={`edit-user-${item.id}`}
            >
              <Ionicons name="create-outline" size={20} color="#007AFF" />
            </TouchableOpacity>
            {item.id !== user?.id && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteUser(item.id, item.name)}
                data-testid={`delete-user-${item.id}`}
              >
                <Ionicons name="trash-outline" size={20} color="#F44336" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const pendingOnboardCount = users.filter((u) => !u.first_login_at).length;
  const displayedUsers = onboardingFilter === 'pending' ? users.filter((u) => !u.first_login_at) : users;

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'student', label: 'Students' },
    { key: 'supervisor', label: 'Supervisors' },
    { key: 'implant_incharge', label: 'Incharge' },
    { key: 'nurse', label: 'Nurses' },
    { key: 'administrator', label: 'Admins' },
  ];

  const renderRoleSelector = (selectedRole: string, onSelect: (role: string) => void) => (
    <View style={styles.roleSelector}>
      {roleOptions.map((option) => (
        <TouchableOpacity
          key={option.value}
          style={[
            styles.roleOption,
            selectedRole === option.value && {
              backgroundColor: ROLE_COLORS[option.value] || '#007AFF',
              borderColor: ROLE_COLORS[option.value] || '#007AFF',
            },
          ]}
          onPress={() => onSelect(option.value)}
          data-testid={`role-option-${option.value}`}
        >
          <Text style={[
            styles.roleOptionText,
            selectedRole === option.value && styles.roleOptionTextActive,
          ]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Organization Banner — read-only, just for context */}
      {myOrg && (
        <View style={styles.orgBanner} data-testid="org-banner">
          {myOrg.logo ? (
            <Image source={{ uri: myOrg.logo }} style={styles.orgBannerLogo} />
          ) : (
            <View style={[styles.orgBannerLogo, styles.orgBannerLogoPlaceholder]}>
              <Ionicons name={myOrg.org_type === 'clinic' ? 'medkit' : 'school'} size={18} color="#78909C" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.orgBannerName} numberOfLines={1}>{myOrg.name}</Text>
            <Text style={styles.orgBannerMeta} numberOfLines={1}>
              {myOrg.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'}
              {myOrg.org_type === 'college' && myOrg.state ? ` · ${myOrg.state}` : ''}
              {myOrg.org_type === 'clinic' && myOrg.registration_number ? ` · Reg. ${myOrg.registration_number}` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* Onboarding tracking — All Users vs Pending Onboarding (created via
          Single/Multiple/CSV but never actually logged in yet). */}
      <View style={styles.viewModeRow}>
        <TouchableOpacity
          style={[styles.viewModeBtn, onboardingFilter === 'all' && styles.viewModeBtnActive]}
          onPress={() => setOnboardingFilter('all')}
          data-testid="onboarding-filter-all"
        >
          <Text style={[styles.viewModeText, onboardingFilter === 'all' && styles.viewModeTextActive]}>All Users</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeBtn, onboardingFilter === 'pending' && styles.viewModeBtnActive]}
          onPress={() => setOnboardingFilter('pending')}
          data-testid="onboarding-filter-pending"
        >
          <Text style={[styles.viewModeText, onboardingFilter === 'pending' && styles.viewModeTextActive]}>
            Pending Onboarding{pendingOnboardCount > 0 ? ` (${pendingOnboardCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, filterRole === item.key && styles.filterChipActive]}
              onPress={() => setFilterRole(item.key)}
              data-testid={`filter-${item.key}`}
            >
              <Text style={[styles.filterChipText, filterRole === item.key && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* User List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={displayedUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name={onboardingFilter === 'pending' ? 'checkmark-done-outline' : 'people-outline'} size={48} color="#CCC" />
              <Text style={styles.emptyText}>
                {onboardingFilter === 'pending' ? 'Everyone has logged in — nothing pending' : 'No users found'}
              </Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.userCount} data-testid="user-count">
              {displayedUsers.length} user{displayedUsers.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}

      {/* Create User FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateModal}
        data-testid="create-user-fab"
      >
        <Ionicons name="person-add" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Create User Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} data-testid="create-user-modal">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create New User</Text>
                <TouchableOpacity onPress={() => setShowCreateModal(false)} data-testid="close-create-modal-btn">
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {isSuperAdmin && (
                <>
                  <Text style={styles.inputLabel}>Organization</Text>
                  <TouchableOpacity style={styles.orgPickerBtn} onPress={() => setShowOrgPicker(true)} data-testid="org-picker-btn">
                    {selectedOrg ? (
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orgPickerName} numberOfLines={1}>{selectedOrg.name}</Text>
                        <Text style={styles.orgPickerType}>{selectedOrg.org_type === 'clinic' ? 'Clinic' : 'College'}</Text>
                      </View>
                    ) : (
                      <Text style={styles.orgPickerPlaceholder}>Select an organization…</Text>
                    )}
                    <Ionicons name="chevron-down" size={18} color="#666" />
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, createMode === 'single' && styles.modeToggleBtnActive]}
                  onPress={() => setCreateMode('single')}
                  data-testid="create-mode-single"
                >
                  <Text style={[styles.modeToggleText, createMode === 'single' && styles.modeToggleTextActive]}>Single User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, createMode === 'multiple' && styles.modeToggleBtnActive]}
                  onPress={() => setCreateMode('multiple')}
                  data-testid="create-mode-multiple"
                >
                  <Text style={[styles.modeToggleText, createMode === 'multiple' && styles.modeToggleTextActive]}>Multiple</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, createMode === 'csv' && styles.modeToggleBtnActive]}
                  onPress={() => setCreateMode('csv')}
                  data-testid="create-mode-csv"
                >
                  <Text style={[styles.modeToggleText, createMode === 'csv' && styles.modeToggleTextActive]}>CSV Upload</Text>
                </TouchableOpacity>
              </View>

              {createMode === 'single' ? (
                <>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Dr. John Doe"
                    placeholderTextColor="#999"
                    value={newUser.name}
                    onChangeText={(text) => setNewUser({ ...newUser, name: text })}
                    data-testid="input-name"
                  />

                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="john.doe@dental.edu"
                    placeholderTextColor="#999"
                    value={newUser.email}
                    onChangeText={(text) => setNewUser({ ...newUser, email: text })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    data-testid="input-email"
                  />

                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    placeholderTextColor="#999"
                    value={newUser.password}
                    onChangeText={(text) => setNewUser({ ...newUser, password: text })}
                    secureTextEntry
                    data-testid="input-password"
                  />

                  <Text style={styles.inputLabel}>Role</Text>
                  {renderRoleSelector(newUser.role, (role) => setNewUser({ ...newUser, role }))}

                  <TouchableOpacity
                    style={[styles.createBtn, (creating || (isSuperAdmin && !selectedOrgId)) && styles.btnDisabled]}
                    onPress={handleCreateUser}
                    disabled={creating || (isSuperAdmin && !selectedOrgId)}
                    data-testid="submit-create-user"
                  >
                    {creating ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.createBtnText}>Create User</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : createMode === 'multiple' ? (
                <>
                  <Text style={styles.bulkHint}>
                    Add one row per user. Passwords are generated automatically — you'll get a list to share after creating.
                  </Text>

                  {bulkRows.map((row, idx) => (
                    <View key={row.id} style={styles.bulkRow} data-testid={`bulk-row-${idx}`}>
                      <View style={styles.bulkRowHeader}>
                        <Text style={styles.bulkRowNumber}>#{idx + 1}</Text>
                        {bulkRows.length > 1 && (
                          <TouchableOpacity onPress={() => removeBulkRow(row.id)} data-testid={`bulk-row-remove-${idx}`}>
                            <Ionicons name="trash-outline" size={18} color="#F44336" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Full name"
                        placeholderTextColor="#999"
                        value={row.name}
                        onChangeText={(text) => updateBulkRow(row.id, { name: text })}
                        data-testid={`bulk-row-name-${idx}`}
                      />
                      <TextInput
                        style={[styles.input, { marginTop: 8 }]}
                        placeholder="Email"
                        placeholderTextColor="#999"
                        value={row.email}
                        onChangeText={(text) => updateBulkRow(row.id, { email: text })}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        data-testid={`bulk-row-email-${idx}`}
                      />
                      <TouchableOpacity
                        style={styles.bulkRolePicker}
                        onPress={() => setBulkRolePickerRowId(row.id)}
                        data-testid={`bulk-row-role-${idx}`}
                      >
                        <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[row.role] || '#757575' }]} />
                        <Text style={styles.bulkRolePickerText}>{ROLE_DISPLAY[row.role] || row.role}</Text>
                        <Ionicons name="chevron-down" size={16} color="#666" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addRowBtn} onPress={addBulkRow} data-testid="bulk-add-row">
                    <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                    <Text style={styles.addRowBtnText}>Add Another User</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.createBtn, (bulkCreating || (isSuperAdmin && !selectedOrgId)) && styles.btnDisabled]}
                    onPress={() => handleBulkCreate()}
                    disabled={bulkCreating || (isSuperAdmin && !selectedOrgId)}
                    data-testid="submit-bulk-create"
                  >
                    {bulkCreating ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.createBtnText}>Create {bulkRows.length} User{bulkRows.length !== 1 ? 's' : ''}</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.csvInstructions}>
                    <View style={styles.csvInstructionsRow}>
                      <Ionicons name="information-circle" size={16} color="#1565C0" />
                      <Text style={styles.csvInstructionsTitle}>CSV format</Text>
                    </View>
                    <Text style={styles.csvInstructionsText}>
                      Columns: <Text style={styles.csvMono}>name, email, role</Text> (header row required).{'\n'}
                      Role must be exactly one of:{' '}
                      <Text style={styles.csvMono}>{roleOptions.map((o) => o.value).join(', ')}</Text>.{'\n'}
                      Rows that don't match are flagged below and skipped on create.
                    </Text>
                  </View>

                  <View style={styles.csvActionsRow}>
                    <TouchableOpacity
                      style={styles.csvActionBtn}
                      onPress={downloadCsvTemplate}
                      disabled={csvBusy || (isSuperAdmin && !selectedOrgId)}
                      data-testid="csv-download-template"
                    >
                      <Ionicons name="download-outline" size={18} color="#007AFF" />
                      <Text style={styles.csvActionBtnText}>Download Template</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.csvActionBtn}
                      onPress={handleUploadCsv}
                      disabled={csvBusy || (isSuperAdmin && !selectedOrgId)}
                      data-testid="csv-upload"
                    >
                      <Ionicons name="cloud-upload-outline" size={18} color="#007AFF" />
                      <Text style={styles.csvActionBtnText}>Upload CSV</Text>
                    </TouchableOpacity>
                  </View>
                  {isSuperAdmin && !selectedOrgId && (
                    <Text style={styles.orgRequiredHint}>Pick an organization above to enable the CSV template and upload.</Text>
                  )}

                  {csvBusy && <ActivityIndicator color="#007AFF" style={{ marginTop: 12 }} />}

                  {csvRows.length > 0 && !csvBusy && (
                    <>
                      <View style={styles.csvSummaryRow}>
                        <Ionicons name="document-text-outline" size={14} color="#888" />
                        <Text style={styles.csvSummaryText} numberOfLines={1}>{csvFileName}</Text>
                      </View>
                      <Text style={styles.csvSummaryCount} data-testid="csv-valid-count">
                        {csvRows.filter((r) => r.valid).length} of {csvRows.length} rows valid — will create {csvRows.filter((r) => r.valid).length} user{csvRows.filter((r) => r.valid).length !== 1 ? 's' : ''}
                      </Text>

                      {/* Preview table */}
                      <View style={styles.csvTableHeader}>
                        <Text style={[styles.csvTableHeaderText, { flex: 0.5 }]}>#</Text>
                        <Text style={[styles.csvTableHeaderText, { flex: 1.4 }]}>Name</Text>
                        <Text style={[styles.csvTableHeaderText, { flex: 1.6 }]}>Email</Text>
                        <Text style={[styles.csvTableHeaderText, { flex: 1 }]}>Role</Text>
                      </View>
                      {csvRows.map((row, idx) => (
                        <View key={idx} style={[styles.csvTableRow, !row.valid && styles.csvTableRowError]} data-testid={`csv-row-${idx}`}>
                          <View style={styles.csvTableRowMain}>
                            <Text style={[styles.csvTableCell, { flex: 0.5 }]}>{idx + 1}</Text>
                            <Text style={[styles.csvTableCell, { flex: 1.4 }]} numberOfLines={1}>{row.name || '—'}</Text>
                            <Text style={[styles.csvTableCell, { flex: 1.6 }]} numberOfLines={1}>{row.email || '—'}</Text>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name={row.valid ? 'checkmark-circle' : 'close-circle'} size={14} color={row.valid ? '#4CAF50' : '#F44336'} />
                              <Text style={styles.csvTableCell} numberOfLines={1}> {row.rawRole || '—'}</Text>
                            </View>
                          </View>
                          {!row.valid && <Text style={styles.csvRowErrorText}>{row.error}</Text>}
                        </View>
                      ))}

                      <TouchableOpacity
                        style={[styles.createBtn, (bulkCreating || csvRows.filter((r) => r.valid).length === 0) && styles.btnDisabled]}
                        onPress={handleCsvCreate}
                        disabled={bulkCreating || csvRows.filter((r) => r.valid).length === 0}
                        data-testid="submit-csv-create"
                      >
                        {bulkCreating ? (
                          <ActivityIndicator color="#FFF" />
                        ) : (
                          <Text style={styles.createBtnText}>
                            Create {csvRows.filter((r) => r.valid).length} User{csvRows.filter((r) => r.valid).length !== 1 ? 's' : ''}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Organization Picker (super_admin only) */}
      <Modal visible={showOrgPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowOrgPicker(false)}
          data-testid="org-picker-overlay"
        >
          <View style={styles.pickerSheet}>
            <ScrollView style={{ maxHeight: 400 }}>
              {orgs.length === 0 ? (
                <Text style={styles.orgPickerEmpty}>No organizations found</Text>
              ) : (
                orgs.map((org) => (
                  <TouchableOpacity
                    key={org.id}
                    style={styles.pickerItem}
                    onPress={() => {
                      setSelectedOrgId(org.id);
                      setShowOrgPicker(false);
                      setNewUser((u) => ({ ...u, role: '' }));
                      setBulkRows([{ id: '1', name: '', email: '', role: '' }]);
                    }}
                    data-testid={`org-picker-option-${org.id}`}
                  >
                    <Ionicons name={org.org_type === 'clinic' ? 'medkit-outline' : 'school-outline'} size={18} color="#666" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemText}>{org.name}</Text>
                      <Text style={styles.orgPickerType}>{org.org_type === 'clinic' ? 'Clinic' : 'College'}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk Role Picker */}
      <Modal visible={!!bulkRolePickerRowId} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setBulkRolePickerRowId(null)}
          data-testid="bulk-role-picker-overlay"
        >
          <View style={styles.pickerSheet}>
            {roleOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.pickerItem}
                onPress={() => {
                  if (bulkRolePickerRowId) updateBulkRow(bulkRolePickerRowId, { role: option.value });
                  setBulkRolePickerRowId(null);
                }}
                data-testid={`bulk-role-picker-option-${option.value}`}
              >
                <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[option.value] || '#757575' }]} />
                <Text style={styles.pickerItemText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk Create Results */}
      <Modal visible={!!bulkResults} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} data-testid="bulk-results-modal">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {(bulkResults || []).filter((r) => r.success).length}/{(bulkResults || []).length} Users Created
                </Text>
                <TouchableOpacity onPress={() => setBulkResults(null)} data-testid="close-bulk-results-btn">
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {(bulkResults || []).map((r, idx) => (
                <View key={idx} style={[styles.resultCard, !r.success && styles.resultCardError]}>
                  <View style={styles.resultRow}>
                    <Ionicons
                      name={r.success ? 'checkmark-circle' : 'close-circle'}
                      size={18}
                      color={r.success ? '#4CAF50' : '#F44336'}
                    />
                    <Text style={styles.resultName}>{r.name}</Text>
                  </View>
                  <Text style={styles.resultEmail}>{r.email}</Text>
                  {r.success ? (
                    <>
                      <View style={styles.resultPwRow}>
                        <Text style={styles.resultPw}>{r.password}</Text>
                        <TouchableOpacity onPress={() => copyToClipboard(`${r.email} / ${r.password}`)} data-testid={`copy-credentials-${idx}`}>
                          <Ionicons name="copy-outline" size={18} color="#007AFF" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultEmailedRow}>
                        <Ionicons
                          name={r.emailSent ? 'mail' : 'mail-outline'}
                          size={13}
                          color={r.emailSent ? '#4CAF50' : '#90A4AE'}
                        />
                        <Text style={styles.resultEmailedText}>
                          {r.emailSent ? 'Credentials emailed to user' : 'Email not sent — share manually'}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.resultError}>{r.error}</Text>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.createBtn} onPress={() => setBulkResults(null)} data-testid="done-bulk-results">
                <Text style={styles.createBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} data-testid="edit-user-modal">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit User</Text>
                <TouchableOpacity onPress={() => { setShowEditModal(false); setEditingUser(null); }} data-testid="close-edit-modal-btn">
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {editingUser && (
                <View style={styles.editUserInfo}>
                  <View style={[styles.editAvatar, { backgroundColor: ROLE_COLORS[editingUser.role] || '#757575' }]}>
                    <Text style={styles.editAvatarText}>
                      {editingUser.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <Text style={styles.editEmail}>{editingUser.email}</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#999"
                value={editForm.name}
                onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                data-testid="edit-input-name"
              />

              <Text style={styles.inputLabel}>Change Role</Text>
              {renderRoleSelector(editForm.role, (role) => setEditForm({ ...editForm, role }))}

              <Text style={styles.inputLabel}>Reset Password (leave empty to keep current)</Text>
              <TextInput
                style={styles.input}
                placeholder="New password (optional)"
                placeholderTextColor="#999"
                value={editForm.password}
                onChangeText={(text) => setEditForm({ ...editForm, password: text })}
                secureTextEntry
                data-testid="edit-input-password"
              />

              <TouchableOpacity
                style={[styles.updateBtn, updating && styles.btnDisabled]}
                onPress={handleUpdateUser}
                disabled={updating}
                data-testid="submit-edit-user"
              >
                {updating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.createBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  accessDeniedText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  accessDeniedSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  orgBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  orgBannerLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  orgBannerLogoPlaceholder: {
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgBannerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  orgBannerMeta: {
    fontSize: 12,
    color: '#78909C',
    marginTop: 1,
  },
  viewModeRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 4,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  viewModeBtnActive: {
    backgroundColor: '#E3F2FD',
  },
  viewModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  viewModeTextActive: {
    color: '#007AFF',
  },
  filterRow: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  userCount: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
    fontWeight: '500',
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#1E88E5',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  userEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  onboardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  onboardBadgeActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  onboardBadgePending: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFECB3',
  },
  onboardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onboardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  editBtn: {
    padding: 8,
  },
  deleteBtn: {
    padding: 8,
  },
  resendBtn: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  editUserInfo: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  editAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  editAvatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  editEmail: {
    fontSize: 14,
    color: '#888',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  roleOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  roleOptionTextActive: {
    color: '#FFF',
  },
  createBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    padding: 4,
    marginTop: 16,
    marginBottom: 8,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeToggleBtnActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  modeToggleTextActive: {
    color: '#007AFF',
  },
  bulkHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 17,
  },
  bulkRow: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    padding: 12,
    marginBottom: 10,
  },
  bulkRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bulkRowNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
  },
  bulkRolePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: '#FFF',
  },
  bulkRolePickerText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  addRowBtnText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  pickerSheet: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 8,
    width: '100%',
    maxWidth: 320,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
  },
  pickerItemText: {
    fontSize: 15,
    color: '#333',
  },
  resultCard: {
    backgroundColor: '#F1F8F1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    padding: 12,
    marginBottom: 8,
  },
  resultCardError: {
    backgroundColor: '#FDECEA',
    borderColor: '#F8C9C2',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  resultEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    marginLeft: 26,
  },
  resultPwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    marginLeft: 26,
  },
  resultPw: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#1A1A1A',
    letterSpacing: 0.5,
  },
  resultEmailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    marginLeft: 26,
  },
  resultEmailedText: {
    fontSize: 11,
    color: '#78909C',
  },
  resultError: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 4,
    marginLeft: 26,
  },
  csvInstructions: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    padding: 12,
    marginTop: 12,
  },
  csvInstructionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  csvInstructionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565C0',
  },
  csvInstructionsText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#37474F',
  },
  csvMono: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  csvActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  csvActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
  },
  csvActionBtnText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },
  csvSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  csvSummaryText: {
    fontSize: 12,
    color: '#888',
    flexShrink: 1,
  },
  csvSummaryCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 4,
    marginBottom: 10,
  },
  csvTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  csvTableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  csvTableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#FFF',
  },
  csvTableRowError: {
    backgroundColor: '#FDECEA',
  },
  csvTableRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  csvTableCell: {
    fontSize: 12,
    color: '#333',
  },
  csvRowErrorText: {
    fontSize: 11,
    color: '#C62828',
    marginTop: 3,
  },
  orgPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
  },
  orgPickerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  orgPickerType: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  orgPickerPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#999',
  },
  orgPickerEmpty: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    padding: 20,
  },
  orgRequiredHint: {
    fontSize: 11,
    color: '#E65100',
    marginTop: 8,
  },
  updateBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
