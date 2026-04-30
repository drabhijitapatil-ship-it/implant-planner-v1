import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  procedureId: string;
  patientName?: string;
  onShared: (threadId: string) => void;
}

export default function ShareToForumModal({ visible, onClose, procedureId, patientName, onShared }: Props) {
  const [consent, setConsent] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setConsent(false); setAnonymous(false); setError(null); };

  const submit = async () => {
    setError(null);
    if (!consent) { setError('Please confirm patient consent before sharing.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/forum/threads', {
        procedure_id: procedureId,
        consent_acknowledged: true,
        anonymous,
      });
      const tid = res.data?.thread?.id;
      if (tid) {
        reset();
        onShared(tid);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to share case.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <View style={s.headerRow}>
            <Ionicons name="chatbubbles" size={22} color="#1565C0" />
            <Text style={s.title}>Share to Discussion Forum</Text>
          </View>
          <Text style={s.subtitle}>{patientName || 'Case'}</Text>

          <View style={s.consentBlock}>
            <TouchableOpacity style={s.checkRow} onPress={() => setConsent(!consent)} data-testid="forum-consent-toggle">
              <View style={[s.check, consent && s.checkOn]}>
                {consent && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={s.consentText}>
                I confirm that I have the patient's consent to share this de-identified case for educational discussion.
              </Text>
            </TouchableOpacity>
          </View>

          <View style={s.anonRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.anonLabel}>Share Anonymously</Text>
              <Text style={s.anonHelp}>Patient name shows as initials. Your name is hidden from students.</Text>
            </View>
            <Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ false: '#CFD8DC', true: '#90CAF9' }} thumbColor={anonymous ? '#1565C0' : '#ECEFF1'} data-testid="forum-anonymous-toggle" />
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          <View style={s.actionsRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn, (!consent || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!consent || busy} data-testid="forum-share-submit-btn">
              {busy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={s.submitTxt}>Share Case</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: '#37474F' },
  subtitle: { fontSize: 13, color: '#78909C', marginBottom: 16 },
  consentBlock: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FFE082', marginBottom: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#FF8F00', marginTop: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  checkOn: { backgroundColor: '#FF8F00', borderColor: '#FF8F00' },
  consentText: { flex: 1, fontSize: 13, color: '#5D4037', lineHeight: 18 },
  anonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, marginBottom: 16 },
  anonLabel: { fontSize: 14, fontWeight: '600', color: '#37474F' },
  anonHelp: { fontSize: 12, color: '#78909C', marginTop: 2 },
  error: { fontSize: 13, color: '#C62828', backgroundColor: '#FFEBEE', padding: 8, borderRadius: 6, marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', alignItems: 'center' },
  cancelTxt: { fontSize: 14, fontWeight: '600', color: '#546E7A' },
  submitBtn: { flex: 1.4, paddingVertical: 12, borderRadius: 8, backgroundColor: '#1565C0', alignItems: 'center' },
  submitTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
