import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Modal, Pressable, ScrollView, Platform, ActivityIndicator,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { getAuthFileUrl } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const FULL_ARCH_TYPES = new Set(['All on 4', 'All on 6', 'All on X']);

type Upload = { filename: string; original_name?: string; content_type?: string };

type CompareNote = {
  tooth_label: string;
  ai_generated?: string;
  ai_generated_at?: string;
  ai_model?: string;
  edited: string;
  edited_at?: string;
  edited_by_id?: string;
  edited_by_role?: string;
  edited_by_name?: string;
  is_ai_only?: boolean;
};

type Props = {
  procedure: any;
  iopaUploads: Record<string, Upload>;
  opgUpload: Upload | null;
};

/**
 * iter-226: Side-by-side baseline vs current radiograph comparison.
 *
 * For `case_origin === 'existing_implants'` the baseline is the Phase 1 intake
 * IOPA (stored on `radiographs.iopas[]` positionally aligned with
 * `existing_implants[]`, or per-implant `existing_implants[i].iopa_url`).
 *
 * For routine cases the baseline is the post-surgical Phase 2 IOPA
 * (`phase2_data.iopa_files[]`, matched by `tooth_label`).
 *
 * Full-arch cases compare OPGs instead of per-tooth IOPAs.
 */
export default function RadiographCompare({ procedure, iopaUploads, opgUpload }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [viewer, setViewer] = useState<{ baseline: string | null; current: string | null; toothKey: string; toothLabel: string } | null>(null);

  const { user } = useAuth();
  const procedureId: string = procedure?._id || procedure?.id || '';

  // ── Edit permission: student creator, supervisor of record, implant in-charge, admin.
  const canEditNotes = useMemo(() => {
    if (!user || !procedure) return false;
    const role = user.role;
    if (role === 'administrator' || role === 'implant_incharge') return true;
    if (role === 'supervisor' && procedure.supervisor_id === user.id) return true;
    if (role === 'student' && procedure.student_id === user.id) return true;
    return false;
  }, [user, procedure]);

  const notesMap: Record<string, CompareNote> = procedure?.radiograph_compare_notes || {};

  const isExisting = procedure?.case_origin === 'existing_implants';
  const effectiveProcType = isExisting && procedure?.original_procedure_type
    ? procedure.original_procedure_type
    : procedure?.implant_procedure_type;
  const isFullArch = FULL_ARCH_TYPES.has(effectiveProcType);

  // Build baseline map: tooth → filename
  const baselineByTooth = useMemo(() => {
    const map: Record<string, string> = {};
    if (isExisting) {
      const implants: any[] = procedure?.existing_implants || [];
      const iopas: (string | null)[] = procedure?.radiographs?.iopas || [];
      implants.forEach((imp, idx) => {
        const tooth = String(imp?.tooth || '');
        if (!tooth) return;
        // Prefer per-implant url, fall back to positional radiograph block.
        const filename = imp?.iopa_url || iopas[idx] || '';
        if (filename) map[tooth] = String(filename);
      });
    } else {
      const files: any[] = procedure?.phase2_data?.iopa_files || [];
      files.forEach(f => {
        const tooth = String(f?.tooth_label || '');
        if (tooth && f?.filename) map[tooth] = String(f.filename);
      });
    }
    return map;
  }, [procedure, isExisting]);

  const baselineOpg: string | null = useMemo(() => {
    if (!isFullArch) return null;
    if (isExisting) return procedure?.radiographs?.opg_url || null;
    return procedure?.phase2_data?.opg_file?.filename || null;
  }, [procedure, isExisting, isFullArch]);

  const teeth: string[] = useMemo(() => {
    if (isFullArch) return [];
    if (isExisting) {
      return (procedure?.existing_implants || [])
        .map((r: any) => String(r.tooth || ''))
        .filter(Boolean);
    }
    return (procedure?.implant_plans || [])
      .map((p: any) => String(p.position || ''))
      .filter(Boolean);
  }, [procedure, isExisting, isFullArch]);

  const baselineLabel = isExisting ? 'Baseline — Phase 1 (intake)' : 'Baseline — Phase 2 (post-surgical)';
  const currentLabel = 'Current — Phase 4 (post-delivery)';

  // Nothing to compare yet — hide entirely.
  const hasAnyBaseline = isFullArch ? !!baselineOpg : Object.keys(baselineByTooth).length > 0;
  if (!hasAnyBaseline) return null;

  return (
    <View style={s.section} testID="phase4-step2-radiograph-compare">
      <TouchableOpacity
        style={s.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
        testID="radiograph-compare-toggle"
      >
        <Ionicons name="git-compare-outline" size={20} color="#1565C0" />
        <Text style={s.title}>Compare with baseline radiograph</Text>
        <View style={s.badge}><Text style={s.badgeText}>{isFullArch ? 'OPG' : `${teeth.length} tooth`}</Text></View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#5A7184" />
      </TouchableOpacity>

      {expanded && (
        <>
          <Text style={s.helper}>
            {isExisting
              ? 'Compare the original intake IOPA with the new post-delivery IOPA per implant.'
              : 'Compare the post-surgical IOPA (Phase 2) with the new post-delivery IOPA per implant.'}
          </Text>

          {isFullArch ? (
            <ComparisonRow
              toothLabel="Full Arch — OPG"
              baseline={baselineOpg}
              current={opgUpload?.filename || null}
              baselineLabel={baselineLabel}
              currentLabel={currentLabel}
              onOpen={(b, c) => setViewer({ baseline: b, current: c, toothKey: 'opg', toothLabel: 'Full Arch — OPG' })}
            />
          ) : (
            teeth.map(tooth => (
              <ComparisonRow
                key={tooth}
                toothLabel={`Tooth ${tooth}`}
                baseline={baselineByTooth[tooth] || null}
                current={iopaUploads[tooth]?.filename || null}
                baselineLabel={baselineLabel}
                currentLabel={currentLabel}
                onOpen={(b, c) => setViewer({ baseline: b, current: c, toothKey: tooth, toothLabel: `Tooth ${tooth}` })}
              />
            ))
          )}
        </>
      )}

      {viewer && (
        <FullScreenCompare
          procedureId={procedureId}
          toothKey={viewer.toothKey}
          baseline={viewer.baseline}
          current={viewer.current}
          toothLabel={viewer.toothLabel}
          baselineLabel={baselineLabel}
          currentLabel={currentLabel}
          existingNote={notesMap[viewer.toothKey]}
          canEdit={canEditNotes}
          onClose={() => setViewer(null)}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single per-tooth row: tooth pill + side-by-side baseline/current thumbs.
// ─────────────────────────────────────────────────────────────────────────
function ComparisonRow({
  toothLabel, baseline, current, baselineLabel, currentLabel, onOpen,
}: {
  toothLabel: string;
  baseline: string | null;
  current: string | null;
  baselineLabel: string;
  currentLabel: string;
  onOpen: (b: string | null, c: string | null) => void;
}) {
  const canOpen = !!(baseline || current);
  return (
    <View style={s.row} testID={`compare-row-${toothLabel}`}>
      <View style={s.toothBadge}><Text style={s.toothBadgeText} numberOfLines={1}>{toothLabel}</Text></View>
      <CompareThumb filename={baseline} caption={baselineLabel} placeholder="No baseline" onPress={canOpen ? () => onOpen(baseline, current) : undefined} testID={`compare-baseline-${toothLabel}`} />
      <Ionicons name="arrow-forward" size={18} color="#90A4AE" style={{ marginHorizontal: 2 }} />
      <CompareThumb filename={current} caption={currentLabel} placeholder="Not uploaded yet" onPress={canOpen ? () => onOpen(baseline, current) : undefined} testID={`compare-current-${toothLabel}`} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Thumbnail with async-resolved auth URL. Falls back to icon for PDFs / null.
// ─────────────────────────────────────────────────────────────────────────
function CompareThumb({
  filename, caption, placeholder, onPress, testID,
}: {
  filename: string | null;
  caption: string;
  placeholder: string;
  onPress?: () => void;
  testID?: string;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!filename) { setUri(null); return; }
    getAuthFileUrl(filename).then(u => { if (!cancelled) setUri(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [filename]);

  const isPdf = !!filename && filename.toLowerCase().endsWith('.pdf');
  const isMissing = !filename;

  const inner = (
    <View style={[s.thumbBox, isMissing && s.thumbMissing]}>
      {isMissing ? (
        <Ionicons name="image-outline" size={28} color="#B0BEC5" />
      ) : isPdf || !uri ? (
        <View style={s.thumbInner}>
          <Ionicons name={isPdf ? 'document-text' : 'image-outline'} size={28} color="#1565C0" />
        </View>
      ) : (
        <Image source={{ uri }} style={s.thumbImg} resizeMode="cover" />
      )}
      <Text style={[s.thumbCaption, isMissing && { color: '#90A4AE' }]} numberOfLines={2}>
        {isMissing ? placeholder : caption}
      </Text>
    </View>
  );

  if (onPress && !isMissing) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1 }} testID={testID}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={{ flex: 1 }} testID={testID}>{inner}</View>;
}

// ─────────────────────────────────────────────────────────────────────────
// Full-screen side-by-side modal with both baseline + current + AI notes.
// ─────────────────────────────────────────────────────────────────────────
function FullScreenCompare({
  procedureId, toothKey, baseline, current, toothLabel,
  baselineLabel, currentLabel, existingNote, canEdit, onClose,
}: {
  procedureId: string;
  toothKey: string;
  baseline: string | null;
  current: string | null;
  toothLabel: string;
  baselineLabel: string;
  currentLabel: string;
  existingNote?: CompareNote;
  canEdit: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle} numberOfLines={1}>{toothLabel}</Text>
          <TouchableOpacity onPress={onClose} style={s.modalClose} testID="radiograph-compare-close">
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.modalScroll}>
          <View style={s.modalPanesWrap}>
            <FullPane filename={baseline} caption={baselineLabel} testID="fullscreen-baseline" />
            <FullPane filename={current} caption={currentLabel} testID="fullscreen-current" />
          </View>

          <AINotesPanel
            procedureId={procedureId}
            toothKey={toothKey}
            toothLabel={toothLabel}
            baselineFilename={baseline}
            currentFilename={current}
            baselineLabel={baselineLabel}
            currentLabel={currentLabel}
            existingNote={existingNote}
            canEdit={canEdit}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AI radiograph notes — generated by GPT-5.2 vision; editable by the
// primary student / supervisor of record / implant in-charge / admin.
// ─────────────────────────────────────────────────────────────────────────
function AINotesPanel({
  procedureId, toothKey, toothLabel, baselineFilename, currentFilename,
  baselineLabel, currentLabel, existingNote, canEdit,
}: {
  procedureId: string;
  toothKey: string;
  toothLabel: string;
  baselineFilename: string | null;
  currentFilename: string | null;
  baselineLabel: string;
  currentLabel: string;
  existingNote?: CompareNote;
  canEdit: boolean;
}) {
  const [note, setNote] = useState<CompareNote | undefined>(existingNote);
  const [draft, setDraft] = useState<string>(existingNote?.edited || '');
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasGeneratable = !!baselineFilename && !!currentFilename;
  const baselineIsPdf = !!baselineFilename && baselineFilename.toLowerCase().endsWith('.pdf');
  const currentIsPdf = !!currentFilename && currentFilename.toLowerCase().endsWith('.pdf');
  const blockedByPdf = baselineIsPdf || currentIsPdf;

  const onGenerate = async () => {
    if (!hasGeneratable) {
      Alert.alert('Both radiographs required', 'Upload the post-delivery IOPA first, then generate AI notes.');
      return;
    }
    if (blockedByPdf) {
      Alert.alert('Image required', 'AI analysis needs a JPG/PNG radiograph. Re-upload the file as an image to use this feature.');
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post(`/procedures/${procedureId}/radiograph-compare/ai-notes`, {
        tooth_label: toothKey,
        baseline_filename: baselineFilename,
        current_filename: currentFilename,
        baseline_phase_label: baselineLabel,
        current_phase_label: currentLabel,
      });
      const fresh: CompareNote = res.data?.note;
      setNote(fresh);
      setDraft(fresh.edited || fresh.ai_generated || '');
      setDirty(false);
    } catch (e: any) {
      Alert.alert('AI generation failed', e?.response?.data?.detail || 'Could not generate AI notes. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const onSave = async () => {
    if (!draft.trim()) {
      Alert.alert('Empty note', 'Cannot save an empty note.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/procedures/${procedureId}/radiograph-compare/notes`, {
        tooth_label: toothKey,
        notes: draft,
      });
      const fresh: CompareNote = res.data?.note;
      setNote(fresh);
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || 'Could not save your edits. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (val: string) => {
    setDraft(val);
    setDirty(val !== (note?.edited || ''));
  };

  const aiSubtitle = note?.ai_generated_at
    ? `AI · ${note.ai_model || 'gpt-5.2'} · ${new Date(note.ai_generated_at).toLocaleString()}`
    : null;
  const editorLine = note?.edited_at && !note?.is_ai_only
    ? `Edited by ${note.edited_by_name || 'user'} (${note.edited_by_role}) · ${new Date(note.edited_at).toLocaleString()}`
    : null;

  return (
    <View style={s.aiPanel} testID="ai-notes-panel">
      <View style={s.aiHeader}>
        <Ionicons name="sparkles" size={18} color="#FFD54F" />
        <Text style={s.aiTitle}>AI Radiograph Notes</Text>
        {note?.ai_generated ? (
          <View style={s.aiChip}><Text style={s.aiChipText}>{note.is_ai_only ? 'AI draft' : 'Edited'}</Text></View>
        ) : null}
      </View>

      <Text style={s.aiDisclaimer}>
        AI compares the two radiographs and drafts clinical observations. This is a clinician aid — not a diagnostic substitute. Please review and edit before sign-off.
      </Text>

      {!note?.ai_generated && !generating && (
        <TouchableOpacity
          style={[s.aiPrimaryBtn, (!hasGeneratable || blockedByPdf) && s.aiBtnDisabled]}
          onPress={onGenerate}
          disabled={!hasGeneratable || blockedByPdf || !canEdit}
          testID="ai-notes-generate-btn"
        >
          <Ionicons name="sparkles" size={16} color="#1A1A1A" />
          <Text style={s.aiPrimaryBtnText}>Generate AI Notes</Text>
        </TouchableOpacity>
      )}

      {generating && (
        <View style={s.aiLoading}>
          <ActivityIndicator color="#FFD54F" />
          <Text style={s.aiLoadingText}>Analysing radiographs… this can take 10–20 seconds.</Text>
        </View>
      )}

      {!hasGeneratable && !note?.ai_generated && (
        <Text style={s.aiHint}>
          {!baselineFilename ? 'No baseline radiograph on file. ' : ''}
          {!currentFilename ? 'Upload the post-delivery radiograph to enable AI analysis.' : ''}
        </Text>
      )}
      {blockedByPdf && (
        <Text style={s.aiHint}>One of the radiographs is a PDF — AI analysis needs an image (JPG / PNG).</Text>
      )}

      {(note?.ai_generated || draft) && (
        <>
          <View style={s.aiEditorWrap}>
            {canEdit ? (
              <TextInput
                value={draft}
                onChangeText={updateDraft}
                multiline
                editable={!saving && !generating}
                placeholder="AI notes will appear here. Edit freely before sign-off."
                placeholderTextColor="#90A4AE"
                style={s.aiEditor}
                testID="ai-notes-editor"
              />
            ) : (
              <Text style={s.aiReadonly} testID="ai-notes-readonly">{draft || '(No notes yet)'}</Text>
            )}
          </View>

          <View style={s.aiActionsRow}>
            {note?.ai_generated && canEdit ? (
              <TouchableOpacity
                style={s.aiSecondaryBtn}
                onPress={onGenerate}
                disabled={generating || saving}
                testID="ai-notes-regenerate-btn"
              >
                <Ionicons name="refresh" size={14} color="#FFD54F" />
                <Text style={s.aiSecondaryBtnText}>Regenerate</Text>
              </TouchableOpacity>
            ) : <View />}

            {canEdit && (
              <TouchableOpacity
                style={[s.aiSaveBtn, (!dirty || saving) && s.aiBtnDisabled]}
                onPress={onSave}
                disabled={!dirty || saving || generating}
                testID="ai-notes-save-btn"
              >
                {saving ? <ActivityIndicator color="#1A1A1A" size="small" /> : <Ionicons name="checkmark" size={16} color="#1A1A1A" />}
                <Text style={s.aiSaveBtnText}>{dirty ? 'Save edits' : 'Saved'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.aiMeta}>
            {aiSubtitle ? <Text style={s.aiMetaLine}>{aiSubtitle}</Text> : null}
            {editorLine ? <Text style={s.aiMetaLine}>{editorLine}</Text> : null}
            {!canEdit && <Text style={s.aiMetaLine}>You have read-only access to these notes.</Text>}
          </View>
        </>
      )}
    </View>
  );
}

function FullPane({ filename, caption, testID }: { filename: string | null; caption: string; testID?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!filename) { setUri(null); return; }
    getAuthFileUrl(filename).then(u => { if (!cancelled) setUri(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [filename]);

  const isPdf = !!filename && filename.toLowerCase().endsWith('.pdf');
  const openExternal = async () => {
    if (!uri) return;
    if (Platform.OS === 'web') window.open(uri, '_blank');
    else {
      try {
        const { Linking } = await import('react-native');
        await Linking.openURL(uri);
      } catch { /* noop */ }
    }
  };

  return (
    <Pressable style={s.pane} onPress={openExternal} testID={testID}>
      <Text style={s.paneCaption} numberOfLines={1}>{caption}</Text>
      <View style={s.paneImgWrap}>
        {!filename ? (
          <View style={s.paneEmpty}>
            <Ionicons name="image-outline" size={48} color="#78909C" />
            <Text style={s.paneEmptyText}>Not available</Text>
          </View>
        ) : isPdf ? (
          <View style={s.paneEmpty}>
            <Ionicons name="document-text" size={48} color="#FFF" />
            <Text style={[s.paneEmptyText, { color: '#FFF' }]}>Tap to open PDF</Text>
          </View>
        ) : uri ? (
          <Image source={{ uri }} style={s.paneImg} resizeMode="contain" />
        ) : (
          <ActivityIndicator color="#FFF" />
        )}
      </View>
      {filename ? <Text style={s.paneHint}>Tap to open full image</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  section: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, marginBottom: 0, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#BBDEFB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0D47A1' },
  badge: { backgroundColor: '#E3F2FD', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#90CAF9' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#0D47A1', letterSpacing: 0.2 },
  helper: { fontSize: 12, color: '#5A7184', marginTop: 8, marginBottom: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  toothBadge: { backgroundColor: '#0D47A1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, minWidth: 56, alignItems: 'center' },
  toothBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  thumbBox: { flex: 1, borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, padding: 6, backgroundColor: '#F5F7FA', alignItems: 'center', gap: 4, minHeight: 96 },
  thumbMissing: { borderStyle: 'dashed', backgroundColor: '#FAFAFA' },
  thumbInner: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: '#000' },
  thumbCaption: { fontSize: 10, color: '#37474F', fontWeight: '600', textAlign: 'center' },
  // Full-screen modal
  modalRoot: { flex: 1, backgroundColor: '#0A0F14' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 56 : 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#1B2733' },
  modalTitle: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalClose: { padding: 6 },
  modalScroll: { padding: 16, paddingBottom: 32 },
  modalPanesWrap: { flexDirection: 'row', gap: 12 },
  pane: { flex: 1, backgroundColor: '#1B2733', borderRadius: 12, padding: 10, gap: 8 },
  paneCaption: { color: '#90CAF9', fontSize: 12, fontWeight: '700' },
  paneImgWrap: { width: '100%', aspectRatio: 0.75, backgroundColor: '#000', borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  paneImg: { width: '100%', height: '100%' },
  paneEmpty: { alignItems: 'center', gap: 8 },
  paneEmptyText: { color: '#90A4AE', fontSize: 12, fontWeight: '600' },
  paneHint: { color: '#78909C', fontSize: 10, textAlign: 'center', fontStyle: 'italic' },
  // AI notes panel (in full-screen modal)
  aiPanel: { marginTop: 16, backgroundColor: '#11202E', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1F3346', gap: 10 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiTitle: { flex: 1, color: '#FFD54F', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  aiChip: { backgroundColor: '#1F3346', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  aiChipText: { color: '#FFD54F', fontSize: 10, fontWeight: '700' },
  aiDisclaimer: { color: '#90A4AE', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  aiPrimaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFD54F', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  aiPrimaryBtnText: { color: '#1A1A1A', fontSize: 13, fontWeight: '800' },
  aiBtnDisabled: { opacity: 0.5 },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#1F3346', borderRadius: 8 },
  aiLoadingText: { color: '#90CAF9', fontSize: 12, flex: 1 },
  aiHint: { color: '#FFB74D', fontSize: 11, fontStyle: 'italic' },
  aiEditorWrap: { backgroundColor: '#0A1620', borderRadius: 8, borderWidth: 1, borderColor: '#1F3346', minHeight: 140 },
  aiEditor: { color: '#ECEFF1', fontSize: 13, lineHeight: 19, padding: 10, minHeight: 140, textAlignVertical: 'top' },
  aiReadonly: { color: '#CFD8DC', fontSize: 13, lineHeight: 19, padding: 10 },
  aiActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiSecondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FFD54F' },
  aiSecondaryBtnText: { color: '#FFD54F', fontSize: 12, fontWeight: '700' },
  aiSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FFD54F' },
  aiSaveBtnText: { color: '#1A1A1A', fontSize: 12, fontWeight: '800' },
  aiMeta: { gap: 2 },
  aiMetaLine: { color: '#78909C', fontSize: 10, fontStyle: 'italic' },
});
