import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Modal, Pressable, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuthFileUrl } from '../utils/api';

const FULL_ARCH_TYPES = new Set(['All on 4', 'All on 6', 'All on X']);

type Upload = { filename: string; original_name?: string; content_type?: string };

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
  const [viewer, setViewer] = useState<{ baseline: string | null; current: string | null; toothLabel: string } | null>(null);

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
              onOpen={(b, c) => setViewer({ baseline: b, current: c, toothLabel: 'Full Arch — OPG' })}
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
                onOpen={(b, c) => setViewer({ baseline: b, current: c, toothLabel: `Tooth ${tooth}` })}
              />
            ))
          )}
        </>
      )}

      {viewer && (
        <FullScreenCompare
          baseline={viewer.baseline}
          current={viewer.current}
          toothLabel={viewer.toothLabel}
          baselineLabel={baselineLabel}
          currentLabel={currentLabel}
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
// Full-screen side-by-side modal with both baseline + current.
// ─────────────────────────────────────────────────────────────────────────
function FullScreenCompare({
  baseline, current, toothLabel, baselineLabel, currentLabel, onClose,
}: {
  baseline: string | null;
  current: string | null;
  toothLabel: string;
  baselineLabel: string;
  currentLabel: string;
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
        </ScrollView>
      </View>
    </Modal>
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
});
