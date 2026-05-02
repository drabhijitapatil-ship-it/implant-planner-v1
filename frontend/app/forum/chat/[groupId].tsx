import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../../contexts/AuthContext';
import api, { getToken } from '../../../utils/api';
import { BACKEND_URL } from '../../../utils/config';
import { safeDocumentPick, safeLaunchCamera, safeLaunchLibrary } from '../../../utils/safePicker';
import { showUploadPicker } from '../../../utils/uploadPicker';
import BackButton from '../../../components/BackButton';

interface Message {
  id: string; author_id: string; author_name: string; author_role: string;
  body: string; attachments: any[]; created_at: string; deleted_at?: string;
  reactions_summary: Record<string, number>; reactions_mine: Record<string, boolean>;
  system?: boolean;
}
interface Group { id: string; name: string; kind: string; description?: string; members: string[]; admins: string[]; is_admin?: boolean; locked?: boolean; member_details?: any[]; typing_users?: { user_id: string; name: string }[]; }

const REACTIONS = [{ k: 'thumbs', i: '👍' }, { k: 'heart', i: '❤️' }, { k: 'think', i: '🤔' }, { k: 'check', i: '✅' }];

async function signedUrl(url: string) { const t = await getToken('access_token'); return `${BACKEND_URL}${url}${t ? `?token=${t}` : ''}`; }

export default function ChatRoomScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const pickingInProgressRef = useRef(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView | null>(null);
  const prevCountRef = useRef(0);
  const lastTypingSentRef = useRef<number>(0);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const [g, m] = await Promise.all([api.get(`/chat/groups/${groupId}`), api.get(`/chat/groups/${groupId}/messages`, { params: { limit: 100 } })]);
      setGroup(g.data);
      setMessages(m.data?.items || []);
    } catch (e: any) {
      console.error('[chat] load failed', e);
    } finally { setLoading(false); }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]));

  // Mark this group as read on mount + whenever messages change — clears the
  // unread badge on the group list next time it re-fetches.
  useEffect(() => {
    if (!groupId || loading) return;
    api.post(`/chat/groups/${groupId}/mark-read`).catch(() => {});
  }, [groupId, loading, messages.length]);

  // Debounced typing ping: fires at most every 3 s while user has non-empty
  // composer text. The server entry auto-expires after 5 s so it naturally
  // clears when the user stops typing.
  const onComposerChange = (text: string) => {
    setComposer(text);
    if (!groupId || !text.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    api.post(`/chat/groups/${groupId}/typing`).catch(() => {});
  };

  useEffect(() => {
    if (messages.length > prevCountRef.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    prevCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    (async () => {
      const urls: Record<string, string> = {};
      for (const m of messages) for (const a of m.attachments || []) if (!urls[a.url]) urls[a.url] = await signedUrl(a.url);
      setPreviewUrls(urls);
    })();
  }, [messages]);

  const compressImg = async (uri: string) => {
    try { const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }); return r.uri; } catch { return uri; }
  };

  const upload = async (uri: string, name: string, mime: string, size?: number) => {
    if ((size || 0) > 10 * 1024 * 1024) { Alert.alert('Too large', 'Max 10 MB.'); return; }
    const form = new FormData();
    if (Platform.OS === 'web') { const blob = await fetch(uri).then(r => r.blob()); form.append('file', blob, name); }
    else form.append('file', { uri, name, type: mime } as any);
    const up = await api.post('/chat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    setAttachments(prev => [...prev, up.data]);
  };

  const pickAttachment = async () => {
    if (pickingInProgressRef.current) return;
    pickingInProgressRef.current = true;
    try {
      const picked = await showUploadPicker(['application/pdf', 'image/*']);
      if (!picked) return;
      setAttaching(true);
      const isImg = (picked.type || '').startsWith('image/');
      const uri = isImg ? await compressImg(picked.uri) : picked.uri;
      await upload(uri, picked.name, isImg ? 'image/jpeg' : (picked.type || 'application/octet-stream'));
    } catch (e: any) {
      console.error('[chat] attach upload failed:', e);
      Alert.alert('Attach failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setAttaching(false);
      pickingInProgressRef.current = false;
    }
  };

  const send = async () => {
    const body = composer.trim();
    if (!body && attachments.length === 0) return;
    setSending(true);
    try {
      await api.post(`/chat/groups/${groupId}/messages`, { body: body || ' ', attachments });
      setComposer(''); setAttachments([]); await load();
    } catch (e: any) { Alert.alert('Send failed', e?.response?.data?.detail || e?.message); } finally { setSending(false); }
  };

  const toggleReaction = async (mid: string, reaction: string) => {
    try {
      const r = await api.post(`/chat/messages/${mid}/reactions`, { reaction });
      setMessages(prev => prev.map(m => m.id === mid ? { ...m, reactions_summary: r.data.reactions_summary, reactions_mine: r.data.reactions_mine } : m));
    } catch {}
  };

  const leaveGroup = () => {
    if (group?.locked) { Alert.alert('Cannot leave', 'You cannot leave this group.'); return; }
    Alert.alert('Leave group?', 'You will need to be re-added to return.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await api.delete(`/chat/groups/${groupId}/members/${user?.id}`); router.back(); }
        catch (e: any) { Alert.alert('Failed', e?.response?.data?.detail); }
      }},
    ]);
  };

  if (loading) return <SafeAreaView style={s.screen}><ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 40 }} /></SafeAreaView>;
  if (!group) return <SafeAreaView style={s.screen}><View style={s.empty}><Text>Group not found</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.header}>
          <BackButton />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.headerName} numberOfLines={1}>{group.name}</Text>
            <Text style={s.headerSub}>{(group.members || []).length} members{group.locked ? ' • locked' : ''}</Text>
          </View>
          {!group.locked && (
            <TouchableOpacity onPress={leaveGroup} hitSlop={{top:12,bottom:12,left:12,right:12}} testID="leave-group-btn" accessibilityLabel="leave-group-btn" /* @ts-ignore */ data-testid="leave-group-btn">
              <Ionicons name="exit-outline" size={22} color="#C62828" />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.phiBanner}>
          <Ionicons name="shield-checkmark" size={14} color="#2E7D32" />
          <Text style={s.phiTxt}>Do not share patient PII. Use initials only for HIPAA compliance.</Text>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
          {messages.length === 0 ? <Text style={s.noMsg}>No messages yet. Say hi 👋</Text> :
            messages.map(m => {
              if (m.system) return <Text key={m.id} style={s.systemMsg}>{m.body}</Text>;
              const mine = m.author_id === user?.id;
              return (
                <View key={m.id} style={[s.msgRow, mine && { alignItems: 'flex-end' }]}>
                  {!mine && <Text style={s.msgAuthor}>{m.author_name}</Text>}
                  <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                    <Text style={[s.msgBody, mine && { color: '#FFF' }, m.deleted_at && s.deleted]}>{m.body}</Text>
                    {(m.attachments || []).map((a, i) => (
                      <View key={i} style={{ marginTop: 6 }}>
                        {a.type === 'image' ? (
                          <Image source={{ uri: previewUrls[a.url] || '' }} style={s.attachImg} resizeMode="cover" />
                        ) : (
                          <TouchableOpacity style={s.pdfChip} onPress={() => Platform.OS === 'web' && previewUrls[a.url] && window.open(previewUrls[a.url], '_blank')}>
                            <Ionicons name="document" size={18} color="#C62828" />
                            <Text style={s.pdfChipTxt} numberOfLines={1}>{a.filename}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                    <Text style={[s.msgTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <View style={s.rxRow}>
                    {REACTIONS.map(r => {
                      const c = m.reactions_summary[r.k] || 0;
                      const mineR = !!m.reactions_mine[r.k];
                      return (
                        <TouchableOpacity key={r.k} onPress={() => toggleReaction(m.id, r.k)} style={[s.rxChip, mineR && s.rxChipOn]}>
                          <Text style={{ fontSize: 13 }}>{r.i}</Text>
                          {c > 0 && <Text style={[s.rxCount, mineR && { color: '#1565C0' }]}>{c}</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          }
        </ScrollView>

        <View style={s.composer}>
          {(group.typing_users || []).length > 0 && (
            <View style={s.typingRow} testID="chat-typing-indicator" /* @ts-ignore */ data-testid="chat-typing-indicator">
              <View style={s.typingDots}>
                <View style={[s.typingDot, { opacity: 0.4 }]} />
                <View style={[s.typingDot, { opacity: 0.7 }]} />
                <View style={s.typingDot} />
              </View>
              <Text style={s.typingTxt} numberOfLines={1}>
                {(group.typing_users || []).length === 1
                  ? `${(group.typing_users || [])[0].name} is typing…`
                  : `${(group.typing_users || []).length} people are typing…`}
              </Text>
            </View>
          )}
          {(attachments.length > 0 || attaching) && (
            <View style={s.attRow}>
              {attachments.map((a, i) => (
                <View key={i} style={s.attChip}>
                  <Ionicons name={a.type === 'pdf' ? 'document' : 'image'} size={12} color="#1565C0" />
                  <Text style={s.attChipTxt} numberOfLines={1}>{a.filename}</Text>
                  <TouchableOpacity onPress={() => setAttachments(p => p.filter((_, ii) => ii !== i))}><Ionicons name="close" size={14} color="#90A4AE" /></TouchableOpacity>
                </View>
              ))}
              {attaching && <View style={[s.attChip, { backgroundColor: '#FFF8E1' }]}><ActivityIndicator size="small" color="#FF8F00" /><Text style={[s.attChipTxt, { color: '#E65100' }]}>Attaching…</Text></View>}
            </View>
          )}
          <View style={s.composerRow}>
            <TouchableOpacity onPress={pickAttachment} disabled={attaching} style={[s.iconBtn, attaching && { opacity: 0.4 }]} testID="chat-attach-btn" accessibilityLabel="chat-attach-btn" /* @ts-ignore */ data-testid="chat-attach-btn"><Ionicons name="attach" size={24} color="#1565C0" /></TouchableOpacity>
            <TextInput style={s.input} placeholder="Type a message..." value={composer} onChangeText={onComposerChange} multiline testID="chat-input" accessibilityLabel="chat-input" /* @ts-ignore */ data-testid="chat-input" />
            <TouchableOpacity onPress={send} disabled={sending || (!composer.trim() && attachments.length === 0)} style={[s.sendBtn, (sending || (!composer.trim() && attachments.length === 0)) && { opacity: 0.4 }]} testID="chat-send-btn" accessibilityLabel="chat-send-btn" /* @ts-ignore */ data-testid="chat-send-btn">
              {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Attach picker is now provided globally by <AttachPickerModalRoot />
          in app/_layout.tsx. pickAttachment() above awaits showUploadPicker()
          and processes the returned file directly. */}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerName: { fontSize: 16, fontWeight: '700', color: '#37474F' },
  headerSub: { fontSize: 11, color: '#78909C' },
  phiBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6 },
  phiTxt: { fontSize: 11, color: '#2E7D32', flex: 1 },
  noMsg: { textAlign: 'center', color: '#90A4AE', marginTop: 40 },
  systemMsg: { textAlign: 'center', fontSize: 11, color: '#90A4AE', fontStyle: 'italic', marginVertical: 6 },
  msgRow: { marginBottom: 8, alignItems: 'flex-start' },
  msgAuthor: { fontSize: 11, color: '#78909C', marginBottom: 2, marginLeft: 6 },
  bubble: { padding: 10, borderRadius: 12, maxWidth: '80%' },
  bubbleMine: { backgroundColor: '#1565C0', borderBottomRightRadius: 2 },
  bubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#ECEFF1' },
  msgBody: { fontSize: 14, color: '#37474F', lineHeight: 19 },
  deleted: { fontStyle: 'italic', color: '#90A4AE' },
  msgTime: { fontSize: 10, color: '#90A4AE', marginTop: 4 },
  attachImg: { width: 200, height: 160, borderRadius: 8, backgroundColor: '#ECEFF1' },
  pdfChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  pdfChipTxt: { fontSize: 11, color: '#C62828', fontWeight: '600', maxWidth: 160 },
  rxRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  rxChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#F5F5F5' },
  rxChipOn: { backgroundColor: '#E3F2FD' },
  rxCount: { fontSize: 10, color: '#546E7A' },
  composer: { backgroundColor: '#FFF', padding: 8, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 4 },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#1565C0' },
  typingTxt: { fontSize: 12, color: '#546E7A', fontStyle: 'italic', flex: 1 },
  attRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  attChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  attChipTxt: { fontSize: 11, color: '#1565C0', maxWidth: 120 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  iconBtn: { padding: 6 },
  input: { flex: 1, maxHeight: 100, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F5F7FA', borderRadius: 18, fontSize: 14, color: '#37474F', outlineWidth: 0 as any },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: '#78909C', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, paddingHorizontal: 4 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  sheetOptionTxt: { fontSize: 16, color: '#37474F', fontWeight: '500' },
  sheetCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  sheetCancelTxt: { fontSize: 15, color: '#78909C', fontWeight: '600' },
});
