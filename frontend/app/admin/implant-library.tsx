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
 * Implant Size Library management — Administrator only.
 *
 * This is the flat diameter/length size matrix used by the implant picker
 * (/implant-library/systems), separate from the richer component/connection
 * catalog managed at /admin/implant-catalog. Lets an admin add a brand-new
 * implant company/system or new sizes to an existing one — and remove
 * discontinued sizes/systems — without an app build, since the picker reads
 * this collection live.
 */

type LibrarySystem = {
  brand: string;
  system: string;
  diameters: number[];
  lengths: number[];
  count: number;
};

type LibraryRow = {
  brand: string;
  system: string;
  diameter: number;
  length: number;
  source?: string;
  added_by?: string;
};

type SizePair = { diameter: string; length: string };

export default function ImplantLibraryAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator' || user?.role === 'super_admin';

  const [systems, setSystems] = useState<LibrarySystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/implant-library/systems');
      setSystems(res.data || []);
    } catch (e: any) {
      Alert.alert('Failed to load library', e?.response?.data?.detail || String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const loadRows = useCallback(async (brand: string, system: string) => {
    setRowsLoading(true);
    try {
      const res = await api.get('/implant-library/rows', { params: { brand, system } });
      setRows(res.data?.rows || []);
    } catch (e: any) {
      Alert.alert('Failed to load sizes', e?.response?.data?.detail || String(e?.message || e));
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const toggleExpand = (sys: LibrarySystem) => {
    const key = `${sys.brand}|${sys.system}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      setRows([]);
      return;
    }
    setExpandedKey(key);
    setRows([]);
    loadRows(sys.brand, sys.system);
  };

  // ── Add System modal ──
  const [showAddSystem, setShowAddSystem] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newSystem, setNewSystem] = useState('');
  const [pendingSizes, setPendingSizes] = useState<SizePair[]>([]);
  const [sizeDiameter, setSizeDiameter] = useState('');
  const [sizeLength, setSizeLength] = useState('');
  const [savingSystem, setSavingSystem] = useState(false);

  const openAddSystem = () => {
    setNewBrand('');
    setNewSystem('');
    setPendingSizes([]);
    setSizeDiameter('');
    setSizeLength('');
    setShowAddSystem(true);
  };

  const addPendingSize = () => {
    const d = parseFloat(sizeDiameter);
    const l = parseFloat(sizeLength);
    if (!d || !l) {
      Alert.alert('Error', 'Enter both diameter and length (mm)');
      return;
    }
    if (pendingSizes.some((p) => parseFloat(p.diameter) === d && parseFloat(p.length) === l)) {
      Alert.alert('Error', 'That size is already in the list');
      return;
    }
    setPendingSizes((prev) => [...prev, { diameter: sizeDiameter, length: sizeLength }]);
    setSizeDiameter('');
    setSizeLength('');
  };

  const removePendingSize = (idx: number) => {
    setPendingSizes((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveNewSystem = async () => {
    const brand = newBrand.trim();
    const system = newSystem.trim();
    if (!brand || !system) {
      Alert.alert('Error', 'Enter both company (brand) and system name');
      return;
    }
    if (pendingSizes.length === 0) {
      Alert.alert('Error', 'Add at least one diameter/length size');
      return;
    }
    setSavingSystem(true);
    try {
      await api.post('/implant-library/system', {
        brand,
        system,
        sizes: pendingSizes.map((p) => ({ diameter: parseFloat(p.diameter), length: parseFloat(p.length) })),
      });
      setShowAddSystem(false);
      await load();
      Alert.alert('Added', `${brand} ${system} is now live in the implant picker — no app update needed.`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to add system');
    } finally {
      setSavingSystem(false);
    }
  };

  // ── Add Size (to an existing, expanded system) modal ──
  const [showAddSize, setShowAddSize] = useState<LibrarySystem | null>(null);
  const [addSizeDiameter, setAddSizeDiameter] = useState('');
  const [addSizeLength, setAddSizeLength] = useState('');
  const [savingSize, setSavingSize] = useState(false);

  const openAddSize = (sys: LibrarySystem) => {
    setAddSizeDiameter('');
    setAddSizeLength('');
    setShowAddSize(sys);
  };

  const saveNewSize = async () => {
    if (!showAddSize) return;
    const d = parseFloat(addSizeDiameter);
    const l = parseFloat(addSizeLength);
    if (!d || !l) {
      Alert.alert('Error', 'Enter both diameter and length (mm)');
      return;
    }
    setSavingSize(true);
    try {
      await api.post('/implant-library/size', {
        brand: showAddSize.brand,
        system: showAddSize.system,
        diameter: d,
        length: l,
      });
      const sys = showAddSize;
      setShowAddSize(null);
      await load();
      await loadRows(sys.brand, sys.system);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to add size');
    } finally {
      setSavingSize(false);
    }
  };

  // ── Delete a single size row ──
  const deleteRow = (row: LibraryRow) => {
    Alert.alert(
      'Remove size?',
      `Remove ${row.diameter}mm × ${row.length}mm from ${row.brand} ${row.system}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/implant-library/size', {
                params: { brand: row.brand, system: row.system, diameter: row.diameter, length: row.length },
              });
              await load();
              await loadRows(row.brand, row.system);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail || 'Failed to remove size');
            }
          },
        },
      ],
    );
  };

  // ── Delete an entire system ──
  const deleteSystem = (sys: LibrarySystem) => {
    Alert.alert(
      `Delete '${sys.brand} ${sys.system}'?`,
      `This permanently removes all ${sys.count} size(s) for this system from the picker. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/implant-library/system', { params: { brand: sys.brand, system: sys.system } });
              if (expandedKey === `${sys.brand}|${sys.system}`) {
                setExpandedKey(null);
                setRows([]);
              }
              await load();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail || 'Failed to delete system');
            }
          },
        },
      ],
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container}>
        <CenteredHeader title="Implant Size Library" fallback="/admin/implant-catalog" />
        <View style={s.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={s.accessDeniedText}>Access Restricted</Text>
          <Text style={s.accessDeniedSubtext}>Only the Administrator can manage the implant size library</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <CenteredHeader
        title="Implant Size Library"
        subtitle={`${systems.length} system${systems.length === 1 ? '' : 's'}`}
        fallback="/admin/implant-catalog"
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0277BD" />
        </View>
      ) : (
        <FlatList
          data={systems}
          keyExtractor={(item) => `${item.brand}|${item.system}`}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <Text style={s.hint}>
              Sizes added here are live in the implant picker immediately — no app update needed. New systems keep
              their sizes across backend restarts.
            </Text>
          }
          renderItem={({ item }) => {
            const key = `${item.brand}|${item.system}`;
            const expanded = expandedKey === key;
            return (
              <View style={s.sysCard} data-testid={`library-system-${key}`}>
                <TouchableOpacity style={s.sysCardHeader} onPress={() => toggleExpand(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sysBrand}>{item.brand}</Text>
                    <Text style={s.sysName}>{item.system}</Text>
                    <Text style={s.sysCount}>{item.count} size{item.count === 1 ? '' : 's'}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.trashBtn}
                    onPress={() => deleteSystem(item)}
                    data-testid={`library-delete-system-${key}`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#0277BD" />
                </TouchableOpacity>

                {expanded && (
                  <View style={s.rowsBlock}>
                    {rowsLoading ? (
                      <ActivityIndicator color="#0277BD" style={{ marginVertical: 12 }} />
                    ) : (
                      <>
                        {rows.map((r, idx) => (
                          <View key={idx} style={s.sizeRow} data-testid={`library-size-row-${key}-${idx}`}>
                            <Text style={s.sizeRowText}>
                              Ø {r.diameter}mm × {r.length}mm
                            </Text>
                            {!!r.added_by && <Text style={s.sizeRowMeta}>added by {r.added_by}</Text>}
                            <TouchableOpacity
                              onPress={() => deleteRow(r)}
                              data-testid={`library-delete-size-${key}-${idx}`}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close-circle-outline" size={20} color="#EF5350" />
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          style={s.addSizeBtn}
                          onPress={() => openAddSize(item)}
                          data-testid={`library-add-size-${key}`}
                        >
                          <Ionicons name="add-circle-outline" size={16} color="#0277BD" />
                          <Text style={s.addSizeBtnText}>Add size to this system</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="library-outline" size={48} color="#CCC" />
              <Text style={s.emptyText}>No systems yet</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={s.fab} onPress={openAddSystem} data-testid="library-add-system-fab">
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>

      {/* Add System modal */}
      <Modal visible={showAddSystem} animationType="slide" transparent onRequestClose={() => setShowAddSystem(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalContent} data-testid="add-system-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add Implant System</Text>
                <TouchableOpacity onPress={() => setShowAddSystem(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={s.inputLabel}>Company (Brand)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Nobel Biocare"
                placeholderTextColor="#999"
                value={newBrand}
                onChangeText={setNewBrand}
                data-testid="new-system-brand-input"
              />

              <Text style={s.inputLabel}>System Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. NobelActive"
                placeholderTextColor="#999"
                value={newSystem}
                onChangeText={setNewSystem}
                data-testid="new-system-name-input"
              />

              <Text style={s.inputLabel}>Sizes (diameter × length, mm)</Text>
              <View style={s.sizeInputRow}>
                <TextInput
                  style={[s.input, s.sizeInput]}
                  placeholder="Diameter"
                  placeholderTextColor="#999"
                  value={sizeDiameter}
                  onChangeText={setSizeDiameter}
                  keyboardType="decimal-pad"
                  data-testid="new-size-diameter-input"
                />
                <TextInput
                  style={[s.input, s.sizeInput]}
                  placeholder="Length"
                  placeholderTextColor="#999"
                  value={sizeLength}
                  onChangeText={setSizeLength}
                  keyboardType="decimal-pad"
                  data-testid="new-size-length-input"
                />
                <TouchableOpacity style={s.addChipBtn} onPress={addPendingSize} data-testid="new-size-add-btn">
                  <Ionicons name="add" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              {pendingSizes.length > 0 && (
                <View style={s.chipsRow}>
                  {pendingSizes.map((p, idx) => (
                    <View key={idx} style={s.sizeChip} data-testid={`pending-size-chip-${idx}`}>
                      <Text style={s.sizeChipText}>{p.diameter} × {p.length}mm</Text>
                      <TouchableOpacity onPress={() => removePendingSize(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close" size={14} color="#0277BD" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.saveBtn, savingSystem && s.btnDisabled]}
                onPress={saveNewSystem}
                disabled={savingSystem}
                data-testid="submit-new-system"
              >
                {savingSystem ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Add System</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Size (existing system) modal */}
      <Modal visible={!!showAddSize} animationType="slide" transparent onRequestClose={() => setShowAddSize(null)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalContent} data-testid="add-size-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  Add Size — {showAddSize?.brand} {showAddSize?.system}
                </Text>
                <TouchableOpacity onPress={() => setShowAddSize(null)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={s.inputLabel}>Diameter (mm)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 4.3"
                placeholderTextColor="#999"
                value={addSizeDiameter}
                onChangeText={setAddSizeDiameter}
                keyboardType="decimal-pad"
                autoFocus
                data-testid="add-size-diameter-input"
              />

              <Text style={s.inputLabel}>Length (mm)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 10"
                placeholderTextColor="#999"
                value={addSizeLength}
                onChangeText={setAddSizeLength}
                keyboardType="decimal-pad"
                data-testid="add-size-length-input"
              />

              <TouchableOpacity
                style={[s.saveBtn, savingSize && s.btnDisabled]}
                onPress={saveNewSize}
                disabled={savingSize}
                data-testid="submit-add-size"
              >
                {savingSize ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Add Size</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  accessDeniedText: { fontSize: 20, fontWeight: '700', color: '#333' },
  accessDeniedSubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  hint: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 16 },
  sysCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10, overflow: 'hidden' },
  sysCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  sysBrand: { fontSize: 12, fontWeight: '700', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.5 },
  sysName: { fontSize: 16, fontWeight: '700', color: '#01579B', marginTop: 2 },
  sysCount: { fontSize: 12, color: '#0277BD', fontWeight: '600', marginTop: 2 },
  trashBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEBEE' },
  rowsBlock: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#F0F4F8' },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },
  sizeRowText: { fontSize: 13, fontWeight: '600', color: '#263238', flex: 1 },
  sizeRowMeta: { fontSize: 11, color: '#94A3B8' },
  addSizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  addSizeBtnText: { fontSize: 13, fontWeight: '700', color: '#0277BD' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#333' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#0277BD', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6, marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15, color: '#1A202C' },
  sizeInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sizeInput: { flex: 1 },
  addChipBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#0277BD', alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sizeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E1F5FE', borderColor: '#B3E5FC',
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  sizeChipText: { fontSize: 12, fontWeight: '600', color: '#01579B' },
  saveBtn: { backgroundColor: '#0277BD', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
