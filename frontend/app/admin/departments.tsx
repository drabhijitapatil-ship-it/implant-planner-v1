import React, { useCallback, useEffect, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import CenteredHeader from '../../components/CenteredHeader';

/**
 * Department management. Org admin only (user.is_admin) — a department
 * incharge cannot reach this screen, mirroring the backend's
 * _require_org_admin gate on POST/PUT /departments.
 *
 * Assigning a department incharge needs a real department _id, so it's only
 * offered once one exists — for a brand-new department, creating it flips
 * the same modal from "New Department" into "Manage Department" in place
 * (editingDept gets set to the just-created dept) so it reads as one
 * continuous action instead of a create-then-go-find-it-again flow.
 */

type Department = { id: string; name: string };
type InchargeUser = { id: string; name: string; email: string; department_id?: string | null; role?: string; is_admin?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INCHARGES_PER_DEPT = 2;

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export default function DepartmentsScreen() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Incharges assigned to editingDept, plus org-wide implant_incharge users
  // with no department yet (eligible to be assigned here).
  const [assignedIncharges, setAssignedIncharges] = useState<InchargeUser[]>([]);
  const [unassignedIncharges, setUnassignedIncharges] = useState<InchargeUser[]>([]);
  const [loadingIncharges, setLoadingIncharges] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [showNewInchargeForm, setShowNewInchargeForm] = useState(false);
  const [newIncharge, setNewIncharge] = useState({ name: '', email: '' });

  const loadDepartments = useCallback(async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data?.departments || []);
    } catch (error) {
      console.error('Failed to load departments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDepartments();
  };

  const loadIncharges = useCallback(async (deptId: string) => {
    setLoadingIncharges(true);
    try {
      // A department incharge can be either an Implant In-Charge or an
      // Administrator (org co-admin) — the org owner (is_admin=true) is
      // excluded since department_id has no effect on them (they always
      // stay org-wide, see backend _dept_scope_query).
      const [inchargeRes, adminRes] = await Promise.all([
        api.get('/users', { params: { role: 'implant_incharge' } }),
        api.get('/users', { params: { role: 'administrator' } }),
      ]);
      const all: InchargeUser[] = [
        ...(inchargeRes.data || []),
        ...(adminRes.data || []).filter((u: InchargeUser) => !u.is_admin),
      ];
      setAssignedIncharges(all.filter((u) => u.department_id === deptId));
      setUnassignedIncharges(all.filter((u) => !u.department_id));
    } catch (error) {
      console.error('Failed to load incharges:', error);
    } finally {
      setLoadingIncharges(false);
    }
  }, []);

  useEffect(() => {
    if (showModal && editingDept) {
      loadIncharges(editingDept.id);
    } else {
      setAssignedIncharges([]);
      setUnassignedIncharges([]);
    }
  }, [showModal, editingDept, loadIncharges]);

  const openCreateModal = () => {
    setEditingDept(null);
    setNameInput('');
    setShowModal(true);
  };

  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setNameInput(dept.name);
    setShowModal(true);
  };

  const handleSave = async () => {
    const name = nameInput.trim();
    if (!name) {
      Alert.alert('Error', 'Department name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingDept) {
        await api.put(`/departments/${editingDept.id}`, { name });
        setShowModal(false);
      } else {
        const res = await api.post('/departments', { name });
        // Switch into "manage" mode for the dept just created — modal stays
        // open so incharge assignment is right there, not a separate trip.
        setEditingDept({ id: res.data.id, name: res.data.name });
      }
      loadDepartments();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to save department',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDepartment = () => {
    if (!editingDept) return;
    Alert.alert(
      'Delete Department',
      `Delete "${editingDept.name}"? This only works if no users are assigned to it — cases already created under it keep their history either way.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.delete(`/departments/${editingDept.id}`);
              setShowModal(false);
              loadDepartments();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete department');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  // Stacking two native <Modal>s at once (the department modal + the
  // assign-picker/new-incharge modal on top of it) is a known cause of the
  // whole screen going unresponsive on iOS — only one is ever visible at a
  // time, hiding the department modal while its sub-modal is open and
  // restoring it after.
  const openAssignPicker = () => { setShowModal(false); setShowAssignPicker(true); };
  const closeAssignPicker = () => { setShowAssignPicker(false); setShowModal(true); };
  const openNewInchargeForm = () => { setShowModal(false); setShowNewInchargeForm(true); };
  const closeNewInchargeForm = () => { setShowNewInchargeForm(false); setShowModal(true); };

  const handleAssignExisting = async (u: InchargeUser) => {
    if (!editingDept) return;
    setAssigning(true);
    try {
      await api.put(`/users/${u.id}`, { department_id: editingDept.id });
      closeAssignPicker();
      loadIncharges(editingDept.id);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to assign incharge');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveIncharge = (u: InchargeUser) => {
    if (!editingDept) return;
    Alert.alert(
      'Remove Incharge',
      `Remove ${u.name} from ${editingDept.name}? They'll become org-wide (no department) instead of being deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/users/${u.id}`, { department_id: '' });
              loadIncharges(editingDept.id);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to remove incharge');
            }
          },
        },
      ],
    );
  };

  const handleCreateIncharge = async () => {
    if (!editingDept) return;
    const name = newIncharge.name.trim();
    const email = newIncharge.email.trim();
    if (!name || !EMAIL_RE.test(email)) {
      Alert.alert('Error', 'A valid name and email are required');
      return;
    }
    setAssigning(true);
    const password = generatePassword();
    try {
      const resp = await api.post('/users', {
        name,
        email,
        password,
        role: 'implant_incharge',
        department_id: editingDept.id,
      });
      closeNewInchargeForm();
      setNewIncharge({ name: '', email: '' });
      loadIncharges(editingDept.id);
      Alert.alert(
        'Incharge Created',
        resp.data?.email_sent
          ? `${name} has been added as Implant In-Charge for ${editingDept.name}. Login credentials were emailed to them.`
          : `${name} has been added as Implant In-Charge for ${editingDept.name}. Credentials email failed — share this password manually: ${password}`,
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create incharge');
    } finally {
      setAssigning(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <CenteredHeader title="Departments" fallback="/(tabs)/user-management" />
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>
            Only the organization admin can manage departments
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const atCap = assignedIncharges.length >= MAX_INCHARGES_PER_DEPT;

  return (
    <SafeAreaView style={styles.container}>
      <CenteredHeader
        title="Departments"
        subtitle={`${departments.length} department${departments.length !== 1 ? 's' : ''}`}
        fallback="/(tabs)/user-management"
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : (
        <FlatList
          data={departments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <Text style={styles.hint}>
              Each department gets its own Implant In-Charge, students, and
              supervisors — isolated from the rest of the organization. Tap a
              department to assign its incharge.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.deptCard}
              onPress={() => openEditModal(item)}
              data-testid={`department-card-${item.id}`}
            >
              <View style={styles.deptIconBg}>
                <Ionicons name="business-outline" size={20} color="#1565C0" />
              </View>
              <Text style={styles.deptName} numberOfLines={1}>
                {item.name}
              </Text>
              <Ionicons name="create-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No departments yet</Text>
              <Text style={styles.emptySubtext}>
                Create one to start splitting cases and users by department.
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateModal}
        data-testid="create-department-fab"
      >
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} data-testid="department-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingDept ? editingDept.name : 'New Department'}
                </Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Department Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Prosthodontics"
                placeholderTextColor="#999"
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus={!editingDept}
                data-testid="department-name-input"
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={saving}
                data-testid="submit-department"
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingDept ? 'Save Name' : 'Create Department'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Incharge assignment — only once the department actually
                  exists (either editing an existing one, or right after
                  creating a new one above). */}
              {editingDept && (
                <View style={styles.inchargeSection}>
                  <Text style={styles.inputLabel}>Department Incharge</Text>

                  {loadingIncharges ? (
                    <ActivityIndicator color="#1A73E8" style={{ marginVertical: 8 }} />
                  ) : (
                    <>
                      {assignedIncharges.length === 0 && (
                        <Text style={styles.hintSmall}>No incharge assigned yet</Text>
                      )}
                      {assignedIncharges.map((u) => (
                        <View key={u.id} style={styles.inchargeRow} data-testid={`assigned-incharge-${u.id}`}>
                          <View style={styles.inchargeAvatarBg}>
                            <Ionicons name="person" size={16} color="#1565C0" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.inchargeName}>{u.name}</Text>
                              <View style={styles.roleBadge}>
                                <Text style={styles.roleBadgeText}>
                                  {u.role === 'administrator' ? 'Admin' : 'Implant In-Charge'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.inchargeEmail}>{u.email}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveIncharge(u)}
                            data-testid={`remove-incharge-${u.id}`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close-circle-outline" size={22} color="#EF5350" />
                          </TouchableOpacity>
                        </View>
                      ))}

                      {atCap ? (
                        <Text style={styles.hintSmall}>
                          Maximum {MAX_INCHARGES_PER_DEPT} incharges reached for this department
                        </Text>
                      ) : (
                        <View style={styles.inchargeActionsRow}>
                          <TouchableOpacity
                            style={styles.inchargeActionBtn}
                            onPress={openAssignPicker}
                            data-testid="assign-existing-incharge-btn"
                          >
                            <Ionicons name="link-outline" size={16} color="#1A73E8" />
                            <Text style={styles.inchargeActionBtnText}>Assign Existing</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.inchargeActionBtn}
                            onPress={openNewInchargeForm}
                            data-testid="create-new-incharge-btn"
                          >
                            <Ionicons name="person-add-outline" size={16} color="#1A73E8" />
                            <Text style={styles.inchargeActionBtnText}>Create New</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {editingDept && (
                <TouchableOpacity
                  style={[styles.deleteBtn, saving && styles.btnDisabled]}
                  onPress={handleDeleteDepartment}
                  disabled={saving}
                  data-testid="delete-department-btn"
                >
                  <Ionicons name="trash-outline" size={16} color="#EF5350" />
                  <Text style={styles.deleteBtnText}>Delete Department</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assign an existing org-wide Implant In-Charge to editingDept */}
      <Modal visible={showAssignPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={closeAssignPicker}
          data-testid="assign-picker-overlay"
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Assign Existing Incharge</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {unassignedIncharges.length === 0 ? (
                <Text style={styles.hintSmall}>
                  No unassigned Implant In-Charge or Admin available — create a new one
                  instead, or free one up from another department first.
                </Text>
              ) : (
                unassignedIncharges.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.pickerItem}
                    onPress={() => handleAssignExisting(u)}
                    disabled={assigning}
                    data-testid={`assign-picker-option-${u.id}`}
                  >
                    <Ionicons name="person-circle-outline" size={20} color="#666" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.pickerItemText}>{u.name}</Text>
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>
                            {u.role === 'administrator' ? 'Admin' : 'Implant In-Charge'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.inchargeEmail}>{u.email}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create a brand-new Implant In-Charge directly into editingDept */}
      <Modal visible={showNewInchargeForm} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} data-testid="new-incharge-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Implant In-Charge</Text>
              <TouchableOpacity onPress={closeNewInchargeForm}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Dr. Jane Doe"
              placeholderTextColor="#999"
              value={newIncharge.name}
              onChangeText={(text) => setNewIncharge((v) => ({ ...v, name: text }))}
              data-testid="new-incharge-name-input"
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="jane.doe@dental.edu"
              placeholderTextColor="#999"
              value={newIncharge.email}
              onChangeText={(text) => setNewIncharge((v) => ({ ...v, email: text }))}
              keyboardType="email-address"
              autoCapitalize="none"
              data-testid="new-incharge-email-input"
            />

            <Text style={styles.hintSmall}>
              A password is generated automatically and emailed to them.
            </Text>

            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 12 }, assigning && styles.btnDisabled]}
              onPress={handleCreateIncharge}
              disabled={assigning}
              data-testid="submit-new-incharge"
            >
              {assigning ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Create &amp; Assign</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  accessDeniedText: { fontSize: 20, fontWeight: '700', color: '#333' },
  accessDeniedSubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  hint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  hintSmall: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 4,
  },
  deptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  deptIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A202C' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#333' },
  emptySubtext: { fontSize: 13, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
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
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1A202C',
    marginBottom: 20,
  },
  saveBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFEBEE',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#EF5350' },
  inchargeSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inchargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inchargeAvatarBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inchargeName: { fontSize: 14, fontWeight: '600', color: '#1A202C' },
  inchargeEmail: { fontSize: 12, color: '#64748B' },
  roleBadge: { backgroundColor: '#EDF2F7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  inchargeActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  inchargeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingVertical: 10,
  },
  inchargeActionBtnText: { fontSize: 13, fontWeight: '700', color: '#1A73E8' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerSheet: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    maxHeight: 420,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1A202C', marginBottom: 8 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemText: { fontSize: 14, color: '#333', fontWeight: '600' },
});
