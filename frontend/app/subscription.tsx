import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import api from '../utils/api';
import CenteredHeader from '../components/CenteredHeader';

/**
 * Org member's own view of their subscription — reachable from Profile
 * (org admin only). Viewing is read-only, but the org admin CAN request an
 * upgrade — that request just gets recorded and shows up for the platform
 * super_admin to approve or dismiss; no payment is collected here and no
 * plan changes apply until the platform admin actions it.
 */

type SubscriptionData = {
  status: 'none' | 'trial' | 'active' | 'expired' | 'cancelled';
  plan_name: string | null;
  billing_cycle?: 'monthly' | 'yearly' | null;
  price_locked_in?: number | null;
  max_users: number | null;
  max_students: number | null;
  max_department: number | null;
  max_implant_incharges: number | null;
  trial_days?: number;
  trial_ends_at?: string | null;
  org_type: 'college' | 'clinic';
  org_name?: string;
  usage: { users: number; implant_incharges: number; students: number; department: number };
  requested_plan_key?: string | null;
  requested_plan_name?: string | null;
  requested_billing_cycle?: 'monthly' | 'yearly' | null;
  requested_at?: string | null;
};

type AvailablePlan = {
  key: string;
  name: string;
  max_users: number | null;
  max_students: number | null;
  max_department: number | null;
  max_implant_incharges: number | null;
  price_monthly: number;
  price_yearly: number;
  launch_offer_first_year_price?: number | null;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function barColor(used: number, max: number): string {
  const pct = max > 0 ? used / max : 0;
  if (pct >= 1) return '#DC2626';
  if (pct >= 0.8) return '#EA580C';
  return '#16A34A';
}

function statusConfig(status: string) {
  switch (status) {
    case 'active':
      return {
        label: 'ACTIVE',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        icon: 'checkmark-circle-outline' as const,
      };
    case 'trial':
      return {
        label: 'FREE TRIAL',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        icon: 'time-outline' as const,
      };
    case 'expired':
      return {
        label: 'EXPIRED',
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
        icon: 'alert-circle-outline' as const,
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        color: '#64748B',
        bg: '#F1F5F9',
        border: '#CBD5E1',
        icon: 'close-circle-outline' as const,
      };
    default:
      return {
        label: 'INACTIVE',
        color: '#64748B',
        bg: '#F1F5F9',
        border: '#E2E8F0',
        icon: 'help-circle-outline' as const,
      };
  }
}

export default function SubscriptionScreen() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/organizations/me/subscription');
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load subscription details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Self-service upgrade request — picks from active plans matching this
  // org's type, submits a request the platform admin approves/dismisses.
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState(false);

  const openUpgradeModal = async () => {
    setSelectedPlanKey(null);
    setBillingCycle('monthly');
    setShowUpgradeModal(true);
    try {
      const res = await api.get('/subscription-plans/available');
      setAvailablePlans(res.data?.plans || []);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to load available plans');
    }
  };

  const submitUpgradeRequest = async () => {
    if (!selectedPlanKey) {
      Alert.alert('Error', 'Pick a plan to request');
      return;
    }
    setSubmittingRequest(true);
    try {
      const res = await api.post('/organizations/me/subscription/request-upgrade', {
        plan_key: selectedPlanKey,
        billing_cycle: billingCycle,
      });
      setShowUpgradeModal(false);
      Alert.alert('Request Sent', res.data?.message || 'Your upgrade request has been sent to your platform admin.');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to send upgrade request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const cancelMyRequest = async () => {
    setCancellingRequest(true);
    try {
      await api.post('/organizations/me/subscription/cancel-request');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to cancel request');
    } finally {
      setCancellingRequest(false);
    }
  };

  const trialDaysLeft = (() => {
    if (data?.status !== 'trial' || !data.trial_ends_at) return null;
    const ms = new Date(data.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  })();
  const trialTotalDays = data?.trial_days || 14;
  const trialPct = trialDaysLeft != null ? Math.max(0, Math.min(1, trialDaysLeft / trialTotalDays)) : 0;
  const trialBarColor =
    trialDaysLeft != null && trialDaysLeft <= 3
      ? '#DC2626'
      : trialDaysLeft != null && trialDaysLeft <= 7
      ? '#EA580C'
      : '#0D9488';

  const caps = data
    ? [
        {
          key: 'users',
          label: 'Total Active Users',
          used: data.usage.users,
          max: data.max_users,
          icon: 'people-outline' as const,
          color: '#2563EB',
          bg: '#EFF6FF',
        },
        ...(data.org_type === 'college'
          ? [
              {
                key: 'students',
                label: 'Postgraduate Students',
                used: data.usage.students,
                max: data.max_students,
                icon: 'school-outline' as const,
                color: '#4F46E5',
                bg: '#EEF2FF',
              },
              {
                key: 'department',
                label: 'Departments',
                used: data.usage.department,
                max: data.max_department,
                icon: 'business-outline' as const,
                color: '#7C3AED',
                bg: '#F5F3FF',
              },
            ]
          : []),
        {
          key: 'incharges',
          label: data.org_type === 'clinic' ? 'Chief Dentists' : 'Implant In-Charges',
          used: data.usage.implant_incharges,
          max: data.max_implant_incharges,
          icon: 'medkit-outline' as const,
          color: '#0D9488',
          bg: '#F0FDF4',
        },
      ].filter((c) => c.max != null)
    : [];

  const st = data ? statusConfig(data.status) : statusConfig('none');

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <CenteredHeader title="Subscription Plan" fallback="/(tabs)/profile" />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1565C0" />
          <Text style={s.loadingText}>Loading subscription details...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, isTablet && s.scrollTablet]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor="#1565C0"
            />
          }
        >
          {error ? (
            <View style={s.errorBox}>
              <View style={s.errorIconWrap}>
                <Ionicons name="alert-circle" size={32} color="#DC2626" />
              </View>
              <Text style={s.errorTitle}>Could Not Load Subscription</Text>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : !data || data.status === 'none' ? (
            <View style={s.emptyBox} data-testid="subscription-none">
              <View style={s.emptyIconWrap}>
                <Ionicons name="card-outline" size={36} color="#94A3B8" />
              </View>
              <Text style={s.emptyText}>No Active Subscription Plan</Text>
              <Text style={s.emptySub}>
                Your organization ({data?.org_name || 'Organization'}) does not have an assigned subscription plan. Contact your platform administrator to activate a plan.
              </Text>
            </View>
          ) : (
            <>
              {/* Primary Plan Hero Card */}
              <View style={s.planHeroCard} data-testid="subscription-plan-card">
                <View style={s.planHeaderRow}>
                  <View style={s.planTitleGroup}>
                    <Text style={s.orgNameText}>{data.org_name || 'Organization Plan'}</Text>
                    <Text style={s.planName}>{data.plan_name || 'Standard Tier'}</Text>
                  </View>

                  <View style={[s.statusChip, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Ionicons name={st.icon} size={13} color={st.color} />
                    <Text style={[s.statusChipText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                {/* Price Tag Row */}
                {data.price_locked_in != null && data.status === 'active' && (
                  <View style={s.priceBox}>
                    <View style={s.priceRow}>
                      <Text style={s.priceAmount}>{inr(data.price_locked_in)}</Text>
                      <Text style={s.pricePeriod}> / {data.billing_cycle === 'yearly' ? 'year' : 'month'}</Text>
                    </View>
                    <View style={s.lockBadge}>
                      <Ionicons name="lock-closed" size={11} color="#059669" />
                      <Text style={s.lockBadgeText}>Price Rate Locked-in</Text>
                    </View>
                  </View>
                )}

                {/* Org Scope Type Tag */}
                <View style={s.orgTypeTag}>
                  <Ionicons
                    name={data.org_type === 'clinic' ? 'medical-outline' : 'school-outline'}
                    size={14}
                    color="#475569"
                  />
                  <Text style={s.orgTypeTagText}>
                    {data.org_type === 'clinic' ? 'Dental Clinic Workspace' : 'Dental College Institution'}
                  </Text>
                </View>
              </View>

              {/* Trial Days Counter Banner */}
              {data.status === 'trial' && trialDaysLeft !== null && (
                <View style={s.trialCard} data-testid="subscription-trial-progress">
                  <View style={s.cardHeaderRow}>
                    <View style={s.cardHeaderIconWrap}>
                      <Ionicons name="time" size={16} color="#D97706" />
                    </View>
                    <View style={s.cardHeaderTextGroup}>
                      <Text style={s.cardTitle}>Free Trial Period</Text>
                      <Text style={s.cardSubtitle}>
                        {trialDaysLeft} of {trialTotalDays} days remaining
                      </Text>
                    </View>
                  </View>

                  <View style={s.progressTrack}>
                    <View
                      style={[
                        s.progressFill,
                        { width: `${trialPct * 100}%`, backgroundColor: trialBarColor },
                      ]}
                    />
                  </View>

                  <View style={s.trialFooterRow}>
                    <Text style={[s.trialFooterText, { color: trialBarColor }]}>
                      {trialDaysLeft === 0
                        ? 'Trial expires today'
                        : trialDaysLeft <= 3
                        ? 'Trial expiring soon!'
                        : 'Enjoy full platform feature access during trial'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Capacity & Usage Section */}
              {caps.length > 0 && (
                <View style={s.sectionCard} data-testid="subscription-usage-card">
                  <View style={s.sectionHeaderRow}>
                    <View style={s.sectionHeaderIconWrap}>
                      <Ionicons name="speedometer-outline" size={18} color="#1565C0" />
                    </View>
                    <View>
                      <Text style={s.sectionTitle}>Seat Capacity &amp; Usage</Text>
                      <Text style={s.sectionSub}>Active allocation against plan limits</Text>
                    </View>
                  </View>

                  <View style={s.capsList}>
                    {caps.map((c) => {
                      const max = c.max as number;
                      const pct = max > 0 ? Math.min(1, c.used / max) : 0;
                      const pctInt = Math.round(pct * 100);
                      const color = barColor(c.used, max);

                      return (
                        <View key={c.key} style={s.capCard} data-testid={`subscription-cap-${c.key}`}>
                          <View style={s.capTopRow}>
                            <View style={s.capTitleWrap}>
                              <View style={[s.capIconBox, { backgroundColor: c.bg }]}>
                                <Ionicons name={c.icon} size={16} color={c.color} />
                              </View>
                              <Text style={s.capLabel}>{c.label}</Text>
                            </View>

                            <View style={s.capCountBadge}>
                              <Text style={[s.capCountUsed, { color }]}>{c.used}</Text>
                              <Text style={s.capCountMax}> / {max}</Text>
                            </View>
                          </View>

                          <View style={s.progressTrack}>
                            <View
                              style={[
                                s.progressFill,
                                { width: `${pct * 100}%`, backgroundColor: color },
                              ]}
                            />
                          </View>

                          <View style={s.capBottomRow}>
                            <Text style={s.capPctText}>{pctInt}% Allocated</Text>
                            {pct >= 1 ? (
                              <Text style={[s.capStatusWarning, { color: '#DC2626' }]}>Capacity Full</Text>
                            ) : pct >= 0.8 ? (
                              <Text style={[s.capStatusWarning, { color: '#EA580C' }]}>Near Capacity</Text>
                            ) : (
                              <Text style={s.capStatusNormal}>Available</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Upgrade request — pending banner, or a button to start one */}
              {data.requested_plan_key ? (
                <View style={s.requestCard} data-testid="my-upgrade-request-card">
                  <View style={s.requestHeaderRow}>
                    <Ionicons name="arrow-up-circle" size={18} color="#B7791F" />
                    <Text style={s.requestTitle}>Upgrade Requested</Text>
                  </View>
                  <Text style={s.requestBody}>
                    Waiting on your platform admin to approve <Text style={{ fontWeight: '700' }}>{data.requested_plan_name}</Text> ({data.requested_billing_cycle}).
                  </Text>
                  <TouchableOpacity
                    style={[s.requestCancelBtn, cancellingRequest && { opacity: 0.6 }]}
                    onPress={cancelMyRequest}
                    disabled={cancellingRequest}
                    data-testid="cancel-upgrade-request-btn"
                  >
                    {cancellingRequest ? <ActivityIndicator size="small" color="#B7791F" /> : <Text style={s.requestCancelBtnText}>Cancel Request</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.upgradeBtn} onPress={openUpgradeModal} data-testid="request-upgrade-btn">
                  <Ionicons name="arrow-up-circle-outline" size={18} color="#FFF" />
                  <Text style={s.upgradeBtnText}>Request Upgrade</Text>
                </TouchableOpacity>
              )}

              {/* Information Notice Footer */}
              <View style={s.noticeCard}>
                <Ionicons name="information-circle-outline" size={20} color="#64748B" />
                <View style={s.noticeTextWrap}>
                  <Text style={s.noticeTitle}>Managing Your Subscription</Text>
                  <Text style={s.noticeSub}>
                    Requesting a plan doesn't change anything by itself — your platform admin reviews and approves it before it takes effect.
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={showUpgradeModal} animationType="slide" transparent onRequestClose={() => setShowUpgradeModal(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalContent} data-testid="upgrade-request-modal">
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Request an Upgrade</Text>
                <TouchableOpacity onPress={() => setShowUpgradeModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {availablePlans.length === 0 ? (
                <Text style={s.emptySub}>No plans available for your organization type right now.</Text>
              ) : (
                availablePlans.map((p) => (
                  <TouchableOpacity
                    key={p.key}
                    style={[s.planOptRow, selectedPlanKey === p.key && s.planOptRowActive]}
                    onPress={() => setSelectedPlanKey(p.key)}
                    data-testid={`request-plan-${p.key}`}
                  >
                    <Ionicons name={selectedPlanKey === p.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={selectedPlanKey === p.key ? '#1565C0' : '#94A3B8'} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.planOptName}>{p.name}</Text>
                      <Text style={s.planOptPrice}>
                        {inr(p.price_monthly)}/mo · {inr(p.price_yearly)}/yr
                        {p.launch_offer_first_year_price != null ? ` · launch ${inr(p.launch_offer_first_year_price)}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {selectedPlanKey && (
                <View style={s.segmentRow}>
                  {(['monthly', 'yearly'] as const).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[s.segmentBtn, billingCycle === c && s.segmentBtnActive]}
                      onPress={() => setBillingCycle(c)}
                      data-testid={`request-billing-${c}`}
                    >
                      <Text style={[s.segmentBtnText, billingCycle === c && s.segmentBtnTextActive]}>{c === 'monthly' ? 'Monthly' : 'Yearly'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.submitRequestBtn, (submittingRequest || !selectedPlanKey) && { opacity: 0.6 }]}
                onPress={submitUpgradeRequest}
                disabled={submittingRequest || !selectedPlanKey}
                data-testid="submit-upgrade-request"
              >
                {submittingRequest ? <ActivityIndicator color="#FFF" /> : <Text style={s.submitRequestBtnText}>Send Request</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  scrollTablet: {
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  /* Error State */
  errorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 20,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  errorIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 18,
  },

  /* Empty State */
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },

  /* Plan Hero Card */
  planHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  planTitleGroup: {
    flex: 1,
    paddingRight: 10,
  },
  orgNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  /* Price box */
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  pricePeriod: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  lockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },

  /* Org type tag */
  orgTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  orgTypeTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  /* Trial Banner */
  trialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    ...Platform.select({
      ios: { shadowColor: '#D97706', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cardHeaderIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTextGroup: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 1,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  trialFooterRow: {
    marginTop: 8,
  },
  trialFooterText: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Section Card */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },

  /* Caps list */
  capsList: {
    gap: 14,
  },
  capCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  capTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  capTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  capIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  capCountBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  capCountUsed: {
    fontSize: 15,
    fontWeight: '900',
  },
  capCountMax: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  capBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  capPctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  capStatusNormal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  capStatusWarning: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Notice Footer */
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  noticeTextWrap: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  noticeSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },

  /* Upgrade request */
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1565C0',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  upgradeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  requestCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  requestHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  requestTitle: { fontSize: 14, fontWeight: '800', color: '#B7791F' },
  requestBody: { fontSize: 12.5, color: '#78350F', lineHeight: 18 },
  requestCancelBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  requestCancelBtnText: { color: '#B7791F', fontSize: 12.5, fontWeight: '700' },

  /* Upgrade request modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A202C', flex: 1, marginRight: 8 },
  planOptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  planOptRowActive: { borderColor: '#1565C0', backgroundColor: '#EFF6FF' },
  planOptName: { fontSize: 14, fontWeight: '700', color: '#1A202C' },
  planOptPrice: { fontSize: 11.5, color: '#607D8B', marginTop: 2 },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  segmentBtnActive: { borderColor: '#1565C0', backgroundColor: '#EFF6FF' },
  segmentBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  segmentBtnTextActive: { color: '#1565C0' },
  submitRequestBtn: { backgroundColor: '#1565C0', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 20 },
  submitRequestBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
