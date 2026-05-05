import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import api from '../../utils/api';
import BackButton from '../../components/BackButton';
import { showUploadPicker } from '../../utils/uploadPicker';

/**
 * iter-148 / iter-165: Catalog editor.
 * - In-Charge / Administrator add or edit a system.
 * - Pass `?key=Brand|Name` to edit; omit `key` to create new.
 * - Each section is view-by-default with a pencil to enter edit mode and a
 *   "Done" button that PUTs the current state. (iter-165, Option A.)
 * - System-level Delete (red trash) in the header for existing records.
 * - Attachments section uploads PDFs / images via Emergent object storage.
 *
 * All persistence routes through PUT /api/implant-catalog/by-key.
 */

type Component = {
  type: string; subtype?: string;
  gingival_heights_mm?: string;
  angulations_deg?: string;
  retention?: string;
  material?: string;
  indication?: string;
  notes?: string;
  __original?: Record<string, any>;
};

type Attachment = {
  id: string;
  original_filename: string;
  content_type: string;
  size: number;
  uploaded_by?: string;
  uploaded_at?: string;
};

const COMPONENT_TYPES = [
  'cover_screw', 'healing_abutment', 'final_abutment', 'multi_unit_abutment',
  'ti_base', 'scanbody', 'overdenture', 'impression_coping', 'analog',
];

const parseCSVNum = (s: string | undefined): number[] | undefined => {
  if (!s || !s.trim()) return undefined;
  const arr = s.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
  return arr.length ? arr : undefined;
};
const parseCSVStr = (s: string | undefined): string[] | undefined => {
  if (!s || !s.trim()) return undefined;
  const arr = s.split(',').map(v => v.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CatalogEditor() {
  const { key: editKey } = useLocalSearchParams<{ key?: string }>();
  const isEdit = !!editKey;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deletingSystem, setDeletingSystem] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [connType, setConnType] = useState('');
  const [connSubtype, setConnSubtype] = useState('');
  const [connIndexing, setConnIndexing] = useState('');
  const [platformSwitching, setPlatformSwitching] = useState(false);
  const [features, setFeatures] = useState('');
  const [diameters, setDiameters] = useState('');
  const [lengths, setLengths] = useState('');
  const [boneTypes, setBoneTypes] = useState('');
  const [healingModes, setHealingModes] = useState('');
  const [components, setComponents] = useState<Component[]>([]);
  const [compatibilityNotes, setCompatibilityNotes] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // iter-165: per-section edit-mode toggles (Option A)
  // For "create new" (no editKey), all sections start in edit mode.
  const initialMode = !isEdit;
  const [mIdentity, setMIdentity] = useState(initialMode);
  const [mConnection, setMConnection] = useState(initialMode);
  const [mFeatures, setMFeatures] = useState(initialMode);
  const [mSpecs, setMSpecs] = useState(initialMode);
  const [mComponents, setMComponents] = useState(initialMode);
  const [mNotes, setMNotes] = useState(initialMode);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await api.get('/implant-catalog/by-key', { params: { key: editKey } });
        const d = res.data;
        setBrand(d.brand || ''); setName(d.name || '');
        setConnType(d.connection?.type || ''); setConnSubtype(d.connection?.subtype || '');
        setConnIndexing((d.connection?.indexing || []).join(', '));
        setPlatformSwitching(!!d.platform_switching);
        setFeatures((d.features || []).join('\n'));
        setDiameters((d.implant?.diameters_mm || []).join(', '));
        setLengths((d.implant?.lengths_mm || []).join(', '));
        setBoneTypes((d.implant?.bone_types || []).join(', '));
        setHealingModes((d.implant?.healing_modes || []).join(', '));
        setComponents((d.components || []).map((c: any) => ({
          type: c.type, subtype: c.subtype || '',
          gingival_heights_mm: (c.gingival_heights_mm || []).join(', '),
          angulations_deg: (c.angulations_deg || []).join(', '),
          retention: (c.retention || []).join(', '),
          material: (c.material || []).join(', '),
          indication: c.indication || '', notes: c.notes || '',
          __original: c,
        })));
        setCompatibilityNotes(d.compatibility_notes || '');
        setAttachments(d.attachments || []);
      } catch (e: any) {
        Alert.alert('Failed to load', e?.response?.data?.detail || String(e?.message || e));
      } finally { setLoading(false); }
    })();
  }, [editKey, isEdit]);

  // iter-168: per-component edit state. Each component inside the Components
  // section is independently editable — pencil opens the card, "Done" closes
  // and silent-saves. Multiple cards can be open at once.
  const [editingCompIdx, setEditingCompIdx] = useState<Set<number>>(new Set());
  const toggleCompEdit = useCallback((idx: number, on: boolean) => {
    setEditingCompIdx(prev => {
      const next = new Set(prev);
      if (on) next.add(idx); else next.delete(idx);
      return next;
    });
  }, []);

  const updateComponent = (idx: number, patch: Partial<Component>) => {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };
  const addComponent = () => {
    setComponents(prev => {
      const newIdx = prev.length;
      // Open the new component in edit mode immediately.
      setEditingCompIdx(s => { const n = new Set(s); n.add(newIdx); return n; });
      return [...prev, { type: 'healing_abutment' }];
    });
  };
  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx));
    setEditingCompIdx(prev => {
      const next = new Set<number>();
      // Re-key indices: every editing index > idx shifts down by 1.
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  const buildBody = useCallback(() => {
    return {
      brand: brand.trim(), name: name.trim(),
      connection: connType.trim() || connSubtype.trim() || connIndexing.trim() ? {
        type: connType.trim() || undefined,
        subtype: connSubtype.trim() || undefined,
        indexing: parseCSVStr(connIndexing) || [],
      } : null,
      platform_switching: platformSwitching,
      features: features.split('\n').map(f => f.trim()).filter(Boolean),
      implant: {
        diameters_mm: parseCSVNum(diameters) || [],
        lengths_mm: parseCSVNum(lengths) || [],
        bone_types: parseCSVStr(boneTypes) || [],
        healing_modes: parseCSVStr(healingModes) || [],
      },
      components: components.map(c => {
        const base = { ...(c.__original || {}) };
        base.type = c.type;
        if (c.subtype !== undefined) base.subtype = c.subtype || undefined;
        const gh = parseCSVNum(c.gingival_heights_mm);
        if (gh !== undefined) base.gingival_heights_mm = gh;
        else if (c.gingival_heights_mm === '') delete base.gingival_heights_mm;
        const ang = parseCSVNum(c.angulations_deg);
        if (ang !== undefined) base.angulations_deg = ang;
        else if (c.angulations_deg === '') delete base.angulations_deg;
        const ret = parseCSVStr(c.retention);
        if (ret !== undefined) base.retention = ret;
        else if (c.retention === '') delete base.retention;
        const mat = parseCSVStr(c.material);
        if (mat !== undefined) base.material = mat;
        else if (c.material === '') delete base.material;
        if (c.indication !== undefined) base.indication = c.indication || undefined;
        if (c.notes !== undefined) base.notes = c.notes || undefined;
        return base;
      }),
      compatibility_notes: compatibilityNotes.trim(),
    };
  }, [brand, name, connType, connSubtype, connIndexing, platformSwitching, features,
      diameters, lengths, boneTypes, healingModes, components, compatibilityNotes]);

  // Persist & navigate. Used on initial create, and on per-section "Done" in edit mode.
  const persist = useCallback(async (opts: { silent?: boolean; navigateBack?: boolean }) => {
    if (!brand.trim() || !name.trim()) {
      Alert.alert('Missing info', 'Brand and System Name are required.');
      return false;
    }
    const key = `${brand.trim()}|${name.trim()}`;
    setSaving(true);
    try {
      await api.put('/implant-catalog/by-key', buildBody(), { params: { key } });
      if (!opts.silent) {
        Alert.alert('Saved', `${brand} ${name} has been ${isEdit ? 'updated' : 'created'}.`);
      }
      if (opts.navigateBack) {
        router.replace({
          pathname: '/admin/implant-catalog',
          params: { refresh: String(Date.now()), focusKey: key },
        });
      }
      return true;
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || String(e?.message || e));
      return false;
    } finally { setSaving(false); }
  }, [brand, name, buildBody, isEdit]);

  const onSectionDone = useCallback((closeSection: () => void) => async () => {
    const ok = await persist({ silent: true, navigateBack: false });
    if (ok) closeSection();
  }, [persist]);

  const onCreate = useCallback(async () => {
    await persist({ silent: false, navigateBack: true });
  }, [persist]);

  const deleteSystem = useCallback(() => {
    if (!editKey) return;
    Alert.alert(
      `Delete '${name}'?`,
      `This permanently removes the entire system from ${brand}. Components, features, attachments and compatibility notes will be lost. This is logged in the audit trail.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setDeletingSystem(true);
            try {
              await api.delete('/implant-catalog/by-key', { params: { key: editKey } });
              Alert.alert('Deleted', `${brand} ${name} has been removed.`);
              router.replace({ pathname: '/admin/implant-catalog', params: { refresh: String(Date.now()) } });
            } catch (e: any) {
              Alert.alert('Delete failed', e?.response?.data?.detail || String(e?.message || e));
            } finally { setDeletingSystem(false); }
          },
        },
      ],
    );
  }, [editKey, brand, name]);

  const pickAndUploadAttachment = useCallback(async () => {
    if (!editKey) {
      Alert.alert('Save first', 'Save the new system before adding attachments.');
      return;
    }
    setUploadingAttachment(true);
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/*']);
      if (!picked) { setUploadingAttachment(false); return; }
      const form = new FormData();
      // RN FormData: { uri, name, type }
      // @ts-ignore
      form.append('file', { uri: picked.uri, name: picked.name || 'file', type: picked.type || 'application/octet-stream' });
      const res = await api.post(
        '/implant-catalog/by-key/attachments',
        form,
        { params: { key: editKey }, headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setAttachments(prev => [...prev, res.data]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || String(e?.message || e));
    } finally { setUploadingAttachment(false); }
  }, [editKey]);

  const removeAttachment = useCallback((att: Attachment) => {
    if (!editKey) return;
    Alert.alert(
      'Remove attachment?',
      att.original_filename,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            try {
              await api.delete(`/implant-catalog/by-key/attachments/${att.id}`, { params: { key: editKey } });
              setAttachments(prev => prev.filter(a => a.id !== att.id));
            } catch (e: any) {
              Alert.alert('Remove failed', e?.response?.data?.detail || String(e?.message || e));
            }
          },
        },
      ],
    );
  }, [editKey]);

  const featuresArr = useMemo(() => features.split('\n').map(f => f.trim()).filter(Boolean), [features]);

  if (loading) {
    return <SafeAreaView style={s.container}><View style={s.center}><ActivityIndicator size="large" color="#0277BD" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{isEdit ? 'Edit System' : 'Add Implant System'}</Text>
          {isEdit && <Text style={s.headerSub}>{editKey}</Text>}
        </View>
        {isEdit ? (
          <TouchableOpacity
            style={[s.deleteBtn, deletingSystem && { opacity: 0.5 }]}
            onPress={deleteSystem} disabled={deletingSystem}
            testID="catalog-delete-system"
            data-testid="catalog-delete-system"
          >
            {deletingSystem
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><Ionicons name="trash" size={16} color="#FFF" /><Text style={s.deleteBtnText}>Delete</Text></>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={onCreate} disabled={saving}
            testID="catalog-save"
            data-testid="catalog-save"
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><Ionicons name="checkmark" size={16} color="#FFF" /><Text style={s.saveBtnText}>Create</Text></>}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <EditableSection
          title="Identity" mode={mIdentity} onPencil={() => setMIdentity(true)}
          onDone={onSectionDone(() => setMIdentity(false))} saving={saving} canEditWhenSaved={!isEdit}
          summary={<View>
            <Summary k="Brand" v={brand || '—'} />
            <Summary k="System Name" v={name || '—'} />
          </View>}
        >
          <Field label="Brand *" v={brand} setV={setBrand} testID="cat-brand" placeholder="e.g. Dentsply Sirona" disabled={isEdit} />
          <Field label="System Name *" v={name} setV={setName} testID="cat-name" placeholder="e.g. Ankylos C/X" disabled={isEdit} />
          {isEdit && <Text style={s.hint}>Brand + System Name cannot be changed (they form the key). To rename, delete and recreate.</Text>}
        </EditableSection>

        <EditableSection
          title="Connection" mode={mConnection} onPencil={() => setMConnection(true)}
          onDone={onSectionDone(() => setMConnection(false))} saving={saving}
          summary={<View>
            <Summary k="Type" v={connType || '—'} />
            <Summary k="Subtype" v={connSubtype || '—'} />
            <Summary k="Indexing" v={connIndexing || '—'} />
            <Summary k="Platform Switching" v={platformSwitching ? 'Yes' : 'No'} />
          </View>}
        >
          <Field label="Type" v={connType} setV={setConnType} testID="cat-conn-type" placeholder="conical / internal_hex / external_hex" />
          <Field label="Subtype" v={connSubtype} setV={setConnSubtype} testID="cat-conn-subtype" placeholder="morse_taper, 6-cam, etc." />
          <Field label="Indexing (CSV)" v={connIndexing} setV={setConnIndexing} testID="cat-conn-indexing" placeholder="indexed, non_indexed" />
          <View style={s.switchRow}>
            <Text style={s.label}>Platform Switching</Text>
            <Switch value={platformSwitching} onValueChange={setPlatformSwitching} testID="cat-platform-switching" />
          </View>
        </EditableSection>

        <EditableSection
          title="Features" mode={mFeatures} onPencil={() => setMFeatures(true)}
          onDone={onSectionDone(() => setMFeatures(false))} saving={saving}
          summary={featuresArr.length === 0
            ? <Text style={s.placeholder}>No features yet. Tap pencil to add.</Text>
            : <View>{featuresArr.map((f, i) => <Text key={i} style={s.bullet}>• {f}</Text>)}</View>}
        >
          <Text style={s.label}>One feature per line</Text>
          <TextInput
            style={[s.input, { minHeight: 100 }]}
            value={features} onChangeText={setFeatures} multiline
            placeholder="Friction-lock Morse taper&#10;Platform switching&#10;..."
            placeholderTextColor="#aaa"
            testID="cat-features"
          />
        </EditableSection>

        <EditableSection
          title="Implant Specs" mode={mSpecs} onPencil={() => setMSpecs(true)}
          onDone={onSectionDone(() => setMSpecs(false))} saving={saving}
          summary={<View>
            <Summary k="Diameters mm" v={diameters || '—'} />
            <Summary k="Lengths mm" v={lengths || '—'} />
            <Summary k="Bone Types" v={boneTypes || '—'} />
            <Summary k="Healing Modes" v={healingModes || '—'} />
          </View>}
        >
          <Field label="Diameters mm (CSV)" v={diameters} setV={setDiameters} testID="cat-diam" placeholder="3.5, 4.5, 5.5" />
          <Field label="Lengths mm (CSV)" v={lengths} setV={setLengths} testID="cat-len" placeholder="8, 10, 12, 14" />
          <Field label="Bone Types (CSV)" v={boneTypes} setV={setBoneTypes} testID="cat-bone" placeholder="D1, D2, D3, D4" />
          <Field label="Healing Modes (CSV)" v={healingModes} setV={setHealingModes} testID="cat-healing" placeholder="submerged, transgingival" />
        </EditableSection>

        <EditableSection
          title={`Components (${components.length})`} mode={mComponents}
          onPencil={() => setMComponents(true)}
          onDone={onSectionDone(() => setMComponents(false))} saving={saving}
          summary={components.length === 0
            ? <Text style={s.placeholder}>No components yet. Tap pencil to add.</Text>
            : <View>{components.slice(0, 6).map((c, i) =>
                <Text key={i} style={s.bullet}>• {(c.subtype || c.type || 'component').replace(/_/g, ' ')}</Text>
              )}{components.length > 6 && <Text style={s.placeholder}>… and {components.length - 6} more</Text>}</View>}
        >
          {components.map((c, i) => {
            const editing = editingCompIdx.has(i);
            const compName = (c.subtype || c.type || 'component').toString().replace(/_/g, ' ');
            const ghSummary = c.gingival_heights_mm
              ? `Cuff (GH): ${c.gingival_heights_mm} mm`
              : null;
            return (
              <View key={i} style={s.compEditor}>
                <View style={s.compHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.compHeaderText}>{compName}</Text>
                    {!editing && ghSummary && (
                      <Text style={s.compSummarySub}>{ghSummary}</Text>
                    )}
                  </View>
                  {editing ? (
                    <TouchableOpacity
                      style={[s.compDoneBtn, saving && { opacity: 0.5 }]}
                      onPress={async () => {
                        const ok = await persist({ silent: true, navigateBack: false });
                        if (ok) toggleCompEdit(i, false);
                      }}
                      disabled={saving}
                      testID={`cat-comp-done-${i}`}
                      data-testid={`cat-comp-done-${i}`}
                    >
                      {saving
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <><Ionicons name="checkmark" size={14} color="#FFF" /><Text style={s.compDoneBtnText}>Done</Text></>}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => toggleCompEdit(i, true)}
                      style={s.compIconBtn}
                      testID={`cat-comp-edit-${i}`}
                      data-testid={`cat-comp-edit-${i}`}
                    >
                      <Ionicons name="pencil" size={16} color="#0277BD" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => removeComponent(i)}
                    style={s.compIconBtn}
                    testID={`cat-comp-remove-${i}`} data-testid={`cat-comp-remove-${i}`}
                  >
                    <Ionicons name="trash" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
                {editing && (
                  <>
                    <Text style={s.label}>Type</Text>
                    <View style={s.typeRow}>
                      {COMPONENT_TYPES.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[s.typeChip, c.type === t && s.typeChipActive]}
                          onPress={() => updateComponent(i, { type: t })}
                        >
                          <Text style={[s.typeChipText, c.type === t && s.typeChipTextActive]}>
                            {t.replace(/_/g, ' ')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Field label="Subtype" v={c.subtype || ''} setV={(v) => updateComponent(i, { subtype: v })} placeholder="optional" />
                    <Field label="Cuff height / GH (mm) — CSV" v={c.gingival_heights_mm || ''} setV={(v) => updateComponent(i, { gingival_heights_mm: v })} placeholder="0.75, 1.5, 3, 4.5 (gingival collar / GH only — NOT total component height)" />
                    <Field label="Angulations ° (CSV)" v={c.angulations_deg || ''} setV={(v) => updateComponent(i, { angulations_deg: v })} placeholder="0, 7.5, 15, 30" />
                    <Field label="Retention (CSV)" v={c.retention || ''} setV={(v) => updateComponent(i, { retention: v })} placeholder="cement, occlusal_screw, lateral_screw" />
                    <Field label="Material (CSV)" v={c.material || ''} setV={(v) => updateComponent(i, { material: v })} placeholder="titanium, zirconia" />
                    <Field label="Indication" v={c.indication || ''} setV={(v) => updateComponent(i, { indication: v })} placeholder="Single + bridge, anterior" />
                    <Field label="Notes" v={c.notes || ''} setV={(v) => updateComponent(i, { notes: v })} placeholder="optional clinical notes" />
                  </>
                )}
              </View>
            );
          })}
          <TouchableOpacity style={s.addBtn} onPress={addComponent} testID="cat-add-component" data-testid="cat-add-component">
            <Ionicons name="add-circle" size={18} color="#0277BD" />
            <Text style={s.addBtnText}>Add component</Text>
          </TouchableOpacity>
        </EditableSection>

        <EditableSection
          title="Compatibility Notes" mode={mNotes} onPencil={() => setMNotes(true)}
          onDone={onSectionDone(() => setMNotes(false))} saving={saving}
          summary={compatibilityNotes ? <Text style={s.bodyText}>{compatibilityNotes}</Text>
            : <Text style={s.placeholder}>No compatibility notes yet. Tap pencil to add.</Text>}
        >
          <TextInput
            style={[s.input, { minHeight: 80 }]}
            value={compatibilityNotes} onChangeText={setCompatibilityNotes} multiline
            placeholder="Cross-compatibility, platform-switch rules, etc."
            placeholderTextColor="#aaa"
            testID="cat-compatibility"
          />
        </EditableSection>

        {/* Attachments — always visible (read + upload). Available only after the
            system has a key; for new records, ask the user to save first. */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Attachments ({attachments.length})</Text>
            <TouchableOpacity
              style={[s.attachBtn, (uploadingAttachment || !isEdit) && { opacity: 0.5 }]}
              onPress={pickAndUploadAttachment}
              disabled={uploadingAttachment || !isEdit}
              testID="cat-attach-paperclip"
              data-testid="cat-attach-paperclip"
            >
              {uploadingAttachment
                ? <ActivityIndicator size="small" color="#0277BD" />
                : <Ionicons name="attach" size={18} color="#0277BD" />}
              <Text style={s.attachBtnText}>Attach</Text>
            </TouchableOpacity>
          </View>
          {!isEdit && (
            <Text style={s.hint}>Save the system first to enable attachments (PDF brochures, lab manuals, images).</Text>
          )}
          {isEdit && attachments.length === 0 && (
            <Text style={s.placeholder}>No attachments yet. Tap the paperclip to add a PDF or image.</Text>
          )}
          {attachments.map((att) => (
            <View key={att.id} style={s.attachRow}>
              <Ionicons
                name={att.content_type === 'application/pdf' ? 'document' : 'image'}
                size={20} color="#0277BD" style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.attachName} numberOfLines={1}>{att.original_filename}</Text>
                <Text style={s.attachMeta}>{formatBytes(att.size)} • {att.uploaded_by || 'unknown'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeAttachment(att)}
                testID={`cat-attach-remove-${att.id}`}
                data-testid={`cat-attach-remove-${att.id}`}
              >
                <Ionicons name="trash-outline" size={18} color="#D32F2F" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Summary: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <View style={s.summaryRow}>
    <Text style={s.summaryKey}>{k}</Text>
    <Text style={s.summaryVal} numberOfLines={3}>{v}</Text>
  </View>
);

const EditableSection: React.FC<{
  title: string;
  mode: boolean;
  onPencil: () => void;
  onDone: () => void;
  saving: boolean;
  canEditWhenSaved?: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, mode, onPencil, onDone, saving, canEditWhenSaved, summary, children }) => {
  // canEditWhenSaved=false means the section can never re-enter edit mode after the
  // initial create (e.g. Identity, since brand/name form the key).
  const lockOnEdit = canEditWhenSaved === false;
  return (
    <View style={s.section}>
      <View style={s.sectionHeaderRow}>
        <Text style={s.sectionTitle}>{title}</Text>
        {mode ? (
          <TouchableOpacity
            style={[s.doneBtn, saving && { opacity: 0.5 }]}
            onPress={onDone} disabled={saving}
            testID={`section-done-${title.toLowerCase().replace(/[^a-z]/g, '-')}`}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" />
              : <><Ionicons name="checkmark" size={14} color="#FFF" /><Text style={s.doneBtnText}>Done</Text></>}
          </TouchableOpacity>
        ) : (
          !lockOnEdit && (
            <TouchableOpacity
              style={s.iconBtn} onPress={onPencil}
              testID={`section-edit-${title.toLowerCase().replace(/[^a-z]/g, '-')}`}
            >
              <Ionicons name="pencil" size={16} color="#0277BD" />
            </TouchableOpacity>
          )
        )}
      </View>
      {mode ? children : summary}
    </View>
  );
};

const Field: React.FC<{ label: string; v: string; setV: (s: string) => void; placeholder?: string; testID?: string; disabled?: boolean }> =
({ label, v, setV, placeholder, testID, disabled }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      style={[s.input, disabled && { opacity: 0.6, backgroundColor: '#F0F4F8' }]}
      value={v} onChangeText={setV} editable={!disabled}
      placeholder={placeholder} placeholderTextColor="#aaa"
      testID={testID}
    />
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#01579B' },
  headerSub: { fontSize: 11, color: '#607D8B', marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0277BD', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  saveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D32F2F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  deleteBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  section: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#ECEFF1', padding: 14, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#01579B', letterSpacing: 0.3 },
  iconBtn: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E1F5FE' },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#43A047', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  doneBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  label: { fontSize: 12, color: '#607D8B', fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: '#FAFCFE', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#263238' },
  hint: { fontSize: 11, color: '#90A4AE', fontStyle: 'italic', marginTop: 4 },
  placeholder: { fontSize: 12, color: '#90A4AE', fontStyle: 'italic' },
  bodyText: { fontSize: 13, color: '#263238', lineHeight: 19 },
  bullet: { fontSize: 13, color: '#37474F', lineHeight: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  summaryRow: { flexDirection: 'row', paddingVertical: 4 },
  summaryKey: { width: 130, fontSize: 12, color: '#607D8B', fontWeight: '600' },
  summaryVal: { flex: 1, fontSize: 13, color: '#263238' },
  compEditor: { backgroundColor: '#F5FBFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 },
  compHeaderText: { fontSize: 13, fontWeight: '700', color: '#01579B', textTransform: 'capitalize' },
  compSummarySub: { fontSize: 12, color: '#455A64', marginTop: 2 },
  compIconBtn: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  compDoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#43A047', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  compDoneBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#B3E5FC', backgroundColor: '#FFF' },
  typeChipActive: { backgroundColor: '#0277BD', borderColor: '#0277BD' },
  typeChipText: { fontSize: 11, color: '#0277BD', fontWeight: '600' },
  typeChipTextActive: { color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0277BD', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  addBtnText: { fontSize: 13, color: '#0277BD', fontWeight: '700' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#0277BD', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  attachBtnText: { fontSize: 12, color: '#0277BD', fontWeight: '700' },
  attachRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5FBFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
  attachName: { fontSize: 13, color: '#01579B', fontWeight: '600' },
  attachMeta: { fontSize: 11, color: '#607D8B', marginTop: 2 },
});
