import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import CenteredHeader from '../../components/CenteredHeader';

/**
 * Subscription plan template management — super_admin only.
 *
 * Editing a plan here only changes the template. It never touches an org's
 * already-locked-in subscription (org_subscriptions, built separately) —
 * those are frozen snapshots taken at the moment an org subscribes, exactly
 * so a price/cap change here doesn't retroactively affect existing
 * subscribers.
 */

type Plan = {
  key: string;
  org_type: 'college' | 'clinic';
  name: string;
  max_users: number;
  max_students?: number | null;
  max_department?: number | null;
  max_implant_incharges?: number | null;
  price_monthly: number;
  price_yearly: number;
  launch_offer_first_year_price?: number | null;
  active: boolean;
  updated_by?: string;
};

type TrialSettings = {
  enabled: boolean;
  trial_days: number;
  max_users: number | null;
  max_students: number | null;
  max_department: number | null;
  max_implant_incharges: number | null;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function SubscriptionPlansAdmin() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Free trial — configured exactly like a real plan (days + every cap),
  // applies the same way to both college and clinic signups. Toggle saves
  // instantly; the rest needs an explicit Save so half-typed numbers don't
  // get sent on every keystroke.
  const [trial, setTrial] = useState<TrialSettings | null>(null);
  const [trialForm, setTrialForm] = useState<Record<string, string>>({});
  const [savingTrial, setSavingTrial] = useState(false);
  const [togglingTrial, setTogglingTrial] = useState(false);

  const applyTrial = (data: any): TrialSettings => ({
    enabled: !!data?.enabled,
    trial_days: data?.trial_days ?? 14,
    max_users: data?.max_users ?? null,
    max_students: data?.max_students ?? null,
    max_department: data?.max_department ?? null,
    max_implant_incharges: data?.max_implant_incharges ?? 2,
  });

  const loadTrial = useCallback(async () => {
    try {
      const res = await api.get('/trial-settings');
      const t = applyTrial(res.data);
      setTrial(t);
      setTrialForm({
        trial_days: String(t.trial_days),
        max_users: t.max_users != null ? String(t.max_users) : '',
        max_students: t.max_students != null ? String(t.max_students) : '',
        max_department: t.max_department != null ? String(t.max_department) : '',
        max_implant_incharges: t.max_implant_incharges != null ? String(t.max_implant_incharges) : '',
      });
    } catch (e: any) {
      // best-effort — plans list still works without it
    }
  }, []);

  const toggleTrialEnabled = async (value: boolean) => {
    if (!trial) return;
    setTogglingTrial(true);
    const prev = trial;
    setTrial({ ...trial, enabled: value });
    try {
      const res = await api.put('/trial-settings', { enabled: value });
      setTrial(applyTrial(res.data));
    } catch (e: any) {
      setTrial(prev);
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to update trial setting');
    } finally {
      setTogglingTrial(false);
    }
  };

  const trialNumOrUndef = (v: string) => (v.trim() === '' ? undefined : parseInt(v, 10));

  const saveTrialForm = async () => {
    const days = parseInt(trialForm.trial_days, 10);
    if (!days || days < 1 || days > 365) {
      Alert.alert('Error', 'Enter a trial length between 1 and 365 days');
      return;
    }
    setSavingTrial(true);
    try {
      const res = await api.put('/trial-settings', {
        trial_days: days,
        max_users: trialNumOrUndef(trialForm.max_users),
        max_students: trialNumOrUndef(trialForm.max_students),
        max_department: trialNumOrUndef(trialForm.max_department),
        max_implant_incharges: trialNumOrUndef(trialForm.max_implant_incharges),
      });
      setTrial(applyTrial(res.data));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to update trial settings');
    } finally {
      setSavingTrial(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get('/subscription-plans');
      setPlans(res.data?.plans || []);
    } catch (e: any) {
      Alert.alert('Failed to load plans', e?.response?.data?.detail || String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    loadTrial();
  }, [isSuperAdmin, load, loadTrial]);

  useFocusEffect(
    useCallback(() => {
      if (!isSuperAdmin) return;
      load();
      loadTrial();
    }, [isSuperAdmin, load, loadTrial]),
  );

  // ── Edit / create modal ──
  const [editing, setEditing] = useState<Plan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formOrgType, setFormOrgType] = useState<'college' | 'clinic'>('college');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const openEdit = (plan: Plan) => {
    setIsNew(false);
    setEditing(plan);
    setFormOrgType(plan.org_type);
    setFormActive(plan.active);
    setForm({
      key: plan.key,
      name: plan.name,
      max_users: String(plan.max_users),
      max_students: plan.max_students != null ? String(plan.max_students) : '',
      max_department: plan.max_department != null ? String(plan.max_department) : '',
      max_implant_incharges: plan.max_implant_incharges != null ? String(plan.max_implant_incharges) : '',
      price_monthly: String(plan.price_monthly),
      price_yearly: String(plan.price_yearly),
      launch_offer_first_year_price: plan.launch_offer_first_year_price != null ? String(plan.launch_offer_first_year_price) : '',
    });
  };

  const openNew = () => {
    setIsNew(true);
    setEditing({} as Plan);
    setFormOrgType('college');
    setFormActive(true);
    setForm({
      key: '', name: '', max_users: '', max_students: '', max_department: '',
      max_implant_incharges: '', price_monthly: '', price_yearly: '', launch_offer_first_year_price: '',
    });
  };

  const closeEdit = () => setEditing(null);

  const numOrUndef = (v: string) => (v.trim() === '' ? undefined : parseFloat(v));

  const save = async () => {
    if (!form.name?.trim()) {
      Alert.alert('Error', 'Plan name is required');
      return;
    }
    if (!form.max_users?.trim() || !form.price_monthly?.trim() || !form.price_yearly?.trim()) {
      Alert.alert('Error', 'Max users, monthly price, and yearly price are required');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        if (!form.key?.trim() || !/^[a-z0-9_]+$/.test(form.key.trim())) {
          Alert.alert('Error', 'Key is required — lowercase letters, numbers, underscores only');
          setSaving(false);
          return;
        }
        await api.post('/subscription-plans', {
          key: form.key.trim(),
          org_type: formOrgType,
          name: form.name.trim(),
          max_users: parseInt(form.max_users, 10),
          max_students: numOrUndef(form.max_students),
          max_department: numOrUndef(form.max_department),
          max_implant_incharges: numOrUndef(form.max_implant_incharges),
          price_monthly: parseFloat(form.price_monthly),
          price_yearly: parseFloat(form.price_yearly),
          launch_offer_first_year_price: numOrUndef(form.launch_offer_first_year_price),
          active: formActive,
        });
      } else {
        await api.put(`/subscription-plans/${editing!.key}`, {
          name: form.name.trim(),
          max_users: parseInt(form.max_users, 10),
          max_students: numOrUndef(form.max_students),
          max_department: numOrUndef(form.max_department),
          max_implant_incharges: numOrUndef(form.max_implant_incharges),
          price_monthly: parseFloat(form.price_monthly),
          price_yearly: parseFloat(form.price_yearly),
          launch_offer_first_year_price: numOrUndef(form.launch_offer_first_year_price),
          active: formActive,
        });
      }
      closeEdit();
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = (plan: Plan) => {
    Alert.alert(
      `Delete '${plan.name}'?`,
      'This removes the plan template permanently. Blocked if any org is actively subscribed to it — deactivate instead in that case.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/subscription-plans/${plan.key}`);
              closeEdit();
              await load();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail || 'Failed to delete plan');
            }
          },
        },
      ],
    );
  };

  if (!isSuperAdmin) {
    return (
      <SafeAreaView style={s.container}>
        <CenteredHeader title="Subscription Plans" fallback="/super-admin-dashboard" />
        <View style={s.accessDenied}>
          <Ionicons name="lock-closed" size={48} color="#CCC" />
          <Text style={s.accessDeniedText}>Access Restricted</Text>
          <Text style={s.accessDeniedSubtext}>Only the platform super admin can manage subscription plans</Text>
        </View>
      </SafeAreaView>
    );
  }

  const colleges = plans.filter((p) => p.org_type === 'college');
  const clinics = plans.filter((p) => p.org_type === 'clinic');

  return (
    <SafeAreaView style={s.container}>
      <CenteredHeader title="Subscription Plans" subtitle={`${plans.length} plan${plans.length === 1 ? '' : 's'}`} fallback="/super-admin-dashboard" />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#4527A0" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <Text style={s.hint}>
            Editing a plan only changes the template for future subscriptions. Orgs already subscribed keep their
            locked-in price and caps.
          </Text>

          {trial && (
            <View style={s.trialCard} data-testid="trial-settings-card">
              <View style={s.trialHeaderRow}>
                <View style={s.trialIconWrap}>
                  <Ionicons name="gift" size={18} color="#00695C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.trialTitle}>Free Trial</Text>
                  <Text style={s.trialSub}>Applies to both college and clinic signups</Text>
                </View>
                <Switch
                  value={trial.enabled}
                  onValueChange={toggleTrialEnabled}
                  disabled={togglingTrial}
                  data-testid="trial-enabled-switch"
                />
              </View>
              <View style={s.trialFieldRow}>
                <View style={s.trialFieldHalf}>
                  <Text style={s.trialFieldLabel}>Trial Length (days)</Text>
                  <TextInput
                    style={s.trialInput}
                    keyboardType="number-pad"
                    value={trialForm.trial_days}
                    onChangeText={(v) => setTrialForm((f) => ({ ...f, trial_days: v }))}
                    editable={trial.enabled}
                    data-testid="trial-days-input"
                  />
                </View>
                <View style={s.trialFieldHalf}>
                  <Text style={s.trialFieldLabel}>Max Users</Text>
                  <TextInput
                    style={s.trialInput}
                    keyboardType="number-pad"
                    placeholder="Unlimited"
                    placeholderTextColor="#80A199"
                    value={trialForm.max_users}
                    onChangeText={(v) => setTrialForm((f) => ({ ...f, max_users: v }))}
                    editable={trial.enabled}
                    data-testid="trial-max-users-input"
                  />
                </View>
              </View>
              <View style={s.trialFieldRow}>
                <View style={s.trialFieldHalf}>
                  <Text style={s.trialFieldLabel}>Max Department</Text>
                  <TextInput
                    style={s.trialInput}
                    keyboardType="number-pad"
                    placeholder="Unlimited"
                    placeholderTextColor="#80A199"
                    value={trialForm.max_department}
                    onChangeText={(v) => setTrialForm((f) => ({ ...f, max_department: v }))}
                    editable={trial.enabled}
                    data-testid="trial-max-department-input"
                  />
                </View>
                <View style={s.trialFieldHalf}>
                  <Text style={s.trialFieldLabel}>Max Students</Text>
                  <TextInput
                    style={s.trialInput}
                    keyboardType="number-pad"
                    placeholder="Unlimited"
                    placeholderTextColor="#80A199"
                    value={trialForm.max_students}
                    onChangeText={(v) => setTrialForm((f) => ({ ...f, max_students: v }))}
                    editable={trial.enabled}
                    data-testid="trial-max-students-input"
                  />
                </View>
              </View>
              <View style={s.trialFieldRow}>
                <View style={s.trialFieldHalf}>
                  <Text style={s.trialFieldLabel}>Max Implant In-Charges</Text>
                  <TextInput
                    style={s.trialInput}
                    keyboardType="number-pad"
                    value={trialForm.max_implant_incharges}
                    onChangeText={(v) => setTrialForm((f) => ({ ...f, max_implant_incharges: v }))}
                    editable={trial.enabled}
                    data-testid="trial-max-incharges-input"
                  />
                </View>
                <View style={s.trialFieldHalf}>
                  <TouchableOpacity
                    style={[s.trialSaveBtn, (!trial.enabled || savingTrial) && s.btnDisabled]}
                    onPress={saveTrialForm}
                    disabled={!trial.enabled || savingTrial}
                    data-testid="trial-save-btn"
                  >
                    {savingTrial ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.trialSaveBtnText}>Save Trial Settings</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <Text style={s.groupTitle}>College Version</Text>
          {colleges.map((p) => <PlanCard key={p.key} plan={p} onPress={() => openEdit(p)} />)}

          <Text style={s.groupTitle}>Dental Clinic Version</Text>
          {clinics.map((p) => <PlanCard key={p.key} plan={p} onPress={() => openEdit(p)} />)}
        </ScrollView>
      )}

      <TouchableOpacity style={s.fab} onPress={openNew} data-testid="add-plan-fab">
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={closeEdit}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalContent} data-testid="plan-edit-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{isNew ? 'New Plan' : editing?.name}</Text>
                <TouchableOpacity onPress={closeEdit}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {isNew && (
                <>
                  <Text style={s.inputLabel}>Key (unique, lowercase)</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. clinic_premium_plus"
                    placeholderTextColor="#999"
                    value={form.key}
                    onChangeText={(v) => setForm((f) => ({ ...f, key: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                    autoCapitalize="none"
                    data-testid="plan-key-input"
                  />

                  <Text style={s.inputLabel}>Applies To</Text>
                  <View style={s.segmentRow}>
                    {(['college', 'clinic'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[s.segmentBtn, formOrgType === t && s.segmentBtnActive]}
                        onPress={() => setFormOrgType(t)}
                        data-testid={`plan-org-type-${t}`}
                      >
                        <Text style={[s.segmentBtnText, formOrgType === t && s.segmentBtnTextActive]}>
                          {t === 'college' ? 'College' : 'Clinic'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={s.inputLabel}>Plan Name</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Department Essential"
                placeholderTextColor="#999"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                data-testid="plan-name-input"
              />

              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Max Users (total cap)</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={form.max_users}
                    onChangeText={(v) => setForm((f) => ({ ...f, max_users: v }))} data-testid="plan-max-users-input" />
                </View>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Max Students</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={form.max_students}
                    placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setForm((f) => ({ ...f, max_students: v }))} data-testid="plan-max-students-input" />
                </View>
              </View>

              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Max Department</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={form.max_department}
                    placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setForm((f) => ({ ...f, max_department: v }))} data-testid="plan-max-department-input" />
                </View>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Max Implant In-Charges</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={form.max_implant_incharges}
                    placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setForm((f) => ({ ...f, max_implant_incharges: v }))} data-testid="plan-max-incharges-input" />
                </View>
              </View>

              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Price / Month (₹)</Text>
                  <TextInput style={s.input} keyboardType="decimal-pad" value={form.price_monthly}
                    onChangeText={(v) => setForm((f) => ({ ...f, price_monthly: v }))} data-testid="plan-price-monthly-input" />
                </View>
                <View style={s.fieldHalf}>
                  <Text style={s.inputLabel}>Price / Year (₹)</Text>
                  <TextInput style={s.input} keyboardType="decimal-pad" value={form.price_yearly}
                    onChangeText={(v) => setForm((f) => ({ ...f, price_yearly: v }))} data-testid="plan-price-yearly-input" />
                </View>
              </View>

              <Text style={s.inputLabel}>Launch Offer — First Year Price (₹, optional)</Text>
              <TextInput
                style={s.input}
                keyboardType="decimal-pad"
                placeholder="Leave blank if no launch offer"
                placeholderTextColor="#999"
                value={form.launch_offer_first_year_price}
                onChangeText={(v) => setForm((f) => ({ ...f, launch_offer_first_year_price: v }))}
                data-testid="plan-launch-offer-input"
              />

              <View style={s.activeRow}>
                <Text style={s.inputLabel}>Active (visible for new subscriptions)</Text>
                <Switch value={formActive} onValueChange={setFormActive} data-testid="plan-active-switch" />
              </View>

              <TouchableOpacity style={[s.saveBtn, saving && s.btnDisabled]} onPress={save} disabled={saving} data-testid="submit-plan">
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>{isNew ? 'Create Plan' : 'Save Changes'}</Text>}
              </TouchableOpacity>

              {!isNew && (
                <TouchableOpacity style={s.deleteBtn} onPress={() => deletePlan(editing as Plan)} data-testid="delete-plan-btn">
                  <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                  <Text style={s.deleteBtnText}>Delete Plan</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function PlanCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.planCard, !plan.active && s.planCardInactive]} onPress={onPress} data-testid={`plan-card-${plan.key}`}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.planName}>{plan.name}</Text>
          {!plan.active && (
            <View style={s.inactiveChip}><Text style={s.inactiveChipText}>Inactive</Text></View>
          )}
        </View>
        <Text style={s.planCaps}>
          {plan.max_students != null ? `${plan.max_students} students · ` : ''}
          {plan.max_department != null ? `${plan.max_department} dept · ` : ''}
          {plan.max_users} users max
        </Text>
        <View style={s.priceRow}>
          <Text style={s.priceText}>{inr(plan.price_monthly)}/mo</Text>
          <Text style={s.priceDot}>·</Text>
          <Text style={s.priceText}>{inr(plan.price_yearly)}/yr</Text>
          {plan.launch_offer_first_year_price != null && (
            <View style={s.launchChip}>
              <Ionicons name="flash" size={10} color="#B7791F" />
              <Text style={s.launchChipText}>{inr(plan.launch_offer_first_year_price)} yr 1</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="create-outline" size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  accessDeniedText: { fontSize: 20, fontWeight: '700', color: '#333' },
  accessDeniedSubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 100 },
  hint: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 16 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: '#4527A0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  trialCard: { backgroundColor: '#E0F2F1', borderRadius: 14, borderWidth: 1, borderColor: '#B2DFDB', padding: 14, marginBottom: 18 },
  trialHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trialIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  trialTitle: { fontSize: 15, fontWeight: '700', color: '#00695C' },
  trialSub: { fontSize: 12, color: '#4E7D78', marginTop: 1 },
  trialFieldRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  trialFieldHalf: { flex: 1, justifyContent: 'flex-end' },
  trialFieldLabel: { fontSize: 12, fontWeight: '600', color: '#00695C', marginBottom: 6 },
  trialInput: { borderWidth: 1, borderColor: '#80CBC4', borderRadius: 8, padding: 10, fontSize: 14, color: '#1A202C', backgroundColor: '#FFF' },
  trialSaveBtn: { backgroundColor: '#00695C', borderRadius: 8, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  trialSaveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  planCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 10, gap: 10,
  },
  planCardInactive: { opacity: 0.55 },
  planName: { fontSize: 15, fontWeight: '700', color: '#1A202C' },
  planCaps: { fontSize: 12, color: '#64748B', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  priceText: { fontSize: 13, fontWeight: '700', color: '#00695C' },
  priceDot: { color: '#CBD5E1' },
  launchChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF8E1', borderColor: '#FFD54F', borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  launchChipText: { fontSize: 10, fontWeight: '700', color: '#B7791F' },
  inactiveChip: { backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  inactiveChipText: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#4527A0', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#546E7A', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15, color: '#1A202C' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  segmentBtnActive: { borderColor: '#4527A0', backgroundColor: '#EDE7F6' },
  segmentBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  segmentBtnTextActive: { color: '#4527A0' },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  saveBtn: { backgroundColor: '#4527A0', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFCDD2', backgroundColor: '#FFEBEE' },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#D32F2F' },
});
