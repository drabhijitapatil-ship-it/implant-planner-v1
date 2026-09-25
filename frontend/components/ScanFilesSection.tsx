import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator, Modal, Linking, Platform, ScrollView } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as Clipboard from 'expo-clipboard';
import api from '../utils/api';
import { getToken } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { pickScanFiles, uploadScanFile, fmtBytes } from '../utils/scanUpload';

type Summary = { files: any[]; scan_portal_link: string; lab_share: any | null };

const EXT_ICON: Record<string, string> = { stl: 'cube-outline', ply: 'cube-outline', obj: 'cube-outline', zip: 'archive-outline', dcm: 'medical-outline', pdf: 'document-text-outline' };

/**
 * iter-Jun-2026: "Digital scan files" for the Lab Slip — attach STL/PLY/OBJ/ZIP
 * exports (chunked upload with progress), a scanner-portal link, and the secure
 * 30-day lab link (copy / revoke / Email lab). Used in Phase 4 Step 1 (when IOS
 * selected) and on the case-detail Lab Slip card.
 */
export default function ScanFilesSection({ procedureId, canEdit, compact = false, onChanged }: {
  procedureId: string; canEdit: boolean; compact?: boolean; onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([]);
  const [link, setLink] = useState('');
  const [editingLink, setEditingLink] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [labs, setLabs] = useState<any[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/procedures/${procedureId}/scan-files`);
      setData(r.data);
      setLink(r.data.scan_portal_link || '');
    } catch { /* not visible to this role */ }
  }, [procedureId]);
  useEffect(() => { load(); }, [load]);

  const attach = async () => {
    try {
      const picked = await pickScanFiles();
      if (!picked.length) return;
      for (const p of picked) {
        setUploads((u) => [...u, { name: p.name, progress: 0 }]);
        try {
          await uploadScanFile(procedureId, p, (frac) => setUploads((u) => u.map((x) => (x.name === p.name ? { ...x, progress: frac } : x))));
          setUploads((u) => u.filter((x) => x.name !== p.name));
        } catch (e: any) {
          const msg = e?.response?.data?.detail || e?.message || 'Upload failed';
          setUploads((u) => u.map((x) => (x.name === p.name ? { ...x, error: msg } : x)));
        }
      }
      await load();
      onChanged?.();
    } catch (e: any) {
      Alert.alert('Cannot attach', e?.message || 'Please try again.');
    }
  };

  const remove = (f: any) => {
    const go = async () => {
      try {
        const r = await api.delete(`/procedures/${procedureId}/scan-files/${f.file_id}`);
        setData(r.data); onChanged?.();
      } catch (e: any) { Alert.alert('Could not remove', e?.response?.data?.detail || 'Please try again.'); }
    };
    if (Platform.OS === 'web') { if ((globalThis as any).confirm?.(`Remove ${f.name}?`)) go(); return; }
    Alert.alert('Remove file', `Remove ${f.name} from this case?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const openFile = async (f: any) => {
    const token = await getToken('access_token');
    const url = `${api.defaults.baseURL}/procedures/${procedureId}/scan-files/${f.file_id}/download?token=${token}`;
    Linking.openURL(url);
  };

  const saveLink = async () => {
    setSavingLink(true);
    try {
      const r = await api.put(`/procedures/${procedureId}/scan-link`, { url: link.trim() });
      setData(r.data); setEditingLink(false); onChanged?.();
    } catch (e: any) { Alert.alert('Invalid link', e?.response?.data?.detail || 'Please check the URL.'); }
    finally { setSavingLink(false); }
  };

  const createLink = async () => {
    setBusy(true);
    try { await api.post(`/procedures/${procedureId}/lab-share`); await load(); }
    catch (e: any) { Alert.alert('Could not create link', e?.response?.data?.detail || 'Please try again.'); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true);
    try { const r = await api.post(`/procedures/${procedureId}/lab-share/revoke`); setData(r.data); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!data?.lab_share?.url) return;
    await Clipboard.setStringAsync(data.lab_share.url);
    Alert.alert('Copied', 'Lab link copied to clipboard.');
  };

  const openLabs = async () => {
    try { const r = await api.get('/labs'); setLabs(r.data); setLabsOpen(true); }
    catch { Alert.alert('Lab directory unavailable'); }
  };

  const sendEmail = async (lab: any) => {
    setSending(lab.id);
    try {
      if (!data?.lab_share) await api.post(`/procedures/${procedureId}/lab-share`);
      await api.post(`/procedures/${procedureId}/lab-share/email`, { lab_id: lab.id });
      setLabsOpen(false); await load();
      Alert.alert('Email sent', `Lab slip link sent to ${lab.name} (${lab.email}).`);
    } catch (e: any) { Alert.alert('Email failed', e?.response?.data?.detail || 'Please try again.'); }
    finally { setSending(null); }
  };

  if (!data) return null;
  const files = data.files || [];
  const share = data.lab_share;
  const canShare = canEdit || user?.role === 'supervisor';

  return (
    <View style={[s.wrap, compact && { marginHorizontal: 0, marginTop: 10 }]} testID="scan-files-section">
      <View style={s.head}>
        <Ionicons name="cloud-upload-outline" size={18} color="#1565C0" />
        <Text style={s.title}>Digital scan files</Text>
        <Text style={s.count}>{files.length}</Text>
      </View>
      <Text style={s.hint}>STL · PLY · OBJ · ZIP · DCM · PDF — up to 500 MB each. Uploaded in chunks so large full-arch scans finish reliably.</Text>

      {files.map((f) => (
        <View key={f.file_id} style={s.fileRow} testID={`scan-file-${f.file_id}`}>
          <Ionicons name={(EXT_ICON[f.ext] || 'document-outline') as any} size={20} color="#455A64" />
          <TouchableOpacity style={{ flex: 1 }} onPress={() => openFile(f)}>
            <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
            <Text style={s.fileMeta}>{fmtBytes(f.size)} · {f.uploaded_by_name || ''} · {String(f.uploaded_at || '').slice(0, 10)}</Text>
          </TouchableOpacity>
          {canEdit ? (
            <TouchableOpacity onPress={() => remove(f)} style={s.iconBtn} testID={`scan-file-remove-${f.file_id}`}>
              <Ionicons name="trash-outline" size={18} color="#C62828" />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {uploads.map((u) => (
        <View key={u.name} style={s.fileRow} testID={`scan-upload-${u.name}`}>
          <ActivityIndicator size="small" color="#1565C0" />
          <View style={{ flex: 1 }}>
            <Text style={s.fileName} numberOfLines={1}>{u.name}</Text>
            {u.error ? <Text style={[s.fileMeta, { color: '#C62828' }]}>{u.error}</Text> : (
              <View style={s.track}><View style={[s.fill, { width: `${Math.round(u.progress * 100)}%` }]} /></View>
            )}
          </View>
          {u.error ? <TouchableOpacity onPress={() => setUploads((x) => x.filter((y) => y.name !== u.name))} style={s.iconBtn}><Ionicons name="close" size={18} color="#999" /></TouchableOpacity> : <Text style={s.fileMeta}>{Math.round(u.progress * 100)}%</Text>}
        </View>
      ))}
      {canEdit ? (
        <TouchableOpacity style={s.attachBtn} onPress={attach} testID="scan-attach-btn">
          <Ionicons name="attach" size={18} color="#1565C0" />
          <Text style={s.attachTxt}>Attach scan files</Text>
        </TouchableOpacity>
      ) : null}

      {/* Portal link */}
      <View style={s.linkRow}>
        <Ionicons name="link-outline" size={18} color="#455A64" />
        {editingLink ? (
          <>
            <TextInput style={s.linkInput} value={link} onChangeText={setLink} placeholder="Medit Link / 3Shape Communicate / iTero / Drive URL" placeholderTextColor="#999" autoCapitalize="none" autoCorrect={false} testID="scan-link-input" />
            <TouchableOpacity onPress={saveLink} style={s.iconBtn} disabled={savingLink} testID="scan-link-save">{savingLink ? <ActivityIndicator size="small" /> : <Ionicons name="checkmark" size={20} color="#2E7D32" />}</TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => data.scan_portal_link && Linking.openURL(data.scan_portal_link)} disabled={!data.scan_portal_link}>
              <Text style={[s.fileName, !data.scan_portal_link && { color: '#999', fontWeight: '400' }]} numberOfLines={1}>{data.scan_portal_link || 'No scanner portal link'}</Text>
            </TouchableOpacity>
            {canEdit ? <TouchableOpacity onPress={() => setEditingLink(true)} style={s.iconBtn} testID="scan-link-edit"><Ionicons name="create-outline" size={18} color="#1565C0" /></TouchableOpacity> : null}
          </>
        )}
      </View>

      {/* Lab link */}
      {!compact && (
        <View style={s.shareBox} testID="lab-share-box">
          <View style={s.head}>
            <Ionicons name="qr-code-outline" size={18} color="#4527A0" />
            <Text style={[s.title, { color: '#4527A0' }]}>Secure lab link</Text>
          </View>
          {share ? (
            <>
              <Text style={s.shareUrl} numberOfLines={2} testID="lab-share-url">{share.url}</Text>
              <Text style={s.hint}>Valid until {String(share.expires_at).slice(0, 10)} · {share.downloads || 0} download(s) · slip {share.has_slip ? 'attached' : 'not attached yet — tap Generate Lab Slip'}</Text>
              {(share.emails_sent || []).length ? <Text style={s.hint}>Emailed to {share.emails_sent.map((e: any) => e.lab_name).join(', ')}</Text> : null}
              <View style={s.btnRow}>
                <TouchableOpacity style={s.smallBtn} onPress={copy} testID="lab-share-copy"><Ionicons name="copy-outline" size={15} color="#4527A0" /><Text style={s.smallTxt}>Copy</Text></TouchableOpacity>
                <TouchableOpacity style={s.smallBtn} onPress={() => Linking.openURL(share.url)} testID="lab-share-open"><Ionicons name="open-outline" size={15} color="#4527A0" /><Text style={s.smallTxt}>Preview</Text></TouchableOpacity>
                {canShare ? <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#4527A0' }]} onPress={openLabs} testID="lab-email-btn"><Ionicons name="mail-outline" size={15} color="#FFF" /><Text style={[s.smallTxt, { color: '#FFF' }]}>Email lab</Text></TouchableOpacity> : null}
                {canEdit ? <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#FFEBEE' }]} onPress={revoke} disabled={busy} testID="lab-share-revoke"><Ionicons name="ban-outline" size={15} color="#C62828" /><Text style={[s.smallTxt, { color: '#C62828' }]}>Revoke</Text></TouchableOpacity> : null}
              </View>
            </>
          ) : (
            <>
              <Text style={s.hint}>Generating the Lab Slip creates a 30-day secure link + QR code so the lab can download the slip and scan files without logging in.</Text>
              {canShare ? (
                <View style={s.btnRow}>
                  <TouchableOpacity style={[s.smallBtn, { backgroundColor: '#4527A0' }]} onPress={createLink} disabled={busy} testID="lab-share-create">
                    {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="link" size={15} color="#FFF" />}
                    <Text style={[s.smallTxt, { color: '#FFF' }]}>Create lab link</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}

      <Modal visible={labsOpen} transparent animationType="fade" onRequestClose={() => setLabsOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.head}>
              <Text style={s.title}>Email lab</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setLabsOpen(false)} style={s.iconBtn}><Ionicons name="close" size={22} color="#666" /></TouchableOpacity>
            </View>
            <Text style={s.hint}>The lab receives the secure link (slip + files). Labs are managed by the Implant In-Charge.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {labs.length === 0 ? <Text style={[s.hint, { marginTop: 12 }]}>No labs in the directory yet. Ask the Implant In-Charge to add one (Profile → Compliance → Lab directory).</Text> : labs.map((lab) => (
                <TouchableOpacity key={lab.id} style={s.labRow} onPress={() => sendEmail(lab)} disabled={!!sending} testID={`lab-pick-${lab.id}`}>
                  <Ionicons name="business-outline" size={20} color="#4527A0" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.fileName}>{lab.name}</Text>
                    <Text style={s.fileMeta}>{lab.email}{lab.contact_person ? ` · ${lab.contact_person}` : ''}</Text>
                  </View>
                  {sending === lab.id ? <ActivityIndicator size="small" color="#4527A0" /> : <Ionicons name="send-outline" size={18} color="#4527A0" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#F8FAFF', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#DCE6F5' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  count: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: '#1565C0', backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  hint: { fontSize: 11, color: '#78909C', marginBottom: 8, lineHeight: 15 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 10, marginBottom: 6, minHeight: 50, borderWidth: 1, borderColor: '#ECEFF1' },
  fileName: { fontSize: 13, fontWeight: '600', color: '#222' },
  fileMeta: { fontSize: 11, color: '#78909C', marginTop: 2 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, backgroundColor: '#E3F2FD', borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#1565C0' },
  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#1565C0', backgroundColor: '#FFF' },
  attachTxt: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 10, minHeight: 46, borderWidth: 1, borderColor: '#ECEFF1' },
  linkInput: { flex: 1, fontSize: 13, color: '#222', paddingVertical: 8 },
  shareBox: { marginTop: 12, backgroundColor: '#EDE7F6', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#D1C4E9' },
  shareUrl: { fontSize: 11, color: '#4527A0', marginBottom: 6 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 36, borderRadius: 18, backgroundColor: '#FFF' },
  smallTxt: { fontSize: 12, fontWeight: '700', color: '#4527A0' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  labRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', minHeight: 56 },
});
