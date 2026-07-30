import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Image, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import CenteredHeader from '../../../components/CenteredHeader';

/**
 * Full metrics drill-down for a single organization — super_admin only.
 * Aggregate sections (info / KPIs / phase pipeline / monthly throughput /
 * role breakdown) render as the FlatList header; the user list itself is
 * paginated (skip/limit) and loads more as you scroll to the bottom.
 */

type OrgProfile = {
  id: string;
  name: string;
  org_type: 'college' | 'clinic';
  logo?: string | null;
  created_at: string | null;
  declared_num_users?: number;
  state?: string;
  state_of_registration?: string;
  state_of_practice?: string;
  registration_number?: string;
};

type OrgDetailData = {
  profile: OrgProfile;
  kpis: { total: number; pending: number; approved: number; rejected: number; completed: number };
  phase_pipeline: { phase1: number; phase2: number; phase3: number; phase4: number; completed: number; rejected: number };
  role_breakdown: Record<string, number>;
  monthly_throughput: { label: string; count: number }[];
};

type SubHistoryEntry = { event: string; at: string; by: string; detail: string };

type OrgSubscription = {
  org_id: string;
  status: 'none' | 'trial' | 'active' | 'expired' | 'cancelled';
  plan_key: string | null;
  plan_name: string | null;
  billing_cycle?: 'monthly' | 'yearly' | null;
  price_locked_in?: number | null;
  max_users: number | null;
  max_students: number | null;
  max_department: number | null;
  max_implant_incharges: number | null;
  trial_ends_at?: string | null;
  history?: SubHistoryEntry[];
  requested_plan_key?: string | null;
  requested_plan_name?: string | null;
  requested_billing_cycle?: 'monthly' | 'yearly' | null;
  requested_at?: string | null;
  requested_by?: string | null;
};

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
};

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_photo?: string | null;
  created_at?: string;
};

const ROLE_LABELS: Record<string, string> = {
  implant_incharge: 'Incharge',
  supervisor: 'Supervisor',
  student: 'Student',
  nurse: 'Nurse',
  administrator: 'Admin',
  chief_dentist: 'Chief Dentist',
  dentist: 'Dentist',
  dental_assistant: 'Assistant',
};

const ROLE_COLORS: Record<string, string> = {
  administrator: '#9C27B0',
  supervisor: '#2196F3',
  implant_incharge: '#FF9800',
  student: '#4CAF50',
  nurse: '#E91E63',
  chief_dentist: '#FF9800',
  dentist: '#2196F3',
  dental_assistant: '#E91E63',
};

const PAGE_SIZE = 20;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [detail, setDetail] = useState<OrgDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subForm, setSubForm] = useState<Record<string, string>>({});
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [useLaunchOffer, setUseLaunchOffer] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.replace('/profile');
    }
  }, [user]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/organizations/${id}/detail`);
      setDetail(res.data);
    } catch {
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  const loadSubscription = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/organizations/${id}/subscription`);
      setSubscription(res.data || null);
    } catch {
    }
  }, [id]);

  const loadPlans = useCallback(async () => {
    try {
      const res = await api.get('/subscription-plans');
      setPlans(res.data?.plans || []);
    } catch {
    }
  }, []);

  const loadUsers = useCallback(async (skip: number, replace: boolean) => {
    if (!id) return;
    try {
      const params: any = { skip, limit: PAGE_SIZE };
      if (roleFilter) params.role = roleFilter;
      const res = await api.get(`/organizations/${id}/users`, { params });
      const page: OrgUser[] = res.data?.users || [];
      setUsersTotal(res.data?.total || 0);
      setUsers((prev) => (replace ? page : [...prev, ...page]));
    } catch {
    } finally {
      setUsersLoading(false);
      setUsersLoadingMore(false);
      setRefreshing(false);
    }
  }, [id, roleFilter]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { loadSubscription(); loadPlans(); }, [loadSubscription, loadPlans]);
  useEffect(() => { setUsersLoading(true); loadUsers(0, true); }, [loadUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDetail();
    loadSubscription();
    loadUsers(0, true);
  };

  const openSubModal = () => {
    setSelectedPlanKey(subscription?.plan_key || null);
    setBillingCycle((subscription?.billing_cycle as 'monthly' | 'yearly') || 'monthly');
    setUseLaunchOffer(false);
    setSubForm({
      max_users: subscription?.max_users != null ? String(subscription.max_users) : '',
      max_students: subscription?.max_students != null ? String(subscription.max_students) : '',
      max_department: subscription?.max_department != null ? String(subscription.max_department) : '',
      max_implant_incharges: subscription?.max_implant_incharges != null ? String(subscription.max_implant_incharges) : '',
      trial_days: '',
    });
    setShowSubModal(true);
  };

  const numOrUndef = (v: string) => (v.trim() === '' ? undefined : parseInt(v, 10));

  const saveOverrideOnly = async () => {
    setSavingSub(true);
    try {
      const res = await api.put(`/organizations/${id}/subscription`, {
        max_users: numOrUndef(subForm.max_users),
        max_students: numOrUndef(subForm.max_students),
        max_department: numOrUndef(subForm.max_department),
        max_implant_incharges: numOrUndef(subForm.max_implant_incharges),
        trial_days: numOrUndef(subForm.trial_days),
      });
      setSubscription(res.data);
      setShowSubModal(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to update caps');
    } finally {
      setSavingSub(false);
    }
  };

  const assignPlan = async () => {
    if (!selectedPlanKey) {
      Alert.alert('Error', 'Pick a plan to assign');
      return;
    }
    setSavingSub(true);
    try {
      const res = await api.put(`/organizations/${id}/subscription`, {
        plan_key: selectedPlanKey,
        billing_cycle: billingCycle,
        is_launch_offer: useLaunchOffer,
        max_users: numOrUndef(subForm.max_users),
        max_students: numOrUndef(subForm.max_students),
        max_department: numOrUndef(subForm.max_department),
        max_implant_incharges: numOrUndef(subForm.max_implant_incharges),
      });
      setSubscription(res.data);
      setShowSubModal(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to assign plan');
    } finally {
      setSavingSub(false);
    }
  };

  // Pending self-service upgrade request — Approve pre-fills the assign-plan
  // modal with what they asked for (still reviewable/editable before saving);
  // Dismiss just clears the request without changing their current plan.
  const [showHistory, setShowHistory] = useState(false);
  const [dismissingRequest, setDismissingRequest] = useState(false);

  const approveRequest = () => {
    if (!subscription?.requested_plan_key) return;
    setSelectedPlanKey(subscription.requested_plan_key);
    setBillingCycle((subscription.requested_billing_cycle as 'monthly' | 'yearly') || 'monthly');
    setUseLaunchOffer(false);
    setSubForm({
      max_users: '', max_students: '', max_department: '', max_implant_incharges: '', trial_days: '',
    });
    setShowSubModal(true);
  };

  const dismissRequest = async () => {
    setDismissingRequest(true);
    try {
      const res = await api.post(`/organizations/${id}/subscription/dismiss-request`);
      setSubscription(res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to dismiss request');
    } finally {
      setDismissingRequest(false);
    }
  };

  const trialDaysLeft = (() => {
    if (subscription?.status !== 'trial' || !subscription.trial_ends_at) return null;
    const ms = new Date(subscription.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  })();

  const orgPlans = plans.filter((p) => p.org_type === (detail?.profile?.org_type || 'college'));

  const onEndReached = () => {
    if (usersLoading || usersLoadingMore || refreshing || users.length >= usersTotal) return;
    setUsersLoadingMore(true);
    loadUsers(users.length, false);
  };

  const profile = detail?.profile;
  const kpis = detail?.kpis || { total: 0, pending: 0, approved: 0, rejected: 0, completed: 0 };
  const pp = detail?.phase_pipeline || { phase1: 0, phase2: 0, phase3: 0, phase4: 0, completed: 0, rejected: 0 };
  const monthly = detail?.monthly_throughput || [];
  const roleBreakdown = detail?.role_breakdown || {};
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));
  const maxPipeline = Math.max(1, pp.phase1, pp.phase2, pp.phase3, pp.phase4, pp.completed);

  const availableRoles = Object.keys(roleBreakdown);

  const renderHeader = () => (
    <View>
      {detailLoading ? (
        <View style={s.loadingBox}><ActivityIndicator color="#1565C0" /></View>
      ) : (
        <>
          <View style={s.infoCard}>
            <View style={s.infoTop}>
              {profile?.logo ? (
                <Image source={{ uri: profile.logo }} style={s.typeIconWrap} />
              ) : (
                <View style={[s.typeIconWrap, { backgroundColor: profile?.org_type === 'clinic' ? '#E8F5E9' : '#E3F2FD' }]}>
                  <Ionicons name={profile?.org_type === 'clinic' ? 'medkit' : 'school'} size={22} color={profile?.org_type === 'clinic' ? '#2E7D32' : '#1565C0'} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.orgName}>{profile?.name}</Text>
                <Text style={s.orgType}>{profile?.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'}</Text>
              </View>
            </View>
            <View style={s.infoGrid}>
              {profile?.org_type === 'college' ? (
                <InfoRow icon="location-outline" label="State" value={profile?.state || '—'} />
              ) : (
                <>
                  <InfoRow icon="document-text-outline" label="Registration No." value={profile?.registration_number || '—'} />
                  <InfoRow icon="location-outline" label="Registered in" value={profile?.state_of_registration || '—'} />
                  <InfoRow icon="business-outline" label="Practicing in" value={profile?.state_of_practice || '—'} />
                </>
              )}
              <InfoRow icon="calendar-outline" label="Onboarded" value={formatDate(profile?.created_at)} />
              <InfoRow icon="people-outline" label="Planned Users" value={String(profile?.declared_num_users ?? '—')} />
            </View>
          </View>

          {subscription?.requested_plan_key && (
            <View style={s.requestCard} data-testid="org-upgrade-request-card">
              <View style={s.requestHeaderRow}>
                <Ionicons name="arrow-up-circle" size={18} color="#B7791F" />
                <Text style={s.requestTitle}>Upgrade Requested</Text>
              </View>
              <Text style={s.requestBody}>
                {subscription.requested_by || 'Org admin'} requested <Text style={{ fontWeight: '700' }}>{subscription.requested_plan_name}</Text>
                {' '}({subscription.requested_billing_cycle}) {subscription.requested_at ? `on ${formatDate(subscription.requested_at)}` : ''}
              </Text>
              <View style={s.requestBtnRow}>
                <TouchableOpacity style={s.requestApproveBtn} onPress={approveRequest} data-testid="org-upgrade-approve-btn">
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                  <Text style={s.requestApproveBtnText}>Review &amp; Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.requestDismissBtn, dismissingRequest && { opacity: 0.6 }]}
                  onPress={dismissRequest}
                  disabled={dismissingRequest}
                  data-testid="org-upgrade-dismiss-btn"
                >
                  {dismissingRequest ? <ActivityIndicator size="small" color="#B7791F" /> : <Text style={s.requestDismissBtnText}>Dismiss</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={s.subCard} data-testid="org-subscription-card">
            <View style={s.subHeaderRow}>
              <Text style={s.sectionTitle}>Subscription</Text>
              <TouchableOpacity style={s.subEditBtn} onPress={openSubModal} data-testid="org-subscription-edit-btn">
                <Ionicons name="create-outline" size={14} color="#0D47A1" />
                <Text style={s.subEditBtnText}>Manage</Text>
              </TouchableOpacity>
            </View>
            {subscription?.status === 'none' || !subscription ? (
              <Text style={s.subNone}>No subscription record — legacy org, unlimited by default.</Text>
            ) : (
              <>
                <View style={s.subStatusRow}>
                  <View style={[s.subStatusChip, subStatusStyle(subscription.status)]}>
                    <Text style={[s.subStatusChipText, subStatusTextStyle(subscription.status)]}>
                      {subscription.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={s.subPlanName}>{subscription.plan_name || 'Free Trial'}</Text>
                </View>
                {subscription.status === 'trial' && trialDaysLeft !== null && (
                  <Text style={s.subTrialDays}>{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left in trial</Text>
                )}
                {subscription.price_locked_in != null && subscription.status === 'active' && (
                  <Text style={s.subPrice}>₹{subscription.price_locked_in.toLocaleString('en-IN')} / {subscription.billing_cycle === 'yearly' ? 'year' : 'month'} (locked in)</Text>
                )}
                <View style={s.subCapsRow}>
                  <Text style={s.subCapChip}>{subscription.max_users ?? '∞'} users max</Text>
                  {subscription.max_implant_incharges != null && (
                    <Text style={s.subCapChip}>{subscription.max_implant_incharges} incharge{subscription.max_implant_incharges === 1 ? '' : 's'}</Text>
                  )}
                  {subscription.max_department != null && <Text style={s.subCapChip}>{subscription.max_department} dept</Text>}
                  {subscription.max_students != null && <Text style={s.subCapChip}>{subscription.max_students} students</Text>}
                </View>

                {!!subscription.history?.length && (
                  <>
                    <TouchableOpacity
                      style={s.historyToggle}
                      onPress={() => setShowHistory((v) => !v)}
                      data-testid="org-subscription-history-toggle"
                    >
                      <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={14} color="#0D47A1" />
                      <Text style={s.historyToggleText}>
                        {showHistory ? 'Hide' : 'Show'} history ({subscription.history.length})
                      </Text>
                    </TouchableOpacity>
                    {showHistory && (
                      <View style={s.historyList} data-testid="org-subscription-history-list">
                        {[...subscription.history].reverse().map((h, idx) => (
                          <View key={idx} style={s.historyRow}>
                            <View style={s.historyDot} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.historyDetail}>{h.detail}</Text>
                              <Text style={s.historyMeta}>{h.by} · {formatDate(h.at)}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </View>

          <Text style={s.sectionTitle}>Case KPIs</Text>
          <View style={s.kpiGrid}>
            <KpiBox label="Total" value={kpis.total} color="#0D47A1" />
            <KpiBox label="Pending" value={kpis.pending} color="#EF6C00" />
            <KpiBox label="Approved" value={kpis.approved} color="#1565C0" />
            <KpiBox label="Completed" value={kpis.completed} color="#2E7D32" />
            <KpiBox label="Rejected" value={kpis.rejected} color="#C62828" />
          </View>

          <Text style={s.sectionTitle}>Phase Pipeline</Text>
          <View style={s.pipelineCard}>
            <PipelineBar label="Phase 1" value={pp.phase1} max={maxPipeline} color="#1565C0" />
            <PipelineBar label="Phase 2" value={pp.phase2} max={maxPipeline} color="#9C27B0" />
            <PipelineBar label="Phase 3" value={pp.phase3} max={maxPipeline} color="#EF6C00" />
            <PipelineBar label="Phase 4" value={pp.phase4} max={maxPipeline} color="#00838F" />
            <PipelineBar label="Completed" value={pp.completed} max={maxPipeline} color="#2E7D32" />
          </View>

          <Text style={s.sectionTitle}>Monthly Throughput (completed cases)</Text>
          <View style={s.monthlyCard}>
            {monthly.map((m) => (
              <View key={m.label} style={s.monthlyRow}>
                <Text style={s.monthlyLabel}>{m.label}</Text>
                <View style={s.monthlyBarTrack}>
                  <View style={[s.monthlyBarFill, { width: `${(m.count / maxMonthly) * 100}%` }]} />
                </View>
                <Text style={s.monthlyCount}>{m.count}</Text>
              </View>
            ))}
          </View>

          <View style={s.usersSectionHeader}>
            <Text style={s.sectionTitle}>Users ({usersTotal})</Text>
          </View>
          {availableRoles.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.roleFilterRow}
            >
              <TouchableOpacity
                style={[s.roleFilterChip, !roleFilter && s.roleFilterChipActive]}
                onPress={() => setRoleFilter(null)}
              >
                <Text style={[s.roleFilterText, !roleFilter && s.roleFilterTextActive]}>All</Text>
              </TouchableOpacity>
              {availableRoles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[s.roleFilterChip, roleFilter === role && s.roleFilterChipActive]}
                  onPress={() => setRoleFilter(role)}
                >
                  <Text style={[s.roleFilterText, roleFilter === role && s.roleFilterTextActive]}>
                    {ROLE_LABELS[role] || role} ({roleBreakdown[role]})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );

  const renderUser = ({ item }: { item: OrgUser }) => (
    <View style={s.userCard} data-testid={`org-user-${item.id}`}>
      {item.profile_photo ? (
        <Image source={{ uri: item.profile_photo }} style={s.userAvatarImage} />
      ) : (
        <View style={[s.userAvatar, { backgroundColor: ROLE_COLORS[item.role] || '#757575' }]}>
          <Text style={s.userAvatarText}>{item.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.userName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <View style={[s.userRoleTag, { backgroundColor: (ROLE_COLORS[item.role] || '#757575') + '15' }]}>
        <Text style={[s.userRoleTagText, { color: ROLE_COLORS[item.role] || '#757575' }]}>{ROLE_LABELS[item.role] || item.role}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <CenteredHeader title={profile?.name || 'Organization'} subtitle={profile?.org_type === 'clinic' ? 'Dental Clinic' : 'Dental College'} fallback="/admin/organizations" />
      {usersLoading ? (
        <View style={s.loadingBox}><ActivityIndicator size="large" color="#1565C0" /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={usersLoadingMore ? <ActivityIndicator color="#1565C0" style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="people-outline" size={40} color="#CCC" />
              <Text style={s.emptyText}>No users in this organization yet</Text>
            </View>
          }
        />
      )}

      <Modal visible={showSubModal} animationType="slide" transparent onRequestClose={() => setShowSubModal(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalContent} data-testid="org-subscription-modal">
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Manage Subscription</Text>
                <TouchableOpacity onPress={() => setShowSubModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={s.modalLabel}>Assign / Change Plan</Text>
              {orgPlans.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.planOptRow, selectedPlanKey === p.key && s.planOptRowActive]}
                  onPress={() => setSelectedPlanKey(p.key)}
                  data-testid={`assign-plan-${p.key}`}
                >
                  <Ionicons name={selectedPlanKey === p.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={selectedPlanKey === p.key ? '#0D47A1' : '#94A3B8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.planOptName}>{p.name}</Text>
                    <Text style={s.planOptPrice}>₹{p.price_monthly.toLocaleString('en-IN')}/mo · ₹{p.price_yearly.toLocaleString('en-IN')}/yr{p.launch_offer_first_year_price != null ? ` · launch ₹${p.launch_offer_first_year_price.toLocaleString('en-IN')}` : ''}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {selectedPlanKey && (
                <>
                  <View style={s.segmentRow}>
                    {(['monthly', 'yearly'] as const).map((c) => (
                      <TouchableOpacity key={c} style={[s.segmentBtn, billingCycle === c && s.segmentBtnActive]} onPress={() => setBillingCycle(c)} data-testid={`billing-cycle-${c}`}>
                        <Text style={[s.segmentBtnText, billingCycle === c && s.segmentBtnTextActive]}>{c === 'monthly' ? 'Monthly' : 'Yearly'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={s.launchToggleRow} onPress={() => setUseLaunchOffer((v) => !v)} data-testid="use-launch-offer-toggle">
                    <Ionicons name={useLaunchOffer ? 'checkbox' : 'square-outline'} size={20} color="#0D47A1" />
                    <Text style={s.launchToggleText}>Apply launch offer (first year)</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={[s.modalLabel, { marginTop: 18 }]}>Free Trial</Text>
              <Text style={s.smallLabel}>
                Extend or grant a trial for this org only (independent of the global default) — counted from today.
              </Text>
              <TextInput
                style={s.input}
                keyboardType="number-pad"
                placeholder={subscription?.status === 'trial' ? 'e.g. 14 — resets countdown from today' : 'e.g. 14 — starts a fresh trial'}
                placeholderTextColor="#999"
                value={subForm.trial_days}
                onChangeText={(v) => setSubForm((f) => ({ ...f, trial_days: v }))}
                data-testid="override-trial-days"
              />

              <Text style={[s.modalLabel, { marginTop: 18 }]}>Override Caps (optional — blank = use plan default)</Text>
              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <Text style={s.smallLabel}>Max Users</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={subForm.max_users} placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setSubForm((f) => ({ ...f, max_users: v }))} data-testid="override-max-users" />
                </View>
                <View style={s.fieldHalf}>
                  <Text style={s.smallLabel}>Max Implant In-Charges</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={subForm.max_implant_incharges} placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setSubForm((f) => ({ ...f, max_implant_incharges: v }))} data-testid="override-max-incharges" />
                </View>
              </View>
              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <Text style={s.smallLabel}>Max Department</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={subForm.max_department} placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setSubForm((f) => ({ ...f, max_department: v }))} data-testid="override-max-department" />
                </View>
                <View style={s.fieldHalf}>
                  <Text style={s.smallLabel}>Max Students</Text>
                  <TextInput style={s.input} keyboardType="number-pad" value={subForm.max_students} placeholder="—" placeholderTextColor="#999"
                    onChangeText={(v) => setSubForm((f) => ({ ...f, max_students: v }))} data-testid="override-max-students" />
                </View>
              </View>

              {selectedPlanKey ? (
                <TouchableOpacity style={[s.saveBtn, savingSub && s.btnDisabled]} onPress={assignPlan} disabled={savingSub} data-testid="submit-assign-plan">
                  {savingSub ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Assign Plan</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.saveBtn, savingSub && s.btnDisabled]}
                  onPress={saveOverrideOnly}
                  disabled={savingSub}
                  data-testid="submit-override-caps"
                >
                  {savingSub ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
              )}
              {!selectedPlanKey && (!subscription || subscription.status === 'none') && (
                <Text style={s.subNone}>No existing subscription — enter a trial length above to start one, or pick a plan.</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function subStatusStyle(status: string) {
  if (status === 'trial') return { backgroundColor: '#FFF3E0', borderColor: '#FFCC80' };
  if (status === 'active') return { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' };
  return { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' };
}
function subStatusTextStyle(status: string) {
  if (status === 'trial') return { color: '#E65100' };
  if (status === 'active') return { color: '#2E7D32' };
  return { color: '#C62828' };
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={14} color="#78909C" style={{ marginRight: 6 }} />
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function KpiBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.kpiBox, { borderLeftColor: color }]}>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function PipelineBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={s.pipelineRow}>
      <Text style={s.pipelineLabel}>{label}</Text>
      <View style={s.pipelineTrack}>
        <View style={[s.pipelineFill, { width: `${(value / max) * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={s.pipelineCount}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FC' },
  loadingBox: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 13, color: '#90A4AE', fontWeight: '600' },
  infoCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  typeIconWrap: { width: 46, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  orgName: { fontSize: 18, fontWeight: '800', color: '#0D47A1' },
  orgType: { fontSize: 12, color: '#607D8B', fontWeight: '600', marginTop: 2 },
  infoGrid: { gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 12.5, color: '#78909C', fontWeight: '500', marginRight: 4 },
  infoValue: { fontSize: 12.5, color: '#37474F', fontWeight: '600', flexShrink: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0D47A1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  kpiBox: {
    flexBasis: '30%', flexGrow: 1, minWidth: 100,
    backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#E8EEF5', borderLeftWidth: 4,
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1,
  },
  kpiValue: { fontSize: 20, fontWeight: '800' },
  kpiLabel: { fontSize: 10.5, color: '#78909C', fontWeight: '600', marginTop: 4, textAlign: 'center' },
  pipelineCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 18, gap: 12,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pipelineLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', width: 72 },
  pipelineTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#ECEFF1', overflow: 'hidden' },
  pipelineFill: { height: '100%', borderRadius: 5 },
  pipelineCount: { fontSize: 12.5, fontWeight: '800', color: '#0D47A1', width: 28, textAlign: 'right' },
  monthlyCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 18, gap: 12,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
  },
  monthlyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthlyLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', width: 66 },
  monthlyBarTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#ECEFF1', overflow: 'hidden' },
  monthlyBarFill: { height: '100%', borderRadius: 5, backgroundColor: '#1565C0' },
  monthlyCount: { fontSize: 12.5, fontWeight: '800', color: '#0D47A1', width: 24, textAlign: 'right' },
  usersSectionHeader: { marginTop: 8 },
  roleFilterRow: { flexDirection: 'row', gap: 8, paddingBottom: 12 },
  roleFilterChip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFF',
    borderWidth: 1, borderColor: '#CFD8DC',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2,
  },
  roleFilterChipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  roleFilterText: { fontSize: 12, color: '#546E7A', fontWeight: '600' },
  roleFilterTextActive: { color: '#FFF' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF',
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E8EEF5',
    shadowColor: '#0A2540', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1,
  },
  userAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  userAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  userAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  userName: { fontSize: 14.5, fontWeight: '700', color: '#0D47A1' },
  userEmail: { fontSize: 12, color: '#607D8B', marginTop: 1 },
  userRoleTag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  userRoleTagText: { fontSize: 10.5, fontWeight: '700' },
  // Subscription card
  subCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 4,
    borderWidth: 1, borderColor: '#E8EEF5',
  },
  subHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 0 },
  subEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#BBDEFB', backgroundColor: '#E3F2FD' },
  subEditBtnText: { fontSize: 12, fontWeight: '700', color: '#0D47A1' },
  subNone: { fontSize: 12.5, color: '#90A4AE', marginTop: 8 },
  subStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  subStatusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  subStatusChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  subPlanName: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  subTrialDays: { fontSize: 12.5, color: '#E65100', fontWeight: '600', marginTop: 6 },
  subPrice: { fontSize: 12.5, color: '#2E7D32', fontWeight: '600', marginTop: 6 },
  subCapsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  subCapChip: { fontSize: 11, fontWeight: '600', color: '#546E7A', backgroundColor: '#F5F7FA', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#E2E8F0' },
  // Pending upgrade request card
  requestCard: { backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', padding: 14, marginBottom: 4 },
  requestHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  requestTitle: { fontSize: 14, fontWeight: '800', color: '#B7791F' },
  requestBody: { fontSize: 12.5, color: '#78350F', lineHeight: 18 },
  requestBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  requestApproveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#B7791F', borderRadius: 10, paddingVertical: 10 },
  requestApproveBtnText: { color: '#FFF', fontSize: 12.5, fontWeight: '700' },
  requestDismissBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' },
  requestDismissBtnText: { color: '#B7791F', fontSize: 12.5, fontWeight: '700' },
  // History timeline
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F4F8' },
  historyToggleText: { fontSize: 12.5, fontWeight: '700', color: '#0D47A1' },
  historyList: { marginTop: 10, gap: 10 },
  historyRow: { flexDirection: 'row', gap: 8 },
  historyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#90A4AE', marginTop: 5 },
  historyDetail: { fontSize: 12.5, color: '#263238', fontWeight: '600' },
  historyMeta: { fontSize: 11, color: '#90A4AE', marginTop: 2 },
  // Subscription modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#0D47A1', marginBottom: 8 },
  smallLabel: { fontSize: 12, fontWeight: '600', color: '#546E7A', marginBottom: 6 },
  planOptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },
  planOptRowActive: { borderColor: '#0D47A1', backgroundColor: '#E3F2FD' },
  planOptName: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  planOptPrice: { fontSize: 11.5, color: '#607D8B', marginTop: 2 },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  segmentBtnActive: { borderColor: '#0D47A1', backgroundColor: '#E3F2FD' },
  segmentBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  segmentBtnTextActive: { color: '#0D47A1' },
  launchToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  launchToggleText: { fontSize: 13, fontWeight: '600', color: '#1A202C' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, fontSize: 15, color: '#1A202C' },
  saveBtn: { backgroundColor: '#0D47A1', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
