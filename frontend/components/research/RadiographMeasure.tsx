/**
 * Research Module — radiograph upload + calibrated on-screen measurement (§11, v1 manual).
 * Flow: upload photo of IOPA → tap implant shoulder & apex + known implant length (calibration, grade B)
 * → pick a mm variable → tap two landmarks → value written to the form.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Modal, Image, Pressable, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import Ionicons from '@react-native-vector-icons/ionicons';
import api, { getToken } from '../../utils/api';
import { showUploadPicker } from '../../utils/uploadPicker';
import { RC, Chip, PrimaryButton, ScreenHeader, Variable, errText, u } from './ResearchUI';

type Pt = [number, number];
type Props = {
  visible: boolean; onClose: () => void; enrolmentId: string; tpKey: string; form: any;
  variables: Variable[]; implantLength?: number | null; editable: boolean; onUpdated: (enr: any) => void;
};

export default function RadiographMeasure({ visible, onClose, enrolmentId, tpKey, form, variables, implantLength, editable, onUpdated }: Props) {
  const { width: winW } = useWindowDimensions();
  const asset = form?.images?.iopa;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'calibrate' | 'measure'>(asset?.calibration ? 'measure' : 'calibrate');
  const [calPts, setCalPts] = useState<Pt[]>(asset?.calibration ? [asset.calibration.p1, asset.calibration.p2] : []);
  const [refLen, setRefLen] = useState(String(asset?.calibration?.reference_length_mm ?? implantLength ?? ''));
  const [varKey, setVarKey] = useState<string>('');
  const [pts, setPts] = useState<Record<string, Pt[]>>(() => Object.fromEntries(Object.entries(asset?.measurements || {}).map(([k, m]: any) => [k, [m.p1, m.p2]])));
  const [negative, setNegative] = useState<Record<string, boolean>>({});
  const [layout, setLayout] = useState({ w: winW - 28, h: 300 });

  React.useEffect(() => { getToken('access_token').then(t => setToken(t || '')); }, []);
  React.useEffect(() => {
    if (asset?.calibration) { setCalPts([asset.calibration.p1, asset.calibration.p2]); setRefLen(String(asset.calibration.reference_length_mm)); setMode('measure'); }
    setPts(Object.fromEntries(Object.entries(asset?.measurements || {}).map(([k, m]: any) => [k, [m.p1, m.p2]])));
  }, [asset]);

  const measurable = useMemo(() => variables.filter(v => v.source === 'study' && ['decimal', 'integer'].includes(v.data_type) && (v.unit || '').toLowerCase() === 'mm'), [variables]);
  const imgW = asset?.width || 1, imgH = asset?.height || 1;
  const dispW = winW - 28, dispH = Math.round(dispW * imgH / imgW);
  const toDisp = (p: Pt): Pt => [p[0] * dispW / imgW, p[1] * dispH / imgH];
  const toNat = (x: number, y: number): Pt => [Math.round(x * imgW / dispW), Math.round(y * imgH / dispH)];
  const pxPerMm = calPts.length === 2 && Number(refLen) > 0 ? Math.hypot(calPts[1][0] - calPts[0][0], calPts[1][1] - calPts[0][1]) / Number(refLen) : 0;
  const mmOf = (pp?: Pt[]) => pp && pp.length === 2 && pxPerMm ? (Math.hypot(pp[1][0] - pp[0][0], pp[1][1] - pp[0][1]) / pxPerMm) : null;
  const imageUrl = asset ? `${api.defaults.baseURL}/research/images/${enrolmentId}/${tpKey}/iopa?token=${token}&v=${asset.uploaded_at}` : '';

  const upload = async () => {
    try {
      const picked = await showUploadPicker(['image/png', 'image/jpeg', 'image/webp']);
      if (!picked) return;
      setBusy(true);
      const fd = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(picked.uri)).blob();
        fd.append('file', blob, picked.name || 'iopa.jpg');
      } else {
        fd.append('file', { uri: picked.uri, name: picked.name || 'iopa.jpg', type: picked.type || 'image/jpeg' } as any);
      }
      fd.append('slot', 'iopa');
      const r = await api.post(`/research/enrolments/${enrolmentId}/forms/${tpKey}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUpdated(r.data); setCalPts([]); setPts({}); setMode('calibrate');
    } catch (e) { Alert.alert('Upload failed', errText(e)); } finally { setBusy(false); }
  };

  const onTap = (e: any) => {
    if (!editable) return;
    const ne = e.nativeEvent;
    const lx = ne.locationX ?? ne.offsetX ?? 0, ly = ne.locationY ?? ne.offsetY ?? 0;
    const p = toNat(lx, ly);
    if (mode === 'calibrate') setCalPts(c => (c.length >= 2 ? [p] : [...c, p]));
    else if (varKey) setPts(s => { const cur = s[varKey] || []; return { ...s, [varKey]: cur.length >= 2 ? [p] : [...cur, p] }; });
  };

  const save = async () => {
    if (calPts.length !== 2 || !(Number(refLen) > 0)) { Alert.alert('Calibrate first', 'Tap the implant shoulder and apex, then enter the implant length in mm.'); return; }
    setBusy(true);
    try {
      const measurements: any = {};
      for (const [k, pp] of Object.entries(pts)) if (pp.length === 2) measurements[k] = { p1: pp[0], p2: pp[1], signed_negative: !!negative[k] };
      const r = await api.put(`/research/enrolments/${enrolmentId}/forms/${tpKey}/image/iopa/measure`, { calibration: { p1: calPts[0], p2: calPts[1], reference_length_mm: Number(refLen) }, measurements });
      onUpdated(r.data); Alert.alert('Saved', 'Measurements written to the form.'); onClose();
    } catch (e) { Alert.alert('Not saved', errText(e)); } finally { setBusy(false); }
  };

  const activePts = mode === 'calibrate' ? calPts : (pts[varKey] || []);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={u.container} edges={['bottom']}>
        <ScreenHeader title="Radiograph measurement" subtitle={asset ? `Grade ${asset.quality_grade}${asset.calibration ? ` · ${asset.calibration.px_per_mm} px/mm` : ' · uncalibrated'}` : 'Upload a photo of the IOPA'} onBack={onClose}
          right={editable ? <PrimaryButton label={asset ? 'Replace' : 'Upload'} variant="outline" icon="cloud-upload-outline" onPress={upload} loading={busy} testID="rx-upload" style={{ paddingVertical: 8, minHeight: 36 }} /> : null} />
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {!asset ? (
            <View style={s.empty}><Ionicons name="image-outline" size={40} color="#B0BEC5" /><Text style={u.kv}>Standardised IOPA (paralleling technique). Photo/upload is graded B after calibration; DICOM import comes later.</Text></View>
          ) : (
            <>
              <Pressable onPress={onTap} onLayout={e => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ width: dispW, height: dispH, backgroundColor: '#000', borderRadius: 10, overflow: 'hidden' }} testID="rx-canvas">
                <Image source={{ uri: imageUrl }} style={{ width: dispW, height: dispH }} resizeMode="stretch" />
                <Svg width={dispW} height={dispH} style={StyleSheet.absoluteFill} pointerEvents="none">
                  {calPts.length === 2 && <Line x1={toDisp(calPts[0])[0]} y1={toDisp(calPts[0])[1]} x2={toDisp(calPts[1])[0]} y2={toDisp(calPts[1])[1]} stroke="#FFD54F" strokeWidth={2} strokeDasharray="6 4" />}
                  {calPts.map((p, i) => <Circle key={`c${i}`} cx={toDisp(p)[0]} cy={toDisp(p)[1]} r={6} fill="#FFD54F" />)}
                  {Object.entries(pts).map(([k, pp]) => pp.length === 2 ? <Line key={k} x1={toDisp(pp[0])[0]} y1={toDisp(pp[0])[1]} x2={toDisp(pp[1])[0]} y2={toDisp(pp[1])[1]} stroke={k === varKey ? '#4FC3F7' : '#81C784'} strokeWidth={2} /> : null)}
                  {Object.entries(pts).flatMap(([k, pp]) => pp.map((p, i) => <Circle key={`${k}${i}`} cx={toDisp(p)[0]} cy={toDisp(p)[1]} r={5} fill={k === varKey ? '#4FC3F7' : '#81C784'} />))}
                </Svg>
              </Pressable>
              <View style={[u.row, { marginTop: 10, gap: 8 }]}>
                <TouchableOpacity style={[s.modeBtn, mode === 'calibrate' && s.modeOn]} onPress={() => setMode('calibrate')} testID="rx-mode-calibrate"><Text style={[s.modeTxt, mode === 'calibrate' && { color: '#FFF' }]}>1 · Calibrate</Text></TouchableOpacity>
                <TouchableOpacity style={[s.modeBtn, mode === 'measure' && s.modeOn, !pxPerMm && { opacity: 0.4 }]} disabled={!pxPerMm} onPress={() => setMode('measure')} testID="rx-mode-measure"><Text style={[s.modeTxt, mode === 'measure' && { color: '#FFF' }]}>2 · Measure</Text></TouchableOpacity>
              </View>
              {mode === 'calibrate' ? (
                <View style={s.panel}>
                  <Text style={u.strong}>Tap the implant shoulder, then the apex ({calPts.length}/2)</Text>
                  <Text style={u.kv}>Draw along the implant body; the known implant length converts pixels to millimetres (BR-22).</Text>
                  <View style={[u.row, { marginTop: 8 }]}>
                    <Text style={u.label}>Implant length (mm)  </Text>
                    <TextInput value={refLen} onChangeText={setRefLen} keyboardType="numbers-and-punctuation" style={[u.input, { flex: 1 }]} editable={editable} testID="rx-ref-length" />
                  </View>
                  {!!pxPerMm && <Text style={[u.kv, { marginTop: 6, color: RC.green }]}>Scale: {pxPerMm.toFixed(2)} px/mm</Text>}
                </View>
              ) : (
                <View style={s.panel}>
                  <Text style={u.strong}>Pick a variable, then tap its two landmarks</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {measurable.map(v => { const mm = mmOf(pts[v.key]); return (
                      <TouchableOpacity key={v.key} onPress={() => setVarKey(v.key)} style={[u.pill, varKey === v.key && { backgroundColor: RC.primary, borderColor: RC.primary }]} testID={`rx-var-${v.key}`}>
                        <Text style={[u.pillTxt, varKey === v.key && { color: '#FFF' }]}>{v.label}{mm != null ? ` · ${(negative[v.key] ? -mm : mm).toFixed(2)} mm` : ''}</Text>
                      </TouchableOpacity>); })}
                    {measurable.length === 0 && <Text style={u.kv}>No mm variables in this timepoint.</Text>}
                  </View>
                  {!!varKey && (
                    <>
                      <Text style={[u.kv, { marginTop: 8 }]}>{variables.find(v => v.key === varKey)?.method_note || 'Shoulder → first bone-to-implant contact, parallel to the implant axis.'} ({activePts.length}/2 points)</Text>
                      <TouchableOpacity style={[u.row, { marginTop: 6 }]} onPress={() => setNegative(n => ({ ...n, [varKey]: !n[varKey] }))} testID="rx-negative">
                        <Ionicons name={negative[varKey] ? 'checkbox' : 'square-outline'} size={20} color={RC.primary} />
                        <Text style={[u.kv, { marginLeft: 6 }]}>Bone is coronal to the shoulder (record as negative)</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
              <View style={[u.row, { flexWrap: 'wrap', gap: 6, marginTop: 10 }]}>
                <Chip label={`Grade ${asset.quality_grade}`} color={asset.quality_grade === 'A' ? RC.green : asset.quality_grade === 'B' ? RC.primary : RC.amber} bg={asset.quality_grade === 'B' ? RC.primarySoft : RC.amberSoft} small />
                {asset.acquisition_date && <Chip label={asset.acquisition_date} color={RC.sub} bg={RC.greySoft} small />}
                <Chip label={`uploaded by ${asset.uploaded_by}`} color={RC.sub} bg={RC.greySoft} small />
              </View>
              {editable && <PrimaryButton label="Save calibration & measurements" icon="save-outline" onPress={save} loading={busy} style={{ marginTop: 14 }} testID="rx-save" />}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', padding: 30, gap: 10 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: RC.primary, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  modeOn: { backgroundColor: RC.primary },
  modeTxt: { fontWeight: '700', color: RC.primary, fontSize: 13 },
  panel: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: RC.border },
});
