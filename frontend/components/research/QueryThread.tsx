/**
 * Research Module — data query thread (S17). Reused in form entry and the study queries screen.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../../utils/api';
import { RC, Chip, PrimaryButton, errText, u } from './ResearchUI';

export const QUERY_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: RC.red, bg: RC.redSoft }, answered: { label: 'Answered', color: RC.amber, bg: RC.amberSoft }, closed: { label: 'Closed', color: RC.green, bg: RC.greenSoft },
};

export function QueryThread({ q, canClose, canReopen, onChanged, compact }: { q: any; canClose: boolean; canReopen: boolean; onChanged: (q: any) => void; compact?: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);
  const st = QUERY_STATUS[q.status] || QUERY_STATUS.open;

  const act = async (action: 'reply' | 'answer' | 'close' | 'reopen') => {
    if ((action === 'reply' || action === 'answer') && !text.trim()) { Alert.alert('Message required', 'Type a reply first.'); return; }
    setBusy(true);
    try { const r = await api.post(`/research/queries/${q.id}/reply`, { action, text }); onChanged(r.data); setText(''); }
    catch (e) { Alert.alert('Error', errText(e)); } finally { setBusy(false); }
  };

  return (
    <View style={s.card} testID={`query-${q.id}`}>
      <TouchableOpacity style={u.row} onPress={() => setOpen(o => !o)}>
        <Ionicons name="flag" size={14} color={st.color} />
        <Text style={s.title} numberOfLines={1}>  {q.subject_code} · {q.variable_key || q.timepoint_key || 'form'}</Text>
        <View style={{ flex: 1 }} />
        <Chip label={st.label} color={st.color} bg={st.bg} small />
      </TouchableOpacity>
      <Text style={u.kv}>Raised by {q.raised_by} · {String(q.created_at).slice(0, 10)}{q.value_at_raise !== undefined && q.value_at_raise !== null ? ` · value then: ${q.value_at_raise}` : ''}</Text>
      {open && (
        <>
          {q.thread.map((t: any, i: number) => (
            <View key={i} style={[s.msg, t.kind === 'raise' && { backgroundColor: RC.redSoft }, t.kind === 'answer' && { backgroundColor: RC.amberSoft }, (t.kind === 'close' || t.kind === 'reopen') && { backgroundColor: RC.greySoft }]}>
              <Text style={s.msgBy}>{t.by} · {t.kind}{t.kind !== 'reply' && t.kind !== 'raise' && t.kind !== 'answer' ? '' : ''} · {String(t.at).slice(0, 16).replace('T', ' ')}</Text>
              {!!t.text && <Text style={s.msgTxt}>{t.text}</Text>}
            </View>
          ))}
          {q.status !== 'closed' ? (
            <>
              <TextInput value={text} onChangeText={setText} placeholder="Reply…" placeholderTextColor={RC.muted} style={[u.input, { marginTop: 8 }]} multiline testID={`query-${q.id}-reply`} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <PrimaryButton label="Reply" variant="outline" onPress={() => act('reply')} loading={busy} style={{ paddingVertical: 8, minHeight: 38 }} />
                <PrimaryButton label="Answer (resolved)" variant="outline" onPress={() => act('answer')} loading={busy} style={{ paddingVertical: 8, minHeight: 38 }} testID={`query-${q.id}-answer`} />
                {canClose && <PrimaryButton label="Close" onPress={() => act('close')} loading={busy} style={{ paddingVertical: 8, minHeight: 38 }} testID={`query-${q.id}-close`} />}
              </View>
            </>
          ) : canReopen ? <PrimaryButton label="Reopen" variant="ghost" onPress={() => act('reopen')} loading={busy} style={{ marginTop: 6, alignSelf: 'flex-start', paddingVertical: 6, minHeight: 34 }} /> : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: RC.border, marginTop: 8 },
  title: { fontSize: 13, fontWeight: '700', color: RC.text, flexShrink: 1 },
  msg: { backgroundColor: '#F7F9FC', borderRadius: 8, padding: 8, marginTop: 6 },
  msgBy: { fontSize: 10, color: RC.sub, fontWeight: '700' },
  msgTxt: { fontSize: 13, color: RC.text, marginTop: 2, lineHeight: 18 },
});
