import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  Linking,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import api, { getAuthFileUrl, getToken } from "../../../utils/api";
import { goBackOrHome } from "../../../utils/safeNav";
import { showUploadPicker } from "../../../utils/uploadPicker";
import { useAuth } from "../../../contexts/AuthContext";
import BackToDashboard from "../../../components/BackToDashboard";
import { PhaseHeader } from "../../../components/PhaseHeader";
import { Ionicons } from "@expo/vector-icons";
import { CHECKLIST_DATA } from "../../../constants/checklist";
import DoneDatePicker, { todayIso } from "../../../components/DoneDatePicker";

const CHECKLIST_ITEMS = CHECKLIST_DATA.second_stage.items;

export default function Stage2SurgicalSubmissionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const isFaculty =
    user?.role === "supervisor" || user?.role === "implant_incharge";
  const notesLabel = isFaculty ? "Operator's Notes" : "Student Notes";
  const [loading, setLoading] = useState(false);
  // iter-332: actual date Phase 3 was performed (defaults to today; editable to back-date)
  const [doneDate, setDoneDate] = useState<string>(todayIso());

  // ── Phase 2 context (drives the Phase 3 simplified checklist + banner per product spec) ──
  // If Phase 2 selected "Immediate Loading Done" or "Healing Abutment Placed",
  // we show a summary banner at the top and trim the checklist to 4 items
  // (no All-Components-Available, no Healing-Abutment-Placed rows).
  const [phase2Component, setPhase2Component] = useState<string>("");
  const [phase2ProsthesisType, setPhase2ProsthesisType] = useState<string>("");
  const [phase2ProsthesisOther, setPhase2ProsthesisOther] =
    useState<string>("");
  const [phase2HealingCuffs, setPhase2HealingCuffs] = useState<string[]>([]);
  const [createdById, setCreatedById] = useState<string | null>(null);
  const [createdByRole, setCreatedByRole] = useState<string | null>(null);
  const [doneCompleted, setDoneCompleted] = useState(false);
  const [phase2Components, setPhase2Components] = useState<string[]>([]);

  // ─── iter-357: Per-implant Phase 3 healing-abutment configuration ───
  // In multi-implant per-implant cases (Phase 2 stored `prosthetic_components[]`),
  // Phase 3 shows ALL implants (Cover Screw / Healing Abutment / Immediate
  // Loading) — the surgeon must pick "Standard cuff height" (with a mm value)
  // OR "Customised healing abutment" (with free-text details up to 100 words).
  // Prefilled with Phase 2's cuff height when available.
  type HAConfig = {
    mode: "" | "standard" | "customised";
    cuff_height_mm: string;
    customised_details: string;
    phase2_component: string; // read-only banner label
    phase2_cuff_height_mm: string; // shown for Healing-Abutment implants
  };
  const [haConfig, setHaConfig] = useState<HAConfig[]>([]);
  const WORDS_MAX = 100;
  const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

  // Always drop the Healing-Abutment-Placed checklist row — by product spec, Phase 3 never
  // re-captures it. When Phase 2 had Immediate Loading / Healing Abutment, also drop the
  // All-Components-Available row so only the 4 spec'd items remain.
  const anyCoverScrewInMixed =
    phase2Components.length > 0 &&
    phase2Components.some((v) => v === "Cover Screw Placed");
  const simplifyChecklist =
    !anyCoverScrewInMixed &&
    (phase2Component === "Immediate Loading Done" ||
      phase2Component === "Healing Abutment Placed");
  const CHECKLIST_ITEMS_FILTERED = React.useMemo(
    () =>
      CHECKLIST_DATA.second_stage.items.filter((i) => {
        if (i.id === "healing_abutment") return false; // never surface in Phase 3 per spec
        if (simplifyChecklist && i.id === "components_available") return false;
        return true;
      }),
    [simplifyChecklist],
  );

  // Checklist state
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {},
  );
  // Text fields embedded in checklist
  const [isqValues, setIsqValues] = useState<string[]>([""]);
  const [healingAbutmentHeight, setHealingAbutmentHeight] = useState<string[]>([
    "",
  ]);
  const [implantPositions, setImplantPositions] = useState<string[]>([]);
  // IOPA uploads
  const [iopaFiles, setIopaFiles] = useState<
    (null | { filename: string; original_name: string; tooth_label: string })[]
  >([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [authToken, setAuthToken] = useState("");

  useEffect(() => {
    getToken("access_token").then((t) => setAuthToken(t || ""));
  }, []);
  // Notes
  const [studentNotes, setStudentNotes] = useState("");

  // ── Phase 2 edit-request workflow ──
  // Student can flag wrong prosthesis/cuff data locked in Phase 2.
  // Non-blocking: student can still submit Phase 3, sees a pending-banner
  // until Supervisor/In-Charge resolves (via Phase2EditModal on case-detail).
  const [pendingEditRequest, setPendingEditRequest] = useState<any>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFieldsSel, setEditFieldsSel] = useState<Record<string, boolean>>(
    {},
  );
  const [editNote, setEditNote] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const isOwner = !!user && user.role === "student";

  useEffect(() => {
    loadImplantPlan();
  }, []);

  const loadImplantPlan = async () => {
    try {
      const res = await api.get(`/procedures/${id}/implant-plan`);
      // iter-341: filter to active implants (survivors + revisions). Backend
      // returns every Phase 2 implant when no survival review has been submitted,
      // so this call is safe for legacy cases and never over-filters.
      let activeTeeth: Set<string> | null = null;
      try {
        const act = await api.get(`/procedures/${id}/active-implants`);
        const teeth = (act.data?.active || [])
          .map((im: any) =>
            String(im.tooth_number || im.tooth || im.position || "").trim(),
          )
          .filter(Boolean);
        if (teeth.length > 0) activeTeeth = new Set(teeth);
      } catch {}
      const rawPlans = res.data.implant_plans || [];
      const filteredPlans = activeTeeth
        ? rawPlans.filter((p: any) =>
            activeTeeth!.has(String(p.position || "").trim()),
          )
        : rawPlans;
      const count = filteredPlans.length || res.data.number_of_implants || 1;
      const positions = filteredPlans.map((p: any) => p.position);
      setImplantPositions(positions);
      setHealingAbutmentHeight(new Array(count).fill(""));
      setIsqValues(new Array(count).fill(""));
      setIopaFiles(new Array(count).fill(null));
    } catch {
      setHealingAbutmentHeight([""]);
      setIsqValues([""]);
      setIopaFiles([null]);
    }
    // Pull Phase 2 fields so we can render the Phase 3 banner and decide checklist shape.
    // Phase 2 surgical fields are nested under `phase2_data` by the backend.
    try {
      const p = await api.get(`/procedures/${id}`);
      const d = p.data || {};
      const p2 = d.phase2_data || {};
      // iter-356: hydrate per-implant Prosthetic Components (falls back to [] if
      // Phase 2 used the single global dropdown).
      setPhase2Components(
        Array.isArray(p2.prosthetic_components) ? p2.prosthetic_components : [],
      );
      setPhase2Component(p2.prosthetic_component || "");
      setPhase2ProsthesisType(p2.prosthesis_type || "");
      setPhase2ProsthesisOther(p2.prosthesis_type_other || "");
      setCreatedById(d.created_by_id || null);
      setCreatedByRole(d.created_by_role || null);
      if (Array.isArray(p2.healing_abutment_cuff_height))
        setPhase2HealingCuffs(p2.healing_abutment_cuff_height);
      // iter-357: seed per-implant Phase 3 healing-abutment config from Phase 2.
      // Only for the multi-implant per-implant flow (Phase 2 has
      // `prosthetic_components[]`). For single/full-arch cases we leave
      // haConfig empty — the legacy `healing_abutment_height` array is used.
      const p2Components: string[] = Array.isArray(p2.prosthetic_components)
        ? p2.prosthetic_components
        : [];
      const p2Cuffs: string[] = Array.isArray(p2.healing_abutment_cuff_height)
        ? p2.healing_abutment_cuff_height
        : [];
      const p3Existing =
        d.phase3_data && Array.isArray(d.phase3_data.phase3_healing_abutment_config)
          ? d.phase3_data.phase3_healing_abutment_config
          : [];
      if (p2Components.length > 0) {
        const seeded: HAConfig[] = p2Components.map((pc, i) => {
          const saved = p3Existing[i] || {};
          const phase2Cuff = pc === "Healing Abutment Placed" ? p2Cuffs[i] || "" : "";
          return {
            mode: (saved.mode as any) || "",
            // Prefill: Healing-Abutment implants get Phase 2 cuff; others start blank
            cuff_height_mm:
              saved.cuff_height_mm != null ? String(saved.cuff_height_mm) : phase2Cuff,
            customised_details: saved.customised_details || "",
            phase2_component: pc || "",
            phase2_cuff_height_mm: phase2Cuff,
          };
        });
        setHaConfig(seeded);
      } else {
        setHaConfig([]);
      }
      // Latest pending edit request (backend blocks more than one at a time).
      const reqs: any[] = Array.isArray(d.phase2_edit_requests)
        ? d.phase2_edit_requests
        : [];
      setPendingEditRequest(reqs.find((r) => r?.status === "pending") || null);
    } catch {}
  };

  // ── Phase 2 edit-request handlers (student only) ──
  const openEditRequestModal = () => {
    setEditFieldsSel({});
    setEditNote("");
    setEditModalOpen(true);
  };
  const submitEditRequest = async () => {
    const chosen = Object.keys(editFieldsSel).filter((k) => editFieldsSel[k]);
    if (chosen.length === 0 && !editNote.trim()) {
      Alert.alert(
        "Nothing to send",
        "Please select at least one field or add a note.",
      );
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await api.post(`/procedures/${id}/phase2-edit-request`, {
        fields: chosen,
        note: editNote.trim() || null,
      });
      setPendingEditRequest(res.data);
      setEditModalOpen(false);
      Alert.alert(
        "Request sent",
        "Your Supervisor and Implant In-Charge have been notified. You can still submit Phase 3 — a pending-edit indicator will stay visible until they update the data.",
      );
    } catch (err: any) {
      Alert.alert(
        "Could not send",
        err?.response?.data?.detail || "Failed to send edit request",
      );
    } finally {
      setEditSubmitting(false);
    }
  };
  const cancelEditRequest = async () => {
    if (!pendingEditRequest?.id) return;
    try {
      await api.post(
        `/procedures/${id}/phase2-edit-request/${pendingEditRequest.id}/cancel`,
      );
      setPendingEditRequest(null);
    } catch (err: any) {
      Alert.alert(
        "Could not cancel",
        err?.response?.data?.detail || "Failed to cancel request",
      );
    }
  };

  const toggleChecklist = (itemId: string) => {
    setChecklistState((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // ── IOPA Upload helpers ──
  const getIopaLabel = (idx: number): string => {
    return implantPositions[idx] ? `Tooth #${implantPositions[idx]}` : "Tooth #—";
  };

  const pickIopaFile = async (idx: number) => {
    try {
      const picked = await showUploadPicker([
        "image/png",
        "image/jpeg",
        "image/heic",
        "image/heif",
        "application/pdf",
      ]);
      if (!picked) return;
      setUploadingIdx(idx);
      // iter-317: RN-Web FormData rejects the `{uri,name,type}` shape mobile
      // recognises — convert URI → Blob on web before appending.
      const formPayload = new FormData();
      const filename = picked.name || "iopa.jpg";
      const mime = picked.type || "image/jpeg";
      if (Platform.OS === "web") {
        const blob = await fetch(picked.uri).then((r) => r.blob());
        formPayload.append("file", blob, filename);
      } else {
        formPayload.append("file", {
          uri: picked.uri,
          name: filename,
          type: mime,
        } as any);
      }
      const res = await api.post("/uploads/cbct-temp", formPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const updated = [...iopaFiles];
      updated[idx] = {
        filename: res.data.cbct_file,
        original_name: res.data.cbct_original_name,
        tooth_label: getIopaLabel(idx),
      };
      setIopaFiles(updated);
    } catch (err: any) {
      Alert.alert(
        "Upload Failed",
        err.response?.data?.detail || "Could not upload IOPA",
      );
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleSubmit = async () => {
    // iter-262: holistic pre-flight — list all missing sections at once.
    const missing: string[] = [];
    const unanswered = CHECKLIST_ITEMS_FILTERED.filter(
      (i) => i.id !== "isq_checked" && checklistState[i.id] === undefined,
    );
    if (unanswered.length > 0)
      missing.push(
        `Checklist (${unanswered.length} item${unanswered.length > 1 ? "s" : ""} unanswered)`,
      );
    const missingIopaCount = iopaFiles.filter((f) => f === null).length;
    if (missingIopaCount > 0)
      missing.push(`IOPA Radiographs (${missingIopaCount} pending)`);
    // iter-357: per-implant Phase 3 healing abutment configuration (Q3-a).
    // Every implant must have a completed selection.
    const haMissingIdxs: number[] = [];
    const haOverWordsIdxs: number[] = [];
    haConfig.forEach((cfg, i) => {
      if (!cfg.mode) haMissingIdxs.push(i);
      else if (cfg.mode === "standard" && !cfg.cuff_height_mm.trim())
        haMissingIdxs.push(i);
      else if (cfg.mode === "customised") {
        if (!cfg.customised_details.trim()) haMissingIdxs.push(i);
        else if (countWords(cfg.customised_details) > WORDS_MAX)
          haOverWordsIdxs.push(i);
      }
    });
    if (haMissingIdxs.length > 0) {
      missing.push(
        `Healing Abutment Configuration (${haMissingIdxs.length} implant${haMissingIdxs.length > 1 ? "s" : ""} incomplete)`,
      );
    }
    if (haOverWordsIdxs.length > 0) {
      missing.push(
        `Customised description exceeds ${WORDS_MAX} words on ${haOverWordsIdxs.length} implant${haOverWordsIdxs.length > 1 ? "s" : ""}`,
      );
    }
    if (missing.length > 1) {
      Alert.alert(
        "Incomplete sections",
        `Please complete the following before submitting Phase 3:\n\n${missing.map((l) => `• ${l}`).join("\n")}`,
        [{ text: "OK" }],
      );
      return;
    }
    // Single-section misses fall through to specific Alerts below.

    // Validate all visible checklist items answered — ISQ item is optional per product spec
    // (user can tick Yes + enter a value, or skip entirely).
    if (unanswered.length > 0) {
      Alert.alert(
        "Checklist Incomplete",
        `Please answer: ${unanswered[0].label}`,
      );
      return;
    }

    // Validate mandatory IOPA uploads
    const missingIopa = iopaFiles.filter((f) => f === null);
    if (missingIopa.length > 0) {
      Alert.alert(
        "Missing IOPA",
        `Please upload all ${iopaFiles.length} IOPA Radiographs before submitting.`,
      );
      return;
    }

    // iter-357: single-section validation for the per-implant HA config.
    if (haMissingIdxs.length > 0) {
      Alert.alert(
        "Healing Abutment Configuration Incomplete",
        `Please complete each implant: pick "Standard cuff height" (with mm value) OR "Customised healing abutment" (with details).\n\nMissing: ${haMissingIdxs.map((i) => (implantPositions[i] ? `Tooth #${implantPositions[i]}` : "Tooth #—")).join(", ")}`,
      );
      return;
    }
    if (haOverWordsIdxs.length > 0) {
      Alert.alert(
        "Customised description too long",
        `Customised healing abutment description exceeds ${WORDS_MAX} words on ${haOverWordsIdxs.map((i) => (implantPositions[i] ? `Tooth #${implantPositions[i]}` : "Tooth #—")).join(", ")}. Please shorten before submitting.`,
      );
      return;
    }

    setLoading(true);
    try {
      // iter-357: When haConfig is populated, we send both the legacy
      // `healing_abutment_height` (from Standard-mode entries) so downstream
      // PDF/analytics still render correctly, plus the rich
      // `phase3_healing_abutment_config` for exact per-implant hand-off.
      const legacyCuffs =
        haConfig.length > 0
          ? haConfig.map((c) => (c.mode === "standard" ? c.cuff_height_mm : ""))
          : healingAbutmentHeight;
      const perImplantPayload =
        haConfig.length > 0
          ? haConfig.map((c, i) => ({
              implant_idx: i,
              mode: c.mode,
              cuff_height_mm: c.mode === "standard" ? c.cuff_height_mm : "",
              customised_details:
                c.mode === "customised" ? c.customised_details.trim() : "",
              phase2_component: c.phase2_component,
              phase2_cuff_height_mm: c.phase2_cuff_height_mm,
            }))
          : null;
      await api.post(`/procedures/${id}/stage2/surgical`, {
        checklist_items: checklistState,
        isq_value: isqValues.length === 1 ? isqValues[0] || null : isqValues,
        healing_abutment_height: legacyCuffs || null,
        phase3_healing_abutment_config: perImplantPayload,
        iopa_files: iopaFiles
          .filter((f) => f !== null)
          .map((f) => ({
            filename: f!.filename,
            original_name: f!.original_name,
            tooth_label: f!.tooth_label,
          })),
        student_notes: studentNotes || null,
        done_date: doneDate || null,
      });
      const isInchargeSelfCreated =
        user?.role === "implant_incharge" &&
        createdByRole === "implant_incharge" &&
        user?.id === createdById;
      if (isInchargeSelfCreated) {
        try {
          await api.post(`/procedures/${id}/stage2/surgical/approve`, {
            action: "approve",
            comment: "",
          });
        } catch {}
        setDoneCompleted(true);
      } else {
        Alert.alert(
          "Success",
          "Phase 3 submitted successfully! Awaiting approval.",
          [{ text: "OK", onPress: () => goBackOrHome() }],
        );
      }
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.detail || "Failed to submit Phase 3",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <PhaseHeader
        title="Phase 3 - Healing and Second Stage Surgery"
        testID="phase3-submit-header"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} nestedScrollEnabled>
          <View style={s.infoBox}>
            <Ionicons name="information-circle" size={22} color="#1565C0" />
            <Text style={s.infoText}>
              Stage 1 Implant Placement is complete. Please complete the second
              stage surgical checklist for healing and exposure phase
              assessment.
            </Text>
          </View>

          {/* ── Phase 2 summary banner (per product spec) ── */}
          {phase2Component === "Immediate Loading Done" && (
            <View
              style={[
                s.section,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: "#2E7D32",
                  backgroundColor: "#F1F8E9",
                },
              ]}
              testID="phase3-immediate-prosthesis-banner"
            >
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: "#1B5E20" }}
              >
                Immediate Prosthesis Done
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: "#33691E" }}>
                {phase2ProsthesisType === "Other"
                  ? phase2ProsthesisOther || "Other"
                  : phase2ProsthesisType || "—"}
              </Text>
              {isOwner && !pendingEditRequest && (
                <TouchableOpacity
                  style={s.requestEditBtn}
                  onPress={openEditRequestModal}
                  data-testid="phase3-request-edit-btn"
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color="#E65100"
                  />
                  <Text style={s.requestEditBtnText}>
                    Need Changes — Request Edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* iter-356: Mixed Prosthetic Components banner — Phase 2 used
              per-implant selection with more than one distinct value.
              We surface a per-implant map so the operator knows exactly
              which implants require second-stage uncovering and which
              are healing-abutment / immediate-loading (no second-stage). */}
          {phase2Components.length > 0 &&
            new Set(phase2Components.filter(Boolean)).size > 1 && (
              <View
                style={[
                  s.section,
                  {
                    borderLeftWidth: 4,
                    borderLeftColor: "#6A1B9A",
                    backgroundColor: "#F3E5F5",
                  },
                ]}
                testID="phase3-mixed-prosthetic-banner"
                data-testid="phase3-mixed-prosthetic-banner"
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "800", color: "#4A148C" }}
                >
                  Mixed Prosthetic Components
                </Text>
                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#6A1B9A",
                    fontStyle: "italic",
                  }}
                >
                  Second-stage uncovering applies only to implants marked "Cover
                  Screw Placed".
                </Text>
                {phase2Components.map((pc, i) => (
                  <Text
                    key={i}
                    style={{ marginTop: 4, fontSize: 13, color: "#4A148C" }}
                  >
                    {implantPositions[i]
                      ? `Tooth #${implantPositions[i]}`
                      : "Tooth #—"}
                    : <Text style={{ fontWeight: "700" }}>{pc || "—"}</Text>
                  </Text>
                ))}
              </View>
            )}

          {phase2Component === "Healing Abutment Placed" && (
            <View
              style={[
                s.section,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: "#1565C0",
                  backgroundColor: "#E3F2FD",
                },
              ]}
              testID="phase3-healing-abutment-banner"
            >
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: "#0D47A1" }}
              >
                Healing Abutment Placed
              </Text>
              {phase2HealingCuffs.length > 0 ? (
                phase2HealingCuffs.map((h, i) => (
                  <Text
                    key={i}
                    style={{ marginTop: 4, fontSize: 13, color: "#1A237E" }}
                  >
                    {implantPositions[i]
                      ? `Tooth #${implantPositions[i]}`
                      : "Tooth #—"}
                    : {h || "—"} mm
                  </Text>
                ))
              ) : (
                <Text style={{ marginTop: 4, fontSize: 13, color: "#1A237E" }}>
                  No cuff heights recorded
                </Text>
              )}
              {isOwner && !pendingEditRequest && (
                <TouchableOpacity
                  style={s.requestEditBtn}
                  onPress={openEditRequestModal}
                  data-testid="phase3-request-edit-btn"
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color="#E65100"
                  />
                  <Text style={s.requestEditBtnText}>
                    Need Changes — Request Edit
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Pending edit-request banner ── */}
          {pendingEditRequest && (
            <View
              style={[
                s.section,
                {
                  borderLeftWidth: 4,
                  borderLeftColor: "#F9A825",
                  backgroundColor: "#FFFDE7",
                },
              ]}
              testID="phase3-pending-edit-banner"
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons name="time-outline" size={18} color="#E65100" />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#E65100",
                    flex: 1,
                  }}
                >
                  Edit requested — waiting for Supervisor / In-Charge
                </Text>
              </View>
              {!!pendingEditRequest.note && (
                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "#6D4C41",
                    fontStyle: "italic",
                  }}
                >
                  “{pendingEditRequest.note}”
                </Text>
              )}
              {isOwner && (
                <TouchableOpacity
                  style={s.cancelRequestBtn}
                  onPress={cancelEditRequest}
                  data-testid="phase3-cancel-edit-request-btn"
                >
                  <Text style={s.cancelRequestText}>Cancel request</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ─── iter-357: Per-implant Phase 3 Healing Abutment Configuration ───
              Renders when Phase 2 used per-implant Prosthetic Components (multi-
              implant non-full-arch, non-single flow). For EACH implant (Cover
              Screw, Healing Abutment or Immediate Loading), the surgeon must
              pick one of:
                a. Standard cuff height (mm — pre-filled from Phase 2 when
                   Healing Abutment was already placed).
                b. Customised healing abutment (free-text, ≤ 100 words, hard block).
              Every implant must have a selection before submit. */}
          {haConfig.length > 0 && (
            <View style={s.section} data-testid="phase3-per-implant-ha-section">
              <View style={s.sectionHeader}>
                <Ionicons name="options-outline" size={20} color="#00695C" />
                <Text style={s.sectionTitle}>
                  Healing Abutment Configuration{" "}
                  <Text style={{ color: "#DC3545" }}>*</Text>
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: "#546E7A",
                  fontStyle: "italic",
                  marginBottom: 12,
                }}
              >
                Per implant — pick Standard cuff height OR Customised healing
                abutment.
              </Text>
              {haConfig.map((cfg, idx) => {
                const wc = countWords(cfg.customised_details);
                const overWords = wc > WORDS_MAX;
                const pos = implantPositions[idx];
                const setMode = (mode: HAConfig["mode"]) => {
                  setHaConfig((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, mode } : x)),
                  );
                };
                const setCuff = (v: string) => {
                  setHaConfig((prev) =>
                    prev.map((x, i) =>
                      i === idx ? { ...x, cuff_height_mm: v } : x,
                    ),
                  );
                };
                const setDetails = (v: string) => {
                  // iter-357 Q2-a: hard block — never let the user store more than
                  // 100 words. We accept keystrokes up to the boundary but visually
                  // flag anything longer via the counter + red border.
                  setHaConfig((prev) =>
                    prev.map((x, i) =>
                      i === idx ? { ...x, customised_details: v } : x,
                    ),
                  );
                };
                return (
                  <View
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: "#B2DFDB",
                      borderRadius: 10,
                      backgroundColor: "#F0FDFC",
                      padding: 12,
                      marginBottom: 12,
                    }}
                    data-testid={`phase3-ha-card-${idx}`}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <Text
                        style={{ fontSize: 14, fontWeight: "800", color: "#00695C" }}
                      >
                        Implant {idx + 1}
                        {pos ? ` (#${pos})` : ""}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: "#E0F2F1",
                          borderColor: "#4DB6AC",
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: "#00695C",
                            letterSpacing: 0.3,
                          }}
                        >
                          Phase 2: {cfg.phase2_component || "—"}
                          {cfg.phase2_cuff_height_mm
                            ? ` · ${cfg.phase2_cuff_height_mm} mm`
                            : ""}
                        </Text>
                      </View>
                    </View>

                    {/* Mode selector */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginTop: 6,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {(["standard", "customised"] as const).map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setMode(m)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: cfg.mode === m ? "#00695C" : "#B2DFDB",
                            backgroundColor: cfg.mode === m ? "#00695C" : "#FFF",
                          }}
                          data-testid={`phase3-ha-mode-${idx}-${m}`}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: cfg.mode === m ? "#FFF" : "#00695C",
                            }}
                          >
                            {m === "standard"
                              ? "Standard cuff height"
                              : "Customised healing abutment"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {cfg.mode === "standard" && (
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <Text
                          style={{ fontSize: 13, color: "#37474F", fontWeight: "600" }}
                        >
                          Cuff height
                        </Text>
                        <TextInput
                          style={[s.smallInput, { minWidth: 90 }]}
                          value={cfg.cuff_height_mm}
                          onChangeText={setCuff}
                          placeholder="mm"
                          keyboardType="decimal-pad"
                          maxLength={5}
                          data-testid={`phase3-ha-cuff-${idx}`}
                        />
                        <Text style={{ fontSize: 13, color: "#78909C" }}>mm</Text>
                        {cfg.phase2_cuff_height_mm &&
                          cfg.cuff_height_mm !== cfg.phase2_cuff_height_mm && (
                            <Text
                              style={{
                                fontSize: 11,
                                color: "#E65100",
                                fontStyle: "italic",
                              }}
                            >
                              (was {cfg.phase2_cuff_height_mm} mm in Phase 2)
                            </Text>
                          )}
                      </View>
                    )}

                    {cfg.mode === "customised" && (
                      <View>
                        <TextInput
                          style={{
                            borderWidth: 1,
                            borderColor: overWords ? "#F44336" : "#B2DFDB",
                            borderRadius: 8,
                            backgroundColor: "#FFF",
                            padding: 10,
                            fontSize: 13,
                            minHeight: 80,
                            textAlignVertical: "top",
                            color: "#263238",
                          }}
                          value={cfg.customised_details}
                          onChangeText={setDetails}
                          multiline
                          placeholder="Describe the customised healing abutment (design, brand, dimensions, occlusal considerations)…"
                          placeholderTextColor="#90A4AE"
                          data-testid={`phase3-ha-custom-${idx}`}
                        />
                        <Text
                          style={{
                            textAlign: "right",
                            marginTop: 4,
                            fontSize: 11,
                            fontWeight: "600",
                            color: overWords
                              ? "#F44336"
                              : wc >= WORDS_MAX - 10
                                ? "#E65100"
                                : "#78909C",
                          }}
                          data-testid={`phase3-ha-words-${idx}`}
                        >
                          {wc} / {WORDS_MAX} words{overWords ? " — over limit" : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Checklist ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color="#1565C0" />
              <Text style={s.sectionTitle}>
                Second Stage Checklist{" "}
                <Text style={{ color: "#DC3545" }}>*</Text>
              </Text>
            </View>

            {CHECKLIST_ITEMS_FILTERED.map((item) => (
              <View key={item.id}>
                <View style={s.checkRow}>
                  <Text style={[s.checkLabel, { flex: 1 }]}>{item.label}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {["Yes", "No"].map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          {
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                            borderWidth: 1.5,
                            borderColor: "#D0DCE8",
                            backgroundColor: "#F8FAFC",
                            minWidth: 50,
                            alignItems: "center" as const,
                          },
                          checklistState[item.id] === true &&
                            opt === "Yes" && {
                              borderColor: "#4CAF50",
                              backgroundColor: "#4CAF50",
                            },
                          checklistState[item.id] === false &&
                            opt === "No" && {
                              borderColor: "#F44336",
                              backgroundColor: "#F44336",
                            },
                        ]}
                        onPress={() =>
                          setChecklistState((prev) => ({
                            ...prev,
                            [item.id]: opt === "Yes",
                          }))
                        }
                      >
                        <Text
                          style={[
                            {
                              fontSize: 13,
                              color: "#666",
                              fontWeight: "600" as const,
                            },
                            (checklistState[item.id] === true &&
                              opt === "Yes") ||
                            (checklistState[item.id] === false && opt === "No")
                              ? { color: "#FFF" }
                              : {},
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Upload IOPA Radiographs below Radiograph Made */}
                {item.id === "radiograph_made" && checklistState[item.id] && (
                  <View
                    style={{
                      paddingLeft: 0,
                      paddingVertical: 8,
                      backgroundColor: "#E3F2FD",
                      borderRadius: 8,
                      marginBottom: 4,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#90CAF9",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#1565C0",
                        marginBottom: 10,
                      }}
                    >
                      Upload IOPA Radiograph
                    </Text>
                    {iopaFiles.map((file, idx) => {
                      const label = implantPositions[idx]
                        ? `Tooth #${implantPositions[idx]}`
                        : "Tooth #—";
                      const baseUrl = api.defaults.baseURL || "";
                      return (
                        <View
                          key={idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                          }}
                          data-testid={`p3-iopa-slot-${idx}`}
                        >
                          <View
                            style={{
                              flex: 1,
                              backgroundColor: "#BBDEFB",
                              padding: 8,
                              borderRadius: 8,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "600",
                                color: "#0D47A1",
                              }}
                            >
                              {label}
                            </Text>
                          </View>
                          <View
                            style={{
                              flex: 1.5,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {file ? (
                              <>
                                {file.filename.match(/\.(png|jpg|jpeg)$/i) ? (
                                  <Image
                                    source={{
                                      uri: `${baseUrl}/uploads/${file.filename}?token=${authToken}`,
                                    }}
                                    style={{
                                      width: 36,
                                      height: 36,
                                      borderRadius: 6,
                                    }}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Ionicons
                                    name="document-attach"
                                    size={22}
                                    color="#4CAF50"
                                  />
                                )}
                                <TouchableOpacity
                                  style={{
                                    backgroundColor: "#4CAF50",
                                    borderRadius: 8,
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                    flex: 1,
                                  }}
                                  onPress={() =>
                                    Linking.openURL(
                                      `${baseUrl}/uploads/${file.filename}?token=${authToken}`,
                                    ).catch(() =>
                                      Alert.alert(
                                        "Error",
                                        "Could not open file",
                                      ),
                                    )
                                  }
                                  data-testid={`p3-view-iopa-${idx}`}
                                >
                                  <Text
                                    style={{
                                      color: "#FFF",
                                      fontSize: 12,
                                      fontWeight: "700",
                                    }}
                                    numberOfLines={1}
                                  >
                                    View
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    const u = [...iopaFiles];
                                    u[idx] = null;
                                    setIopaFiles(u);
                                  }}
                                  data-testid={`p3-remove-iopa-${idx}`}
                                >
                                  <Ionicons
                                    name="close-circle"
                                    size={22}
                                    color="#E53935"
                                  />
                                </TouchableOpacity>
                              </>
                            ) : (
                              <TouchableOpacity
                                style={{
                                  backgroundColor: "#1A73E8",
                                  borderRadius: 8,
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  flex: 1,
                                  justifyContent: "center",
                                }}
                                onPress={() => pickIopaFile(idx)}
                                disabled={uploadingIdx === idx}
                                data-testid={`p3-upload-iopa-${idx}`}
                              >
                                {uploadingIdx === idx ? (
                                  <ActivityIndicator
                                    color="#FFF"
                                    size="small"
                                  />
                                ) : (
                                  <>
                                    <Ionicons
                                      name="cloud-upload"
                                      size={16}
                                      color="#FFF"
                                    />
                                    <Text
                                      style={{
                                        color: "#FFF",
                                        fontSize: 12,
                                        fontWeight: "600",
                                      }}
                                    >
                                      Upload IOPA
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* ISQ Value per implant - green theme */}
                {item.id === "isq_checked" && checklistState[item.id] && (
                  <View
                    style={{
                      backgroundColor: "#E8F5E9",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 4,
                      borderWidth: 1,
                      borderColor: "#A5D6A7",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#2E7D32",
                        marginBottom: 10,
                      }}
                    >
                      ISQ Values
                    </Text>
                    {isqValues.map((val, idx) => {
                      const label = implantPositions[idx]
                        ? `Tooth #${implantPositions[idx]}`
                        : "Tooth #—";
                      return (
                        <View
                          key={idx}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                          }}
                          data-testid={`isq-slot-${idx}`}
                        >
                          <View
                            style={{
                              flex: 1,
                              backgroundColor: "#C8E6C9",
                              padding: 8,
                              borderRadius: 8,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "600",
                                color: "#1B5E20",
                              }}
                            >
                              {label}
                            </Text>
                          </View>
                          <TextInput
                            style={{
                              flex: 1,
                              borderWidth: 1.5,
                              borderColor: "#4CAF50",
                              borderRadius: 8,
                              padding: 8,
                              fontSize: 16,
                              fontWeight: "700",
                              textAlign: "center",
                              backgroundColor: "#FFF",
                            }}
                            value={val}
                            onChangeText={(text) => {
                              const updated = [...isqValues];
                              updated[idx] = text;
                              setIsqValues(updated);
                            }}
                            placeholder="e.g. 72"
                            keyboardType="decimal-pad"
                            maxLength={5}
                            data-testid={`isq-input-${idx}`}
                          />
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Healing Abutment cuff height - per implant
                    iter-357: hidden when the new per-implant HA config is
                    active (haConfig covers this per-implant). */}
                {item.id === "healing_abutment" &&
                  checklistState[item.id] &&
                  haConfig.length === 0 && (
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingVertical: 8,
                      backgroundColor: "#FFF8E1",
                      borderRadius: 8,
                      marginBottom: 4,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#FFE082",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#E65100",
                        marginBottom: 8,
                      }}
                    >
                      Cuff Height (mm)
                    </Text>
                    {healingAbutmentHeight.map((val, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 8,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: "#FFF3E0",
                            padding: 8,
                            borderRadius: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: "#BF360C",
                            }}
                          >
                            Implant {idx + 1}
                            {implantPositions[idx]
                              ? ` (#${implantPositions[idx]})`
                              : ""}
                          </Text>
                        </View>
                        <TextInput
                          style={s.smallInput}
                          value={val}
                          onChangeText={(v) => {
                            const u = [...healingAbutmentHeight];
                            u[idx] = v;
                            setHealingAbutmentHeight(u);
                          }}
                          placeholder="mm"
                          keyboardType="decimal-pad"
                          maxLength={5}
                          data-testid={`healing-abutment-height-${idx}`}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: "#888",
                          }}
                        >
                          mm
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* ── Clinical / Radiographical Assessment Notes ── */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#00695C"
              />
              <Text style={s.sectionTitle}>
                Clinical / Radiographical Assessment
              </Text>
            </View>

            <View style={s.field}>
              <Text style={s.label}>{notesLabel}</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={studentNotes}
                onChangeText={setStudentNotes}
                placeholder="Clinical findings, healing assessment, implant stability observations, soft tissue status..."
                multiline
                numberOfLines={4}
                data-testid="phase3-student-notes"
              />
            </View>

            {user?.role !== "implant_incharge" && (
              <Text style={s.helperText} testID="phase3-approval-helper">
                {user?.role === "supervisor"
                  ? "Implant In-Charge remark will be added during approval."
                  : "Supervisor and In-Charge remarks will be added during approval."}
              </Text>
            )}
          </View>

          {/* ── Submit ── */}
          {doneCompleted ? (
            <View
              style={{ padding: 16, paddingBottom: 32, alignItems: "center" }}
              testID="phase3-done-success"
            >
              <View
                style={{
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  borderRadius: 999,
                  backgroundColor: "#E8F5E9",
                  borderWidth: 1.5,
                  borderColor: "#43A047",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "800",
                    color: "#1B5E20",
                    letterSpacing: 0.5,
                  }}
                >
                  Approved
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.replace(`/procedures/${id}`)}
                style={{ marginTop: 14 }}
                testID="phase3-view-case-link"
              >
                <Text
                  style={{
                    color: "#1565C0",
                    fontWeight: "600",
                    fontSize: 14,
                    textDecorationLine: "underline",
                  }}
                >
                  View Case
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ padding: 16, paddingBottom: 32 }}>
              {/* iter-332: actual date this Phase 3 work was performed.
                  Defaults to today; up to 30 days back. */}
              <DoneDatePicker
                label="Done On (Phase 3 — Second-Stage Surgery / Healing Abutment)"
                value={doneDate}
                onChange={setDoneDate}
                testID="phase3-done-date"
                helperText="Pick the date you actually performed this step. Defaults to today; can back-date up to 30 days; future dates not allowed."
              />
              {/* iter-262: visually disabled when checklist or IOPA uploads incomplete. */}
              {(() => {
                const unansweredCount = CHECKLIST_ITEMS_FILTERED.filter(
                  (i) =>
                    i.id !== "isq_checked" &&
                    checklistState[i.id] === undefined,
                ).length;
                const pendingIopa = iopaFiles.filter((f) => f === null).length;
                const canSubmit = unansweredCount === 0 && pendingIopa === 0;
                const isInchargeSelf =
                  user?.role === "implant_incharge" &&
                  createdByRole === "implant_incharge" &&
                  user?.id === createdById;
                return (
                  <>
                    <TouchableOpacity
                      style={[
                        s.submitBtn,
                        loading && { opacity: 0.6 },
                        !canSubmit && {
                          backgroundColor: "#B0BEC5",
                          shadowOpacity: 0,
                        },
                      ]}
                      onPress={handleSubmit}
                      disabled={loading}
                      data-testid="phase3-submit-btn"
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Ionicons
                            name={
                              canSubmit ? "checkmark-circle" : "lock-closed"
                            }
                            size={22}
                            color="#FFF"
                          />
                          <Text style={s.submitText}>
                            {isInchargeSelf
                              ? "Done"
                              : "Submit Phase 3 for Approval"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {!canSubmit && !loading && (
                      <Text
                        style={{
                          marginTop: 8,
                          textAlign: "center",
                          color: "#90A4AE",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {unansweredCount > 0 && pendingIopa > 0
                          ? "Checklist + IOPA uploads incomplete — tap to see what's missing"
                          : unansweredCount > 0
                            ? `${unansweredCount} checklist item${unansweredCount > 1 ? "s" : ""} unanswered — tap to see what's missing`
                            : `${pendingIopa} IOPA upload${pendingIopa > 1 ? "s" : ""} pending — tap to see what's missing`}
                      </Text>
                    )}
                  </>
                );
              })()}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Phase 2 Edit Request Modal ── */}
      <Modal
        visible={editModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalOpen(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Request Phase 2 Edit</Text>
              <TouchableOpacity
                onPress={() => setEditModalOpen(false)}
                data-testid="phase3-edit-modal-close"
              >
                <Ionicons name="close" size={22} color="#607D8B" />
              </TouchableOpacity>
            </View>
            <Text style={s.modalHint}>
              Select what needs changing. Your Supervisor and Implant In-Charge
              will be notified.
            </Text>
            {phase2Component === "Immediate Loading Done" && (
              <TouchableOpacity
                style={[
                  s.modalChoice,
                  editFieldsSel.prosthesis_type && s.modalChoiceActive,
                ]}
                onPress={() =>
                  setEditFieldsSel((v) => ({
                    ...v,
                    prosthesis_type: !v.prosthesis_type,
                  }))
                }
                data-testid="phase3-edit-choice-prosthesis-type"
              >
                <Ionicons
                  name={
                    editFieldsSel.prosthesis_type
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={20}
                  color={editFieldsSel.prosthesis_type ? "#1565C0" : "#90A4AE"}
                />
                <Text style={s.modalChoiceText}>Prosthesis Type</Text>
              </TouchableOpacity>
            )}
            {phase2Component === "Healing Abutment Placed" && (
              <TouchableOpacity
                style={[
                  s.modalChoice,
                  editFieldsSel.healing_abutment_cuff_height &&
                    s.modalChoiceActive,
                ]}
                onPress={() =>
                  setEditFieldsSel((v) => ({
                    ...v,
                    healing_abutment_cuff_height:
                      !v.healing_abutment_cuff_height,
                  }))
                }
                data-testid="phase3-edit-choice-cuff-height"
              >
                <Ionicons
                  name={
                    editFieldsSel.healing_abutment_cuff_height
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={20}
                  color={
                    editFieldsSel.healing_abutment_cuff_height
                      ? "#1565C0"
                      : "#90A4AE"
                  }
                />
                <Text style={s.modalChoiceText}>
                  Healing Abutment Cuff Height
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                s.modalChoice,
                editFieldsSel.other && s.modalChoiceActive,
              ]}
              onPress={() =>
                setEditFieldsSel((v) => ({ ...v, other: !v.other }))
              }
              data-testid="phase3-edit-choice-other"
            >
              <Ionicons
                name={editFieldsSel.other ? "checkbox" : "square-outline"}
                size={20}
                color={editFieldsSel.other ? "#1565C0" : "#90A4AE"}
              />
              <Text style={s.modalChoiceText}>Other</Text>
            </TouchableOpacity>
            <Text style={[s.label, { marginTop: 12 }]}>
              Note to reviewer (optional)
            </Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Briefly describe what's wrong and what should change..."
              multiline
              maxLength={500}
              data-testid="phase3-edit-note-input"
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalCancel]}
                onPress={() => setEditModalOpen(false)}
                disabled={editSubmitting}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.modalBtn,
                  s.modalSubmit,
                  editSubmitting && { opacity: 0.6 },
                ]}
                onPress={submitEditRequest}
                disabled={editSubmitting}
                data-testid="phase3-edit-submit-btn"
              >
                {editSubmitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={s.modalSubmitText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  scroll: { paddingBottom: 32 },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D47A1",
    textAlign: "center",
    paddingVertical: 16,
    letterSpacing: 0.3,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#E3F2FD",
    margin: 16,
    padding: 16,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#BBDEFB",
    shadowColor: "#1565C0",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  infoText: { flex: 1, fontSize: 13, color: "#1565C0", lineHeight: 20 },
  section: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E0E7EE",
    shadowColor: "#1565C0",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1565C0",
    letterSpacing: 0.3,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  checkLabel: { flex: 1, fontSize: 14, color: "#333", lineHeight: 20 },
  inlineInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 32,
    paddingVertical: 8,
    backgroundColor: "#F0F4F8",
    borderRadius: 10,
    marginBottom: 4,
  },
  inlineLabel: { fontSize: 13, fontWeight: "600", color: "#1565C0" },
  smallInput: {
    width: 90,
    borderWidth: 1.5,
    borderColor: "#1565C0",
    borderRadius: 10,
    padding: 8,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FFF",
  },
  field: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1565C0",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#D0DCE8",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#F8FAFC",
    minHeight: 44,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  helperText: {
    fontSize: 12,
    color: "#90A4AE",
    fontStyle: "italic",
    marginTop: 4,
  },
  submitBtn: {
    flexDirection: "row",
    backgroundColor: "#1565C0",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1565C0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  submitText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  requestEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFB74D",
    backgroundColor: "#FFF3E0",
  },
  requestEditBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#E65100",
    letterSpacing: 0.2,
  },
  cancelRequestBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CFD8DC",
    backgroundColor: "#FFF",
  },
  cancelRequestText: { fontSize: 12, fontWeight: "600", color: "#607D8B" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(13,71,161,0.35)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0D47A1" },
  modalHint: {
    fontSize: 13,
    color: "#546E7A",
    marginBottom: 14,
    lineHeight: 19,
  },
  modalChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E7EE",
    marginBottom: 8,
  },
  modalChoiceActive: { borderColor: "#1565C0", backgroundColor: "#E3F2FD" },
  modalChoiceText: { fontSize: 14, fontWeight: "600", color: "#37474F" },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancel: { backgroundColor: "#ECEFF1" },
  modalCancelText: { fontSize: 14, fontWeight: "700", color: "#546E7A" },
  modalSubmit: { backgroundColor: "#1565C0" },
  modalSubmitText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
});
