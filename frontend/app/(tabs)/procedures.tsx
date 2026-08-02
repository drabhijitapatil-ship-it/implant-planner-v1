import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  LayoutAnimation,
  useWindowDimensions,
  ScrollView,
  UIManager,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api from "../../utils/api";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { format } from "date-fns";
import { STATUS_LABELS } from "../../constants/checklist";
import { useAuth } from "../../contexts/AuthContext";
import CaseSubmissionStatus from "../../components/CaseSubmissionStatus";
import NurseCasesScreen from "../../components/NurseCasesScreen";
import ShareToForumModal from "../../components/ShareToForumModal";
import RescheduleModal from "../../components/RescheduleModal";
import CancelCaseModal from "../../components/CancelCaseModal";
import TransferCaseModal from "../../components/TransferCaseModal";
import ReferredCaseAssignModal from "../../components/ReferredCaseAssignModal";

export default function ProceduresScreen() {
  const { user } = useAuth();
  // Nurses get a simplified Pending/Completed/All flow driven by consent-upload status.
  if (user?.role === "nurse") {
    return <NurseCasesScreen />;
  }
  return <DefaultProceduresScreen />;
}

const getStatusBadgeStyle = (status: string) => {
  const s = status || "draft";
  if (s.includes("approved") || s === "completed" || s === "approved") {
    return {
      bg: "#0B8A3F",
      text: "#FFF",
      icon: "checkmark-circle" as const,
    };
  }
  if (s.includes("pending") || s.includes("delivery")) {
    return {
      bg: "#D97706",
      text: "#FFF",
      icon: "time-outline" as const,
    };
  }
  if (s.includes("rejected")) {
    return {
      bg: "#DC2626",
      text: "#FFF",
      icon: "alert-circle-outline" as const,
    };
  }
  if (s === "cancelled") {
    return {
      bg: "#78909C",
      text: "#FFF",
      icon: "close-circle-outline" as const,
    };
  }
  return {
    bg: "#64748B",
    text: "#FFF",
    icon: "document-text-outline" as const,
  };
};

const PENDING_STATUSES = new Set([
  "pending_phase1",
  "pending_phase2",
  "pending_stage2_surgical",
  "pending_phase4_step1",
  "pending_phase4_step2",
]);
const IN_PROGRESS_STATUSES = new Set([
  ...PENDING_STATUSES,
  "phase1_approved",
  "phase2_approved",
  "stage2_surgical_approved",
  "phase4_step1_approved",
]);
const REJECTED_STATUSES = new Set([
  "rejected_phase1",
  "rejected_phase2",
  "rejected_stage2_surgical",
  "rejected_phase4_step1",
  "rejected_phase4_step2",
]);

function DefaultProceduresScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { user } = useAuth();
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // iter-267: unified filter row — single set of tabs replaces the older
  // dual-row design (server-side status row + client-side pipeline row).
  // Filtering is now done entirely client-side over the full case list so
  // the four tabs (All / In Progress / Completed / Rejected) stay
  // consistent for every role.
  const [filter, setFilter] = useState<
    "all" | "in_progress" | "completed" | "rejected"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  // iter-350: org owner (is_admin) isn't auto-scoped to any department, so
  // give them a filter to narrow "My Cases" down to one instead of always
  // seeing everything org-wide. 'all' = no department_id param sent.
  const [departments, setDepartments] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [tempFilter, setTempFilter] = useState<string>("all");
  const [tempDeptFilter, setTempDeptFilter] = useState<string>("all");
  const [shareCase, setShareCase] = useState<{
    id: string;
    patientName?: string;
  } | null>(null);
  // iter-269: case selected for reschedule via the three-dot menu.
  const [rescheduleCase, setRescheduleCase] = useState<{
    id: string;
    patientName?: string;
    currentDate?: string;
    currentTime?: string;
  } | null>(null);
  // Case selected for cancellation via the three-dot menu.
  const [cancelCase, setCancelCase] = useState<{
    id: string;
    patientName?: string;
  } | null>(null);
  // iter-385: case selected for Transfer Case via the three-dot menu.
  const [transferCase, setTransferCase] = useState<{ id: string; privileged?: boolean } | null>(null);
  const [assignReferredCase, setAssignReferredCase] = useState<{ id: string; patientName: string } | null>(null);
  const [selectedProcedureForActions, setSelectedProcedureForActions] = useState<any | null>(null);

  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; phase?: string }>();

  useEffect(() => {
    if (params.phase) {
      setFilter(`phase_${params.phase}` as any);
    } else if (params.filter === "pending") {
      // Legacy URL param — map "pending" → new "in_progress" tab
      setFilter("in_progress");
    } else if (
      params.filter &&
      ["in_progress", "completed", "rejected"].includes(params.filter)
    ) {
      setFilter(params.filter as any);
    }
  }, [params.filter, params.phase]);

  useEffect(() => {
    if (!user?.is_admin) return;
    api
      .get("/departments")
      .then((res) => setDepartments(res.data?.departments || []))
      .catch(() => {});
  }, [user?.is_admin]);

  const loadProcedures = useCallback(async () => {
    if (!user) return;
    try {
      const reqParams: any = {};
      const f = String(filter);
      if (f.startsWith("phase_")) {
        reqParams.phase = f.replace("phase_", "");
      }
      if (user?.is_admin && deptFilter !== "all") {
        reqParams.department_id = deptFilter;
      }
      // For All / In Progress / Completed / Rejected we fetch the full
      // case list and filter client-side so categories stay consistent
      // across roles (see filteredProcedures below).
      const response = await api.get("/procedures", { params: reqParams });
      const filtered = f.startsWith("phase_")
        ? response.data
        : response.data.filter((p: any) => p.status !== "draft");
      setProcedures(filtered);
    } catch (error: any) {
      if (error?.response?.status !== 401 && error?.response?.status !== 403) {
        console.error("Failed to load procedures:", error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deptFilter, filter, user]);

  useEffect(() => {
    loadProcedures();
  }, [loadProcedures]);

  // Re-fetch on every screen focus so a case cancelled/deleted/rescheduled
  // elsewhere (by this user or another) is reflected without needing to
  // restart the app.
  useFocusEffect(
    useCallback(() => {
      loadProcedures();
    }, [loadProcedures])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadProcedures();
  };

  const handleArchive = async (id: string) => {
    if (!id) {
      Alert.alert("Error", "Missing case ID");
      return;
    }
    Alert.alert(
      "Archive",
      "Archive this case? It will be moved to Archived Cases.",
      [
        { text: "Cancel" },
        {
          text: "Archive",
          onPress: async () => {
            try {
              await api.post(`/procedures/${id}/archive`);
              setProcedures((prev: any) =>
                prev.filter((p: any) => (p.id || p._id) !== id),
              );
              Alert.alert("Done", "Case archived");
            } catch (e: any) {
              Alert.alert(
                "Error",
                e.response?.data?.detail || "Failed to archive",
              );
            }
          },
        },
      ],
    );
  };

  const handleDelete = async (id: string) => {
    if (!id) {
      Alert.alert("Error", "Missing case ID");
      return;
    }
    Alert.alert(
      "Delete",
      "Permanently delete this case? This cannot be undone.",
      [
        { text: "Cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/procedures/${id}`);
              setProcedures((prev: any) =>
                prev.filter((p: any) => (p.id || p._id) !== id),
              );
              Alert.alert("Done", "Case deleted");
            } catch (e: any) {
              Alert.alert(
                "Error",
                e.response?.data?.detail || "Failed to delete",
              );
            }
          },
        },
      ],
    );
  };

  const handleEdit = (id: string) => {
    router.push(`/procedures/${id}?edit=true`);
  };

  const getMenuActions = (item: any) => {
    const role = user?.role;
    if (role === "nurse") return [];
    const actions: {
      key: string;
      label: string;
      icon: string;
      color: string;
      onPress: () => void;
    }[] = [];
    const isCompleted = item.status === "completed";
    const pid = item.id || item._id;
    // iter-385: Transfer Case eligibility — shared across student,
    // department incharge, and org admin initiators. Mirrors backend
    // TRANSFER_PENDING_STATUSES.
    const transferPendingStatuses = new Set([
      "pending_phase1", "pending_phase2", "pending_stage2_surgical",
      "pending_stage2_prosthetic", "pending_final_delivery",
    ]);
    const hasPendingTransfer = !!item.transfer_request;
    const transferEligible =
      !isCompleted && !transferPendingStatuses.has(item.status) && !hasPendingTransfer;

    const isReferredToMyDept = !!(
      item.department_id &&
      user?.department_id &&
      item.department_id !== user?.department_id
    );

    if (role === "implant_incharge") {
      if (!isCompleted && !isReferredToMyDept)
        actions.push({
          key: "edit",
          label: "Edit",
          icon: "create-outline",
          color: "#1565C0",
          onPress: () => handleEdit(pid),
        });
      if (!isReferredToMyDept) {
        actions.push({
          key: "delete",
          label: "Delete",
          icon: "trash-outline",
          color: "#1565C0",
          onPress: () => handleDelete(pid),
        });
        actions.push({
          key: "archive",
          label: "Archive",
          icon: "archive-outline",
          color: "#1565C0",
          onPress: () => handleArchive(pid),
        });
      }
      // Department In-Charge — transfer within own department, skips
      // Supervisor/In-Charge approval (they already have that authority).
      // Assign is for a case with no student yet; once assigned, further
      // moves go through Transfer Case (approval flow) instead.
      if (user?.department_id && transferEligible && item.student_id) {
        actions.push({
          key: "transfer",
          label: "Transfer Case",
          icon: "swap-horizontal-outline",
          color: "#0D47A1",
          onPress: () => setTransferCase({ id: pid, privileged: true }),
        });
      }
      if (!item.student_id) {
        actions.push({
          key: "referral_assign",
          label: "Assign to Student",
          icon: "person-add-outline",
          color: "#1565C0",
          onPress: () => setAssignReferredCase({ id: pid, patientName: item.patient_name }),
        });
      }
    } else if (role === "administrator") {
      // Organization Admin — transfer within the case's own department,
      // skips Supervisor/In-Charge approval.
      if (user?.is_admin && transferEligible && item.student_id) {
        actions.push({
          key: "transfer",
          label: "Transfer Case",
          icon: "swap-horizontal-outline",
          color: "#0D47A1",
          onPress: () => setTransferCase({ id: pid, privileged: true }),
        });
      }
      if (!item.student_id) {
        actions.push({
          key: "referral_assign",
          label: "Assign to Student",
          icon: "person-add-outline",
          color: "#1565C0",
          onPress: () => setAssignReferredCase({ id: pid, patientName: item.patient_name }),
        });
      }
    } else if (role === "supervisor") {
      if (!isCompleted && !isReferredToMyDept)
        actions.push({
          key: "edit",
          label: "Edit",
          icon: "create-outline",
          color: "#1565C0",
          onPress: () => handleEdit(pid),
        });
      if (!isReferredToMyDept) {
        actions.push({
          key: "archive",
          label: "Archive",
          icon: "archive-outline",
          color: "#1565C0",
          onPress: () => handleArchive(pid),
        });
      }
    } else if (role === "student") {
      if (!isReferredToMyDept) {
        actions.push({
          key: "archive",
          label: "Archive",
          icon: "archive-outline",
          color: "#1565C0",
          onPress: () => handleArchive(pid),
        });
      }
      // iter-385: Transfer Case — student can only initiate transfer of a
      // case they currently own.
      const isCurrentOwner = item.student_id === user?.id;
      if (isCurrentOwner && transferEligible) {
        actions.push({
          key: "transfer",
          label: "Transfer Case",
          icon: "swap-horizontal-outline",
          color: "#0D47A1",
          onPress: () => setTransferCase({ id: pid }),
        });
      }
    }
    // Add to Discussion Forum — Students (own case), Supervisors (supervised), In-Charges (any)
    const canShare =
      role === "implant_incharge" ||
      (role === "supervisor" && item.supervisor_id === user?.id) ||
      (role === "student" &&
        (item.student_id === user?.id || item.created_by_id === user?.id));
    if (canShare) {
      actions.push({
        key: "forum",
        label: "Add to Discussion Forum",
        icon: "chatbubbles-outline",
        color: "#1565C0",
        onPress: () =>
          setShareCase({ id: pid, patientName: item.patient_name }),
      });
    }
    // iter-269: Reschedule — case creator + faculty, only while
    // Phase 2 has NOT been initiated. Eligibility set mirrors backend
    // RESCHEDULE_ELIGIBLE_STATUSES.
    const rescheduleEligible = new Set([
      "draft",
      "pending_phase1",
      "rejected_phase1",
      "phase1_approved",
    ]);
    const isCreator =
      item.created_by_id === user?.id || item.student_id === user?.id;
    const isFaculty =
      role === "supervisor" ||
      role === "implant_incharge" ||
      role === "administrator" ||
      role === "super_admin";
    if (rescheduleEligible.has(item.status) && (isCreator || isFaculty)) {
      actions.push({
        key: "reschedule",
        label: "Reschedule",
        icon: "calendar-outline",
        color: "#1565C0",
        onPress: () =>
          setRescheduleCase({
            id: pid,
            patientName: item.patient_name,
            currentDate: item.procedure_date,
            currentTime: item.procedure_time,
          }),
      });
    }
    // Cancel scheduled case — case creator (student) or faculty, any time
    // before completion. Mirrors backend CANCEL_BLOCKED_STATUSES.
    const cancelBlocked = new Set(["draft", "completed", "cancelled"]);
    const isSupervisorOnCase =
      role === "supervisor" && item.supervisor_id === user?.id;
    const canCancel =
      !cancelBlocked.has(item.status) &&
      (isCreator ||
        isSupervisorOnCase ||
        role === "implant_incharge" ||
        role === "administrator" ||
        role === "super_admin");
    if (canCancel) {
      actions.push({
        key: "cancel",
        label: "Cancel Case",
        icon: "close-circle-outline",
        color: "#C62828",
        onPress: () =>
          setCancelCase({ id: pid, patientName: item.patient_name }),
      });
    }
    return actions;
  };

  const renderProcedure = ({ item }: any) => {
    const actions = getMenuActions(item);
    const statusStyle = getStatusBadgeStyle(item.status);

    return (
      <TouchableOpacity
        style={[
          styles.procedureCard,
          isTablet && {
            flex: 1,
            maxWidth: "48.5%",
            marginBottom: 16,
          },
        ]}
        onPress={() => {
          router.push(`/procedures/${item.id}`);
        }}
      >
        {/* Card Header Row */}
        <View style={styles.procedureHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.patientName} numberOfLines={1}>{item.patient_name}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.registrationBadge}>
              <Text style={styles.registrationNumber}>#{item.registration_number}</Text>
            </View>
            {actions.length > 0 && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setSelectedProcedureForActions(item);
                }}
                style={styles.threeDotButton}
                data-testid={`three-dot-menu-${item.id}`}
              >
                <Ionicons name="ellipsis-vertical" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusStyle.bg }]}>
          <Ionicons name={statusStyle.icon} size={16} color={statusStyle.text} />
          <Text style={[styles.statusText, { color: statusStyle.text }]} numberOfLines={1}>
            {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] || item.status}
          </Text>
        </View>

        {/* Referred Case Chip (conditional) */}
        {!!item.active_referral && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#EFF6FF',
            borderColor: '#BFDBFE',
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 5,
            marginTop: 6,
          }}>
            <Ionicons name="swap-horizontal" size={14} color="#1D4ED8" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF', flex: 1 }} numberOfLines={1}>
              Referred: {item.active_referral.from_department_name || 'Primary Dept'} ➔ {item.active_referral.to_department_name || 'Referred Dept'}
              {item.active_referral.assigned_phase ? ` (${item.active_referral.assigned_phase})` : ''}
            </Text>
          </View>
        )}

        {/* Rescheduled Badge (conditional) */}
        {Array.isArray(item.reschedule_history) && item.reschedule_history.length > 0 ? (
          <View
            style={styles.rescheduledChip}
            data-testid={`rescheduled-chip-${item.id}`}
          >
            <Ionicons name="calendar-outline" size={14} color="#E65100" />
            <Text style={styles.rescheduledChipTxt}>
              Rescheduled
              {item.reschedule_history.length > 1
                ? ` · ${item.reschedule_history.length}×`
                : ""}
            </Text>
          </View>
        ) : null}

        {/* Pre-Implant Augmentation Done Badge (conditional) — the case went
            through bone graft augmentation and is now past it (status no
            longer augmentation_in_progress). */}
        {item.augmentation_required && (item.augmentations || []).length > 0 && item.status !== 'augmentation_in_progress' && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#EFEBE9',
            borderColor: '#D7CCC8',
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 5,
            marginTop: 6,
          }} data-testid={`aug-done-badge-${item.id}`}>
            <Ionicons name="bandage" size={14} color="#5D4037" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#5D4037', flex: 1 }} numberOfLines={1}>
              Pre-Implant Augmentation ✓
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Details Alignment (2-column layout) */}
        <View style={styles.detailsContainer}>
          {/* Left Column */}
          <View style={styles.detailsColumn}>
            {item.student_name ? (
              <View style={styles.detailItem}>
                <View style={[styles.detailIconContainer, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="person" size={16} color="#2E7D32" />
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Student</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {item.student_name}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailItem}>
              <View style={[styles.detailIconContainer, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="school" size={16} color="#1565C0" />
              </View>
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>Supervisor</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {item.supervisor_name}
                </Text>
              </View>
            </View>

            {/* Shift Site here if Student is not there */}
            {!item.student_name && (
              <View style={styles.detailItem}>
                <View style={[styles.detailIconContainer, { backgroundColor: '#E8EAF6' }]}>
                  <Ionicons name="location" size={16} color="#3F51B5" />
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Site</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {item.implant_site}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Vertical Divider */}
          <View style={styles.verticalDivider} />

          {/* Right Column */}
          <View style={styles.detailsColumn}>
            <View style={styles.detailItem}>
              <View style={[styles.detailIconContainer, { backgroundColor: '#EDE7F6' }]}>
                <Ionicons name="calendar" size={16} color="#673AB7" />
              </View>
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {format(new Date(item.procedure_date), "MMM dd, yyyy")} at {item.procedure_time}
                </Text>
              </View>
            </View>

            {/* Only show Site here if Student is present */}
            {!!item.student_name && (
              <View style={styles.detailItem}>
                <View style={[styles.detailIconContainer, { backgroundColor: '#E8EAF6' }]}>
                  <Ionicons name="location" size={16} color="#3F51B5" />
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Site</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {item.implant_site}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* compact 4-cell Treatment Progress strip */}
        <CaseSubmissionStatus procedure={item} user={user} compact />

        {item.rejection_reason && (
          <View style={styles.rejectionContainer}>
            <Ionicons name="alert-circle" size={16} color="#F44336" />
            <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const filterButtons = useMemo(() => [
    { key: "all", label: "All" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "rejected", label: "Rejected" },
  ], []);

  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return procedures;
    const q = searchQuery.toLowerCase();
    return procedures.filter((p: any) => (
      p.patient_name?.toLowerCase().includes(q) ||
      p.registration_number?.toLowerCase().includes(q) ||
      p.student_name?.toLowerCase().includes(q) ||
      p.supervisor_name?.toLowerCase().includes(q)
    ));
  }, [procedures, searchQuery]);

  // iter-267: unified client-side status categorisation. Drafts are
  // already excluded upstream (Dashboard owns them).
  //   • In Progress = anything actively moving through the workflow,
  //     including cases awaiting faculty approval AND cases that have
  //     cleared a phase but are not yet completed.
  //   • Completed = final state.
  //   • Rejected = any rejected_* phase status.
  // iter-268: per-tab counts so users see workload at a glance.
  // Counts reflect the active search query (mirrors the visible list).
  const tabCounts = useMemo<Record<string, number>>(() => ({
    all: searchFiltered.length,
    in_progress: searchFiltered.filter((p: any) =>
      IN_PROGRESS_STATUSES.has(p.status),
    ).length,
    completed: searchFiltered.filter((p: any) => p.status === "completed")
      .length,
    rejected: searchFiltered.filter((p: any) => REJECTED_STATUSES.has(p.status))
      .length,
  }), [searchFiltered]);

  const filteredProcedures = useMemo(() => {
    const f = String(filter);
    if (f.startsWith("phase_")) return searchFiltered;
    if (f === "all") return searchFiltered;
    return searchFiltered.filter((p: any) => {
      const s = p.status;
      if (f === "in_progress") return IN_PROGRESS_STATUSES.has(s);
      if (f === "completed") return s === "completed";
      if (f === "rejected") return REJECTED_STATUSES.has(s);
      return true;
    });
  }, [filter, searchFiltered]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Plain Search Header */}
      <View style={isTablet && { maxWidth: 960, alignSelf: "center", width: "100%" }}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer} data-testid="search-bar-container">
            <Ionicons
              name="search"
              size={18}
              color="#999"
              style={{ marginLeft: 12 }}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by patient, registration, student..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              data-testid="search-input"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                style={{ padding: 8 }}
                data-testid="search-clear"
              >
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.filterIconButton,
              (filter !== "all" || deptFilter !== "all") && styles.filterIconButtonActive,
            ]}
            onPress={() => {
              setTempFilter(filter);
              setTempDeptFilter(deptFilter);
              setShowFilterModal(true);
            }}
            data-testid="open-filter-modal-btn"
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={(filter !== "all" || deptFilter !== "all") ? "#FFF" : "#1565C0"}
            />
            {(filter !== "all" || deptFilter !== "all") && (
              <View style={styles.filterBadgeDot} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Applied Filters Chips Bar */}
      {(filter !== "all" || deptFilter !== "all") && (
        <View style={[styles.appliedFiltersRow, isTablet && { maxWidth: 960, alignSelf: "center", width: "100%" }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 8 }}>
            {filter !== "all" && (
              <View style={styles.appliedChip}>
                <Text style={styles.appliedChipText}>
                  Status: {filterButtons.find((b) => b.key === filter)?.label || filter}
                </Text>
                <TouchableOpacity onPress={() => setFilter("all" as any)}>
                  <Ionicons name="close-circle" size={16} color="#1565C0" />
                </TouchableOpacity>
              </View>
            )}

            {deptFilter !== "all" && (
              <View style={styles.appliedChip}>
                <Text style={styles.appliedChipText}>
                  Dept: {departments.find((d) => d.id === deptFilter)?.name || deptFilter}
                </Text>
                <TouchableOpacity onPress={() => setDeptFilter("all")}>
                  <Ionicons name="close-circle" size={16} color="#1565C0" />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              onPress={() => {
                setFilter("all" as any);
                setDeptFilter("all");
              }}
              style={{ paddingVertical: 4, paddingHorizontal: 6 }}
            >
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {filteredProcedures.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name={searchQuery ? "search-outline" : "document-text-outline"}
            size={64}
            color="#CCC"
          />
          <Text style={styles.emptyText}>
            {searchQuery ? "No matching cases found" : "No procedures found"}
          </Text>
        </View>
      ) : (
        <FlatList
          key={isTablet ? "tablet-grid" : "mobile-list"}
          numColumns={isTablet ? 2 : 1}
          columnWrapperStyle={isTablet ? { justifyContent: "space-between" } : undefined}
          data={filteredProcedures}
          renderItem={renderProcedure}
          keyExtractor={(item: any) => item.id}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          removeClippedSubviews
          decelerationRate="fast"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={[
            styles.listContainer,
            isTablet && {
              maxWidth: 960,
              alignSelf: "center",
              width: "100%",
            }
          ]}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {shareCase && (
        <ShareToForumModal
          visible={!!shareCase}
          procedureId={shareCase.id}
          patientName={shareCase.patientName}
          onClose={() => setShareCase(null)}
          onShared={(tid) => {
            setShareCase(null);
            router.push(`/forum/${tid}` as any);
          }}
        />
      )}
      {rescheduleCase && (
        <RescheduleModal
          visible={!!rescheduleCase}
          procedureId={rescheduleCase.id}
          patientName={rescheduleCase.patientName}
          currentDate={rescheduleCase.currentDate}
          currentTime={rescheduleCase.currentTime}
          onClose={() => setRescheduleCase(null)}
          onRescheduled={() => {
            setRescheduleCase(null);
            loadProcedures();
          }}
        />
      )}
      {cancelCase && (
        <CancelCaseModal
          visible={!!cancelCase}
          procedureId={cancelCase.id}
          patientName={cancelCase.patientName}
          onClose={() => setCancelCase(null)}
          onCancelled={() => {
            setCancelCase(null);
            loadProcedures();
          }}
        />
      )}
      {transferCase && (
        <TransferCaseModal
          procedureId={transferCase.id}
          privileged={transferCase.privileged}
          onClose={() => setTransferCase(null)}
          onSubmitted={() => { setTransferCase(null); loadProcedures(); }}
        />
      )}
      {assignReferredCase && (
        <ReferredCaseAssignModal
          visible={!!assignReferredCase}
          procedureId={assignReferredCase.id}
          patientName={assignReferredCase.patientName}
          onClose={() => setAssignReferredCase(null)}
          onSuccess={() => {
            setAssignReferredCase(null);
            loadProcedures();
          }}
        />
      )}
      {selectedProcedureForActions && (
        <Modal
          visible={!!selectedProcedureForActions}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setSelectedProcedureForActions(null);
          }}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "flex-end",
            }}
            activeOpacity={1}
            onPress={() => {
              setSelectedProcedureForActions(null);
            }}
            data-testid={`popup-menu-${selectedProcedureForActions.id}`}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={{
                backgroundColor: "#FFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 24,
                maxHeight: "80%",
              }}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Drag Handle indicator */}
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#CBD5E1",
                  alignSelf: "center",
                  marginBottom: 16,
                }}
              />

              {/* Header: Patient Name & Reg Number */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F1F5F9",
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text
                    style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}
                    numberOfLines={1}
                  >
                    {selectedProcedureForActions.patient_name}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    #{selectedProcedureForActions.registration_number}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedProcedureForActions(null);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Action items list */}
              <ScrollView style={{ maxHeight: 340 }}>
                {getMenuActions(selectedProcedureForActions).map((action: any) => (
                  <TouchableOpacity
                    key={action.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      marginBottom: 6,
                      backgroundColor: "#F8FAFC",
                    }}
                    onPress={() => {
                      setSelectedProcedureForActions(null);
                      action.onPress();
                    }}
                    data-testid={`menu-${action.key}-${selectedProcedureForActions.id}`}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: (action.color || "#1565C0") + "15",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={action.icon as any} size={18} color={action.color || "#1565C0"} />
                    </View>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: action.color === "#C62828" ? "#DC2626" : "#1E293B",
                        flex: 1,
                      }}
                    >
                      {action.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Bottom Sheet Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        >
          <TouchableOpacity
            style={styles.bottomSheetContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filter Procedures</Text>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={styles.sheetCloseBtn}
              >
                <Ionicons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {/* Status Section */}
              <Text style={styles.filterSectionTitle}>Status</Text>
              <View style={styles.chipGroup}>
                {filterButtons.map((btn) => {
                  const isActive = tempFilter === btn.key;
                  const count = tabCounts[btn.key] ?? 0;
                  return (
                    <TouchableOpacity
                      key={btn.key}
                      style={[
                        styles.modalChip,
                        isActive && styles.modalChipActive,
                      ]}
                      onPress={() => setTempFilter(btn.key as any)}
                    >
                      <Text
                        style={[
                          styles.modalChipText,
                          isActive && styles.modalChipTextActive,
                        ]}
                      >
                        {btn.label} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Department Section */}
              {user?.is_admin && departments.length > 0 && (
                <>
                  <Text style={[styles.filterSectionTitle, { marginTop: 20 }]}>
                    Department
                  </Text>
                  <View style={styles.chipGroup}>
                    {[{ id: "all", name: "All Departments" }, ...departments].map(
                      (dept) => {
                        const isActive = tempDeptFilter === dept.id;
                        const color = dept.id !== "all" ? dept.color : undefined;
                        return (
                          <TouchableOpacity
                            key={dept.id}
                            style={[
                              styles.modalChip,
                              isActive &&
                                (color
                                  ? { backgroundColor: color, borderColor: color }
                                  : styles.modalChipActive),
                            ]}
                            onPress={() => setTempDeptFilter(dept.id)}
                          >
                            {color && !isActive && (
                              <View
                                style={[
                                  styles.deptChipColorDot,
                                  { backgroundColor: color },
                                ]}
                              />
                            )}
                            <Text
                              style={[
                                styles.modalChipText,
                                isActive &&
                                  (color
                                    ? styles.deptChipTextActiveDark
                                    : styles.modalChipTextActive),
                              ]}
                            >
                              {dept.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.resetFilterBtn}
                onPress={() => {
                  setTempFilter("all");
                  setTempDeptFilter("all");
                }}
              >
                <Text style={styles.resetFilterText}>Reset All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyFilterBtn}
                onPress={() => {
                  setFilter(tempFilter as any);
                  setDeptFilter(tempDeptFilter);
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.applyFilterText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 6,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
  },
  filterButtonActive: {
    backgroundColor: "#007AFF",
  },
  filterText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
  },
  filterTextActive: {
    color: "#FFF",
  },
  filterCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9AA0A6",
  },
  filterCountActive: {
    color: "#E3F2FD",
  },
  deptFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    backgroundColor: "#FFF",
  },
  deptChip: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  deptChipColorDot: { width: 7, height: 7, borderRadius: 3.5 },
  deptChipActive: {
    backgroundColor: "#1565C0",
    borderColor: "#1565C0",
  },
  deptChipMine: {
    borderColor: "#FFD54F",
  },
  deptChipDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#43A047",
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  deptChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#546E7A",
  },
  deptChipTextActive: {
    color: "#FFF",
  },
  // Department chips fill with a pastel color — dark text stays readable
  // on top, unlike the white text used for the generic "All" chip fill.
  deptChipTextActiveDark: {
    color: "#37474F",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    position: "relative",
  },
  filterIconButtonActive: {
    backgroundColor: "#1565C0",
    borderColor: "#1565C0",
  },
  filterBadgeDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF5252",
    borderWidth: 1,
    borderColor: "#FFF",
  },
  appliedFiltersRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  appliedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    borderWidth: 1,
    borderColor: "#90CAF9",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  appliedChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1565C0",
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC3545",
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  bottomSheetContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  sheetHandle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A237E",
  },
  sheetCloseBtn: {
    padding: 4,
  },
  sheetBody: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 10,
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modalChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E0E5EC",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modalChipActive: {
    backgroundColor: "#1565C0",
    borderColor: "#1565C0",
  },
  modalChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  modalChipTextActive: {
    color: "#FFF",
  },
  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  resetFilterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F9FA",
  },
  resetFilterText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#546E7A",
  },
  applyFilterBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1565C0",
    alignItems: "center",
    justifyContent: "center",
  },
  applyFilterText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#1A1A1A",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 16,
  },
  listContainer: {
    padding: 16,
  },
  procedureCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  procedureHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  registrationBadge: {
    backgroundColor: "#F1F3F4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  registrationNumber: {
    fontSize: 12,
    color: "#5F6368",
    fontWeight: "600",
  },
  patientName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0B1930",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  rescheduledChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#FFF3E0",
  },
  rescheduledChipTxt: {
    fontSize: 11,
    fontWeight: "600",
    color: "#E65100",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 12,
  },
  detailsContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 14,
  },
  detailsColumn: {
    flex: 1,
    gap: 18,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  rejectionContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  rejectionText: {
    fontSize: 13,
    color: "#F44336",
    flex: 1,
  },
  menuContainer: {
    position: "relative",
  },
  threeDotButton: {
    padding: 4,
  },
  popupMenu: {
    position: "absolute",
    top: 30,
    right: 0,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#1565C0",
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  popupItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  popupItemText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
