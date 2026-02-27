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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_OPTIONS } from '../../constants/checklist';

const ROLE_COLORS: Record<string, string> = {
  administrator: '#9C27B0',
  supervisor: '#2196F3',
  implant_incharge: '#FF9800',
  student: '#4CAF50',
  nurse: '#E91E63',
};

const ROLE_DISPLAY: Record<string, string> = {
  administrator: 'Administrator',
  supervisor: 'Supervisor',
  implant_incharge: 'Implant Incharge',
  student: 'PG Student',
  nurse: 'Nurse',
};

export default function UserManagementScreen() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterRole, setFilterRole] = useState('all');

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'student' });

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

  const onRefresh = () => { setRefreshing(true); loadUsers(); };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setCreating(true);
    try {
      await api.post('/users', newUser);
      Alert.alert('Success', 'User created successfully');
      setShowCreateModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'student' });
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

  const isAdmin = user?.role === 'administrator' || user?.role === 'implant_incharge';

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

  const renderUser = ({ item }: any) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => openEditModal(item)}
      data-testid={`user-card-${item.id}`}
    >
      <View style={styles.userRow}>
        <View style={[styles.userAvatar, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
          <Text style={styles.avatarText}>
            {item.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
            <Text style={styles.roleText}>{ROLE_DISPLAY[item.role] || item.role}</Text>
          </View>
        </View>
        <View style={styles.actionBtns}>
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
      {ROLE_OPTIONS.map((option) => (
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
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={styles.userCount} data-testid="user-count">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}

      {/* Create User FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
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
                style={[styles.createBtn, creating && styles.btnDisabled]}
                onPress={handleCreateUser}
                disabled={creating}
                data-testid="submit-create-user"
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.createBtnText}>Create User</Text>
                )}
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
    marginTop: 4,
  },
  roleText: {
    fontSize: 11,
    color: '#FFF',
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
