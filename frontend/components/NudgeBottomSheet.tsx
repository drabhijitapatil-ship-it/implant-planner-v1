import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type NudgeHistoryItem = {
  id: string;
  from_user_id?: string;
  from_user_name?: string;
  from_user_role?: string;
  message?: string;
  read?: boolean;
  created_at?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
  pendingCount?: number;
  pendingCaseIds?: string[];
  onSent?: () => void;
};

const TEMPLATES: { label: string; build: (name: string, count: number) => string }[] = [
  {
    label: 'Friendly reminder',
    build: (n, c) => `Hi ${n || 'there'}, just a friendly reminder${c > 0 ? ` — you have ${c} case${c === 1 ? '' : 's'} pending phase submission.` : '.'} Let me know if you need help with anything.`,
  },
  {
    label: 'Phase 2 overdue',
    build: (n) => `Hi ${n || 'there'}, your Phase 2 submission is overdue. Please submit at your earliest convenience or reach out if you're blocked.`,
  },
  {
    label: 'Patient follow-up',
    build: (n) => `Hi ${n || 'there'}, please follow up with your patient and update the case status when you get a chance.`,
  },
];

export function NudgeBottomSheet({ visible, onClose, studentId, studentName, pendingCount = 0, pendingCaseIds = [], onSent }: Props) {
  const firstName = useMemo(() => (studentName || '').replace(/^Dr\.?\s+/i, '').split(' ')[0] || '', [studentName]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<NudgeHistoryItem[]>([]);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/students/${studentId}/nudge-history?limit=5`);
      setHistory(res.data.history || []);
      setCooldownSec(res.data.cooldown_seconds_remaining || 0);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reset state every time the sheet opens; preload default message + history
  useEffect(() => {
    if (visible) {
      setError(null);
      setMessage(TEMPLATES[0].build(firstName, pendingCount));
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, studentId]);

  // Tick down the cooldown timer
  useEffect(() => {
    if (!visible || cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [visible, cooldownSec]);

  const send = async () => {
    if (!message.trim()) { setError('Message cannot be empty'); return; }
    if (cooldownSec > 0) return;
    setError(null);
    setSending(true);
    try {
      await api.post(`/students/${studentId}/nudge`, {
        message: message.trim(),
        case_ids: pendingCaseIds.slice(0, 10),
      });
      onSent?.();
      onClose();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 429 && detail) {
        const sec = (typeof detail === 'object' && (detail.seconds_remaining ?? detail.value?.seconds_remaining)) || 1800;
        setCooldownSec(sec);
        setError((typeof detail === 'object' ? detail.message : detail) || 'Please wait before sending another nudge.');
      } else {
        setError((typeof detail === 'string' ? detail : detail?.message) || 'Failed to send nudge. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const fmtCooldown = (s: number) => {
    const m = Math.floor(s / 60); const ss = s % 60;
    return m > 0 ? `${m}m ${ss}s` : `${ss}s`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} testID="nudge-backdrop" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
        <View style={s.sheet} data-testid="nudge-sheet">
          <View style={s.handle} />
          <View style={s.headerRow}>
            <Ionicons name="megaphone-outline" size={20} color="#1565C0" />
            <Text style={s.headerTitle}>Nudge {studentName || 'Student'}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} testID="nudge-close">
              <Ionicons name="close" size={20} color="#90A4AE" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <Text style={s.sectionLbl}>Quick templates</Text>
            <View style={s.chipRow}>
              {TEMPLATES.map((tpl, i) => (
                <TouchableOpacity
                  key={`tpl-${i}`}
                  style={s.tplChip}
                  onPress={() => setMessage(tpl.build(firstName, pendingCount))}
                  data-testid={`nudge-template-${i}`}
                >
                  <Text style={s.tplChipText}>{tpl.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.sectionLbl, { marginTop: 14 }]}>Message</Text>
            <TextInput
              style={s.input}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
              placeholder="Write a short message…"
              placeholderTextColor="#B0BEC5"
              data-testid="nudge-message-input"
            />
            <Text style={s.charCount}>{message.length}/500</Text>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#B71C1C" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <View style={s.actionRow}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn} data-testid="nudge-cancel">
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={send}
                disabled={sending || cooldownSec > 0 || !message.trim()}
                style={[s.sendBtn, (sending || cooldownSec > 0 || !message.trim()) && s.sendBtnDisabled]}
                data-testid="nudge-send"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={14} color="#FFF" />
                    <Text style={s.sendTxt}>
                      {cooldownSec > 0 ? `Wait ${fmtCooldown(cooldownSec)}` : 'Send Nudge'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* History */}
            <View style={s.historyWrap}>
              <Text style={s.sectionLbl}>Recent nudges</Text>
              {historyLoading ? (
                <ActivityIndicator size="small" color="#1A73E8" style={{ marginTop: 6 }} />
              ) : history.length === 0 ? (
                <Text style={s.historyEmpty}>No nudges sent to this student yet.</Text>
              ) : (
                history.map((h) => (
                  <View key={h.id} style={s.historyItem} data-testid={`nudge-history-${h.id}`}>
                    <View style={[s.dot, { backgroundColor: h.read ? '#66BB6A' : '#FFA726' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.historyMeta} numberOfLines={1}>
                        {h.from_user_name || 'Someone'} · {h.from_user_role === 'supervisor' ? 'Supervisor' : 'In-Charge'}
                        {h.created_at ? ` · ${new Date(h.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </Text>
                      <Text style={s.historyMsg} numberOfLines={2}>{h.message}</Text>
                      <Text style={s.historyStatus}>{h.read ? 'Read' : 'Unread'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18,
    maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: '#CFD8DC', marginVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0D47A1' },
  closeBtn: { padding: 6 },

  sectionLbl: { fontSize: 11, fontWeight: '800', color: '#546E7A', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tplChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: '#90CAF9', backgroundColor: '#E3F2FD',
  },
  tplChipText: { fontSize: 11, fontWeight: '700', color: '#0D47A1', letterSpacing: 0.2 },

  input: {
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    padding: 12, minHeight: 96, fontSize: 13, color: '#37474F', textAlignVertical: 'top',
  } as any,
  charCount: { textAlign: 'right', fontSize: 10, color: '#90A4AE', marginTop: 2, fontWeight: '600' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFEBEE', borderColor: '#FFCDD2', borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8,
  },
  errorText: { fontSize: 11, color: '#B71C1C', fontWeight: '600', flex: 1 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#ECEFF1', alignItems: 'center' },
  cancelTxt: { fontSize: 13, fontWeight: '700', color: '#546E7A' },
  sendBtn: { flex: 2, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#1565C0' },
  sendBtnDisabled: { backgroundColor: '#90A4AE' },
  sendTxt: { fontSize: 13, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

  historyWrap: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  historyEmpty: { fontSize: 12, color: '#90A4AE', fontStyle: 'italic', marginTop: 4 },
  historyItem: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  historyMeta: { fontSize: 11, fontWeight: '700', color: '#546E7A' },
  historyMsg: { fontSize: 12, color: '#37474F', marginTop: 2 },
  historyStatus: { fontSize: 9, color: '#90A4AE', marginTop: 2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
