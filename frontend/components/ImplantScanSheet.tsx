/**
 * ImplantScanSheet — Phase 2 "Scan box" bottom sheet.
 *
 * Reads the GS1 DataMatrix printed on a dental-implant box (expo-camera,
 * native only), parses GTIN / Lot / Serial / Expiry, resolves the GTIN to an
 * implant model through the institution's learning map (GET /api/gtin/{gtin};
 * unknown GTINs ask the user to pick brand/system once and POST /api/gtin),
 * and lets the user attach a photo of the label as evidence. Every field can
 * be edited manually — the "Enter manually" path is the fallback for damaged
 * codes and is also the only path available on web.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
  Platform, ActivityIndicator, Alert, Linking, Image,
} from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import api, { getAuthFileUrl } from '../utils/api';
import { parseGs1, isValidGtin } from '../utils/gs1';
import { safeLaunchCamera, safeLaunchLibrary } from '../utils/safePicker';

// expo-camera throws at import time when the installed binary predates it
// (OTA update on an older build), which would crash the whole Phase 2 screen.
// Load it only when the native module is actually present.
const isNative = Platform.OS !== 'web';
const hasCameraModule = isNative && !!requireOptionalNativeModule('ExpoCamera');
const ExpoCamera: typeof import('expo-camera') | null = hasCameraModule ? require('expo-camera') : null;
const CameraView = ExpoCamera?.CameraView;
// Module-level constant → the same hook is called on every render.
const useCameraPermissions = ExpoCamera
  ? ExpoCamera.useCameraPermissions
  : () => [null, async () => ({ granted: false, canAskAgain: false } as any)] as const;

export type ImplantTraceability = {
  gtin?: string;
  lot?: string;
  serial?: string;
  expiry?: string;
  mfg_date?: string;
  raw?: string;
  model_brand?: string;
  model_system?: string;
  model_label?: string;
  label_photo?: string;            // uploaded filename (uploads/)
  label_photo_name?: string;
  source: 'scan' | 'manual';
  scanned_at?: string;
};

type CatalogSystem = { key: string; brand: string; name: string; system?: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  positionLabel: string;
  initial?: ImplantTraceability | null;
  /** Brand / system from the implant plan — offered as the default model. */
  suggestedBrand?: string;
  suggestedSystem?: string;
  onSave: (t: ImplantTraceability) => void;
};

const EMPTY: ImplantTraceability = { source: 'manual' };

export default function ImplantScanSheet({ visible, onClose, positionLabel, initial, suggestedBrand, suggestedSystem, onSave }: Props) {
  const [mode, setMode] = useState<'scan' | 'form'>('form');
  const [permission, requestPermission] = useCameraPermissions();
  const [data, setData] = useState<ImplantTraceability>(initial || EMPTY);
  const [catalog, setCatalog] = useState<CatalogSystem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [gtinKnown, setGtinKnown] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scanLocked, setScanLocked] = useState(false);
  const [rawText, setRawText] = useState('');
  const [gtinWarn, setGtinWarn] = useState(false);
  const [emptyWarn, setEmptyWarn] = useState(false);

  const canUseCamera = hasCameraModule;

  useEffect(() => {
    if (!visible) return;
    setData(initial || EMPTY);
    setGtinKnown(null);
    setGtinWarn(false);
    setRawText('');
    setScanLocked(false);
    setMode(canUseCamera && !initial?.gtin ? 'scan' : 'form');
    api.get('/implant-catalog').then(r => setCatalog(r.data?.systems || [])).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (data.label_photo) getAuthFileUrl(data.label_photo).then(setPhotoUrl).catch(() => setPhotoUrl(null));
    else setPhotoUrl(null);
  }, [data.label_photo]);

  const update = (patch: Partial<ImplantTraceability>) => setData(prev => ({ ...prev, ...patch }));

  /** Resolve GTIN → model via the learning map. */
  const lookupGtin = async (gtin: string) => {
    if (!gtin) return;
    setLookingUp(true);
    try {
      const r = await api.get(`/gtin/${encodeURIComponent(gtin)}`);
      if (r.data?.found) {
        setGtinKnown(true);
        update({ model_brand: r.data.brand, model_system: r.data.system, model_label: r.data.label });
      } else {
        setGtinKnown(false);
        if (suggestedBrand && !data.model_brand) update({ model_brand: suggestedBrand, model_system: suggestedSystem, model_label: [suggestedBrand, suggestedSystem].filter(Boolean).join(' ') });
      }
    } catch {
      setGtinKnown(false);
    } finally {
      setLookingUp(false);
    }
  };

  const applyRaw = (raw: string, source: 'scan' | 'manual') => {
    const p = parseGs1(raw);
    const next: ImplantTraceability = {
      ...data,
      raw,
      gtin: p.gtin || data.gtin,
      lot: p.lot || data.lot,
      serial: p.serial || data.serial,
      expiry: p.expiry || data.expiry,
      mfg_date: p.mfg_date || data.mfg_date,
      source,
      scanned_at: new Date().toISOString(),
    };
    setData(next);
    setMode('form');
    if (p.gtin) lookupGtin(p.gtin);
    if (!p.is_gs1) Alert.alert('Code read', 'This code is not in GS1 format. The raw value was kept — please fill in the fields manually.');
  };

  const onBarcode = ({ data: raw }: { data: string }) => {
    if (scanLocked || !raw) return;
    setScanLocked(true);
    applyRaw(raw, 'scan');
  };

  const ensurePermission = async () => {
    if (permission?.granted) return true;
    if (permission && !permission.canAskAgain) {
      Alert.alert('Camera blocked', 'Camera access was denied earlier. Enable it in Settings to scan implant boxes, or enter the details manually.', [
        { text: 'Enter manually', onPress: () => setMode('form') },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    const res = await requestPermission();
    if (!res.granted) setMode('form');
    return res.granted;
  };

  useEffect(() => {
    if (visible && mode === 'scan' && canUseCamera && !permission?.granted) ensurePermission();
  }, [visible, mode]);

  const uploadLabelPhoto = async (picked: { uri: string; name: string; type: string }) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri: picked.uri, name: picked.name, type: picked.type } as any);
      const res = await api.post('/uploads/media-temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      update({ label_photo: res.data.filename, label_photo_name: res.data.original_name });
    } catch (err: any) {
      Alert.alert('Upload failed', err?.response?.data?.detail || 'Could not upload the label photo');
    } finally {
      setUploading(false);
    }
  };

  const launchPhoto = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera blocked', 'Allow camera access in Settings to photograph the label.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const opts = { mediaTypes: ['images'] as any, quality: 0.8 };
      const result = source === 'camera' ? await safeLaunchCamera(opts) : await safeLaunchLibrary(opts);
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      await uploadLabelPhoto({ uri: a.uri, name: a.fileName || `label_${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
    } catch (err: any) {
      Alert.alert('Photo unavailable', err?.message || 'Could not open the camera or photo library');
    }
  };

  // The app-wide attach picker is a root-level overlay that renders behind this
  // Modal, so launch the native pickers directly (they present above the Modal).
  const pickLabelPhoto = () => {
    if (!isNative) return launchPhoto('library');
    Alert.alert('Label photo', 'Add a photo of the implant box label', [
      { text: 'Take photo', onPress: () => launchPhoto('camera') },
      { text: 'Choose from library', onPress: () => launchPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const filteredCatalog = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    return catalog.filter(c => !q || `${c.brand} ${c.name}`.toLowerCase().includes(q));
  }, [catalog, catalogFilter]);

  const chooseModel = (c: CatalogSystem) => {
    update({ model_brand: c.brand, model_system: c.name, model_label: `${c.brand} ${c.name}` });
    setPickerOpen(false);
  };

  const expired = !!data.expiry && /^\d{4}-\d{2}-\d{2}$/.test(data.expiry) && new Date(data.expiry) < new Date();

  const save = async () => {
    if (!data.gtin && !data.lot && !data.serial) {
      setEmptyWarn(true);
      return;
    }
    if (data.gtin && !isValidGtin(data.gtin) && !gtinWarn) {
      // Inline (not Alert) so the flow also works on web; second tap saves anyway.
      setGtinWarn(true);
      return;
    }
    finalize();
  };

  const finalize = async () => {
    // Teach the learning map when the GTIN is new and a model was chosen.
    if (data.gtin && gtinKnown === false && data.model_brand) {
      try { await api.post('/gtin', { gtin: data.gtin, brand: data.model_brand, system: data.model_system || '', label: data.model_label || '' }); } catch { /* non-blocking */ }
    }
    onSave({ ...data, scanned_at: data.scanned_at || new Date().toISOString() });
    onClose();
  };

  // Plain render helper (not a component) so TextInputs keep focus across re-renders.
  const renderField = (label: string, k: keyof ImplantTraceability, placeholder: string, keyboard?: any) => (
    <View style={st.field} key={k}>
      <Text style={st.label}>{label}</Text>
      <TextInput
        style={st.input}
        value={(data[k] as string) || ''}
        onChangeText={v => update({ [k]: v } as any)}
        onBlur={k === 'gtin' ? () => lookupGtin((data.gtin || '').trim()) : undefined}
        placeholder={placeholder}
        placeholderTextColor="#9AA5B1"
        keyboardType={keyboard}
        autoCapitalize="characters"
        testID={`trace-${k}`}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet} testID="implant-scan-sheet">
          <View style={st.header}>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>Implant box code</Text>
              <Text style={st.subtitle}>{positionLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.closeBtn} testID="trace-close"><Ionicons name="close" size={22} color="#37474F" /></TouchableOpacity>
          </View>

          {mode === 'scan' && canUseCamera ? (
            <View style={st.cameraWrap}>
              {permission?.granted && CameraView ? (
                <CameraView
                  style={st.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['datamatrix', 'qr', 'code128'] }}
                  onBarcodeScanned={scanLocked ? undefined : onBarcode}
                />
              ) : (
                <View style={st.permBox}>
                  <Ionicons name="camera-outline" size={36} color="#546E7A" />
                  <Text style={st.permText}>Camera access is needed to read the DataMatrix code on the implant box.</Text>
                  <TouchableOpacity style={st.primaryBtn} onPress={ensurePermission}><Text style={st.primaryBtnText}>Allow camera</Text></TouchableOpacity>
                </View>
              )}
              <View style={st.reticle} pointerEvents="none" />
              <Text style={st.hint}>Point at the square DataMatrix code on the box label</Text>
              <TouchableOpacity style={st.linkBtn} onPress={() => setMode('form')} testID="trace-manual">
                <Ionicons name="create-outline" size={16} color="#1565C0" />
                <Text style={st.linkText}>Enter manually</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              {canUseCamera && (
                <TouchableOpacity style={st.scanAgain} onPress={() => { setScanLocked(false); setMode('scan'); }} testID="trace-rescan">
                  <Ionicons name="scan-outline" size={18} color="#1565C0" />
                  <Text style={st.linkText}>{data.raw ? 'Scan again' : 'Scan with camera'}</Text>
                </TouchableOpacity>
              )}
              {isNative && !canUseCamera && (
                <View style={st.warnRow} testID="trace-camera-unavailable">
                  <Ionicons name="information-circle" size={16} color="#E65100" />
                  <Text style={st.warnText}>Box-code scanning needs the latest app version. Update the app from the store, or enter the details below.</Text>
                </View>
              )}
              {!canUseCamera && (
                <View style={st.field}>
                  <Text style={st.label}>Paste code string (optional)</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[st.input, { flex: 1 }]} placeholder="(01)0812345678901(10)LOT(21)SERIAL(17)271231" placeholderTextColor="#9AA5B1"
                      value={rawText} onChangeText={setRawText} onSubmitEditing={() => rawText && applyRaw(rawText, 'manual')} testID="trace-raw" />
                    <TouchableOpacity style={st.pickBtn} onPress={() => rawText && applyRaw(rawText, 'manual')} testID="trace-raw-apply">
                      <Text style={st.pickBtnText}>Parse</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {data.source === 'scan' && !!data.raw && (
                <View style={st.badgeRow}><Ionicons name="checkmark-circle" size={16} color="#2E7D32" /><Text style={st.badgeOk}>Scanned from box</Text></View>
              )}

              {renderField('GTIN (01)', 'gtin', '14-digit product code', 'number-pad')}
              <View style={st.modelBox}>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>Implant model</Text>
                  {lookingUp ? <ActivityIndicator size="small" color="#1565C0" /> : (
                    <Text style={[st.modelText, !data.model_label && st.modelMissing]} testID="trace-model">
                      {data.model_label || (gtinKnown === false ? 'Unknown product — pick from catalog' : 'Not set')}
                    </Text>
                  )}
                  {gtinKnown === true && <Text style={st.learned}>Auto-filled from previous scan</Text>}
                </View>
                <TouchableOpacity style={st.pickBtn} onPress={() => setPickerOpen(true)} testID="trace-pick-model">
                  <Text style={st.pickBtnText}>{data.model_label ? 'Change' : 'Pick'}</Text>
                </TouchableOpacity>
              </View>
              {renderField('Lot / Batch (10)', 'lot', 'e.g. 2024A1234')}
              {renderField('Serial number (21)', 'serial', 'Serial if printed')}
              {renderField('Expiry (17)', 'expiry', 'YYYY-MM-DD')}
              {expired && (
                <View style={st.warnRow}><Ionicons name="warning" size={16} color="#E65100" /><Text style={st.warnText}>This lot appears to be past its expiry date.</Text></View>
              )}
              {renderField('Manufacturing date (11)', 'mfg_date', 'YYYY-MM-DD (optional)')}

              <Text style={st.label}>Label photo (evidence)</Text>
              <View style={st.photoRow}>
                {photoUrl ? <Image source={{ uri: photoUrl }} style={st.thumb} /> : <View style={[st.thumb, st.thumbEmpty]}><Ionicons name="image-outline" size={22} color="#90A4AE" /></View>}
                <TouchableOpacity style={st.pickBtn} onPress={pickLabelPhoto} disabled={uploading} testID="trace-photo">
                  {uploading ? <ActivityIndicator size="small" color="#1565C0" /> : <Text style={st.pickBtnText}>{data.label_photo ? 'Replace photo' : 'Add photo'}</Text>}
                </TouchableOpacity>
                {!!data.label_photo && (
                  <TouchableOpacity onPress={() => update({ label_photo: undefined, label_photo_name: undefined })} style={st.closeBtn}><Ionicons name="trash-outline" size={18} color="#D32F2F" /></TouchableOpacity>
                )}
              </View>

              {emptyWarn && !data.gtin && !data.lot && !data.serial && (
                <View style={st.warnRow}><Ionicons name="alert-circle" size={16} color="#E65100" /><Text style={st.warnText}>Enter at least a GTIN, Lot or Serial number.</Text></View>
              )}
              {gtinWarn && (
                <View style={st.warnRow} testID="trace-gtin-warn"><Ionicons name="alert-circle" size={16} color="#E65100" />
                  <Text style={st.warnText}>GTIN check digit does not match — verify the number, or tap Save again to keep it.</Text></View>
              )}
              <TouchableOpacity style={st.primaryBtn} onPress={save} testID="trace-save">
                <Text style={st.primaryBtnText}>{gtinWarn ? 'Save anyway' : 'Save to implant'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Catalog picker */}
          <Modal visible={pickerOpen} animationType="fade" transparent onRequestClose={() => setPickerOpen(false)}>
            <View style={st.backdrop}>
              <View style={[st.sheet, { maxHeight: '75%' }]} testID="trace-catalog-picker">
                <View style={st.header}>
                  <Text style={st.title}>Select implant system</Text>
                  <TouchableOpacity onPress={() => setPickerOpen(false)} style={st.closeBtn}><Ionicons name="close" size={22} color="#37474F" /></TouchableOpacity>
                </View>
                <TextInput style={st.input} placeholder="Search brand or system" placeholderTextColor="#9AA5B1" value={catalogFilter} onChangeText={setCatalogFilter} testID="trace-catalog-search" />
                <ScrollView style={{ marginTop: 8 }}>
                  {filteredCatalog.map(c => (
                    <TouchableOpacity key={c.key} style={st.catRow} onPress={() => chooseModel(c)} testID={`trace-catalog-${c.key}`}>
                      <Text style={st.catBrand}>{c.brand}</Text>
                      <Text style={st.catName}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {filteredCatalog.length === 0 && <Text style={st.permText}>No matching systems</Text>}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#546E7A', marginTop: 2 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { alignItems: 'center' },
  camera: { width: '100%', height: 320, borderRadius: 16, overflow: 'hidden' },
  reticle: { position: 'absolute', top: 90, width: 150, height: 150, borderWidth: 2, borderColor: '#FFD54F', borderRadius: 12 },
  hint: { marginTop: 10, fontSize: 13, color: '#546E7A', textAlign: 'center' },
  permBox: { width: '100%', height: 320, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  permText: { fontSize: 14, color: '#546E7A', textAlign: 'center' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, minHeight: 44 },
  linkText: { color: '#1565C0', fontWeight: '600', fontSize: 14 },
  scanAgain: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 10, minHeight: 44 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  badgeOk: { color: '#2E7D32', fontWeight: '600', fontSize: 13 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1A1A2E', backgroundColor: '#FAFBFC', minHeight: 44 },
  modelBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, marginBottom: 12 },
  modelText: { fontSize: 15, fontWeight: '600', color: '#0D47A1' },
  modelMissing: { color: '#E65100', fontWeight: '500' },
  learned: { fontSize: 11, color: '#2E7D32', marginTop: 2 },
  pickBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#1565C0', borderRadius: 10, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  pickBtnText: { color: '#1565C0', fontWeight: '600' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF3E0', padding: 10, borderRadius: 10, marginBottom: 12 },
  warnText: { color: '#E65100', fontSize: 13, flex: 1 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#ECEFF1' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: '#1565C0', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  catRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECEFF1', minHeight: 48 },
  catBrand: { fontSize: 12, color: '#78909C', fontWeight: '600' },
  catName: { fontSize: 15, color: '#1A1A2E', fontWeight: '600' },
});
