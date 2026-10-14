/**
 * Research Module — shared types, labels and small UI atoms.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons, { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

export const RC = {
  bg: '#F5F7FB', card: '#FFFFFF', border: '#E1E7EF', text: '#1A2332', sub: '#546E7A', muted: '#90A4AE',
  primary: '#1E88E5', primarySoft: '#E3F2FD', green: '#2E7D32', greenSoft: '#E8F5E9', amber: '#EF6C00', amberSoft: '#FFF3E0',
  red: '#C62828', redSoft: '#FFEBEE', purple: '#6A1B9A', purpleSoft: '#F3E5F5', grey: '#78909C', greySoft: '#ECEFF1',
};

export type Variable = {
  key: string; label: string; description?: string; level: 'patient' | 'implant' | 'site';
  source: 'linked' | 'study' | 'derived'; data_type: string; unit?: string; min?: number | null; max?: number | null;
  decimals?: number | null; options: { code: string; label: string }[]; required: boolean;
  case_field_path?: string | null; formula?: string | null; method_note?: string;
  soft_warning?: { op: string; value: number; message: string } | null;
};
export type Timepoint = {
  key: string; label: string; anchor_event: string; anchor_variable_key?: string | null; offset_days: number;
  window_before_days: number; window_after_days: number; is_baseline: boolean; variables: string[];
};
export type Rule = { kind: 'include' | 'exclude'; mode: 'query' | 'checklist'; query?: any; checklist_text?: string };
export type Study = {
  id: string; code: string; title: string; status: string; study_type: string; primary_unit: string; target_n: number;
  research_question: string; pi_user_id: string; pi_name: string; is_dissertation: boolean; members: any[];
  eligibility: Rule[]; variables: Variable[]; timepoints: Timepoint[]; iec_ref?: string; iec_approval_date?: string;
  ctri_number?: string; consent_form_version?: string; guide_approved_at?: string | null; my_roles: string[];
  primary_units?: string[]; guide_user_id?: string | null; guide_name?: string | null; needs_guide_approval?: boolean;
  guide_review?: { status: string; comments?: string; reset_reason?: string; reviewer_name?: string; submitted_at?: string };
  iec_letter?: { filename?: string; content_type?: string; uploaded_by?: string; uploaded_at?: string; present?: boolean } | null;
  can_view_iec_letter?: boolean;
  activation_checklist: { label: string; ok: boolean }[]; protocol_errors: string[]; counts: any; audit_log?: any[];
  notes?: string;
};

export const STUDY_TYPE_LABEL: Record<string, string> = {
  prospective_cohort: 'Prospective cohort', retrospective_cohort: 'Retrospective cohort', rct: 'Randomised trial',
  case_series: 'Case series', split_mouth: 'Split-mouth', cross_sectional: 'Cross-sectional',
};
export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', active: 'Active', recruitment_closed: 'Recruitment closed', follow_up_complete: 'Follow-up complete',
  data_locked: 'Data locked', archived: 'Archived',
};
export const FORM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_due: { label: 'Not due', color: RC.grey, bg: RC.greySoft },
  in_window: { label: 'Due now', color: RC.primary, bg: RC.primarySoft },
  overdue: { label: 'Overdue', color: RC.amber, bg: RC.amberSoft },
  missed: { label: 'Missed', color: RC.red, bg: RC.redSoft },
  completed: { label: 'Completed', color: RC.green, bg: RC.greenSoft },
  locked: { label: 'Locked', color: RC.purple, bg: RC.purpleSoft },
  not_done: { label: 'Not done', color: RC.grey, bg: RC.greySoft },
};
export const ANCHOR_LABEL: Record<string, string> = {
  enrolment: 'Enrolment date', placement_date: 'Implant placement', second_stage_date: 'Second stage (Phase 3)',
  prosthesis_delivery_date: 'Prosthesis delivery / loading', variable: 'A date variable',
};
export const OP_LABEL: Record<string, string> = {
  eq: '=', neq: '≠', in: 'in list', not_in: 'not in list', gt: '>', gte: '≥', lt: '<', lte: '≤',
  between: 'between', exists: 'is recorded', not_exists: 'is not recorded', contains: 'contains',
};
export const MEMBER_ROLE_LABEL: Record<string, string> = {
  pi: 'Principal investigator', guide: 'Guide', co_investigator: 'Co-investigator', data_collector: 'Data collector', statistician: 'Statistician',
};

export function studyStatusStyle(status: string) {
  switch (status) {
    case 'active': return { color: RC.green, bg: RC.greenSoft };
    case 'draft': return { color: RC.amber, bg: RC.amberSoft };
    case 'data_locked': return { color: RC.purple, bg: RC.purpleSoft };
    case 'archived': return { color: RC.grey, bg: RC.greySoft };
    default: return { color: RC.primary, bg: RC.primarySoft };
  }
}

export function errText(e: any, fallback = 'Something went wrong') {
  const d = e?.response?.data?.detail ?? e?.response?.data?.error;
  if (!d) return e?.message || fallback;
  if (typeof d === 'string') return d;
  if (Array.isArray(d.errors)) return d.errors.join('\n');
  if (Array.isArray(d.warnings)) return d.warnings.join('\n');
  if (typeof d.message === 'string') return d.message;
  return fallback;
}

export function Chip({ label, color, bg, small, testID }: { label: string; color: string; bg: string; small?: boolean; testID?: string }) {
  return (
    <View style={[u.chip, { backgroundColor: bg }, small && { paddingVertical: 2, paddingHorizontal: 8 }]} testID={testID}>
      <Text style={[u.chipTxt, { color }, small && { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

export function ScreenHeader({ title, subtitle, right, onBack, testID }: {
  title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; testID?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Header owns the top inset (screens use edges={['bottom']}). Android Modals report 0 insets → status-bar fallback.
  const top = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0);
  return (
    <View style={[u.header, { paddingTop: top + 10 }]}>
      <TouchableOpacity onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace('/research')))}
        style={u.headerIcon} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="research-back">
        <Ionicons name="chevron-back" size={22} color={RC.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={u.headerTitle} numberOfLines={1} testID={testID}>{title}</Text>
        {!!subtitle && <Text style={u.headerSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  return <View style={[u.card, style]} testID={testID}>{children}</View>;
}

export function SectionTitle({ title, icon, right }: { title: string; icon?: IoniconsIconName; right?: React.ReactNode }) {
  return (
    <View style={u.sectionRow}>
      {icon && <Ionicons name={icon} size={16} color={RC.primary} style={{ marginRight: 6 }} />}
      <Text style={u.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, hint, testID, editable = true }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: any; hint?: string; testID?: string; editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={u.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={RC.muted}
        multiline={multiline} keyboardType={keyboardType} editable={editable}
        style={[u.input, multiline && { minHeight: 80, textAlignVertical: 'top' }, !editable && { backgroundColor: RC.greySoft }]}
        testID={testID}
      />
      {!!hint && <Text style={u.hint}>{hint}</Text>}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testID }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string;
}) {
  return (
    <View style={u.seg} testID={testID}>
      {options.map(o => (
        <TouchableOpacity key={o.key} onPress={() => onChange(o.key)}
          style={[u.segItem, value === o.key && u.segItemActive]} testID={`${testID || 'seg'}-${o.key}`}>
          <Text style={[u.segTxt, value === o.key && u.segTxtActive]} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function PillSelect<T extends string>({ options, value, onChange, testID }: {
  options: { key: T; label: string }[]; value: T | null | undefined; onChange: (v: T) => void; testID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <TouchableOpacity key={o.key} onPress={() => onChange(o.key)} testID={`${testID || 'pill'}-${o.key}`}
            style={[u.pill, on && { backgroundColor: RC.primary, borderColor: RC.primary }]}>
            <Text style={[u.pillTxt, on && { color: '#FFF' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loading, icon, variant = 'primary', testID, style }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; icon?: IoniconsIconName;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost'; testID?: string; style?: any;
}) {
  const bg = variant === 'primary' ? RC.primary : variant === 'danger' ? RC.red : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#FFF' : variant === 'ghost' ? RC.sub : RC.primary;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} testID={testID}
      style={[u.btn, { backgroundColor: bg, borderColor: variant === 'outline' ? RC.primary : 'transparent' }, (disabled || loading) && { opacity: 0.5 }, style]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <>
          {icon && <Ionicons name={icon} size={16} color={fg} style={{ marginRight: 6 }} />}
          <Text style={[u.btnTxt, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Empty({ icon, title, body }: { icon: IoniconsIconName; title: string; body?: string }) {
  return (
    <View style={u.empty}>
      <Ionicons name={icon} size={40} color="#B0BEC5" />
      <Text style={u.emptyTitle}>{title}</Text>
      {!!body && <Text style={u.emptyBody}>{body}</Text>}
    </View>
  );
}

export function Loading() {
  return <SafeAreaView style={u.center}><ActivityIndicator size="large" color={RC.primary} /></SafeAreaView>;
}

export const u = StyleSheet.create({
  container: { flex: 1, backgroundColor: RC.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: RC.border },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: RC.text },
  headerSub: { fontSize: 11, color: RC.sub, marginTop: 2 },
  card: { backgroundColor: RC.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: RC.border, marginHorizontal: 14, marginTop: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: RC.text, letterSpacing: 0.3, textTransform: 'uppercase' },
  label: { fontSize: 11, fontWeight: '700', color: RC.sub, letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 14, color: RC.text, backgroundColor: '#FFF', minHeight: 44 },
  hint: { fontSize: 11, color: RC.muted, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  chipTxt: { fontSize: 11, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: '#E8EDF3', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  segItemActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  segTxt: { fontSize: 12, fontWeight: '600', color: RC.sub },
  segTxtActive: { color: RC.text, fontWeight: '800' },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF', minHeight: 36, justifyContent: 'center' },
  pillTxt: { fontSize: 12, fontWeight: '600', color: RC.text },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, minHeight: 46 },
  btnTxt: { fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30 },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '700', color: RC.text, textAlign: 'center' },
  emptyBody: { marginTop: 6, fontSize: 12, color: RC.sub, textAlign: 'center', lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center' },
  kv: { fontSize: 12, color: RC.sub, marginTop: 2 },
  strong: { fontSize: 14, fontWeight: '700', color: RC.text },
});
